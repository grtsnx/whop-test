import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const startPort = Number(process.env.PORT, 10) || 3847;
const maxPortAttempts = 40;
/** Set once the server is listening (used by /api/server-info fallback). */
let boundPort = startPort;

const API_BASE = {
	production: "https://api.whop.com/api/v1",
	sandbox: "https://sandbox-api.whop.com/api/v1",
};

const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
};

function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (c) => chunks.push(c));
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}

function sendJson(res, status, obj) {
	res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(obj));
}

/** Optional methods beyond `card` (Whop identifiers). */
const OPTIONAL_PAYMENT_METHODS = new Set([
	"apple_pay",
	"google_pay",
	"paypal",
	"crypto",
	"cashapp",
	"us_bank_transfer",
]);

function buildPlanPaymentMethodConfiguration(environment, requested) {
	const list = Array.isArray(requested) ? requested : [];
	const extras = list.filter((m) => typeof m === "string" && OPTIONAL_PAYMENT_METHODS.has(m));
	const enabled = ["card", ...new Set(extras)];
	if (environment === "sandbox") {
		return { enabled: ["card"], sandboxCardOnly: true };
	}
	return { enabled, sandboxCardOnly: false };
}

function requireHttpsRedirectUrl(url) {
	if (url == null || typeof url !== "string") {
		return { ok: false, message: "Return URL is required and must start with https://" };
	}
	const t = url.trim();
	if (!t.startsWith("https://")) {
		return { ok: false, message: "Return URL must be a valid URL starting with https://" };
	}
	try {
		const u = new URL(t);
		if (u.protocol !== "https:") {
			return { ok: false, message: "Return URL must use the https:// scheme." };
		}
		return { ok: true, url: u.toString() };
	} catch {
		return { ok: false, message: "Return URL must be a valid URL starting with https://" };
	}
}

function serveStatic(res, urlPath) {
	const rel = (urlPath.replace(/^\//, "") || "index.html").split("/").filter((p) => p && p !== "..").join("/");
	const filePath = path.resolve(__dirname, rel);
	if (!filePath.startsWith(path.resolve(__dirname))) {
		sendJson(res, 403, { error: "Forbidden" });
		return;
	}
	fs.readFile(filePath, (err, data) => {
		if (err) {
			res.writeHead(404);
			res.end("Not found");
			return;
		}
		const ext = path.extname(filePath);
		res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
		res.end(data);
	});
}

async function createCheckoutConfiguration(body) {
	const {
		environment = "production",
		apiKey,
		companyId,
		productId,
		amount,
		currency = "usd",
		planType = "one_time",
		billingPeriodDays = 30,
		renewalPrice,
		returnUrl,
		paymentMethods,
		checkoutTitle,
	} = body;

	if (!apiKey || typeof apiKey !== "string") {
		return { ok: false, status: 400, message: "API key is required." };
	}
	if (!companyId || !companyId.startsWith("biz_")) {
		return { ok: false, status: 400, message: "Company ID must look like biz_…" };
	}
	if (!productId || !productId.startsWith("prod_")) {
		return { ok: false, status: 400, message: "Product ID must look like prod_…" };
	}
	const initial = Number(amount);
	if (!Number.isFinite(initial) || initial <= 0) {
		return { ok: false, status: 400, message: "Amount must be a positive number." };
	}
	const base = API_BASE[environment];
	if (!base) {
		return { ok: false, status: 400, message: "Environment must be production or sandbox." };
	}

	const redirect = requireHttpsRedirectUrl(returnUrl);
	if (!redirect.ok) {
		return { ok: false, status: 400, message: redirect.message };
	}

	const titleRaw = typeof checkoutTitle === "string" ? checkoutTitle.trim() : "";
	const planTitle = titleRaw.length > 0 ? titleRaw.slice(0, 120) : "Make payment";

	const plan = {
		company_id: companyId,
		currency,
		product_id: productId,
		plan_type: planType,
		title: planTitle,
	};
	const pm = buildPlanPaymentMethodConfiguration(environment, paymentMethods);
	plan.payment_method_configuration = {
		include_platform_defaults: false,
		enabled: pm.enabled,
		disabled: [],
	};
	if (planType === "one_time") {
		plan.initial_price = initial;
	} else if (planType === "renewal") {
		const renew = renewalPrice != null ? Number(renewalPrice) : initial;
		if (!Number.isFinite(renew) || renew <= 0) {
			return { ok: false, status: 400, message: "Recurring amount must be a positive number." };
		}
		plan.initial_price = initial;
		plan.renewal_price = renew;
		plan.billing_period = Math.max(1, Math.floor(Number(billingPeriodDays) || 30));
	} else {
		return { ok: false, status: 400, message: "Plan type must be one_time or renewal." };
	}

	const payload = {
		mode: "payment",
		plan,
		redirect_url: redirect.url,
	};

	let whopRes;
	try {
		whopRes = await fetch(`${base}/checkout_configurations`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});
	} catch (err) {
		return {
			ok: false,
			status: 502,
			message: `Could not reach Whop API: ${err?.message || String(err)}`,
		};
	}

	const text = await whopRes.text();
	let json;
	try {
		json = text ? JSON.parse(text) : {};
	} catch {
		return {
			ok: false,
			status: whopRes.status || 502,
			message: text.slice(0, 500) || "Invalid JSON from Whop API",
		};
	}

	if (!whopRes.ok) {
		const msg =
			json?.error?.message ||
			json?.message ||
			(typeof json?.error === "string" ? json.error : null) ||
			text.slice(0, 500) ||
			`Whop API error (${whopRes.status})`;
		return { ok: false, status: whopRes.status, message: msg, details: json };
	}

	const sessionId = json.id;
	const planId = json.plan?.id;
	if (!sessionId || !planId) {
		return {
			ok: false,
			status: 502,
			message: "Whop response missing id or plan.id",
			details: json,
		};
	}

	return { ok: true, sessionId, planId, raw: json, sandboxCardOnly: pm.sandboxCardOnly };
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

	if (req.method === "OPTIONS") {
		res.writeHead(204, {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		});
		res.end();
		return;
	}

	if (req.method === "POST" && url.pathname === "/webhook") {
		const raw = await readBody(req);
		console.log("\n--- Whop webhook (dev receiver) ---");
		console.log(new Date().toISOString());
		try {
			console.log(JSON.stringify(JSON.parse(raw), null, 2));
		} catch {
			console.log(raw.slice(0, 8000));
		}
		console.log("--- end ---\n");
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end("{}");
		return;
	}

	if (req.method === "GET" && url.pathname === "/api/server-info") {
		const proto = req.headers["x-forwarded-proto"] || "http";
		const host = req.headers.host || `localhost:${boundPort}`;
		sendJson(res, 200, {
			webhookListenerUrl: `${proto}://${host}/webhook`,
			port: boundPort,
		});
		return;
	}

	if (req.method === "POST" && url.pathname === "/api/checkout-configuration") {
		res.setHeader("Access-Control-Allow-Origin", "*");
		let body;
		try {
			body = JSON.parse(await readBody(req));
		} catch {
			sendJson(res, 400, { error: "Invalid JSON body" });
			return;
		}
		const result = await createCheckoutConfiguration(body);
		if (!result.ok) {
			sendJson(res, result.status >= 400 && result.status < 600 ? result.status : 500, {
				error: result.message,
				details: result.details,
			});
			return;
		}
		sendJson(res, 200, {
			sessionId: result.sessionId,
			planId: result.planId,
			sandboxCardOnly: result.sandboxCardOnly === true,
		});
		return;
	}

	if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
		serveStatic(res, "/index.html");
		return;
	}
	if (req.method === "GET" && url.pathname === "/app.js") {
		serveStatic(res, "/app.js");
		return;
	}

	res.writeHead(404);
	res.end("Not found");
});

function onListening() {
	boundPort = server.address()?.port ?? boundPort;
	console.log(`Whop embed playground: http://localhost:${boundPort}`);
	console.log(`Dev webhook receiver:  http://localhost:${boundPort}/webhook`);
}

let tryPort = startPort;

server.on("error", (err) => {
	if (err.code !== "EADDRINUSE") {
		console.error(err);
		process.exit(1);
	}
	if (tryPort >= startPort + maxPortAttempts) {
		console.error(
			`No free port between ${startPort} and ${startPort + maxPortAttempts - 1}. Stop the other process or set PORT=… (e.g. PORT=4000 npm start).`,
		);
		process.exit(1);
	}
	console.warn(`Port ${tryPort} is in use, trying ${tryPort + 1}…`);
	tryPort += 1;
	server.listen(tryPort, onListening);
});

server.listen(tryPort, onListening);

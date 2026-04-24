const STORAGE_KEY = "whop_embed_playground_v1";

function $(id) {
	return document.getElementById(id);
}

function loadSaved() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

function getSelectedPaymentMethods() {
	const methods = ["card"];
	document.querySelectorAll('input[name="pm"]:checked:not(:disabled)').forEach((el) => {
		if (el.value && el.value !== "card") methods.push(el.value);
	});
	return [...new Set(methods)];
}

function saveForm() {
	const data = {
		environment: $("environment").value,
		companyId: $("companyId").value.trim(),
		productId: $("productId").value.trim(),
		returnUrl: $("returnUrl").value.trim(),
		buyerEmail: $("buyerEmail").value.trim(),
		checkoutTitle: $("checkoutTitle").value.trim(),
		paymentMethods: getSelectedPaymentMethods(),
		currency: $("currency").value,
		planType: $("planType").value,
		billingPeriodDays: $("billingPeriodDays").value,
		renewalPrice: $("renewalPrice").value,
		webhookUrl: $("webhookUrl").value.trim(),
	};
	localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function applySaved(saved) {
	if (saved.environment) $("environment").value = saved.environment;
	if (saved.companyId) $("companyId").value = saved.companyId;
	if (saved.productId) $("productId").value = saved.productId;
	if (saved.currency) $("currency").value = saved.currency;
	if (saved.planType) $("planType").value = saved.planType;
	if (saved.billingPeriodDays) $("billingPeriodDays").value = saved.billingPeriodDays;
	if (saved.renewalPrice != null) $("renewalPrice").value = saved.renewalPrice;
	if (saved.webhookUrl) $("webhookUrl").value = saved.webhookUrl;
	if (saved.returnUrl) $("returnUrl").value = saved.returnUrl;
	if (saved.buyerEmail) $("buyerEmail").value = saved.buyerEmail;
	if (saved.checkoutTitle) $("checkoutTitle").value = saved.checkoutTitle;
	if (Array.isArray(saved.paymentMethods)) {
		const set = new Set(saved.paymentMethods);
		document.querySelectorAll('input[name="pm"]:not(:disabled)').forEach((el) => {
			el.checked = set.has(el.value);
		});
	}
}

/** Whop requires redirect URLs to use https. */
function normalizeHttpsReturnUrl(raw) {
	const s = (raw || "").trim();
	if (!s.startsWith("https://")) {
		return { ok: false, message: "Return URL must be a valid URL starting with https://" };
	}
	try {
		const u = new URL(s);
		if (u.protocol !== "https:") {
			return { ok: false, message: "Return URL must use the https:// scheme." };
		}
		return { ok: true, url: u.toString() };
	} catch {
		return { ok: false, message: "Return URL must be a valid URL starting with https://" };
	}
}

function normalizePrefillEmail(raw) {
	const s = (raw || "").trim();
	if (!s || !s.includes("@")) return "";
	return s.slice(0, 320);
}

function checkoutAccentFromTheme() {
	const v = getComputedStyle(document.documentElement).getPropertyValue("--whop-accent").trim();
	if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
	return "#2563eb";
}

function toggleRenewalFields() {
	const isRenewal = $("planType").value === "renewal";
	$("renewalFields").hidden = !isRenewal;
}

function setStatus(msg, kind) {
	const el = $("status");
	el.textContent = msg;
	el.dataset.kind = kind || "";
}

function removeWhopLoader() {
	document.querySelectorAll("script[data-whop-loader]").forEach((n) => n.remove());
}

function resetCheckoutMount() {
	const old = $("whop-checkout");
	const next = document.createElement("div");
	next.id = "whop-checkout";
	old.parentNode.replaceChild(next, old);
	return next;
}

function mountWhopEmbed({ planId, sessionId, environment, returnUrl, buyerEmail, checkoutAccent }) {
	removeWhopLoader();
	const el = resetCheckoutMount();
	el.setAttribute("data-whop-checkout-plan-id", planId);
	el.setAttribute("data-whop-checkout-session", sessionId);
	el.setAttribute("data-whop-checkout-return-url", returnUrl);
	el.setAttribute("data-whop-checkout-environment", environment);
	el.setAttribute("data-whop-checkout-theme", "light");
	if (checkoutAccent) {
		el.setAttribute("data-whop-checkout-theme-accent-color", checkoutAccent);
	}
	const email = normalizePrefillEmail(buyerEmail);
	if (email) {
		el.setAttribute("data-whop-checkout-prefill-email", email);
	}

	const s = document.createElement("script");
	s.src = "https://js.whop.com/static/checkout/loader.js";
	s.async = true;
	s.defer = true;
	s.dataset.whopLoader = "1";
	document.head.appendChild(s);
}

async function fetchServerInfo() {
	try {
		const r = await fetch("/api/server-info");
		if (!r.ok) return;
		const j = await r.json();
		if (j.webhookListenerUrl) {
			$("devWebhookUrl").textContent = j.webhookListenerUrl;
		}
	} catch {
		/* ignore */
	}
}

async function onSubmit(e) {
	e.preventDefault();
	saveForm();

	const environment = $("environment").value;
	const apiKey = $("apiKey").value.trim();
	const companyId = $("companyId").value.trim();
	const productId = $("productId").value.trim();
	const amount = $("amount").value;
	const currency = $("currency").value;
	const planType = $("planType").value;
	const billingPeriodDays = $("billingPeriodDays").value;
	const renewalPrice = $("renewalPrice").value;
	const buyerEmail = $("buyerEmail").value;
	const checkoutTitle = $("checkoutTitle").value;
	const paymentMethods = getSelectedPaymentMethods();
	const returnCheck = normalizeHttpsReturnUrl($("returnUrl").value);
	if (!returnCheck.ok) {
		setStatus(returnCheck.message, "error");
		return;
	}
	const returnUrl = returnCheck.url;

	setStatus("Creating checkout configuration…", "info");

	const body = {
		environment,
		apiKey,
		companyId,
		productId,
		amount: Number(amount),
		currency,
		planType,
		returnUrl,
		paymentMethods,
		checkoutTitle,
	};
	if (planType === "renewal") {
		body.billingPeriodDays = Number(billingPeriodDays);
		body.renewalPrice = renewalPrice === "" ? undefined : Number(renewalPrice);
	}

	let res;
	try {
		res = await fetch("/api/checkout-configuration", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	} catch (err) {
		setStatus(`Request failed: ${err.message}`, "error");
		return;
	}

	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		setStatus(data.error || `Error ${res.status}`, "error");
		return;
	}

	const checkoutAccent = checkoutAccentFromTheme();
	mountWhopEmbed({
		planId: data.planId,
		sessionId: data.sessionId,
		environment,
		returnUrl,
		buyerEmail,
		checkoutAccent,
	});
	let msg =
		"Checkout embed mounted (light theme). Complete a test payment in sandbox with card 4242… per Whop docs.";
	if (data.sandboxCardOnly) {
		msg +=
			"\n\nSandbox mode: Whop only supports card here — extra payment methods were not sent to the API.";
	}
	setStatus(msg, "ok");
}

function init() {
	const saved = loadSaved();
	applySaved(saved);
	if (!$("returnUrl").value.trim() && window.location.protocol === "https:") {
		$("returnUrl").value = `${window.location.origin}${window.location.pathname}?checkout=complete`;
		saveForm();
	}
	toggleRenewalFields();

	$("planType").addEventListener("change", () => {
		toggleRenewalFields();
		saveForm();
	});
	for (const id of [
		"environment",
		"companyId",
		"productId",
		"returnUrl",
		"buyerEmail",
		"checkoutTitle",
		"currency",
		"billingPeriodDays",
		"renewalPrice",
		"webhookUrl",
	]) {
		$(id).addEventListener("change", saveForm);
		$(id).addEventListener("input", saveForm);
	}
	document.querySelectorAll('input[name="pm"]').forEach((el) => {
		el.addEventListener("change", saveForm);
	});
	$("amount").addEventListener("input", saveForm);
	$("apiKey").addEventListener("input", () => {
		/* never persist api key */
	});

	$("form").addEventListener("submit", onSubmit);
	fetchServerInfo();

	const params = new URLSearchParams(window.location.search);
	if (params.get("checkout") === "complete") {
		const st = params.get("status");
		setStatus(
			st === "success"
				? "Checkout returned with status=success. Confirm payment via Whop webhooks or dashboard."
				: st === "error"
					? "Checkout returned with status=error."
					: "Returned from checkout redirect.",
			st === "success" ? "ok" : st === "error" ? "error" : "info",
		);
	}
}

document.addEventListener("DOMContentLoaded", init);

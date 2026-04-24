const STORAGE_KEY = "whop_embed_playground_v1";

/** Increment to cancel in-flight wco polling when remounting checkout. */
let wcoHookGeneration = 0;

function $(id) {
	return document.getElementById(id);
}

function trimStr(s) {
	return (s == null ? "" : String(s)).trim();
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

function readBillingFromForm() {
	const countryRaw = trimStr($("billingCountry").value);
	return {
		name: trimStr($("billingName").value),
		line1: trimStr($("billingLine1").value),
		line2: trimStr($("billingLine2").value),
		city: trimStr($("billingCity").value),
		state: trimStr($("billingState").value),
		postal: trimStr($("billingPostal").value),
		country: countryRaw ? countryRaw.toUpperCase().slice(0, 2) : "",
	};
}

function billingForSetAddress(b) {
	if (!b.name || !b.line1 || !b.city || !b.state || !b.postal || !b.country) return null;
	return {
		name: b.name,
		country: b.country,
		line1: b.line1,
		line2: b.line2 || undefined,
		city: b.city,
		state: b.state,
		postalCode: b.postal,
	};
}

function saveForm() {
	const billing = readBillingFromForm();
	const data = {
		environment: $("environment").value,
		companyId: $("companyId").value.trim(),
		productId: $("productId").value.trim(),
		returnUrl: $("returnUrl").value.trim(),
		buyerEmail: $("buyerEmail").value.trim(),
		checkoutTitle: $("checkoutTitle").value.trim(),
		billingName: billing.name,
		billingLine1: billing.line1,
		billingLine2: billing.line2,
		billingCity: billing.city,
		billingState: billing.state,
		billingPostal: billing.postal,
		billingCountry: billing.country,
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
	if (saved.billingName != null) $("billingName").value = saved.billingName;
	if (saved.billingLine1 != null) $("billingLine1").value = saved.billingLine1;
	if (saved.billingLine2 != null) $("billingLine2").value = saved.billingLine2;
	if (saved.billingCity != null) $("billingCity").value = saved.billingCity;
	if (saved.billingState != null) $("billingState").value = saved.billingState;
	if (saved.billingPostal != null) $("billingPostal").value = saved.billingPostal;
	if (saved.billingCountry != null) $("billingCountry").value = saved.billingCountry;
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

function applyBillingPrefillAttributes(el, billing, emailNorm) {
	const b = billing;
	if (emailNorm) {
		el.setAttribute("data-whop-checkout-prefill-email", emailNorm);
		el.setAttribute("data-whop-checkout-hide-email", "true");
	}
	if (b.name) {
		el.setAttribute("data-whop-checkout-prefill-name", b.name);
	}
	if (b.line1) {
		el.setAttribute("data-whop-checkout-prefill-address-line1", b.line1);
	}
	if (b.line2) {
		el.setAttribute("data-whop-checkout-prefill-address-line2", b.line2);
	}
	if (b.city) {
		el.setAttribute("data-whop-checkout-prefill-address-city", b.city);
	}
	if (b.state) {
		el.setAttribute("data-whop-checkout-prefill-address-state", b.state);
	}
	if (b.postal) {
		el.setAttribute("data-whop-checkout-prefill-address-postal-code", b.postal);
	}
	if (b.country) {
		el.setAttribute("data-whop-checkout-prefill-address-country", b.country);
	}
	const addrObj = billingForSetAddress(b);
	if (addrObj) {
		el.setAttribute("data-whop-checkout-hide-address", "true");
	}
}

function setPayButtonIdle(defaultLabel) {
	const btn = $("externalPayBtn");
	const labelEl = $("externalPayBtnLabel");
	const spin = $("externalPayBtnSpinner");
	const t = trimStr(defaultLabel) || "Make payment";
	if (labelEl) labelEl.textContent = t;
	btn.dataset.defaultPayLabel = t;
	if (spin) spin.hidden = true;
	btn.setAttribute("aria-busy", "false");
}

function showExternalPayButton(label) {
	const wrap = $("payButtonWrap");
	const btn = $("externalPayBtn");
	wrap.hidden = false;
	setPayButtonIdle(label);
	btn.disabled = true;
}

function showPaymentProgressOverlay() {
	const el = $("paymentProgressOverlay");
	if (!el) return;
	el.hidden = false;
	el.setAttribute("aria-hidden", "false");
}

function hidePaymentProgressOverlay() {
	const el = $("paymentProgressOverlay");
	if (!el) return;
	el.hidden = true;
	el.setAttribute("aria-hidden", "true");
}

function hideExternalPayButton() {
	const wrap = $("payButtonWrap");
	wrap.hidden = true;
	wrap.setAttribute("aria-busy", "false");
	const btn = $("externalPayBtn");
	btn.disabled = true;
	const spin = $("externalPayBtnSpinner");
	if (spin) spin.hidden = true;
	hidePaymentProgressOverlay();
}

function finishPayBlockReady(gen) {
	if (gen !== wcoHookGeneration) return;
	const wrap = $("payButtonWrap");
	if (wrap.hidden) return;
	$("externalPayBtn").disabled = false;
}

function scheduleWcoHooks(emailNorm, addressForApi) {
	const gen = ++wcoHookGeneration;
	let tries = 0;
	const max = 45;
	const tick = async () => {
		if (gen !== wcoHookGeneration) return;
		tries += 1;
		const w = typeof window !== "undefined" ? window.wco : null;
		if (!w || typeof w.setEmail !== "function") {
			if (tries >= max) finishPayBlockReady(gen);
			else setTimeout(tick, 120);
			return;
		}
		try {
			if (emailNorm) {
				await w.setEmail("whop-embedded-checkout", emailNorm);
			}
			if (addressForApi) {
				await w.setAddress("whop-embedded-checkout", addressForApi);
			}
			finishPayBlockReady(gen);
		} catch {
			if (tries >= max) {
				finishPayBlockReady(gen);
				return;
			}
			setTimeout(tick, 120);
		}
	};
	setTimeout(tick, 200);
}

function resetPayButtonAfterError() {
	const btn = $("externalPayBtn");
	const labelEl = $("externalPayBtnLabel");
	const spin = $("externalPayBtnSpinner");
	const defaultLabel = btn.dataset.defaultPayLabel || "Make payment";
	if (labelEl) labelEl.textContent = defaultLabel;
	if (spin) spin.hidden = true;
	btn.disabled = false;
	btn.setAttribute("aria-busy", "false");
	hidePaymentProgressOverlay();
}

async function submitWhopCheckout() {
	const btn = $("externalPayBtn");
	const labelEl = $("externalPayBtnLabel");
	const spin = $("externalPayBtnSpinner");
	const defaultLabel = btn.dataset.defaultPayLabel || "Make payment";

	btn.disabled = true;
	btn.setAttribute("aria-busy", "true");
	if (spin) spin.hidden = false;
	if (labelEl) labelEl.textContent = "Processing payment…";
	showPaymentProgressOverlay();

	for (let i = 0; i < 45; i++) {
		try {
			window.wco.submit("whop-embedded-checkout");
			return;
		} catch (e) {
			const msg = String(e?.message || e);
			if (msg.includes("not initialized")) {
				await new Promise((r) => setTimeout(r, 100));
				continue;
			}
			setStatus(msg, "error");
			resetPayButtonAfterError();
			return;
		}
	}
	setStatus("Checkout is still loading. Wait a second and try again.", "error");
	resetPayButtonAfterError();
}

function mountWhopEmbed({ planId, sessionId, environment, returnUrl, buyerEmail, checkoutAccent, billing, payButtonLabel }) {
	removeWhopLoader();
	hideExternalPayButton();
	const el = resetCheckoutMount();
	el.id = "whop-embedded-checkout";
	el.setAttribute("data-whop-checkout-plan-id", planId);
	el.setAttribute("data-whop-checkout-session", sessionId);
	el.setAttribute("data-whop-checkout-return-url", returnUrl);
	el.setAttribute("data-whop-checkout-environment", environment);
	el.setAttribute("data-whop-checkout-theme", "light");
	el.setAttribute("data-whop-checkout-hide-submit-button", "true");
	if (checkoutAccent) {
		el.setAttribute("data-whop-checkout-theme-accent-color", checkoutAccent);
	}
	const emailNorm = normalizePrefillEmail(buyerEmail);
	applyBillingPrefillAttributes(el, billing, emailNorm);

	const s = document.createElement("script");
	s.src = "https://js.whop.com/static/checkout/loader.js";
	s.async = true;
	s.defer = true;
	s.dataset.whopLoader = "1";
	document.head.appendChild(s);

	showExternalPayButton(payButtonLabel);
	const addrApi = billingForSetAddress(billing);
	scheduleWcoHooks(emailNorm || null, addrApi);

	$("externalPayBtn").onclick = () => {
		submitWhopCheckout();
	};
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
	const billing = readBillingFromForm();
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
	const payLabel = trimStr(checkoutTitle) || "Make payment";
	mountWhopEmbed({
		planId: data.planId,
		sessionId: data.sessionId,
		environment,
		returnUrl,
		buyerEmail,
		checkoutAccent,
		billing,
		payButtonLabel: payLabel,
	});
	let msg =
		"Checkout loaded: use the blue pay button (Whop’s iframe “Join” is hidden). Card-only in sandbox.";
	if (data.sandboxCardOnly) {
		msg += "\n\nSandbox: only card is available; other payment checkboxes are ignored by Whop.";
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
		"billingName",
		"billingLine1",
		"billingLine2",
		"billingCity",
		"billingState",
		"billingPostal",
		"billingCountry",
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

# How to use the Whop embed playground

This guide walks through the form and behavior end to end. Keep the dev server running while you work (`npm start`).

## 1. Start the server

```bash
npm start
```

In the terminal you should see something like:

- `Whop embed playground: http://localhost:3847`
- `Dev webhook receiver: http://localhost:3847/webhook`

If port `3847` is already in use, the server picks the next free port (up to a limit). Always use the URL it prints.

Open that URL in your browser. Opening `index.html` directly (`file://`) will break API calls and the embed loader.

### Optional: custom port

```bash
PORT=4000 npm start
```

---

## 2. Choose environment

- **Production:** live Whop data, [api.whop.com](https://api.whop.com/api/v1).
- **Sandbox:** test data, [sandbox-api.whop.com](https://sandbox-api.whop.com/api/v1) ([sandbox dashboard](https://sandbox.whop.com)).

Your API key, `biz_` company ID, and `prod_` product ID must all come from the **same** environment.

**Sandbox note:** Whop sandbox only supports **card** payments in the embed; other methods you tick are ignored there ([limitations](https://docs.whop.com/developer/guides/sandbox#known-limitations)).

---

## 3. Credentials and product

| Field | Where to get it |
|--------|------------------|
| **Company API key** | Dashboard → Developer / API (same environment as above). Never shared with `localStorage` in this app. |
| **Company ID** | `biz_…` (company / settings). |
| **Product ID** | `prod_…` for the product you are selling. |

---

## 4. Customer

- **Email:** If you fill this, the checkout **hides** the email field and uses your value (prefill + `wco.setEmail` after load).
- **Pay button text and plan title:** Used for the **blue pay button** under the form and sent to Whop as the **plan title**. The default iframe “Join” button is **hidden**; customers confirm with this external button instead ([Whop pattern](https://docs.whop.com/manage-your-business/payment-processing/embed-checkout#submit)).

---

## 5. Billing

Enter name and address fields as you want them on the checkout.

- Values are applied as **prefill** attributes on the embed.
- If **name, line 1, city, state, postal code, and country** are all filled, the **billing block inside the iframe is hidden** and the same data is pushed with **`wco.setAddress`** after the embed initializes.

**Country:** use a **two-letter** ISO code (for example `US`, `GB`).

---

## 6. Return URL (required)

Whop requires an **`https://`** URL (not `http://localhost`).

Examples:

- A **live** thank-you page: `https://yoursite.com/thank-you`
- An **HTTPS tunnel** to your machine (ngrok, Cloudflare Tunnel, etc.) pointing at this page or your real completion URL

The form validates this before calling the API. The same URL is set on the embed as `data-whop-checkout-return-url`.

---

## 7. Payment methods

- **Card** is always enabled and cannot be unchecked.
- Optional: Apple Pay, Google Pay, PayPal, crypto, US bank transfer, Cash App Pay.

The server sends a **plan-level** `payment_method_configuration` so methods you do **not** select are **disabled** against Whop’s full method list (with `include_platform_defaults: true`, which Whop’s API expects for `disabled` to apply). In **sandbox**, only **card** is sent.

---

## 8. Pricing

- **Amount** and **currency** for the first charge.
- **One-time** vs **subscription:** for subscriptions, set recurring amount and billing period (days).

The server creates an inline plan on the checkout configuration ([guide](https://docs.whop.com/developer/guides/accept-payments#step-1-create-a-checkout-configuration)).

---

## 9. Webhooks (reference only)

The **webhook URL** field is for your notes. You still register webhooks in the Whop dashboard ([sandbox](https://docs.whop.com/developer/guides/sandbox#api-keys--webhooks)).

For quick local inspection, the dev server logs bodies sent to:

`POST http://localhost:<port>/webhook`

(use your printed port). Point a tunnel at that URL if Whop must reach it from the internet.

---

## 10. Create the session and pay

1. Click **Create session and load embed**.
2. Read any **red status** message (validation, Whop API errors).
3. When the embed appears, wait until the **blue pay button** is enabled (the loader finishes initializing `window.wco`).
4. Click the **blue pay button** to call `wco.submit("whop-embedded-checkout")`.

**Sandbox test card:** see [Whop sandbox test cards](https://docs.whop.com/developer/guides/sandbox#test-cards) (for example `4242 4242 4242 4242`).

---

## 11. Saved settings

Most fields are saved in **`localStorage`** under `whop_embed_playground_v1` so they survive refresh. The **API key is never stored**.

---

## 12. Troubleshooting

| Issue | What to try |
|--------|-------------|
| `EADDRINUSE` | Another process uses the port; the server may auto-increment, or set `PORT=…`. |
| Return URL error | Must start with `https://`. |
| Wrong product / auth errors | Match sandbox vs production keys and IDs. |
| Pay button stays disabled | Wait a few seconds; if it persists, check the browser console and that the embed iframe loaded. |
| Extra payment methods in production | Confirm you are on latest code; restrictions are sent per Whop’s API. Product or company defaults can still interact with Whop’s rules—check the dashboard. |

---

## Further reading

- [README.md](./README.md) — overview and security
- [Whop: Accept payments](https://docs.whop.com/developer/guides/accept-payments)
- [Whop: Embed checkout](https://docs.whop.com/manage-your-business/payment-processing/embed-checkout)

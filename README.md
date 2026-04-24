# Whop embed playground

A small local demo for [Whop](https://whop.com) **embedded checkout**: it creates a [checkout configuration](https://docs.whop.com/developer/guides/accept-payments#step-1-create-a-checkout-configuration) on your machine (so your **API key never ships to the browser**), then mounts the official [checkout loader](https://docs.whop.com/manage-your-business/payment-processing/embed-checkout) with session and plan IDs.

Use it to try **dynamic amounts**, **payment method restrictions**, **prefilled customer and billing**, and a **custom pay button** (Whop’s default iframe CTA is hidden).

## Requirements

- [Node.js](https://nodejs.org/) 18+ (uses built-in `fetch` and ES modules)
- A Whop **company API key**, **company ID** (`biz_…`), and **product ID** (`prod_…`) from either [production](https://whop.com) or [sandbox](https://sandbox.whop.com)

## Quick start

```bash
cd whop
npm start
```

Open the URL printed in the terminal (default port `3847`; if it is busy, the server tries the next ports automatically). Do **not** open `index.html` via `file://`.

For detailed steps and field explanations, see **[how to use.md](./how%20to%20use.md)**.

## Project layout

| File | Purpose |
|------|---------|
| `server.mjs` | Serves `index.html` and `app.js`, proxies `POST /api/checkout-configuration` to Whop, optional `POST /webhook` logger for local tests |
| `index.html` | Form UI and embed mount point |
| `app.js` | Form logic, `localStorage` (except API key), embed attributes, `wco.submit` pay button |
| `package.json` | `npm start` → `node server.mjs` |

## Environment

- **Production API:** `https://api.whop.com/api/v1`
- **Sandbox API:** `https://sandbox-api.whop.com/api/v1` ([sandbox guide](https://docs.whop.com/developer/guides/sandbox))

Use matching keys and IDs for the mode you select in the form.

## Security

This app posts your company API key to **your own** dev server only. It is suitable for **local experimentation**. If you expose it on the internet without authentication, anyone could abuse your key. For real apps, create checkout configurations on a trusted backend and never send the company API key to untrusted clients.

## Documentation

- [Accept payments (embedded checkout)](https://docs.whop.com/developer/guides/accept-payments)
- [Embed checkout (HTML attributes)](https://docs.whop.com/manage-your-business/payment-processing/embed-checkout)
- [Create checkout configuration (API)](https://docs.whop.com/api-reference/checkout-configurations/create-checkout-configuration)

## License

Private / playground; use in line with [Whop’s developer terms](https://whop.com/tos-developer-api/).

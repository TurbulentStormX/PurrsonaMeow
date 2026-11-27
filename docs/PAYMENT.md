# Real PayNow payments (HitPay)

Without keys the pay page keeps its practice buttons (no money). With the three HitPay settings the guest pays with **PayNow** on HitPay's page.

## Settings
| Name | Value |
|---|---|
| `HITPAY_API_KEY` | HitPay dashboard > Developers > API Keys |
| `HITPAY_SALT` | same page (used to check that a message really came from HitPay) |
| `HITPAY_BASE_URL` | testing: `https://api.sandbox.hit-pay.com/v1`  (live: `https://api.hit-pay.com/v1`) |
| `PUBLIC_URL` | `https://purrsonameow.onrender.com` (optional; the server works it out if missing) |

Put them in `.env` on your computer and in Render > your service > Environment. Never commit `.env`.

## How it works
1. Guest presses **Pay**. The page calls `POST /api/pay/start`; the server checks the booking is theirs and still unpaid, asks HitPay for a PayNow payment and sends back HitPay's page.
2. The guest scans the QR on HitPay's page. HitPay calls `POST /api/pay/webhook`. The server checks the signature with the salt, checks the amount, and only then marks the booking **Paid** and sends the receipt email.
3. HitPay sends the guest back to `pay.html?code=...&back=1`. The page waits for "paid" (`GET /api/pay/status`). If the webhook was missed (Render asleep) the server asks HitPay itself.
4. A late-cancellation fee is paid the same way.

Only HitPay's signed message can mark a booking paid. While HitPay is switched on, the practice buttons (`payReservation`, `payCancellationFee`) are refused by the server.

## Set up the webhook in HitPay
HitPay sends the webhook address with every payment, so you normally need nothing more. If you want a backup: Developers > Webhook Endpoints > add `https://purrsonameow.onrender.com/api/pay/webhook`.

## Testing in the sandbox
Use the sandbox dashboard (`dashboard.sandbox.hit-pay.com`). On HitPay's sandbox payment page choose PayNow and use their test/simulate option. No real money moves.

## Not done yet
- **Refunds are manual.** The site works out the refund amount; send the money back from the HitPay dashboard (Transactions).
- A payment that arrives for a booking that was already cancelled or the wrong amount is not accepted. The server log says `needs a manual refund`.
- Going live needs a verified HitPay business account and the live keys.

# Payments, refunds, ledger, invoices and payouts

Built in Phase 5 (P5-01 to P5-11). Money is whole paise everywhere; times are UTC.

## Flow of one booking

1. The patient holds a slot (`POST /api/v1/appointments`, hold of 10 minutes).
2. `POST /api/v1/payments/orders` makes a gateway order for exactly the fee copied onto the appointment (the client sends nothing but the appointment id). At most 3 orders per appointment; a repeat of the same Idempotency-Key returns the same order.
3. The checkout widget (Razorpay) pays. The browser then calls `POST /api/v1/payments/verify` with the widget's signature. This is a hint only.
4. The gateway's own record decides. `SettlementService.settle` fetches the payment from the gateway, checks the order and the amount, marks it captured, writes the ledger entries, confirms the appointment, and asks the worker for the invoice. The same function runs when the signed webhook (`POST /api/webhooks/razorpay`) arrives, in either order, any number of times.
5. If the time was lost, the booking was cancelled, or a second payment arrived for the same booking, the money is refunded in full instead.

## Rules that must always hold (tested by `payment-invariants.test.ts`, 80 random orders of events)

- At most one payment holds the money for an appointment.
- Refunds started or done never exceed what was paid; the payment's refunded total equals the confirmed refunds.
- The ledger: the fee and the doctor's share add up to the payment, and the whole ledger for a payment equals paid less refunded.
- A confirmed appointment has a payment that took money.
- The gateway is never asked to refund more than it took.

## Tables

`payments`, `payment_events` (append-only, one row per gateway event id), `refunds`, `earnings_ledger` (append-only), `invoices` (never changed once issued), `invoice_counters`, `payouts`, `referrals`, `referral_codes`.

## Settings

| Setting | Meaning | Default |
|---|---|---|
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Gateway keys (never in the repo) | none |
| `RAZORPAY_API_BASE` | Stand-in gateway for tests; refused in production | none |
| `PLATFORM_FEE_BPS` | Platform share, hundredths of a percent | 0 |
| `INVOICE_TAX_BPS`, `INVOICE_SELLER_NAME`, `INVOICE_SELLER_ADDRESS`, `INVOICE_SELLER_TAX_ID` | What invoices print | 0 and empty |
| `FEATURE_REFERRALS`, `REFERRAL_REWARD_PAISE`, `REFERRAL_MAX_PER_REFERRER` | Referrals | off, 0, 10 |

## Jobs (worker)

`payment.webhook.process` (one stored event), `payment.reconcile` (daily: repairs missing ledger entries, compares recent payments with the gateway, raises one alert line `payment_reconcile_problem` for anything else), `invoice.render_pdf`.

## Admin

- `POST /api/v1/admin/payments/:id/refund`: full or partial, fresh sign-in, Idempotency-Key.
- `POST /api/v1/admin/payouts`, `GET /api/v1/admin/payouts/export`, `POST /api/v1/admin/payouts/:id/paid`: claim balances for a finished period, download the CSV to pay from, record that it was sent. Bank details are not stored here.

## Decisions waiting for the human

Platform fee rate; refund and cancellation terms for patients; tax and issuer fields on invoices (accountant); referral reward and whether it is allowed; Razorpay test keys. All are in `TODO.md` under "Questions for the human".

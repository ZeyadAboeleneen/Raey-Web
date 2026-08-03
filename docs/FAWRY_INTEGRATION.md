# Fawry Payment Integration

Hosted checkout (Express Checkout "Checkout Link"): the customer is redirected to
Fawry's payment page and returns after paying. Card data never touches our
servers.

## Setup

### 1. Environment variables

Add to `.env` (already gitignored — never commit these, never prefix with
`NEXT_PUBLIC_`):

```
FAWRY_BASE_URL="https://atfawry.fawrystaging.com"
FAWRY_MERCHANT_CODE="<merchant code from the integration email>"
FAWRY_SECURE_KEY="<security key from the integration email>"
NEXT_PUBLIC_BASE_URL="https://<your public domain>"
CRON_SECRET="<any long random string>"
```

`NEXT_PUBLIC_BASE_URL` must be the **public** origin. Fawry calls back to it
server-to-server, so `localhost` will not work for end-to-end testing — use a
tunnel (ngrok/cloudflared) or the staging deployment.

For production, swap `FAWRY_BASE_URL` to `https://www.atfawry.com` and use the
production credentials Fawry issues after the test cases pass.

### 2. Database migration (MSSQL / ERP)

The payment ledger lives in the **ERP database**, not the web MySQL database.
Run `scripts/erp-fawry-payments-table.sql` against MSSQL (SSMS, or `sqlcmd -i`).

It creates `dbo.tb_FawryPayments` and its indexes, and touches nothing else. The
existing `online_transactions` / `payment_companies` tables belong to another
part of the system and are deliberately left alone.

The DDL has been validated against the live ERP inside a rolled-back
transaction: all six batches execute, and the idempotency indexes behave as
intended (duplicate `EventHash` rejected with error 2601; multiple NULL
`EventHash` rows allowed; only one `initiated` row per order).

No MySQL migration is needed — the web DB schema is unchanged apart from the
`payment_status` enum, which already accepted the values used.

### 3. Register the callback URL

In the Fawry merchant portal (https://atfawry.fawrystaging.com), set the server
notification URL to:

```
https://<your domain>/api/payments/fawry/callback
```

The integration also sends `orderWebHookUrl` on every charge request, so this is
belt-and-braces.

### 4. Schedule reconciliation

Every 10–15 minutes:

```
GET https://<your domain>/api/cron/reconcile-fawry?secret=<CRON_SECRET>
```

This catches payments whose callback never arrived. Without it, a paid order
whose callback was lost stays unpaid forever.

## How it works

```
Customer submits checkout
   ↓
POST /api/orders            → prices the cart server-side, creates the order
                              as paymentStatus=pending
   ↓
POST /api/payments/fawry/init → reads the amount FROM THE ORDER ROW, signs the
                              charge request, returns Fawry's redirect URL
   ↓
Customer pays on Fawry's hosted page
   ↓
   ├── Fawry → POST /api/payments/fawry/callback   (authoritative)
   │      verify signature → verify amount
   │      → 1. MSSQL  write tb_FawryPayments row  (money record + idempotency)
   │        2. MySQL  approve order + reserve stock  (one transaction)
   │        3. MSSQL  create Booking, then post the cash journal entry
   │
   └── Browser → /checkout/success?orderId=...     (display only)
          polls our own order record; never trusts the URL parameters
```

### Why the steps are in that order

The money ledger is in the ERP (MSSQL) and the order/stock state is in the web
DB (MySQL). They cannot share a transaction, so the sequence is chosen so any
crash is recoverable:

- The ledger row is written **first** because it's the fact we most need never
  to lose.
- If a later step fails, the reconciliation cron re-polls Fawry and re-enters
  the same code path. Step 1 reports `duplicate`, and steps 2–3 still run —
  each is separately idempotent. This is why a duplicate does **not**
  short-circuit the handler.
- Stock is reserved only on the *transition* into approved, so a redelivered
  callback for an already-approved order cannot decrement twice.

## Security properties

| Property | How it's enforced |
|---|---|
| Customer can't choose their own price | `/api/orders` recomputes every amount via `lib/pricing/server-pricing.ts`; the client's `total`/`discountAmount`/`depositAmount` are ignored (a mismatch is logged as `[PRICE-MISMATCH]`) |
| Browser can't mark an order paid | Only the signed callback or our own status poll writes payment state. The return URL only triggers a re-read of our record |
| Forged callback can't approve | SHA-256 `messageSignature` verified against the secure key, compared in constant time. Failure → 401, nothing written |
| Replayed callback can't double-apply | Filtered unique index `UX_FawryPayments_EventHash`; a duplicate raises SQL Server 2601/2627 and is treated as already-applied |
| Underpayment can't approve | Fawry's `paymentAmount` compared to the order's expected amount in piastres; short payment → `pending_review`, never `approved` |
| Stock can't be reserved without payment | Reservation happens in the same DB transaction that records the confirmed payment |
| Secure key can't leak to the browser | Read only in `lib/fawry.ts`, which is `server-only`; no `NEXT_PUBLIC_` variable holds it |
| Staff price override can't be used by customers | Overrides are applied only when `isEmployeeOrder` is true, established from a verified JWT plus an ERP employee lookup |

## Accounting — needs your accountant before it will post

A confirmed Fawry payment is meant to post a cash journal entry (`tb_Journal` +
two balanced `tb_JournalDet` lines, `JSourceID` 29), the same "اذن حجز" entry
the ERP makes for a staff-taken deposit. The code for this is written, tested
and wired in (`lib/payments/fawry-journal.ts`), but it is **disabled by default
and will refuse to post until the GL accounts are configured.**

That is deliberate. I could not determine the correct accounts from the data,
and posting a guess into a live general ledger is not something to get wrong:

**1. There is no online/Fawry/web account in `AccountTree`.** Searching for
اونلاين / فوري / WEB / فيزا returns nothing. The account Fawry money should be
debited to does not appear to exist yet.

**2. The mapping in `lib/erp-sync.ts` doesn't match what the ERP actually
does.** From 4,181 live reservation journals:

| `CASH_GL_ACCOUNTS` says | Account's real name | What the data shows |
|---|---|---|
| `1: 305 // Main` | 305 is **خزينة D**, not Main — Main is account **300** | CashID 1 debits six different accounts |
| `12: 584 // WEB` | 584 is **ايراد اضافى - الفرع الرئيسى**, a *revenue* account, not a cash drawer | خزينة E's cash account is **579** |

Also, `ACCOUNT_DEPOSIT_LIABILITY = 173` ("ايرادات اخرى") is credited in exactly
**1** of those 4,181 journals. The ERP overwhelmingly credits the per-branch
"ايراد اضافى" accounts (585, 589, 587, 586, 584) instead.

The journal header's `CashID` does **not** determine the debit account — CashID
1 alone appears against six different ones — so the real rule is per-branch and
isn't recoverable from the code as written.

**This affects staff orders today**, not just Fawry: `syncEmployeeOrderToErp`
posts against that same mapping right now. Worth a separate look.

### To switch Fawry journal posting on

Once your accountant confirms the accounts, in `.env`:

```
FAWRY_JOURNAL_ENABLED=true
FAWRY_CASH_GL_ACCOUNT=<AccountTree.ID to DEBIT — where Fawry money lands>
FAWRY_REVENUE_GL_ACCOUNT=<AccountTree.ID to CREDIT>
FAWRY_CASH_ID=<Cashes.ID stamped on the journal header>
FAWRY_BRANCH_ID=10
FAWRY_USER_ID=1
```

Until then: payments are fully recorded in `tb_FawryPayments`, bookings are
created normally, and each skipped entry logs a warning naming the order and
amount so nothing is silently lost. The entry is idempotent on
`(JSourceID, RecID)`, so a replay or a reconciliation pass cannot double-post.

## Payment states

`tb_FawryPayments.Status` mirrors Fawry, as readable strings rather than opaque
codes: `initiated`, `unpaid`, `paid`, `canceled`, `refunded`, `expired`,
`failed`. Unknown values from Fawry map to `failed` — it fails closed, never to
`paid`.

Order-level `paymentStatus`:

| Fawry event | Order becomes |
|---|---|
| PAID, signature valid, amount ≥ expected | `approved` |
| PAID, but signature invalid or amount short | `pending_review` (needs a human) |
| EXPIRED | `expired` |
| FAILED / CANCELED | `rejected` |
| REFUNDED | `refunded` |
| UNPAID | stays `pending` |

An already-`approved` order is not walked back by a later out-of-order event,
except by a refund.

## Testing

Test cards and the POS simulator are in the Fawry integration email. Run the
required scenarios at:

https://developer.fawrystaging.com/public/autocheck/index.php?merchant=<merchant code>

Worth testing explicitly beyond Fawry's list:

1. **Successful card payment** → order becomes `approved`, stock decrements once,
   ERP booking created once.
2. **Declined card, then retry** → two rows in `tb_FawryPayments`, one order,
   stock decremented only once, one ERP booking.
3. **Duplicate callback** — replay the same callback body → second call returns
   `{"duplicate": true}`, nothing changes.
4. **Forged callback** — POST a valid-looking body with a wrong
   `messageSignature` → 401, order untouched, `[SIGNATURE-FAIL]` logged.
5. **Tampered price** — POST to `/api/orders` with `total: 1` for a real cart →
   the order is created at the correct server price, `[PRICE-MISMATCH]` logged.
6. **Abandoned payment** → order stays `pending`, cart is preserved, success page
   offers a retry.
7. **Lost callback** — block the callback, then hit the reconcile endpoint →
   order settles correctly.

## Endpoint path — confirmed

`FAWRY_INIT_PATH` defaults to `/ECommerceWeb/api/payments/init`, and this has
now been **verified against Fawry staging with merchant 770000022746**. A signed
charge request returns 200 with a payment URL:

```
https://atfawry.fawrystaging.com/atfawry/plugin/?payment-id=…&locale=en
```

That Fawry accepted it also confirms the charge signature is correct — a bad
signature is rejected outright. (`/fawrypay-api/api/payments/init` works too and
returns the same URL. The `…/payments/charge` endpoints are a different API that
requires an explicit `paymentMethod` and are not used here.)

## Local testing — returnUrl and the callback

`NEXT_PUBLIC_BASE_URL` is `https://raeygroup.com`, so both the returnUrl and the
webhook point at production. Running locally you'll be redirected to Fawry
correctly, but after paying:

- the browser returns to **raeygroup.com**, not localhost
- the callback is delivered to **raeygroup.com**, so your local order never
  gets confirmed

For an end-to-end local test, expose the dev server (ngrok / cloudflared) and
set `NEXT_PUBLIC_BASE_URL` to the tunnel URL. Otherwise run the test scenarios
against a deployed staging build.

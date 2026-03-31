# Production Runbook

## Core checks

Run these after a deploy, storage change, billing change, or incident:

```bash
LIVE_BASE_URL=https://www.equilibrium-trading.xyz npm run verify:live
```

This checks:
- `/health`
- `/api/debug-db`
- `/api/user/sync`
- `/api/user-status/:wallet`
- `/api/trade-journal/config`
- `/api/videos`
- the first lesson video URL, when present

### Uptime-only ping

Railway already health-checks `/health`. For an extra external probe (cron, UptimeRobot, etc.):

```bash
UPTIME_CHECK_URL=https://www.equilibrium-trading.xyz npm run verify:uptime
```

### GitHub Actions (scheduled uptime)

This repo includes **`.github/workflows/production-uptime.yml`**, which runs **every 6 hours** and on **manual dispatch** (`Actions` → **Production uptime** → **Run workflow**).

1. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**
2. Name: **`LIVE_BASE_URL`**
3. Value: production origin only, e.g. `https://www.equilibrium-trading.xyz` (no trailing path)

The step runs `node script/uptime-ping.mjs` (same as `npm run verify:uptime`). If `LIVE_BASE_URL` is not set, the workflow **succeeds with a notice** so forks do not fail.

### Sentry (optional) — Railway checklist

The app already initializes Sentry when DSNs are set (`server/sentry-init.ts`, `client/src/sentry-client.ts`). You only add variables and redeploy.

1. **Sentry.io** → create a project (or use one project with separate **Node** and **Browser** DSNs under *Client Keys*).
2. **Railway** → your **web service** → **Variables**:
   - **`SENTRY_DSN`** — paste the **server / Node** DSN (runtime only; do not prefix with `VITE_`).
   - **`SENTRY_ENVIRONMENT`** — e.g. `production` (optional).
   - **`SENTRY_TRACES_SAMPLE_RATE`** — `0` for errors-only, or `0.1` for light performance sampling (optional).
3. **Same Variables tab**, add **build-time** vars so the Docker image’s `npm run build` sees Vite env:
   - **`VITE_SENTRY_DSN`** — paste the **browser** DSN (different from the Node DSN).
   - **`VITE_SENTRY_TRACES_SAMPLE_RATE`** — `0` recommended unless you want browser traces.
   - In Railway, set each `VITE_*` variable to apply at **build** as well as deploy (UI wording varies: *“Available at Build Time”* / include in Docker build). If the browser DSN is missing at build time, the client bundle will not report to Sentry.
4. **Redeploy** the service (new deploy triggers a fresh Docker build with the `VITE_*` args wired in `Dockerfile`).
5. **Verify:** Sentry → *Issues* → use **Send test event** for the Node project; open the live site and confirm no CSP errors in the browser console for `*.ingest.sentry.io` (production CSP already allows `https:` for `connect-src`).

Unhandled server errors passed to Express with status ≥ 500 are captured automatically. The root `AppErrorBoundary` reports React render failures when `VITE_SENTRY_DSN` was present at build time.

## Manual acceptance checks

Run these before calling a release done:

1. Paid account:
- Connect a paid wallet
- Open `videos`, `signals`, and `journal`
- Confirm access works after refresh

2. Manually granted account:
- Connect a manually granted wallet
- Refresh
- Confirm premium surfaces still open

3. Support:
- Send one user support message
- Confirm admin sees it
- Reply once
- Confirm user sees the reply

4. Vault:
- Upload one test video
- Confirm it plays
- Delete one test video
- Confirm it disappears from `/videos`

## Storage expectations

- `DATABASE_URL`: PostgreSQL for wallet users, support, video metadata, trade grades, journal fallback, watchlists, and wallet sync data
- `MONGO_VAULT_URI`: MongoDB for CRM, support, and optional vault/CRM persistence
- Railway volume mounted at `/app/uploads`: uploaded lesson files

## Incident checklist

If users report they lost access:

1. Check:
- `/health`
- `/api/debug-db`

2. Verify:
- `DATABASE_URL`
- `MONGO_VAULT_URI`
- `MONGODB_DB_NAME`

3. Test:
- `/api/user-status/:wallet`
- `/api/user/sync` with `x-wallet-address`

4. Confirm the user’s row in admin CRM and current tier

## Backup and safety

- Keep GitHub as source of truth for code
- Keep Railway Postgres backups enabled
- Keep Mongo Atlas backups enabled if using non-free backup features
- Do not rely on in-memory data for production verification

## Secret rotation

Rotate immediately if exposed:
- `MONGO_VAULT_URI` credentials
- `STRIPE_SECRET_KEY`
- billing sync secret
- admin secrets

After rotating:

1. Update Railway variables
2. Redeploy
3. Run:

```bash
LIVE_BASE_URL=https://www.equilibrium-trading.xyz npm run verify:live
```

## Maintenance cadence (suggested)

| When | What |
|------|------|
| After every deploy | `npm run verify:live` (or confirm GitHub Actions CI green + manual spot-check) |
| Weekly | Glance at Sentry (if enabled) for new error groups; confirm scheduled **Production uptime** runs are green in GitHub Actions |
| Monthly | Confirm Railway Postgres / Atlas backup settings; skim `DATABASE_URL` / Mongo user still least-privilege |
| Quarterly | Rotate non-Stripe secrets that do not auto-rotate; update `LIVE_BASE_URL` secret if the production domain changes |

Add a personal calendar reminder for **monthly verify:live + Sentry** if you do not rely on CI alone.

## Pre-launch dashboard checklist (manual)

These steps are not in git; complete them in each provider UI:

1. **Railway** — `SENTRY_DSN`, `VITE_SENTRY_DSN` (and optional `SENTRY_*` / `VITE_SENTRY_*` sampling vars) so server and client Sentry both initialize after redeploy.
2. **GitHub** — repository secret **`LIVE_BASE_URL`** (origin only, no path) so **Production uptime** and local `verify:uptime` / `verify:live` match production.
3. **Onboarding email** — if you want real post-signup mail, wire an ESP (e.g. Resend, SendGrid) or a webhook from your auth/onboarding flow; the app does not send marketing mail by itself.
4. **`/health`** — after deploy, confirm JSON includes **`checks.postgres.reachable`** and **`checks.mongoVault.reachable`** when those backends are configured (values may be `null` until pings finish within the health timeout).
5. **Referrals in Stripe** — when a buyer hits `/pricing?ref=0x…`, then checks out via **`POST /api/stripe/checkout`**, Stripe metadata includes **`referral_wallet`** (and **`walletAddress`**) on the Checkout Session and on the **Subscription** (Pro) or **PaymentIntent** (Mentoring). View under the session or subscription in the Stripe Dashboard. If checkout falls back to Payment Links, that metadata is not added.
6. **Referrals in Mongo CRM** — set **`STRIPE_WEBHOOK_SECRET`** (or **`STRIPE_WEBHOOK_SIGNING_SECRET`**) in Railway to the **same signing secret** as the Stripe webhook endpoint (Dashboard → Developers → Webhooks → your endpoint → Signing secret). On **`checkout.session.completed`** / **`checkout.session.async_payment_succeeded`**, the app writes **`referralWallet`** (plus session id / timestamp) on the buyer’s CRM document when metadata includes both `walletAddress` and `referral_wallet`. If this env var is missing, `stripe-replit-sync` can still process webhooks using a secret from Postgres, but **referral fields will not be written** until the env var matches your Dashboard secret.

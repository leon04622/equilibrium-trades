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

### Sentry (optional)

1. Create a Sentry project (e.g. Node + React).
2. **Railway (server):** add `SENTRY_DSN` from the server/Node DSN. Optional: `SENTRY_ENVIRONMENT=production`, `SENTRY_TRACES_SAMPLE_RATE=0.1` (omit or `0` to disable performance traces).
3. **Client:** add `VITE_SENTRY_DSN` from the browser client DSN and **redeploy** so Vite bakes it in.
4. Confirm a test event: trigger a render error in dev with DSN set, or use Sentry’s “send test event”.

Unhandled server errors passed to Express with status ≥ 500 are reported automatically. The root `AppErrorBoundary` sends React render failures when the browser DSN is set.

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

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

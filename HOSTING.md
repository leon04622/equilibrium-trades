# Hosting Equilibrium Trades

This app is a **Node.js** server (`npm start` → `dist/index.cjs`) plus static files in `dist/public/`. You need **Node 20**, a **Postgres** URL for full features, and a host with a **public URL** (PaaS or VPS) for GoDaddy DNS.

## Build & smoke test (before you deploy)

From the repo root (use `NODE_ENV=development` for `npm install` if your shell forces production and skips devDependencies):

```bash
npm install
npm run verify
```

That runs TypeScript check, **production build** (Vite client + esbuild server bundle), and HTTP smoke tests against a short-lived server. Output artifacts: **`dist/public/`**, **`dist/index.cjs`**.

**Production env template** (copy to your host or `.env` for Docker): **`deploy/production.env.template`**

---

## Pick a host — Railway / Render (easiest) or VPS

**GoDaddy only holds DNS** — the **IP or CNAME** comes from **Railway, Render, or your VPS**, not from GoDaddy support inventing values.

---

## Option A — Easiest: **Railway** or **Render** (no server admin)

Good if you want DNS instructions like “point **CNAME** `www` to `xxxx.up.railway.app`” from their dashboard.

### 1. Put the code on GitHub

Push this repository to a GitHub account you control (if it isn’t already).

### 2. Sign up and deploy

**Railway** ([railway.app](https://railway.app))

1. **New project** → **Deploy from GitHub repo** → select the repo.  
2. Add **PostgreSQL** (Railway plugin) → copy its **`DATABASE_URL`** into your web service variables.  
3. In the **web service**, set variables (minimum):  
   - `PUBLIC_APP_URL` = `https://www.equilibrium-trading.xyz` (after DNS works, use your real URL)  
   - `DATABASE_URL` = (from Railway Postgres)  
   - `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY` (when you use API checkout)  
4. **Build**: use the repo **`Dockerfile`**, or set **Build** to `npm run build` and **Start** to `npm start` (Node 20).  
5. After deploy, Railway shows a URL like `https://something.up.railway.app`.

**Render** ([render.com](https://render.com))

1. **New** → **Web Service** → connect GitHub repo.  
2. **Runtime**: Node, **Build command**: `npm run build`, **Start command**: `npm start`.  
3. **Environment**: `NODE_VERSION=20` (or use Render’s Node 20 image).  
4. Add **PostgreSQL** (or use [Neon](https://neon.tech) / [Supabase](https://supabase.com) free DB and set `DATABASE_URL`).  
5. Set the same env vars as above.  
6. Render gives you `https://your-service.onrender.com`.

### 3. Run database migrations (when using Postgres)

From your machine (with `DATABASE_URL` set to the same DB):

```bash
npm run db:push
```

### 4. Custom domain → what GoDaddy needs

In **Railway / Render** → **Settings → Custom domains** → add `www.equilibrium-trading.xyz`.

They will show either:

- a **CNAME** target (e.g. `xxxx.up.railway.app`), or  
- **A records** / verification steps.

**In GoDaddy DNS**, create exactly what **they** show (usually **CNAME** `www` → their hostname). For the **apex** (`equilibrium-trading.xyz`), use their instructions or GoDaddy **forwarding** to `https://www.equilibrium-trading.xyz` (your app already redirects apex → www).

### 5. After HTTPS works

Set `PUBLIC_APP_URL` to `https://www.equilibrium-trading.xyz` and redeploy if you changed it.

---

## Option B — **VPS** (you get an **IP** for GoDaddy **A** records)

Good if you want full control and a fixed **IPv4** for GoDaddy.

1. Create a small VM at **DigitalOcean**, **Hetzner**, **Vultr**, **Linode**, etc. (Ubuntu 22.04).  
2. Note the **public IPv4** from the provider dashboard — that is what GoDaddy wants for **A** `@` and **A** `www`.  
3. On the server: install **Docker** or **Node 20**, clone the repo, create `.env`, run `npm ci && npm run build && npm start` (or use `docker compose -f docker-compose.prod.yml` with a proper `.env`).  
4. Open firewall **80** and **443**.  
5. Put **Caddy** or **Nginx** in front for HTTPS — see `deploy/Caddyfile.example`.

---

## Free Postgres without buying a DB on the host

- **[Neon](https://neon.tech)** or **[Supabase](https://supabase.com)** (free tier) → create a project → copy **connection string** → `DATABASE_URL` on the host → run `npm run db:push` once.

---

## Leaving Replit / self-hosting this repo

The codebase does **not** require Replit domains, Replit Object Storage for the video vault, or Replit-only Vite plugins. Vault uploads go to **`uploads/videos` on the server disk** via `registerLocalUploadRoutes` (same origin as the API).

### Why things often “don’t work” on Replit

| Issue | Cause |
|--------|--------|
| **Videos or users disappear** | **Autoscale / multiple instances**: in-memory fallbacks are per process; without a stable **`DATABASE_URL`**, data is not shared and resets on restart. |
| **Videos list empty but admin “worked”** | Admin hit **instance A**; `/videos` hit **instance B** with an empty in-memory store, or Postgres URL was wrong / table missing. |
| **Uploaded files missing** | File is on **one** instance’s disk; the next request may land on another instance. Fix: **single instance** or external storage (not required if you only use YouTube/Vimeo URLs). |
| **Stripe / redirects wrong** | **`PUBLIC_APP_URL`** not set to your real `https://www…` origin. |

**Fix:** Run on **one** deployment with a real **PostgreSQL** `DATABASE_URL` (Railway Postgres, Neon, Supabase, etc.), set **`PUBLIC_APP_URL`**, then run **`npm run db:push`** once against that database.

### Step-by-step: move off Replit to Railway or Render

1. **Keep GitHub as source of truth** — Push `main` to a repo you control (you already have `equilibrium-trades` on GitHub).
2. **Create Postgres outside Replit** — e.g. Railway **PostgreSQL** plugin, or free **[Neon](https://neon.tech)** / **[Supabase](https://supabase.com)**. Copy the connection string → **`DATABASE_URL`** on the new host.
3. **New web service** — Railway or Render: connect the **same GitHub repo**, **Node 20**, **build** `npm run build`, **start** `npm start` (or use the repo **`Dockerfile`** on Railway).
4. **Set environment variables** (minimum):
   - **`DATABASE_URL`** — Postgres URI from step 2  
   - **`PUBLIC_APP_URL`** — `https://www.yourdomain.com` (no trailing slash), or the host’s temporary URL until DNS is ready  
   - **`STRIPE_PUBLISHABLE_KEY`** / **`STRIPE_SECRET_KEY`** — copy from Replit Secrets if you use billing  
   - Copy any **`ADMIN_*`**, **`ADMIN_WALLET_ADDRESSES`**, **`ADMIN_EQUILIBRIUM_MASTER_WALLET`**, OpenAI keys, etc. from Replit into the new host’s env UI  
5. **Schema on the new database** — From your laptop (with network access to the DB):

   ```bash
   DATABASE_URL="postgresql://..." npm run db:push
   ```

6. **Stripe** — In [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks), add **`https://www.yourdomain.com/api/stripe/webhook`** (or your Render/Railway URL until the domain is live). Disable or delete the old Replit webhook if it pointed at Replit.
7. **DNS** — In GoDaddy, point **www** (and apex if needed) at **Railway / Render** (CNAME or A records **they** show you). See **Option A §4** above.
8. **Data migration (optional)** — If you still have a working Replit Postgres URL, you can **`pg_dump`** the old DB and **`pg_restore`** into the new one (or migrate only tables you care about). If not, you start fresh: re-invite admins, re-add vault videos in Command Center.
9. **Turn off the Replit deployment** when the new site is verified, so traffic and webhooks are not split between two URLs.
10. **Optional git cleanup** — Remove unused Replit remotes so you don’t push to the wrong place:

    ```bash
    git remote -v
    # git remote remove subrepl-...
    ```

**Video uploads** (`/api/uploads/*`) use **local disk** under `uploads/videos`. On platforms with **multiple containers**, use **one instance** or a **volume** mounted at `/app/uploads` (Docker) so files persist. If you only publish **YouTube/Vimeo links**, you can skip file uploads entirely.

---

## Checklist before you tell GoDaddy “done”

- [ ] App runs and opens in the browser on the **temporary** host URL.  
- [ ] `PUBLIC_APP_URL` matches the URL users will type (e.g. `https://www.equilibrium-trading.xyz`).  
- [ ] Custom domain added in the **hosting** panel; **DNS records copied from them** into GoDaddy (not the other way around).  
- [ ] Stripe webhook URL updated to `https://www.equilibrium-trading.xyz/api/stripe/webhook` when you go live.

If you say **Railway** or **Render** (or **VPS**) after you create the service, you can paste the **exact CNAME or IP** the dashboard shows (no secrets) and we can double-check the GoDaddy rows.

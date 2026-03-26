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

The codebase no longer depends on Replit domains, Stripe connectors, or Replit-only Vite plugins. Deploy on **Railway**, **Render**, or a **VPS** (Option A or B above), set **`PUBLIC_APP_URL`**, **`DATABASE_URL`**, **`STRIPE_SECRET_KEY`**, **`STRIPE_PUBLISHABLE_KEY`**, then point **GoDaddy DNS** at that host’s instructions.

**Video uploads** (`/api/uploads/*`) use **local disk** under `uploads/videos` (same-origin PUT/GET, no Replit Object Storage). On **Replit Autoscale**, files live on one instance’s disk only—use a **single VM / Reserved VM** or attach external storage if uploads must survive scaling. Self-hosted: ensure that directory exists and is writable (or on a mounted volume).

---

## Checklist before you tell GoDaddy “done”

- [ ] App runs and opens in the browser on the **temporary** host URL.  
- [ ] `PUBLIC_APP_URL` matches the URL users will type (e.g. `https://www.equilibrium-trading.xyz`).  
- [ ] Custom domain added in the **hosting** panel; **DNS records copied from them** into GoDaddy (not the other way around).  
- [ ] Stripe webhook URL updated to `https://www.equilibrium-trading.xyz/api/stripe/webhook` when you go live.

If you say **Railway** or **Render** (or **VPS**) after you create the service, you can paste the **exact CNAME or IP** the dashboard shows (no secrets) and we can double-check the GoDaddy rows.

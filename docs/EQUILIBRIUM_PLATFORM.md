# Equilibrium Trading — Platform documentation (Hyperliquid L1)

This document is suitable to share with **Hyperliquid** or internal stakeholders. The live in-app copy lives at **`/docs`** (`Docs.tsx`).

---

## 1. Strategy breakdown — 21 / 200 SMMA (trend-first)

Equilibrium uses **21-period and 200-period SMMA** (Smoothed Moving Average) on charts for **context**, aligned with Hyperliquid’s convention.

- **Trend-first read**: When 21 SMMA is above 200 SMMA, the regime is treated as **bullish bias**; below, **bearish bias**. Price relative to both lines informs conviction labels on educational cards.
- **Impulse poles**: The **Apex** engine and flag detectors look for a **sharp directional leg** (the “pole”) — a rapid move that establishes momentum before a pause.
- **Consolidation flags**: After the pole, price **consolidates in a channel** that slopes **against** the pole (bull flag: down-sloping pause after an up pole; bear flag: up-sloping pause after a down pole). Breakouts are classified as forming, pending, or confirmed.

**Important**: Chart SMMA drawing is **not** used to *hide* geometric patterns on the server scanner. If a wedge, flag, or head-and-shoulders validates on OHLC geometry, it **surfaces**; SMMA text on the card is **advisory**.

---

## 2. Technical specs — pattern scanner

| Item | Detail |
|------|--------|
| **Venue** | Hyperliquid **perpetuals** (and gold proxy **PAXG** when listed). |
| **Universe** | **Top 50** perps by **24h notional volume**, plus **PAXG** if available. |
| **Timeframes** | Default MTF set includes **`1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `1d`**. Product messaging highlights **`1m`, `5m`, `1h`, `4h`** as core swing anchors. |
| **Lookback** | **≥400** candles on deep TFs (`1h`–`1d`) where the API allows; **minimum 200** bars required before emitting a pattern (SMMA context + structure). |
| **Pattern library** | Flags (bull/bear), triangles, **double tops/bottoms**, **rising/falling wedges**, strict volume flags, **head & shoulders** / **inverse H&S**, plus Apex pole+flag geometry. |

---

## 3. Quick start (3 steps)

1. **Connect wallet** — Use an EVM wallet; switch to **Arbitrum One** for **native USDC** on the Portfolio page.
2. **Approve builder & agent** — Complete Hyperliquid **builder fee** (`approveBuilderFee`) and **trading agent** approval so orders route with the platform builder code.
3. **Fund & trade** — Use **Portfolio → Deposit** (**Circle CCTP** to HyperCore, §3a); open **Trading** for execution. If margin sits in spot, use **spot → perp** in Portfolio.

### 3a. USDC deposits (Arbitrum → HyperCore via Circle CCTP)

Equilibrium uses **Circle’s Cross-Chain Transfer Protocol (CCTP)** for **institutional-grade, 1:1 USDC** movement: **no AMM routing, zero slippage** on the transfer itself (fees are explicit protocol / forward charges, not price impact). This replaces ad-hoc “bridge address” `transfer` flows that are easy to misconfigure.

| Item | Detail |
|------|--------|
| **Mechanism** | **EIP-3009** `ReceiveWithAuthorization` on Arbitrum USDC + **`batchDepositForBurnWithAuth`** on Circle’s **`CctpExtension`** → burn on Arbitrum → mint on **HyperEVM** → forward to **HyperCore** with hook data (default **perp** destination). |
| **Reference** | Official how-to: [Transfer USDC from Arbitrum to HyperCore](https://developers.circle.com/cctp/howtos/transfer-usdc-from-arbitrum-to-hypercore) (Circle). |
| **Configuration** | **No CCTP contract addresses in the client.** Server: `GET /api/cctp/deposit-config` (from env **`CCTP_EXTENSION_ADDRESS`**, **`CCTP_USDC_ADDRESS`**, **`CCTP_FORWARDER_ADDRESS`**, domains, chain id, EIP-712 domain overrides). Fees: `GET /api/cctp/fees` (Circle **Iris** API, with optional **`CCTP_FORWARD_FEE_STATIC`** fallback). |
| **Progress memory** | `POST /api/user/cctp-bridge-progress` writes **`cctpBridgeProgress`** on the MongoDB CRM user only. **`GET /api/user/sync`** returns it so the UI can resume after refresh. These writes **do not** modify `subscriptionTier` / **`manualProOverride`**. |
| **Pro lock** | When Mongo already has **`manualProOverride: true`**, CRM upserts from Postgres **preserve** that grant if Postgres still shows `free` (sync lag), so **Pro** is not dropped during heavy bridge / onboarding traffic. |

**Network:** **Arbitrum One** (chain id `42161`) for the burn transaction; **native USDC** token address must match Circle’s deployment for that network (`CCTP_USDC_ADDRESS`).

---

## 4. Identity & fees (fixed)

| Role | Address |
|------|---------|
| **Admin / sovereign wallet** | `0x115560812df8e7515eecc957b6796531e936edd9` |
| **Builder fee recipient** | `0xad9be64fd7a35d99a138b87cb212baefbcdcf045` |

---

## 5. Data & access persistence

- **Subscriptions**: **Pro** and **Mentor** grants from the Admin Panel are written to **PostgreSQL** (`wallet_users`) and mirrored to **MongoDB** (`users` CRM collection) so refreshes and `/api/user/sync` restore tier.
- **CCTP bridge UX**: Last step / tx hash / errors for the deposit wizard live under **`cctpBridgeProgress`** on the same CRM document, merged into **`AuthContext`** via `/api/user/sync`.
- **Educational vault**: Video metadata is stored in **MongoDB**; **`GET /api/videos`** serves the catalog. Playback remains **Pro-gated** in the player; the **library list** is visible without signing in so titles/thumbnails are not “lost” after logout.

---

*Last updated for Equilibrium Trading documentation suite.*

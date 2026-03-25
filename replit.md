# Equilibrium - Beginner-Friendly Trading Platform

> **Note:** This file is **historical** (Replit-era notes). The app is **self-host first**: set `PUBLIC_APP_URL`, `DATABASE_URL`, `STRIPE_SECRET_KEY`, and `STRIPE_PUBLISHABLE_KEY` on Railway, Render, or a VPS. See `HOSTING.md`.

## Overview
Equilibrium is a beginner-friendly trading platform designed to educate users on a specific trading strategy utilizing 21 SMA and 200 SMA crossovers. The platform integrates TradingView charts with indicators, features AI-powered pattern detection, offers a comprehensive library of over 18 trading patterns with educational content, and provides subscription tiers including a premium liquidity heatmap. It supports non-custodial trading via Hyperliquid, enabling users to connect their wallets for direct order submission. The project aims to empower users with tools for learning, analysis, and execution in a secure, non-custodial environment.

## User Preferences
None provided.

## System Architecture

### Frontend (React + TypeScript)
- **Framework**: Vite + React 18
- **Styling**: Tailwind CSS with a custom design system
- **State Management**: TanStack Query for server state
- **Routing**: Wouter
- **UI Components**: Shadcn/ui
- **Charts**: TradingView embedded widget
- **Wallet Integration**: MetaMask/Browser wallet via ethers.js for non-custodial operations
- **Trading**: Client-side order signing and direct Hyperliquid API submission.
- **Design System**: Primary blue theme, distinct green for bullish and red for bearish indicators, Inter, Plus Jakarta Sans, and JetBrains Mono fonts, with light and dark mode support.
- **UI/UX**: Features a dashboard, dedicated trading interface, pattern library, learning modules, AI signals page, heatmap, Hyperliquid connection, pricing tiers, and user settings. Includes visual SL/TP order management directly on charts and a tabbed bottom trading panel for positions and orders.

### Backend (Express + TypeScript)
- **Framework**: Express.js
- **AI**: OpenAI via Replit AI Integrations (gpt-5.1) for pattern detection.
- **Storage**: In-memory storage (MemStorage) for transient data; PostgreSQL (Neon) for persistent data including wallet users, tutorial video metadata, chat messages, and email leads.
- **Streaming**: Server-Sent Events (SSE) for real-time pattern detection.
- **Non-Custodial Architecture**: Ensures user private keys are never handled by the server, with all authentication and order signing occurring client-side.
- **Real-time Data**: WebSocket server for real-time order book heatmap data.
- **Admin Features**: Admin panel for user and subscription management, an admin inbox for customer support, and email leads management with CSV export.
- **Wallet Gate**: Full-screen wallet connection gate blocks all app content until user connects their wallet. Includes email lead capture form for non-connected visitors.
- **Authorization**: Server-side authorization for chat and video content, requiring wallet authentication and builder code approval for regular users, and hardcoded admin wallet verification for administrative functions.

### Core Features
- **Educational Pattern Scanner**: Scans for educational patterns to teach recognition, distinct from trade signals.
- **Trading Strategy**: Guides users on a 21/200 SMA crossover strategy, including confirmation and continuation patterns.
- **Trade Journal**: Automatic grading of closed trades based on entry, stop placement, R:R, leverage, and setup validity, providing detailed feedback.
- **Draggable SL/TP Lines**: Visual horizontal price lines (Entry, SL, TP, Liquidation) overlaid on the chart with drag handles. Users can drag SL/TP lines to new prices; releasing triggers a live Hyperliquid order update.
- **Email Lead Capture**: Non-connected visitors on the wallet gate can submit their email. Leads stored in the `leads` DB table, visible in admin with CSV export.
- **Hyperliquid Data Fix**: `prevDayPx` now uses the real value from the Hyperliquid `metaAndAssetCtxs` API instead of an estimated calculation.
- **Live Chat Customer Support**: Real-time chat widget with server-side authorization, linking messages to wallet addresses, and an admin inbox for support staff.
- **Video Learning System**: Supports uploading and in-app playback of educational videos with CRUD operations and categorization.

## External Dependencies
- **TradingView**: For chart visualization and indicators.
- **OpenAI**: Via Replit AI Integrations (gpt-5.1) for AI-powered pattern detection.
- **Hyperliquid**: For non-custodial trading, market data (coins, tickers, order books, trades, candles), and order execution.
- **MetaMask/Other Browser Wallets**: For client-side wallet connection and transaction signing using ethers.js.
- **PostgreSQL (Neon/Helium)**: For persistent data storage, including video metadata, user information, and support chat messages. **NOTE**: The `helium` PostgreSQL hostname is currently unresolvable (Replit infrastructure issue). All DB operations have in-memory fallbacks so the app remains functional. When the DB recovers, data will automatically persist again.
- **Stripe**: For subscription payment processing and management using stripe-replit-sync package.

## Access System (Dual-Layer)

### Layer 1: Wallet Gate
- Full-screen modal blocks all app content until wallet is connected
- On first connection, `BuilderCodeModal` appears (non-dismissable) requiring EIP-191 signature
- Signature approves Equilibrium as Hyperliquid builder; stored in DB as `builderCodeApproved`
- All connected wallet users get FREE access to: basic charting (TradingView), order execution

### Layer 2: Subscription Gate (£50/month)
- **Tiers**: Free (connected wallet), Pro (£50/month Stripe subscription)
- **PaywallModal**: Triggered globally via `usePaywall()` hook when any locked feature is clicked
- **Pro Features**: SMA overlays, AI pattern recognition, Trade Journal, Signals, Heatmap
- **Admin Bypass**: Hardcoded admin wallet addresses bypass to elite tier automatically
- **Stripe Products**: AI Pro (prod_TpGvzRznydzDhy), Elite Mentoring (prod_TpGvGOpqOoE8xL)
- **Architecture**: Uses stripe-replit-sync package for webhook handling - NEVER insert directly into stripe schema
- **Frontend Hook**: `client/src/hooks/use-subscription.ts` provides `hasAccess(feature)` function
- **Frontend Gate**: `client/src/components/subscription-gate.tsx` wraps premium feature content
- **Paywall Context**: `client/src/lib/paywall-context.tsx` + `client/src/components/paywall-modal.tsx`

## Caching Strategy
- **HTML Pages**: Never cached (`no-cache, no-store, must-revalidate`) - ensures users always get the latest version
- **Static Assets (JS, CSS, images)**: Cached for 1 year with content hashes for cache-busting
- **Configuration**: `server/static.ts` handles production caching headers
- **Development**: Vite adds unique query params to bust cache on main.tsx
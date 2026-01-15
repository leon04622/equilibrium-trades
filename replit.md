# Equilibrium - Beginner-Friendly Trading Platform

## Overview
Equilibrium is a beginner-friendly trading platform that teaches users a specific trading strategy using 21 SMA and 200 SMA crossovers. The platform features:
- TradingView chart integration with all indicators
- AI-powered pattern detection using OpenAI (via Replit AI Integrations)
- Comprehensive pattern library with 18+ patterns and educational content
- Subscription tiers with premium liquidity heatmap feature
- Hyperliquid connection UI for trading

## Architecture

### Frontend (React + TypeScript)
- **Framework**: Vite + React 18
- **Styling**: Tailwind CSS with custom design system
- **State Management**: TanStack Query for server state
- **Routing**: Wouter
- **UI Components**: Shadcn/ui with custom components
- **Charts**: TradingView embedded widget
- **Wallet**: MetaMask/Browser wallet via ethers.js (non-custodial)
- **Trading**: Client-side order signing with direct Hyperliquid API submission

### Backend (Express + TypeScript)
- **Framework**: Express.js
- **AI**: OpenAI via Replit AI Integrations (gpt-5.1)
- **Storage**: In-memory storage (MemStorage)
- **Streaming**: Server-Sent Events for pattern detection

### Non-Custodial Trading Architecture
This platform uses a **fully non-custodial** architecture:
- Users connect their own wallet (MetaMask/browser extension)
- All authentication and order signing happens **client-side** in the user's wallet
- The app only requests message/order signatures from the wallet
- Signed payloads are submitted directly to Hyperliquid's public API from the frontend
- **No private keys** are ever stored, transmitted, or handled by the server
- Works exactly like Hyperliquid's own UI, GMX, or Uniswap

## Project Structure
```
client/
├── src/
│   ├── components/           # Reusable UI components
│   │   ├── trading-view-chart.tsx    # TradingView widget
│   │   ├── pattern-card.tsx          # Pattern display cards
│   │   ├── pattern-modal.tsx         # Educational modal
│   │   ├── sma-indicator.tsx         # SMA analysis display
│   │   ├── live-pattern-card.tsx     # Live detected patterns
│   │   ├── liquidity-heatmap.tsx     # Premium heatmap feature
│   │   └── app-sidebar.tsx           # Navigation sidebar
│   ├── pages/                # Route pages
│   │   ├── dashboard.tsx     # Main dashboard
│   │   ├── trading.tsx       # Live trading with chart
│   │   ├── patterns.tsx      # Pattern library
│   │   ├── learn.tsx         # Educational modules
│   │   ├── signals.tsx       # AI signals page
│   │   ├── heatmap.tsx       # Liquidity heatmap (premium)
│   │   ├── hyperliquid.tsx   # Exchange connection
│   │   ├── pricing.tsx       # Subscription tiers
│   │   └── settings.tsx      # User settings
│   ├── lib/
│   │   ├── patterns.ts       # Pattern definitions (18+ patterns)
│   │   ├── theme.tsx         # Theme provider
│   │   ├── wallet-context.tsx    # Wallet connection (MetaMask)
│   │   ├── hyperliquid-client.ts # Client-side Hyperliquid SDK
│   │   └── trading-context.tsx   # Trading state management
│   └── App.tsx               # Main app with routing

server/
├── routes.ts                 # API endpoints
├── storage.ts                # In-memory storage implementation
├── pattern-detection.ts      # AI pattern analysis using OpenAI
├── hyperliquid.ts            # Hyperliquid API client for market data
├── heatmap-storage.ts        # Ring buffer for order book snapshots
├── heatmap-ws.ts             # WebSocket server for real-time heatmap
└── replit_integrations/
    └── chat/                 # OpenAI chat integration

shared/
├── schema.ts                 # TypeScript types and schemas
└── models/chat.ts            # Chat model schemas
```

## API Endpoints

### Patterns
- `GET /api/patterns/active` - Get active detected patterns
- `GET /api/patterns/symbol/:symbol` - Get patterns by symbol
- `POST /api/detect-patterns` - AI pattern detection (SSE streaming)
- `PATCH /api/patterns/:id/status` - Update pattern status

### Market Data
- `GET /api/market/:symbol` - Get market condition (SMA values, trend)

### SMA Signals
- `GET /api/signals/sma` - Get recent SMA signals
- `POST /api/signals/sma` - Create SMA signal

### Subscriptions
- `GET /api/subscriptions` - Get all subscription tiers
- `GET /api/subscriptions/:id` - Get single tier

### Hyperliquid API
- `GET /api/hyperliquid/coins` - Get all available coins
- `GET /api/hyperliquid/tickers` - Get all tickers with live prices
- `GET /api/hyperliquid/orderbook/:coin` - Get order book for a coin
- `GET /api/hyperliquid/trades/:coin` - Get recent trades
- `GET /api/hyperliquid/candles/:coin` - Get candle data

### WebSocket
- `ws://host/ws/heatmap` - Real-time order book heatmap data

## Trading Strategy (21/200 SMA Crossover)
1. Watch for 21 SMA to cross 200 SMA on 1-minute chart
2. Confirm price is above 200 SMA on 5-minute chart (for longs)
3. Look for continuation patterns: bull flags, triangles, pennants
4. For shorts: 21 SMA below 200 SMA, look for bear flags

## Subscription Tiers
- **Starter** ($0/mo): Pattern library, basic charts, 5 educational modules
- **Pro** ($49/mo): AI pattern detection, real-time alerts, trade recommendations
- **Elite** ($149/mo): Liquidity heatmap, order flow, 1-on-1 coaching

## Pattern Library (18+ Patterns)
### Continuation Patterns
- Bull Flag, Bear Flag, Pennant
- Ascending/Descending/Symmetrical Triangles
- Cup and Handle

### Reversal Patterns
- Head and Shoulders, Inverse H&S
- Double Top/Bottom, Triple Top/Bottom
- Diamond, Rising/Falling Wedge
- Engulfing patterns, Morning/Evening Star

## Design System
- **Primary**: Blue (#3b82f6)
- **Bullish**: Green (hsl 142 76% 36%)
- **Bearish**: Red (hsl 0 84% 60%)
- **Fonts**: Inter (body), Plus Jakarta Sans (headings), JetBrains Mono (code)
- **Theme**: Light and dark mode with toggle

## Development Commands
```bash
npm run dev        # Start development server
npm run db:push    # Push database schema (if using DB)
```

## Recent Changes
- January 2026: Initial MVP build with full frontend and backend
- AI pattern detection using OpenAI gpt-5.1
- TradingView chart widget integration
- 18+ trading patterns with educational content
- Subscription tiers with pricing page
- **January 2026**: Hyperliquid integration for real-time market data
  - Live prices for 20+ crypto assets
  - Order book visualization with depth display
  - Recent trades with buy/sell coloring
  - **Bookmap-style Liquidity Heatmap** (Elite feature):
    - Canvas-based real-time visualization
    - Order book depth over time as heatmap
    - Large order (whale) detection
    - Institutional level identification
    - WebSocket streaming for real-time updates
- **January 2026**: Non-custodial trading architecture
  - MetaMask wallet connection in header
  - Client-side order signing with ethers.js
  - Direct submission to Hyperliquid API from frontend
  - No private keys on server - fully non-custodial
  - Works like Hyperliquid UI, GMX, or Uniswap
- **January 2026**: Video Upload System with Drag-and-Drop
  - Upload videos from computer via drag-and-drop or file browser
  - YouTube link support (paste URL or video ID)
  - Videos stored in Replit Object Storage
  - Categories: Strategy, Platform, Tips
  - Full CRUD operations via UI (add, view, delete)
  - API: GET /api/videos, POST /api/videos, DELETE /api/videos/:id
- **January 2026**: Trade Journal with Auto-Grading
  - Every trade automatically graded when position closed
  - Scoring criteria (0-100 each):
    - Entry quality (timing relative to breakout)
    - Stop placement (proper distance, not too tight/wide)
    - R:R adherence (2:1 minimum, 3:1 ideal)
    - Leverage appropriateness (lower is safer)
    - Setup validity (pattern identification)
  - Overall trade score /100
  - Letter grades: A-setup, B-execution style display
  - Weekly discipline score on dashboard
  - Expandable trade cards with detailed feedback
  - API: GET /api/journal/trades/:wallet, GET /api/journal/weekly/:wallet, POST /api/journal/grade
- **January 2026**: Visual SL/TP Order Management (Hyperliquid-style)
  - BottomTradingPanel: Tabbed panel at bottom of screen (Positions, Open Orders, Trade History, Order History)
  - ChartPositionOverlay: Shows entry, SL, TP, and liquidation price lines directly on the chart
  - Auto-refresh every 10 seconds for live order status
  - Cancel individual orders or cancel all from bottom panel
  - Classification logic: Uses orderType from API, falls back to position entry price comparison
  - Components: bottom-trading-panel.tsx, chart-position-overlay.tsx
  - TP/SL placement: Click pencil icon on position row to set take profit and stop loss prices
  - Uses placeTriggerOrder from Hyperliquid API to place TP/SL as trigger orders
  - Positions table shows: Coin, Size, Position Value, Entry/Mark/Liq prices, PNL (ROE%), Margin, Close All, TP/SL

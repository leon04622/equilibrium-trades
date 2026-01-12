# Equilibrium Trading Platform - Design Guidelines

## Design Approach
**Hybrid Approach**: Drawing from modern fintech (Robinhood, Coinbase) for beginner-friendly simplicity + TradingView for chart functionality. Focus on clarity, education, and reducing cognitive overwhelm for new traders.

## Core Design Principles
1. **Education-First**: Every complex element has clear explanatory context
2. **Progressive Disclosure**: Advanced features hidden until needed
3. **Visual Hierarchy**: Charts dominate, noise minimized
4. **Trust Through Clarity**: No hidden complexity, transparent data presentation

## Typography System
- **Primary Font**: Inter (web-safe, excellent for data/numbers)
- **Display/Headers**: Plus Jakarta Sans (friendly, modern)
- **Code/Data**: JetBrains Mono (for precise numerical displays)

**Hierarchy**:
- Hero/Page Titles: 3xl-4xl, bold
- Section Headers: xl-2xl, semibold
- Chart Labels/Data: sm-base, medium
- Educational Text: base, normal
- Micro-data (timestamps, etc.): xs-sm, normal

## Layout System
**Spacing Primitives**: Use Tailwind units of 2, 4, 6, and 8 for consistency
- Component padding: p-4 to p-6
- Section spacing: py-8 to py-12
- Card gaps: gap-4
- Dense data areas: p-2 to p-3

**Grid Structure**:
- Main trading view: Sidebar (280px fixed) + Main chart area (fluid) + Right panel (320px)
- Mobile: Stack vertically, chart takes priority
- Use `max-w-7xl` for dashboard containers

## Component Library

### Navigation
- **Top Bar**: Fixed header with logo, account balance display, notification bell, profile dropdown
- **Left Sidebar**: Collapsible navigation with icons + labels (Dashboard, Learn, Patterns, Settings, Hyperliquid Account)
- Mobile: Bottom tab bar with 5 core actions

### Trading Interface Components

**Chart Area** (Primary Focus - 60% viewport width):
- Full-height TradingView embedded chart
- Floating toolbar overlay (top-right): Timeframe selector, indicator toggles, drawing tools
- Pattern Detection Overlays: Semi-transparent badges that appear on chart when patterns form
- SMA indicator lines visible by default (21 & 200)

**Pattern Recognition Display**:
- **Live Pattern Cards**: Floating cards that appear adjacent to patterns on chart
- Include: Pattern name, confidence %, expected breakout direction, educational icon button
- **Educational Modals**: Click pattern → Full-screen overlay with:
  - Pattern diagram/illustration
  - Success probability statistics
  - Entry/exit guidelines
  - Historical examples (3-4 mini chart snippets)
  - "Got it" CTA button

**Right Panel** (Information Dense):
- **Signal Box** (top section): Current market condition, SMA status indicators, active pattern count
- **Trade Setup Card**: When pattern detected, shows entry price, stop loss, take profit with visual price ladder
- **Recent Patterns List**: Scrollable feed of last 10 detected patterns with outcomes
- **Educational Tips Box**: Rotating trading wisdom relevant to current market state

### Dashboard View
**Hero Section**: 
- Large performance chart showing account growth
- Key metrics cards (4-column grid): Total Balance, Win Rate, Active Patterns, Learning Progress
- Quick-action CTAs: "Start Trading Session", "Review Yesterday's Trades"

**Pattern Library Section**:
- Masonry grid of pattern cards (3-column desktop, 2 tablet, 1 mobile)
- Each card: Pattern illustration, name, difficulty badge, "Learn More" button
- Categories: Continuation Patterns (Flags, Pennants, Triangles) | Reversal Patterns (Head & Shoulders, Double Tops/Bottoms) | All common patterns included

**Learning Progress Section**:
- Progress bars for each pattern type learned
- Achievement badges for milestones
- "Continue Learning" path suggestions

### Subscription/Pricing Page
- Hero: Bold headline about liquidity heatmap feature with comparison slider (with vs without)
- 3-column pricing tiers: Starter, Pro, Elite
- Feature comparison table below
- FAQ accordion section
- Trust indicators: User testimonials, security badges

## Data Visualization Standards
- **Real-time Numbers**: Tabular numerals, clear positive/negative indicators (▲/▼ symbols)
- **Charts**: Clean gridlines, minimal axis labels, focus on price action
- **Heatmaps**: High contrast gradients for liquidity visualization
- **Status Indicators**: Pill-shaped badges with icons for trade states (Active, Pending, Closed)

## Interactive Elements
- **Buttons**: Rounded-lg, clear size hierarchy (sm for secondary, base for primary, lg for hero CTAs)
- **Form Inputs**: Rounded borders, persistent labels, inline validation
- **Toggles/Switches**: Use for indicator on/off, pattern filters
- **Dropdowns**: Custom select menus for timeframes, pattern types
- **Tooltips**: Appear on hover for all technical terms/icons

## Accessibility
- All interactive elements keyboard navigable
- ARIA labels on all chart overlays and pattern detection elements
- High contrast for all text over chart backgrounds
- Focus indicators visible on all controls
- Screen reader announcements for pattern detections

## Animations
**Minimal Motion**:
- Pattern appearance: Subtle fade-in + scale (300ms)
- Sidebar collapse: Smooth width transition (200ms)
- Data updates: Number counter animations for large changes
- Modal entry: Fade + slight slide up (250ms)
- **No animations on**: Chart renders, price updates, real-time data streams

## Images
- **Hero Image** (Landing Page): Clean trading desk setup or abstract financial growth visualization, large format spanning full viewport width
- **Pattern Illustrations**: Simple, clean line diagrams showing each chart pattern formation
- **Educational Content**: Annotated chart screenshots showing real pattern examples
- **Trust Section**: Team photos if applicable, or abstract imagery conveying professionalism

## Platform-Specific Considerations
- **TradingView Integration**: Embedded iframe takes full chart area, custom UI overlays pattern detection
- **Hyperliquid Connection**: Account status widget in top bar, connection indicator dot
- **Mobile Trading**: Simplified view prioritizing chart + essential controls only, educational content in separate tabs
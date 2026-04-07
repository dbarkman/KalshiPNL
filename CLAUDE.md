# CLAUDE.md

## Project Overview
Kalshi Performance Dashboard — a Next.js app that analyzes Kalshi prediction market trading history from CSV exports. Fork of [jsteng19/kalshi-dash](https://github.com/jsteng19/kalshi-dash).

## Tech Stack
- Next.js 14 (App Router), React 18, TypeScript
- Tailwind CSS for styling
- Chart.js / react-chartjs-2 for charts
- PapaParse for CSV parsing
- No test framework configured

## Commands
- `npm run dev` — local dev server
- `npm run build` — production build
- `npx tsc --noEmit` — type-check without emitting

## Architecture
- **`src/app/page.tsx`** — minimal entry, renders `CsvUploader`
- **`src/components/CsvUploader.tsx`** — main orchestrator component; owns all filtering state and passes filtered data to child components
- **`src/utils/processData.ts`** — all data processing: CSV parsing (two formats), FIFO trade matching, series/category stats calculation, Kalshi API calls
- **`src/app/api/narrative/route.ts`** — server-side API route that shells out to local `claude` CLI for AI Q&A chat

## Key Concepts
- **Two CSV formats**: Legacy (Ticker, Type, Direction columns) and new 2025+ format (market_ticker, side, entry_price_cents columns). Format is auto-detected.
- **Ticker structure**: `{SERIES}-{EVENT}-{MARKET}` (e.g. `KXKIRKMENTION-25DEC04-PATR`). `parseTickerComponents()` splits these.
- **MatchedTrade vs Trade**: `Trade` is a raw CSV row; `MatchedTrade` is a completed round-trip (entry + exit matched via FIFO). Most stats derive from `MatchedTrade[]`.
- **Category mapping**: Fetched from Kalshi public API (`/trade-api/v2/series`), maps series ticker → category string.

## Filter Hierarchy
Five-level filtering in CsvUploader, each narrows the data:
1. **Month** (teal) — click a row in MonthlyPnlTable; clearing also clears day selection
2. **Day(s)** (teal) — click/Cmd+click rows in DailyPnlTable for multi-select
3. **Category** (purple) — click in CategoryStatsTable; selecting clears series filter and selected series
4. **Series name filter** (orange) — text input substring match on series ticker, clears selected series
5. **Selected series** (blue) — exact series from clicking a SeriesStatsTable row

### Important filter data flow
- **Monthly/Daily tables** receive `nonDateFilteredTrades` (filtered by category/series but NOT date) so all rows stay visible for selection
- **Category/Series tables** receive `filteredData.matchedTrades` (includes date filters) so they only show what was traded in the selected time period
- **SeriesStatsTable** gets trades filtered by date + category + series name filter, but NOT selected series (so all series remain visible for picking)
- **SeriesStatsTable** must not return `null` when the filter input is present — always show the header with the filter field even with zero results

## Component Layout (top to bottom)
1. PNL Chart
2. Overview (stats cards including Kelly Criterion)
3. Risk Adjusted Returns
4. AI Trading Q&A (chat-style, calls local `claude` CLI)
5. Monthly P&L table (click to filter)
6. Daily P&L table (click/Cmd+click multi-select)
7. Category Performance table (click to filter)
8. Series Performance table (with text filter input)
9. Trading Distributions (3 pie charts with counts in legends)
10. Trade List (only shown when any filter is active)

## Patterns
- New table components follow the `SeriesStatsTable` pattern: sortable columns, click-to-filter rows, color-coded active filter badge, hint text at bottom
- Stats recalculation for filtered views is done inline in `CsvUploader`'s `filteredData` useMemo
- Pie chart legends include counts and percentages directly in labels (no hover needed)
- The AI Q&A feature requires the `claude` CLI installed and authenticated locally; conversation history is sent with each request

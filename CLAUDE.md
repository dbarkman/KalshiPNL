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
- **`src/components/CsvUploader.tsx`** — main orchestrator component; handles file upload, all filtering state (category, series name filter, selected series), and renders all child components
- **`src/utils/processData.ts`** — all data processing: CSV parsing (two formats: legacy and 2025+ new format), FIFO trade matching, series/category stats calculation, Kalshi API calls
- **`src/app/api/narrative/route.ts`** — server-side API route that shells out to local `claude` CLI for AI narrative generation

## Key Concepts
- **Two CSV formats**: Legacy (Ticker, Type, Direction columns) and new 2025+ format (market_ticker, side, entry_price_cents columns). Format is auto-detected.
- **Ticker structure**: `{SERIES}-{EVENT}-{MARKET}` (e.g. `KXKIRKMENTION-25DEC04-PATR`). `parseTickerComponents()` splits these.
- **MatchedTrade vs Trade**: `Trade` is a raw CSV row; `MatchedTrade` is a completed round-trip (entry + exit matched via FIFO). Most stats derive from `MatchedTrade[]`.
- **Category mapping**: Fetched from Kalshi public API (`/trade-api/v2/series`), maps series ticker → category string.

## Filter Hierarchy
Three-level filtering in CsvUploader, each narrows the previous:
1. **Category** (purple) — selecting clears series filter and selected series
2. **Series name filter** (orange) — substring match on series ticker, clears selected series
3. **Selected series** (blue) — exact series from clicking a row

## Patterns
- New table components follow the `SeriesStatsTable` pattern: sortable columns, click-to-filter rows, color-coded active filter badge
- Stats recalculation for filtered views is done inline in `CsvUploader`'s `filteredData` useMemo
- The AI narrative feature requires the `claude` CLI installed and authenticated locally

import { MatchedTrade, parseTickerComponents } from './processData';

export const TIER_LADDER = [1, 10, 25, 50, 75, 100, 125, 150, 175, 200] as const;
export type Tier = typeof TIER_LADDER[number];

const CUSTOM_ANNUAL_CATEGORIES = new Set(['Elections', 'Politics', 'Entertainment', 'Companies', 'Science and Technology', 'Financials']);
const CUSTOM_MONTHLY_CATEGORIES = new Set(['Economics', 'Climate and Weather', 'Mentions']);

const LADDER_FREQS = new Set(['weekly', 'daily', 'hourly', 'fifteen_min']);

function getEffectiveFreq(rawFreq: string | undefined, category: string | undefined): string | undefined {
  if (rawFreq !== 'custom') return rawFreq;
  if (!category) return 'custom';
  if (category === 'Sports') return 'daily';
  if (CUSTOM_ANNUAL_CATEGORIES.has(category)) return 'annual';
  if (CUSTOM_MONTHLY_CATEGORIES.has(category)) return 'monthly';
  return 'custom';
}

export interface TierSnapshot {
  date: string; // YYYY-MM-DD
  tier: number;
  prevTier: number;
  r30: number | null;
  consecutivePositive: number;
  moved: 'up' | 'down' | null;
  tradesToday: number;
  active: boolean; // true if new trades closed today (ladder evaluated)
}

export interface SeriesBacktest {
  series: string;
  frequency: string;
  firstTradeDate: string;
  currentTier: number;
  totalTrades: number;
  daysTracked: number;
  lastR30: number | null;
  history: TierSnapshot[];
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function ladderUp(tier: number): number {
  const idx = TIER_LADDER.indexOf(tier as Tier);
  if (idx === -1 || idx === TIER_LADDER.length - 1) return tier;
  return TIER_LADDER[idx + 1];
}

function ladderDown(tier: number): number {
  const idx = TIER_LADDER.indexOf(tier as Tier);
  if (idx === -1 || idx === 0) return tier;
  return TIER_LADDER[idx - 1];
}

/**
 * Backtest each per-event series (weekly/daily/hourly/fifteen_min) from its first trade to today.
 *
 * Rules:
 *   - Starter: days 1–3 pinned at 1¢ (tier 1), counter still accumulates
 *   - Day 4+: r30 ≥ 0 three days running → +1 level, counter resets
 *            r30 < 0 any day → -1 level, counter resets
 *            r30 is null (no trades in 30d window) → hold, counter unchanged
 *   - Clamped to ladder bounds [1, 200]
 */
export function backtestTiers(
  allMatchedTrades: MatchedTrade[],
  frequencyMap: Map<string, string>,
  categoryMap: Map<string, string>,
): Map<string, SeriesBacktest> {
  // Group trades by series
  const bySeries = new Map<string, MatchedTrade[]>();
  for (const t of allMatchedTrades) {
    const { series } = parseTickerComponents(t.Ticker);
    if (!bySeries.has(series)) bySeries.set(series, []);
    bySeries.get(series)!.push(t);
  }

  const result = new Map<string, SeriesBacktest>();
  const today = startOfDay(new Date());

  bySeries.forEach((trades, series) => {
    const rawFreq = frequencyMap.get(series);
    const category = categoryMap.get(series);
    const effectiveFreq = getEffectiveFreq(rawFreq, category);

    if (!effectiveFreq || !LADDER_FREQS.has(effectiveFreq)) return;

    // Sort trades by exit date ascending
    const sorted = [...trades].sort((a, b) => a.Exit_Date.getTime() - b.Exit_Date.getTime());
    const firstTradeDay = startOfDay(sorted[0].Exit_Date);

    // Pre-compute each trade's exit day (truncated) for window comparisons
    const tradeDays = sorted.map(t => startOfDay(t.Exit_Date));

    const totalDays = daysBetween(firstTradeDay, today);

    let tier = 1;
    let consecutive = 0;
    const history: TierSnapshot[] = [];

    // Two-pointer sliding 30-day window
    let leftIdx = 0;
    let rightIdx = 0;
    let sumPnl = 0;
    let sumCost = 0;

    for (let dayIdx = 0; dayIdx <= totalDays; dayIdx++) {
      const cursor = addDays(firstTradeDay, dayIdx);
      const windowStart = addDays(cursor, -29); // 30-day window inclusive of cursor

      const rightIdxBefore = rightIdx;
      // Add trades whose exit day is <= cursor
      while (rightIdx < sorted.length && tradeDays[rightIdx].getTime() <= cursor.getTime()) {
        sumPnl += sorted[rightIdx].Net_Profit;
        sumCost += sorted[rightIdx].Entry_Cost;
        rightIdx++;
      }
      const tradesToday = rightIdx - rightIdxBefore;
      // Remove trades whose exit day is < windowStart
      while (leftIdx < rightIdx && tradeDays[leftIdx].getTime() < windowStart.getTime()) {
        sumPnl -= sorted[leftIdx].Net_Profit;
        sumCost -= sorted[leftIdx].Entry_Cost;
        leftIdx++;
      }

      const r30 = sumCost > 0 ? sumPnl / sumCost : null;
      const active = tradesToday > 0; // only evaluate ladder on days with new trade evidence

      let moved: 'up' | 'down' | null = null;
      const prevTier = tier;

      if (active) {
        if (dayIdx < 3) {
          // Starter days 1–3: stay at 1¢, update counter
          if (r30 !== null) {
            if (r30 >= 0) consecutive += 1;
            else consecutive = 0;
          }
          // tier remains 1
        } else {
          // Day 4+: ladder active
          if (r30 !== null) {
            if (r30 < 0) {
              tier = ladderDown(tier);
              consecutive = 0;
            } else {
              consecutive += 1;
              if (consecutive >= 3) {
                tier = ladderUp(tier);
                consecutive = 0;
              }
            }
          }
          // r30 null → hold
        }
      }
      // inactive day → hold, no counter/tier change

      if (tier > prevTier) moved = 'up';
      else if (tier < prevTier) moved = 'down';

      history.push({
        date: dateKey(cursor),
        tier,
        prevTier,
        r30,
        consecutivePositive: consecutive,
        moved,
        tradesToday,
        active,
      });
    }

    const lastSnap = history[history.length - 1];
    result.set(series, {
      series,
      frequency: effectiveFreq,
      firstTradeDate: dateKey(firstTradeDay),
      currentTier: tier,
      totalTrades: sorted.length,
      daysTracked: history.length,
      lastR30: lastSnap ? lastSnap.r30 : null,
      history,
    });
  });

  return result;
}

/**
 * Summarize how many series landed at each tier.
 */
export function summarizeTierDistribution(
  backtest: Map<string, SeriesBacktest>,
): { tier: number; count: number; series: string[] }[] {
  const buckets = new Map<number, string[]>();
  TIER_LADDER.forEach(t => buckets.set(t, []));

  backtest.forEach(bt => {
    const arr = buckets.get(bt.currentTier) ?? [];
    arr.push(bt.series);
    buckets.set(bt.currentTier, arr);
  });

  return TIER_LADDER.map(tier => ({
    tier,
    count: buckets.get(tier)!.length,
    series: buckets.get(tier)!.sort(),
  }));
}

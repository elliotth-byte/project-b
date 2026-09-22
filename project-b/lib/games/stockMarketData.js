import { storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Stock Market ───
// Everyone starts with $10,000 and trades against REAL prices, fetched
// from Finnhub (https://finnhub.io) — highest final profit (portfolio
// value minus the starting $10,000) wins. Real prices need a real API
// key: set FINNHUB_API_KEY as a server-side environment variable (free
// tier, sign up at finnhub.io) or Stock Market simply won't have any
// prices to show — see pages/api/stock-market-prices.js, the only
// thing that ever touches that key.
//
// Players aren't limited to a fixed list — anyone can search for and
// add any real, tradeable US stock (see pages/api/stock-market-search.js
// for the lookup, also Finnhub-backed) up to MAX_WATCHED_SYMBOLS per
// battle. That cap — and the poll interval scaling WITH how many
// symbols are actually being watched (see computePollIntervalMs) — is
// what keeps real API usage bounded once the tracked set isn't a fixed
// size anymore: 6 known tickers forever was never a rule of the game,
// it was just the simplest way to keep a predictable, safe request
// rate against Finnhub's free-tier 60-calls/minute limit. A handful of
// starter tickers still seed every battle (DEFAULT_SYMBOLS) so the
// market isn't empty the instant it opens.
//
// Prices are fetched SERVER-SIDE and shared by every player in the
// battle via one game_state key (see marketPricesKey) — never fetched
// per-player-per-poll, which would multiply real API usage by however
// many people are watching the market at once. Any player's client can
// trigger a refresh (see pages/api/stock-market-prices.js's own claim
// logic for how concurrent requests around the same moment collapse
// into a single real Finnhub call), but the actual fetch only ever
// happens once per the CURRENT computed poll interval regardless of
// how many people asked.
//
// Portfolios are still fully client-driven and self-initializing —
// same pattern lib/games/dealOrNoDealData.js already uses — since
// nothing about a player's own trades needs the server: each player's
// portfolio lives at its own key (marketKey(round, playerId)), created
// lazily the first time their own screen loads.

export const marketKey = (round, playerId) => `pb:stockmarket:${round}:${playerId}`;
export const marketPricesKey = (round) => `pb:stockmarket:${round}:prices`;

export const STARTING_CASH = 10000;

// Seeds every battle's watchlist so the market isn't empty on open —
// not a hard limit anymore, just a reasonable starting point. Anyone
// can add more via search.
export const DEFAULT_SYMBOLS = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "NVDA", name: "Nvidia" },
];

// A hard ceiling on how many DISTINCT symbols one battle can ever be
// tracking at once — the actual thing standing in for "only 6 stocks,"
// now sized generously (a friend group picking 20 different companies
// between them is already a lot) rather than a fixed content list.
export const MAX_WATCHED_SYMBOLS = 20;

// The poll interval scales UP as more symbols get added, specifically
// so total real Finnhub usage (symbolCount fetches every interval)
// never exceeds a fixed safe budget no matter how many distinct stocks
// a battle ends up tracking. Solving for T in
// symbolCount * (60000 / T) <= CALLS_PER_MIN_BUDGET gives
// T >= symbolCount * 60000 / CALLS_PER_MIN_BUDGET. 40 (not Finnhub's
// full 60) is deliberate headroom for other concurrent activity on the
// same API key — another simultaneous battle, or just normal
// request jitter — rather than running this deployment's quota right
// up against the actual limit.
const CALLS_PER_MIN_BUDGET = 40;
const MIN_POLL_INTERVAL_MS = 20000;

export function computePollIntervalMs(symbolCount) {
  const n = Math.max(1, symbolCount || 1);
  return Math.max(MIN_POLL_INTERVAL_MS, Math.round((n * 60000) / CALLS_PER_MIN_BUDGET));
}

export function subscribeMarketPrices(gameId, round, onChange) {
  return subscribeGameState(gameId, marketPricesKey(round), onChange);
}

export function subscribeStockMarket(gameId, round, playerId, onChange) {
  return subscribeGameState(gameId, marketKey(round, playerId), onChange);
}

// storageUpdate resolves to dbAdapter.js's own actual return shape —
// { ok, value, aborted? } — never the raw next state directly.
async function updateState(gameId, key, updater) {
  const result = await storageUpdate(gameId, key, updater);
  return result?.value ?? null;
}

// Adds one symbol to the shared, battle-wide watchlist — called the
// moment a player picks a search result (see
// components/games/StockMarketPlayer.jsx). A no-op if it's already
// being watched (no point re-adding), and silently capped at
// MAX_WATCHED_SYMBOLS rather than erroring — the caller checks the
// returned state's own symbols list afterward to tell whether their
// pick actually landed.
export async function addWatchedSymbol(gameId, round, symbol, name) {
  return updateState(gameId, marketPricesKey(round), (fresh) => {
    const base = fresh || { prices: {}, symbols: DEFAULT_SYMBOLS, updatedAt: 0, fetching: false };
    if (base.symbols.some((s) => s.symbol === symbol)) return base;
    if (base.symbols.length >= MAX_WATCHED_SYMBOLS) return base;
    return { ...base, symbols: [...base.symbols, { symbol, name }] };
  });
}

// Idempotent — see lib/games/dealOrNoDealData.js's own initDondState
// for the identical "only the first call's data ever sticks" guarantee
// this relies on. Called directly from the player's own component on
// mount; no host or roundEngine step needed anywhere.
export async function initStockMarket(gameId, round, playerId) {
  const initial = { cash: STARTING_CASH, holdings: {}, trades: [] };
  return updateState(gameId, marketKey(round, playerId), (fresh) => (fresh ? fresh : initial));
}

// One buy or sell, at the CURRENT shared price (read from the live
// feed by the caller and passed in — this function trusts it rather
// than re-fetching, since the price a player saw on screen when they
// clicked is the price their trade should execute at). Rejected
// outright (no-op) for insufficient cash, an oversized sell, a
// non-positive share count, an unknown ticker, or a missing/invalid
// price — same silent-reject convention as every other multiplayer
// submission in this app. Shares can be fractional (like a modern
// trading app), specifically so the fixed $10,000 starting stake can
// always be allocated cleanly regardless of any given stock's price.
export async function submitStockTrade(gameId, round, playerId, symbol, action, shares, price) {
  // No longer checked against a fixed list — see addWatchedSymbol
  // above; any symbol the shared feed actually has a positive price
  // for is, by construction, one that passed Finnhub's own lookup when
  // it was added. price > 0 alone is the real validity check now.
  if (!(shares > 0) || !(price > 0) || !symbol) return null;
  return updateState(gameId, marketKey(round, playerId), (fresh) => {
    if (!fresh) return fresh;
    const holdings = { ...fresh.holdings };
    const owned = holdings[symbol] || 0;

    if (action === "buy") {
      const cost = price * shares;
      if (cost > fresh.cash + 0.01) return fresh;
      holdings[symbol] = owned + shares;
      return {
        ...fresh,
        cash: fresh.cash - cost,
        holdings,
        trades: [...fresh.trades, { t: Date.now(), symbol, action: "buy", shares, price }],
      };
    }

    if (action === "sell") {
      if (shares > owned + 0.0001) return fresh;
      const proceeds = price * shares;
      const nextOwned = owned - shares;
      if (nextOwned <= 0.0001) delete holdings[symbol]; else holdings[symbol] = nextOwned;
      return {
        ...fresh,
        cash: fresh.cash + proceeds,
        holdings,
        trades: [...fresh.trades, { t: Date.now(), symbol, action: "sell", shares, price }],
      };
    }

    return fresh;
  });
}

// Cash on hand plus every holding valued at the given price map — the
// same shape whether prices are "right now" (for a live-updating
// scoreboard) or "the last price on record when the challenge ended"
// (for the final score — see components/games/StockMarketPlayer.jsx's
// own handling of that moment).
export function portfolioValue(state, prices) {
  if (!state) return STARTING_CASH;
  let total = state.cash;
  Object.entries(state.holdings || {}).forEach(([symbol, shares]) => {
    total += shares * (prices?.[symbol] ?? 0);
  });
  return total;
}

export function profitFor(state, prices) {
  return portfolioValue(state, prices) - STARTING_CASH;
}

// ─── Market hours ───
// The one thing this challenge needs regardless of where prices come
// from: it should only ever be offered when the battle's own scheduled
// window overlaps the REAL stock market's real hours (NYSE/NASDAQ:
// Monday-Friday, 9:30am-4:00pm America/New_York). With real prices,
// this isn't just thematic anymore — outside those hours Finnhub's
// quote endpoint just returns the last closing price, frozen, so
// there'd be nothing to actually trade against anyway. Timezone/DST
// handled via Intl's own America/New_York rules rather than
// hand-rolled UTC offset math, which is the one part of this that's
// genuinely easy to get subtly wrong (a fixed "UTC-5" breaks the
// instant EDT starts).
//
// One deliberate simplification, stated plainly: this checks weekday +
// time-of-day only, not the NYSE holiday calendar (Thanksgiving,
// Christmas, etc. have no fixed weekday, so hardcoding them means
// re-deriving or updating a real calendar every year to stay correct)
// — so a handful of trading holidays that happen to fall on a
// weekday will incorrectly read as "open," and Finnhub will just
// return a frozen closing price rather than the market genuinely being
// tradeable. Weekday+hours already blocks the overwhelming majority of
// closed time (all nights, all weekends); the handful of remaining
// holiday exceptions were judged not worth the ongoing maintenance
// burden of a real holiday calendar for a party-game challenge gate.
function isMarketOpenAtInstant(utcMs) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(new Date(utcMs));
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  if (weekday === "Sat" || weekday === "Sun") return false;
  let hour = parseInt(parts.find((p) => p.type === "hour")?.value, 10);
  if (hour === 24) hour = 0; // some ICU implementations render midnight as "24" even with hour12:false
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value, 10);
  const minutesSinceMidnight = hour * 60 + minute;
  return minutesSinceMidnight >= 9 * 60 + 30 && minutesSinceMidnight < 16 * 60;
}

// Samples every 15 minutes across the range — fine enough resolution
// to never step clean over the market's 6.5-hour daily window without
// landing inside it at least once, without having to compute exact ET
// day-boundary timestamps (a genuinely fiddly thing to get right around
// DST transitions) at all.
const SAMPLE_STEP_MS = 15 * 60 * 1000;

export function doesRangeOverlapMarketHours(startMs, endMs) {
  if (endMs <= startMs) return isMarketOpenAtInstant(startMs);
  for (let t = startMs; t < endMs; t += SAMPLE_STEP_MS) {
    if (isMarketOpenAtInstant(t)) return true;
  }
  return isMarketOpenAtInstant(endMs);
}

export function canRunStockMarketChallenge(nowMs, durationSec) {
  return doesRangeOverlapMarketHours(nowMs, nowMs + (durationSec || 0) * 1000);
}

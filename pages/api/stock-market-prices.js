import { createClient } from "@supabase/supabase-js";
import { makeDb } from "../../lib/dbAdapter";
import { DEFAULT_SYMBOLS, marketPricesKey, computePollIntervalMs, MAX_WATCHED_SYMBOLS } from "../../lib/games/stockMarketData";

// ============================================================
// The only thing in this whole app that ever touches
// process.env.FINNHUB_API_KEY — a server-only secret, never sent to
// the browser. Any player's client can POST here (see
// components/games/StockMarketPlayer.jsx's own polling effect), but
// the ACTUAL Finnhub call only happens once every (dynamically
// computed — see computePollIntervalMs) interval regardless of how
// many players are polling or how often: whichever request's atomic
// claim on the shared price key lands first this window does the real
// fetch and writes the result for everyone; every other request in
// that same window just reads back whatever's already there. This is
// what keeps real API usage flat — and safely bounded even as players
// add more symbols to watch — no matter how many people are watching
// the market, on a provider whose free tier is a real, finite rate
// limit (Finnhub: 60 requests/min; this deployment budgets itself to
// 40, see stockMarketData.js's own comment on why).
//
// Requires the caller to be an approved player in the game — same
// auth pattern pages/api/chaos-draw.js already uses — mainly so a
// stray unauthenticated request can't spend this deployment's Finnhub
// quota for no reason.
// ============================================================

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { gameId, round } = req.body || {};
  if (!gameId || !round) return res.status(400).json({ error: "Missing gameId or round." });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Missing auth token." });

  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData?.user) return res.status(401).json({ error: "Invalid session." });

  const { data: me } = await userClient.from("players").select("id, approved").eq("game_id", gameId).eq("user_id", userData.user.id).maybeSingle();
  if (!me || !me.approved) return res.status(403).json({ error: "Not an approved player in this game." });

  if (!process.env.FINNHUB_API_KEY) {
    return res.status(200).json({ prices: {}, symbols: DEFAULT_SYMBOLS, updatedAt: 0, error: "Stock Market needs FINNHUB_API_KEY configured on this deployment — see finnhub.io for a free key." });
  }

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const db = makeDb(adminClient);
  const key = marketPricesKey(round);
  const now = Date.now();

  // Atomic claim: writes a "fetching, as of now" marker ONLY if the
  // existing data (if any) is stale enough — relative to THIS state's
  // own current symbol count, since the safe poll interval gets longer
  // as more symbols are being watched (see computePollIntervalMs) —
  // to be worth refreshing. dbAdapter.js's own optimistic-concurrency
  // retry loop is what guarantees that of several near-simultaneous
  // requests, only one actually gets a version bump through with THIS
  // exact `now` — everyone else's attempt reads the just-updated (now
  // fresh) data first and correctly no-ops instead.
  const claim = await db.update(gameId, key, (fresh) => {
    const base = fresh || { prices: {}, symbols: DEFAULT_SYMBOLS, updatedAt: 0, fetching: false };
    const pollIntervalMs = computePollIntervalMs(base.symbols.length);
    if (now - base.updatedAt < pollIntervalMs && !base.fetching) return base;
    if (base.fetching && now - base.updatedAt < 15000) return base; // another request's fetch is already in flight (and not stale/stuck) — don't pile on
    return { ...base, updatedAt: now, fetching: true };
  });

  const won = claim.ok && claim.value?.fetching && claim.value.updatedAt === now;
  const symbols = (claim.value?.symbols || DEFAULT_SYMBOLS).slice(0, MAX_WATCHED_SYMBOLS);
  if (!won) {
    return res.status(200).json({ prices: claim.value?.prices || {}, symbols, updatedAt: claim.value?.updatedAt || 0 });
  }

  try {
    const results = await Promise.all(symbols.map(async (t) => {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(t.symbol)}&token=${process.env.FINNHUB_API_KEY}`);
      if (!r.ok) return [t.symbol, null];
      const data = await r.json();
      // Finnhub's /quote shape: c = current price, pc = previous close.
      // A quote of exactly 0 means Finnhub has nothing for this symbol
      // right now (bad symbol, or a rare provider hiccup) — falls back
      // to whatever price was already on record rather than ever
      // writing an obviously-wrong $0 a player could trade against.
      return [t.symbol, data?.c > 0 ? data.c : null];
    }));

    const nextPrices = { ...(claim.value.prices || {}) };
    results.forEach(([symbol, price]) => { if (price) nextPrices[symbol] = price; });

    const finalState = { prices: nextPrices, symbols: claim.value.symbols, updatedAt: Date.now(), fetching: false };
    await db.set(gameId, key, finalState);
    return res.status(200).json(finalState);
  } catch (err) {
    // Release the claim on failure so the NEXT request retries soon,
    // rather than leaving every future request thinking a fetch is
    // permanently in flight because Finnhub (or the network) hiccuped.
    const released = { prices: claim.value.prices || {}, symbols: claim.value.symbols, updatedAt: 0, fetching: false };
    await db.set(gameId, key, released);
    return res.status(502).json({ error: "Couldn't reach Finnhub.", prices: released.prices, symbols: released.symbols, updatedAt: 0 });
  }
}

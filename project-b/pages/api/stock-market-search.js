import { createClient } from "@supabase/supabase-js";

// ============================================================
// Symbol lookup for the "add your own stock" picker (see
// components/games/StockMarketPlayer.jsx) — Finnhub's own /search
// endpoint, server-side only, same reasoning as
// pages/api/stock-market-prices.js for why FINNHUB_API_KEY never
// reaches the browser. Deliberately doesn't touch game_state at all
// (a search is a stateless lookup, not a game action) — adding the
// chosen result to the actual shared watchlist is a separate call
// (lib/games/stockMarketData.js's addWatchedSymbol), triggered only
// once the player picks something from these results.
// ============================================================

const MAX_RESULTS = 8;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { gameId, query } = req.body || {};
  const q = (query || "").trim();
  if (!gameId || q.length < 1) return res.status(400).json({ error: "Missing gameId or query." });

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
    return res.status(200).json({ results: [], error: "Stock Market needs FINNHUB_API_KEY configured on this deployment." });
  }

  try {
    const r = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${process.env.FINNHUB_API_KEY}`);
    if (!r.ok) return res.status(502).json({ error: "Couldn't reach Finnhub.", results: [] });
    const data = await r.json();
    // Finnhub's own result shape: { symbol, description, type, ... } —
    // narrowed to plain common stock specifically so search results
    // aren't cluttered with warrants, preferred shares, and other
    // instrument types a casual player has no reason to expect here.
    // Falls back to showing whatever came back, unfiltered, if `type`
    // is ever missing from a result — better an occasional odd entry
    // than search silently returning nothing.
    const results = (data?.result || [])
      .filter((r) => !r.type || r.type === "Common Stock")
      .slice(0, MAX_RESULTS)
      .map((r) => ({ symbol: r.symbol, name: r.description || r.symbol }));
    return res.status(200).json({ results });
  } catch (err) {
    return res.status(502).json({ error: "Couldn't reach Finnhub.", results: [] });
  }
}

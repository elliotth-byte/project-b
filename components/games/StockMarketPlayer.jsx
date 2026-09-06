import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";
import { supabase } from "../../lib/supabaseClient";
import {
  DEFAULT_SYMBOLS, MAX_WATCHED_SYMBOLS, STARTING_CASH, portfolioValue, profitFor,
  subscribeStockMarket, subscribeMarketPrices, initStockMarket, submitStockTrade, addWatchedSymbol,
} from "../../lib/games/stockMarketData";

// How often THIS client asks the server to refresh prices — doesn't
// need to match the server's own dynamically-computed poll interval
// exactly (see lib/games/stockMarketData.js's computePollIntervalMs);
// the server enforces the real throttling regardless of how often any
// individual client checks in. This just needs to be frequent enough
// that at least one of however many players are watching keeps the
// feed alive.
const CLIENT_POLL_MS = 8000;

// ─── Stock Market ───
// $10,000 to trade real companies for the length of the battle, priced
// from Finnhub (see lib/games/stockMarketData.js and
// pages/api/stock-market-prices.js for the full data-flow). Players
// aren't limited to the starter list — search adds any real, tradeable
// stock to the whole battle's shared watchlist, up to
// MAX_WATCHED_SYMBOLS. Highest final profit wins.
export default function StockMarketPlayer({ gameId, round, challenge, player }) {
  const { timeUp } = useCountdown(challenge?.endsAt);
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [priceState, setPriceState] = useState(null);
  const [priceError, setPriceError] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [shareInput, setShareInput] = useState("");
  const [tab, setTab] = useState("buy"); // "buy" | "sell"
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const reportedRef = useRef(false);
  const lastFinalPricesRef = useRef({});

  useEffect(() => {
    const unsubscribe = subscribeStockMarket(gameId, round.round, player.id, (v) => { setState(v); setLoaded(true); });
    return unsubscribe;
  }, [gameId, round.round, player.id]);

  useEffect(() => {
    const unsubscribe = subscribeMarketPrices(gameId, round.round, setPriceState);
    return unsubscribe;
  }, [gameId, round.round]);

  useEffect(() => {
    if (!state && loaded) initStockMarket(gameId, round.round, player.id);
  }, [state, loaded, gameId, round.round, player.id]);

  const requestPriceRefresh = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return null;
      const res = await fetch("/api/stock-market-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gameId, round: round.round }),
      });
      return res.json();
    } catch {
      return null; // a single failed poll isn't worth surfacing — the next interval (or another player's) tries again
    }
  };

  // Asks the server to refresh the shared price feed — a no-op most of
  // the time (see pages/api/stock-market-prices.js's own claim logic),
  // so it's safe for every player's client to do this independently on
  // its own interval without multiplying real Finnhub usage.
  useEffect(() => {
    if (timeUp) return;
    let cancelled = false;
    const poll = async () => {
      const body = await requestPriceRefresh();
      if (cancelled || !body) return;
      if (body.error && (!body.prices || Object.keys(body.prices).length === 0)) setPriceError(body.error);
      else setPriceError(null);
    };
    poll();
    const interval = window.setInterval(poll, CLIENT_POLL_MS);
    return () => { cancelled = true; window.clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, round.round, timeUp]);

  const watchlist = priceState?.symbols || DEFAULT_SYMBOLS;
  const prices = priceState?.prices || {};
  const havePrices = Object.keys(prices).length > 0;
  if (havePrices) lastFinalPricesRef.current = prices; // last real prices seen, used to value the portfolio the instant time runs out

  useEffect(() => {
    if (!selectedSymbol && watchlist.length > 0) setSelectedSymbol(watchlist[0].symbol);
  }, [selectedSymbol, watchlist]);

  const liveProfit = state ? profitFor(state, prices) : 0;
  const finalProfit = state ? profitFor(state, lastFinalPricesRef.current) : 0;

  useEffect(() => {
    if (!state || !havePrices) return;
    reportScore(gameId, round.round, player.id, player.name, Math.round(liveProfit), { final: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.cash, JSON.stringify(state?.holdings), havePrices]);

  useEffect(() => {
    if (timeUp && state && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, Math.round(finalProfit), { final: true });
    }
  }, [timeUp, state, finalProfit]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      const res = await fetch("/api/stock-market-search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gameId, query: q }),
      });
      const body = await res.json();
      if (body.error) setSearchError(body.error);
      setSearchResults(body.results || []);
    } catch {
      setSearchError("Couldn't search right now — try again.");
    }
    setSearching(false);
  };

  const addAndSelect = async (result) => {
    const next = await addWatchedSymbol(gameId, round.round, result.symbol, result.name);
    if (!next?.symbols.some((s) => s.symbol === result.symbol)) {
      setSearchError(`The watchlist is full (max ${MAX_WATCHED_SYMBOLS} stocks) — trade one already being watched instead.`);
      return;
    }
    setSelectedSymbol(result.symbol);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    requestPriceRefresh(); // get this new symbol its first price without waiting for the next interval
  };

  if (timeUp) {
    const value = state ? portfolioValue(state, lastFinalPricesRef.current) : STARTING_CASH;
    return (
      <GameResultCard
        icon="📈"
        title="Market Closed"
        valueLabel={`${finalProfit >= 0 ? "+" : ""}$${finalProfit.toFixed(2)} (portfolio: $${value.toFixed(2)})`}
      />
    );
  }
  if (!state) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }
  if (priceError) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>📈</div>
        <p style={{ color: "#ff3860", fontSize: 13, fontWeight: 700, margin: 0 }}>{priceError}</p>
      </Card>
    );
  }
  if (!havePrices) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Fetching live prices...</p></Card>;
  }

  const owned = state.holdings[selectedSymbol] || 0;
  const price = prices[selectedSymbol];
  const shares = parseFloat(shareInput) || 0;
  const stock = watchlist.find((s) => s.symbol === selectedSymbol) || { symbol: selectedSymbol, name: selectedSymbol };
  const maxAffordable = price > 0 ? Math.floor((state.cash / price) * 100) / 100 : 0;
  const atCap = watchlist.length >= MAX_WATCHED_SYMBOLS;

  const doTrade = () => {
    if (shares <= 0 || !price) return;
    submitStockTrade(gameId, round.round, player.id, selectedSymbol, tab, shares, price);
    setShareInput("");
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>📈 Stock Market</h3>
        <Badge color={liveProfit >= 0 ? "#00ff9d" : "#ff3860"}>{liveProfit >= 0 ? "+" : ""}${liveProfit.toFixed(2)}</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>
        Cash: ${state.cash.toFixed(2)} · Real prices, real market — this is genuine money you don't have, not a tip.
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5 }}>Watchlist ({watchlist.length}/{MAX_WATCHED_SYMBOLS})</span>
        <button
          onClick={() => setSearchOpen((v) => !v)}
          style={{ background: "none", border: "1px solid #3d1f5c", borderRadius: 6, color: "#a68fd6", fontSize: 11, padding: "3px 10px", cursor: "pointer" }}
        >
          {searchOpen ? "Close" : "+ Add stock"}
        </button>
      </div>

      {searchOpen && (
        <div style={{ background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: 10, marginBottom: 10 }}>
          {atCap ? (
            <p style={{ color: "#ff9f4d", fontSize: 12, margin: 0 }}>Watchlist is full ({MAX_WATCHED_SYMBOLS} stocks) — trade one already being watched instead.</p>
          ) : (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  placeholder="Search by name or symbol..."
                  style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid #3d1f5c", background: "#150a28", color: "#f5f0ff", fontSize: 13 }}
                />
                <button onClick={runSearch} disabled={searching} style={{ padding: "8px 14px", borderRadius: 6, background: "#ff2d95", border: "none", color: "#05010f", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  {searching ? "..." : "Search"}
                </button>
              </div>
              {searchError && <p style={{ color: "#ff3860", fontSize: 11, margin: "0 0 6px" }}>{searchError}</p>}
              <div style={{ display: "grid", gap: 4 }}>
                {searchResults.map((r) => (
                  <button
                    key={r.symbol}
                    onClick={() => addAndSelect(r)}
                    disabled={watchlist.some((w) => w.symbol === r.symbol)}
                    style={{
                      display: "flex", justifyContent: "space-between", padding: "6px 10px", borderRadius: 6,
                      background: "#150a28", border: "1px solid #3d1f5c", color: "#f5f0ff", fontSize: 12,
                      cursor: watchlist.some((w) => w.symbol === r.symbol) ? "default" : "pointer",
                      opacity: watchlist.some((w) => w.symbol === r.symbol) ? 0.5 : 1,
                    }}
                  >
                    <span>{r.name}</span>
                    <span style={{ color: "#a68fd6" }}>{r.symbol}{watchlist.some((w) => w.symbol === r.symbol) ? " · watching" : ""}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
        {watchlist.map((s) => {
          const held = state.holdings[s.symbol] || 0;
          const isSelected = s.symbol === selectedSymbol;
          const currentPrice = prices[s.symbol];
          return (
            <button
              key={s.symbol}
              onClick={() => setSelectedSymbol(s.symbol)}
              disabled={!currentPrice}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 12px", borderRadius: 8, cursor: currentPrice ? "pointer" : "default", textAlign: "left",
                background: isSelected ? "rgba(255,45,149,0.12)" : "#0d0618",
                border: `1px solid ${isSelected ? "#ff2d95" : "#3d1f5c"}`,
                opacity: currentPrice ? 1 : 0.5,
              }}
            >
              <span style={{ color: "#f5f0ff", fontSize: 13, fontWeight: 700 }}>{s.name} <span style={{ color: "#6b4f99", fontSize: 11 }}>{s.symbol}</span></span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {held > 0 && <span style={{ color: "#a68fd6", fontSize: 11 }}>{held} sh</span>}
                <span style={{ color: "#00d9ff", fontSize: 13, fontWeight: 700 }}>{currentPrice ? `$${currentPrice.toFixed(2)}` : "—"}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ background: "#0d0618", borderRadius: 10, padding: 12, border: "1px solid #3d1f5c" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button onClick={() => setTab("buy")} style={{
            flex: 1, padding: "8px 0", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 13,
            background: tab === "buy" ? "linear-gradient(135deg, #00ff9d, #00d9ff)" : "transparent",
            color: tab === "buy" ? "#05010f" : "#a68fd6", border: `1px solid ${tab === "buy" ? "transparent" : "#3d1f5c"}`,
          }}>Buy</button>
          <button onClick={() => setTab("sell")} style={{
            flex: 1, padding: "8px 0", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 13,
            background: tab === "sell" ? "linear-gradient(135deg, #ff3860, #ff2d95)" : "transparent",
            color: tab === "sell" ? "#05010f" : "#a68fd6", border: `1px solid ${tab === "sell" ? "transparent" : "#3d1f5c"}`,
          }}>Sell</button>
        </div>
        <p style={{ color: "#a68fd6", fontSize: 11, margin: "0 0 6px" }}>
          {stock.name} @ {price ? `$${price.toFixed(2)}` : "—"} — {tab === "buy" ? `can afford up to ${maxAffordable} sh` : `you own ${owned} sh`}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number" min="0" step="0.01" value={shareInput}
            onChange={(e) => setShareInput(e.target.value)}
            placeholder="Shares"
            style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid #3d1f5c", background: "#150a28", color: "#f5f0ff", fontSize: 13 }}
          />
          <button
            onClick={doTrade}
            disabled={shares <= 0 || !price || (tab === "buy" && shares > maxAffordable) || (tab === "sell" && shares > owned)}
            style={{
              padding: "8px 18px", borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: "pointer",
              background: shares > 0 ? "linear-gradient(135deg, #ff2d95, #b829ff)" : "#3d1f5c",
              color: shares > 0 ? "#05010f" : "#a68fd6", border: "none",
            }}
          >
            {tab === "buy" ? "Buy" : "Sell"}
          </button>
        </div>
      </div>
    </Card>
  );
}

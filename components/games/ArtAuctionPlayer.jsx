import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import { reportScore } from "../../lib/challengeScores";
import {
  subscribeArtAuction, submitPainting, submitBid,
  autoOpenBiddingIfDue, autoResolveAuctionIfDue, placementValue, STARTING_BUDGET,
} from "../../lib/games/artAuctionData";

const CANVAS_SIZE = 280;
const COLORS = ["#1a1a2e", "#ff3860", "#ff9f4d", "#ffd93d", "#00ff9d", "#00d9ff", "#7c4dff", "#ff2d95"];
const BRUSH_SIZES = [{ label: "Thin", value: 3 }, { label: "Thick", value: 9 }];

// ─── Art Auction ───
// See lib/games/artAuctionData.js for the full rules and the reasoning
// behind every design choice here — this file is purely presentation:
// a small canvas for the painting phase, a lot gallery + bid controls
// for the bidding phase, and a full reveal at the end.
export default function ArtAuctionPlayer({ gameId, round, challenge, player, players }) {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [, forceTick] = useState(0);
  const reportedRef = useRef(false);

  // ─── Painting canvas ───
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [color, setColor] = useState(COLORS[0]);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[0].value);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeArtAuction(gameId, round.round, (v) => { setState(v); setLoaded(true); });
    return unsubscribe;
  }, [gameId, round.round]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || hasDrawn) return; // don't wipe an in-progress drawing on an unrelated re-render
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }, [state?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const byName = (id) => players?.find((p) => p.id === id)?.display_name || "?";

  // Same adaptive-poll reasoning as components/games/MusicalChairsPlayer.jsx
  // — this app's challenges range from live minutes to async hours, so a
  // flat fast interval would either feel sluggish or hammer the database
  // for no reason depending on which end you're on.
  useEffect(() => {
    if (!state || (state.phase !== "painting" && state.phase !== "bidding")) return;
    let timeoutId;
    const tick = () => {
      forceTick((t) => t + 1);
      if (state.phase === "painting") autoOpenBiddingIfDue(gameId, round.round);
      else autoResolveAuctionIfDue(gameId, round.round);
      const deadline = state.phase === "painting" ? state.paintingEndsAt : state.biddingEndsAt;
      const msRemaining = Math.max(0, (deadline || 0) - Date.now());
      timeoutId = window.setTimeout(tick, Math.max(400, Math.min(30000, msRemaining / 10)));
    };
    tick();
    return () => window.clearTimeout(timeoutId);
  }, [gameId, round.round, state?.phase, state?.paintingEndsAt, state?.biddingEndsAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state || reportedRef.current) return;
    if (state.phase === "revealed") {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) return null;
  if (state === null && !loaded) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }
  if (state === null && loaded) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🎨</div>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d" }}>Not Enough Players</div>
        <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 10, fontStyle: "italic" }}>Art Auction needs at least 2 players.</p>
      </Card>
    );
  }

  // ─── Revealed ───
  if (state.phase === "revealed") {
    const myPlacement = state.placements?.[player.id];
    const ranking = [...state.participantIds].sort((a, b) => placementValue(state, b) - placementValue(state, a));
    return (
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎨 Art Auction — Closed</h3>
          <Badge>{myPlacement?.piecesWon || 0} won</Badge>
        </div>
        {state.timedOut && (
          <p style={{ color: "#a68fd6", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>Time ran out — the auction closed with whatever bids were on record.</p>
        )}
        <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
          {state.lotOrder.map((artistId, i) => {
            const result = state.results[artistId];
            return (
              <div key={artistId} style={{ display: "flex", gap: 10, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={state.submissions[artistId].dataUrl} alt="" style={{ width: 60, height: 60, borderRadius: 6, objectFit: "cover", background: "#fff" }} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 12, color: "#a68fd6" }}>Lot {i + 1} — painted by <strong style={{ color: "#f5f0ff" }}>{byName(artistId)}</strong></p>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: result ? "#00ff9d" : "#6b4f99", fontWeight: 700 }}>
                    {result ? `Sold to ${byName(result.winnerId)} for $${result.amount}` : "Went unsold"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {ranking.map((id) => {
            const p = state.placements[id];
            return (
              <div key={id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: id === player.id ? "rgba(255,45,149,0.12)" : "#0d0618",
                border: `1px solid ${id === player.id ? "#ff2d95" : "#3d1f5c"}`, borderRadius: 6, padding: "8px 12px",
              }}>
                <span style={{ fontSize: 13, color: "#f5f0ff" }}>{byName(id)} — {p.piecesWon} piece{p.piecesWon === 1 ? "" : "s"}</span>
                <span style={{ fontSize: 11, color: "#a68fd6" }}>${p.leftoverCash} left + ${p.saleProceeds} from sales</span>
              </div>
            );
          })}
        </div>
      </Card>
    );
  }

  // ─── Painting ───
  if (state.phase === "painting") {
    const iHaveSubmitted = !!state.submissions[player.id];
    if (iHaveSubmitted) {
      const stillWaitingOn = state.participantIds.filter((id) => !state.submissions[id]).length;
      return (
        <Card style={{ marginBottom: 20, textAlign: "center" }}>
          <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎨 Art Auction</h3>
          <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
            Painting submitted! Waiting on {stillWaitingOn} more player{stillWaitingOn === 1 ? "" : "s"} (or the timer) before the auction opens.
          </p>
        </Card>
      );
    }

    const toPoint = (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = CANVAS_SIZE / rect.width, scaleY = CANVAS_SIZE / rect.height;
      const touch = e.touches?.[0];
      const clientX = touch ? touch.clientX : e.clientX;
      const clientY = touch ? touch.clientY : e.clientY;
      return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    };
    const startDraw = (e) => { drawingRef.current = true; lastPointRef.current = toPoint(e); };
    const moveDraw = (e) => {
      if (!drawingRef.current) return;
      if (e.touches) e.preventDefault();
      const p = toPoint(e);
      const ctx = canvasRef.current.getContext("2d");
      ctx.strokeStyle = color; ctx.lineWidth = brushSize; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastPointRef.current = p;
      setHasDrawn(true);
    };
    const endDraw = () => { drawingRef.current = false; lastPointRef.current = null; };
    const clearCanvas = () => {
      const ctx = canvasRef.current.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      setHasDrawn(false);
    };
    const submit = () => {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      submitPainting(gameId, round.round, player.id, dataUrl);
    };

    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 4px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎨 Paint Something</h3>
        <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>Nobody will know it's yours until the auction closes.</p>
        <canvas
          ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE}
          onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={endDraw}
          style={{ width: "100%", maxWidth: CANVAS_SIZE, height: "auto", aspectRatio: "1", borderRadius: 10, border: "2px solid #3d1f5c", touchAction: "none", display: "block", margin: "0 auto 10px", cursor: "crosshair" }}
        />
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 8 }}>
          {COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} style={{
              width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer",
              border: color === c ? "3px solid #f5f0ff" : "2px solid rgba(255,255,255,0.3)",
            }} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 12 }}>
          {BRUSH_SIZES.map((b) => (
            <button key={b.value} onClick={() => setBrushSize(b.value)} style={{
              padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12,
              background: brushSize === b.value ? "rgba(255,45,149,0.15)" : "transparent",
              border: `1px solid ${brushSize === b.value ? "#ff2d95" : "#3d1f5c"}`,
              color: brushSize === b.value ? "#ff2d95" : "#a68fd6",
            }}>{b.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={clearCanvas} style={{ background: "none", border: "1px solid #3d1f5c", borderRadius: 8, color: "#a68fd6", fontSize: 13, padding: "10px 18px", cursor: "pointer" }}>Clear</button>
          <button onClick={submit} disabled={!hasDrawn} style={{
            padding: "10px 22px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: hasDrawn ? "pointer" : "default",
            background: hasDrawn ? "linear-gradient(135deg, #ff2d95, #b829ff)" : "#3d1f5c",
            color: hasDrawn ? "#05010f" : "#a68fd6", border: "none",
          }}>Submit Painting</button>
        </div>
      </Card>
    );
  }

  // ─── Bidding ───
  const myBids = state.bids[player.id] || {};
  const myBidTotal = Object.values(myBids).reduce((sum, v) => sum + v, 0);
  const remainingBudget = STARTING_BUDGET - myBidTotal;

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎨 Silent Auction</h3>
        <Badge>${remainingBudget} left</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 12px", fontStyle: "italic" }}>
        Bids are sealed — nobody sees anyone's numbers until bidding closes. All lots settle at once.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {state.lotOrder.map((artistId, i) => {
          const isMine = artistId === player.id;
          const myBid = myBids[artistId];
          return (
            <div key={artistId} style={{ background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: 10, display: "flex", gap: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={state.submissions[artistId].dataUrl} alt="" style={{ width: 64, height: 64, borderRadius: 6, objectFit: "cover", background: "#fff", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 6px", fontSize: 12, color: "#a68fd6" }}>Lot {i + 1}</p>
                {isMine ? (
                  <p style={{ margin: 0, fontSize: 12, color: "#6b4f99", fontStyle: "italic" }}>This is yours — you can't bid on it.</p>
                ) : (
                  <BidControl
                    current={myBid}
                    maxAllowed={remainingBudget + (myBid || 0)}
                    onSubmit={(amount) => submitBid(gameId, round.round, player.id, artistId, amount)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function BidControl({ current, maxAllowed, onSubmit }) {
  const [value, setValue] = useState(current ? String(current) : "");
  useEffect(() => { setValue(current ? String(current) : ""); }, [current]);
  const amount = parseInt(value, 10) || 0;

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input
        type="number" min="0" step="1" value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Bid $"
        style={{ width: 80, padding: "6px 8px", borderRadius: 6, border: "1px solid #3d1f5c", background: "#150a28", color: "#f5f0ff", fontSize: 13 }}
      />
      <button
        onClick={() => onSubmit(amount)}
        disabled={amount === current || amount > maxAllowed}
        style={{
          padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer",
          background: amount > 0 ? "linear-gradient(135deg, #00ff9d, #00d9ff)" : "#3d1f5c",
          color: amount > 0 ? "#05010f" : "#a68fd6", border: "none",
        }}
      >
        {current ? "Update" : "Bid"}
      </button>
      {current > 0 && (
        <button onClick={() => onSubmit(0)} style={{ background: "none", border: "none", color: "#ff3860", fontSize: 11, cursor: "pointer" }}>✕</button>
      )}
    </div>
  );
}

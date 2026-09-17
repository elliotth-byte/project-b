import { useState, useEffect } from "react";
import { subscribeArtAuction } from "../../lib/games/artAuctionData";

// ─── Big Screen: Art Auction ───
// Unlike every other Big Screen battle in this app, this isn't a new
// game type — the existing Art Auction (lib/games/artAuctionData.js)
// already puts every painting up "in one simultaneous, anonymous
// auction" (that file's own header comment), which is exactly the
// mechanic this was requested for. The only real gap was that "all at
// once" was only ever shown at phone-thumbnail size
// (components/games/ArtAuctionPlayer.jsx renders the identical
// state.lotOrder grid, just at 60-64px) — this is the same data, the
// same grid, just large enough for a shared screen. Bidding itself
// stays exactly where it already is, private on each phone — a TV
// showing anyone's live bid would break the sealed-bid anonymity the
// original mechanic is actually built around.
export default function ArtAuctionTvDisplay({ gameId, round, players }) {
  const [state, setState] = useState(null);

  useEffect(() => subscribeArtAuction(gameId, round.round, setState), [gameId, round.round]);

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  if (state.phase === "painting") {
    const submittedCount = Object.keys(state.submissions).length;
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 16 }}>🎨 Art Auction</div>
        <p style={{ color: "#f5f0ff", fontSize: 22, fontWeight: 700 }}>Everyone's painting on their own phone...</p>
        <p style={{ color: "#a68fd6", fontSize: 14, marginTop: 8 }}>{submittedCount} of {state.participantIds.length} submitted so far</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, minHeight: "70vh" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 6 }}>
          🎨 Art Auction — {state.phase === "revealed" ? "Results" : "Bidding is open on every phone"}
        </div>
        {state.phase === "bidding" && <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>Every lot, anonymous, sealed-bid — place your bids from your own phone.</p>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20, maxWidth: 1100, margin: "0 auto" }}>
        {state.lotOrder.map((artistId, i) => {
          const result = state.phase === "revealed" ? state.results?.[artistId] : null;
          return (
            <div key={artistId} style={{ background: "#0d0618", border: "2px solid #ff2d95", borderRadius: 14, padding: 10, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#6b4f99", marginBottom: 6 }}>Lot #{i + 1}</div>
              <img src={state.submissions[artistId].dataUrl} alt="" style={{ width: "100%", aspectRatio: "1", borderRadius: 8, objectFit: "cover", background: "#fff" }} />
              {state.phase === "revealed" && (
                <p style={{ fontSize: 12, color: result ? "#00ff9d" : "#6b4f99", margin: "8px 0 0" }}>
                  {result ? `${byId[result.winnerId] || "?"} — $${result.amount}` : "No bids"}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

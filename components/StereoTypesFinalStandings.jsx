import { useEffect, useState } from "react";
import { Card, Btn } from "./ui";
import { fetchStereoTypesFinalStandings, claimStereoTypesWinSticker } from "../lib/stereoTypesFinale";
import { STICKER_CATALOG, fetchUnlockedStickerIds } from "../lib/stereoTypesStickers";
import StereoTypesSticker from "./StereoTypesSticker";

function nameFor(players, id) {
  const p = (players || []).find((pl) => pl.id === id);
  return p?.display_name || "Unknown player";
}

// ─── Stereo Types — the actual end of the game ───
// Rendered by both StereoTypesOnBlastHost.jsx and StereoTypesOnBlastPlayer.jsx
// once Round 3 itself is fully scored — this is the payoff the original
// spec describes: "The player with the most points at the end wins" and
// "if you win a game, you should be able to choose a sticker for your
// boombox." Everything here reads from lib/stereoTypesFinale.js, which
// sums the SAME durable stereo_types_round_scores ledger every round
// (1/2/3) already wrote its own finalized points into — nothing here
// recomputes any round's own scoring.
//
// myPlayerId is optional, same convention as every other Stereo Types
// results component (the host passes nothing and never gets a claim UI
// — the host isn't a player and can't win; a player passes their own id
// both for personal emphasis in the standings AND to unlock the sticker
// picker below if they're one of this game's winner(s)).
export default function StereoTypesFinalStandings({ gameId, players, myPlayerId }) {
  const [standings, setStandings] = useState(null);
  const [winnerIds, setWinnerIds] = useState([]);
  const [unlockedIds, setUnlockedIds] = useState(null);
  const [selectedSticker, setSelectedSticker] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [claimError, setClaimError] = useState(null);

  useEffect(() => {
    if (!gameId) return;
    fetchStereoTypesFinalStandings(gameId).then(({ standings: s, winnerIds: w }) => {
      setStandings(s);
      setWinnerIds(w);
    });
  }, [gameId]);

  const isWinner = !!myPlayerId && winnerIds.includes(myPlayerId);
  // user_id isn't threaded through as its own prop anywhere in this
  // round's component chain (see components/StereoTypesPlayerPanels.jsx's
  // own `player` object, which only carries id/name/color/equippedSticker)
  // — it's already sitting on this SAME `players` roster array (every
  // row is a plain `select("*")` off `players`, see pages/play.jsx),
  // so it's resolved from there instead of widening every parent
  // component's own prop just to pass one more id down.
  const myUserId = (players || []).find((p) => p.id === myPlayerId)?.user_id;

  useEffect(() => {
    if (!isWinner || !myUserId) return;
    fetchUnlockedStickerIds(myUserId).then(setUnlockedIds);
  }, [isWinner, myUserId]);

  if (standings === null) {
    return (
      <Card style={{ textAlign: "center" }}>
        <p style={{ color: "#c9b98a", fontSize: 12, fontStyle: "italic", margin: 0 }}>Tallying the final score...</p>
      </Card>
    );
  }

  const claimableStickers = STICKER_CATALOG.filter((s) => !unlockedIds?.includes(s.id));

  const handleClaim = async () => {
    if (!selectedSticker) return;
    setClaiming(true);
    setClaimError(null);
    const res = await claimStereoTypesWinSticker(gameId, selectedSticker);
    setClaiming(false);
    if (!res.ok) { setClaimError(res.error); return; }
    setClaimed(true);
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card style={{ borderColor: "#f4c430", textAlign: "center" }}>
        <div style={{ fontSize: 12, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Game over</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#f4c430", fontFamily: "'Anton', 'Arial Narrow', sans-serif", marginBottom: 4 }}>
          {winnerIds.length > 1 ? "It's a tie!" : "We have a winner!"}
        </div>
        <div style={{ color: "#f5eddc", fontSize: 15 }}>
          {winnerIds.map((id) => `🏆 ${nameFor(players, id)}`).join("  ·  ") || "No scores recorded."}
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Final standings — all 3 rounds</div>
        <div style={{ display: "grid", gap: 6 }}>
          {standings.map((s, i) => {
            const win = winnerIds.includes(s.playerId);
            return (
              <div
                key={s.playerId}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: win ? "#1a1608" : "#0a0e18", borderRadius: 6, padding: "8px 10px",
                  border: win ? "1px solid #f4c430" : "1px solid transparent",
                }}
              >
                <span style={{ color: "#f5eddc", fontSize: 13 }}>
                  {i + 1}. {win && "🏆 "}{nameFor(players, s.playerId)}
                  {s.playerId === myPlayerId && <span style={{ color: "#6b6558" }}> (you)</span>}
                </span>
                <span style={{ color: s.totalPoints < 0 ? "#ff6b6b" : "#f4c430", fontSize: 14, fontWeight: 800 }}>
                  {s.totalPoints > 0 ? `+${s.totalPoints}` : s.totalPoints}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {isWinner && !claimed && (
        <Card style={{ borderColor: "#f4c430", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            🎉 You won! Pick a sticker for your boombox
          </div>
          {unlockedIds === null ? (
            <p style={{ color: "#6b6558", fontSize: 12, fontStyle: "italic", margin: 0 }}>Checking what you've already unlocked...</p>
          ) : claimableStickers.length === 0 ? (
            <p style={{ color: "#6b6558", fontSize: 12, margin: 0 }}>You've already unlocked every sticker there is — nothing new to claim this time!</p>
          ) : (
            <>
              <p style={{ color: "#6b6558", fontSize: 12, marginTop: 0, marginBottom: 14 }}>
                It'll show up next time you build your boombox — this season and every future one.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
                {claimableStickers.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSticker(s.id)}
                    title={s.label}
                    style={{
                      width: 48, height: 48, borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      background: "#0a0e18", border: selectedSticker === s.id ? "3px solid #f4c430" : "2px solid #2a3040",
                    }}
                  >
                    <StereoTypesSticker stickerId={s.id} size={30} color="#f4c430" />
                  </button>
                ))}
              </div>
              {claimError && <p style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 10 }}>{claimError}</p>}
              <Btn onClick={handleClaim} disabled={!selectedSticker || claiming}>{claiming ? "Claiming..." : "Claim sticker"}</Btn>
            </>
          )}
        </Card>
      )}

      {isWinner && claimed && (
        <Card style={{ borderColor: "#f4c430", textAlign: "center" }}>
          <p style={{ color: "#f4c430", fontSize: 13, fontWeight: 700, margin: 0 }}>
            ✓ Sticker unlocked! You'll be able to equip it next time you build your boombox.
          </p>
        </Card>
      )}
    </div>
  );
}

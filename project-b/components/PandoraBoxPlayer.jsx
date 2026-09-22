import { useState, useEffect } from "react";
import { Card } from "./traitorsUi";
import { subscribeGameState } from "../lib/gameStorage";
import { fmtTime } from "../lib/hotPotatoData";
import { openPandoraBox, STORAGE_KEY_PANDORA } from "../lib/pandoraData";
import PandoraCountdown from "./PandoraCountdown";

// ─── Pandora's Box: Player View ───
export default function PandoraBoxPlayer({ gameId, player }) {
  const [st, setSt] = useState(null);
  const [opening, setOpening] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_PANDORA, setSt);
    return unsubscribe;
  }, [gameId]);

  if (!st || st.status === "inactive") return null;

  const handleOpen = async () => {
    if (opening) return;
    setOpening(true);
    setFeedback("");
    const res = await openPandoraBox(gameId, player);
    if (res.ok) {
      setSt(res.value);
    } else {
      if (res.reason === "already_opened") setFeedback("Too late. Pandora's Box has already been opened.");
      else if (res.reason === "expired") setFeedback("Pandora's Box closed unopened.");
      else if (res.reason === "not_eligible") setFeedback("You are not eligible to open the box.");
      else if (res.reason === "paused") setFeedback("This mission is paused by the host.");
      else setFeedback("Could not open the box — try again.");
    }
    setOpening(false);
  };

  const eligible = !st.eligibleNames || st.eligibleNames.includes(player.name);
  const alreadyOpened = st.status !== "active";

  return (
    <Card style={{
      marginBottom: 20, textAlign: "center", padding: "28px 20px",
      background: "linear-gradient(160deg, #1a1030 0%, #132038 100%)",
      border: "2px solid #c9a84c", boxShadow: "0 0 30px rgba(201,168,76,0.25)",
    }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>📦</div>
      <h2 style={{ color: "#c9a84c", margin: "0 0 6px", fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", fontSize: 22 }}>Pandora's Box</h2>

      {st.status === "active" && (
        <>
          {st.paused ? (
            <p style={{ color: "#c9a84c", fontSize: 14, margin: "0 0 12px", fontWeight: 700 }}>⏸ This mission is paused by the host.</p>
          ) : (
            <>
              <p style={{ color: "#f0e6d3", fontSize: 14, margin: "0 0 4px" }}>Pandora's Box is open.</p>
              <p style={{ color: "#a09080", fontSize: 13, margin: "0 0 12px", fontStyle: "italic" }}>One player may open it. Once opened, everyone will know who did it.</p>
            </>
          )}
          <p style={{ fontSize: 26, fontWeight: 700, color: "#c9a84c", fontFamily: "'Courier New', monospace", margin: "0 0 16px" }}>
            {st.paused ? fmtTime(st.remainingMs ?? 0) : <PandoraCountdown expiresAt={st.expiresAt} />}
          </p>
          <button
            onClick={handleOpen}
            disabled={!eligible || opening || alreadyOpened || st.paused}
            style={{
              display: "block", width: "100%", maxWidth: 320, margin: "0 auto",
              padding: "18px 24px", fontSize: 18, fontWeight: 800, letterSpacing: 1,
              borderRadius: 14, border: "none", cursor: eligible && !opening && !st.paused ? "pointer" : "not-allowed",
              background: eligible && !opening && !st.paused ? "linear-gradient(135deg, #c9a84c, #e0c068)" : "#3a3020",
              color: eligible && !opening && !st.paused ? "#1a1030" : "#706050",
              boxShadow: eligible && !opening && !st.paused ? "0 6px 20px rgba(201,168,76,0.45)" : "none",
              textTransform: "uppercase", fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
            }}
          >
            {st.paused ? "Paused" : opening ? "Opening..." : "Open Pandora's Box"}
          </button>
          {!eligible && !st.paused && <p style={{ color: "#706050", fontSize: 12, marginTop: 10 }}>You are not eligible to open the box.</p>}
          {feedback && <p style={{ color: "#c45c3c", fontSize: 12, marginTop: 10 }}>{feedback}</p>}
        </>
      )}

      {st.status === "opened" && (
        <p style={{ color: "#f0e6d3", fontSize: 15, margin: 0 }}>Pandora's Box has been opened by <strong style={{ color: "#c9a84c" }}>{st.openedBy.playerName}</strong>.</p>
      )}

      {(st.status === "expired" || st.status === "closed") && (
        <p style={{ color: "#a09080", fontSize: 15, margin: 0 }}>Pandora's Box closed unopened.</p>
      )}
    </Card>
  );
}

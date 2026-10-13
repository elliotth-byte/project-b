import { useState, useEffect } from "react";
import { subscribeIcebreakerPresubmit, submitIcebreakerPresubmit } from "../lib/icebreakerData";

// ─── Disguised pre-submission ───
// Deliberately plain — no icon, no "mission" styling, no mention of
// Icebreaker anywhere — so this reads as a throwaway little prompt, not
// a hint that it feeds a later mini-game. See lib/icebreakerData.js for
// how the host collects these ahead of time and IcebreakerHost.jsx's
// start() for how they get folded in once the real mission begins.
// Shown unconditionally (mounted in TraitorsPlayerPanels.jsx the same
// way Pandora's Box is) rather than inside any tab, so it doesn't matter
// which tab a player happens to be on when the host opens it.
export default function IcebreakerPresubmitPrompt({ gameId, playerName }) {
  const [state, setState] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeIcebreakerPresubmit(gameId, setState);
    return unsubscribe;
  }, [gameId]);

  if (!state?.open) return null;
  const existing = state.questions?.[playerName];

  const submit = async () => {
    if (!q.trim()) return;
    await submitIcebreakerPresubmit(gameId, playerName, q.trim());
  };

  return (
    <div style={{ marginBottom: 16, padding: "10px 14px", background: "#0e1830", border: "1px solid #253550", borderRadius: 10 }}>
      {existing ? (
        <p style={{ fontSize: 12, color: "#706050", fontStyle: "italic", margin: 0 }}>Thanks — got it.</p>
      ) : (
        <>
          <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 6px" }}>
            Quick one for later — what's a question you'd love to ask the group sometime?
          </p>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a question..."
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              style={{ flex: 1, background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: "6px 8px", color: "#f0e6d3", fontSize: 13, boxSizing: "border-box" }}
            />
            <button onClick={submit} disabled={!q.trim()} style={{
              fontSize: 12, padding: "6px 12px", borderRadius: 6, cursor: q.trim() ? "pointer" : "not-allowed",
              background: "#132038", border: "1px solid #253550", color: "#f0e6d3", opacity: q.trim() ? 1 : 0.5,
            }}>
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}

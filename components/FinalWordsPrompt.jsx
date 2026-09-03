import { useState } from "react";
import { Card, Btn } from "./ui";
import { submitFinalWords, skipFinalWords } from "../lib/finalWords";
import { notifyPushForMessage } from "../lib/pushNotifications";

// ─── Final Words ───
// See lib/finalWords.js for the full reasoning. Shown once per exile —
// eliminationRound identifies WHICH exile this is (re-entry means the
// same player can see this again later, for a different exile), and
// onResolved is called after either a real submission or an explicit
// skip, dismissing this for good for this specific exile.
export default function FinalWordsPrompt({ gameId, player, eliminationRound, onResolved }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    const res = await submitFinalWords(gameId, player, eliminationRound, message);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    // lib/finalWords.js's submitFinalWords writes straight to the group
    // chat's own storage rather than going through ChatPanel.jsx's
    // onSend, so it never triggers ChatPanel's own push notification —
    // this is that trigger, done here instead. isFinalWords=true is
    // what tells pages/api/push/notify-message.js to title this as
    // Final Words rather than an ordinary chat message.
    notifyPushForMessage(gameId, "group", player.id, player.name, message.trim(), null, true);
    onResolved();
  };

  const skip = async () => {
    setBusy(true);
    await skipFinalWords(gameId, player.id, eliminationRound);
    setBusy(false);
    onResolved();
  };

  return (
    <Card style={{ marginBottom: 20, border: "1px solid #ff3860" }}>
      <div style={{ fontSize: 12, color: "#ff3860", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        🎤 Final Words
      </div>
      <p style={{ fontSize: 13, color: "#a68fd6", margin: "0 0 12px" }}>
        One message, broadcast to everyone in Panopticon — this is your only chance to say it, since you won't be able to post there once you move on.
      </p>
      <textarea
        value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={3}
        placeholder="What do you want to say on your way out?"
        style={{
          width: "100%", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8,
          padding: "10px 12px", color: "#f5f0ff", fontSize: 14, resize: "vertical", boxSizing: "border-box", marginBottom: 10,
        }}
      />
      {error && <p style={{ color: "#ff3860", fontSize: 12, marginBottom: 10 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10 }}>
        <Btn onClick={submit} disabled={busy || !message.trim()} style={{ flex: 1 }}>
          {busy ? "..." : "Broadcast to Panopticon"}
        </Btn>
        <button
          onClick={skip} disabled={busy}
          style={{ background: "none", border: "1px solid #3d1f5c", borderRadius: 8, padding: "0 16px", color: "#a68fd6", fontSize: 13, cursor: busy ? "default" : "pointer" }}
        >
          Skip
        </button>
      </div>
    </Card>
  );
}

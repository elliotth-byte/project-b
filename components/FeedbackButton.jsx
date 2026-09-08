import { useState } from "react";
import { submitFeedback } from "../lib/feedback";

// ─── Feedback Button ───
// A small, always-visible footer button — deliberately NOT inside any
// one tab's own content, so it's reachable no matter what a player is
// looking at when something's worth flagging to the host. `page` is
// whichever tab was active the moment they opened this, captured once
// on open (not live-updated while the modal's open) so the host sees
// "what were they looking at when this occurred to them," not
// whatever tab happens to be selected by the time they hit submit.
export default function FeedbackButton({ gameId, player, currentPage }) {
  const [open, setOpen] = useState(false);
  const [openedFromPage, setOpenedFromPage] = useState(currentPage);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!gameId || !player) return null;

  const openModal = () => {
    setOpenedFromPage(currentPage);
    setSent(false);
    setMessage("");
    setOpen(true);
  };

  const send = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    await submitFeedback(gameId, player.id, player.name, openedFromPage, message);
    setSending(false);
    setSent(true);
    setMessage("");
    window.setTimeout(() => setOpen(false), 1100);
  };

  return (
    <>
      <button
        onClick={openModal}
        style={{
          position: "fixed", bottom: 14, right: 14, zIndex: 150,
          background: "#150a28", border: "1px solid #3d1f5c", borderRadius: 20,
          color: "#a68fd6", fontSize: 12, fontWeight: 600, padding: "8px 14px",
          cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
        }}
      >
        💬 Feedback
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(5,1,15,0.75)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#150a28", border: "1px solid #3d1f5c", borderRadius: "16px 16px 0 0", padding: 20, width: "100%", maxWidth: 480 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ color: "#f5f0ff", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>💬 Send Feedback</h3>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#a68fd6", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
            </div>
            {sent ? (
              <p style={{ color: "#00ff9d", fontSize: 13, fontWeight: 700, textAlign: "center", margin: "20px 0" }}>Sent to the host. Thanks!</p>
            ) : (
              <>
                <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>
                  Goes straight to the host, with a note that you sent it from the {openedFromPage} tab.
                </p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Something broken, confusing, or worth flagging?"
                  rows={4}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #3d1f5c", background: "#0d0618", color: "#f5f0ff", fontSize: 13, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
                />
                <div style={{ textAlign: "right", marginTop: 10 }}>
                  <button
                    onClick={send}
                    disabled={!message.trim() || sending}
                    style={{
                      padding: "10px 22px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: message.trim() ? "pointer" : "default",
                      background: message.trim() ? "linear-gradient(135deg, #ff2d95, #b829ff)" : "#3d1f5c",
                      color: message.trim() ? "#05010f" : "#a68fd6", border: "none",
                    }}
                  >
                    {sending ? "Sending..." : "Send"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

import { useState } from "react";
import { markNavTourSeen } from "../lib/navTour";

// A short, fixed sequence of cards orienting a new player around the
// tab bar — deliberately NOT a spotlight-overlay-pointing-at-DOM-
// elements tour (those get fragile fast across different screen sizes
// on mobile); just plain, simple explanation cards. Filtered to the
// tabs actually visible right now (visibleTabKeys, matching play.jsx's
// own BASE_TABS.filter logic — e.g. chat only shows a step if chat's
// actually enabled for this season) so it never describes a tab someone
// can't see. onDone fires once, whether the player finishes it or skips
// partway through — both count as "seen," matching the Help tab's
// "Replay Tutorial" being the only way back in either case.
const TAB_STEPS = {
  game: { title: "🎲 Game", body: "Battles, Fates Ceremonies, and Exile Votes all happen here — whatever's currently active for the round." },
  ceremony: { title: "⚖️ Ceremony", body: "The record of everything that's already happened — past battles, nominations, votes, and results." },
  confessional: { title: "🎥 Confessional", body: "Your own private space to reflect, in response to prompts the host sets — only you (and the host) can see what you write." },
  chat: { title: "💬 Chat", body: "Panopticon (group chat) and direct messages with other players, all in one place." },
  help: { title: "❓ Help", body: "The rules doc, your personal game preferences, and — if you ever need this tour again — it's right here too." },
};

export default function NavTourOverlay({ visibleTabKeys, onDone }) {
  // Built this way (map-with-key-embedded, then filter) rather than
  // filtering first and re-indexing after, so a tab key that somehow
  // doesn't match TAB_STEPS (a future new tab added here without an
  // entry, say) just gets skipped cleanly instead of silently
  // misaligning which key goes with which step.
  const tabSteps = visibleTabKeys
    .map((key) => (TAB_STEPS[key] ? { ...TAB_STEPS[key], key } : null))
    .filter(Boolean);
  const steps = [
    { key: "welcome", title: "Welcome to Panopticon", body: "A quick orientation before you dive in — this'll only take a few seconds." },
    ...tabSteps,
  ];
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  const finish = async () => {
    await markNavTourSeen();
    onDone?.();
  };

  const next = () => {
    if (isLast) finish();
    else setIndex((i) => i + 1);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(5,1,15,0.85)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        background: "#150a28", border: "1px solid #3d1f5c", borderRadius: 16, padding: 24,
        maxWidth: 340, width: "100%", textAlign: "center",
      }}>
        <h3 style={{ color: "#ff2d95", fontSize: 18, margin: "0 0 10px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
          {step.title}
        </h3>
        <p style={{ color: "#f5f0ff", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>{step.body}</p>

        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 18 }}>
          {steps.map((s, i) => (
            <div key={s.key} style={{
              width: 6, height: 6, borderRadius: "50%",
              background: i === index ? "#ff2d95" : "#3d1f5c",
            }} />
          ))}
        </div>

        <button onClick={next} style={{
          width: "100%", padding: "10px 18px", borderRadius: 8, cursor: "pointer",
          background: "linear-gradient(135deg, #ff2d95, #b829ff)", color: "#05010f",
          border: "none", fontSize: 14, fontWeight: 700, marginBottom: 10,
        }}>
          {isLast ? "Got it!" : "Next"}
        </button>
        {!isLast && (
          <button onClick={finish} style={{
            background: "none", border: "none", color: "#6b4f99", fontSize: 12, cursor: "pointer",
          }}>
            Skip tour
          </button>
        )}
      </div>
    </div>
  );
}

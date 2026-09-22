// ─── Onboarding Checklist ───
// Floats on the side of the screen for a brand-new player until
// they've done all three: sent a message in the main chat, sent a DM,
// and opened their own mini profile (see pages/play.jsx's header
// portrait) to see their power. See sql/add-onboarding-checklist.sql
// for why this never applies to anyone who was already mid-season
// before this feature existed — this is strictly a new-player
// walkthrough, not a retroactive requirement.
export default function OnboardingChecklist({ player, onOpenProfile }) {
  const items = [
    { done: !!player.onboardingChatSent, label: "Send a message in the Panopticon group chat" },
    { done: !!player.onboardingDmSent, label: "Send a DM to another player" },
    { done: !!player.onboardingProfileViewed, label: "Open your mini profile to see your power", action: onOpenProfile },
  ];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div style={{
      position: "fixed", top: "50%", right: 8, transform: "translateY(-50%)", zIndex: 140,
      background: "#150a28", border: "1px solid #ff2d95", borderRadius: 12, padding: 14,
      width: 200, boxShadow: "0 2px 16px rgba(0,0,0,0.5)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#ff2d95", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        Get started ({doneCount}/3)
      </div>
      <div style={{ display: "grid", gap: 8, marginBottom: 6 }}>
        {items.map((item, i) => (
          <div
            key={i}
            onClick={!item.done ? item.action : undefined}
            style={{
              display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11.5,
              color: item.done ? "#00ff9d" : "#e0d4ff",
              cursor: !item.done && item.action ? "pointer" : "default",
              textDecoration: item.done ? "line-through" : "none",
              opacity: item.done ? 0.7 : 1,
            }}
          >
            <span>{item.done ? "✅" : "⬜"}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      {doneCount < 3 && (
        <p style={{ color: "#6b4f99", fontSize: 10, margin: 0, fontStyle: "italic" }}>
          Complete all three to unlock Battles.
        </p>
      )}
    </div>
  );
}

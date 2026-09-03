import { Card } from "./ui";
import { RULES_SECTIONS, battleList } from "../lib/rulesContent";
import RulesAccordion from "./RulesAccordion";

// ─── Player help ───
// The full rules, in-app (see lib/rulesContent.js — kept as data
// specifically so it can stay synced with the game as mechanics change,
// rather than an external doc that quietly drifts out of date), a
// player's current inactivity-strike status, how to get this page onto
// an iPhone/iPad or Android home screen as an app-like icon, and a way
// to replay the nav tour. Settings that actually change how the game
// behaves — notifications, colorblind mode, swipe controls, the
// Torched hiding-spot preset, leaving the game — live on the separate
// Options tab now (see OptionsPanel.jsx); this tab is purely
// informational.
export default function HelpPanel({ player, onReplayTour, readOnly = false }) {
  // The one section (see lib/rulesContent.js's own comment on it) that
  // needs real markup instead of a plain paragraph — attached here via
  // renderBody rather than in the data file itself, so rulesContent.js
  // can stay presentation-agnostic and RulesAccordion.jsx doesn't need
  // to import battleList/GAME_REGISTRY just to special-case this one
  // section.
  const sections = RULES_SECTIONS.map((section) =>
    section.body !== null ? section : {
      ...section,
      renderBody: () => (
        <div style={{ display: "grid", gap: 10 }}>
          {battleList().map((g) => (
            <div key={g.label}>
              <div style={{ fontSize: 13, color: "#f5f0ff", fontWeight: 700, marginBottom: 2 }}>{g.icon} {g.label}</div>
              <div style={{ fontSize: 12, color: "#a68fd6", lineHeight: 1.5 }}>{g.blurb}</div>
            </div>
          ))}
        </div>
      ),
    }
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Card>
        <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
          📖 Rules
        </div>
        <RulesAccordion sections={sections} />
      </Card>

      {player && (
        <Card style={player.inactivityStrikes > 0 ? { borderColor: "rgba(255,56,96,0.4)" } : {}}>
          <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            ⚠️ Inactivity Strikes
          </div>
          <p style={{ fontSize: 20, fontWeight: 800, color: player.inactivityStrikes > 0 ? "#ff3860" : "#f5f0ff", margin: "0 0 6px" }}>
            {player.inactivityStrikes || 0} / 3
          </p>
          <p style={{ fontSize: 12, color: "#a68fd6", margin: 0, lineHeight: 1.5 }}>
            Missing a nomination, a Power of Khaos decision, a vote, or a Battle you were expected to compete in adds one — 3 removes
            you from the game. One strike comes off automatically every 3 rounds.
          </p>
        </Card>
      )}

      {onReplayTour && !readOnly && (
        <Card style={{ textAlign: "center" }}>
          <button
            onClick={onReplayTour}
            style={{
              background: "none", border: "1px solid #3d1f5c", borderRadius: 8, padding: "8px 16px",
              color: "#a68fd6", fontSize: 13, cursor: "pointer",
            }}
          >
            🧭 Replay Navigation Tour
          </button>
        </Card>
      )}

      <Card>
        <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          📱 Add to Home Screen (iPhone/iPad)
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#f5f0ff", lineHeight: 1.8 }}>
          <li>Open this page in <strong>Safari</strong> (not another app's built-in browser).</li>
          <li>Tap the <strong>Share</strong> icon (square with an arrow pointing up) in the toolbar.</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong> in the top corner.</li>
        </ol>
        <p style={{ fontSize: 12, color: "#6b4f99", marginTop: 10, marginBottom: 0, fontStyle: "italic" }}>
          You'll get an icon that opens straight to the game — no need to keep finding the link. This step is also required before Notifications (see the Options tab) will work on iPhone/iPad.
        </p>
      </Card>

      <Card>
        <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          📱 Add to Home Screen (Android)
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#f5f0ff", lineHeight: 1.8 }}>
          <li>Open this page in <strong>Chrome</strong>.</li>
          <li>Tap the <strong>⋮</strong> menu icon in the top-right corner.</li>
          <li>Tap <strong>Add to Home screen</strong> (sometimes shown as <strong>Install app</strong>).</li>
          <li>Tap <strong>Add</strong> (or <strong>Install</strong>) to confirm.</li>
        </ol>
        <p style={{ fontSize: 12, color: "#6b4f99", marginTop: 10, marginBottom: 0, fontStyle: "italic" }}>
          Same convenience as above — an icon that opens straight to the game. Unlike iPhone/iPad, this step is optional on Android: Notifications (see the Options tab) already work from a regular Chrome tab without it.
        </p>
      </Card>

      <p style={{ fontSize: 10, color: "#3d1f5c", textAlign: "center", margin: 0 }}>
        Version {process.env.NEXT_PUBLIC_APP_VERSION || "dev"} — include this if you're reporting a problem, in case you're on an older version than expected.
      </p>
    </div>
  );
}

import { useState } from "react";
import { Card } from "./ui";
import { STEREO_TYPES_RULES_SECTIONS } from "../lib/rulesContent";
import RulesAccordion from "./RulesAccordion";

const ACCENT = "#f4c430"; // Stereo Types' own gold, matching Boombox/round cards elsewhere
const MUTED = "#c9b98a";
const TEXT = "#f5eddc";

// ─── Stereo Types — rules ───
// Stereo Types has no tab bar at all (StereoTypesPlayerPanels.jsx/
// StereoTypesHostPanels.jsx are each one continuous scroll of cards,
// not a tabbed layout like Project B's/Traitors' — see those files'
// own comments on why), so there's nowhere for a "Help" tab to live
// the way components/HelpPanel.jsx's own Rules card does for Project
// B. This is the toggle-button-reveals-a-card pattern instead — same
// shape pages/play.jsx's Traitors branch already uses for "🖼 Show
// memory wall," just scoped to this one component instead of the page
// itself, since both StereoTypesPlayerPanels.jsx and
// StereoTypesHostPanels.jsx want the exact same rules content and
// there's no reason to duplicate the toggle state/JSX in both.
export default function StereoTypesRulesPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: open ? `${ACCENT}22` : "transparent",
          border: `1px solid ${open ? ACCENT : "#3d1f5c"}`,
          color: open ? ACCENT : MUTED, fontSize: 12, cursor: "pointer",
          borderRadius: 6, padding: "4px 10px", marginBottom: open ? 10 : 0,
        }}
      >
        📖 {open ? "Hide" : "Show"} rules
      </button>
      {open && (
        <Card style={{ borderColor: ACCENT }}>
          <RulesAccordion sections={STEREO_TYPES_RULES_SECTIONS} accentColor={ACCENT} mutedColor={MUTED} textColor={TEXT} />
        </Card>
      )}
    </div>
  );
}

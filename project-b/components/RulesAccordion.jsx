import { useState } from "react";

// ─── Reusable rules accordion ───
// Extracted from components/HelpPanel.jsx's own Rules card, which used
// to be the only place this pattern existed — Stereo Types now needs
// its own rules content (see lib/rulesContent.js's
// STEREO_TYPES_RULES_SECTIONS and components/StereoTypesRulesPanel.jsx)
// with the exact same "tap a title to expand it" behavior, so this is
// that rendering, decoupled from any one game's content or color theme.
//
// Each section is { title, body } for plain text, or { title, body:
// null, renderBody: () => <...> } for anything that needs real markup
// instead of a paragraph — HelpPanel.jsx's own "The Battles, One By
// One" section (which renders lib/rulesContent.js's battleList()) is
// the one example of this today; Stereo Types' own sections are all
// plain text and never need renderBody at all.
//
// accentColor/mutedColor let each caller match its own game's palette
// (HelpPanel.jsx's pink/purple vs. Stereo Types' gold) without this
// component needing to know which game it's rendering for — defaults
// match HelpPanel's own original hardcoded colors, so that call site's
// appearance is unchanged by this extraction.
export default function RulesAccordion({ sections, accentColor = "#ff2d95", mutedColor = "#a68fd6", textColor = "#f5f0ff" }) {
  const [openSections, setOpenSections] = useState(new Set());

  const toggleSection = (i) => setOpenSections((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  return (
    <div style={{ display: "grid", gap: 6 }}>
      {sections.map((section, i) => {
        const isOpen = openSections.has(i);
        return (
          <div key={section.title}>
            <button
              onClick={() => toggleSection(i)}
              style={{
                width: "100%", textAlign: "left", background: isOpen ? `${accentColor}14` : "#0d0618",
                border: `1px solid ${isOpen ? `${accentColor}4d` : "#3d1f5c"}`, borderRadius: 8,
                padding: "10px 12px", color: isOpen ? accentColor : textColor, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              {isOpen ? "▾" : "▸"} {section.title}
            </button>
            {isOpen && (
              <div style={{ padding: "10px 4px 4px 12px" }}>
                {section.renderBody ? section.renderBody() : (
                  <p style={{ fontSize: 12, color: mutedColor, lineHeight: 1.6, margin: 0, whiteSpace: "pre-line" }}>{section.body}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

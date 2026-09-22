import { useState } from "react";
import { Card, Badge } from "./traitorsUi";
import { MISSION_TEMPLATES, missionAnnouncementScript } from "../lib/missionTemplates";
import PostToSlack from "./PostToSlack";

export default function MissionsHost({ gameId, round = 1 }) {
  const [selected, setSelected] = useState(null);
  const [winnersById, setWinnersById] = useState({});

  const winnersFor = (m) => winnersById[m.id] ?? m.defaultWinners;
  const adjust = (m, delta) => setWinnersById((prev) => ({ ...prev, [m.id]: Math.max(1, winnersFor(m) + delta) }));

  return (
    <Card>
      <h3 style={{ color: "#f0e6d3", margin: "0 0 6px", fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🎯 Mission Briefs</h3>
      <p style={{ color: "#706050", fontSize: 11, margin: "0 0 12px", fontStyle: "italic" }}>
        Flavor-text announcements for each challenge. Posting one is purely narrative — it doesn't start or affect the actual challenge, which still happens from its own card below.
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {MISSION_TEMPLATES.map((m) => {
          const winners = winnersFor(m);
          const isOpen = selected === m.id;
          return (
            <div key={m.id} style={{ background: "#0a1020", border: `1px solid ${isOpen ? "#c9a84c" : "#253550"}`, borderRadius: 8, padding: 10, cursor: "pointer" }}
              onClick={() => setSelected(isOpen ? null : m.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#f0e6d3", fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🎯 {m.name}</div>
                  <p style={{ color: "#a09080", fontSize: 12, margin: "2px 0 0" }}>{m.desc}</p>
                </div>
                <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => adjust(m, -1)} style={{ width: 20, height: 20, borderRadius: 5, border: "1px solid #253550", background: "#0e1830", color: "#a09080", fontSize: 12, cursor: "pointer", lineHeight: 1 }}>−</button>
                  <Badge color="#d4a843">🛡️ {winners} {winners !== 1 ? "winners" : "winner"}</Badge>
                  <button onClick={() => adjust(m, 1)} style={{ width: 20, height: 20, borderRadius: 5, border: "1px solid #253550", background: "#0e1830", color: "#a09080", fontSize: 12, cursor: "pointer", lineHeight: 1 }}>+</button>
                </div>
              </div>
              {isOpen && (
                <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #253550" }}>
                  <PostToSlack
                    gameId={gameId} icon="🎯" label="Mission Announcement"
                    text={missionAnnouncementScript(m, round, winners)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

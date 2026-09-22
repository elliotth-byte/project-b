import { useState, useEffect } from "react";
import Link from "next/link";
import { fetchRelationshipWeb } from "../lib/relationshipWeb";

// ─── Relationship Web ───
// Inspired by The Sims' own relationship panel: your own avatar in the
// center, your most recent season's cast forming an inner ring around
// you, everyone from every earlier season (deduped, and never repeating
// someone already shown in the inner ring) forming a wider outer ring.
// A green ring around a portrait means you've friended that person
// (lib/friendships.js); a red ring means a real vote-against exists
// between the two of you, in either direction, in any shared season
// (lib/relationshipWeb.js — see that file's own header comment for
// exactly which vote systems feed this and which one deliberately
// doesn't). Both rings at once are drawn as two concentric borders
// (green outside, red inside) rather than trying to blend them into one
// color, so "both" always reads as unambiguously "both."
//
// Self-fetching, like most other per-user components in this app —
// pages/profile.jsx just mounts this with a userId and otherwise
// doesn't need to know anything about how the web itself is built.
const SIZE = 360; // overall square diagram size, chosen to comfortably fit this app's 420px-max-width column with padding
const CENTER = SIZE / 2;
const R_INNER = 85;
const R_OUTER = 150;
const CENTER_AVATAR = 52;
const INNER_AVATAR = 36;
const OUTER_AVATAR = 28;

const GREEN = "#2ecc71";
const RED = "#ff3860";
const NEUTRAL = "#3d1f5c";

function pointOn(radius, index, total) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2; // start at 12 o'clock, go clockwise
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
}

function lineColor(member) {
  if (member.isFriend && member.isAdversary) return "url(#relationshipWebBothGradient)";
  if (member.isFriend) return GREEN;
  if (member.isAdversary) return RED;
  return NEUTRAL;
}

function Portrait({ member, size, me = false }) {
  const avatar = (
    <div style={{
      width: size, height: size, borderRadius: "50%", overflow: "hidden", background: "#0d0618",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      {member.photoUrl
        ? <img src={member.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: size * 0.45, color: "#3d1f5c" }}>👤</span>}
    </div>
  );

  // Two concentric borders when both apply (green outside, red inside)
  // rather than one blended color — "both" should always be legible as
  // both, not a muddy in-between.
  const ringed = me
    ? <div style={{ border: `2px solid #ff2d95`, borderRadius: "50%", padding: 2 }}>{avatar}</div>
    : member.isFriend && member.isAdversary
    ? <div style={{ border: `3px solid ${GREEN}`, borderRadius: "50%", padding: 2 }}>
        <div style={{ border: `3px solid ${RED}`, borderRadius: "50%", padding: 1 }}>{avatar}</div>
      </div>
    : member.isFriend
    ? <div style={{ border: `3px solid ${GREEN}`, borderRadius: "50%", padding: 2 }}>{avatar}</div>
    : member.isAdversary
    ? <div style={{ border: `3px solid ${RED}`, borderRadius: "50%", padding: 2 }}>{avatar}</div>
    : <div style={{ border: `1px solid ${NEUTRAL}`, borderRadius: "50%", padding: 2 }}>{avatar}</div>;

  if (me) return ringed;

  return (
    <Link href={`/profile?userId=${member.userId}`} title={member.displayName} style={{ display: "block", textDecoration: "none" }}>
      {ringed}
    </Link>
  );
}

export default function RelationshipWeb({ userId }) {
  const [web, setWeb] = useState(null); // null = loading

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchRelationshipWeb(userId).then((w) => { if (!cancelled) setWeb(w); });
    return () => { cancelled = true; };
  }, [userId]);

  if (web === null) {
    return <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p>;
  }

  if (web.innerRing.length === 0 && web.outerRing.length === 0) {
    return <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>No one to show yet — this fills in once you've shared a season with someone else.</p>;
  }

  // Outer-ring spokes are only drawn for people who actually have a
  // relationship mark — everyone else in the outer ring still appears
  // as a portrait, just without a line back to the center. Deliberate:
  // an inner ring is always bounded by one season's cast size, but the
  // outer ring can accumulate people across many seasons, and a spoke
  // to every single one of them would turn into an unreadable tangle
  // long before it stopped being useful.
  return (
    <div>
      <div style={{ position: "relative", width: SIZE, height: SIZE, margin: "0 auto" }}>
        <svg width={SIZE} height={SIZE} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
          <defs>
            <linearGradient id="relationshipWebBothGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="45%" stopColor={GREEN} />
              <stop offset="55%" stopColor={RED} />
            </linearGradient>
          </defs>
          {web.innerRing.map((m, i) => {
            const p = pointOn(R_INNER, i, web.innerRing.length);
            return <line key={m.userId} x1={CENTER} y1={CENTER} x2={p.x} y2={p.y} stroke={lineColor(m)} strokeWidth={2} />;
          })}
          {web.outerRing.map((m, i) => {
            if (!m.isFriend && !m.isAdversary) return null;
            const p = pointOn(R_OUTER, i, web.outerRing.length);
            return <line key={m.userId} x1={CENTER} y1={CENTER} x2={p.x} y2={p.y} stroke={lineColor(m)} strokeWidth={2} strokeDasharray="4 3" />;
          })}
        </svg>

        <div style={{ position: "absolute", left: CENTER, top: CENTER, transform: "translate(-50%, -50%)" }}>
          <Portrait member={web.me} size={CENTER_AVATAR} me />
        </div>

        {web.innerRing.map((m, i) => {
          const p = pointOn(R_INNER, i, web.innerRing.length);
          return (
            <div key={m.userId} style={{ position: "absolute", left: p.x, top: p.y, transform: "translate(-50%, -50%)" }}>
              <Portrait member={m} size={INNER_AVATAR} />
            </div>
          );
        })}

        {web.outerRing.map((m, i) => {
          const p = pointOn(R_OUTER, i, web.outerRing.length);
          return (
            <div key={m.userId} style={{ position: "absolute", left: p.x, top: p.y, transform: "translate(-50%, -50%)" }}>
              <Portrait member={m} size={OUTER_AVATAR} />
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 14, fontSize: 12 }}>
        <span style={{ color: GREEN, fontWeight: 700 }}>🟢 Friends: {web.friendCount}</span>
        <span style={{ color: RED, fontWeight: 700 }}>🔴 Voted Against: {web.adversaryCount}</span>
      </div>
      <p style={{ fontSize: 10.5, color: "#6b4f99", textAlign: "center", marginTop: 8, marginBottom: 0, fontStyle: "italic" }}>
        Inner ring: your most recent season. Outer ring: everyone from earlier seasons.
      </p>
    </div>
  );
}

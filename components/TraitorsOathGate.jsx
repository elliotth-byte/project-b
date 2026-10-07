import { useState } from "react";
import { Btn, Card } from "./traitorsUi";
import { setGamePrefs } from "../lib/gamePrefs";

// ─── The Traitors' Oath ───
// A mandatory, per-season confidentiality/participation agreement a
// player must sign before entering a Traitors game — see
// components/TraitorsAliasPicker.jsx for the structurally identical
// gate this is modeled on (same Card/Btn primitives, same "render a
// blocking step in pages/play.jsx until a completion callback fires"
// shape), swapping that gate's raw `players.alias` column update for
// `setGamePrefs` (the players.game_prefs jsonb column) since there's no
// dedicated column for this — same mechanism components/
// OnboardingPreferences.jsx already uses for its own one-time
// "completed this step" flag.
//
// Gated purely on `!myPlayer.gamePrefs?.oathSigned` at the call site in
// pages/play.jsx (see needsTraitorsOath there) — NOT also on approval
// state. That was tried first, on the same reasoning needsOnboardingPrefs
// uses one variable above it in that file, but it backfired here: a host
// approving a pending player (one fast click) before that player's own
// screen got through this gate let `approved` flip true first and the
// requirement just evaporate. Already-approved players from before this
// gate existed are grandfathered instead, via a one-time SQL backfill
// (sql/grandfather-traitors-oath.sql) that stamps oathSigned true for
// them directly, so they're never asked retroactively.
//
// Text is the real, host-provided oath verbatim — the 6 checkbox items
// especially must not be reworded, since this is what a player is
// actually agreeing to. Name/signature/date are auto-filled from what
// the app already knows (this player's own name, today's date) rather
// than free-text fields, per explicit instruction — the only thing a
// player fills in themselves is ticking each box.
const OATH_ITEMS = [
  "When eliminated, I fall silent. Until the host declares the game over, I will not discuss it with active or eliminated players—including roles, suspicions, strategy, or past conversations.",
  "No whispers from beyond the grave. I will not influence the game through messages, posts, screenshots, hints, gestures, or another person. After elimination, game questions go only to the host.",
  "I protect the secrets. I will not share private role assignments or host messages as proof, seek unauthorized information, or ask eliminated players for help.",
  "I play fairly. I will not cheat, throw the game, or make secret arrangements to rig the outcome or divide the prize. Any role-specific actions must follow the host's rules.",
  "I respect my fellow players. I will keep deception inside the game, honor boundaries, and avoid personal attacks.",
  "I accept the stakes. I understand that $1,000 is on the line and that breaking these rules may cost me my place in the game or prize eligibility.",
];

const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

export default function TraitorsOathGate({ player, onComplete }) {
  const [checked, setChecked] = useState(Array(OATH_ITEMS.length).fill(false));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const allChecked = checked.every(Boolean);
  const toggle = (i) => setChecked((c) => c.map((v, idx) => (idx === i ? !v : v)));

  const submit = async () => {
    if (!allChecked || saving) return;
    setSaving(true);
    setError(null);
    const res = await setGamePrefs(player.id, { oathSigned: true, oathSignedAt: new Date().toISOString() });
    setSaving(false);
    if (!res.ok) { setError(res.error || "Couldn't save — try again."); return; }
    onComplete?.(res.prefs);
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🏰</div>
        <h2 style={{ color: "#f0e6d3", margin: "0 0 2px", fontSize: 20, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
          The Traitors
        </h2>
        <p style={{ color: "#a09080", fontSize: 13, margin: 0, fontStyle: "italic" }}>Rules, Secrets &amp; Solemn Promises</p>
      </div>

      <div style={{
        maxHeight: 280, overflowY: "auto", padding: "4px 14px", marginBottom: 16,
        background: "#0a1020", border: "1px solid #253550", borderRadius: 10,
        color: "#a09080", fontSize: 13, lineHeight: 1.6,
      }}>
        <p>
          Welcome to the castle. $1,000 is on the line. Bring your charm, your cunning, and your most convincing
          declaration of innocence.
        </p>

        <h4 style={sectionHeading}>The Game at a Glance</h4>
        <p style={{ fontStyle: "italic", color: "#706050" }}>October 9–November 6 · Monday–Friday</p>
        <p>
          Players are secretly assigned as Faithful or Traitors. The Faithful must uncover the Traitors. The
          Traitors must escape detection while eliminating the Faithful. If the Faithful uncover all remaining
          Traitors, they win. If a Traitor remains undetected at the end, the Traitors win.
        </p>
        <p>
          <strong style={{ color: "#c9a84c" }}>The $1,000 Prize.</strong> If the Faithful identify and banish every
          Traitor, the remaining Faithful split the $1,000 prize equally. If even one Traitor remains at the end,
          the surviving Traitors split the entire prize equally—and the Faithful leave empty-handed.
        </p>

        <h4 style={sectionHeading}>Life in the Castle</h4>
        <p>
          The game generally alternates between murder days and mission/Roundtable days. Follow the game Slack
          channel for instructions and deadlines.
        </p>
        <ol style={{ paddingLeft: 18, margin: "0 0 10px" }}>
          <li style={{ marginBottom: 8 }}>
            <strong style={{ color: "#c9a84c" }}>Murder.</strong> On murder days, the Traitors secretly choose a
            player to eliminate. Unlike banishment, there is no public vote.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong style={{ color: "#c9a84c" }}>Afternoon Tea.</strong> After a murder, the host announces the
            survivors through Afternoon Tea invitations in Slack. If your name is missing, you've been murdered.
            You leave the game channel, and your oath of silence begins.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong style={{ color: "#c9a84c" }}>Missions &amp; Shields.</strong> On mission days, remaining
            players compete in a challenge, with shields available as announced. Shields protect against the next
            murder—not Roundtable banishment.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong style={{ color: "#c9a84c" }}>The Roundtable.</strong> Players discuss suspicions and defend
            their innocence, often alongside a mission. Submit your vote privately to the host by the deadline:
            Player Name — "Reason." Votes and reasons become public. The player with the most votes is banished,
            reveals their role, and leaves the game channel. Ties are settled by a game of luck.
          </li>
          <li>
            <strong style={{ color: "#c9a84c" }}>Repeat—Until the End.</strong> Play continues through November 6.
            Whether murdered or banished, eliminated players must not discuss the game with active or eliminated
            players until the host declares it over.
          </li>
        </ol>
      </div>

      <h3 style={{ color: "#f0e6d3", margin: "0 0 4px", fontSize: 16, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", textAlign: "center" }}>
        The Traitors' Oath
      </h3>
      <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic", textAlign: "center", margin: "0 0 14px" }}>
        Read. Check each box. Sign your fate.
      </p>

      <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
        {OATH_ITEMS.map((text, i) => (
          <label
            key={i}
            style={{
              display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer",
              background: checked[i] ? "rgba(122,154,92,0.1)" : "#0a1020",
              border: `1px solid ${checked[i] ? "#7a9a5c" : "#253550"}`,
              borderRadius: 8, padding: "10px 12px",
            }}
          >
            <input
              type="checkbox" checked={checked[i]} onChange={() => toggle(i)}
              style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: "#7a9a5c", cursor: "pointer" }}
            />
            <span style={{ fontSize: 13, color: "#f0e6d3", lineHeight: 1.5 }}>{text}</span>
          </label>
        ))}
      </div>

      <div style={{ textAlign: "center", marginBottom: 16, fontSize: 12, color: "#706050" }}>
        Signed by <strong style={{ color: "#a09080" }}>{player.name || player.display_name}</strong> on{" "}
        <strong style={{ color: "#a09080" }}>{today}</strong>
      </div>

      <p style={{ textAlign: "center", color: "#706050", fontSize: 11, fontStyle: "italic", margin: "0 0 14px" }}>
        Enter freely. Trust carefully. Depart silently.
        <br />
        The oath is a game confidentiality and participation agreement, not a legal NDA.
      </p>

      {error && <p style={{ color: "#c45c3c", fontSize: 12, textAlign: "center", marginBottom: 10 }}>{error}</p>}

      <div style={{ textAlign: "center" }}>
        <Btn onClick={submit} disabled={!allChecked || saving}>{saving ? "Signing..." : "Sign the Oath & Enter"}</Btn>
      </div>
    </Card>
  );
}

const sectionHeading = { color: "#c9a84c", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, margin: "14px 0 6px" };

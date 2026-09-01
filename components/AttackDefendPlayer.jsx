import { useState, useEffect, useRef } from "react";
import { Btn, Card, Badge, PausedBanner } from "./traitorsUi";
import { storageGet, storageSet, storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { STORAGE_KEY_ATTACK_DEFEND } from "../lib/attackDefendData";

// ─── Attack / Defend: Player View ───
//
// This one keeps a deliberate design choice from the original almost
// exactly as-is: rapid attack clicks are coalesced locally and written with
// a plain storageSet (not the atomic storageUpdate used elsewhere in this
// project), because during a fast click flurry, re-reading before every
// single write would be pure extra load for no benefit — the current
// player is the *only* one who ever writes their own attack's point count,
// so there's nothing to race against on that specific field. What DID
// change: state sync no longer polls (subscribeGameState pushes updates
// instead), and the two genuinely racy actions — starting an attack and
// defending — now go through a real atomic update instead of a plain
// read-then-write, so two players can't both slip through the "is there
// already an active attack?" check at the same instant.
export default function AttackDefendPlayer({ gameId, playerName }) {
  const [st, setSt] = useState(null);
  const [btnPos, setBtnPos] = useState({ x: 40, y: 40 });
  const [localBonus, setLocalBonus] = useState(0); // clicks shown instantly, not yet confirmed by storage
  const busyRef = useRef(false); // guards startAttack/defend against double-fire
  const pendingClicksRef = useRef(0);
  const flushingRef = useRef(false);
  const btnPosRef = useRef(btnPos);
  btnPosRef.current = btnPos;

  // Mirrors `st` synchronously so write paths (flushClicks in particular)
  // can use the latest known truth as their base without needing a fresh
  // read first — React state updates aren't synchronously readable inside
  // the same tick, but a ref is.
  const stRef = useRef(st);
  const updateSt = (next) => { stRef.current = next; setSt(next); };

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_ATTACK_DEFEND, updateSt);
    return unsubscribe;
  }, [gameId]);

  // Reset any unconfirmed optimistic clicks whenever the attack instance changes
  // (a new attack started, or this one ended) so stale bonus points can't linger.
  useEffect(() => { setLocalBonus(0); }, [st?.activeAttack?.attacker, st?.activeAttack?.startedAt]);

  if (!st || !st.active) return null;
  if (st.paused) return <PausedBanner icon="⚔️" title="Attack / Defend" />;

  const isParticipant = !st.participants || st.participants.includes(playerName);
  if (st.participants && !isParticipant) {
    return (
      <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)", textAlign: "center" }}>
        <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>⚔️ Attack / Defend</h3>
        <p style={{ color: "#a09080", fontSize: 13, margin: 0, fontStyle: "italic" }}>
          {st.winner ? `It's over — ${st.winner === "tie" ? "a tie" : `${st.winner} team won`}.` : `You're spectating. Red ${st.scores.red} — Blue ${st.scores.blue}.`}
        </p>
      </Card>
    );
  }

  const myTeam = st.teams.red.includes(playerName) ? "red" : st.teams.blue.includes(playerName) ? "blue" : null;
  const active = st.activeAttack;
  const iAmAttacking = active && active.attacker === playerName;
  const enemyAttacking = active && active.team !== myTeam;
  const teammateAttacking = active && active.team === myTeam && active.attacker !== playerName;

  const resync = async () => {
    const fresh = await storageGet(gameId, STORAGE_KEY_ATTACK_DEFEND);
    if (fresh) updateSt(fresh);
  };

  const startAttack = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const res = await storageUpdate(gameId, STORAGE_KEY_ATTACK_DEFEND, (fresh) => {
        if (!fresh || fresh.activeAttack || fresh.usedAttack[playerName]) return null;
        fresh.usedAttack[playerName] = true;
        fresh.activeAttack = { attacker: playerName, team: myTeam, startedAt: Date.now(), points: 0, buttonPosition: { x: 40, y: 40 } };
        fresh.logs = [...(fresh.logs || []), { type: "attack", player: playerName, text: `${playerName} (${myTeam}) launched an attack!`, time: Date.now() }];
        return fresh;
      });
      if (res.ok) updateSt(res.value); else await resync();
    } finally {
      busyRef.current = false;
    }
  };

  // Rapid clicks are coalesced so only one write is ever in flight — clicks
  // that land while a write is pending are batched into the next one — with
  // points shown instantly and reconciled once each batch's write confirms.
  const flushClicks = async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      while (pendingClicksRef.current > 0) {
        const n = pendingClicksRef.current;
        pendingClicksRef.current = 0;
        const base = stRef.current;
        if (!base || !base.activeAttack || base.activeAttack.attacker !== playerName) {
          // Our own locally-known state (kept in sync with every successful
          // write and every realtime push) says this attack isn't ours
          // anymore — e.g. an enemy really did defend. Safe to stop here.
          setLocalBonus(0);
          break;
        }
        const next = JSON.parse(JSON.stringify(base));
        next.scores[myTeam] = (next.scores[myTeam] || 0) + n;
        next.activeAttack.points += n;
        next.activeAttack.buttonPosition = btnPosRef.current;
        const wrote = await storageSet(gameId, STORAGE_KEY_ATTACK_DEFEND, next);
        if (wrote) {
          updateSt(next);
          setLocalBonus((b) => Math.max(0, b - n));
        } else {
          // A real write failure — put the clicks back and try again shortly
          // rather than dropping them.
          pendingClicksRef.current += n;
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    } finally {
      flushingRef.current = false;
    }
  };

  const hit = () => {
    const np = { x: 10 + Math.random() * 78, y: 10 + Math.random() * 60 };
    setBtnPos(np);
    pendingClicksRef.current += 1;
    setLocalBonus((b) => b + 1); // instant feedback, reconciled once the batched write confirms
    flushClicks();
  };

  const defend = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const res = await storageUpdate(gameId, STORAGE_KEY_ATTACK_DEFEND, (fresh) => {
        if (!fresh || !fresh.activeAttack || fresh.activeAttack.team === myTeam || fresh.usedDefend[playerName]) return null;
        fresh.usedDefend[playerName] = true;
        fresh.logs = [...(fresh.logs || []), { type: "defend", player: playerName, text: `${playerName} defended — ${fresh.activeAttack.attacker}'s attack ended (${fresh.activeAttack.points} pts).`, time: Date.now() }];
        fresh.activeAttack = null;
        return fresh;
      });
      if (res.ok) updateSt(res.value); else await resync();
    } finally {
      busyRef.current = false;
    }
  };

  const displayedPoints = active ? active.points + (iAmAttacking ? localBonus : 0) : 0;

  return (
    <Card style={{ marginBottom: 20, borderColor: myTeam === "red" ? "rgba(196,92,60,0.4)" : "rgba(74,122,196,0.4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#c9a84c", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>⚔️ Attack / Defend</h3>
        <Badge color={myTeam === "red" ? "#c45c3c" : "#4a7ac4"}>{(myTeam || "?").toUpperCase()}</Badge>
      </div>
      <p style={{ fontSize: 13, color: "#a09080", margin: "0 0 8px" }}>Red {st.scores.red} — {st.scores.blue} Blue</p>
      {st.winner ? (
        <p style={{ textAlign: "center", color: "#c9a84c" }}>{st.winner === "tie" ? "It's a tie!" : `${st.winner.toUpperCase()} team wins! 🏆`}</p>
      ) : iAmAttacking ? (
        <div>
          <p style={{ fontSize: 12, color: "#c45c3c", margin: "0 0 6px" }}>ATTACK! Click the button fast — {displayedPoints} pts. Ends when an enemy defends.</p>
          <div style={{ position: "relative", height: 140, background: "#0a1020", borderRadius: 8, border: "1px solid #c45c3c55", overflow: "hidden" }}>
            <button onClick={hit} style={{
              position: "absolute", left: `${btnPos.x}%`, top: `${btnPos.y}%`, transform: "translate(-50%,-50%)",
              padding: "10px 16px", borderRadius: 8, background: "#c45c3c", color: "#fff", border: "none",
              fontWeight: 700, cursor: "pointer", fontSize: 14,
            }}>HIT!</button>
          </div>
        </div>
      ) : enemyAttacking ? (
        <div>
          <p style={{ fontSize: 13, color: "#c45c3c", margin: "0 0 8px", fontWeight: 600 }}>🚨 {active.attacker} is attacking your team! ({active.points} pts)</p>
          {!st.usedDefend[playerName] ? <Btn variant="danger" onClick={defend}>🛡️ DEFEND (end their attack)</Btn> : <p style={{ fontSize: 12, color: "#706050" }}>You've used your defend.</p>}
        </div>
      ) : teammateAttacking ? (
        <p style={{ fontSize: 13, color: "#a09080" }}>Your teammate {active.attacker} is attacking. Cheer them on!</p>
      ) : (
        <div>
          {!st.usedAttack[playerName] ? <Btn onClick={startAttack} disabled={!!active}>⚔️ Launch Attack (once)</Btn> : <p style={{ fontSize: 12, color: "#706050" }}>You've used your attack.</p>}
          {active && <p style={{ fontSize: 11, color: "#706050", marginTop: 4 }}>An attack is already underway.</p>}
        </div>
      )}
    </Card>
  );
}

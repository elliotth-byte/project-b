import { useState, useEffect } from "react";
import { Btn, Card, PausedBanner } from "./traitorsUi";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { STORAGE_KEY_MASQUERADE } from "../lib/masqueradeData";
import { TRAITORS_GAME_REGISTRY } from "../lib/traitorsMiniGames";
import TraitorsRulesGate from "./games/TraitorsRulesGate";

// ─── Masquerade Houses: Player View ───
export default function MasqueradePlayer({ gameId, playerName }) {
  const [st, setSt] = useState(null);
  const [shieldSel, setShieldSel] = useState([]);
  const [killerSel, setKillerSel] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_MASQUERADE, setSt);
    return unsubscribe;
  }, [gameId]);

  if (!st || !st.active) return null;
  if (st.paused) return <PausedBanner icon="🎭" title="Masquerade Houses" />;

  const myHouse = st.houses.find((h) => h.members.includes(playerName));
  const myGuess = st.guesses?.[playerName] || {};
  const eliminatedCount = st.houses.filter((h) => h.status === "eliminated").length;
  const done = eliminatedCount >= st.loseTarget;
  const others = st.players.filter((p) => p.name !== playerName);

  const toggle = (list, setList, name, max) => {
    if (list.includes(name)) setList(list.filter((n) => n !== name));
    else if (list.length < max) setList([...list, name]);
  };

  // Runs against a FRESH draft (from storageUpdate) rather than the possibly
  // stale locally-held `st`, so concurrent guesses from other players can't
  // clobber this house's resolution state.
  const resolveGuess = (fresh, type, members, myHouseId) => {
    if (type === "shield") {
      const h = fresh.houses.find((x) => x.id === myHouseId);
      const correct = h && [...h.members].sort().join() === [...members].sort().join();
      if (correct && h.status === "active") {
        h.status = "shielded";
        h.resolvedAt = Date.now();
        fresh.resolvedOrder.push({ houseId: h.id, result: "shielded", by: playerName, time: Date.now() });
      }
      return { correct, members, time: Date.now() };
    } else {
      const target = fresh.houses.find((x) => x.id !== myHouseId && x.status === "active" && [...x.members].sort().join() === [...members].sort().join());
      const correct = !!target;
      if (correct) {
        target.status = "eliminated";
        target.resolvedAt = Date.now();
        fresh.resolvedOrder.push({ houseId: target.id, result: "eliminated", by: playerName, time: Date.now() });
        // Winners aren't guessed — once enough houses are eliminated to hit
        // the mission's lose target, every house still standing is safe.
        const eliminatedCount = fresh.houses.filter((h) => h.status === "eliminated").length;
        if (eliminatedCount >= fresh.loseTarget) {
          fresh.houses.forEach((h) => {
            if (h.status === "active") {
              h.status = "shielded";
              h.resolvedAt = Date.now();
              fresh.resolvedOrder.push({ houseId: h.id, result: "shielded", by: null, time: Date.now() });
            }
          });
        }
      }
      return { correct, members, targetHouseId: target?.id || null, time: Date.now() };
    }
  };

  const submitShield = async () => {
    // shieldSel only ever holds OTHER members (see PickGrid below, which
    // picks from `others` — a player can't select themselves there), but
    // the SHIELD guess is "name every member of your own house", which
    // trivially always includes the guesser. Without adding playerName
    // back in here, the submitted set could never equal house.members
    // (resolveGuess's exact-match check) no matter who was picked — the
    // shield guess would be unwinnable by construction.
    if (shieldSel.length !== st.houseSize - 1 || myGuess.shieldGuess || done) return;
    const res = await storageUpdate(gameId, STORAGE_KEY_MASQUERADE, (fresh) => {
      if (!fresh || fresh.guesses[playerName]?.shieldGuess) return null;
      const house = fresh.houses.find((h) => h.members.includes(playerName));
      if (!house) return null;
      fresh.guesses[playerName] = { ...(fresh.guesses[playerName] || {}), shieldGuess: resolveGuess(fresh, "shield", [...shieldSel, playerName], house.id) };
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  const submitKiller = async () => {
    if (killerSel.length !== st.houseSize || myGuess.killerGuess || done) return;
    const res = await storageUpdate(gameId, STORAGE_KEY_MASQUERADE, (fresh) => {
      if (!fresh || fresh.guesses[playerName]?.killerGuess) return null;
      const house = fresh.houses.find((h) => h.members.includes(playerName));
      if (!house) return null;
      fresh.guesses[playerName] = { ...(fresh.guesses[playerName] || {}), killerGuess: resolveGuess(fresh, "killer", killerSel, house.id) };
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  const PickGrid = ({ sel, setSel, submit, existing, label, color, pickCount, note }) => (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color, margin: "0 0 4px" }}>{label} — pick exactly {pickCount}{note ? ` (${note})` : ""}</p>
      {existing ? (
        <p style={{ fontSize: 12, color: existing.correct ? "#7a9a5c" : "#c45c3c" }}>Submitted: {existing.correct ? "Correct!" : "Incorrect."}</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 6 }}>
            {others.map((p) => (
              <button key={p.id} onClick={() => toggle(sel, setSel, p.name, pickCount)} style={{
                fontSize: 12, padding: "6px 8px", borderRadius: 6, textAlign: "left", cursor: "pointer",
                background: sel.includes(p.name) ? "rgba(201,168,76,0.15)" : "#0a1020",
                border: `1px solid ${sel.includes(p.name) ? "#c9a84c" : "#253550"}`,
                color: sel.includes(p.name) ? "#c9a84c" : "#f0e6d3",
              }}>{sel.includes(p.name) ? "✓ " : ""}{p.name}</button>
            ))}
          </div>
          <Btn small onClick={submit} disabled={sel.length !== pickCount || done}>Submit {label}</Btn>
        </>
      )}
    </div>
  );

  const registryEntry = TRAITORS_GAME_REGISTRY[STORAGE_KEY_MASQUERADE];

  return (
    <TraitorsRulesGate icon={registryEntry.icon} label={registryEntry.label} blurb={registryEntry.blurb} resetKey={st.createdAt}>
    <Card style={{ marginBottom: 20, borderColor: "rgba(124,58,237,0.3)" }}>
      <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🎭 Masquerade Houses</h3>
      {myHouse ? (
        <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 8px" }}>
          Your house: <strong style={{ color: "#c9a84c" }}>{myHouse.name}</strong>. Find your housemates (SHIELD) and expose a rival house (KILLER).
        </p>
      ) : (
        <p style={{ fontSize: 12, color: "#706050" }}>You are a spectator this mission.</p>
      )}
      {done && <p style={{ fontSize: 12, color: "#c45c3c", marginBottom: 8 }}>Mission ended — {st.loseTarget} house{st.loseTarget === 1 ? "" : "s"} eliminated, every other house is safe.</p>}
      {myHouse && (
        <>
          <PickGrid sel={shieldSel} setSel={setShieldSel} submit={submitShield} existing={myGuess.shieldGuess} label="🛡️ SHIELD guess (your house)" color="#7a9a5c" pickCount={st.houseSize - 1} note="you're already counted" />
          <PickGrid sel={killerSel} setSel={setKillerSel} submit={submitKiller} existing={myGuess.killerGuess} label="🗡️ KILLER guess (a rival house)" color="#c45c3c" pickCount={st.houseSize} />
        </>
      )}
      <div style={{ fontSize: 11, color: "#706050" }}>
        {st.houses.filter((h) => h.status !== "active").map((h) => (
          <div key={h.id}>{h.status === "shielded" ? "🛡️" : "💀"} A house was {h.status}.</div>
        ))}
      </div>
    </Card>
    </TraitorsRulesGate>
  );
}

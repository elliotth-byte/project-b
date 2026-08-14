import { useState, useEffect } from "react";
import { Card, Badge, Btn } from "./ui";
import { subscribeGameState, storageUpdate } from "../lib/gameStorage";
import { KEY_EXILE, KEY_FINALE } from "../lib/gameState";
import { computeEliminateOutcome, computeSaveOutcome, computeFinaleOutcome } from "../lib/exileLogic";
import { exileContext, FINALE_CONTEXT, setChaosNullify, subscribeChaosSecret } from "../lib/chaosSecrets";
import { exileDrawContext, FINALE_DRAW_CONTEXT, submitChaosDrawPick, chaosPicksKey } from "../lib/chaosDraw";
import { chaosCardLabel } from "../lib/chaosCardNames";
import MemoryWall from "./MemoryWall";

// ─── The Power of Khaos ───
// Two stages. First, every eligible player (alive players during the
// Exile Vote; exiled players during the Finale) sees a row of N mystery
// buttons — N being however many players are actually in the draw that
// round — with exactly one secretly correct (see pages/api/chaos-draw.js;
// nobody's browser, winner included, ever receives that secret directly,
// only the outcome of their own pick). Each player gets ONE shot at ONE
// button. Whoever hits the right one becomes this round's holder —
// publicly, same as before. Second, once someone's won it, THEY get the
// familiar nullify-picker below (unchanged from before this rework).
export default function ChaosPowerPlayer({ gameId, round, player, players, readOnly = false, settings }) {
  const isExile = round?.phase === "exile";
  const isFinale = round?.phase === "finale";
  const key = isExile ? KEY_EXILE : isFinale ? KEY_FINALE : null;
  const votesKey = isExile ? `pb:exile-votes:${round.round}` : isFinale ? "pb:finale-votes" : null;
  const context = isExile ? exileContext(round?.round) : isFinale ? FINALE_CONTEXT : null;
  const drawContext = isExile ? exileDrawContext(round?.round) : isFinale ? FINALE_DRAW_CONTEXT : null;
  const hideAvatarNameLabels = settings?.avatarMode === "collection" && settings?.avatarCollectionId === "default-gods";

  const [state, setState] = useState(null);
  const [votes, setVotes] = useState({});
  const [myPick, setMyPick] = useState(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [savingReason, setSavingReason] = useState(false);
  const [drawPicks, setDrawPicks] = useState({});
  const [drawSubmitting, setDrawSubmitting] = useState(null); // index currently being submitted
  const [justWon, setJustWon] = useState(false);

  useEffect(() => {
    if (!key) return;
    const unsubscribe = subscribeGameState(gameId, key, setState);
    return unsubscribe;
  }, [gameId, key, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!votesKey) return;
    const unsubscribe = subscribeGameState(gameId, votesKey, (v) => setVotes(v || {}));
    return unsubscribe;
  }, [gameId, votesKey]);

  useEffect(() => {
    if (!context) return;
    const unsubscribe = subscribeChaosSecret(gameId, context, setMyPick);
    return unsubscribe;
  }, [gameId, context]);

  // Keep the draft in sync with whatever's actually saved — safe to do
  // unconditionally since only this player can ever write their own
  // chaos secret (RLS), so the only time this value changes remotely is
  // right after THEY save it.
  useEffect(() => {
    setReasonDraft(myPick?.reason || "");
  }, [myPick?.reason]);

  useEffect(() => {
    if (!drawContext) return;
    const unsubscribe = subscribeGameState(gameId, chaosPicksKey(drawContext), (v) => setDrawPicks(v || {}));
    return unsubscribe;
  }, [gameId, drawContext]);

  if (!key || !state) return null;

  const me = (players || []).find((p) => p.id === player?.id);
  const eligible = isExile ? me?.alive !== false : isFinale ? me?.alive === false : false;
  if (!eligible) return null;

  const iAmHolder = state.chaosHolderId === player?.id;
  // 0 is a valid button index, so this has to check for "picked at all",
  // not truthiness.
  const myDrawPick = drawPicks[player?.id];
  const hasPicked = myDrawPick !== undefined;
  const drawOpen = !state.chaosHolderId && state.votingOpen;
  const holderName = state.chaosHolderId ? (players || []).find((p) => p.id === state.chaosHolderId)?.display_name : null;
  const poolSize = isExile
    ? (players || []).filter((p) => p.approved && p.alive).length
    : (players || []).filter((p) => p.approved && !p.alive).length;
  // Any button someone's already tried is guaranteed wrong — if it were
  // right, chaosHolderId would already be set and we wouldn't be in this
  // branch at all — so these are safe to mark (and skip) for everyone.
  const triedIndices = new Set(Object.values(drawPicks));

  // ─── Stage 1: the draw ───
  if (!iAmHolder) {
    if (readOnly) {
      if (!drawOpen && !hasPicked && !holderName) return null;
      return (
        <Card style={{ marginBottom: 20, textAlign: "center" }}>
          <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#ff2d95", marginBottom: 6 }}>🃏 Power of Khaos</div>
          <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
            {holderName ? `${holderName} claimed it this round.` : hasPicked ? "Already made their pick." : drawOpen ? "Hasn't picked yet." : "The draw has closed."}
          </p>
        </Card>
      );
    }

    if (!drawOpen) {
      if (!holderName) return null; // draw closed, nobody claimed it — nothing worth showing
      return (
        <Card style={{ marginBottom: 20, textAlign: "center" }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>🃏</div>
          <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
            <strong style={{ color: "#ff3860" }}>{holderName}</strong> claimed the Power of Khaos this round.
          </p>
        </Card>
      );
    }

    if (hasPicked) {
      return (
        <Card style={{ marginBottom: 20, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🃏</div>
          <p style={{ color: "#f5f0ff", fontSize: 14, margin: 0 }}>You picked {chaosCardLabel(myDrawPick)} — {justWon ? "🎉 you claimed it!" : "hang tight."}</p>
        </Card>
      );
    }

    const pickDraw = async (index) => {
      setDrawSubmitting(index);
      const result = await submitChaosDrawPick(gameId, drawContext, index);
      setDrawSubmitting(null);
      if (result.error) { alert("Couldn't submit your pick: " + result.error); return; }
      setJustWon(!!result.won);
    };

    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🃏</div>
        <h3 style={{ color: "#f5f0ff", margin: "0 0 6px", fontSize: 16, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>The Power of Khaos</h3>
        <p style={{ color: "#a68fd6", fontSize: 12.5, fontStyle: "italic", margin: "0 0 12px", lineHeight: 1.5 }}>
          Some are born great, some achieve greatness, and some have greatness thrust upon them. In front of you are relics from
          mythology. Few bestowed glory — others brought disaster, but each of these iconic items promises chaos. In one of them,
          Khaos himself and his power lies. Can you guess where?
        </p>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 18px" }}>
          {poolSize} relics, one Power of Khaos. Pick one — you get one shot.
          {triedIndices.size > 0 && ` Already tried (and wrong): ${[...triedIndices].sort((a, b) => a - b).map((i) => chaosCardLabel(i)).join(", ")}.`}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 10 }}>
          {Array.from({ length: poolSize }, (_, i) => i).map((i) => {
            const tried = triedIndices.has(i);
            return (
              <Btn
                key={i}
                variant={tried ? "ghost" : "primary"}
                disabled={tried || drawSubmitting !== null}
                onClick={() => pickDraw(i)}
                style={{ padding: "14px 8px", fontSize: 12, lineHeight: 1.3, borderRadius: 12, opacity: tried ? 0.35 : 1 }}
              >
                {tried ? "✕" : "🃏"}
                <br />
                {chaosCardLabel(i)}
              </Btn>
            );
          })}
        </div>
      </Card>
    );
  }

  // ─── Stage 2: you won — choose who to nullify (unchanged) ───
  if (readOnly) {
    return (
      <Card style={{ marginBottom: 20, borderColor: "#ff2d95", boxShadow: "0 0 24px rgba(255,45,149,0.25)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 4 }}>🃏</div>
          <h3 style={{ color: "#ff2d95", margin: "0 0 4px", fontSize: 16, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            Holds the Power of Khaos
          </h3>
          <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>Their pick is kept secret until the reveal — even from this viewer.</p>
        </div>
      </Card>
    );
  }

  const candidates = isExile ? state.nominees : state.finalists;
  const nomineeIds = candidates.map((c) => c.playerId);
  const voteRows = Object.entries(votes).map(([voterId, v]) => ({ voterId, targetId: v.targetId }));
  const myPickId = myPick?.nomineeId || null;

  const [pendingPick, setPendingPick] = useState(null); // candidate selected but not yet locked in — reason is required before it actually submits

  const confirmPick = async () => {
    if (!pendingPick || !reasonDraft.trim()) return;
    const ok = await setChaosNullify(gameId, context, pendingPick, reasonDraft);
    if (!ok) { alert("Couldn't lock that in — try again."); return; }
    setPendingPick(null);
  };

  // Switching an already-locked pick reuses whatever reason is currently
  // in the box (they've already written one to get here) rather than
  // requiring a brand new one — but still can't be blanked out entirely.
  const changePick = async (nomineeId) => {
    if (!reasonDraft.trim()) { alert("Add a reason before changing your pick."); return; }
    const ok = await setChaosNullify(gameId, context, nomineeId, reasonDraft);
    if (!ok) alert("Couldn't lock that in — try again.");
  };

  const saveReason = async () => {
    if (!myPickId) return;
    setSavingReason(true);
    const ok = await setChaosNullify(gameId, context, myPickId, reasonDraft);
    setSavingReason(false);
    if (!ok) alert("Couldn't save — try again.");
  };

  // Tie-break only becomes relevant once voting has actually closed —
  // no point computing it while votes are still coming in.
  let outcome = null;
  if (!state.votingOpen) {
    if (isExile) {
      outcome = state.mode === "save"
        ? computeSaveOutcome(voteRows, myPickId, nomineeIds)
        : computeEliminateOutcome(voteRows, myPickId, nomineeIds);
    } else {
      outcome = computeFinaleOutcome(voteRows, myPickId, nomineeIds, state.tieBreakChoiceId);
    }
  }
  const needsTieBreak = outcome?.needsTieBreak && !state.tieBreakChoiceId;
  const tied = outcome?.tied || [];

  const breakTie = async (nomineeId) => {
    await storageUpdate(gameId, key, (fresh) => {
      if (!fresh) return null;
      fresh.tieBreakChoiceId = nomineeId;
      return fresh;
    });
  };

  const byId = {};
  candidates.forEach((c) => (byId[c.playerId] = c.name));

  return (
    <Card style={{ marginBottom: 20, borderColor: "#ff2d95", boxShadow: "0 0 24px rgba(255,45,149,0.25)" }}>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 32, marginBottom: 4 }}>🃏</div>
        <h3 style={{ color: "#ff2d95", margin: "0 0 4px", fontSize: 16, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
          You hold the Power of Khaos
        </h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>
          {isExile
            ? state.mode === "save"
              ? "Choose whose save-votes to nullify entirely — kept secret from everyone else until the reveal."
              : "Choose who can't be exiled this round, no matter how many votes they get — kept secret from everyone else until the reveal."
            : "Choose which finalist can never win — kept secret from everyone else until the reveal."}
        </p>
      </div>

      {needsTieBreak ? (
        <div>
          <p style={{ color: "#ff3860", fontSize: 13, fontWeight: 700, textAlign: "center", margin: "0 0 10px" }}>🃏 It's tied — you have to break it.</p>
          <MemoryWall candidates={tied.map((id) => ({ playerId: id, name: byId[id] }))} players={players} selectedId={state.tieBreakChoiceId} onSelect={breakTie} hideNameLabels={hideAvatarNameLabels} />
        </div>
      ) : state.tieBreakChoiceId ? (
        <p style={{ color: "#00ff9d", fontSize: 13, textAlign: "center", margin: 0 }}>✓ Tie broken — {byId[state.tieBreakChoiceId]}.</p>
      ) : myPickId ? (
        <div style={{ textAlign: "center" }}>
          <Badge color="#ff2d95">Locked in: {byId[myPickId] || "?"}</Badge>
          {state.votingOpen && (
            <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 8, fontStyle: "italic" }}>You can still change your mind while voting's open.</p>
          )}
          <Card style={{ marginTop: 12, textAlign: "left" }}>
            <label style={{ display: "block", fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              Why? (required — shown when votes are revealed)
            </label>
            <textarea
              value={reasonDraft}
              onChange={(e) => setReasonDraft(e.target.value)}
              maxLength={280}
              rows={2}
              placeholder="Say your piece..."
              style={{ width: "100%", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", color: "#f5f0ff", fontSize: 13, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", resize: "vertical", boxSizing: "border-box", marginBottom: 8 }}
            />
            <Btn small onClick={saveReason} disabled={savingReason || !reasonDraft.trim() || reasonDraft === (myPick?.reason || "")}>
              {savingReason ? "Saving..." : "Save"}
            </Btn>
          </Card>
          {state.votingOpen && (
            <div style={{ marginTop: 12 }}>
              <MemoryWall candidates={candidates} players={players} selectedId={myPickId} onSelect={changePick} hideNameLabels={hideAvatarNameLabels} />
            </div>
          )}
        </div>
      ) : (
        <div>
          <MemoryWall candidates={candidates} players={players} selectedId={pendingPick} onSelect={setPendingPick} hideNameLabels={hideAvatarNameLabels} />
          {pendingPick && (
            <Card style={{ marginTop: 12, textAlign: "left" }}>
              <label style={{ display: "block", fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                Why? (required — shown when votes are revealed)
              </label>
              <textarea
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
                maxLength={280}
                rows={2}
                placeholder="Say your piece..."
                style={{ width: "100%", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", color: "#f5f0ff", fontSize: 13, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", resize: "vertical", boxSizing: "border-box", marginBottom: 8 }}
              />
              <Btn small onClick={confirmPick} disabled={!reasonDraft.trim()}>Lock It In</Btn>
            </Card>
          )}
        </div>
      )}
    </Card>
  );
}

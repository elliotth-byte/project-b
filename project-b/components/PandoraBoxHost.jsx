import { useState, useEffect, useRef } from "react";
import { Btn, Card, Badge, PauseResumeControls } from "./traitorsUi";
import { storageSet, storageUpdate, storageDelete, subscribeGameState } from "../lib/gameStorage";
import { pauseChallenge, resumeChallenge } from "../lib/pauseResume";
import { fmtTime } from "../lib/hotPotatoData";
import { PANDORA_TIMER_PRESETS, computePandoraEligible, pandoraStatusMeta, STORAGE_KEY_PANDORA } from "../lib/pandoraData";
import { pandoraOpenScript, pandoraOpenedScript, pandoraExpiredScript } from "../lib/slackScripts";
import { logChallengeResult } from "../lib/challengeHistory";
import PandoraCountdown from "./PandoraCountdown";
import PostToSlack from "./PostToSlack";

// ─── Pandora's Box: Host Control ───
//
// Scope note: the original also had a "PostableScript" button here to copy
// an announcement into Slack when the box opened/expired. That's dropped
// in this pass along with the rest of the Slack integration (see the
// Roundtable conversion notes for the same call) — the outcome is still
// shown directly in the host UI below, just not pushed to Slack.
export default function PandoraBoxHost({ gameId, alive, allPlayers }) {
  const [st, setSt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [presetMinutes, setPresetMinutes] = useState(15);
  const [customMinutes, setCustomMinutes] = useState("");
  const [eligibleMode, setEligibleMode] = useState("alive");
  const [selectedNames, setSelectedNames] = useState([]);
  const [resetConfirm, setResetConfirm] = useState(false);
  const loggedStatusRef = useRef(null);

  useEffect(() => {
    if (!st) { loggedStatusRef.current = null; return; }
    if (loggedStatusRef.current !== st.status && ["opened", "closed", "expired"].includes(st.status)) {
      loggedStatusRef.current = st.status;
      logChallengeResult(gameId, {
        challenge: "Pandora's Box",
        winners: st.status === "opened" ? [st.openedBy.playerName] : [],
        note: st.status === "opened" ? "Opened it" : st.status === "closed" ? "Closed early, unopened" : "Expired, unopened",
      });
    }
  }, [gameId, st?.status]);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_PANDORA, (value) => {
      setSt(value);
      setLoading(false);
    });
    return unsubscribe;
  }, [gameId]);

  // Client-side expiry detection: if we notice time is up but status is
  // still "active", flip it to expired so hosts don't have to babysit it.
  useEffect(() => {
    if (!st || st.status !== "active" || !st.expiresAt || st.paused) return;
    const id = window.setInterval(async () => {
      if (Date.now() > st.expiresAt) {
        const res = await storageUpdate(gameId, STORAGE_KEY_PANDORA, (fresh) => {
          if (!fresh || fresh.status !== "active") return null;
          if (fresh.openedBy) return null;
          return { ...fresh, status: "expired", active: false };
        });
        if (res.ok) setSt(res.value);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [gameId, st?.status, st?.expiresAt, st?.paused]);

  const toggleSelected = (name) => setSelectedNames((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);

  const start = async () => {
    const minutes = customMinutes ? Number(customMinutes) : presetMinutes;
    if (!minutes || minutes <= 0) { alert("Set a valid timer duration."); return; }
    if (eligibleMode === "selected" && selectedNames.length === 0) { alert("Select at least one eligible player."); return; }
    const now = Date.now();
    const durationMs = minutes * 60 * 1000;
    const eligibleNames = computePandoraEligible(eligibleMode, alive, allPlayers, selectedNames);
    const state = {
      status: "active", active: true, startedAt: now, durationMs, expiresAt: now + durationMs,
      openedBy: null, players: allPlayers.map((p) => ({ id: p.id, name: p.name })),
      eligiblePlayers: eligibleMode, eligibleNames,
      selectedPlayers: eligibleMode === "selected" ? selectedNames : [],
      resultArchived: false, history: st?.history || [],
    };
    await storageSet(gameId, STORAGE_KEY_PANDORA, state);
    setSt(state);
  };

  const closeEarly = async () => {
    const res = await storageUpdate(gameId, STORAGE_KEY_PANDORA, (fresh) => {
      if (!fresh || fresh.status !== "active") return null;
      return { ...fresh, status: "closed", active: false };
    });
    if (res.ok) setSt(res.value);
  };

  const archive = async () => {
    const res = await storageUpdate(gameId, STORAGE_KEY_PANDORA, (fresh) => {
      if (!fresh || fresh.resultArchived) return null;
      const record = { status: fresh.status, openedBy: fresh.openedBy, startedAt: fresh.startedAt, endedAt: Date.now(), durationMs: fresh.durationMs };
      return { ...fresh, resultArchived: true, history: [...(fresh.history || []), record] };
    });
    if (res.ok) setSt(res.value);
  };

  const reset = async () => {
    await storageDelete(gameId, STORAGE_KEY_PANDORA);
    setSt(null);
    setResetConfirm(false);
  };

  const pause = async () => {
    const r = await pauseChallenge(gameId, STORAGE_KEY_PANDORA, (fresh, now) => { fresh.remainingMs = Math.max(0, fresh.expiresAt - now); });
    if (r.ok) setSt(r.value);
  };
  const resume = async () => {
    const r = await resumeChallenge(gameId, STORAGE_KEY_PANDORA, (fresh, pausedAt, now) => {
      fresh.expiresAt = now + (fresh.remainingMs ?? Math.max(0, fresh.expiresAt - pausedAt));
      fresh.remainingMs = null;
    });
    if (r.ok) setSt(r.value);
  };

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  const status = st?.status || "inactive";
  const meta = pandoraStatusMeta(status);

  return (
    <Card style={{ borderColor: "rgba(201,168,76,0.35)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#f0e6d3", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>📦 Pandora's Box</h3>
        <Badge color={meta.color}>{meta.label}</Badge>
      </div>

      {status === "inactive" && (
        <div>
          <p style={{ color: "#a09080", fontSize: 13, margin: "0 0 12px", fontStyle: "italic" }}>Pandora's Box is inactive. Choose a timer and open the window.</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {PANDORA_TIMER_PRESETS.map((p) => (
              <button key={p.minutes} onClick={() => { setPresetMinutes(p.minutes); setCustomMinutes(""); }} style={{
                padding: "5px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                background: !customMinutes && presetMinutes === p.minutes ? "rgba(201,168,76,0.15)" : "#0a1020",
                border: `1px solid ${!customMinutes && presetMinutes === p.minutes ? "#c9a84c" : "#253550"}`,
                color: !customMinutes && presetMinutes === p.minutes ? "#c9a84c" : "#a09080",
              }}>{p.label}</button>
            ))}
            <input value={customMinutes} onChange={(e) => setCustomMinutes(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Custom min"
              style={{ width: 90, background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: "5px 8px", color: "#f0e6d3", fontSize: 12 }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#a09080", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Eligible players</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {[["alive", `Alive (${alive.length})`], ["all", `All (${allPlayers.length})`], ["selected", "Selected"]].map(([v, label]) => (
                <button key={v} onClick={() => setEligibleMode(v)} style={{
                  padding: "4px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                  background: eligibleMode === v ? "rgba(201,168,76,0.15)" : "#0a1020",
                  border: `1px solid ${eligibleMode === v ? "#c9a84c" : "#253550"}`, color: eligibleMode === v ? "#c9a84c" : "#a09080",
                }}>{label}</button>
              ))}
            </div>
            {eligibleMode === "selected" && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {allPlayers.map((p) => (
                  <button key={p.id} onClick={() => toggleSelected(p.name)} style={{
                    padding: "3px 9px", borderRadius: 5, fontSize: 11, cursor: "pointer",
                    background: selectedNames.includes(p.name) ? "rgba(201,168,76,0.15)" : "#0a1020",
                    border: `1px solid ${selectedNames.includes(p.name) ? "#c9a84c" : "#253550"}`,
                    color: selectedNames.includes(p.name) ? "#c9a84c" : "#a09080",
                  }}>{p.name}</button>
                ))}
              </div>
            )}
          </div>
          <Btn onClick={start} disabled={allPlayers.length === 0}>Start Pandora's Box</Btn>
          <div style={{ marginTop: 10 }}>
            <PostToSlack gameId={gameId} icon="📦" label="Opening the Window" text={pandoraOpenScript()} />
          </div>
        </div>
      )}

      {status === "active" && (
        <div>
          <p style={{ color: "#a09080", fontSize: 13, margin: "0 0 8px" }}>Pandora's Box is active{st.paused ? " — paused" : ""}.</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: "#c9a84c", fontFamily: "'Courier New', monospace", margin: "0 0 12px" }}>
            {st.paused ? fmtTime(st.remainingMs ?? 0) : <PandoraCountdown expiresAt={st.expiresAt} />}
          </p>
          <p style={{ fontSize: 11, color: "#706050", margin: "0 0 10px" }}>Eligible: {st.eligiblePlayers} ({st.eligibleNames.length} players)</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Btn variant="danger" small onClick={closeEarly}>Close Early</Btn>
            <Btn variant="ghost" small onClick={reset}>Reset</Btn>
            <PauseResumeControls paused={!!st.paused} onPause={pause} onResume={resume} />
          </div>
        </div>
      )}

      {(status === "opened" || status === "closed" || status === "expired") && (
        <div>
          {status === "opened" ? (
            <p style={{ color: "#c9a84c", fontSize: 14, margin: "0 0 12px" }}>
              Pandora's Box was opened by <strong>{st.openedBy.playerName}</strong> at {new Date(st.openedBy.openedAt).toLocaleTimeString()}.
            </p>
          ) : (
            <p style={{ color: "#c45c3c", fontSize: 14, margin: "0 0 12px" }}>Pandora's Box closed unopened.</p>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
            {!st.resultArchived ? <Btn variant="success" small onClick={archive}>Archive Result</Btn> : <Badge color="#7a9a5c">Archived</Badge>}
            {resetConfirm ? (
              <>
                <span style={{ color: "#c45c3c", fontSize: 12, alignSelf: "center" }}>Reset the box?</span>
                <Btn variant="danger" small onClick={reset}>Yes, Reset</Btn>
                <Btn variant="ghost" small onClick={() => setResetConfirm(false)}>Cancel</Btn>
              </>
            ) : (
              <Btn variant="ghost" small onClick={() => setResetConfirm(true)}>Reset</Btn>
            )}
          </div>
          <div style={{ marginTop: 10 }}>
            <PostToSlack
              gameId={gameId}
              icon="📦"
              label={status === "opened" ? "Someone Opened It" : "It Expired"}
              text={status === "opened" ? pandoraOpenedScript(st.openedBy.playerName) : pandoraExpiredScript()}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

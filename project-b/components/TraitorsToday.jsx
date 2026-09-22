import { useState, useEffect } from "react";
import { Btn, Card, Badge } from "./traitorsUi";
import ChallengeErrorBoundary from "./ChallengeErrorBoundary";
import { subscribeSchedule } from "../lib/traitorsSchedule";
import { subscribeCurrentDay, startSchedule, advanceToNextDay } from "../lib/traitorsPhaseEngine";
import { subscribePreEliminationStatus } from "../lib/traitorsMasqueradeGate";
import TraitorsWorkDayGate from "./TraitorsWorkDayGate";

import WordHost from "./WordHost";
import CasinoHost from "./CasinoHost";
import HotPotatoHost from "./HotPotatoHost";
import ZombieHost from "./ZombieHost";
import PiggyHost from "./PiggyHost";
import AttackDefendHost from "./AttackDefendHost";
import VoodooHost from "./VoodooHost";
import Maze3DHost from "./Maze3DHost";
import CoffinHost from "./CoffinHost";
import IcebreakerHost from "./IcebreakerHost";
import PandoraBoxHost from "./PandoraBoxHost";
import RoundtableHost from "./RoundtableHost";
import MurderVoteHost from "./MurderVoteHost";
import TraitorRolesHost from "./TraitorRolesHost";

// Every one of these mission components already shares the exact same
// prop shape (gameId, alive, {...participantProps}) — confirmed
// directly against how components/TraitorsHostPanels.jsx's own
// "Challenges" tab already mounts every one of them, which is what
// makes a single lookup table like this possible instead of needing a
// bespoke switch-case per mission.
const MISSION_COMPONENTS = {
  words: WordHost,
  casino: CasinoHost,
  hotpotato: HotPotatoHost,
  zombie: ZombieHost,
  piggy: PiggyHost,
  attackdefend: AttackDefendHost,
  voodoo: VoodooHost,
  maze3d: Maze3DHost,
  coffin: CoffinHost,
  icebreaker: IcebreakerHost,
  // masquerade deliberately excluded — that mission only ever runs
  // through the Week 0 pre-elimination gate (see
  // components/TraitorsMasqueradeGate.jsx), never as a numbered-
  // schedule day's own mission.
};

// ─── Today (host) ───
// See lib/traitorsPhaseEngine.js's own header for the full reasoning
// and honest scope of what this stage does and doesn't yet do. This is
// the new, schedule-driven dashboard — what's actually live today,
// embedding the real existing components for whatever today's events
// list says should be happening, rather than a host having to
// remember which of the old always-open tabs to go use.
export default function TraitorsToday({ gameId, aliveMapped, allMapped, participantProps, approvedPlayers, tr, settings }) {
  const [schedule, setSchedule] = useState([]);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [preElimStatus, setPreElimStatus] = useState(null);
  const [loaded, setLoaded] = useState({ schedule: false, day: false, preElim: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeSchedule(gameId, (v) => { setSchedule(v); setLoaded((l) => ({ ...l, schedule: true })); }), [gameId]);
  useEffect(() => subscribeCurrentDay(gameId, (v) => { setCurrentDayIndex(v); setLoaded((l) => ({ ...l, day: true })); }), [gameId]);
  useEffect(() => subscribePreEliminationStatus(gameId, (v) => { setPreElimStatus(v); setLoaded((l) => ({ ...l, preElim: true })); }), [gameId]);

  if (!loaded.schedule || !loaded.day || !loaded.preElim) {
    return <Card><p style={{ color: "#7a6a52", fontStyle: "italic" }}>Loading...</p></Card>;
  }

  if (schedule.length === 0) {
    return (
      <Card>
        <h3 style={{ color: "#f0e6d3", margin: "0 0 6px", fontSize: 15 }}>📅 Today</h3>
        <p style={{ color: "#7a6a52", fontSize: 12, margin: 0 }}>
          No schedule set yet — build one in the Admin tab first (there's a one-click 26-player template there too).
        </p>
      </Card>
    );
  }

  const maxDayIndex = schedule[schedule.length - 1]?.dayIndex || 0;

  if (currentDayIndex === 0) {
    const preElimApplied = !!preElimStatus?.applied;
    const start = async () => {
      setBusy(true);
      const res = await startSchedule(gameId);
      setBusy(false);
      if (!res.ok) alert(res.reason === "masquerade-not-applied" ? "Run and apply the Masquerade pre-elimination first (Traitor Roles tab)." : "Couldn't start the schedule.");
    };
    return (
      <Card style={{ borderColor: "rgba(201,168,76,0.4)" }}>
        <h3 style={{ color: "#f0e6d3", margin: "0 0 6px", fontSize: 15 }}>📅 Ready to Begin</h3>
        <p style={{ color: "#7a6a52", fontSize: 12, margin: "0 0 10px" }}>
          {preElimApplied
            ? `${schedule.length}-day schedule loaded. Starting begins Day 1: "${schedule[0].label}".`
            : "The Masquerade pre-elimination needs to run and be applied first (Traitor Roles tab) before Day 1 can start."}
        </p>
        <Btn onClick={start} disabled={busy || !preElimApplied}>{busy ? "Starting..." : "Start Schedule — Day 1"}</Btn>
      </Card>
    );
  }

  const today = schedule.find((d) => d.dayIndex === currentDayIndex);
  if (!today) {
    return (
      <Card style={{ borderColor: "rgba(201,168,76,0.4)" }}>
        <h3 style={{ color: "#f0e6d3", margin: "0 0 6px", fontSize: 15 }}>📅 Schedule Complete</h3>
        <p style={{ color: "#7a6a52", fontSize: 12, margin: 0 }}>
          Day {currentDayIndex} isn't in the current schedule — either it's finished, or the schedule was edited after the season started.
        </p>
      </Card>
    );
  }

  const advance = async () => {
    setBusy(true);
    await advanceToNextDay(gameId, maxDayIndex);
    setBusy(false);
  };
  const isLastDay = currentDayIndex >= maxDayIndex;
  const MissionComponent = today.missionKey ? MISSION_COMPONENTS[today.missionKey] : null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card style={{ borderColor: "rgba(201,168,76,0.4)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h3 style={{ color: "#f0e6d3", margin: 0, fontSize: 15 }}>📅 Day {today.dayIndex} — {today.label}</h3>
          <Badge>{today.events.join(" · ") || "no events"}</Badge>
        </div>
        {today.notes && <p style={{ color: "#7a6a52", fontSize: 11, fontStyle: "italic", margin: "0 0 8px" }}>{today.notes}</p>}
        <Btn small onClick={advance} disabled={busy || isLastDay}>
          {isLastDay ? "Last scheduled day" : busy ? "Advancing..." : `Advance to Day ${currentDayIndex + 1} →`}
        </Btn>
      </Card>

      {today.missionKey && !MissionComponent && (
        <Card style={{ borderColor: "rgba(196,92,60,0.4)" }}>
          <p style={{ fontSize: 12, color: "#c45c3c", margin: 0 }}>
            "{today.missionLabel}" doesn't have a built mission behind it yet — substitute one manually from the Challenges tab, or edit today's schedule entry.
          </p>
        </Card>
      )}

      <TraitorsWorkDayGate gameId={gameId}>
        <div style={{ display: "grid", gap: 16 }}>
          {MissionComponent && (
            <ChallengeErrorBoundary label={today.missionLabel || today.missionKey}>
              <MissionComponent gameId={gameId} alive={aliveMapped} {...participantProps} />
            </ChallengeErrorBoundary>
          )}

          {today.events.includes("traitor-selection") && (
            <ChallengeErrorBoundary label="Traitor Roles"><TraitorRolesHost gameId={gameId} players={approvedPlayers} /></ChallengeErrorBoundary>
          )}

          {(today.events.includes("murder") || today.events.includes("instant-murder")) && (
            <ChallengeErrorBoundary label="Murder Vote"><MurderVoteHost gameId={gameId} players={approvedPlayers} tr={tr} /></ChallengeErrorBoundary>
          )}

          {today.events.includes("roundtable") && (
            <ChallengeErrorBoundary label="Roundtable"><RoundtableHost gameId={gameId} players={approvedPlayers} settings={settings} /></ChallengeErrorBoundary>
          )}

          {today.events.includes("pandoras-box") && (
            <ChallengeErrorBoundary label="Pandora's Box"><PandoraBoxHost gameId={gameId} alive={aliveMapped} allPlayers={allMapped} /></ChallengeErrorBoundary>
          )}
        </div>
      </TraitorsWorkDayGate>

      {today.events.includes("endgame") && (
        <Card style={{ borderColor: "rgba(196,92,60,0.4)", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "#f0e6d3", margin: 0 }}>🏁 This is the scheduled endgame day — see the History & Log tab for the finale flow.</p>
        </Card>
      )}
    </div>
  );
}

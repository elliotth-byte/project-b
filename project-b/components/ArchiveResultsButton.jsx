import { useState } from "react";
import { Btn } from "./traitorsUi";
import { archiveChallenge } from "../lib/challengeArchive";

// Drop this in next to a challenge's Clear/Reset button once it has ended.
// Deliberately host-triggered (not automatic) — per Enhancement 7, the host
// decides what's worth preserving, and can archive mid-game snapshots too
// (e.g. "save this round's board before I clear it for the next one").
export default function ArchiveResultsButton({
  gameId, challengeId, challengeName, round, participants, spectators,
  winner, resultSummary, finalState, startedAt,
}) {
  const [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState(false);

  const doArchive = async () => {
    setBusy(true);
    await archiveChallenge(gameId, {
      challengeId, challengeName, round: round ?? null,
      participants: participants || [], spectators: spectators || [],
      winner: winner ?? null, resultSummary: resultSummary || "",
      finalState: finalState ?? null,
      startedAt: startedAt ?? null, endedAt: Date.now(),
    });
    setBusy(false);
    setArchived(true);
    window.setTimeout(() => setArchived(false), 2500);
  };

  return (
    <Btn small variant="ghost" onClick={doArchive} disabled={busy}>
      {archived ? "Archived ✓" : "📦 Archive Results"}
    </Btn>
  );
}

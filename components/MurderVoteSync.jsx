import { useState, useEffect } from "react";
import { subscribeTraitorState, traitorStorageUpdate } from "../lib/traitorStorage";
import { hidePendingVictims } from "../lib/pendingMurders";
import { murderVoteKey, reconcileEligibleTargets, reconcileOpenMurderVote, sameNameSet } from "../lib/murderVoteData";

const FACTIONS = ["traitor-red", "traitor-black"];

// ─── Murder Vote: roster sync (renders nothing) ───
// An open murder vote's target list is a snapshot taken when the host opens
// it. This keeps that snapshot true to the live roster — drops anyone who has
// since been banished, murdered, walked or removed, picks up shield / role
// changes — see reconcileEligibleTargets in lib/murderVoteData.js.
//
// It's mounted ONCE at the top of the Traitors host console rather than
// inside the Murder Vote panel on purpose: that panel lives on the Traitor
// Roles tab, but a banish happens on the Roundtable tab, so a sync that only
// ran while the Murder Vote panel was on screen left the Turret listing a
// banished player until the host happened to switch tabs. Here it runs no
// matter which tab is open.
//
// Safe to run alongside MurderVoteHost's own copy of this check: every write
// goes through a version-checked update that does nothing if the list is
// already right, so whichever gets there first wins and the other no-ops.
export default function MurderVoteSync({ gameId, players: rawPlayers, tr }) {
  const [votes, setVotes] = useState({});

  useEffect(() => {
    const unsubscribes = FACTIONS.map((faction) =>
      subscribeTraitorState(gameId, murderVoteKey(faction), (value) => {
        setVotes((prev) => ({ ...prev, [faction]: value }));
      })
    );
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [gameId]);

  useEffect(() => {
    if (!tr) return;
    // Murders waiting on the Afternoon Tea reveal count as dead here, the same
    // way every other host panel treats them — see lib/pendingMurders.js.
    const players = hidePendingVictims(rawPlayers, tr);
    FACTIONS.forEach((faction) => {
      const vote = votes[faction];
      if (!vote || vote.status !== "open") return;
      const wanted = reconcileEligibleTargets(vote, players, tr.roles, tr.shielded, faction);
      if (sameNameSet(wanted, vote.eligibleTargets)) return;
      reconcileOpenMurderVote(gameId, faction, players, tr, traitorStorageUpdate);
    });
  }, [votes, rawPlayers, tr, gameId]);

  return null;
}

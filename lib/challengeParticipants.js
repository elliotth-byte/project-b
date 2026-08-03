// Enhancement 9: Challenge Participation Controls.
//
// Every challenge Host component builds its roster from an `alive` list
// handed down by HostPanels. This is the one place that decides who
// actually ends up in that roster once the host has a choice — everything
// downstream (each challenge's own start()) just consumes the result.
//
// Default config reproduces the old, only-ever behavior exactly (all alive
// players, nobody spectating) — so any challenge that doesn't add the
// picker UI still behaves exactly as it always did.
export const DEFAULT_PARTICIPATION = {
  mode: "all", // "all" | "manual"
  manualSelected: [], // names — only used when mode === "manual"
  excludeShielded: false,
  includeEliminatedSpectators: false,
  includeReturned: false,
};

// alive/allPlayers: [{ id, name }]. shieldedNames/returnedNames: [name].
export function computeParticipants(config, { alive, allPlayers, shieldedNames = [], returnedNames = [] }) {
  const cfg = { ...DEFAULT_PARTICIPATION, ...config };

  let participants = cfg.mode === "manual"
    ? alive.filter((p) => cfg.manualSelected.includes(p.name))
    : alive.slice();

  if (cfg.excludeShielded) {
    participants = participants.filter((p) => !shieldedNames.includes(p.name));
  }

  if (cfg.includeReturned) {
    const missing = alive.filter(
      (p) => returnedNames.includes(p.name) && !participants.some((x) => x.name === p.name)
    );
    participants = [...participants, ...missing];
  }

  let spectators = [];
  if (cfg.includeEliminatedSpectators) {
    spectators = allPlayers.filter((p) => !alive.some((a) => a.name === p.name));
  }
  // Alive players who exist but were left out of the participant set
  // (excluded by manual selection or the shielded filter) still see the
  // challenge, just without controls — they're spectators too.
  const excludedAlive = alive.filter(
    (p) => !participants.some((x) => x.name === p.name) && !spectators.some((x) => x.name === p.name)
  );
  spectators = [...spectators, ...excludedAlive];

  return { participants, spectators };
}

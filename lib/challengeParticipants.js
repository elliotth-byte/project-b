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
};

// alive: [{ id, name }].
export function computeParticipants(config, { alive }) {
  const cfg = { ...DEFAULT_PARTICIPATION, ...config };

  const participants = cfg.mode === "manual"
    ? alive.filter((p) => cfg.manualSelected.includes(p.name))
    : alive.slice();

  // Alive players left out of the participant set (manual mode only)
  // still see the challenge, just without controls — they're spectators.
  const spectators = alive.filter((p) => !participants.some((x) => x.name === p.name));

  return { participants, spectators };
}

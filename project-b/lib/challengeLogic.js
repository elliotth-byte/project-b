// ============================================================
// Pure logic for the Challenge phase — no storage dependency, so this is
// unit-testable and shared unchanged between the browser and the
// server-side round-advance routes (see lib/roundEngine.js).
//
// Rules encoded here:
//   - 1st place wins immunity (safe from nomination and from the vote).
//   - Top 3 finishers win the ability to make a nomination.
//   - Final Four: only 1st place is safe; the other three are ALL
//     automatically nominated (no nominations phase needed at all).
// ============================================================

// placements: [{ playerId, name, place }] — place is 1-indexed, 1 = first.
export function rankPlacements(placements) {
  return [...(placements || [])].sort((a, b) => a.place - b.place);
}

export function getImmuneWinner(placements) {
  const ranked = rankPlacements(placements);
  return ranked[0] || null;
}

// Normal round (5+ players still alive): top 3 finishers get to nominate.
export function getNominators(placements) {
  return rankPlacements(placements).slice(0, 3);
}

// isFinalFour = exactly 4 players competed this round.
export function computeChallengeOutcome(placements, isFinalFour) {
  const ranked = rankPlacements(placements);
  const winner = ranked[0] || null;

  if (isFinalFour) {
    // Only the winner is safe. The other three are automatically
    // nominated — no Fates Ceremony nominations needed this round.
    return {
      finalFour: true,
      winner,
      nominators: [],
      autoNominees: ranked.slice(1),
    };
  }

  return {
    finalFour: false,
    winner,
    nominators: ranked.slice(0, 3),
    autoNominees: [],
  };
}

// A challenge is only "complete" once every participant has a distinct,
// assigned place from 1..N with no gaps/duplicates.
export function placementsComplete(placements, participantCount) {
  if (!placements || placements.length !== participantCount) return false;
  const places = placements.map((p) => p.place).sort((a, b) => a - b);
  return places.every((p, i) => p === i + 1);
}

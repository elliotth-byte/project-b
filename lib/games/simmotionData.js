// ─── Simmotion ───
// Adapted from the real Survivor challenge: a ball drops into a spiral
// track and exits at one of two points a few seconds later. Catch it
// (tap the matching side) in time and it goes back in, staying in play;
// miss the window and it "exits uncaught" — instant elimination, exactly
// like the real rule. Additional balls join at intervals up to a max,
// same escalating-difficulty shape as the original. Solo endurance, not
// shared state — like Snake or Minesweeper, each player plays their own
// independent run rather than interacting with anyone else's board.

export const MAX_BALLS = 4;
export const BALL_ADD_INTERVAL_MS = 15000; // a new ball joins this often, until MAX_BALLS are in play
const TRAVEL_MS = 2600; // how long a ball takes to travel from drop to exit
const CATCH_WINDOW_MS = 700; // the tail end of that travel time during which a tap on the matching side actually catches it

function randomSide() {
  return Math.random() < 0.5 ? "left" : "right";
}

export function makeBall(id, now) {
  return { id, side: randomSide(), droppedAt: now, exitsAt: now + TRAVEL_MS };
}

// "catchable" = within CATCH_WINDOW_MS of its exit moment but not past
// it yet. Tapping the matching side while catchable succeeds; tapping
// too early does nothing (matches nothing being ready to catch yet).
export function isCatchable(ball, now) {
  return now >= ball.exitsAt - CATCH_WINDOW_MS && now < ball.exitsAt;
}

export function hasExited(ball, now) {
  return now >= ball.exitsAt;
}

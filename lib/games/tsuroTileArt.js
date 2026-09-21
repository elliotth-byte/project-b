import { rotatedDesign } from "./tsuroCore";

// ─── Shared tile art for River Styx / The Wine-Dark Sea ───
// Same black-figure Greek pottery palette this app already established
// for Life's a Tapestry (lib/games/lifesTapestryData.js) — terracotta
// CLAY paths outlined in INK — just applied to a schematic tile face
// instead of a full illustration, since legibility of the actual path
// pattern at small board-tile size matters far more here than
// ornamentation (per this game's own design brief).
export const INK = "#1a0f08";
export const CLAY = "#c2703d";

// Point positions around a 100x100 tile, matching tsuroCore.js's own
// point numbering (0,1 top / 2,3 right / 4,5 bottom / 6,7 left).
const POINT_XY = [
  [33, 0], [67, 0],
  [100, 33], [100, 67],
  [67, 100], [33, 100],
  [0, 67], [0, 33],
];
// Inward-pointing normal per point, used as a bezier handle so paths
// curve smoothly through the tile instead of meeting as sharp angles.
const POINT_NORMAL = [
  [0, 1], [0, 1],
  [-1, 0], [-1, 0],
  [0, -1], [0, -1],
  [1, 0], [1, 0],
];
const HANDLE = 34;

// Exposed (as 0..1 fractions of a cell) so a board display can place a
// marker/boat icon exactly on its resting edge point, not just
// centered on the cell — see components/bigscreen/RiverStyxTvDisplay.jsx.
export const EDGE_POINT_FRACTION = POINT_XY.map(([x, y]) => [x / 100, y / 100]);

export function tilePathsD(matching) {
  return matching.map(([a, b]) => {
    const [ax, ay] = POINT_XY[a];
    const [bx, by] = POINT_XY[b];
    const [anx, any_] = POINT_NORMAL[a];
    const [bnx, bny] = POINT_NORMAL[b];
    const c1x = ax + anx * HANDLE, c1y = ay + any_ * HANDLE;
    const c2x = bx + bnx * HANDLE, c2y = by + bny * HANDLE;
    return `M ${ax} ${ay} C ${c1x} ${c1y} ${c2x} ${c2y} ${bx} ${by}`;
  });
}

export function tileMatchingFor(designIndex, rotation) {
  return rotatedDesign(designIndex, rotation);
}

// A fixed, distinct palette for up to 8 markers/boats on the board —
// same neon-on-purple family as the rest of the app's UI chrome
// (#ff2d95 etc.), just spread across enough distinguishable hues for a
// full lobby.
export const PLAYER_COLORS = ["#ff2d95", "#00ff9d", "#ffd700", "#4fc3f7", "#ff8a3d", "#b829ff", "#ff3860", "#7fffd4"];

export function colorForPlayer(participantIds, playerId) {
  const idx = participantIds.indexOf(playerId);
  return PLAYER_COLORS[idx % PLAYER_COLORS.length];
}

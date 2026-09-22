// Rush Hour–style sliding puzzle logic. Reworked to support adjustable
// difficulty — grid size and piece layout are no longer a single hardcoded
// constant, so the host can offer easy/medium/hard versions.

export const COFFIN_LAYOUTS = {
  easy: {
    label: "Easy (5×5)",
    grid: 5,
    pieces: [
      { id: "X", orientation: "h", length: 2, row: 2, col: 0, isTarget: true },
      { id: "A", orientation: "v", length: 2, row: 0, col: 2 },
      { id: "B", orientation: "h", length: 2, row: 0, col: 3 },
      { id: "C", orientation: "v", length: 2, row: 3, col: 1 },
      { id: "D", orientation: "v", length: 2, row: 1, col: 4 },
    ],
  },
  medium: {
    label: "Medium (6×6)",
    grid: 6,
    pieces: [
      { id: "X", orientation: "h", length: 2, row: 2, col: 0, isTarget: true },
      { id: "A", orientation: "v", length: 2, row: 0, col: 1 },
      { id: "B", orientation: "v", length: 3, row: 0, col: 4 },
      { id: "C", orientation: "h", length: 2, row: 1, col: 2 },
      { id: "D", orientation: "v", length: 2, row: 0, col: 5 },
      { id: "E", orientation: "h", length: 3, row: 3, col: 1 },
      { id: "F", orientation: "v", length: 2, row: 4, col: 0 },
      { id: "G", orientation: "h", length: 2, row: 4, col: 3 },
      { id: "H", orientation: "v", length: 2, row: 3, col: 5 },
    ],
  },
  hard: {
    label: "Hard (7×7)",
    grid: 7,
    pieces: [
      { id: "X", orientation: "h", length: 2, row: 3, col: 0, isTarget: true },
      { id: "A", orientation: "v", length: 2, row: 0, col: 1 },
      { id: "B", orientation: "v", length: 3, row: 0, col: 3 },
      { id: "C", orientation: "h", length: 2, row: 1, col: 4 },
      { id: "D", orientation: "v", length: 2, row: 0, col: 6 },
      { id: "E", orientation: "h", length: 3, row: 2, col: 2 },
      { id: "F", orientation: "v", length: 2, row: 5, col: 0 },
      { id: "G", orientation: "h", length: 2, row: 5, col: 2 },
      { id: "H", orientation: "v", length: 3, row: 4, col: 5 },
      { id: "I", orientation: "h", length: 2, row: 6, col: 3 },
      { id: "J", orientation: "v", length: 2, row: 2, col: 6 },
    ],
  },
};

export const COFFIN_COLORS = {
  A: "#7a5c3c", B: "#5c4a7a", C: "#3c6b5c", D: "#7a3c5c",
  E: "#4a5c7a", F: "#6b5c3c", G: "#5c3c4a", H: "#3c5c4a",
  I: "#4a6b3c", J: "#6b3c5c",
};

export function coffinCells(p, row = p.row, col = p.col) {
  const cells = [];
  for (let i = 0; i < p.length; i++) cells.push(p.orientation === "h" ? [row, col + i] : [row + i, col]);
  return cells;
}

export function coffinIsSolved(pieces, gridSize) {
  const target = pieces.find((p) => p.isTarget);
  return target.col + target.length - 1 >= gridSize - 1;
}

// Attempts to slide a piece one cell along its own axis. Returns the new
// pieces array on success, or null if the move is blocked or out of bounds.
export function coffinCanMove(pieces, id, delta, gridSize) {
  const piece = pieces.find((p) => p.id === id);
  if (!piece) return null;
  const newRow = piece.orientation === "v" ? piece.row + delta : piece.row;
  const newCol = piece.orientation === "h" ? piece.col + delta : piece.col;
  const newCells = coffinCells(piece, newRow, newCol);
  for (const [r, c] of newCells) { if (r < 0 || c < 0 || r >= gridSize || c >= gridSize) return null; }
  const occupied = new Set();
  pieces.forEach((other) => { if (other.id !== id) coffinCells(other).forEach(([r, c]) => occupied.add(`${r},${c}`)); });
  for (const [r, c] of newCells) { if (occupied.has(`${r},${c}`)) return null; }
  return pieces.map((p) => (p.id === id ? { ...p, row: newRow, col: newCol } : p));
}

export const STORAGE_KEY_COFFIN = "traitors:coffin";

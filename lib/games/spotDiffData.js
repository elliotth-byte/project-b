// Procedurally generates two near-identical scenes and a list of where
// they differ — no image assets needed. `differences` is
// [{ x, y, r, found }] in scene-B coordinates, used both for rendering
// scene B and for hit-testing a player's tap.
const COLORS = ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#c879ff", "#ff9f4d", "#4de0d0"];
const SHAPE_TYPES = ["circle", "square", "triangle"];

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

export function generateScenes(seed, diffCount, W, H) {
  const rand = seededRandom(seed);
  const shapeCount = 14;
  const shapes = [];
  for (let i = 0; i < shapeCount; i++) {
    shapes.push({
      id: i,
      type: SHAPE_TYPES[Math.floor(rand() * SHAPE_TYPES.length)],
      x: 20 + rand() * (W - 40),
      y: 20 + rand() * (H - 40),
      r: 10 + rand() * 10,
      color: COLORS[Math.floor(rand() * COLORS.length)],
    });
  }

  const sceneA = shapes.map((s) => ({ ...s }));
  const sceneB = shapes.map((s) => ({ ...s }));
  const chosen = [...shapes].sort(() => rand() - 0.5).slice(0, diffCount);
  const differences = [];

  chosen.forEach((s) => {
    const bShape = sceneB.find((x) => x.id === s.id);
    const mutation = Math.floor(rand() * 3);
    if (mutation === 0) {
      bShape.x = Math.max(15, Math.min(W - 15, bShape.x + (rand() > 0.5 ? 1 : -1) * (25 + rand() * 20)));
    } else if (mutation === 1) {
      bShape.color = COLORS[(COLORS.indexOf(bShape.color) + 1 + Math.floor(rand() * 3)) % COLORS.length];
    } else {
      bShape.r = bShape.r * (rand() > 0.5 ? 1.6 : 0.5);
    }
    differences.push({ x: bShape.x, y: bShape.y, r: Math.max(bShape.r, s.r) + 8, found: false });
  });

  return { sceneA, sceneB, differences };
}

export function drawScene(ctx, W, H, shapes) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#060e1a";
  ctx.fillRect(0, 0, W, H);
  shapes.forEach((s) => {
    ctx.fillStyle = s.color;
    if (s.type === "circle") {
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    } else if (s.type === "square") {
      ctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    } else {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - s.r);
      ctx.lineTo(s.x - s.r, s.y + s.r);
      ctx.lineTo(s.x + s.r, s.y + s.r);
      ctx.closePath(); ctx.fill();
    }
  });
}

// ─── Shared canvas drawing helpers ───
// Small, purely-visual primitives reused across the canvas-based mini-
// games (Snake, Frogger, Breakout, Plinko, ...) so the tier-2 graphics
// pass (rounded tiles, gradients, glows) reads as one consistent visual
// language instead of each game re-deriving its own rounded-rect math.
// Nothing here touches game state/logic — draw calls only.

// Rounded-rect path — canvas has no universally-supported roundRect()
// shorthand old enough browsers can rely on, so every "tile"/"piece"
// drawn by these games goes through this rather than a flat corner.
export function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A soft radial highlight overlay on top of an already-filled shape —
// the "glassy" sheen used on gems/orbs/balls throughout this pass.
export function drawGlossHighlight(ctx, cx, cy, r, alpha = 0.35) {
  ctx.save();
  const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, 0, cx, cy, r);
  grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

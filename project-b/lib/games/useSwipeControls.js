import { useRef, useCallback } from "react";

// Shared by every directional-movement game (Frogger, the maze variants)
// — attach the returned handlers to whatever element should catch
// swipes, and onSwipe gets called with "up" | "down" | "left" | "right"
// once a touch move crosses MIN_DISTANCE. Only actually wired up by a
// game when the player has swipeControls on (see lib/gamePrefs.js) —
// tap/arrow controls stay the primary input either way, this just adds
// swipe alongside them.
const MIN_DISTANCE = 24; // px — short enough to feel responsive, long enough not to fire on an accidental tap-drag

export function useSwipeControls(onSwipe, enabled = true) {
  const start = useRef(null);

  const onTouchStart = useCallback((e) => {
    if (!enabled) return;
    const t = e.touches?.[0];
    if (!t) return;
    start.current = { x: t.clientX, y: t.clientY };
  }, [enabled]);

  const onTouchEnd = useCallback((e) => {
    if (!enabled || !start.current) return;
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    start.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_DISTANCE) return; // too short — treat as a tap, not a swipe
    if (Math.abs(dx) > Math.abs(dy)) onSwipe(dx > 0 ? "right" : "left");
    else onSwipe(dy > 0 ? "down" : "up");
  }, [enabled, onSwipe]);

  return { onTouchStart, onTouchEnd };
}

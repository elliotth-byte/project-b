import { useState, useEffect } from "react";
import { Card } from "./traitorsUi";
import { isWithinWorkDayWindow, describeNextWindowOpen, subscribeWorkDayModeEnabled } from "../lib/traitorsWorkDayWindow";

// ─── Work-Day Gate ───
// Wraps mission/murder/roundtable/traitor-selection content on both
// the host and player sides (see lib/traitorsWorkDayWindow.js for the
// full window definition and reasoning) — deliberately never wrapped
// around confessionals anywhere it's used, since those are meant to
// keep working regardless.
//
// Re-checks the window on a 1-minute interval, not just once on mount
// — this is exactly the kind of gate someone could plausibly be
// looking at right as it flips open or closed (8:00am, 9:00pm), and a
// stale "still paused" or "still open" reading past that moment would
// be a real, visible bug for anyone sitting on the page at the time.
//
// If a season never turns work-day mode on at all, this renders
// children immediately and does nothing else — every existing season
// (and every new one that doesn't opt in) behaves exactly as if this
// gate didn't exist.
export default function TraitorsWorkDayGate({ gameId, children }) {
  const [enabled, setEnabled] = useState(null); // null = not loaded yet
  const [now, setNow] = useState(() => new Date());

  useEffect(() => subscribeWorkDayModeEnabled(gameId, setEnabled), [gameId]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  if (enabled === null) return null; // avoid a flash of paused (or open) content before we actually know
  if (!enabled) return children;

  const isOpen = isWithinWorkDayWindow(now);
  if (isOpen) return children;

  return (
    <Card style={{ borderColor: "rgba(201,168,76,0.4)", textAlign: "center" }}>
      <div style={{ fontSize: 24, marginBottom: 6 }}>⏸️</div>
      <h3 style={{ color: "#f0e6d3", margin: "0 0 6px", fontSize: 15 }}>The game is paused</h3>
      <p style={{ color: "#7a6a52", fontSize: 12, margin: 0 }}>
        This season runs weekdays, 8am ET to 6pm PT. {describeNextWindowOpen(now)}.
        Confessionals are still open in the meantime.
      </p>
    </Card>
  );
}

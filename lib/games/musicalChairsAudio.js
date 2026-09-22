// ─── Musical Chairs — actual music ───
// A small synthesized loop, not an audio file — no music-licensing
// question to worry about, nothing to bundle or host, and it works the
// instant this ships rather than needing an actual audio asset added
// separately. Uses the Web Audio API directly (oscillators + gain
// envelopes), scheduled ahead of real time the standard way any
// reliable web-audio sequencer does it (see scheduleLoop below) rather
// than relying on setInterval alone, which drifts and stutters under
// normal JS timer jitter.
//
// Two exports only: start it, stop it. stopMusic() calls
// AudioContext.close() specifically — not just muting the gain — so
// the cut is instant and total, matching the real game's own abrupt
// "the music stops" moment, not a fade-out.
//
// Browsers block audio from starting without a real user gesture
// first — see components/games/MusicalChairsPlayer.jsx's own "tap to
// enable sound" button, which is what satisfies that, once per
// session; calling startMusic() before that gesture has happened is
// safe (silently does nothing useful) but won't actually produce
// sound.

let audioCtx = null;
let schedulerTimer = null;
let nextNoteTime = 0;
let noteIndex = 0;

const NOTE_DURATION = 0.22;
const SCHEDULE_AHEAD_SEC = 0.15;
const SCHEDULER_INTERVAL_MS = 50;

// A simple, cheerful eight-note loop on a pentatonic-ish scale — every
// note in it sounds fine next to every other, so there's no risk of
// picking an awkward combination without being able to actually listen
// to it while building this. Fairground/music-box register, not
// meant to be a real melody with resolution or phrasing.
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 392.0, 329.63, 293.66]; // C4 D4 E4 G4 A4 G4 E4 D4

function playNote(ctx, freq, time) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.16, time + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + NOTE_DURATION);
  osc.connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + NOTE_DURATION + 0.02);
}

function scheduleLoop() {
  if (!audioCtx) return;
  while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD_SEC) {
    playNote(audioCtx, SCALE[noteIndex % SCALE.length], nextNoteTime);
    nextNoteTime += NOTE_DURATION;
    noteIndex += 1;
  }
  schedulerTimer = window.setTimeout(scheduleLoop, SCHEDULER_INTERVAL_MS);
}

// Safe to call repeatedly — a no-op if music's already playing, so a
// component doesn't need to track its own "did I already start this"
// state just to avoid double-starting.
export function startMusic() {
  if (audioCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return; // no Web Audio support — silently does nothing rather than throwing
  audioCtx = new Ctx();
  nextNoteTime = audioCtx.currentTime + 0.1;
  noteIndex = 0;
  scheduleLoop();
}

// Also safe to call repeatedly / when nothing's playing.
export function stopMusic() {
  if (schedulerTimer) {
    window.clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
}

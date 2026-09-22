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
//
// State used to be plain module-scope singletons here. That's harmless
// in real play (every real player is a separate browser tab, so each
// gets its own copy of this module), but it broke the moment more than
// one MusicalChairsPlayer got mounted in the SAME tab at once — see
// components/ChallengeTestLab.jsx's Multiplayer Test mode, which does
// exactly that. With a bare singleton, only the first panel's
// startMusic() call would ever actually create an AudioContext (every
// later call saw a truthy audioCtx and no-opped), and ANY one panel's
// stopMusic()/unmount would call audioCtx.close() and silence every
// other panel's music too. Keyed per-caller state (a token each
// component instance mints once via useRef and passes back in on every
// call) fixes that without changing behavior for the normal single-tab
// case at all — a single caller just gets a map with one entry in it.

const instances = new Map(); // token -> { audioCtx, schedulerTimer, nextNoteTime, noteIndex }

function getInstance(token) {
  let inst = instances.get(token);
  if (!inst) {
    inst = { audioCtx: null, schedulerTimer: null, nextNoteTime: 0, noteIndex: 0 };
    instances.set(token, inst);
  }
  return inst;
}

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

function scheduleLoop(inst) {
  if (!inst.audioCtx) return;
  while (inst.nextNoteTime < inst.audioCtx.currentTime + SCHEDULE_AHEAD_SEC) {
    playNote(inst.audioCtx, SCALE[inst.noteIndex % SCALE.length], inst.nextNoteTime);
    inst.nextNoteTime += NOTE_DURATION;
    inst.noteIndex += 1;
  }
  inst.schedulerTimer = window.setTimeout(() => scheduleLoop(inst), SCHEDULER_INTERVAL_MS);
}

// `token` identifies the caller (defaults to a shared "default" token,
// preserving the old singleton behavior for any caller that doesn't
// pass one). A component that might be mounted alongside sibling
// instances of itself — e.g. Multiplayer Test mode — should mint its
// own stable token (useRef(Symbol()) or similar) and pass it to both
// startMusic and stopMusic so each instance gets its own AudioContext.
//
// Safe to call repeatedly — a no-op if music's already playing for
// this token, so a component doesn't need to track its own "did I
// already start this" state just to avoid double-starting.
export function startMusic(token = "default") {
  const inst = getInstance(token);
  if (inst.audioCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return; // no Web Audio support — silently does nothing rather than throwing
  inst.audioCtx = new Ctx();
  inst.nextNoteTime = inst.audioCtx.currentTime + 0.1;
  inst.noteIndex = 0;
  scheduleLoop(inst);
}

// Also safe to call repeatedly / when nothing's playing for this token.
// Only ever affects this token's own AudioContext — never a sibling
// instance's.
export function stopMusic(token = "default") {
  const inst = instances.get(token);
  if (!inst) return;
  if (inst.schedulerTimer) {
    window.clearTimeout(inst.schedulerTimer);
    inst.schedulerTimer = null;
  }
  if (inst.audioCtx) {
    inst.audioCtx.close();
    inst.audioCtx = null;
  }
  instances.delete(token);
}

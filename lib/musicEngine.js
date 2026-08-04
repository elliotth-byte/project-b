// Generative, all-client-side (Tone.js) — nothing is streamed, only the
// *choice of station* is synced across everyone in the game (see
// components/MusicPlayer.jsx). Swapped from the original's dark ambient
// soundscape to four upbeat 80s-inspired stations. Same buildEngine(mood)
// contract as before — returns { masterVol, nodes, loops } — so
// MusicPlayer.jsx needed zero changes.
import * as Tone from "tone";

export const MOODS = [
  { id: "synthpop", label: "Synth Pop", icon: "🎹" },
  { id: "retrowave", label: "Retrowave", icon: "🌆" },
  { id: "edm", label: "EDM Drop", icon: "⚡" },
  { id: "chiptune", label: "Chiptune", icon: "👾" },
];

export const STORAGE_KEY_MUSIC_MOOD = "pb:radio-station";

export function buildEngine(mood) {
  const masterVol = new Tone.Volume(-10).toDestination();
  const reverb = new Tone.Reverb({ decay: 1.6, wet: 0.18 }).connect(masterVol);
  const delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.2, wet: 0.15 }).connect(reverb);
  const nodes = [masterVol, reverb, delay];
  const loops = [];

  const kick = new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 6, envelope: { attack: 0.001, decay: 0.35, sustain: 0 }, volume: -6 }).connect(masterVol);
  const hat = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.04, sustain: 0 }, volume: -22 }).connect(masterVol);
  const clap = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.001, decay: 0.15, sustain: 0 }, volume: -14 }).connect(reverb);
  nodes.push(kick, hat, clap);

  if (mood === "synthpop") {
    const bass = new Tone.Synth({ oscillator: { type: "fatsawtooth", spread: 15, count: 2 }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2 }, volume: -12 }).connect(masterVol);
    const pluck = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.005, decay: 0.3, sustain: 0.1, release: 0.3 }, volume: -14 }).connect(delay);
    nodes.push(bass, pluck);
    const progression = [["C4", "E4", "G4"], ["G3", "B3", "D4"], ["A3", "C4", "E4"], ["F3", "A3", "C4"]];
    const bassRoots = ["C3", "G2", "A2", "F2"];
    const arp = ["C5", "E5", "G5", "E5"];
    let ci = 0, ai = 0;
    loops.push(new Tone.Loop((t) => { kick.triggerAttackRelease("C1", "8n", t); }, "4n"));
    loops.push(new Tone.Loop((t) => hat.triggerAttackRelease("16n", t + Tone.Time("16n").toSeconds()), "8n"));
    loops.push(new Tone.Loop((t) => { bass.triggerAttackRelease(bassRoots[ci % bassRoots.length], "8n", t); }, "4n"));
    loops.push(new Tone.Loop((t) => { pluck.triggerAttackRelease(progression[ci % progression.length], "2n", t); ci++; }, "1m"));
    loops.push(new Tone.Loop((t) => { pluck.triggerAttackRelease(arp[ai % arp.length], "8n", t); ai++; }, "8n"));
    Tone.getTransport().bpm.value = 118;
  }

  if (mood === "retrowave") {
    const bass = new Tone.Synth({ oscillator: { type: "sawtooth" }, envelope: { attack: 0.01, decay: 0.25, sustain: 0.4, release: 0.2 }, volume: -10 }).connect(masterVol);
    const bell = new Tone.FMSynth({ harmonicity: 3, modulationIndex: 6, oscillator: { type: "sine" }, envelope: { attack: 0.005, decay: 0.8, sustain: 0.1, release: 0.6 }, volume: -16 }).connect(reverb);
    const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "fatsawtooth", spread: 25, count: 3 }, envelope: { attack: 1.5, decay: 1, sustain: 0.6, release: 2 }, volume: -20 }).connect(reverb);
    nodes.push(bass, bell, pad);
    const progression = [["A3", "C4", "E4"], ["F3", "A3", "C4"], ["C3", "E3", "G3"], ["G3", "B3", "D4"]];
    const bassLine = ["A2", "A2", "F2", "F2", "C2", "C2", "G2", "G2"];
    const bellNotes = ["A5", "C6", "E5", "C6", "F5", "A5", "G5", "E5"];
    let ci = 0, bi = 0, li = 0;
    loops.push(new Tone.Loop((t) => { kick.triggerAttackRelease("C1", "8n", t); }, "4n"));
    loops.push(new Tone.Loop((t) => { if (li % 4 === 2) clap.triggerAttackRelease(t); li++; }, "4n"));
    loops.push(new Tone.Loop((t) => { bass.triggerAttackRelease(bassLine[bi % bassLine.length], "8n", t); bi++; }, "8n"));
    loops.push(new Tone.Loop((t) => { pad.triggerAttackRelease(progression[ci % progression.length], "2m", t); ci++; }, "2m"));
    loops.push(new Tone.Loop((t) => { if (Math.random() > 0.3) bell.triggerAttackRelease(bellNotes[bi % bellNotes.length], "8n", t); }, "4n"));
    Tone.getTransport().bpm.value = 108;
  }

  if (mood === "edm") {
    const bass = new Tone.Synth({ oscillator: { type: "square" }, envelope: { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.1 }, volume: -10 }).connect(masterVol);
    const lead = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "fatsawtooth", spread: 40, count: 4 }, envelope: { attack: 0.02, decay: 0.4, sustain: 0.3, release: 0.4 }, volume: -13 }).connect(delay);
    nodes.push(bass, lead);
    const progression = [["A4", "C5", "E5"], ["F4", "A4", "C5"], ["G4", "B4", "D5"], ["E4", "G4", "B4"]];
    const bassLine = ["A2", "A2", "A2", "A3", "F2", "F2", "F2", "F3"];
    let ci = 0, bi = 0, hi = 0;
    loops.push(new Tone.Loop((t) => { kick.triggerAttackRelease("C1", "8n", t); }, "4n"));
    loops.push(new Tone.Loop((t) => { hat.triggerAttackRelease("16n", t); hi++; if (hi % 4 === 0) clap.triggerAttackRelease(t); }, "8n"));
    loops.push(new Tone.Loop((t) => { bass.triggerAttackRelease(bassLine[bi % bassLine.length], "8n", t); bi++; }, "8n"));
    loops.push(new Tone.Loop((t) => { lead.triggerAttackRelease(progression[ci % progression.length], "4n", t); ci++; }, "1m"));
    Tone.getTransport().bpm.value = 128;
  }

  if (mood === "chiptune") {
    const lead = new Tone.Synth({ oscillator: { type: "square" }, envelope: { attack: 0.001, decay: 0.08, sustain: 0.05, release: 0.05 }, volume: -14 }).connect(masterVol);
    const bass = new Tone.Synth({ oscillator: { type: "square" }, envelope: { attack: 0.001, decay: 0.1, sustain: 0.1, release: 0.05 }, volume: -12 }).connect(masterVol);
    nodes.push(lead, bass);
    const melody = ["C5", "E5", "G5", "C6", "G5", "E5", "D5", "E5", "F5", "A5", "C6", "A5", "F5", "D5", "E5", "C5"];
    const bassLine = ["C3", "C3", "F3", "F3", "G3", "G3", "C3", "C3"];
    let mi = 0, bi = 0;
    loops.push(new Tone.Loop((t) => { kick.triggerAttackRelease("C1", "16n", t); }, "4n"));
    loops.push(new Tone.Loop((t) => { hat.triggerAttackRelease("16n", t); }, "16n"));
    loops.push(new Tone.Loop((t) => { bass.triggerAttackRelease(bassLine[bi % bassLine.length], "8n", t); bi++; }, "8n"));
    loops.push(new Tone.Loop((t) => { lead.triggerAttackRelease(melody[mi % melody.length], "16n", t); mi++; }, "16n"));
    Tone.getTransport().bpm.value = 140;
  }

  // Tone.Loop instances don't run just by existing — each one has to be
  // started explicitly, or the transport ticks along in silence. This is
  // what "the radio" actually was: every station's loops were built but
  // never started, so nothing ever played regardless of mood/volume/play
  // button state.
  loops.forEach((l) => l.start(0));

  return { masterVol, nodes, loops };
}

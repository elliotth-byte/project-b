// Unchanged from the original artifact — this builds a generative ambient
// soundscape entirely client-side with Tone.js. No storage dependency here
// at all, so nothing needed to change for the migration.
import * as Tone from "tone";

export const MOODS = [
  { id: "dark", label: "Dark & Suspenseful", icon: "🌑" },
  { id: "elegant", label: "Elegant & Mysterious", icon: "🕯️" },
  { id: "dramatic", label: "Dramatic & Cinematic", icon: "🎭" },
  { id: "subtle", label: "Subtle Ambient", icon: "🌫️" },
];

export function buildEngine(mood) {
  const masterVol = new Tone.Volume(-12).toDestination();
  const reverb = new Tone.Reverb({ decay: mood === "subtle" ? 12 : 8, wet: 0.7 }).connect(masterVol);
  const delay = new Tone.FeedbackDelay({ delayTime: "4n", feedback: 0.3, wet: 0.2 }).connect(reverb);
  const nodes = [masterVol, reverb, delay];
  const loops = [];

  if (mood === "dark") {
    const drone = new Tone.FMSynth({ harmonicity: 0.5, modulationIndex: 1.2, oscillator: { type: "sine" }, modulation: { type: "triangle" }, envelope: { attack: 4, decay: 0, sustain: 1, release: 4 }, modulationEnvelope: { attack: 3, decay: 0, sustain: 1, release: 4 }, volume: -6 }).connect(reverb);
    const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "fatsawtooth", spread: 20, count: 3 }, envelope: { attack: 5, decay: 2, sustain: 0.6, release: 6 }, volume: -18 });
    const padFilter = new Tone.AutoFilter({ frequency: 0.05, baseFrequency: 200, octaves: 2.5 }).connect(reverb).start();
    pad.connect(padFilter);
    const eerie = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 2, decay: 3, sustain: 0, release: 4 }, volume: -24 }).connect(delay);
    const nf = new Tone.AutoFilter({ frequency: 0.02, baseFrequency: 80, octaves: 3, wet: 1 }).connect(reverb).start();
    const noise = new Tone.Noise({ type: "brown", volume: -30 }).connect(nf);
    const sub = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 3, decay: 0, sustain: 1, release: 3 }, volume: -10 }).connect(reverb);
    const subLfo = new Tone.LFO({ frequency: 0.08, min: -14, max: -8 }).start();
    subLfo.connect(sub.volume);
    nodes.push(drone, pad, padFilter, eerie, nf, noise, sub, subLfo);
    const droneNotes = ["D1", "D1", "Eb1", "D1"];
    const padChords = [["D2", "Ab2", "D3"], ["Eb2", "Bb2", "Eb3"], ["D2", "A2", "D3"], ["Bb1", "F2", "Bb2"], ["D2", "Ab2", "C3"], ["Eb2", "G2", "Bb2"]];
    const eerieNotes = ["D5", "Eb5", "Ab5", "Bb4", "F5", "C5", "D6", "Ab4"];
    let pi = 0;
    loops.push(new Tone.Loop((t) => { drone.triggerAttackRelease(droneNotes[Math.floor(Math.random() * droneNotes.length)], "2m", t); }, "2m"));
    loops.push(new Tone.Loop((t) => { pad.triggerAttackRelease(padChords[pi % padChords.length], "4m", t); pi++; }, "4m"));
    loops.push(new Tone.Loop((t) => { if (Math.random() > 0.5) eerie.triggerAttackRelease(eerieNotes[Math.floor(Math.random() * eerieNotes.length)], "2m", t); }, "3m"));
    loops.push(new Tone.Loop((t) => { sub.triggerAttackRelease("D1", "4m", t); }, "4m"));
    noise.start();
    Tone.getTransport().bpm.value = 40;
  }

  if (mood === "elegant") {
    const piano = new Tone.Synth({ oscillator: { type: "triangle" }, envelope: { attack: 0.02, decay: 1.5, sustain: 0, release: 2 }, volume: -14 }).connect(delay);
    const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sine", spread: 10, count: 2 }, envelope: { attack: 4, decay: 2, sustain: 0.5, release: 5 }, volume: -20 }).connect(reverb);
    const high = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 1, decay: 2, sustain: 0, release: 3 }, volume: -26 }).connect(reverb);
    nodes.push(piano, pad, high);
    const arps = ["D4", "F4", "A4", "D5", "C5", "A4", "F4", "E4", "D4", "Bb3", "A3", "D4"];
    const chords = [["D3", "F3", "A3"], ["Bb2", "D3", "F3"], ["G2", "Bb2", "D3"], ["A2", "C3", "E3"], ["D3", "F3", "A3"], ["Eb3", "G3", "Bb3"]];
    const highNotes = ["A5", "F5", "D5", "E5", "Bb4"];
    let ai = 0, ci = 0;
    loops.push(new Tone.Loop((t) => { piano.triggerAttackRelease(arps[ai % arps.length], "4n", t); ai++; }, "2n"));
    loops.push(new Tone.Loop((t) => { pad.triggerAttackRelease(chords[ci % chords.length], "4m", t); ci++; }, "4m"));
    loops.push(new Tone.Loop((t) => { if (Math.random() > 0.6) high.triggerAttackRelease(highNotes[Math.floor(Math.random() * highNotes.length)], "2m", t); }, "3m"));
    Tone.getTransport().bpm.value = 55;
  }

  if (mood === "dramatic") {
    const strings = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "fatsawtooth", spread: 30, count: 4 }, envelope: { attack: 3, decay: 1, sustain: 0.7, release: 4 }, volume: -16 });
    const strFilter = new Tone.Filter({ frequency: 1200, type: "lowpass" }).connect(reverb);
    strings.connect(strFilter);
    const bass = new Tone.Synth({ oscillator: { type: "sawtooth" }, envelope: { attack: 2, decay: 0, sustain: 1, release: 3 }, volume: -10 });
    const bassFilter = new Tone.Filter({ frequency: 300, type: "lowpass" }).connect(reverb);
    bass.connect(bassFilter);
    const hit = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 4, envelope: { attack: 0.01, decay: 1.5, sustain: 0, release: 2 }, volume: -18 }).connect(reverb);
    const shimmer = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.5, decay: 3, sustain: 0, release: 4 }, volume: -22 }).connect(delay);
    nodes.push(strings, strFilter, bass, bassFilter, hit, shimmer);
    const strChords = [["D3", "A3", "D4", "F4"], ["Bb2", "F3", "Bb3", "D4"], ["G2", "D3", "G3", "Bb3"], ["A2", "E3", "A3", "C4"], ["D3", "A3", "D4", "F4"], ["Eb3", "Bb3", "Eb4", "G4"]];
    const bassNotes = ["D2", "Bb1", "G1", "A1", "D2", "Eb2"];
    const shimNotes = ["D6", "A5", "F5", "Bb5", "G5"];
    let si = 0;
    loops.push(new Tone.Loop((t) => { strings.triggerAttackRelease(strChords[si % strChords.length], "3m", t); bass.triggerAttackRelease(bassNotes[si % bassNotes.length], "3m", t); si++; }, "3m"));
    loops.push(new Tone.Loop((t) => { if (Math.random() > 0.65) hit.triggerAttackRelease("C1", "2n", t); }, "2m"));
    loops.push(new Tone.Loop((t) => { if (Math.random() > 0.5) shimmer.triggerAttackRelease(shimNotes[Math.floor(Math.random() * shimNotes.length)], "1m", t); }, "2m"));
    const swellLfo = new Tone.LFO({ frequency: 0.03, min: 400, max: 2000 }).start();
    swellLfo.connect(strFilter.frequency);
    nodes.push(swellLfo);
    Tone.getTransport().bpm.value = 50;
  }

  if (mood === "subtle") {
    const nf = new Tone.AutoFilter({ frequency: 0.01, baseFrequency: 60, octaves: 2 }).connect(reverb).start();
    const noise = new Tone.Noise({ type: "brown", volume: -26 }).connect(nf);
    const tone1 = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 6, decay: 0, sustain: 1, release: 6 }, volume: -22 }).connect(reverb);
    const tone2 = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 4, decay: 4, sustain: 0, release: 6 }, volume: -28 }).connect(reverb);
    nodes.push(nf, noise, tone1, tone2);
    const tones = ["D2", "A2", "D3", "F2"];
    const highs = ["A4", "D4", "F4"];
    loops.push(new Tone.Loop((t) => { tone1.triggerAttackRelease(tones[Math.floor(Math.random() * tones.length)], "4m", t); }, "4m"));
    loops.push(new Tone.Loop((t) => { if (Math.random() > 0.7) tone2.triggerAttackRelease(highs[Math.floor(Math.random() * highs.length)], "3m", t); }, "4m"));
    noise.start();
    Tone.getTransport().bpm.value = 35;
  }

  loops.forEach((l, i) => l.start(i === 0 ? 0 : `${i}m`));
  return { masterVol, nodes, loops };
}

export const STORAGE_KEY_MUSIC_MOOD = "traitors:music-mood";

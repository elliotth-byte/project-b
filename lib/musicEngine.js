// Generative, all-client-side (Tone.js) — nothing is streamed. Previously
// four player-chosen "radio stations," broadcast by the host and synced
// via game_state (see the git history of this file / components/
// MusicPlayer.jsx's own prior comment). Now driven entirely by the
// current round phase instead — nobody picks a track, everyone's client
// independently derives the same one from the SAME already-synced
// round.phase (see lib/gameState.js's subscribeRound, already used
// everywhere else in this app for exactly this reason), so there's
// nothing left to broadcast or keep in sync. Same buildEngine(mood)
// contract as before — { masterVol, nodes, loops } — so the player/host
// shell around this needed no structural changes, just a new source for
// which track to build.
import * as Tone from "tone";

// PHASE_TRACKS maps lib/gameState.js's own PHASES values directly to a
// track id — kept here (not duplicated in MusicPlayer.jsx) so this file
// stays the single place that knows both "what a phase sounds like" and
// "what a track sounds like." ENDED intentionally reuses "finale" rather
// than getting its own composition — a winner's just been crowned, the
// same triumphant piece carrying into the results screen felt more
// natural than composing a sixth, very similar track.
export const PHASE_TRACKS = {
  lobby: "lobby",
  challenge: "battle",
  fates: "fates",
  exile: "exile",
  finale: "finale",
  ended: "finale",
};

export const TRACKS = [
  { id: "lobby", label: "Lobby", icon: "🛋" },
  { id: "battle", label: "Battle", icon: "⚔️" },
  { id: "fates", label: "Fates", icon: "🕯" },
  { id: "exile", label: "Exile Vote", icon: "🗳" },
  { id: "finale", label: "Finale", icon: "🏆" },
];

export function buildEngine(track) {
  const masterVol = new Tone.Volume(-10).toDestination();
  const nodes = [masterVol];
  const loops = [];

  if (track === "battle") {
    // Energetic, combative — fast, driving, aggressive. A hard-edged
    // square-wave lead with real distortion (not just a synth timbre
    // choice) for the "combative" bite, over a relentless four-on-the-
    // floor kick.
    //
    // Reworked into an actual AB song form instead of one 4-bar loop
    // repeating unchanged for the whole battle: bars 1-4 (phrase A) are
    // the original stab progression; bars 5-8 (phrase B) lift the same
    // Phrygian-leaning material up a step (a borrowed-chord move, not a
    // new key — still audibly the same song) and add `riff`, an actual
    // moving 16th-note lead line, so the second half of every 8-bar
    // cycle reads as busier/more intense than the first, then it loops
    // back to A. `bar` is a closed-over counter, same device this
    // file's own "fates"/"exile" tracks already use for their builds.
    const reverb = new Tone.Reverb({ decay: 0.6, wet: 0.1 }).connect(masterVol);
    const dist = new Tone.Distortion({ distortion: 0.35, wet: 0.5 }).connect(masterVol);
    nodes.push(reverb, dist);

    const kick = new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 5, envelope: { attack: 0.001, decay: 0.25, sustain: 0 }, volume: -4 }).connect(masterVol);
    const hat = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.03, sustain: 0 }, volume: -20 }).connect(masterVol);
    const bass = new Tone.Synth({ oscillator: { type: "square" }, envelope: { attack: 0.005, decay: 0.12, sustain: 0.1, release: 0.08 }, volume: -10 }).connect(dist);
    const lead = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "square" }, envelope: { attack: 0.002, decay: 0.15, sustain: 0.05, release: 0.1 }, volume: -14 }).connect(dist);
    // Monophonic — a real solo line, not more chords — same square/
    // distortion timbre as `lead` so it reads as the same instrument
    // taking over, not a new one arriving out of nowhere.
    const riff = new Tone.Synth({ oscillator: { type: "square" }, envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 }, volume: -16 }).connect(dist);
    dist.connect(reverb);
    reverb.connect(masterVol);
    nodes.push(kick, hat, bass, lead, riff);

    // Phrygian-leaning minor progression — the half-step pull reads as
    // combative/aggressive rather than just "sad minor." Phrase B lifts
    // this up to the bVII (D minor -> E minor material, still inside the
    // same E Phrygian-dominant color) for lift without a real key change.
    const stabsA = [["E4", "G4", "B4"], ["F4", "A4", "C5"], ["E4", "G4", "B4"], ["D4", "F4", "A4"]];
    const bassLineA = ["E2", "E2", "F2", "E2", "E2", "E2", "D2", "D2"];
    const stabsB = [["D4", "F4", "A4"], ["E4", "G4", "B4"], ["C4", "E4", "G4"], ["D4", "F4", "A4"]];
    const bassLineB = ["D2", "D2", "E2", "D2", "C2", "C2", "D2", "D2"];
    const riffMelody = ["E4", "G4", "A4", "B4", "C5", "B4", "A4", "G4", "E4", "D4", "E4", "F4", "G4", "F4", "E4", "D4"];
    let ci = 0, bi = 0, ri = 0, bar = 0;
    const inPhraseB = () => bar % 8 >= 4;
    loops.push(new Tone.Loop((t) => kick.triggerAttackRelease("C1", "8n", t), "4n"));
    loops.push(new Tone.Loop((t) => hat.triggerAttackRelease("16n", t), "8n"));
    loops.push(new Tone.Loop((t) => {
      const line = inPhraseB() ? bassLineB : bassLineA;
      bass.triggerAttackRelease(line[bi % line.length], "8n", t);
      bi++;
    }, "8n"));
    loops.push(new Tone.Loop((t) => {
      if (bi % 2 === 0) {
        const stabs = inPhraseB() ? stabsB : stabsA;
        lead.triggerAttackRelease(stabs[ci % stabs.length], "8n", t);
        ci++;
      }
    }, "4n"));
    loops.push(new Tone.Loop((t) => {
      if (inPhraseB()) { riff.triggerAttackRelease(riffMelody[ri % riffMelody.length], "16n", t); ri++; }
    }, "16n"));
    loops.push(new Tone.Loop(() => { bar++; }, "1m"));
    Tone.getTransport().bpm.value = 146;
  }

  if (track === "fates") {
    // Tense, slow crescendo, deep drums — reworked specifically with
    // Big Brother's own nomination-ceremony scoring in mind, not just a
    // generic tension build: a dry, near-subliminal clock TICK runs
    // from the very first bar (a nomination is a race against a
    // deadline, which a drone/chord build alone can't convey), and the
    // harmonic content itself arrives one note at a time — a bright
    // metallic KEY hit, standing in for keys being placed one by one —
    // well before it's ever allowed to resolve into full chords. Starts
    // sparse — just the deep drum and the tick — and genuinely builds
    // over a full 16-bar arc: a bar counter (closed over by the loop
    // callbacks below, not a separate Tone module) gates when the
    // drone, then the single-note key hits, then finally full key
    // chords join in, and a slow volume ramp on the whole mix (tick
    // included) reinforces the build rather than just adding layers at
    // a flat volume.
    const reverb = new Tone.Reverb({ decay: 2.2, wet: 0.25 }).connect(masterVol);
    nodes.push(reverb);

    const deepDrum = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 8, envelope: { attack: 0.001, decay: 0.6, sustain: 0 }, volume: -2 }).connect(masterVol);
    const drone = new Tone.FMSynth({ harmonicity: 1.5, modulationIndex: 2, oscillator: { type: "sine" }, envelope: { attack: 2, decay: 1, sustain: 0.8, release: 3 }, volume: -22 }).connect(reverb);
    const stab = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "fatsawtooth", spread: 20, count: 2 }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.5 }, volume: -20 }).connect(reverb);
    // Monophonic — deliberately can't play a chord — so the single-key
    // phase (bars 6-13) is genuinely one note at a time, not harmony
    // arriving early in disguise. `stab` above still supplies the full
    // chords once the ceremony's properly underway (bar 14+), same as
    // this track's original build.
    const key = new Tone.MetalSynth({ harmonicity: 3.1, modulationIndex: 12, resonance: 900, octaves: 0.5, envelope: { attack: 0.001, decay: 0.4, release: 0.2 }, volume: -22 }).connect(reverb);
    // No reverb send — a real clock doesn't echo. Extremely quiet
    // throughout, only a hair louder once the ceremony's clearly
    // underway (see the crescendo below), so it reads as a constant
    // undercurrent of pressure rather than a rhythm section.
    const tick = new Tone.MetalSynth({ harmonicity: 8, modulationIndex: 4, resonance: 4000, octaves: 0.3, envelope: { attack: 0.001, decay: 0.02, release: 0.01 }, volume: -36 }).connect(masterVol);
    nodes.push(deepDrum, drone, stab, key, tick);

    let bar = 0;
    const droneGain = new Tone.Gain(0).connect(reverb);
    drone.disconnect();
    drone.connect(droneGain);
    nodes.push(droneGain);

    const keyNotes = ["A4", "C5", "E5", "D5"];
    const chords = [["A3", "C4", "E4"], ["F3", "A3", "D4"], ["G3", "C4", "E4"], ["A3", "C4", "E4"]];
    let ki = 0, chi = 0;

    loops.push(new Tone.Loop((t) => { deepDrum.triggerAttackRelease("A0", "2n", t); }, "2n"));
    loops.push(new Tone.Loop((t) => tick.triggerAttackRelease("32n", t), "4n"));
    loops.push(new Tone.Loop((t) => {
      bar++;
      if (bar === 4) { drone.triggerAttackRelease("A1", "8m", t); droneGain.gain.rampTo(1, 8); } // drone joins and fades in starting bar 4
      if (bar >= 6 && bar < 14 && bar % 2 === 0) { key.triggerAttackRelease(keyNotes[ki % keyNotes.length], "8n", t); ki++; } // single keys, one at a time, starting bar 6
      if (bar >= 14 && bar % 2 === 0) { stab.triggerAttackRelease(chords[chi % chords.length], "8n", t); chi++; } // full key chords once the ceremony's properly underway
      if (bar === 16) { masterVol.volume.rampTo(-4, 6); tick.volume.rampTo(-30, 6); } // the crescendo itself — overall level (tick included) rises as the build peaks
    }, "1m"));
    Tone.getTransport().bpm.value = 72;
  }

  if (track === "exile") {
    // Haunting, strings-based, echoing halls, whispers and conspiracy.
    // A long, heavy reverb IS the "echoing halls" — deliberately much
    // longer decay than any other track here. A filtered, very quiet
    // noise layer with a slow, irregular trigger pattern stands in for
    // "whispers" without literal vocal synthesis, which isn't something
    // this synthesis approach can convincingly produce — an evocative
    // texture reads more honestly than a failed attempt at voices.
    const hallReverb = new Tone.Reverb({ decay: 5, wet: 0.45 }).connect(masterVol);
    const delay = new Tone.FeedbackDelay({ delayTime: "4n", feedback: 0.45, wet: 0.3 }).connect(hallReverb);
    nodes.push(hallReverb, delay);

    const strings = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "fatsawtooth", spread: 30, count: 3 }, envelope: { attack: 2.5, decay: 1.5, sustain: 0.7, release: 3 }, volume: -18 }).connect(hallReverb);
    const bell = new Tone.FMSynth({ harmonicity: 2.5, modulationIndex: 4, oscillator: { type: "sine" }, envelope: { attack: 0.005, decay: 1.2, sustain: 0, release: 1.5 }, volume: -20 }).connect(delay);
    const whisper = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.4, decay: 0.6, sustain: 0.1, release: 1.2 }, volume: -34 }).connect(hallReverb);
    const whisperFilter = new Tone.Filter({ type: "bandpass", frequency: 1200, Q: 2 });
    whisper.disconnect();
    whisper.connect(whisperFilter);
    whisperFilter.connect(hallReverb);
    nodes.push(strings, bell, whisper, whisperFilter);

    // Dissonant-leaning minor, sparse — the space between notes matters
    // as much as the notes, matching "haunting" over "melodic."
    const progression = [["D3", "F3", "A3"], ["D3", "F3", "Ab3"], ["C3", "Eb3", "G3"], ["D3", "F3", "A3"]];
    const bellNotes = ["D5", "F5", "A5", "C6", "Ab4"];
    let ci = 0;
    loops.push(new Tone.Loop((t) => { strings.triggerAttackRelease(progression[ci % progression.length], "2m", t); ci++; }, "2m"));
    loops.push(new Tone.Loop((t) => { if (Math.random() > 0.55) bell.triggerAttackRelease(bellNotes[Math.floor(Math.random() * bellNotes.length)], "4n", t); }, "1m"));
    loops.push(new Tone.Loop((t) => { if (Math.random() > 0.7) whisper.triggerAttackRelease("2n", t); }, "2m"));
    Tone.getTransport().bpm.value = 64;
  }

  if (track === "finale") {
    // A triumphant remix of exile's own material — same progression,
    // shifted into its relative major (D minor -> F major) so the
    // melodic identity carries over recognizably, not a different song
    // wearing the same name. Faster, fuller (real drums and bass exile
    // never had), brighter lead on top, and reverb pulled back
    // considerably — present and confident instead of distant and
    // echoing.
    const reverb = new Tone.Reverb({ decay: 1.4, wet: 0.16 }).connect(masterVol);
    nodes.push(reverb);

    const kick = new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 6, envelope: { attack: 0.001, decay: 0.3, sustain: 0 }, volume: -6 }).connect(masterVol);
    const bass = new Tone.Synth({ oscillator: { type: "fatsawtooth", spread: 10, count: 2 }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.35, release: 0.2 }, volume: -10 }).connect(masterVol);
    const brass = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "fatsawtooth", spread: 25, count: 3 }, envelope: { attack: 0.05, decay: 0.4, sustain: 0.6, release: 0.8 }, volume: -12 }).connect(reverb);
    const lead = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.4 }, volume: -13 }).connect(reverb);
    nodes.push(kick, bass, brass, lead);

    // F major — the relative major of exile's D minor, same chord
    // shapes transposed, so it's audibly the same underlying material.
    const progression = [["F4", "A4", "C5"], ["F4", "A4", "C5"], ["Eb4", "G4", "Bb4"], ["F4", "A4", "C5"]];
    const bassLine = ["F2", "F2", "Eb2", "F2"];
    const leadMelody = ["F5", "A5", "C6", "A5", "Bb5", "A5", "F5", "C6"];
    let ci = 0, li = 0;
    loops.push(new Tone.Loop((t) => kick.triggerAttackRelease("C1", "8n", t), "4n"));
    loops.push(new Tone.Loop((t) => { bass.triggerAttackRelease(bassLine[ci % bassLine.length], "2n", t); }, "1m"));
    loops.push(new Tone.Loop((t) => { brass.triggerAttackRelease(progression[ci % progression.length], "1m", t); ci++; }, "1m"));
    loops.push(new Tone.Loop((t) => { lead.triggerAttackRelease(leadMelody[li % leadMelody.length], "8n", t); li++; }, "8n"));
    Tone.getTransport().bpm.value = 118;
  }

  if (track === "lobby" || !track) {
    // Chill, welcoming, anticipatory — waiting-room energy, still 80s/
    // vaporwave (spacious pad, gentle arpeggio), deliberately mellower
    // than every phase track that follows it.
    const reverb = new Tone.Reverb({ decay: 2, wet: 0.3 }).connect(masterVol);
    nodes.push(reverb);

    const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "fatsawtooth", spread: 20, count: 2 }, envelope: { attack: 1.8, decay: 1, sustain: 0.6, release: 2.5 }, volume: -20 }).connect(reverb);
    const pluck = new Tone.FMSynth({ harmonicity: 2, modulationIndex: 3, oscillator: { type: "sine" }, envelope: { attack: 0.01, decay: 0.5, sustain: 0.1, release: 0.6 }, volume: -18 }).connect(reverb);
    nodes.push(pad, pluck);

    const progression = [["C4", "E4", "G4"], ["A3", "C4", "E4"], ["F3", "A3", "C4"], ["G3", "B3", "D4"]];
    const arp = ["C5", "E5", "G5", "E5", "C5", "G4", "E5", "G5"];
    let ci = 0, ai = 0;
    loops.push(new Tone.Loop((t) => { pad.triggerAttackRelease(progression[ci % progression.length], "2m", t); ci++; }, "2m"));
    loops.push(new Tone.Loop((t) => { pluck.triggerAttackRelease(arp[ai % arp.length], "8n", t); ai++; }, "4n"));
    Tone.getTransport().bpm.value = 96;
  }

  // Tone.Loop instances don't run just by existing — each one has to be
  // started explicitly, or the transport ticks along in silence.
  loops.forEach((l) => l.start(0));

  return { masterVol, nodes, loops };
}

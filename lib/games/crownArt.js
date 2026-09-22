// ─── Crown Art ───
// Real black-figure Greek-pottery SVG artwork for Crowns' crowns,
// replacing the old procedurally-named/colored-swatch-only crowns from
// crownsData.js's original buildCrownDefs. Same visual language as
// lib/games/lifesTapestryData.js (see that file's header): a dark
// diagonal "weave" texture, a terracotta CLAY medallion with an INK
// 9px-equivalent stroke, INK silhouettes with CLAY "incised" detail
// lines drawn ON TOP of the black fill, and INK (not CLAY) for anything
// that extends OUTSIDE a silhouette (a thunderbolt bursting past the
// crown's own outline, an owl perched above it, etc. — matching how
// lifesTapestryData.js's Athena's spear or Aphrodite's dove are drawn
// in INK even though they're clearly "extra" elements, not part of the
// incised detailing on the black-figure itself).
//
// Each of CROWN_GOD_DESIGNS is one god's crown: a shared crown
// silhouette (see crownShape below — same "one shared base shape, only
// the added motif differs" trick lifesTapestryData.js's baseFigure
// uses) topped/flanked/backed with a small motif specific to that
// deity, so every crown is legible as "a crown" first and "whose
// crown" second, exactly like a real coin or vase medallion.
//
// buildCrownSet(count, seed) is what crownsData.js's buildCrownDefs
// used to do procedurally; this does it with real art instead, cycling
// back through the curated god list (with a distinguishing accent tint
// per cycle, replacing the old hue-spacing trick) once `count` exceeds
// the list length, so no two crowns in the same battle are ever
// visually identical even on a repeat cycle.

const INK = "#1a0f08";
const CLAY = "#c2703d";
const SIZE = 96;
const C = 48;

function weaveDefs() {
  return `<pattern id='cwWeave' width='8' height='8' patternTransform='rotate(45)' patternUnits='userSpaceOnUse'>
    <rect width='8' height='8' fill='#2a1810'/>
    <rect width='4' height='8' fill='#33200f'/>
  </pattern>`;
}

function medallionShell(tint) {
  return `<circle cx='${C}' cy='${C}' r='46' fill='url(#cwWeave)'/>
    <circle cx='${C}' cy='${C}' r='40' fill='${tint}' stroke='${INK}' stroke-width='5'/>`;
}

// The shared crown silhouette every god's design sits on top of — an
// INK three-point band, with CLAY-tinted (per-cycle-tinted, see
// buildCrownSet) "incised" jewel dots and a base line drawn on top of
// the black fill, same incised-line convention as
// lifesTapestryData.js's headDetail.
function crownShape(tint) {
  return `<path d='M26 66 L29 38 L39 51 L48 26 L57 51 L67 38 L70 66 Z' fill='${INK}'/>
    <rect x='24' y='64' width='48' height='8' rx='2' fill='${INK}'/>
    <circle cx='48' cy='42' r='2.6' fill='${tint}'/>
    <circle cx='38' cy='49' r='2.1' fill='${tint}'/>
    <circle cx='58' cy='49' r='2.1' fill='${tint}'/>
    <path d='M27 68 L69 68' stroke='${tint}' stroke-width='1.6'/>`;
}

function wrapCrown(content, tint) {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${SIZE}' height='${SIZE}' viewBox='0 0 ${SIZE} ${SIZE}'>
    <defs>${weaveDefs()}</defs>
    ${medallionShell(tint)}
    ${content}
  </svg>`;
}

// Every design: a god name, a legible small motif (`mark`), and whether
// that motif sits BEHIND the crown (rising/spreading from behind it —
// a thunderbolt, wings, a sunburst) or drawn AFTER it (perched on top —
// an owl, a flame, a grape cluster) — purely a layering choice per
// motif, made once per god below.
const RAW_DESIGNS = [
  { id: "zeus", god: "Zeus", layer: "behind",
    mark: () => `<path d='M48 4 L39 26 L48 26 L37 46 L61 20 L50 20 Z' fill='${INK}'/>` }, // thunderbolt

  { id: "hera", god: "Hera", layer: "behind",
    mark: (t) => `<path d='M48 22 Q24 14 18 34 Q34 30 48 38 Q62 30 78 34 Q72 14 48 22 Z' fill='${INK}'/>
      <circle cx='29' cy='27' r='2.4' fill='${t}'/><circle cx='48' cy='26' r='2.4' fill='${t}'/><circle cx='67' cy='27' r='2.4' fill='${t}'/>` }, // peacock fan

  { id: "poseidon", god: "Poseidon", layer: "behind",
    mark: () => `<path d='M48 6 L48 30 M48 6 L40 18 M48 6 L56 18 M36 18 L60 18' stroke='${INK}' stroke-width='4' fill='none' stroke-linecap='round'/>` }, // trident

  { id: "demeter", god: "Demeter", layer: "behind",
    mark: () => `<g stroke='${INK}' stroke-width='2.4' fill='none' stroke-linecap='round'>
      <path d='M18 24 L21 42 M17 30 L13 38 M17 30 L21 38 M17 36 L13 44 M17 36 L21 44'/>
      <path d='M78 24 L75 42 M79 30 L83 38 M79 30 L75 38 M79 36 L83 44 M79 36 L75 44'/>
    </g>` }, // wheat sheaves

  { id: "athena", god: "Athena", layer: "after",
    mark: (t) => `<ellipse cx='48' cy='18' rx='9' ry='10' fill='${INK}'/>
      <path d='M40 12 L36 6 M56 12 L60 6' stroke='${INK}' stroke-width='2.4' fill='none' stroke-linecap='round'/>
      <circle cx='44' cy='17' r='1.8' fill='${t}'/><circle cx='52' cy='17' r='1.8' fill='${t}'/>` }, // owl

  { id: "apollo", god: "Apollo", layer: "behind",
    mark: () => `<g stroke='${INK}' stroke-width='3' stroke-linecap='round'>
      <path d='M48 4 L48 14'/><path d='M25 13 L31 21'/><path d='M71 13 L65 21'/>
      <path d='M12 34 L22 34'/><path d='M84 34 L74 34'/>
    </g>` }, // sunburst

  { id: "artemis", god: "Artemis", layer: "behind",
    mark: () => `<path d='M72 10 A13 13 0 1 0 72 36 A9.5 9.5 0 1 1 72 10 Z' fill='${INK}'/>` }, // crescent moon

  { id: "ares", god: "Ares", layer: "behind",
    mark: () => `<path d='M20 12 L74 62' stroke='${INK}' stroke-width='3' stroke-linecap='round'/>
      <path d='M67 6 L74 12 L67 18 L60 12 Z' fill='${INK}'/>
      <circle cx='24' cy='68' r='8' fill='none' stroke='${INK}' stroke-width='3'/>` }, // spear and shield

  { id: "aphrodite", god: "Aphrodite", layer: "after",
    mark: () => `<path d='M48 10 Q40 4 34 10 Q41 11 44 16 Q35 15 32 21 Q42 20 48 15 Q54 20 64 21 Q61 15 52 16 Q55 11 62 10 Q56 4 48 10 Z' fill='${INK}'/>` }, // dove

  { id: "hephaestus", god: "Hephaestus", layer: "after",
    mark: () => `<rect x='38' y='72' width='20' height='8' rx='1.5' fill='${INK}'/>
      <rect x='66' y='50' width='7' height='16' rx='1.5' fill='${INK}' transform='rotate(40 69.5 58)'/>
      <rect x='60' y='44' width='16' height='9' rx='1.5' fill='${INK}' transform='rotate(40 68 48.5)'/>` }, // anvil + hammer

  { id: "hermes", god: "Hermes", layer: "behind",
    mark: () => `<path d='M16 60 Q6 52 9 40 Q19 46 22 58 Z' fill='${INK}'/>
      <path d='M80 60 Q90 52 87 40 Q77 46 74 58 Z' fill='${INK}'/>` }, // winged sandals

  { id: "dionysus", god: "Dionysus", layer: "after",
    mark: () => `<circle cx='41' cy='14' r='4' fill='${INK}'/><circle cx='48' cy='10' r='4' fill='${INK}'/>
      <circle cx='55' cy='14' r='4' fill='${INK}'/><circle cx='44' cy='19' r='4' fill='${INK}'/><circle cx='52' cy='19' r='4' fill='${INK}'/>
      <path d='M48 6 Q53 0 59 3 Q54 5 52 9 Z' fill='${INK}'/>` }, // grape cluster + leaf

  { id: "hades", god: "Hades", layer: "behind",
    mark: () => `<path d='M32 32 Q48 10 64 32 L64 44 L32 44 Z' fill='${INK}'/>
      <rect x='30' y='40' width='6' height='16' rx='1.5' fill='${INK}'/>
      <rect x='60' y='40' width='6' height='16' rx='1.5' fill='${INK}'/>` }, // dark helm

  { id: "hestia", god: "Hestia", layer: "after",
    mark: () => `<path d='M48 4 Q40 16 46 23 Q41 22 42 28 Q47 33 52 28 Q53 22 48 23 Q56 16 48 4 Z' fill='${INK}'/>` }, // hearth flame

  { id: "persephone", god: "Persephone", layer: "behind",
    mark: (t) => `<circle cx='76' cy='48' r='11' fill='${INK}'/>
      <path d='M72 38 L76 34 L80 38' stroke='${INK}' stroke-width='2.4' fill='none' stroke-linecap='round'/>
      <path d='M70 48 Q76 44 82 48 M70 52 Q76 56 82 52' stroke='${t}' stroke-width='1.6' fill='none'/>` }, // pomegranate

  { id: "nike", god: "Nike", layer: "behind",
    mark: () => `<path d='M24 56 Q4 40 9 16 Q23 28 28 48 Z' fill='${INK}'/>
      <path d='M72 56 Q92 40 87 16 Q73 28 68 48 Z' fill='${INK}'/>` }, // spread wings
];

export const CROWN_GOD_DESIGNS = RAW_DESIGNS.map((d) => ({
  ...d,
  build(tint) {
    const c = tint || CLAY;
    const markup = d.layer === "after" ? `${crownShape(c)}${d.mark(c)}` : `${d.mark(c)}${crownShape(c)}`;
    return wrapCrown(markup, c);
  },
}));

// Deterministic per-index accent tint for every cycle past the curated
// list length — a muted, still-pottery-plausible hue (kept desaturated
// so a repeated god motif still reads as "the same family, a different
// firing/glaze" rather than clashing against the black-figure style),
// spaced with the same golden-ratio-ish hue offset the old
// colorForIndex used, just offset so cycle 1 never lands back on CLAY's
// own hue.
function tintForCycle(cycle) {
  if (cycle <= 0) return CLAY;
  const hue = Math.round((cycle * 137.508 + 24) % 360);
  return `hsl(${hue}, 46%, 45%)`;
}

const ORDINALS = ["", "2nd Glaze", "3rd Glaze", "4th Glaze", "5th Glaze", "6th Glaze", "7th Glaze", "8th Glaze"];
function cycleSuffix(cycle) {
  return ORDINALS[cycle] || `${cycle + 1}th Glaze`;
}

// Replaces crownsData.js's old buildCrownDefs. Assigns each of the
// `count` crowns in this battle a design, cycling back through
// CROWN_GOD_DESIGNS (with a distinguishing accent tint per lap, see
// tintForCycle) once `count` exceeds the curated list's length —
// mirrors the old file's own index-based (not shuffled) assignment;
// which PLAYER ends up holding which crown is what initCrowns's own
// seeded Fisher-Yates shuffle is for, not this.
export function buildCrownSet(count) {
  const defs = [];
  for (let i = 0; i < count; i++) {
    const design = CROWN_GOD_DESIGNS[i % CROWN_GOD_DESIGNS.length];
    const cycle = Math.floor(i / CROWN_GOD_DESIGNS.length);
    const tint = tintForCycle(cycle);
    const svg = design.build(tint);
    const dataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    const name = cycle === 0 ? `Crown of ${design.god}` : `Crown of ${design.god} (${cycleSuffix(cycle)})`;
    defs.push({ id: `crown${i}`, name, god: design.god, color: tint, svg, dataUri });
  }
  return defs;
}

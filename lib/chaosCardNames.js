// The Power of Khaos mystery-draw buttons, named after mythological
// relics instead of plain numbers — see components/ChaosPowerPlayer.jsx.
// Fixed order, cycling if a round ever needs more cards than there are
// names (more eligible drawers than 12 — realistically only in a very
// large season's early rounds). Which specific card is secretly correct
// is picked independently server-side (pages/api/chaos-draw.js) and has
// nothing to do with this list, so reusing the same name-to-index
// mapping every round never leaks anything about which one to pick.
export const CHAOS_CARD_NAMES = [
  "Pandora's Box",
  "Eris' Apple",
  "Troy's Horse",
  "Prometheus' Fire",
  "Ariadne's Thread",
  "Icarus' Wings",
  "Heracles' Club",
  "Sisyphus' Boulder",
  "Narcissus' Pool",
  "Persephone's Pomegranate",
  "Orpheus's Lyre",
  "Jason's Fleece",
];

export function chaosCardLabel(index) {
  return CHAOS_CARD_NAMES[index % CHAOS_CARD_NAMES.length];
}

export const DOLL_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export const VOODOO_HOUR = 60 * 60 * 1000;
export const STORAGE_KEY_VOODOO = "traitors:voodoo";
export const VOODOO_LIMBS = ["Head", "L-Arm", "R-Arm", "L-Leg", "R-Leg"];

// Splits a eulogy's letter positions into 5 roughly-equal chunks, one per
// limb, computed once when the doll is created. Pricking a limb always
// reveals the same letters — and, crucially, once ANY player pricks a
// given limb on a given doll, that limb is used up for everyone. Before
// this, "limbs" were purely cosmetic — every button did the same thing
// (reveal 5 random letters), so there was nothing to actually lock.
export function buildLimbMap(eulogy) {
  const letterIdx = [];
  for (let i = 0; i < eulogy.length; i++) if (/[a-zA-Z]/.test(eulogy[i])) letterIdx.push(i);
  const map = {};
  VOODOO_LIMBS.forEach((limb, li) => {
    map[limb] = letterIdx.filter((_, i) => i % VOODOO_LIMBS.length === li);
  });
  return map;
}

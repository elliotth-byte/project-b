import { storageUpdate, subscribeGameState } from "./gameStorage";
import { KEY_FINALE_QA } from "./gameState";

// ─── Finale Q&A ───
// Two pieces, both fully public (every player, finalist, and the host
// can see all of it — nothing here is secret, unlike a vote or the
// Power of Khaos):
//   statements: { [finalistId]: { text, submittedAt } } — each finalist's
//     own "why I should win," one each.
//   questions: [{ id, jurorId, jurorName, text, submittedAt,
//     responses: { [finalistId]: { text, submittedAt } } }] — one
//     question or statement per JURY member (an exiled player who
//     didn't quit and wasn't removed — see isJuryEligible below), with
//     each of the 3 finalists able to respond to each one.
//
// Lives in game_state like everything else non-confidential — the same
// broad "anyone in this game can read/write" RLS every other public
// piece of state already has, so no new policy is needed.

export function subscribeFinaleQa(gameId, onChange) {
  return subscribeGameState(gameId, KEY_FINALE_QA, (v) => onChange(v || { statements: {}, questions: [] }));
}

// Only an exiled player counts — a voluntary quit and a host removal
// both set elimination_type "quit" (see lib/playerRemoval.js), and
// neither of those players gets a jury voice here.
export function isJuryEligible(player) {
  return !!player && player.approved && !player.alive && player.elimination_type !== "quit";
}

export async function submitStatement(gameId, finalistId, text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return { ok: false };
  const res = await storageUpdate(gameId, KEY_FINALE_QA, (fresh) => {
    const state = fresh || { statements: {}, questions: [] };
    return { ...state, statements: { ...state.statements, [finalistId]: { text: trimmed, submittedAt: Date.now() } } };
  });
  return { ok: res.ok };
}

export async function submitJuryQuestion(gameId, jurorId, jurorName, text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return { ok: false };
  const res = await storageUpdate(gameId, KEY_FINALE_QA, (fresh) => {
    const state = fresh || { statements: {}, questions: [] };
    if (state.questions.some((q) => q.jurorId === jurorId)) return state; // one per juror
    return {
      ...state,
      questions: [...state.questions, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        jurorId, jurorName, text: trimmed, submittedAt: Date.now(), responses: {},
      }],
    };
  });
  return { ok: res.ok };
}

export async function submitResponse(gameId, questionId, finalistId, text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return { ok: false };
  const res = await storageUpdate(gameId, KEY_FINALE_QA, (fresh) => {
    const state = fresh || { statements: {}, questions: [] };
    return {
      ...state,
      questions: state.questions.map((q) => (
        q.id === questionId ? { ...q, responses: { ...q.responses, [finalistId]: { text: trimmed, submittedAt: Date.now() } } } : q
      )),
    };
  });
  return { ok: res.ok };
}

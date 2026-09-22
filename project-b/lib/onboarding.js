import { supabase } from "./supabaseClient";

// ─── Onboarding Checklist ───
// Three things a brand-new player needs to have done at least once
// before they can take part in a Battle — see sql/add-onboarding-
// checklist.sql for the columns this reads/writes and why existing
// players are grandfathered past all three. Each mark* function is a
// simple, idempotent "set this flag true" — calling one that's already
// true is harmless, so call sites don't need their own "have they
// already done this" check first.
export async function markOnboardingChatSent(playerId) {
  if (!playerId) return;
  await supabase.from("players").update({ onboarding_chat_sent: true }).eq("id", playerId);
}

export async function markOnboardingDmSent(playerId) {
  if (!playerId) return;
  await supabase.from("players").update({ onboarding_dm_sent: true }).eq("id", playerId);
}

export async function markOnboardingProfileViewed(playerId) {
  if (!playerId) return;
  await supabase.from("players").update({ onboarding_profile_viewed: true }).eq("id", playerId);
}

export function onboardingComplete(player) {
  if (!player) return false;
  return !!(player.onboardingChatSent && player.onboardingDmSent && player.onboardingProfileViewed);
}

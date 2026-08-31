import { supabase } from "./supabaseClient";

// ─── Platform Settings ───
// See sql/add-platform-settings.sql for the full reasoning. Key-value,
// same shape as game_state, just with no game_id since these apply
// across every season.
const DISABLED_CHALLENGES_KEY = "disabled_challenges";

export async function fetchGloballyDisabledChallenges() {
  const { data, error } = await supabase.from("platform_settings").select("value").eq("key", DISABLED_CHALLENGES_KEY).maybeSingle();
  if (error || !data) return [];
  return Array.isArray(data.value) ? data.value : [];
}

// Platform-admin only in practice — the underlying RLS policy is what
// actually enforces this (see sql/add-platform-settings.sql), not
// anything client-side; a non-admin calling this simply has their
// write rejected by the database.
export async function setGloballyDisabledChallenges(gameTypes) {
  const { error } = await supabase
    .from("platform_settings")
    .upsert({ key: DISABLED_CHALLENGES_KEY, value: gameTypes, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return { ok: !error, error: error?.message };
}

import { supabase } from "./supabaseClient";

// ─── Secret recruitment offers ───
// See sql/add-recruit-offers.sql for the table, its RLS (host + the target
// player only) and respond_recruit_offer(), the one way a player answers.

export async function sendRecruitOffer(gameId, playerId, faction, message) {
  const { data, error } = await supabase
    .from("recruit_offers")
    .insert({ game_id: gameId, player_id: playerId, faction, message: message?.trim() || null })
    .select()
    .single();
  return error ? { ok: false, error: error.message } : { ok: true, offer: data };
}

export async function withdrawRecruitOffer(offerId) {
  const { error } = await supabase.from("recruit_offers").update({ status: "withdrawn" }).eq("id", offerId).eq("status", "pending");
  return !error;
}

export async function deleteRecruitOffer(offerId) {
  const { error } = await supabase.from("recruit_offers").delete().eq("id", offerId);
  return !error;
}

export async function markRecruitOfferApplied(offerId) {
  const { error } = await supabase.from("recruit_offers").update({ applied_at: new Date().toISOString() }).eq("id", offerId);
  return !error;
}

export async function respondToRecruitOffer(offerId, accept) {
  const { data, error } = await supabase.rpc("respond_recruit_offer", { p_offer_id: offerId, p_accept: accept });
  return error ? { ok: false, error: error.message } : { ok: true, status: data };
}

// Host: every offer in the game. Player: RLS only ever returns their own,
// and the playerId filter keeps the query itself to just them too.
export function subscribeRecruitOffers(gameId, onChange, playerId = null) {
  let active = true;
  const load = async () => {
    let q = supabase.from("recruit_offers").select("*").eq("game_id", gameId).order("created_at", { ascending: false });
    if (playerId) q = q.eq("player_id", playerId);
    const { data } = await q;
    if (active) onChange(data || []);
  };
  load();
  const channel = supabase
    .channel(`recruit-offers:${gameId}:${playerId || "host"}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "recruit_offers", filter: playerId ? `player_id=eq.${playerId}` : `game_id=eq.${gameId}` }, load)
    .subscribe();
  const pollInterval = window.setInterval(load, 6000);
  return () => { active = false; window.clearInterval(pollInterval); supabase.removeChannel(channel); };
}

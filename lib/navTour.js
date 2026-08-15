import { supabase } from "./supabaseClient";

// Tied to the login (auth user), not the per-season player row — the
// point of this tour is "do you know your way around the app," which
// doesn't reset just because someone's starting a new season. Stored in
// user_metadata (self-writable, no security concern here the way the
// recovery-email confirmed flag has — there's no downside to a player
// re-triggering their own tutorial).
export function hasSeenNavTour(user) {
  return !!user?.user_metadata?.hasSeenNavTour;
}

export async function markNavTourSeen() {
  return supabase.auth.updateUser({ data: { hasSeenNavTour: true } });
}

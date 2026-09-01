import { supabase } from "./supabaseClient";
import { fetchProfile, fetchSeasonHistory, fetchSeasonRoster } from "./profiles";
import { fetchFriendedUserIds } from "./friendships";

// ─── Relationship Web ───
// Assembles everything components/RelationshipWeb.jsx needs to draw the
// diagram for ANY subject (not just yourself — pages/profile.jsx shows
// anyone's): their most recent season's cast (the inner ring), everyone
// from every earlier season deduped (the outer ring), which of them
// they've friended (lib/friendships.js — publicly readable), and which
// of them have a real vote-against with them, in either direction, in
// any shared season. Read-only, computed fresh on every call — nothing
// here is persisted beyond the friendships table itself.
//
// ADVERSARIAL-VOTE COVERAGE: all three of Project B/Traitors' vote
// systems (Exile, the finale jury vote, Roundtable, AND Traitors'
// Murder Vote) feed this, via the public_relationship_adversaries()
// Postgres function (see sql/add-relationship-adversaries-function.sql)
// rather than a client-side read. That function is SECURITY DEFINER
// specifically because Murder Vote data lives in traitor_state behind
// faction-scoped RLS (a Faithful player can never read it directly, and
// even a Traitor never sees the opposing faction's votes) — reading it
// client-side isn't possible for most subjects at all, and reading it
// ANY other way risks leaking a live, not-yet-revealed vote as a
// spoiler. The function only ever returns pairs from seasons that have
// actually ENDED (see its own header comment for exactly what "ended"
// means per game type) — nothing here can ever reflect an in-progress
// vote, for any of the three systems.
export async function fetchRelationshipWeb(subjectUserId) {
  const [profile, history, friendedIds] = await Promise.all([
    fetchProfile(subjectUserId),
    fetchSeasonHistory(subjectUserId),
    fetchFriendedUserIds(subjectUserId),
  ]);
  const friendedSet = new Set(friendedIds);

  const me = { userId: subjectUserId, displayName: profile?.display_name || "This person", photoUrl: profile?.photo_url || null };

  if (history.length === 0) {
    return { me, innerRing: [], outerRing: [], friendCount: 0, adversaryCount: 0 };
  }

  const [mostRecent, ...earlier] = history;

  const innerRoster = await fetchSeasonRoster(mostRecent.gameId);
  const innerIds = new Set(innerRoster.filter((p) => p.userId && p.userId !== subjectUserId).map((p) => p.userId));

  const earlierRosters = await Promise.all(earlier.map((h) => fetchSeasonRoster(h.gameId)));
  const outerMap = new Map(); // userId -> roster row, first occurrence wins
  earlierRosters.flat().forEach((p) => {
    if (!p.userId || p.userId === subjectUserId || innerIds.has(p.userId) || outerMap.has(p.userId)) return;
    outerMap.set(p.userId, p);
  });

  // One roster row per person per season they were in — a name/character
  // is enough to build the ring; the actual portrait always comes from
  // their persistent PROFILE photo (bulk-fetched below), not any one
  // season's own avatar, so the same face shows up consistently
  // wherever this person appears across the subject's whole history.
  const innerRosterById = new Map(innerRoster.filter((p) => innerIds.has(p.userId)).map((p) => [p.userId, p]));

  const allRingIds = [...innerIds, ...outerMap.keys()];
  const allProfileIds = [...new Set([...allRingIds, subjectUserId])];

  const profilesById = new Map();
  if (allProfileIds.length > 0) {
    const { data: profileRows } = await supabase.from("profiles").select("user_id, display_name, photo_url").in("user_id", allProfileIds);
    (profileRows || []).forEach((row) => profilesById.set(row.user_id, row));
  }

  const { data: adversaryRows } = await supabase.rpc("public_relationship_adversaries", { p_subject_user_id: subjectUserId });
  const adversarialIds = new Set((adversaryRows || []).map((r) => r.other_user_id));

  const toMember = (id, rosterRow) => ({
    userId: id,
    displayName: profilesById.get(id)?.display_name || rosterRow?.displayName || "Unknown",
    photoUrl: profilesById.get(id)?.photo_url || null,
    isFriend: friendedSet.has(id),
    isAdversary: adversarialIds.has(id),
  });

  const innerRing = [...innerIds].map((id) => toMember(id, innerRosterById.get(id)));
  const outerRing = [...outerMap.keys()].map((id) => toMember(id, outerMap.get(id)));

  const uniqueFriends = new Set([...innerRing, ...outerRing].filter((m) => m.isFriend).map((m) => m.userId));
  const uniqueAdversaries = new Set([...innerRing, ...outerRing].filter((m) => m.isAdversary).map((m) => m.userId));

  return { me, innerRing, outerRing, friendCount: uniqueFriends.size, adversaryCount: uniqueAdversaries.size };
}

import { supabase } from "./supabaseClient";
import { fetchProfile, fetchSeasonHistory, fetchSeasonRoster } from "./profiles";
import { fetchMyFriendedUserIds } from "./friendships";

// ─── Relationship Web ───
// Assembles everything components/RelationshipWeb.jsx needs to draw the
// diagram: your most recent season's cast (the inner ring), everyone
// from every earlier season deduped (the outer ring), which of them
// you've friended (lib/friendships.js), and which of them have a real
// vote-against between the two of you, in either direction, in any
// shared season. Read-only, computed fresh on every call — nothing here
// is persisted beyond the friendships table itself.
//
// ADVERSARIAL-VOTE COVERAGE, READ THIS BEFORE CHANGING THE DETECTION
// LOGIC BELOW: two of Project B/Traitors' three vote systems are used
// here; the third — Traitors' Murder Vote — is deliberately excluded.
// Exile votes (pb:exile-history + pb:finale, in game_state) and
// Roundtable votes (traitors:vote-history, also in game_state) are
// both readable by any approved player of that game, forever, via the
// same is_game_host/is_game_player policy every other game_state read
// in this app relies on (see sql/schema.sql) — so both feed the
// adversarial set below. Murder Vote data lives in `traitor_state`
// instead (see sql/add-traitors-tables.sql), whose RLS is
// FACTION-scoped: only the host, and only that faction's own members,
// can ever read a given faction's votes — a Faithful player (who is
// usually the one actually being voted on) can never read it at all,
// and even a Traitor never sees the opposing faction's votes. Building
// this from Murder Vote data would produce a relationship web that's
// silently complete for some players and silently missing entries for
// others depending on their role, which is worse than just not
// covering it — so it's left out entirely, on purpose.
export async function fetchRelationshipWeb(userId) {
  const [profile, history, friendedIds] = await Promise.all([
    fetchProfile(userId),
    fetchSeasonHistory(userId),
    fetchMyFriendedUserIds(userId),
  ]);
  const friendedSet = new Set(friendedIds);

  const me = { userId, displayName: profile?.display_name || "You", photoUrl: profile?.photo_url || null };

  if (history.length === 0) {
    return { me, innerRing: [], outerRing: [], friendCount: 0, adversaryCount: 0 };
  }

  const [mostRecent, ...earlier] = history;

  const innerRoster = await fetchSeasonRoster(mostRecent.gameId);
  const innerIds = new Set(innerRoster.filter((p) => p.userId && p.userId !== userId).map((p) => p.userId));

  const earlierRosters = await Promise.all(earlier.map((h) => fetchSeasonRoster(h.gameId)));
  const outerMap = new Map(); // userId -> roster row, first occurrence wins
  earlierRosters.flat().forEach((p) => {
    if (!p.userId || p.userId === userId || innerIds.has(p.userId) || outerMap.has(p.userId)) return;
    outerMap.set(p.userId, p);
  });

  // One roster row per person per season they were in — a name/character
  // is enough to build the ring; the actual portrait always comes from
  // their persistent PROFILE photo (bulk-fetched below), not any one
  // season's own avatar, so the same face shows up consistently
  // wherever this person appears across your whole history.
  const innerRosterById = new Map(innerRoster.filter((p) => innerIds.has(p.userId)).map((p) => [p.userId, p]));

  const allRingIds = [...innerIds, ...outerMap.keys()];
  const allProfileIds = [...new Set([...allRingIds, userId])];

  const profilesById = new Map();
  if (allProfileIds.length > 0) {
    const { data: profileRows } = await supabase.from("profiles").select("user_id, display_name, photo_url").in("user_id", allProfileIds);
    (profileRows || []).forEach((row) => profilesById.set(row.user_id, row));
  }

  const adversarialIds = await computeAdversarialUserIds(userId, history, allRingIds);

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

// Returns a Set of user_ids who have cast (or received) at least one
// real vote-against with `userId`, across every season in `history`,
// scoped to just the people who actually matter (`candidateIds` — the
// ring members) so this never has to reason about anyone outside what's
// actually going to be drawn.
async function computeAdversarialUserIds(userId, history, candidateIds) {
  const adversarial = new Set();
  if (candidateIds.length === 0) return adversarial;
  const candidateSet = new Set(candidateIds);

  const gameIds = history.map((h) => h.gameId);
  const { data: gameRows } = await supabase.from("games").select("id, game_type").in("id", gameIds);
  const projectBGameIds = (gameRows || []).filter((g) => g.game_type !== "traitors").map((g) => g.id);
  const traitorsGameIds = (gameRows || []).filter((g) => g.game_type === "traitors").map((g) => g.id);

  const flagIfRelevant = (voterUserId, targetUserId) => {
    if (!voterUserId || !targetUserId || voterUserId === targetUserId) return;
    if (voterUserId === userId && candidateSet.has(targetUserId)) adversarial.add(targetUserId);
    if (targetUserId === userId && candidateSet.has(voterUserId)) adversarial.add(voterUserId);
  };

  // ─── Project B: Exile votes + the finale jury vote ───
  // Both stored as raw voteRows: [{ voterId, targetId, reason }], where
  // voterId/targetId are per-game players.id, not user_id — resolved
  // below via that game's own players table. Nullified-by-Chaos votes
  // still count here: the person genuinely cast that vote, which is
  // exactly what an adversarial mark is meant to reflect, independent
  // of whether the Power of Khaos later voided its effect on the tally.
  if (projectBGameIds.length > 0) {
    const [{ data: stateRows }, { data: playerRows }] = await Promise.all([
      supabase.from("game_state").select("game_id, key, value").in("game_id", projectBGameIds).in("key", ["pb:exile-history", "pb:finale"]),
      supabase.from("players").select("id, user_id, game_id").in("game_id", projectBGameIds),
    ]);
    const idToUserByGame = new Map();
    (playerRows || []).forEach((p) => {
      if (!idToUserByGame.has(p.game_id)) idToUserByGame.set(p.game_id, new Map());
      idToUserByGame.get(p.game_id).set(p.id, p.user_id);
    });

    (stateRows || []).forEach((row) => {
      const idMap = idToUserByGame.get(row.game_id);
      if (!idMap) return;
      const entries = row.key === "pb:exile-history" ? (row.value || []) : [row.value].filter(Boolean);
      entries.forEach((entry) => {
        (entry.voteRows || []).forEach((v) => {
          flagIfRelevant(idMap.get(v.voterId), idMap.get(v.targetId));
        });
      });
    });
  }

  // ─── Traitors: Roundtable votes ───
  // Archived as { round, votes: { [voterName]: { target, reason } } }
  // (see components/RoundtableHost.jsx's nextRound) — keyed by
  // display_name, not player id, so resolution below goes through a
  // name -> user_id map instead of the id map used for Project B above.
  // Murder Vote is deliberately NOT included — see this file's header
  // comment for why.
  if (traitorsGameIds.length > 0) {
    const [{ data: stateRows }, { data: playerRows }] = await Promise.all([
      supabase.from("game_state").select("game_id, key, value").in("game_id", traitorsGameIds).eq("key", "traitors:vote-history"),
      supabase.from("players").select("user_id, display_name, game_id").in("game_id", traitorsGameIds),
    ]);
    const nameToUserByGame = new Map();
    (playerRows || []).forEach((p) => {
      if (!nameToUserByGame.has(p.game_id)) nameToUserByGame.set(p.game_id, new Map());
      nameToUserByGame.get(p.game_id).set(p.display_name, p.user_id);
    });

    (stateRows || []).forEach((row) => {
      const nameMap = nameToUserByGame.get(row.game_id);
      if (!nameMap) return;
      (row.value || []).forEach((entry) => {
        Object.entries(entry.votes || {}).forEach(([voterName, v]) => {
          flagIfRelevant(nameMap.get(voterName), nameMap.get(v.target));
        });
      });
    });
  }

  return adversarial;
}

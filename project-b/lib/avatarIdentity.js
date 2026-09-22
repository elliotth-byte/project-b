import { AVATAR_COLLECTIONS, collectionImageUrl } from "./avatarCollections";

// Same pattern as lib/playerIdentity.js's name resolution: applied once,
// wherever the roster gets fetched, so every component that renders a
// player (MemoryWall, chat, ...) just reads `.effectiveAvatarUrl` —
// null means "fall back to their color swatch" — instead of each one
// re-deriving which of the four modes is active itself.
export function resolveAvatars(players, settings) {
  const list = players || [];
  const mode = settings?.avatarMode || "none";

  if (mode === "collection") {
    const collection = AVATAR_COLLECTIONS.find((c) => c.id === settings.avatarCollectionId);
    // No collection picked (or the season's alias mode is off, so there's
    // no alias to key art off of — see AdminHost.jsx, which keeps this
    // mode disabled in the UI until alias mode is on) — fall back to
    // colors rather than show broken images.
    if (!collection) return list.map((p) => ({ ...p, effectiveAvatarUrl: null }));
    return list.map((p) => ({
      ...p,
      effectiveAvatarUrl: p.alias ? collectionImageUrl(collection.slug, p.alias) : null,
    }));
  }

  if (mode === "player_upload" || mode === "host_upload") {
    // Both modes read the same uploaded field — who's ALLOWED to write
    // it is what differs between them, enforced by RLS and by which
    // upload UI is shown (see lib/avatarUpload.js / components/
    // PlayerAvatarUpload.jsx / AdminHost.jsx), not by this resolver.
    return list.map((p) => ({ ...p, effectiveAvatarUrl: p.avatar_url || null }));
  }

  return list.map((p) => ({ ...p, effectiveAvatarUrl: null }));
}

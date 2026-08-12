// Built-in avatar themes — one image per alias (see lib/aliases.js), all
// 14 required per theme. These are static assets shipped in /public,
// NOT something uploaded through the app — see lib/avatarUpload.js for
// the separate player-upload/host-upload mechanism, which is a
// completely different avatar mode.
//
// To add a new theme: drop 14 images into
// /public/avatars/<slug>/<alias-lowercased>.jpg (e.g. zeus.jpg,
// hephaestus.jpg — see collectionImageUrl below for the exact filename
// rule) and add one entry here. No database, no upload UI involved.
export const AVATAR_COLLECTIONS = [
  // { id: "anime", label: "Anime", slug: "anime" },
  // { id: "beachwear", label: "Beachwear", slug: "beachwear" },
];

export function collectionImageUrl(slug, aliasName) {
  const file = aliasName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `/avatars/${slug}/${file}.jpg`;
}

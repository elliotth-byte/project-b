// Built-in avatar themes — one image per alias (see lib/aliases.js), all
// 14 required per theme. These are static assets shipped in /public,
// NOT something uploaded through the app — see lib/avatarUpload.js for
// the separate player-upload/host-upload mechanism, which is a
// completely different avatar mode.
//
// To add a new theme: drop 14 images into
// /public/avatars/<slug>/<alias-lowercased>.png (e.g. zeus.png,
// hephaestus.png — see collectionImageUrl below for the exact filename
// rule) and add one entry here. No database, no upload UI involved. PNG
// specifically (not JPEG) so a theme can use real transparency, which
// matters once avatars fill the whole tile rather than sitting in a
// small circle — see components/MemoryWall.jsx.
export const AVATAR_COLLECTIONS = [
  { id: "default-gods", label: "Default Gods", slug: "default-gods" },
];

export function collectionImageUrl(slug, aliasName) {
  const file = aliasName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `/avatars/${slug}/${file}.png`;
}

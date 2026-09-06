import { storageSet, subscribeGameState } from "./gameStorage";

// ─── Stereo Types — what the host's Spotify is doing right now ───
// Same shape as lib/traitorsFinale.js's KEY_TRAITORS_FINALE: one small
// game_state key, a setter, a subscribe wrapper. Only the host's own
// StereoTypesSpotifyWidget.jsx ever writes this. Every other player
// reads it for two independent purposes: driving their own copy of the
// reactive cityscape (StereoTypesCityscape.jsx's reactive/intensity
// props) regardless of whether they've connected Spotify themselves,
// and — for a player who HAS connected their own account via
// StereoTypesPlayerSpotifySync.jsx — actually starting/matching
// playback on their own device.
//
// nowPlaying shape: { isPlaying, intensity, trackName, artistName,
// albumArt, bpm, trackUri, positionMs, updatedAt }. trackUri/positionMs
// used to be deliberately omitted (this key was documented as
// read-only status, not a remote control) — they're included now
// specifically so a connected player's own Spotify.Player can be told
// what to play and where, which needs both. positionMs is only ever
// meaningful alongside updatedAt: a reader reconstructs "where
// playback actually is right now" as
// `positionMs + (isPlaying ? Date.now() - updatedAt : 0)`, since the
// host's own position keeps advancing between broadcasts while
// playing. Still nobody's Spotify *credentials* — just a track URI and
// a playhead position, both already visible to anyone looking at the
// host's own Spotify app.
export const KEY_STEREO_TYPES_NOW_PLAYING = "stereo_types:now-playing";

export function publishNowPlaying(gameId, nowPlaying) {
  return storageSet(gameId, KEY_STEREO_TYPES_NOW_PLAYING, nowPlaying);
}

export function subscribeStereoTypesNowPlaying(gameId, onChange) {
  return subscribeGameState(gameId, KEY_STEREO_TYPES_NOW_PLAYING, onChange);
}

// Reconstructs "where the host's own playback actually is right now,"
// projecting forward from the last broadcast by however long it's been
// since updatedAt if it was playing at the time — used both by
// StereoTypesPlayerSpotifySync.jsx (deciding whether/where to seek) and
// nothing else needs it, but it's shared here rather than duplicated
// since the math has to stay identical everywhere it's used.
export function projectedPositionMs(nowPlaying) {
  if (!nowPlaying || typeof nowPlaying.positionMs !== "number") return null;
  if (!nowPlaying.isPlaying || typeof nowPlaying.updatedAt !== "number") return nowPlaying.positionMs;
  return nowPlaying.positionMs + (Date.now() - nowPlaying.updatedAt);
}

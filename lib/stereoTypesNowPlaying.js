import { storageSet, subscribeGameState } from "./gameStorage";

// ─── Stereo Types — what the host's Spotify is doing right now ───
// Same shape as lib/traitorsFinale.js's KEY_TRAITORS_FINALE: one small
// game_state key, a setter, a subscribe wrapper. Only the host ever
// writes this (from StereoTypesSpotifyWidget.jsx, which is the only
// thing that ever talks to Spotify — see that file for why); every
// other player only ever reads it, to drive their own copy of the
// reactive cityscape (StereoTypesCityscape.jsx's reactive/intensity
// props) in sync with what the host is actually playing.
export const KEY_STEREO_TYPES_NOW_PLAYING = "stereo_types:now-playing";

// nowPlaying shape: { isPlaying, intensity, trackName, artistName,
// albumArt, updatedAt } — see StereoTypesSpotifyWidget.jsx for how
// intensity (0-1) is derived. Deliberately no track/device IDs, no
// Spotify URIs, nothing that could be used to control playback from
// here — this key is read-only status, not a remote control.
export function publishNowPlaying(gameId, nowPlaying) {
  return storageSet(gameId, KEY_STEREO_TYPES_NOW_PLAYING, nowPlaying);
}

export function subscribeStereoTypesNowPlaying(gameId, onChange) {
  return subscribeGameState(gameId, KEY_STEREO_TYPES_NOW_PLAYING, onChange);
}

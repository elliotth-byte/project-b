// ─── Spotify OAuth — PKCE, host-only ───
// Only the host ever authenticates with Spotify (see
// StereoTypesSpotifyWidget.jsx for the "one boombox, same as a real
// party" reasoning) — so everything in here runs entirely in the
// host's own browser tab. No server code, no client secret: PKCE
// (RFC 7636) exists specifically so a public client like this one
// (a static Next.js page, not a confidential backend) can do the
// Authorization Code flow safely without ever holding a secret that'd
// have to ship in the client bundle. Tokens live in sessionStorage
// only — never written to Supabase, never visible to other players —
// which also means a host who closes the tab has to reconnect next
// time; that's an intentional trade for "no Spotify credential of
// any kind ever touches our database."
//
// Requires NEXT_PUBLIC_SPOTIFY_CLIENT_ID (a Client ID from
// https://developer.spotify.com/dashboard, PKCE/"Web" flow — no
// client secret needed or used). See this repo's own build notes for
// the exact redirect URI to register there.

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;

// streaming: required for the Web Playback SDK itself to mint a
// device. user-read-playback-state/user-modify-playback-state: the
// play/pause/skip-next controls. user-read-email/user-read-private:
// the SDK's own player init historically expects these to be granted
// even though this app never calls a /me endpoint directly.
const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

const SS_VERIFIER_KEY = "stereo_types_spotify_pkce_verifier";
const SS_TOKENS_KEY = "stereo_types_spotify_tokens"; // { accessToken, refreshToken, expiresAt }

function base64UrlEncode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// RFC 7636's code_verifier must be 43-128 chars from [A-Z a-z 0-9 - . _
// ~]. base64url's own alphabet (A-Z a-z 0-9 - _) is a strict subset of
// that, so encoding random bytes this way is already spec-compliant
// with no extra filtering needed.
function randomVerifier() {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function challengeFromVerifier(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

// This exact string has to be registered, verbatim, in the Spotify app
// dashboard's Redirect URIs list, or the authorize step fails outright
// with "INVALID_CLIENT: Invalid redirect URI." Computed from
// window.location.origin (not hardcoded) so it's automatically correct
// on Vercel preview URLs, production, and local dev alike — but that
// also means each distinct origin this ever runs from needs its own
// entry in that dashboard list.
export function getRedirectUri() {
  return `${window.location.origin}/stereo-types-spotify-callback`;
}

export function isSpotifyConfigured() {
  return !!CLIENT_ID;
}

// state round-trips gameId through Spotify's own redirect (which only
// ever carries `code`/`state`/`error`) so the callback page knows which
// game to bounce back to — base64url-encoded JSON, not a Spotify-issued
// value, so decoding it never needs a network round trip.
function encodeState(obj) {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));
}

export function decodeState(state) {
  try {
    const padded = state.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

// Kicks off the redirect to accounts.spotify.com — there's no return
// value because there's nothing to return to; the browser navigates
// away entirely and comes back on pages/stereo-types-spotify-callback.jsx.
export async function beginAuth(gameId) {
  if (!CLIENT_ID) throw new Error("NEXT_PUBLIC_SPOTIFY_CLIENT_ID is not set");
  const verifier = randomVerifier();
  sessionStorage.setItem(SS_VERIFIER_KEY, verifier);
  const challenge = await challengeFromVerifier(verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: getRedirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    state: encodeState({ gameId }),
    scope: SCOPES,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function readTokens() {
  try {
    const raw = sessionStorage.getItem(SS_TOKENS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveTokens({ access_token, refresh_token, expires_in }) {
  const existing = readTokens();
  const tokens = {
    accessToken: access_token,
    // A refresh may not come back with a new refresh_token every time
    // — keep the previous one in that case rather than dropping it.
    refreshToken: refresh_token || existing?.refreshToken || null,
    expiresAt: Date.now() + expires_in * 1000,
  };
  sessionStorage.setItem(SS_TOKENS_KEY, JSON.stringify(tokens));
  return tokens;
}

// Called once, from the callback page, with the ?code= Spotify handed
// back. Reads the verifier this same browser stashed before redirecting
// out, so this only ever works as a same-tab round trip.
export async function completeAuth(code) {
  const verifier = sessionStorage.getItem(SS_VERIFIER_KEY);
  if (!verifier) throw new Error("Missing PKCE verifier — the Spotify sign-in round-trip got interrupted. Try connecting again.");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  });
  sessionStorage.removeItem(SS_VERIFIER_KEY);
  if (!res.ok) throw new Error(`Spotify token exchange failed (${res.status})`);
  return saveTokens(await res.json());
}

async function refreshTokens() {
  const existing = readTokens();
  if (!existing?.refreshToken) return null;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: existing.refreshToken,
      client_id: CLIENT_ID,
    }),
  });
  if (!res.ok) return null;
  return saveTokens(await res.json());
}

export function isConnected() {
  return !!readTokens()?.accessToken;
}

export function disconnect() {
  sessionStorage.removeItem(SS_TOKENS_KEY);
  sessionStorage.removeItem(SS_VERIFIER_KEY);
}

// Returns a valid access token, transparently refreshing first if it's
// expired (or about to be, within a minute) — this same function IS the
// getOAuthToken(cb) callback the Web Playback SDK expects, just wrapped
// in a promise; see StereoTypesSpotifyWidget.jsx for that adapter.
export async function getAccessToken() {
  let tokens = readTokens();
  if (!tokens) return null;
  if (Date.now() > tokens.expiresAt - 60000) {
    tokens = await refreshTokens();
  }
  return tokens?.accessToken || null;
}

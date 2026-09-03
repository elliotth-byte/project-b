import { supabase } from "./supabaseClient";

// ─── The "no real email" trick ───
// Supabase Auth is built around email + password. Players only ever type
// a username, so we turn that into a fake, never-shown email behind the
// scenes. Supabase still does all the real work — hashing the password,
// issuing session tokens, rejecting wrong passwords, etc.
const PLAYER_EMAIL_DOMAIN = "players.projectb.game";

function usernameToEmail(username) {
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!clean) throw new Error("Please enter a username using letters, numbers, - or _.");
  return `${clean}@${PLAYER_EMAIL_DOMAIN}`;
}

export async function signUpPlayer(username, password) {
  const email = usernameToEmail(username);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: username.trim() } },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, user: data.user };
}

export async function signInPlayer(username, password) {
  const email = usernameToEmail(username);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: "Wrong username or password." };
  return { ok: true, user: data.user };
}

// The host is just a normal Supabase Auth user with a real email. You
// can still hand-create one ahead of time from the Supabase dashboard
// (Authentication → Users → Add user) if you want, but pages/login.jsx's
// "Host a game instead" link now calls signUpHost() directly, so that's
// no longer the only way in — a new host account is fully self-serve.
//
// hostScope is the deliberate difference between a self-serve account
// and a dashboard-provisioned one: pages/login.jsx's self-serve flow
// always passes "stereo_types" here, which — per sql/add-host-scope.sql
// — restricts that account to only ever hosting Stereo Types games,
// both in pages/host.jsx's own game-type picker (see canHostGameType
// below) AND at the database level via the games table's own insert
// policy, so this can't be bypassed by skipping the UI. A
// dashboard-created account (or any call to signUpHost with no second
// argument) gets hostScope left unset entirely, which both
// canHostGameType and that same RLS policy treat as "no restriction" —
// preserving exactly how every pre-existing host account already
// behaves today.
export async function signUpHost(email, password, hostScope = null) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: hostScope ? { role: "host", hostScope } : { role: "host" } },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, user: data.user };
}

// The direct counterpart to signUpHost, for someone who's already
// signed in (as a player, most commonly) and wants to start hosting
// WITHOUT creating a second, separate account/email — the gap
// pages/login.jsx's "Host a game instead" flow always had, since that
// one only ever creates a brand-new identity. Grants host access to
// the CURRENT account in place.
//
// supabase.auth.updateUser's `data` merges into the existing
// user_metadata rather than replacing it wholesale (see lib/navTour.js's
// own updateUser call, which already relies on that same merge to avoid
// wiping out display_name and everything else already on the account) —
// so this only ever ADDS role/hostScope, never touches anything else.
//
// Deliberately does NOT try to make the new role usable in the SAME
// session — an earlier version of this function called
// supabase.auth.refreshSession() right after, on the assumption that'd
// mint a fresh access token with the new role/hostScope baked in for
// sql/add-host-scope.sql's games-insert RLS policy to see. In practice
// that wasn't reliable (confirmed by a real "new row violates row-level
// security policy for table games" on the very next "Create Season"
// click) — Supabase's refresh-token grant doesn't consistently re-embed
// user_metadata that changed after the session was first issued.
// pages/host.jsx's own caller handles this the only way that's
// actually guaranteed correct: sign out and prompt a real re-login,
// which always mints a brand-new token straight from the current
// database row, no ambiguity possible.
//
// hostScope defaults to "stereo_types", matching the exact scoping
// pages/login.jsx's self-serve signUpHost flow already applies (see
// sql/add-host-scope.sql for why that scoping exists) — this is meant
// for the same "let anyone spin up their own Stereo Types game" case,
// not for handing every player unrestricted access to every game type.
// Pass null explicitly for unrestricted, if a future caller ever needs
// that — not exposed in the UI today, but here for parity with
// signUpHost's own signature.
export async function becomeHost(hostScope = "stereo_types") {
  const { data, error } = await supabase.auth.updateUser({
    data: hostScope ? { role: "host", hostScope } : { role: "host" },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, user: data.user };
}

export async function signInHost(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: "Wrong email or password." };
  return { ok: true, user: data.user };
}

export async function signOut() {
  await supabase.auth.signOut();
}

export function displayNameFromUser(user) {
  return user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Player";
}

export function isHost(user) {
  return user?.user_metadata?.role === "host";
}

// null/absent hostScope = unrestricted (every pre-existing, dashboard-
// created host account) — only an account that actually HAS a hostScope
// set (today, only ever "stereo_types", via the self-serve signup flow)
// is limited to that one game type. Mirrored server-side in
// sql/add-host-scope.sql's games-insert policy, so this client-side
// check is a UX filter (which options even show up), not the actual
// security boundary.
export function canHostGameType(user, gameType) {
  const scope = user?.user_metadata?.hostScope;
  return !scope || scope === gameType;
}

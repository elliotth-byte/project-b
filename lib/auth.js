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

// The host is just a normal Supabase Auth user with a real email —
// create this account once, ahead of time, from the Supabase dashboard
// (Authentication → Users → Add user) or via signUpHost() below.
export async function signUpHost(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role: "host" } },
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

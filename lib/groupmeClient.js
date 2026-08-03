import { supabase } from "./supabaseClient";

// ─── Post to GroupMe ───
// Mirrors the original project's lib/slackClient.js exactly, just pointed
// at a different API route. See pages/api/post-to-groupme.js for why the
// actual bot ID never reaches the browser.
export async function postToGroupMe(gameId, text) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return { ok: false, error: "Not logged in." };

  try {
    const res = await fetch("/api/post-to-groupme", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ gameId, text }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Failed to post to GroupMe." };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

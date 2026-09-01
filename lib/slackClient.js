import { supabase } from "./supabaseClient";

export async function postToSlack(gameId, text) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return { ok: false, error: "Not logged in." };

  try {
    const res = await fetch("/api/post-to-slack", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ gameId, text }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Failed to post to Slack." };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

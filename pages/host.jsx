import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { signInHost, signOut, isHost } from "../lib/auth";
import HostPanels from "../components/HostPanels";
import MusicPlayer from "../components/MusicPlayer";
import HomeLink from "../components/HomeLink";
import { useRoundWatcher } from "../lib/useRoundWatcher";

export default function HostPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined); // undefined = loading, null = logged out
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [games, setGames] = useState(null); // null = not loaded yet, [] = loaded, no seasons
  const [activeGameId, setActiveGameId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [origin, setOrigin] = useState("");

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSubtitle, setNewSubtitle] = useState("");

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSubtitle, setEditSubtitle] = useState("");

  const [copied, setCopied] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [coHosts, setCoHosts] = useState([]);
  const [showCoHosts, setShowCoHosts] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState(null); // null | "sending" | message string

  useRoundWatcher(activeGameId);

  useEffect(() => {
    setOrigin(window.location.origin);
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load every season this host can manage — seasons they created
  // (host_id = them) plus any they've been added to as a co-host (see
  // sql/add-game-hosts.sql). Two queries because Supabase's client can't
  // cleanly express "games.host_id = me OR id IN (subquery on another
  // table)" in one call.
  useEffect(() => {
    if (!user || !isHost(user)) return;
    (async () => {
      const { data: owned } = await supabase
        .from("games")
        .select("*")
        .eq("host_id", user.id)
        .order("created_at", { ascending: false });

      const { data: coHostRows } = await supabase
        .from("game_hosts")
        .select("game_id")
        .eq("user_id", user.id);

      const coHostIds = (coHostRows || []).map((r) => r.game_id);
      let coHosted = [];
      if (coHostIds.length > 0) {
        const { data } = await supabase.from("games").select("*").in("id", coHostIds);
        coHosted = data || [];
      }

      const ownedIds = new Set((owned || []).map((g) => g.id));
      const merged = [...(owned || []), ...coHosted.filter((g) => !ownedIds.has(g.id))];
      merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setGames(merged);
    })();
  }, [user]);

  // Which season is "active" comes from ?game=<id> in the URL so a host
  // switching tabs, refreshing, or bookmarking a specific season lands back
  // on it. Falls back to the most recent season, and auto-creates a first
  // one for a brand-new host with none yet.
  useEffect(() => {
    if (games === null) return;
    (async () => {
      const fromUrl = typeof router.query.game === "string" ? router.query.game : null;
      if (fromUrl && games.some((g) => g.id === fromUrl)) {
        setActiveGameId(fromUrl);
        return;
      }
      // Default selection skips archived seasons — an archived season is
      // only ever reached deliberately, via the "Archived seasons" list.
      const liveGames = games.filter((g) => !g.archived);
      if (liveGames.length > 0) {
        setActiveGameId(liveGames[0].id);
        router.replace(`/host?game=${liveGames[0].id}`, undefined, { shallow: true });
        return;
      }
      if (games.length > 0) return; // only archived seasons exist — don't auto-create another

      // No seasons at all yet — create the first one automatically.
      const created = await createSeason("Project B", "");
      if (created) {
        setActiveGameId(created.id);
        router.replace(`/host?game=${created.id}`, undefined, { shallow: true });
      }
    })();
  }, [games, router.query.game]); // eslint-disable-line react-hooks/exhaustive-deps

  const game = useMemo(() => games?.find((g) => g.id === activeGameId) || null, [games, activeGameId]);
  const visibleGames = useMemo(() => (games || []).filter((g) => !g.archived), [games]);
  const archivedGames = useMemo(() => (games || []).filter((g) => g.archived), [games]);
  const isPrimaryHost = !!(game && user && game.host_id === user.id);

  const loadCoHosts = async (gameId) => {
    const { data } = await supabase.rpc("list_co_hosts", { p_game_id: gameId });
    setCoHosts(data || []);
  };

  useEffect(() => {
    if (game) loadCoHosts(game.id);
    else setCoHosts([]);
  }, [game?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const inviteCoHost = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteStatus("sending");
    const { data, error: err } = await supabase.rpc("invite_co_host", { p_game_id: game.id, p_email: inviteEmail.trim() });
    if (err) { setInviteStatus(err.message); return; }
    const messages = {
      ok: "✅ Added as co-host.",
      not_found: "No account found with that email.",
      not_a_host: "That account exists but isn't a host account.",
      already_host: "That's already the primary host.",
      not_authorized: "Only the primary host can add co-hosts.",
    };
    setInviteStatus(messages[data] || "Something went wrong.");
    if (data === "ok") {
      setInviteEmail("");
      loadCoHosts(game.id);
    }
    window.setTimeout(() => setInviteStatus(null), 4000);
  };

  const removeCoHost = async (userId) => {
    const { error: err } = await supabase.from("game_hosts").delete().eq("game_id", game.id).eq("user_id", userId);
    if (!err) loadCoHosts(game.id);
  };

  const switchTo = (id) => router.push(`/host?game=${id}`, undefined, { shallow: true });

  const archiveSeason = async (id) => {
    const { data: updated, error: err } = await supabase.from("games").update({ archived: true }).eq("id", id).select().single();
    if (err) { setError(err.message); return; }
    setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    if (id === activeGameId) {
      const next = visibleGames.find((g) => g.id !== id);
      if (next) switchTo(next.id);
    }
  };

  const restoreSeason = async (id) => {
    const { data: updated, error: err } = await supabase.from("games").update({ archived: false }).eq("id", id).select().single();
    if (err) { setError(err.message); return; }
    setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    switchTo(id);
  };

  const deleteSeason = async (g) => {
    const confirmed = window.confirm(
      `Permanently delete "${g.name}"? This removes every player, vote, confessional, and challenge result from this season. This can't be undone.`
    );
    if (!confirmed) return;
    const { error: err } = await supabase.from("games").delete().eq("id", g.id);
    if (err) { setError(err.message); return; }
    const remaining = (games || []).filter((x) => x.id !== g.id);
    setGames(remaining);
    if (g.id === activeGameId) {
      const next = remaining.find((x) => !x.archived) || remaining[0];
      if (next) switchTo(next.id);
      else router.replace("/host", undefined, { shallow: true });
    }
  };

  // Backfill a join code for any season created before join codes existed.
  useEffect(() => {
    if (!game || game.join_code) return;
    (async () => {
      const { data: code } = await supabase.rpc("generate_join_code");
      const { data: updated } = await supabase
        .from("games")
        .update({ join_code: code })
        .eq("id", game.id)
        .select()
        .single();
      if (updated) setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    })();
  }, [game]);

  // Load & keep the player roster live, scoped to whichever season is active.
  useEffect(() => {
    if (!game) return;
    const load = async () => {
      const { data } = await supabase
        .from("players")
        .select("*")
        .eq("game_id", game.id);
      setPlayers(data || []);
    };
    load();

    const channel = supabase
      .channel(`players:${game.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `game_id=eq.${game.id}` }, load)
      .subscribe();

    const pollInterval = window.setInterval(load, 6000);
    return () => { window.clearInterval(pollInterval); supabase.removeChannel(channel); };
  }, [game?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitLogin = async (e) => {
    e.preventDefault();
    setError("");
    const res = await signInHost(email, password);
    if (!res.ok) setError(res.error);
  };

  async function createSeason(name, subtitle) {
    const { data: code } = await supabase.rpc("generate_join_code");
    const { data: created, error } = await supabase
      .from("games")
      .insert({ name: name || "Project B", subtitle: subtitle || null, host_id: user.id, join_code: code })
      .select()
      .single();
    if (error) { setError(error.message); return null; }
    setGames((prev) => [created, ...(prev || [])]);
    return created;
  }

  const submitNewSeason = async (e) => {
    e.preventDefault();
    const created = await createSeason(newName.trim(), newSubtitle.trim());
    if (created) {
      setCreating(false);
      setNewName("");
      setNewSubtitle("");
      router.push(`/host?game=${created.id}`, undefined, { shallow: true });
    }
  };

  const startEditing = () => {
    setEditName(game.name || "");
    setEditSubtitle(game.subtitle || "");
    setEditing(true);
  };

  const saveEditing = async (e) => {
    e.preventDefault();
    const { data: updated, error } = await supabase
      .from("games")
      .update({ name: editName.trim() || "Project B", subtitle: editSubtitle.trim() || null })
      .eq("id", game.id)
      .select()
      .single();
    if (error) { setError(error.message); return; }
    setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    setEditing(false);
  };

  const joinUrl = game?.join_code ? `${origin}/join/${game.join_code}` : "";
  const copyLink = () => {
    if (!joinUrl) return;
    navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  };

  if (user === undefined) return <div style={pageStyle}><p>Loading...</p></div>;

  if (!user) {
    return (
      <div style={pageStyle}>
        <form onSubmit={submitLogin} style={{ maxWidth: 320, width: "100%", textAlign: "center" }}>
          <div style={{ marginBottom: 16 }}><HomeLink /></div>
          <h2 style={{ fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", fontSize: 22, marginBottom: 4 }}>Host Access</h2>
          <p style={{ color: "#a09080", fontSize: 13, marginBottom: 16, fontStyle: "italic" }}>
            Log in with the host account created in Supabase.
          </p>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Host email" style={inputStyle} autoFocus />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
          {error && <p style={{ color: "#c45c3c", fontSize: 13 }}>{error}</p>}
          <button type="submit" style={btnStyle}>Enter</button>
        </form>
      </div>
    );
  }

  if (!isHost(user)) {
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: "center" }}>
          <div style={{ marginBottom: 16 }}><HomeLink /></div>
          <p>This account isn't marked as a host. Set <code>role: "host"</code> in this user's metadata in Supabase, or use a dedicated host account.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...pageStyle, alignItems: "flex-start", justifyContent: "center", flexDirection: "column", padding: 24 }}>
      <div style={{ maxWidth: 640, width: "100%", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <HomeLink />
            <h1 style={{ fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", fontSize: 22, margin: 0 }}>Host Console</h1>
          </div>
          <button onClick={signOut} style={{ background: "none", border: "none", color: "#706050", fontSize: 12, cursor: "pointer" }}>Log out</button>
        </div>

        {/* ---------------- Season switcher ---------------- */}
        {games && games.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {visibleGames.map((g) => {
              const active = g.id === activeGameId;
              return (
                <button
                  key={g.id}
                  onClick={() => switchTo(g.id)}
                  style={{
                    background: active ? "linear-gradient(135deg, #c9a84c, #a5822f)" : "#0e1830",
                    color: active ? "#0c1425" : "#f0e6d3",
                    border: active ? "none" : "1px solid #253550",
                    borderRadius: 20, padding: "7px 14px", fontSize: 12.5, fontWeight: 700,
                    cursor: "pointer", textAlign: "left",
                  }}
                  title={g.subtitle || undefined}
                >
                  {g.name}
                  {g.subtitle && (
                    <span style={{ fontWeight: 400, opacity: 0.8 }}> — {g.subtitle}</span>
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setCreating((v) => !v)}
              style={{
                background: "transparent", color: "#c9a84c", border: "1px dashed #c9a84c",
                borderRadius: 20, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              }}
            >
              + New Season
            </button>
          </div>
        )}

        {games && archivedGames.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <button onClick={() => setShowArchived((v) => !v)} style={{ background: "none", border: "none", color: "#706050", fontSize: 12, cursor: "pointer", padding: 0 }}>
              {showArchived ? "▾" : "▸"} Archived seasons ({archivedGames.length})
            </button>
            {showArchived && (
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {archivedGames.map((g) => {
                  const primaryForThis = user && g.host_id === user.id;
                  return (
                    <div key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0e1830", border: "1px solid #253550", borderRadius: 8, padding: "8px 12px" }}>
                      <span style={{ fontSize: 12.5, color: "#a09080" }}>
                        {g.name}{g.subtitle && <span style={{ opacity: 0.7 }}> — {g.subtitle}</span>}
                      </span>
                      {primaryForThis ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => restoreSeason(g.id)} style={{ background: "none", border: "1px solid #253550", borderRadius: 6, color: "#a09080", fontSize: 11, cursor: "pointer", padding: "4px 8px" }}>Restore</button>
                          <button onClick={() => deleteSeason(g)} style={{ background: "none", border: "1px solid #c45c3c55", borderRadius: 6, color: "#c45c3c", fontSize: 11, cursor: "pointer", padding: "4px 8px" }}>Delete forever</button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: "#706050", fontStyle: "italic" }}>only the primary host can restore this</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {creating && (
          <form onSubmit={submitNewSeason} style={{ background: "#0e1830", border: "1px solid #253550", borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div style={{ color: "#a09080", fontSize: 12, marginBottom: 8 }}>Start a new season</div>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Season name (e.g. Office Offsite 2026)" style={inputStyle} autoFocus />
            <input value={newSubtitle} onChange={(e) => setNewSubtitle(e.target.value)} placeholder="Subtitle — optional" style={{ ...inputStyle, marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" style={{ ...btnStyle, flex: 1 }}>Create</button>
              <button type="button" onClick={() => setCreating(false)} style={{ ...btnStyle, flex: 1, background: "transparent", color: "#a09080", border: "1px solid #253550" }}>Cancel</button>
            </div>
          </form>
        )}

        {game && (
          <div style={{ background: "#0e1830", border: "1px solid #253550", borderRadius: 10, padding: 14, marginBottom: 16 }}>
            {/* ---------------- Season name / subtitle ---------------- */}
            {editing ? (
              <form onSubmit={saveEditing} style={{ marginBottom: 12 }}>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Season name" style={inputStyle} autoFocus />
                <input value={editSubtitle} onChange={(e) => setEditSubtitle(e.target.value)} placeholder="Subtitle — optional" style={{ ...inputStyle, marginBottom: 10 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" style={{ ...btnStyle, flex: 1 }}>Save</button>
                  <button type="button" onClick={() => setEditing(false)} style={{ ...btnStyle, flex: 1, background: "transparent", color: "#a09080", border: "1px solid #253550" }}>Cancel</button>
                </div>
              </form>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", fontSize: 17, fontWeight: 700 }}>{game.name}</div>
                  {game.subtitle && <div style={{ color: "#a09080", fontSize: 12.5, fontStyle: "italic", marginTop: 2 }}>{game.subtitle}</div>}
                </div>
                <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                  <button onClick={startEditing} style={{ background: "none", border: "none", color: "#706050", fontSize: 12, cursor: "pointer" }}>✎ Edit</button>
                  {isPrimaryHost && (
                    <>
                      <button onClick={() => archiveSeason(game.id)} style={{ background: "none", border: "none", color: "#706050", fontSize: 12, cursor: "pointer" }}>📦 Archive</button>
                      <button onClick={() => deleteSeason(game)} style={{ background: "none", border: "none", color: "#c45c3c", fontSize: 12, cursor: "pointer" }}>🗑 Delete</button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ---------------- Co-hosts ---------------- */}
            <div style={{ marginBottom: 14 }}>
              <button onClick={() => setShowCoHosts((v) => !v)} style={{ background: "none", border: "none", color: "#706050", fontSize: 12, cursor: "pointer", padding: 0 }}>
                {showCoHosts ? "▾" : "▸"} 👥 Co-hosts ({coHosts.length}){!isPrimaryHost && " — you're a co-host"}
              </button>
              {showCoHosts && (
                <div style={{ marginTop: 8 }}>
                  {coHosts.length === 0 ? (
                    <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic", margin: 0 }}>No co-hosts yet — just you.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 6, marginBottom: isPrimaryHost ? 10 : 0 }}>
                      {coHosts.map((c) => (
                        <div key={c.user_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a1020", border: "1px solid #253550", borderRadius: 8, padding: "6px 10px" }}>
                          <span style={{ fontSize: 12, color: "#a09080" }}>{c.email}</span>
                          {isPrimaryHost && (
                            <button onClick={() => removeCoHost(c.user_id)} style={{ background: "none", border: "1px solid #c45c3c55", borderRadius: 6, color: "#c45c3c", fontSize: 11, cursor: "pointer", padding: "3px 8px" }}>Remove</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {isPrimaryHost && (
                    <form onSubmit={inviteCoHost} style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <input
                        type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="Co-host's host account email"
                        style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                      />
                      <button type="submit" style={{ ...btnStyle, width: "auto", whiteSpace: "nowrap", padding: "10px 16px" }}>Add</button>
                    </form>
                  )}
                  {inviteStatus && inviteStatus !== "sending" && (
                    <p style={{ fontSize: 11.5, color: inviteStatus.startsWith("✅") ? "#7a9a5c" : "#c45c3c", marginTop: 6 }}>{inviteStatus}</p>
                  )}
                  <p style={{ fontSize: 11, color: "#706050", marginTop: 8, fontStyle: "italic" }}>
                    Co-hosts need an existing host account (see README.md) and get full access to run this season — roster, challenges, GroupMe posting. Only the primary host can add/remove co-hosts or archive/delete the season.
                  </p>
                </div>
              )}
            </div>

            {/* ---------------- Shareable link ---------------- */}
            <div style={{ fontSize: 13 }}>
              <div style={{ color: "#a09080", marginBottom: 6 }}>Share this with players so they can join:</div>
              {game.join_code ? (
                <>
                  <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 2, color: "#c9a84c", marginBottom: 8 }}>
                    {game.join_code}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                    <code style={{
                      flex: 1, color: "#f0e6d3", fontSize: 13, wordBreak: "break-all",
                      background: "#0a1020", border: "1px solid #253550", borderRadius: 8,
                      padding: "10px 12px", display: "flex", alignItems: "center",
                    }}>
                      {joinUrl}
                    </code>
                    <button onClick={copyLink} style={{ ...btnStyle, width: "auto", whiteSpace: "nowrap", padding: "10px 16px" }}>
                      {copied ? "Copied ✓" : "Copy link"}
                    </button>
                  </div>
                </>
              ) : (
                <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>
                  Generating a join code... (refresh if this doesn't update in a few seconds)
                </p>
              )}
              <details style={{ marginTop: 10 }}>
                <summary style={{ color: "#706050", fontSize: 11, cursor: "pointer" }}>Advanced: direct link</summary>
                <code style={{ color: "#706050", fontSize: 11, wordBreak: "break-all", display: "block", marginTop: 4 }}>
                  {origin}/play?game={game.id}
                </code>
              </details>
            </div>

            <div style={{ marginTop: 12, color: "#a09080", fontSize: 13 }}>
              Players in game: {players.length === 0 ? "none yet" : players.map((p) =>
                !p.approved ? `${p.display_name} (pending)` : p.alive ? p.display_name : `${p.display_name} (exiled)`
              ).join(", ")}
            </div>
          </div>
        )}

        {error && <p style={{ color: "#c45c3c", fontSize: 13 }}>{error}</p>}

        {/* key={game.id} forces a clean remount of all host panels/polling
            when switching seasons, instead of every tab's internal state
            (and in-flight polls) carrying over from the previous season. */}
        {game && <HostPanels key={game.id} gameId={game.id} players={players} />}
      </div>
      {game && <MusicPlayer key={`music-${game.id}`} gameId={game.id} isHost={true} />}
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh", background: "linear-gradient(180deg, #0c1425, #0f1a30)", color: "#f0e6d3",
  fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", display: "flex",
  alignItems: "center", justifyContent: "center", padding: 24,
};
const inputStyle = {
  display: "block", width: "100%", background: "#0a1020", border: "1px solid #253550",
  borderRadius: 8, padding: "10px 14px", color: "#f0e6d3", fontSize: 14, outline: "none", marginBottom: 10,
  boxSizing: "border-box",
};
const btnStyle = {
  width: "100%", background: "linear-gradient(135deg, #c9a84c, #a5822f)", color: "#0c1425",
  border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer",
};

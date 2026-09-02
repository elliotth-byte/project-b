import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { signInHost, signOut, isHost, canHostGameType, becomeHost } from "../lib/auth";
import HostPanels from "../components/HostPanels";
import TraitorsHostPanels from "../components/TraitorsHostPanels";
import StereoTypesHostPanels from "../components/StereoTypesHostPanels";
import GameAccessPanel from "../components/GameAccessPanel";
import ChatHostPanel from "../components/ChatHostPanel";
import UpdateBanner from "../components/UpdateBanner";
import MusicPlayer from "../components/MusicPlayer";
import TraitorsMusicPlayer from "../components/TraitorsMusicPlayer";
import HomeLink from "../components/HomeLink";
import { useRoundWatcher } from "../lib/useRoundWatcher";
import { initRound } from "../lib/gameState";
import { themeFor } from "../lib/uiTheme";
import { useSiteTheme } from "../lib/siteTheme";

export default function HostPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined); // undefined = loading, null = logged out
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [becomingHost, setBecomingHost] = useState(false);
  const [becomeHostError, setBecomeHostError] = useState("");

  const [games, setGames] = useState(null); // null = not loaded yet, [] = loaded, no seasons
  const [activeGameId, setActiveGameId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [origin, setOrigin] = useState("");

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [radioPortalNode, setRadioPortalNode] = useState(null);
  const [newSubtitle, setNewSubtitle] = useState("");
  const [newGameType, setNewGameType] = useState("project_b");

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSubtitle, setEditSubtitle] = useState("");

  const [showArchived, setShowArchived] = useState(false);

  const [coHosts, setCoHosts] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState(null); // null | "sending" | message string

  // Declared here (rather than down with visibleGames/archivedGames
  // below, where it conceptually belongs) so useRoundWatcher, right
  // below, can gate on game_type — see that hook's own comment on why
  // a traitors season needs enabled: false.
  const game = useMemo(() => games?.find((g) => g.id === activeGameId) || null, [games, activeGameId]);
  useRoundWatcher(activeGameId, { enabled: game?.game_type === "project_b" });
  // Drives every color/font reference below — see lib/uiTheme.js. No
  // active season yet (login, "no active season") just gets Project
  // B's own palette, same as always.
  const theme = themeFor(game?.game_type);
  const pageStyle = { minHeight: "100vh", background: theme.pageBg, color: theme.text, fontFamily: theme.font, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 };
  const inputStyle = { display: "block", width: "100%", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "10px 14px", color: theme.text, fontSize: 14, outline: "none", marginBottom: 10, boxSizing: "border-box" };
  const btnStyle = { width: "100%", background: theme.accentGradient, color: theme.accentText, border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" };
  // Cruel Summer House's own brand, not a game's — used only for the
  // three screens below the "no session yet" point, where there's no
  // game_type to theme by at all (see lib/siteTheme.js).
  const { theme: siteTheme } = useSiteTheme();
  const sitePageStyle = { minHeight: "100vh", background: siteTheme.pageBg, color: siteTheme.text, fontFamily: siteTheme.font, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 };
  const siteInputStyle = { display: "block", width: "100%", background: siteTheme.inputBg, border: `1px solid ${siteTheme.border}`, borderRadius: 8, padding: "10px 14px", color: siteTheme.text, fontSize: 14, outline: "none", marginBottom: 10, boxSizing: "border-box" };
  const siteBtnStyle = { width: "100%", background: siteTheme.accentGradient, color: siteTheme.accentText, border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" };

  useEffect(() => {
    setOrigin(window.location.origin);
    // getSession() reads from local storage directly rather than making a
    // network round trip like getUser() does — avoids a race right after
    // a fresh signInHost()/signUpHost() where the session can be
    // persisted a beat before/after getUser()'s response lands. See the
    // same fix in pages/play.jsx for the fuller explanation.
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
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
  //
  // autoCreateAttempted guards that last part specifically: without it,
  // deleting your only season empties `games`, which re-runs this effect,
  // which — since "no seasons at all" looked identical whether that's
  // because you're brand new or because you just deliberately deleted
  // your last one — would immediately create a fresh replacement. That
  // made a delete look like it "duplicated" the season right back. This
  // only allows the auto-create to happen once per page load, so a
  // deliberate delete actually leaves you with zero seasons until you
  // choose to make a new one.
  const autoCreateAttempted = useRef(false);

  useEffect(() => {
    if (games === null) return;
    (async () => {
      const fromUrl = typeof router.query.game === "string" ? router.query.game : null;
      // The `&& !g.archived` here matters more than it looks: archiving a
      // season doesn't remove it from `games`, just flags it, and
      // `router.query.game` can still be pointing at the just-archived
      // season's id for a moment after archiving (router.push updates the
      // URL asynchronously, while `games` updates immediately) — without
      // this check, this effect could re-select the archived season the
      // instant it re-runs, right out from under the redirect that was
      // supposed to move you off it. That's what made archiving look like
      // it didn't stick / "un-archived itself."
      if (fromUrl && games.some((g) => g.id === fromUrl && !g.archived)) {
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
      if (autoCreateAttempted.current) return; // see the comment above — don't recreate after a deliberate delete
      autoCreateAttempted.current = true;

      // No seasons at all yet — create the first one automatically.
      // Always Project B — a host who wants a Traitors season instead
      // just uses "+ New Season" and picks it there.
      const created = await createSeason("Panopticon", "", "project_b");
      if (created) {
        setActiveGameId(created.id);
        router.replace(`/host?game=${created.id}`, undefined, { shallow: true });
      }
    })();
  }, [games, router.query.game]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (next) {
        switchTo(next.id);
      } else {
        // No other live season — clear activeGameId explicitly, not just
        // the URL. router.replace alone leaves activeGameId (React state)
        // still pointing at the season we just archived, and `game` is
        // derived from THAT state, not the URL — so the UI would keep
        // showing the archived season as if it were still active even
        // after the address bar looked clean.
        setActiveGameId(null);
        router.replace("/host", undefined, { shallow: true });
      }
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
      `Permanently delete "${g.name}"? This removes every player, vote, confessional, and battle result from this season. This can't be undone.`
    );
    if (!confirmed) return;
    const { error: err } = await supabase.from("games").delete().eq("id", g.id);
    if (err) { setError(err.message); return; }
    const remaining = (games || []).filter((x) => x.id !== g.id);
    setGames(remaining);
    if (g.id === activeGameId) {
      // Only ever fall back to another LIVE season here — never an
      // archived one (that was the other half of archived seasons
      // seeming to "come back": this used to fall back to remaining[0]
      // unconditionally, which could itself be archived).
      const next = remaining.find((x) => !x.archived);
      if (next) {
        switchTo(next.id);
      } else {
        setActiveGameId(null); // see the comment in archiveSeason above — same reasoning
        router.replace("/host", undefined, { shallow: true });
      }
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

    // Same egress fix as lib/gameStorage.js's identical pattern — this
    // realtime subscription is the primary update mechanism; the poll
    // below only guards against a missed/dropped realtime event, which
    // doesn't need sub-10-second detection. This one fetches every
    // column for every player in the season, so it was one of the
    // larger individual payloads being repeated this often.
    const pollInterval = window.setInterval(load, 45000);
    return () => { window.clearInterval(pollInterval); supabase.removeChannel(channel); };
  }, [game?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitLogin = async (e) => {
    e.preventDefault();
    setError("");
    const res = await signInHost(email, password);
    if (!res.ok) setError(res.error);
  };

  const submitBecomeHost = async () => {
    if (!confirm("This adds hosting to your current account — you'll be able to create and run Stereo Types seasons with the same login you already use to play. Continue?")) return;
    setBecomingHost(true);
    setBecomeHostError("");
    const res = await becomeHost("stereo_types");
    setBecomingHost(false);
    if (!res.ok) { setBecomeHostError(res.error); return; }
    // becomeHost's own updateUser call already refreshed the session's
    // JWT with the new role/hostScope baked in (see that function's own
    // comment on why that matters for the games-insert RLS policy) — no
    // reload needed; the onAuthStateChange subscription above already
    // picked up the USER_UPDATED event and updated `user`, so this
    // component just re-renders straight into the real host console
    // below on its own.
  };

  async function createSeason(name, subtitle, gameType) {
    const type = gameType || "project_b";
    const { data: code } = await supabase.rpc("generate_join_code");
    const { data: created, error } = await supabase
      .from("games")
      .insert({ name: name || (type === "traitors" ? "The Traitors" : type === "stereo_types" ? "Stereo Types" : "Panopticon"), subtitle: subtitle || null, host_id: user.id, join_code: code, game_type: type })
      .select()
      .single();
    if (error) { setError(error.message); return null; }
    // Put the game straight into the Lobby phase — without this, `round`
    // stays null until the host later clicks "Start Round 1", and players
    // can't reach any tab (including Confessionals) until then. Only
    // meaningful for Project B's round engine (lib/gameState.js/
    // roundEngine.js) — Traitors seasons have no equivalent bootstrap
    // step; TraitorRolesHost/RoundtableHost etc. all handle "no state
    // yet" as their own natural starting point.
    if (type === "project_b") await initRound(created.id);
    setGames((prev) => [created, ...(prev || [])]);
    return created;
  }

  const submitNewSeason = async (e) => {
    e.preventDefault();
    const created = await createSeason(newName.trim(), newSubtitle.trim(), newGameType);
    if (created) {
      setCreating(false);
      setNewName("");
      setNewSubtitle("");
      setNewGameType("project_b");
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
      .update({ name: editName.trim() || "Panopticon", subtitle: editSubtitle.trim() || null })
      .eq("id", game.id)
      .select()
      .single();
    if (error) { setError(error.message); return; }
    setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    setEditing(false);
  };

  if (user === undefined) return <div style={sitePageStyle}><p>Loading...</p></div>;

  if (!user) {
    return (
      <div style={sitePageStyle}>
        <form onSubmit={submitLogin} style={{ maxWidth: 320, width: "100%", textAlign: "center" }}>
          <div style={{ marginBottom: 16 }}><HomeLink theme={siteTheme} /></div>
          <h2 style={{ fontFamily: siteTheme.font, fontSize: 22, marginBottom: 4 }}>Host Access</h2>
          <p style={{ color: siteTheme.textMuted, fontSize: 13, marginBottom: 16, fontStyle: "italic" }}>
            Log in with the host account created in Supabase.
          </p>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Host email" style={siteInputStyle} autoFocus />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={siteInputStyle} />
          {error && <p style={{ color: siteTheme.danger, fontSize: 13 }}>{error}</p>}
          <button type="submit" style={siteBtnStyle}>Enter</button>
        </form>
      </div>
    );
  }

  if (!isHost(user)) {
    return (
      <div style={sitePageStyle}>
        <div style={{ textAlign: "center", maxWidth: 340 }}>
          <div style={{ marginBottom: 16 }}><HomeLink theme={siteTheme} /></div>
          <p style={{ marginBottom: 14 }}>You're signed in, but this account isn't set up to host yet.</p>
          <button onClick={submitBecomeHost} disabled={becomingHost} style={siteBtnStyle}>
            {becomingHost ? "..." : "👑 Become a host"}
          </button>
          <p style={{ color: siteTheme.textMuted, fontSize: 11, marginTop: 8, fontStyle: "italic" }}>
            Uses this same account — you'll still play with it exactly as before, just with the option to run your own Stereo Types seasons too.
          </p>
          {becomeHostError && <p style={{ color: siteTheme.danger, fontSize: 13, marginTop: 8 }}>{becomeHostError}</p>}
          <p style={{ color: siteTheme.textDim, fontSize: 12, marginTop: 20 }}>
            Prefer a separate host account instead? Log out and use "Host a game instead" on the <a href="/login">login page</a>, or have a platform admin set <code>role: "host"</code> in this account's metadata in Supabase.
          </p>
          <button onClick={signOut} style={{ background: "none", border: "none", color: siteTheme.textDim, fontSize: 12, cursor: "pointer", marginTop: 12 }}>Log out and try a different account</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...pageStyle, alignItems: "flex-start", justifyContent: "center", flexDirection: "column", padding: 24 }}>
      <div style={{ maxWidth: 640, width: "100%", margin: "0 auto" }}>
        <UpdateBanner />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <HomeLink theme={theme} />
            <h1 style={{ fontFamily: theme.font, fontSize: 22, margin: 0 }}>Host Console</h1>
          </div>
          <button onClick={signOut} style={{ background: "none", border: "none", color: theme.textDim, fontSize: 12, cursor: "pointer" }}>Log out</button>
        </div>

        {/* ---------------- Season switcher ---------------- */}
        {/* Always shown once `games` has loaded (even as an empty array —
            e.g. right after deleting your only season) so "+ New Season"
            is never stranded behind a season that no longer exists.
            Each button keeps its OWN season's colors regardless of
            which one is currently active/selected — a Traitors season
            in the list still looks gold even while a Project B one is
            the active tab — since this is the one place a host might
            be looking at both types side by side. */}
        {games && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {visibleGames.map((g) => {
              const active = g.id === activeGameId;
              const gTheme = themeFor(g.game_type);
              return (
                <button
                  key={g.id}
                  onClick={() => switchTo(g.id)}
                  style={{
                    background: active ? gTheme.accentGradient : theme.cardBg,
                    color: active ? gTheme.accentText : theme.text,
                    border: active ? "none" : `1px solid ${theme.border}`,
                    borderRadius: 20, padding: "7px 14px", fontSize: 12.5, fontWeight: 700,
                    cursor: "pointer", textAlign: "left",
                  }}
                  title={g.subtitle || undefined}
                >
                  {g.game_type === "traitors" ? "🏰" : g.game_type === "stereo_types" ? "📻" : "🃏"} {g.name}
                  {g.subtitle && (
                    <span style={{ fontWeight: 400, opacity: 0.8 }}> — {g.subtitle}</span>
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setCreating((v) => !v)}
              style={{
                background: "transparent", color: theme.accent, border: `1px dashed ${theme.accent}`,
                borderRadius: 20, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              }}
            >
              + New Season
            </button>
          </div>
        )}

        {games && archivedGames.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <button onClick={() => setShowArchived((v) => !v)} style={{ background: "none", border: "none", color: theme.textDim, fontSize: 12, cursor: "pointer", padding: 0 }}>
              {showArchived ? "▾" : "▸"} Archived seasons ({archivedGames.length})
            </button>
            {showArchived && (
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {archivedGames.map((g) => {
                  const primaryForThis = user && g.host_id === user.id;
                  return (
                    <div key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "8px 12px" }}>
                      <span style={{ fontSize: 12.5, color: theme.textMuted }}>
                        {g.name}{g.subtitle && <span style={{ opacity: 0.7 }}> — {g.subtitle}</span>}
                      </span>
                      {primaryForThis ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => restoreSeason(g.id)} style={{ background: "none", border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.textMuted, fontSize: 11, cursor: "pointer", padding: "4px 8px" }}>Restore</button>
                          <button onClick={() => deleteSeason(g)} style={{ background: "none", border: `1px solid ${theme.danger}55`, borderRadius: 6, color: theme.danger, fontSize: 11, cursor: "pointer", padding: "4px 8px" }}>Delete forever</button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: theme.textDim, fontStyle: "italic" }}>only the primary host can restore this</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {games && !game && !creating && (
          <p style={{ color: theme.textDim, fontSize: 13, fontStyle: "italic", margin: "8px 0 16px" }}>
            No active season — click "+ New Season" above to start one.
          </p>
        )}

        {creating && (
          <form onSubmit={submitNewSeason} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>Start a new season</div>

            {/* Locked in at creation — see createSeason's own comment on
                why this can't change after the fact (Project B's and
                Traitors' round engines are completely separate, so a
                season needs to pick one bootstrap path up front). Each
                option previews in its OWN color when selected, not
                whichever type this form itself is currently styled as. */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {[
                { value: "project_b", label: "🃏 Panopticon", desc: "Challenge → Fates → Exile" },
                { value: "traitors", label: "🏰 Traitors", desc: "Roundtable & Murder Vote" },
                { value: "stereo_types", label: "📻 Stereo Types", desc: "A Side → The Remix → On Blast" },
              ]
                // A self-serve, Stereo-Types-scoped host account (see
                // lib/auth.js's canHostGameType) never even sees the
                // other two options — not just disabled, not offered at
                // all. The real enforcement is server-side
                // (sql/add-host-scope.sql's games-insert policy); this
                // is purely so the UI doesn't dangle an option that
                // would just fail on submit.
                .filter((opt) => canHostGameType(user, opt.value))
                .map((opt) => {
                const optTheme = themeFor(opt.value);
                const selected = newGameType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNewGameType(opt.value)}
                    style={{
                      flex: 1, textAlign: "left", cursor: "pointer", borderRadius: 8, padding: "8px 10px",
                      background: selected ? `${optTheme.accent}22` : "transparent",
                      border: `1px solid ${selected ? optTheme.accent : theme.border}`,
                    }}
                  >
                    <div style={{ color: selected ? optTheme.accent : theme.text, fontSize: 13, fontWeight: 700 }}>{opt.label}</div>
                    <div style={{ color: theme.textDim, fontSize: 10.5, marginTop: 2 }}>{opt.desc}</div>
                  </button>
                );
              })}
            </div>

            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Season name (e.g. Office Offsite 2026)" style={inputStyle} autoFocus />
            <input value={newSubtitle} onChange={(e) => setNewSubtitle(e.target.value)} placeholder="Subtitle — optional" style={{ ...inputStyle, marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" style={{ ...btnStyle, flex: 1 }}>Create</button>
              <button type="button" onClick={() => setCreating(false)} style={{ ...btnStyle, flex: 1, background: "transparent", color: theme.textMuted, border: `1px solid ${theme.border}` }}>Cancel</button>
            </div>
          </form>
        )}

        {game && (
          <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
            {/* ---------------- Season name / subtitle ---------------- */}
            {editing ? (
              <form onSubmit={saveEditing} style={{ marginBottom: 12 }}>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Season name" style={inputStyle} autoFocus />
                <input value={editSubtitle} onChange={(e) => setEditSubtitle(e.target.value)} placeholder="Subtitle — optional" style={{ ...inputStyle, marginBottom: 10 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" style={{ ...btnStyle, flex: 1 }}>Save</button>
                  <button type="button" onClick={() => setEditing(false)} style={{ ...btnStyle, flex: 1, background: "transparent", color: theme.textMuted, border: `1px solid ${theme.border}` }}>Cancel</button>
                </div>
              </form>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: theme.font, fontSize: 17, fontWeight: 700 }}>{game.name}</div>
                  {game.subtitle && <div style={{ color: theme.textMuted, fontSize: 12.5, fontStyle: "italic", marginTop: 2 }}>{game.subtitle}</div>}
                </div>
                <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                  <button onClick={startEditing} style={{ background: "none", border: "none", color: theme.textDim, fontSize: 12, cursor: "pointer" }}>✎ Edit</button>
                  {isPrimaryHost && (
                    <>
                      <button onClick={() => archiveSeason(game.id)} style={{ background: "none", border: "none", color: theme.textDim, fontSize: 12, cursor: "pointer" }}>📦 Archive</button>
                      <button onClick={() => deleteSeason(game)} style={{ background: "none", border: "none", color: theme.danger, fontSize: 12, cursor: "pointer" }}>🗑 Delete</button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Co-hosts, the shareable join link, and the roster summary
                have moved to the Admin tab (see GameAccessPanel) — none
                of that is useful to have staring at you once the season's
                actually underway. */}
          </div>
        )}

        {error && <p style={{ color: theme.danger, fontSize: 13 }}>{error}</p>}

        {/* key={game.id} forces a clean remount of all host panels/polling
            when switching seasons, instead of every tab's internal state
            (and in-flight polls) carrying over from the previous season.
            Which panel/music-player mounts is decided once, by
            game.game_type, and never changes for a season's lifetime
            (see createSeason's own comment). */}
        {game && game.game_type === "traitors" && (
          <TraitorsHostPanels
            key={game.id}
            gameId={game.id}
            players={players}
            adminExtra={
              <GameAccessPanel
                game={game}
                players={players}
                isPrimaryHost={isPrimaryHost}
                origin={origin}
                userId={user?.id}
                coHosts={coHosts}
                inviteEmail={inviteEmail}
                setInviteEmail={setInviteEmail}
                inviteStatus={inviteStatus}
                inviteCoHost={inviteCoHost}
                removeCoHost={removeCoHost}
              />
            }
          />
        )}
        {game && game.game_type === "project_b" && (
          <HostPanels
            key={game.id}
            gameId={game.id}
            players={players}
            gameName={game.name}
            adminExtra={
              <>
                <GameAccessPanel
                  game={game}
                  players={players}
                  isPrimaryHost={isPrimaryHost}
                  origin={origin}
                  userId={user?.id}
                  coHosts={coHosts}
                  inviteEmail={inviteEmail}
                  setInviteEmail={setInviteEmail}
                  inviteStatus={inviteStatus}
                  inviteCoHost={inviteCoHost}
                  removeCoHost={removeCoHost}
                />
                {/* The music player's actual controls (see MusicPlayer.jsx)
                    get portaled into this div — MusicPlayer itself stays
                    mounted below, outside HostPanels, so the audio engine
                    keeps running even when this tab isn't the active one.
                    Traitors' own TraitorsMusicPlayer doesn't use a portal
                    at all (see below), so this slot only exists here. */}
                <div ref={setRadioPortalNode} />
              </>
            }
          />
        )}
        {game && game.game_type === "stereo_types" && (
          <>
            <StereoTypesHostPanels
              key={game.id}
              gameId={game.id}
              roomCode={game.join_code}
              players={players}
              adminExtra={
                <GameAccessPanel
                  game={game}
                  players={players}
                  isPrimaryHost={isPrimaryHost}
                  origin={origin}
                  userId={user?.id}
                  coHosts={coHosts}
                  inviteEmail={inviteEmail}
                  setInviteEmail={setInviteEmail}
                  inviteStatus={inviteStatus}
                  inviteCoHost={inviteCoHost}
                  removeCoHost={removeCoHost}
                />
              }
            />
            {/* StereoTypesHostPanels has no tab bar (and no chat surface)
                of its own, unlike HostPanels/TraitorsHostPanels which
                already tuck ChatHostPanel behind their own "chat" tab —
                mounted here instead, same component, same reused group
                chat + DM-thread infrastructure. Always-visible rather
                than gated on settings.chatEnabled: Stereo Types has no
                admin toggle for that setting anywhere (see the matching
                comment on the player-side mount in pages/play.jsx), so
                gating on it would just mean chat never appears. */}
            <ChatHostPanel key={`chat-${game.id}`} gameId={game.id} players={players.filter((p) => p.approved)} groupChatLabel="💬 Chat" />
          </>
        )}
      </div>
      {game && game.game_type === "traitors" && <TraitorsMusicPlayer key={`music-${game.id}`} gameId={game.id} isHost={true} />}
      {game && game.game_type === "project_b" && <MusicPlayer key={`music-${game.id}`} gameId={game.id} isHost={true} portalTarget={radioPortalNode} />}
      {/* No Stereo Types music player yet — its Spotify embed lands in
          Phase 4 (see this repo's own session notes on the build order);
          the built-in Tone.js engine above is specifically Project B's
          own radio, not something Stereo Types reuses. */}
      <p style={{ fontSize: 10, color: theme.border, textAlign: "center", margin: "16px 0 0" }}>
        Version {process.env.NEXT_PUBLIC_APP_VERSION || "dev"}
      </p>
    </div>
  );
}


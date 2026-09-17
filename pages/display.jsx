import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { signInHostFlexible, isHost } from "../lib/auth";
import { subscribeRound, subscribeSettings, KEY_EXILE_HISTORY, KEY_CHALLENGE } from "../lib/gameState";
import { subscribeGameState } from "../lib/gameStorage";
import ExileRevealTV from "../components/bigscreen/ExileRevealTV";
import WordScrambleTvDisplay from "../components/bigscreen/WordScrambleTvDisplay";
import SimonTvDisplay from "../components/bigscreen/SimonTvDisplay";
import MusicalChairsTvDisplay from "../components/bigscreen/MusicalChairsTvDisplay";
import EyesInTheSystemTvDisplay from "../components/bigscreen/EyesInTheSystemTvDisplay";
import ArtAuctionTvDisplay from "../components/bigscreen/ArtAuctionTvDisplay";

// ============================================================
// Battle TV components — each one keyed by gameType, rendered only
// while that specific challenge is the one actually active right now.
// See this file's own header above for the pattern each new entry
// follows (a new file under components/bigscreen/, reading shared
// game-state, TV-sized layout) and lib/bigScreenOnlyGames.js for how a
// battle built AS a Big Screen variant (rather than a TV-only
// alternate view of an existing one) gets excluded from a normal,
// non-Big-Screen season's own random selection and host picker.
// ============================================================
const BATTLE_TV_COMPONENTS = {
  wordscrambletv: WordScrambleTvDisplay,
  simontv: SimonTvDisplay,
  musicalchairstv: MusicalChairsTvDisplay,
  eyesinthesystemtv: EyesInTheSystemTvDisplay,
  // Not a Big-Screen-exclusive game type like the three above — see
  // components/bigscreen/ArtAuctionTvDisplay.jsx's own header comment.
  // The regular artauction game type already works fully normally
  // without Big Screen Mode; this just gives it a real TV view when
  // one's available, on top of what it already does.
  artauction: ArtAuctionTvDisplay,
};

// ============================================================
// ─── Big Screen Mode: the TV-facing display page ───
//
// This is genuinely new infrastructure, not a variant of an existing
// page — see components/AdminHost.jsx's own bigScreenMode toggle and
// lib/gameState.js's own settings entry for the season-level switch
// this pairs with. The physical setup this is built for is a
// completely different one from the normal game: everyone's together
// in one room, Jackbox-style, phones become controllers, and a shared
// TV or monitor (this page, cast or opened directly on that screen)
// shows ceremonies and battle visuals instead of each player's own
// phone showing them independently.
//
// Host-authenticated, not code-based public access — the display is
// read-only (nothing here ever writes gameplay data, only shared
// PRESENTATION state like the reveal step below), but it still shows
// real game information (votes, results, roster), so it goes through
// the same login every other host-facing page already requires rather
// than inventing a new, weaker access path. The realistic setup this
// assumes: a host has two devices — their own phone or laptop running
// the normal Host Console to actually operate the season, and this
// page open on whatever's connected to the shared screen.
//
// ─── The registry pattern this is meant to grow into ───
// For this first stage, exactly one ceremony has a real TV variant:
// the Exile Vote reveal (see components/bigscreen/ExileRevealTV.jsx),
// wired in below as a direct, explicit check — not yet an actual
// lookup table, because building a real registry for a single entry
// would just be structure with nothing to organize yet. The pattern a
// second and third entry should follow: a new file under
// components/bigscreen/ (TV-sized fonts/layout, reads shared
// game-state the way ExileRevealTV does, never per-player local state
// the way a phone-facing equivalent would), and a new condition added
// to the big switch below deciding which one to actually render for
// the current phase/game type. Once there are a handful of these, that
// switch is the natural point to actually extract into a real
// phase/gameType -> component lookup table — premature before that.
//
// Battles ("will often have a TV component, even if they're based off
// a currently existing variant") are the next real piece of this
// infrastructure and deliberately NOT attempted here — a TV variant of
// a battle needs to show live, moment-to-moment gameplay state (not
// just a host-paced reveal sequence the way ceremonies are), which is
// a materially different problem from this stage's reveal-sequence
// pattern and deserves its own dedicated pass per game type rather
// than a rushed, generic first attempt bolted onto this file.
// ============================================================

export default function DisplayPage() {
  const router = useRouter();
  const { game: gameId } = router.query;

  const [user, setUser] = useState(undefined); // undefined = loading, null = logged out
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [gameName, setGameName] = useState("");
  const [round, setRound] = useState(null);
  const [settings, setSettings] = useState(null);
  const [players, setPlayers] = useState([]);
  const [exileHistory, setExileHistory] = useState([]);
  const [challenge, setChallenge] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => sub?.subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!gameId) return;
    supabase.from("games").select("name").eq("id", gameId).maybeSingle().then(({ data }) => setGameName(data?.name || ""));
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    return subscribeRound(gameId, setRound);
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    return subscribeSettings(gameId, setSettings);
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    return subscribeGameState(gameId, KEY_EXILE_HISTORY, (v) => setExileHistory(v || []));
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    return subscribeGameState(gameId, KEY_CHALLENGE, setChallenge);
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    const load = async () => {
      const { data } = await supabase.from("players").select("*").eq("game_id", gameId);
      setPlayers(data || []);
    };
    load();
    const channel = supabase
      .channel(`display-players:${gameId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `game_id=eq.${gameId}` }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [gameId]);

  const login = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    const res = await signInHostFlexible(identifier, password);
    setLoggingIn(false);
    if (!res.ok) { setLoginError(res.error); return; }
    if (!isHost(res.user)) { setLoginError("This account isn't a host account."); await supabase.auth.signOut(); return; }
    setUser(res.user);
  };

  const pageStyle = {
    minHeight: "100vh", background: "linear-gradient(180deg, #05010f, #1a0a2e)", color: "#f5f0ff",
    fontFamily: "'Orbitron', 'Segoe UI', sans-serif", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", padding: 24,
  };

  if (user === undefined) return <div style={pageStyle} />;

  if (!user) {
    return (
      <div style={pageStyle}>
        <form onSubmit={login} style={{ maxWidth: 320, width: "100%" }}>
          <h1 style={{ fontSize: 20, textAlign: "center", marginBottom: 4 }}>📺 Big Screen</h1>
          <p style={{ color: "#6b4f99", fontSize: 12, textAlign: "center", marginBottom: 20 }}>Sign in as the host to open the display.</p>
          <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Email or username" style={inputStyle} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
          {loginError && <p style={{ color: "#ff3860", fontSize: 12, margin: "8px 0" }}>{loginError}</p>}
          <button type="submit" disabled={loggingIn} style={{ ...btnStyle, width: "100%", marginTop: 8 }}>{loggingIn ? "Signing in..." : "Sign In"}</button>
        </form>
      </div>
    );
  }

  if (!gameId) {
    return <div style={pageStyle}><p style={{ color: "#a68fd6" }}>Missing ?game= in the URL — open this from the Host Console's own 📺 Big Screen button.</p></div>;
  }

  // The one real TV variant this stage ships — see this file's own
  // header comment for the pattern to follow when adding the next one.
  const latestExileEntry = exileHistory.length > 0 ? exileHistory.reduce((a, b) => (b.round > a.round ? b : a)) : null;
  const exileRevealActive = latestExileEntry && round && latestExileEntry.round === round.round;
  const BattleComponent = challenge?.active ? BATTLE_TV_COMPONENTS[challenge.gameType] : null;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #05010f, #1a0a2e)", color: "#f5f0ff", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
      <div style={{ padding: "16px 32px", borderBottom: "1px solid #3d1f5c", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{gameName || "Panopticon"}</div>
        {settings && !settings.bigScreenMode && (
          <div style={{ fontSize: 12, color: "#c9a84c" }}>⚠️ Big Screen Mode is off in Admin — players' own phones are still showing this too.</div>
        )}
      </div>

      {BattleComponent ? (
        <BattleComponent gameId={gameId} round={round} players={players} settings={settings} />
      ) : exileRevealActive ? (
        <ExileRevealTV gameId={gameId} players={players} entry={latestExileEntry} />
      ) : (
        <div style={{ minHeight: "70vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 12 }}>
            Round {round?.round ?? "—"} {round?.phase ? `— ${round.phase}` : ""}
          </div>
          <p style={{ color: "#a68fd6", fontSize: 20, maxWidth: 500 }}>
            Nothing to show on the big screen for this moment yet — check phones for now. This page grows a TV variant for a phase or
            battle as each one gets built (see this page's own file header for the plan).
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 32, maxWidth: 900 }}>
            {players.filter((p) => p.approved).map((p) => (
              <div key={p.id} style={{
                background: "#0d0618", border: `1px solid ${p.alive === false ? "#3d1f5c" : "#ff2d95"}`, borderRadius: 10,
                padding: "10px 18px", fontSize: 16, color: p.alive === false ? "#6b4f99" : "#f5f0ff",
                textDecoration: p.alive === false ? "line-through" : "none",
              }}>
                {p.display_name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = { display: "block", width: "100%", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 14px", color: "#f5f0ff", fontSize: 14, outline: "none", marginBottom: 10, boxSizing: "border-box" };
const btnStyle = { background: "linear-gradient(135deg, #ff2d95, #b829ff)", border: "none", borderRadius: 8, color: "#05010f", fontSize: 14, fontWeight: 700, padding: "10px 20px", cursor: "pointer" };

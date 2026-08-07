import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { signOut, displayNameFromUser } from "../lib/auth";
import { removePendingPlayer, quitOrRemoveApprovedPlayer } from "../lib/playerRemoval";
import ColorPicker from "../components/ColorPicker";
import ChallengePlayer from "../components/ChallengePlayer";
import FatesPlayer from "../components/FatesPlayer";
import ExileVotePlayer from "../components/ExileVotePlayer";
import FinalePlayer from "../components/FinalePlayer";
import CeremonyPlayer from "../components/CeremonyPlayer";
import ChaosPowerPlayer from "../components/ChaosPowerPlayer";
import ConfessionalPlayer from "../components/ConfessionalPlayer";
import MusicPlayer from "../components/MusicPlayer";
import HelpPanel from "../components/HelpPanel";
import HomeLink from "../components/HomeLink";
import LogoutButton from "../components/LogoutButton";
import ChallengeErrorBoundary from "../components/ChallengeErrorBoundary";
import RoundTimerBanner from "../components/RoundTimerBanner";
import { Card } from "../components/ui";
import { subscribeRound, PHASES } from "../lib/gameState";
import { useRoundWatcher } from "../lib/useRoundWatcher";

const TABS = [
  { key: "game", label: "🎲 Game" },
  { key: "ceremony", label: "⚖️ Ceremony" },
  { key: "confessional", label: "🎥 Confessional" },
  { key: "help", label: "❓ Help" },
];

export default function PlayPage() {
  const router = useRouter();
  const { game: gameId } = router.query;
  const [user, setUser] = useState(undefined);
  const [joined, setJoined] = useState(false);
  const [myPlayer, setMyPlayer] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [joinError, setJoinError] = useState("");
  const [round, setRound] = useState(null);
  const [tab, setTab] = useState("game");
  const [gameInfo, setGameInfo] = useState(null);
  const [quitBusy, setQuitBusy] = useState(false);

  useRoundWatcher(gameId);

  // Once the game ends there's nothing left to do on the Game tab — default
  // players over to Ceremony so they land on the recap instead of an empty tab.
  useEffect(() => {
    if (round?.phase === PHASES.ENDED) setTab((t) => (t === "game" ? "ceremony" : t));
  }, [round?.phase]);

  useEffect(() => {
    if (!gameId) return;
    (async () => {
      const { data } = await supabase.from("games").select("name, subtitle").eq("id", gameId).maybeSingle();
      setGameInfo(data || null);
    })();
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = subscribeRound(gameId, setRound);
    return unsubscribe;
  }, [gameId]);

  // Full roster (needed by FatesPlayer to list nomination targets, and
  // by FinalePlayer to know who's a finalist).
  useEffect(() => {
    if (!gameId) return;
    const load = async () => {
      const { data } = await supabase.from("players").select("*").eq("game_id", gameId);
      setAllPlayers(data || []);
    };
    load();
    const channel = supabase
      .channel(`players-play:${gameId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `game_id=eq.${gameId}` }, load)
      .subscribe();
    const pollInterval = window.setInterval(load, 6000);
    return () => { window.clearInterval(pollInterval); supabase.removeChannel(channel); };
  }, [gameId]);

  useEffect(() => {
    // getSession() reads the session that's already sitting in local
    // storage — no network round trip. getUser() (what this used to call)
    // instead re-validates against the Auth server over the network,
    // which introduced a real race: a brand-new signup's session can be
    // persisted to storage a beat before getUser()'s network response
    // comes back, and vice versa depending on timing, occasionally
    // leaving this page briefly treating a genuinely-logged-in new
    // player as logged out (or racing ahead of a fully-attached
    // session when the join-insert below fires). getSession() doesn't
    // have that gap.
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user === null) {
      router.replace(gameId ? `/login?game=${gameId}` : "/login");
    }
  }, [user, gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Join the game named in the URL, if not already a player in it
  useEffect(() => {
    if (!user || !gameId) return;
    (async () => {
      const { data: existing } = await supabase
        .from("players")
        .select("id, display_name, alive, elimination_type, approved, color")
        .eq("game_id", gameId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        setMyPlayer({ id: existing.id, name: existing.display_name, alive: existing.alive, eliminationType: existing.elimination_type, approved: existing.approved, color: existing.color });
        setJoined(true);
        return;
      }

      // Wait for a real, current session — widened to ~6s of retries
      // (up from ~1.5s) since a short window turned out to not be
      // enough for at least one signup. Also: use session.user.id, not
      // the `user.id` closed over from React state, for the actual
      // insert — if that state is ever a beat stale relative to
      // whatever the client's current session really is, this guarantees
      // the id we send matches exactly what auth.uid() will resolve to
      // server-side, since it comes from the same freshly-fetched session.
      let session = null;
      for (let attempt = 0; attempt < 15 && !session; attempt++) {
        const { data } = await supabase.auth.getSession();
        session = data.session;
        if (!session) await new Promise((r) => setTimeout(r, 400));
      }
      if (!session) {
        setJoinError(`Couldn't join this game: no session after waiting (user.id=${user.id}). Try refreshing the page.`);
        return;
      }
      if (session.user.id !== user.id) {
        setJoinError(`Couldn't join this game: session/user mismatch (session=${session.user.id}, state=${user.id}). Try refreshing the page.`);
        return;
      }

      const { data: created, error } = await supabase
        .from("players")
        .insert({ game_id: gameId, user_id: session.user.id, display_name: displayNameFromUser(user), approved: false })
        .select("id, display_name, alive, elimination_type, approved, color")
        .single();
      if (error) {
        setJoinError(`Couldn't join this game: ${error.message}${error.code ? ` [code=${error.code}]` : ""}${error.details ? ` — ${error.details}` : ""} (user_id=${session.user.id})`);
      } else {
        setMyPlayer({ id: created.id, name: created.display_name, alive: created.alive, eliminationType: created.elimination_type, approved: created.approved, color: created.color });
        setJoined(true);
      }
    })();
  }, [user, gameId]);

  // Live subscription to this player's own row — a host rename, exile, or
  // return reaches this screen the instant it happens.
  useEffect(() => {
    if (!myPlayer?.id) return;
    const load = async () => {
      const { data } = await supabase.from("players").select("display_name, alive, elimination_type, approved, color").eq("id", myPlayer.id).maybeSingle();
      if (data) setMyPlayer((prev) => prev && ({ ...prev, name: data.display_name, alive: data.alive, eliminationType: data.elimination_type, approved: data.approved, color: data.color }));
    };
    const channel = supabase
      .channel(`self-player-${myPlayer.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "players", filter: `id=eq.${myPlayer.id}` }, load)
      .subscribe();
    const pollInterval = window.setInterval(load, 6000);
    return () => { window.clearInterval(pollInterval); supabase.removeChannel(channel); };
  }, [myPlayer?.id]);

  if (user === undefined) return <div style={pageStyle}><p>Loading...</p></div>;
  if (!user) return null;

  if (!gameId) {
    return (
      <div style={pageStyle}>
        <div style={{ position: "absolute", top: 20, right: 24 }}><LogoutButton /></div>
        <p style={{ color: "#a68fd6" }}>Ask the host for your join link — it looks like <code>/play?game=...</code>.</p>
      </div>
    );
  }

  const playerName = myPlayer?.name;
  const player = myPlayer ? { id: myPlayer.id, name: myPlayer.name } : null;
  const exiled = joined && myPlayer && myPlayer.alive === false;
  const quitByChoice = exiled && myPlayer.eliminationType === "quit";
  const approved = joined && !!myPlayer?.approved;
  const gameEnded = round?.phase === PHASES.ENDED;

  const handleQuit = async () => {
    if (!myPlayer) return;
    const verb = approved ? "quit this game" : "cancel your join request";
    if (!confirm(`Are you sure you want to ${verb}? This can't be undone.`)) return;
    setQuitBusy(true);
    const { error } = approved
      ? await quitOrRemoveApprovedPlayer(myPlayer.id)
      : await removePendingPlayer(myPlayer.id);
    setQuitBusy(false);
    if (error) { alert("Couldn't leave: " + error.message); return; }
    router.replace("/");
  };

  return (
    <div style={{ ...pageStyle, alignItems: "flex-start", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: 400, margin: "0 auto 12px" }}>
        <HomeLink />
        <span style={{ color: "#a68fd6", fontSize: 13 }}>Playing as {playerName || "..."}</span>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {joined && myPlayer && myPlayer.alive !== false && !gameEnded && (
            <button onClick={handleQuit} disabled={quitBusy} style={{
              background: "none", border: "none", color: "#ff3860", fontSize: 12,
              cursor: quitBusy ? "not-allowed" : "pointer", opacity: quitBusy ? 0.5 : 1,
            }}>
              {quitBusy ? "Leaving..." : approved ? "🚪 Quit" : "✕ Cancel"}
            </button>
          )}
          <button onClick={signOut} style={{ background: "none", border: "none", color: "#6b4f99", fontSize: 12, cursor: "pointer" }}>Log out</button>
        </div>
      </div>

      <div style={{ maxWidth: 400, width: "100%", margin: "0 auto" }}>
        {gameInfo && (
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontFamily: "'Orbitron', 'Segoe UI', sans-serif", fontSize: 16, fontWeight: 700 }}>{gameInfo.name}</div>
            {gameInfo.subtitle && <div style={{ color: "#a68fd6", fontSize: 12, fontStyle: "italic", marginTop: 1 }}>{gameInfo.subtitle}</div>}
          </div>
        )}
        {joinError && <p style={{ color: "#ff3860" }}>{joinError}</p>}

        {joined && myPlayer && !myPlayer.color && (
          <ColorPicker player={myPlayer} allPlayers={allPlayers} onPicked={(hex) => setMyPlayer((p) => p && ({ ...p, color: hex }))} />
        )}

        {joined && myPlayer && myPlayer.color && !myPlayer.approved && (
          <div style={{
            marginBottom: 20, textAlign: "center", padding: "28px 20px",
            background: "linear-gradient(160deg, #1a0a2e 0%, #1a0a2e 100%)",
            border: "2px solid #ff2d95", borderRadius: 12,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
            <p style={{ color: "#f5f0ff", fontSize: 16, fontWeight: 600, margin: "0 0 6px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              Waiting for the host to let you in
            </p>
            <p style={{ color: "#a68fd6", fontSize: 13, margin: 0, fontStyle: "italic" }}>
              You've joined, but the host needs to approve you first. This page updates automatically once you're approved.
            </p>
          </div>
        )}

        {gameEnded && approved && (
          <div style={{ marginBottom: 20, textAlign: "center", padding: "28px 20px", background: "linear-gradient(160deg, #1a0a2e 0%, #1a0a2e 100%)", border: "2px solid #ff2d95", borderRadius: 12 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
            <p style={{ color: "#f5f0ff", fontSize: 18, fontWeight: 700, margin: 0, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              {round.winnerName} wins Project B!
            </p>
          </div>
        )}

        {exiled && approved && !gameEnded && (
          <div style={{
            marginBottom: 20, textAlign: "center", padding: "24px 20px",
            background: "linear-gradient(160deg, #200a1a 0%, #120612 100%)",
            border: "2px solid #ff3860", borderRadius: 12, boxShadow: "0 0 24px rgba(255,56,96,0.25)",
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{quitByChoice ? "🚪" : "💀"}</div>
            <p style={{ color: "#f5f0ff", fontSize: 17, fontWeight: 600, margin: 0, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              {quitByChoice ? "You've left this game." : "You have been exiled."}
            </p>
          </div>
        )}

        {approved && myPlayer.color && playerName && (
          <>
            <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #3d1f5c" }}>
              {TABS.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)} style={{
                  flex: 1, background: tab === t.key ? "rgba(255,45,149,0.13)" : "transparent",
                  color: tab === t.key ? "#ff2d95" : "#a68fd6",
                  border: "none", borderRadius: "8px 8px 0 0", padding: "10px 6px",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  borderBottom: tab === t.key ? "2px solid #ff2d95" : "2px solid transparent",
                }}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "game" && !gameEnded && (
              <>
                <div style={{ marginBottom: 16 }}><RoundTimerBanner round={round} /></div>
                {(!round || round.phase === PHASES.LOBBY) && (
                  <Card style={{ marginBottom: 20, textAlign: "center" }}>
                    <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic", margin: 0 }}>
                      Waiting for the host to start the game. Feel free to check out the Confessional tab in the meantime.
                    </p>
                  </Card>
                )}
                {round?.phase === PHASES.CHALLENGE && (
                  <ChallengeErrorBoundary label="Challenge"><ChallengePlayer gameId={gameId} player={player} round={round} /></ChallengeErrorBoundary>
                )}
                {round?.phase === PHASES.FATES && (
                  <ChallengeErrorBoundary label="Fates Ceremony"><FatesPlayer gameId={gameId} player={player} players={allPlayers} round={round} /></ChallengeErrorBoundary>
                )}
                {round?.phase === PHASES.EXILE && !exiled && (
                  <ChallengeErrorBoundary label="Exile Vote">
                    <ChaosPowerPlayer gameId={gameId} round={round} player={player} players={allPlayers} />
                    <ExileVotePlayer gameId={gameId} player={player} round={round} players={allPlayers} />
                  </ChallengeErrorBoundary>
                )}
                {round?.phase === PHASES.FINALE && (
                  <ChallengeErrorBoundary label="Finale">
                    <ChaosPowerPlayer gameId={gameId} round={round} player={player} players={allPlayers} />
                    <FinalePlayer gameId={gameId} player={player} round={round} players={allPlayers} />
                  </ChallengeErrorBoundary>
                )}
              </>
            )}

            {tab === "game" && gameEnded && (
              <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic", textAlign: "center" }}>
                The game has ended — check the Ceremony tab for the full recap.
              </p>
            )}

            {tab === "ceremony" && (
              <ChallengeErrorBoundary label="Ceremony">
                <CeremonyPlayer gameId={gameId} players={allPlayers} round={round} />
              </ChallengeErrorBoundary>
            )}

            {tab === "confessional" && (
              <ChallengeErrorBoundary label="Confessional">
                <ConfessionalPlayer gameId={gameId} player={{ id: myPlayer.id, name: myPlayer.name }} round={round?.round} />
              </ChallengeErrorBoundary>
            )}

            {tab === "help" && <HelpPanel />}
          </>
        )}
      </div>
      {approved && <MusicPlayer gameId={gameId} isHost={false} />}
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh", background: "linear-gradient(180deg, #05010f, #1a0a2e)", color: "#f5f0ff",
  fontFamily: "'Orbitron', 'Segoe UI', sans-serif", padding: 24,
};

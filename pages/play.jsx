import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { signOut, displayNameFromUser } from "../lib/auth";
import ChallengePlayer from "../components/ChallengePlayer";
import FatesPlayer from "../components/FatesPlayer";
import ExileVotePlayer from "../components/ExileVotePlayer";
import FinalePlayer from "../components/FinalePlayer";
import ConfessionalPlayer from "../components/ConfessionalPlayer";
import MusicPlayer from "../components/MusicPlayer";
import HomeLink from "../components/HomeLink";
import ChallengeErrorBoundary from "../components/ChallengeErrorBoundary";
import RoundTimerBanner from "../components/RoundTimerBanner";
import { subscribeRound, PHASES } from "../lib/gameState";
import { useRoundWatcher } from "../lib/useRoundWatcher";

const TABS = [
  { key: "game", label: "🎲 Game" },
  { key: "confessional", label: "🎥 Confessional" },
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

  useRoundWatcher(gameId);

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
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
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
        .select("id, display_name, alive, elimination_type, approved")
        .eq("game_id", gameId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        setMyPlayer({ id: existing.id, name: existing.display_name, alive: existing.alive, eliminationType: existing.elimination_type, approved: existing.approved });
        setJoined(true);
        return;
      }

      const { data: created, error } = await supabase
        .from("players")
        .insert({ game_id: gameId, user_id: user.id, display_name: displayNameFromUser(user), approved: false })
        .select("id, display_name, alive, elimination_type, approved")
        .single();
      if (error) setJoinError("Couldn't join this game: " + error.message);
      else {
        setMyPlayer({ id: created.id, name: created.display_name, alive: created.alive, eliminationType: created.elimination_type, approved: created.approved });
        setJoined(true);
      }
    })();
  }, [user, gameId]);

  // Live subscription to this player's own row — a host rename, exile, or
  // return reaches this screen the instant it happens.
  useEffect(() => {
    if (!myPlayer?.id) return;
    const load = async () => {
      const { data } = await supabase.from("players").select("display_name, alive, elimination_type, approved").eq("id", myPlayer.id).maybeSingle();
      if (data) setMyPlayer((prev) => prev && ({ ...prev, name: data.display_name, alive: data.alive, eliminationType: data.elimination_type, approved: data.approved }));
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
        <p style={{ color: "#a09080" }}>Ask the host for your join link — it looks like <code>/play?game=...</code>.</p>
      </div>
    );
  }

  const playerName = myPlayer?.name;
  const player = myPlayer ? { id: myPlayer.id, name: myPlayer.name } : null;
  const exiled = joined && myPlayer && myPlayer.alive === false;
  const approved = joined && !!myPlayer?.approved;
  const gameEnded = round?.phase === PHASES.ENDED;

  return (
    <div style={{ ...pageStyle, alignItems: "flex-start", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: 400, margin: "0 auto 12px" }}>
        <HomeLink />
        <span style={{ color: "#a09080", fontSize: 13 }}>Playing as {playerName || "..."}</span>
        <button onClick={signOut} style={{ background: "none", border: "none", color: "#706050", fontSize: 12, cursor: "pointer" }}>Log out</button>
      </div>

      <div style={{ maxWidth: 400, width: "100%", margin: "0 auto" }}>
        {gameInfo && (
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", fontSize: 16, fontWeight: 700 }}>{gameInfo.name}</div>
            {gameInfo.subtitle && <div style={{ color: "#a09080", fontSize: 12, fontStyle: "italic", marginTop: 1 }}>{gameInfo.subtitle}</div>}
          </div>
        )}
        {joinError && <p style={{ color: "#c45c3c" }}>{joinError}</p>}

        {joined && myPlayer && !myPlayer.approved && (
          <div style={{
            marginBottom: 20, textAlign: "center", padding: "28px 20px",
            background: "linear-gradient(160deg, #1a1030 0%, #132038 100%)",
            border: "2px solid #c9a84c", borderRadius: 12,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
            <p style={{ color: "#f0e6d3", fontSize: 16, fontWeight: 600, margin: "0 0 6px", fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
              Waiting for the host to let you in
            </p>
            <p style={{ color: "#a09080", fontSize: 13, margin: 0, fontStyle: "italic" }}>
              You've joined, but the host needs to approve you first. This page updates automatically once you're approved.
            </p>
          </div>
        )}

        {gameEnded && approved && (
          <div style={{ marginBottom: 20, textAlign: "center", padding: "28px 20px", background: "linear-gradient(160deg, #1a1030 0%, #132038 100%)", border: "2px solid #c9a84c", borderRadius: 12 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
            <p style={{ color: "#f0e6d3", fontSize: 18, fontWeight: 700, margin: 0, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
              {round.winnerName} wins Project B!
            </p>
          </div>
        )}

        {exiled && approved && !gameEnded && (
          <div style={{
            marginBottom: 20, textAlign: "center", padding: "24px 20px",
            background: "linear-gradient(160deg, #1a0e0e 0%, #14090c 100%)",
            border: "2px solid #c45c3c", borderRadius: 12, boxShadow: "0 0 24px rgba(196,92,60,0.25)",
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💀</div>
            <p style={{ color: "#f0e6d3", fontSize: 17, fontWeight: 600, margin: 0, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
              You have been exiled.
            </p>
          </div>
        )}

        {approved && playerName && round && !gameEnded && (
          <>
            <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #253550" }}>
              {TABS.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)} style={{
                  flex: 1, background: tab === t.key ? "rgba(201,168,76,0.13)" : "transparent",
                  color: tab === t.key ? "#c9a84c" : "#a09080",
                  border: "none", borderRadius: "8px 8px 0 0", padding: "10px 6px",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  borderBottom: tab === t.key ? "2px solid #c9a84c" : "2px solid transparent",
                }}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "game" && (
              <>
                <div style={{ marginBottom: 16 }}><RoundTimerBanner round={round} /></div>
                {round.phase === PHASES.CHALLENGE && (
                  <ChallengeErrorBoundary label="Challenge"><ChallengePlayer gameId={gameId} player={player} round={round} /></ChallengeErrorBoundary>
                )}
                {round.phase === PHASES.FATES && (
                  <ChallengeErrorBoundary label="Fates Ceremony"><FatesPlayer gameId={gameId} player={player} players={allPlayers} round={round} /></ChallengeErrorBoundary>
                )}
                {round.phase === PHASES.EXILE && !exiled && (
                  <ChallengeErrorBoundary label="Exile Vote"><ExileVotePlayer gameId={gameId} player={player} round={round} /></ChallengeErrorBoundary>
                )}
                {round.phase === PHASES.FINALE && (
                  <ChallengeErrorBoundary label="Finale"><FinalePlayer gameId={gameId} player={player} round={round} /></ChallengeErrorBoundary>
                )}
              </>
            )}

            {tab === "confessional" && (
              <ChallengeErrorBoundary label="Confessional">
                <ConfessionalPlayer gameId={gameId} player={{ id: myPlayer.id, name: myPlayer.name }} round={round?.round} />
              </ChallengeErrorBoundary>
            )}
          </>
        )}
      </div>
      {approved && <MusicPlayer gameId={gameId} isHost={false} />}
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh", background: "linear-gradient(180deg, #0c1425, #0f1a30)", color: "#f0e6d3",
  fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", padding: 24,
};

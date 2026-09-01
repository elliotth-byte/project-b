import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { signOut, displayNameFromUser } from "../lib/auth";
import { removePendingPlayer, quitOrRemoveApprovedPlayer } from "../lib/playerRemoval";
import ColorPicker from "../components/ColorPicker";
import { AVATAR_COLLECTIONS } from "../lib/avatarCollections";
import ChallengePlayer from "../components/ChallengePlayer";
import FatesPlayer from "../components/FatesPlayer";
import ExileVotePlayer from "../components/ExileVotePlayer";
import FinalePlayer from "../components/FinalePlayer";
import CeremonyPlayer from "../components/CeremonyPlayer";
import ChaosPowerPlayer from "../components/ChaosPowerPlayer";
import AthenaTrigger from "../components/AthenaTrigger";
import HermesReveal from "../components/HermesReveal";
import ConfessionalPlayer from "../components/ConfessionalPlayer";
import MusicPlayer from "../components/MusicPlayer";
import TraitorsMusicPlayer from "../components/TraitorsMusicPlayer";
import TraitorsPlayerPanels from "../components/TraitorsPlayerPanels";
import HelpPanel from "../components/HelpPanel";
import FinalWordsPrompt from "../components/FinalWordsPrompt";
import { hasResolvedFinalWords } from "../lib/finalWords";
import OptionsPanel from "../components/OptionsPanel";
import UpdateBanner from "../components/UpdateBanner";
import NavTourOverlay from "../components/NavTourOverlay";
import { hasSeenNavTour } from "../lib/navTour";
import ChatPanel from "../components/ChatPanel";
import PlayerAvatarUpload from "../components/PlayerAvatarUpload";
import PlayerMemoryWall from "../components/PlayerMemoryWall";
import AphroditePicker from "../components/AphroditePicker";
import PoseidonTrigger from "../components/PoseidonTrigger";
import AresTarget from "../components/AresTarget";
import ArtemisTrigger from "../components/ArtemisTrigger";
import HeraTrigger from "../components/HeraTrigger";
import DionysusSwap from "../components/DionysusSwap";
import HephaestusChoice from "../components/HephaestusChoice";
import JuryPreferencePanel from "../components/JuryPreferencePanel";
import OnboardingPreferences from "../components/OnboardingPreferences";
import { powerFor } from "../lib/characterPowers";
import RoundRevealGate from "../components/RoundRevealGate";
import HomeLink from "../components/HomeLink";
import LogoutButton from "../components/LogoutButton";
import ChallengeErrorBoundary from "../components/ChallengeErrorBoundary";
import RoundTimerBanner from "../components/RoundTimerBanner";
import { Card } from "../components/ui";
import { subscribeRound, subscribeSettings, PHASES, KEY_EXILE_HISTORY, KEY_CHALLENGE, KEY_EXILE, KEY_CHALLENGE_HISTORY } from "../lib/gameState";
import { subscribeGameState } from "../lib/gameStorage";
import { subscribeScores } from "../lib/challengeScores";
import { subscribeCloseToTwenty } from "../lib/games/closeToTwentyData";
import { subscribeRevealAck } from "../lib/revealAck";
import { computeWinnerAndNomineeIds } from "../lib/memoryWallGlow";
import { resolveIdentities, identityComplete } from "../lib/playerIdentity";
import { resolveAvatars } from "../lib/avatarIdentity";
import { DEFAULT_GAME_PREFS } from "../lib/gamePrefs";
import { useHasUnreadChat } from "../lib/useChatUnread";
import { useNeedsAction } from "../lib/useNeedsAction";
import { useRoundWatcher } from "../lib/useRoundWatcher";
import { themeFor } from "../lib/uiTheme";

// Flavor text for a traitors-type season's elimination banner — mirrors
// the standalone Traitors app's own copy (see its pages/play.jsx); a
// Project B season never produces these elimination_type values, so
// this only ever gets consulted when isTraitors below is true.
const TRAITORS_ELIMINATION_MESSAGES = {
  murdered: "By the order of the Traitors, you have been murdered.",
  banished: "You have been banished from the castle.",
  walked: "You have chosen to walk away from the game.",
};

const BASE_TABS = [
  { key: "game", label: "🎲 Game" },
  { key: "ceremony", label: "⚖️ Ceremony" },
  { key: "confessional", label: "🎥 Confessional" },
  { key: "chat", label: "💬 Chat" },
  { key: "help", label: "❓ Help" },
  { key: "options", label: "⚙️ Options" },
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
  const [showMemoryWall, setShowMemoryWall] = useState(false);
  const [gameInfo, setGameInfo] = useState(null);
  const [quitBusy, setQuitBusy] = useState(false);
  const [exileHistory, setExileHistory] = useState([]);
  const [revealAck, setRevealAck] = useState({});
  const [finalWordsResolved, setFinalWordsResolved] = useState(true); // defaults true so the prompt never flashes on screen before the check below completes
  const [settings, setSettings] = useState(null);
  const [showNavTour, setShowNavTour] = useState(false);
  const [radioPortalNode, setRadioPortalNode] = useState(null);

  // Declared this early (rather than down with the other derived consts
  // below, where it conceptually belongs) so useRoundWatcher, right
  // below, and pageStyle, right after, can both use it. gameInfo.game_type
  // isn't known yet on the very first render (gameInfo starts null) —
  // isTraitors just reads false for that one render until the fetch
  // below resolves, same effect as host.jsx's identical situation.
  const isTraitors = gameInfo?.game_type === "traitors";
  const theme = themeFor(gameInfo?.game_type);
  const pageStyle = { minHeight: "100vh", background: theme.pageBg, color: theme.text, fontFamily: theme.font, padding: 24 };
  useRoundWatcher(gameId, { enabled: !isTraitors });

  // Hooks must run unconditionally, before any early returns below — this
  // is intentionally called this early (using the raw state directly,
  // not the `approved`/`player` derived consts further down which don't
  // exist yet at this point in the component) rather than being tucked
  // in next to where its result is actually used.
  const hasUnreadChat = useHasUnreadChat(gameId, myPlayer?.id, !!(joined && myPlayer?.approved && settings?.chatEnabled));
  // Same reasoning, same placement requirement — powers the badge dot
  // on the "🎲 Game" tab (see pages/play.jsx's own tab-button rendering
  // further down) for "you need to vote or compete in a Battle."
  const needsAction = useNeedsAction(gameId, round, myPlayer, settings);


  // Once the game ends there's nothing left to do on the Game tab — default
  // players over to Ceremony so they land on the recap instead of an empty tab.
  useEffect(() => {
    if (round?.phase === PHASES.ENDED) setTab((t) => (t === "game" ? "ceremony" : t));
  }, [round?.phase]);

  useEffect(() => {
    if (!gameId) return;
    (async () => {
      // .limit(1) + data?.[0] instead of .maybeSingle() — .maybeSingle()
      // depends on a special "return one object, not an array" Accept
      // header PostgREST has to honor; a real, observed case had
      // something in the network path (proxy/CDN/pooler) not preserving
      // that, silently falling back to array-shaped JSON that
      // .maybeSingle() doesn't unwrap, leaving gameInfo permanently null
      // (and isTraitors permanently false) with the failure completely
      // invisible, since only `data` was ever destructured, never
      // `error`. A plain array response works everywhere regardless.
      const { data, error } = await supabase.from("games").select("name, subtitle, game_type").eq("id", gameId).limit(1);
      if (error) console.error("Failed to load game info:", error);
      setGameInfo(data?.[0] || null);
    })();
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = subscribeRound(gameId, setRound);
    return unsubscribe;
  }, [gameId]);

  // Only fetched to know whether chat should be locked down right now —
  // see chatBlockedByChallenge below. Nothing else on this page needs
  // the live challenge/score state directly; ChallengePlayer.jsx already
  // manages its own subscriptions for actual gameplay.
  const [currentChallenge, setCurrentChallenge] = useState(null);
  const [currentScores, setCurrentScores] = useState({});
  const [closeToTwentyState, setCloseToTwentyState] = useState(null);
  const [liveExile, setLiveExile] = useState(null);
  const [challengeHistory, setChallengeHistory] = useState([]);
  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = subscribeGameState(gameId, KEY_CHALLENGE, setCurrentChallenge);
    return unsubscribe;
  }, [gameId]);
  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = subscribeGameState(gameId, KEY_EXILE, setLiveExile);
    return unsubscribe;
  }, [gameId]);
  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = subscribeGameState(gameId, KEY_CHALLENGE_HISTORY, (v) => setChallengeHistory(v || []));
    return unsubscribe;
  }, [gameId]);
  useEffect(() => {
    if (!gameId || !round?.round) return;
    const unsubscribe = subscribeScores(gameId, round.round, setCurrentScores);
    return unsubscribe;
  }, [gameId, round?.round]);
  useEffect(() => {
    if (!gameId || !round?.round) return;
    const unsubscribe = subscribeCloseToTwenty(gameId, round.round, setCloseToTwentyState);
    return unsubscribe;
  }, [gameId, round?.round]);

  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = subscribeSettings(gameId, setSettings);
    return unsubscribe;
  }, [gameId]);

  // Drives the forced dramatic reveal below — see RoundRevealGate.jsx.
  // Only the most recent Exile round ever gates the screen (not a
  // marathon of every round someone might have missed), and only once
  // that round has actually landed in history (i.e. genuinely revealed,
  // not just "voting closed").
  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = subscribeGameState(gameId, KEY_EXILE_HISTORY, (v) => setExileHistory(v || []));
    return unsubscribe;
  }, [gameId]);

  const latestExileEntry = exileHistory.length > 0 ? exileHistory.reduce((a, b) => (b.round > a.round ? b : a)) : null;

  useEffect(() => {
    if (!gameId || !latestExileEntry) { setRevealAck({}); return; }
    const unsubscribe = subscribeRevealAck(gameId, latestExileEntry.round, setRevealAck);
    return unsubscribe;
  }, [gameId, latestExileEntry?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same "must run before any early return" reasoning as hasUnreadChat
  // above — this MUST sit before the `if (!user) return null`-style
  // early returns further down, or React sees a different number of
  // hooks called depending on whether user is set yet, which is a hard
  // crash (not a lint warning) the instant it happens: exactly the
  // failure mode this hit in production, right at the moment of logging
  // in, since that's precisely when `user` flips from unset to a real
  // value and execution starts reaching past where this hook lives.
  // Computes everything from raw state inside the effect body itself,
  // rather than depending on the `approved`/`pendingReveal`-etc. consts
  // defined later, for the same reason — latestExileEntry above is
  // already raw-state-derived and safe to use directly here.
  useEffect(() => {
    const rawApproved = joined && !!myPlayer?.approved;
    const rawNeedsIdentity = joined && myPlayer && !identityComplete(myPlayer, settings);
    const rawPlayerName = myPlayer?.name;
    const rawPendingReveal = rawApproved && !rawNeedsIdentity && !!rawPlayerName && !!latestExileEntry && !revealAck[myPlayer?.id];
    if (!rawApproved || rawNeedsIdentity || !rawPlayerName || rawPendingReveal) return;
    if (!user || hasSeenNavTour(user)) return;
    setShowNavTour(true);
  }, [joined, myPlayer, settings, latestExileEntry, revealAck, user]);

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
    // Same egress fix as lib/gameStorage.js's identical pattern -- this realtime subscription is the primary update mechanism; this poll only guards against a missed/dropped event, which doesn't need sub-10-second detection.
    const pollInterval = window.setInterval(load, 45000);
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
        .select("id, display_name, alive, elimination_type, elimination_round, approved, color, alias, avatar_url, game_prefs, battle_ban_round, torched_preset, power_state, inactivity_strikes")
        .eq("game_id", gameId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        setMyPlayer({ id: existing.id, name: existing.display_name, alive: existing.alive, eliminationType: existing.elimination_type, eliminationRound: existing.elimination_round, approved: existing.approved, color: existing.color, alias: existing.alias, avatarUrl: existing.avatar_url, gamePrefs: { ...DEFAULT_GAME_PREFS, ...(existing.game_prefs || {}) }, battleBanRound: existing.battle_ban_round, torchedPreset: existing.torched_preset, powerState: existing.power_state, inactivityStrikes: existing.inactivity_strikes });
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
        .select("id, display_name, alive, elimination_type, elimination_round, approved, color, alias, avatar_url, game_prefs, battle_ban_round, torched_preset, power_state, inactivity_strikes")
        .single();
      if (error) {
        setJoinError(`Couldn't join this game: ${error.message}${error.code ? ` [code=${error.code}]` : ""}${error.details ? ` — ${error.details}` : ""} (user_id=${session.user.id})`);
      } else {
        setMyPlayer({ id: created.id, name: created.display_name, alive: created.alive, eliminationType: created.elimination_type, eliminationRound: created.elimination_round, approved: created.approved, color: created.color, alias: created.alias, avatarUrl: created.avatar_url, gamePrefs: { ...DEFAULT_GAME_PREFS, ...(created.game_prefs || {}) }, battleBanRound: created.battle_ban_round, torchedPreset: created.torched_preset, powerState: created.power_state, inactivityStrikes: created.inactivity_strikes });
        setJoined(true);
        // Fire-and-forget — a host notification failing to send should
        // never block the join itself, which already succeeded. Uses
        // this session's own token directly (not a fresh getSession()
        // call) since it's the exact same freshly-fetched session that
        // just succeeded at the insert above.
        fetch("/api/push/notify-host-event", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ gameId, eventType: "pending_player", playerName: created.display_name }),
        }).catch((e) => console.error("Push notify for pending player failed:", e));
      }
    })();
  }, [user, gameId]);

  // Checked once whenever a fresh exile shows up (not subscribed —
  // this status only ever changes for THIS player, from THIS same
  // session, when they submit or skip below; no other device or
  // player could change it out from under this tab, so a one-time
  // check is genuinely sufficient here, not a missing safety net).
  useEffect(() => {
    if (!gameId || !myPlayer?.id || myPlayer.alive !== false || myPlayer.eliminationRound == null) return;
    let cancelled = false;
    hasResolvedFinalWords(gameId, myPlayer.id, myPlayer.eliminationRound).then((resolved) => {
      if (!cancelled) setFinalWordsResolved(resolved);
    });
    return () => { cancelled = true; };
  }, [gameId, myPlayer?.id, myPlayer?.alive, myPlayer?.eliminationRound]);

  // Live subscription to this player's own row — a host rename, exile, or
  // return reaches this screen the instant it happens.
  useEffect(() => {
    if (!myPlayer?.id) return;
    const load = async () => {
      const { data } = await supabase.from("players").select("display_name, alive, elimination_type, elimination_round, approved, color, alias, avatar_url, game_prefs, battle_ban_round, torched_preset, power_state, inactivity_strikes").eq("id", myPlayer.id).maybeSingle();
      if (data) setMyPlayer((prev) => prev && ({ ...prev, name: data.display_name, alive: data.alive, eliminationType: data.elimination_type, eliminationRound: data.elimination_round, approved: data.approved, color: data.color, alias: data.alias, avatarUrl: data.avatar_url, gamePrefs: { ...DEFAULT_GAME_PREFS, ...(data.game_prefs || {}) }, battleBanRound: data.battle_ban_round, torchedPreset: data.torched_preset, powerState: data.power_state, inactivityStrikes: data.inactivity_strikes }));
    };
    const channel = supabase
      .channel(`self-player-${myPlayer.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "players", filter: `id=eq.${myPlayer.id}` }, load)
      .subscribe();
    // Same egress fix as above and throughout this app -- the realtime subscription is the primary update mechanism; this poll is only a safety net for a missed event.
    const pollInterval = window.setInterval(load, 45000);
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
  const identityAllPlayers = resolveAvatars(resolveIdentities(allPlayers, { settings, round, isHost: false }), settings);
  // The player's own displayed name follows the same override — once
  // their alias is confirmed, that's who they are for the season,
  // including to themselves, right down to what shows up in "Playing
  // as..." up top and what name their own chat/confessional posts carry.
  const effectivePlayerName = settings?.aliasEnabled && myPlayer?.alias && round?.phase !== PHASES.ENDED ? myPlayer.alias : playerName;
  const player = myPlayer ? { id: myPlayer.id, name: effectivePlayerName, gamePrefs: myPlayer.gamePrefs || DEFAULT_GAME_PREFS, battleBanRound: myPlayer.battleBanRound, torchedPreset: myPlayer.torchedPreset, powerState: myPlayer.powerState, alias: myPlayer.alias, inactivityStrikes: myPlayer.inactivityStrikes } : null;

  // Who Said It pulls its quiz straight from Panopticon chat history, and
  // Close to 20 needs every bank kept a total mystery until the reveal
  // — leaving chat open mid-challenge would let a player either read off
  // quiz answers, or have someone tip them off about bank totals/who's
  // decided what. Locked for THIS player specifically until THEIR OWN
  // part is done, not the whole challenge duration — someone who
  // finishes early gets chat back immediately rather than waiting on
  // everyone else. "Done" means something different per game: Who Said
  // It uses their locked score (all questions answered); Close to 20
  // uses whether they've personally submitted their distribution yet,
  // since their own score doesn't lock until the WHOLE round reveals,
  // which could be well after they've made their own decision. Scoped to
  // actual participants only — a spectator or eliminated player who
  // isn't in the challenge at all has nothing to "cheat" by reading
  // chat, so they keep normal access.
  const iAmWhoSaidItParticipant = currentChallenge?.gameType === "whosaidit" && currentChallenge?.participantIds?.includes(player?.id);
  const iAmCloseToTwentyParticipant = currentChallenge?.gameType === "closeto20" && currentChallenge?.participantIds?.includes(player?.id);
  const chatBlockedByChallenge = !!(
    currentChallenge?.active && player && (
      (iAmWhoSaidItParticipant && !currentScores[player.id]?.locked) ||
      (iAmCloseToTwentyParticipant && !closeToTwentyState?.submittedIds?.includes(player.id))
    )
  );
  // Traitors seasons have no color/alias/onboarding-prefs step (they
  // never existed in the standalone Traitors app this was ported from —
  // see components/TraitorsPlayerPanels.jsx) and no round-phase engine
  // (round stays null forever for these games, since that's Project B's
  // own lib/gameState.js machinery), so the gates below are forced off
  // for them rather than evaluated for real. isTraitors itself is
  // declared up with pageStyle, near the top of the component.
  const exiled = joined && myPlayer && myPlayer.alive === false;
  const quitByChoice = exiled && myPlayer.eliminationType === "quit";
  const removedForInactivity = exiled && myPlayer.eliminationType === "removed_inactivity";
  // Scoped to a genuine exile-by-vote specifically — someone who quit or
  // was removed for inactivity didn't get voted out in the dramatic
  // sense this is modeling, so neither gets a "final words" moment.
  const needsFinalWords = exiled && !quitByChoice && !removedForInactivity && myPlayer.eliminationRound != null && !finalWordsResolved;
  const approved = joined && !!myPlayer?.approved;
  const gameEnded = round?.phase === PHASES.ENDED;
  const needsIdentity = !isTraitors && joined && myPlayer && !identityComplete(myPlayer, settings);
  // Shown once, right after identity is picked and before the "waiting
  // for host approval" screen — see components/OnboardingPreferences.jsx
  // for the full reasoning. Gated off once approved (an approved player
  // never needs to see this again, even if they somehow never completed
  // it — better to let them into the game than trap them here).
  const needsOnboardingPrefs = !isTraitors && joined && myPlayer && !needsIdentity && !approved && !myPlayer.gamePrefs?.onboardingComplete;
  // Once the game's over, the whole point of keeping exiled players
  // separated from the main chat (protecting the still-competing
  // players from anything an exiled player might reveal or pressure
  // them with) no longer applies — everyone gets the main Panopticon
  // room together from here on. Deliberately a separate variable from
  // `exiled` itself, not a change to it — other logic above (quit/
  // inactivity-removal labeling) still needs the player's real,
  // unconditional status regardless of whether the game has ended.
  const chatTreatsAsExiled = exiled && !gameEnded;

  // Once a round's Exile Vote has actually landed in history, this
  // player's whole screen locks into RoundRevealGate until they've
  // clicked through it — see the effect above for why only the latest
  // round ever triggers this.
  const pendingReveal = approved && !needsIdentity && !!playerName && !!latestExileEntry && !revealAck[player?.id];

  const visibleTabs = BASE_TABS.filter((t) => t.key !== "chat" || settings?.chatEnabled);
  const { winnerIds, nomineeIds } = computeWinnerAndNomineeIds(challengeHistory, liveExile, round?.round);

  const handleQuit = async () => {
    if (!myPlayer) return;
    const verb = approved ? "quit this game" : "cancel your join request";
    if (!confirm(`Are you sure you want to ${verb}? This can't be undone.`)) return;
    setQuitBusy(true);
    const { error } = approved
      ? await quitOrRemoveApprovedPlayer(gameId, myPlayer.id, round?.round ?? null)
      : await removePendingPlayer(myPlayer.id);
    setQuitBusy(false);
    if (error) { alert("Couldn't leave: " + error.message); return; }
    router.replace("/");
  };

  return (
    <div style={{ ...pageStyle, alignItems: "flex-start", flexDirection: "column" }}>
      <div style={{ width: "100%", maxWidth: 400, margin: "0 auto" }}><UpdateBanner /></div>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: 400, margin: "0 auto 12px" }}>
        <HomeLink />
        <span style={{ color: theme.textMuted, fontSize: 13 }}>Playing as {effectivePlayerName || "..."}</span>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {joined && myPlayer && !approved && (
            <button onClick={handleQuit} disabled={quitBusy} style={{
              background: "none", border: "none", color: theme.danger, fontSize: 12,
              cursor: quitBusy ? "not-allowed" : "pointer", opacity: quitBusy ? 0.5 : 1,
            }}>
              {quitBusy ? "Leaving..." : "✕ Cancel"}
            </button>
          )}
          <button onClick={signOut} style={{ background: "none", border: "none", color: theme.textDim, fontSize: 12, cursor: "pointer" }}>Log out</button>
        </div>
      </div>

      <div style={{ maxWidth: 400, width: "100%", margin: "0 auto" }}>
        {gameInfo && (
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontFamily: theme.font, fontSize: 16, fontWeight: 700 }}>{gameInfo.name}</div>
            {gameInfo.subtitle && <div style={{ color: theme.textMuted, fontSize: 12, fontStyle: "italic", marginTop: 1 }}>{gameInfo.subtitle}</div>}
          </div>
        )}
        {joinError && <p style={{ color: theme.danger }}>{joinError}</p>}

        {joined && myPlayer && needsIdentity && (
          <ColorPicker
            player={myPlayer}
            allPlayers={allPlayers}
            aliasEnabled={settings?.aliasEnabled}
            avatarCollectionSlug={settings?.avatarMode === "collection" ? AVATAR_COLLECTIONS.find((c) => c.id === settings.avatarCollectionId)?.slug : null}
            onPicked={(row) => setMyPlayer((p) => p && ({ ...p, color: row.color, alias: row.alias }))}
          />
        )}

        {joined && myPlayer && needsOnboardingPrefs && (
          <OnboardingPreferences
            gameId={gameId} player={myPlayer}
            onComplete={(gamePrefs) => setMyPlayer((p) => p && ({ ...p, gamePrefs }))}
          />
        )}

        {joined && myPlayer && !needsIdentity && !needsOnboardingPrefs && !myPlayer.approved && (
          <div style={{
            marginBottom: 20, textAlign: "center", padding: "28px 20px",
            background: theme.cardBg,
            border: `2px solid ${theme.accent}`, borderRadius: 12,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
            <p style={{ color: theme.text, fontSize: 16, fontWeight: 600, margin: "0 0 6px", fontFamily: theme.font }}>
              Waiting for the host to let you in
            </p>
            <p style={{ color: theme.textMuted, fontSize: 13, margin: 0, fontStyle: "italic" }}>
              You've joined, but the host needs to approve you first. This page updates automatically once you're approved.
            </p>
          </div>
        )}

        {/* Dormant for Traitors — gameEnded stays false forever there
            (see this file's own comment on isTraitors above); left
            untouched/still Project-B-flavored on purpose rather than
            themed for a state that can't actually occur. */}
        {gameEnded && approved && !pendingReveal && (
          <div style={{ marginBottom: 20, textAlign: "center", padding: "28px 20px", background: "linear-gradient(160deg, #1a0a2e 0%, #1a0a2e 100%)", border: "2px solid #ff2d95", borderRadius: 12 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
            <p style={{ color: "#f5f0ff", fontSize: 18, fontWeight: 700, margin: 0, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              {round.winnerName} wins Project B!
            </p>
          </div>
        )}

        {exiled && approved && !gameEnded && !pendingReveal && (
          <div style={{
            marginBottom: 20, textAlign: "center", padding: "24px 20px",
            background: theme.cardBg,
            border: `2px solid ${theme.danger}`, borderRadius: 12, boxShadow: `0 0 24px ${theme.danger}40`,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>
              {isTraitors
                ? (myPlayer.eliminationType === "murdered" ? "💀" : myPlayer.eliminationType === "walked" ? "🚪" : "⚖️")
                : (quitByChoice ? "🚪" : removedForInactivity ? "⏳" : "💀")}
            </div>
            <p style={{ color: theme.text, fontSize: 17, fontWeight: 600, margin: 0, fontFamily: theme.font }}>
              {isTraitors
                ? (TRAITORS_ELIMINATION_MESSAGES[myPlayer.eliminationType] || "You are no longer in the game.")
                : (quitByChoice ? "You've left this game." : removedForInactivity ? "You were removed for inactivity." : "You have been exiled.")}
            </p>
          </div>
        )}

        {needsFinalWords && approved && !gameEnded && !pendingReveal && (
          <FinalWordsPrompt
            gameId={gameId} player={{ id: player.id, name: player.name, realName: myPlayer.name }}
            eliminationRound={myPlayer.eliminationRound}
            onResolved={() => setFinalWordsResolved(true)}
          />
        )}

        {pendingReveal && (
          <ChallengeErrorBoundary label="Round Reveal">
            <RoundRevealGate gameId={gameId} player={player} players={identityAllPlayers} entry={latestExileEntry} />
          </ChallengeErrorBoundary>
        )}

        {!isTraitors && approved && !needsIdentity && playerName && !pendingReveal && (
          <>
            <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #3d1f5c" }}>
              {visibleTabs.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)} style={{
                  flex: 1, background: tab === t.key ? "rgba(255,45,149,0.13)" : "transparent",
                  color: tab === t.key ? "#ff2d95" : "#a68fd6",
                  border: "none", borderRadius: "8px 8px 0 0", padding: "10px 6px",
                  fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  borderBottom: tab === t.key ? "2px solid #ff2d95" : "2px solid transparent",
                }}>
                  {t.label}
                  {t.key === "chat" && hasUnreadChat && tab !== "chat" && !chatBlockedByChallenge && (
                    <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#ff3860" }} />
                  )}
                  {t.key === "game" && needsAction && tab !== "game" && (
                    <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#ff3860" }} />
                  )}
                </button>
              ))}
            </div>

            {tab === "game" && !gameEnded && (
              <>
                {settings?.avatarMode === "player_upload" && (
                  <PlayerAvatarUpload
                    player={player}
                    avatarUrl={myPlayer.avatarUrl}
                    onChanged={(url) => setMyPlayer((p) => p && ({ ...p, avatarUrl: url }))}
                  />
                )}
                <div style={{ marginBottom: 16 }}><RoundTimerBanner round={round} /></div>
                <ChallengeErrorBoundary label="Jury Preference List">
                  <JuryPreferencePanel gameId={gameId} myPlayer={myPlayer} players={identityAllPlayers} round={round} />
                </ChallengeErrorBoundary>
                <div style={{ marginBottom: 16 }}>
                  <button
                    onClick={() => setShowMemoryWall(!showMemoryWall)}
                    style={{
                      background: showMemoryWall ? "rgba(255,45,149,0.13)" : "transparent",
                      border: `1px solid ${showMemoryWall ? "#ff2d95" : "#3d1f5c"}`,
                      color: showMemoryWall ? "#ff2d95" : "#a68fd6", fontSize: 12, cursor: "pointer",
                      borderRadius: 20, padding: "6px 14px", fontWeight: 600,
                    }}
                  >
                    🖼 {showMemoryWall ? "Hide" : "Show"} memory wall
                  </button>
                  {showMemoryWall && (
                    <div style={{ marginTop: 12 }}>
                      <PlayerMemoryWall players={identityAllPlayers.filter((p) => p.approved)} hideNameLabels={settings?.avatarMode === "collection" && settings?.avatarCollectionId === "default-gods"} winnerIds={winnerIds} nomineeIds={nomineeIds} />
                    </div>
                  )}
                </div>
                {round?.round === 1 && powerFor(player, settings) === "Aphrodite" && (
                  <AphroditePicker gameId={gameId} player={player} players={identityAllPlayers} settings={settings} />
                )}
                {round && powerFor(player, settings) === "Poseidon" && (
                  <PoseidonTrigger player={player} round={round} />
                )}
                {round && powerFor(player, settings) === "Ares" && (
                  <AresTarget gameId={gameId} round={round} player={player} players={identityAllPlayers} settings={settings} />
                )}
                {(!round || round.phase === PHASES.LOBBY) && (
                  <Card style={{ marginBottom: 20, textAlign: "center" }}>
                    <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic", margin: 0 }}>
                      Waiting for the host to start the game. Feel free to check out the Confessional tab in the meantime.
                    </p>
                  </Card>
                )}
                {round?.phase === PHASES.CHALLENGE && (
                  <>
                    <ChallengeErrorBoundary label="Hephaestus's Choice"><HephaestusChoice gameId={gameId} round={round} player={player} settings={settings} /></ChallengeErrorBoundary>
                    <ChallengeErrorBoundary label="Battle"><ChallengePlayer gameId={gameId} player={player} players={identityAllPlayers} round={round} settings={settings} /></ChallengeErrorBoundary>
                  </>
                )}
                {round?.phase === PHASES.FATES && (
                  <ChallengeErrorBoundary label="Fates Ceremony"><FatesPlayer gameId={gameId} player={player} players={identityAllPlayers} round={round} settings={settings} /></ChallengeErrorBoundary>
                )}
                {round?.phase === PHASES.EXILE && !exiled && (
                  <ChallengeErrorBoundary label="Exile Vote">
                    <ChaosPowerPlayer gameId={gameId} round={round} player={player} players={identityAllPlayers} settings={settings} />
                    <AthenaTrigger gameId={gameId} round={round} player={player} settings={settings} />
                    <HermesReveal gameId={gameId} round={round} player={player} players={identityAllPlayers} settings={settings} />
                    <ArtemisTrigger gameId={gameId} round={round} player={player} players={identityAllPlayers} settings={settings} />
                    <HeraTrigger gameId={gameId} round={round} player={player} players={identityAllPlayers} settings={settings} />
                    <DionysusSwap gameId={gameId} round={round} player={player} players={identityAllPlayers} settings={settings} />
                    <ExileVotePlayer gameId={gameId} player={player} round={round} players={identityAllPlayers} settings={settings} />
                  </ChallengeErrorBoundary>
                )}
                {round?.phase === PHASES.FINALE && (
                  <ChallengeErrorBoundary label="Finale">
                    <ChaosPowerPlayer gameId={gameId} round={round} player={player} players={identityAllPlayers} settings={settings} />
                    <AthenaTrigger gameId={gameId} round={round} player={player} settings={settings} />
                    <HermesReveal gameId={gameId} round={round} player={player} players={identityAllPlayers} settings={settings} />
                    <ArtemisTrigger gameId={gameId} round={round} player={player} players={identityAllPlayers} settings={settings} />
                    <HeraTrigger gameId={gameId} round={round} player={player} players={identityAllPlayers} settings={settings} />
                    <FinalePlayer gameId={gameId} player={player} round={round} players={identityAllPlayers} settings={settings} />
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
                <CeremonyPlayer gameId={gameId} players={identityAllPlayers} round={round} settings={settings} />
              </ChallengeErrorBoundary>
            )}

            {tab === "confessional" && (
              <ChallengeErrorBoundary label="Confessional">
                <ConfessionalPlayer gameId={gameId} player={{ id: myPlayer.id, name: myPlayer.name }} round={round?.round} />
              </ChallengeErrorBoundary>
            )}

            {tab === "chat" && settings?.chatEnabled && !chatBlockedByChallenge && (
              <ChallengeErrorBoundary label="Chat">
                <ChatPanel gameId={gameId} player={player} players={identityAllPlayers} realName={myPlayer.name} isExiled={chatTreatsAsExiled} round={round} settings={settings} />
              </ChallengeErrorBoundary>
            )}

            {tab === "chat" && settings?.chatEnabled && chatBlockedByChallenge && (
              <Card style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
                <h3 style={{ color: "#f5f0ff", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>Chat's Locked</h3>
                <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
                  {iAmWhoSaidItParticipant
                    ? "Panopticon is off-limits until you finish Who Said It — no peeking at the chat log for answers."
                    : "Panopticon is off-limits until you've locked in your coin distribution — no tipping each other off."}
                  {" "}It'll unlock the moment you're done.
                </p>
              </Card>
            )}

            {tab === "help" && (
              <HelpPanel
                player={player}
                onReplayTour={() => setShowNavTour(true)}
              />
            )}

            {tab === "options" && (
              <OptionsPanel
                gameId={gameId}
                player={player}
                onPrefsChanged={(gamePrefs) => setMyPlayer((p) => p && ({ ...p, gamePrefs }))}
                onQuit={approved && myPlayer.alive !== false && !gameEnded ? handleQuit : undefined}
                quitBusy={quitBusy}
                musicPortalRef={setRadioPortalNode}
              />
            )}
          </>
        )}

        {isTraitors && approved && playerName && (
          <ChallengeErrorBoundary label="Traitors">
            <TraitorsPlayerPanels gameId={gameId} player={{ id: myPlayer.id, name: playerName }} />
          </ChallengeErrorBoundary>
        )}
      </div>
      {approved && isTraitors && <TraitorsMusicPlayer gameId={gameId} isHost={false} />}
      {approved && !isTraitors && <MusicPlayer gameId={gameId} isHost={false} portalTarget={radioPortalNode} />}
      {showNavTour && (
        <NavTourOverlay
          visibleTabKeys={visibleTabs.map((t) => t.key)}
          onDone={() => setShowNavTour(false)}
        />
      )}
    </div>
  );
}


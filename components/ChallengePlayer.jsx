import { useState, useEffect } from "react";
import { Btn, Card, Badge } from "./ui";
import { subscribeGameState, storageUpdate } from "../lib/gameStorage";
import { KEY_CHALLENGE, KEY_REENTRY } from "../lib/gameState";
import { setReentryDecision } from "../lib/reentryData";
import { REENTRY_STATUS } from "../lib/reentryLogic";
import { formatDurationHours } from "../lib/fatesLogic";
import { subscribeScores, forfeitChallenge, unlockScoreForRetry } from "../lib/challengeScores";
import { GAME_REGISTRY } from "../lib/challengeGames";
import { powerFor } from "../lib/characterPowers";
import Match3Player from "./games/Match3Player";
import FroggerPlayer from "./games/FroggerPlayer";
import WordScramblePlayer from "./games/WordScramblePlayer";
import Maze2DPlayer from "./games/Maze2DPlayer";
import MazeInvisiblePlayer from "./games/MazeInvisiblePlayer";
import MazeTriviaPlayer from "./games/MazeTriviaPlayer";
import FarklePlayer from "./games/FarklePlayer";
import TriviaPlayer from "./games/TriviaPlayer";
import BreakoutPlayer from "./games/BreakoutPlayer";
import PlinkoPlayer from "./games/PlinkoPlayer";
import SpotDiffPlayer from "./games/SpotDiffPlayer";
import WhackMolePlayer from "./games/WhackMolePlayer";
import SimonPlayer from "./games/SimonPlayer";
import BogglePlayer from "./games/BogglePlayer";
import DealOrNoDealPlayer from "./games/DealOrNoDealPlayer";
import MetronomePlayer from "./games/MetronomePlayer";
import PitPlayer from "./games/PitPlayer";
import WhoSaidItPlayer from "./games/WhoSaidItPlayer";
import MasqueradePlayer from "./games/MasqueradePlayer";
import CloseToTwentyPlayer from "./games/CloseToTwentyPlayer";
import SnakePlayer from "./games/SnakePlayer";
import MinesweeperPlayer from "./games/MinesweeperPlayer";
import StroopPlayer from "./games/StroopPlayer";
import RedLightGreenLightPlayer from "./games/RedLightGreenLightPlayer";
import SlidingPuzzlePlayer from "./games/SlidingPuzzlePlayer";
import TorchedPlayer from "./games/TorchedPlayer";
import ChainsPlayer from "./games/ChainsPlayer";
import LabyrinthPlayer from "./games/LabyrinthPlayer";
import OraclesSealPlayer from "./games/OraclesSealPlayer";
import GameResultCard from "./games/GameResultCard";

const GAME_COMPONENTS = {
  match3: Match3Player,
  frogger: FroggerPlayer,
  wordscramble: WordScramblePlayer,
  maze2d: Maze2DPlayer,
  mazeinvisible: MazeInvisiblePlayer,
  mazetrivia: MazeTriviaPlayer,
  farkle: FarklePlayer,
  trivia: TriviaPlayer,
  breakout: BreakoutPlayer,
  plinko: PlinkoPlayer,
  spotdiff: SpotDiffPlayer,
  whackmole: WhackMolePlayer,
  simon: SimonPlayer,
  boggle: BogglePlayer,
  dealornodeal: DealOrNoDealPlayer,
  metronome: MetronomePlayer,
  pit: PitPlayer,
  whosaidit: WhoSaidItPlayer,
  masquerade: MasqueradePlayer,
  closeto20: CloseToTwentyPlayer,
  snake: SnakePlayer,
  minesweeper: MinesweeperPlayer,
  stroop: StroopPlayer,
  redlightgreenlight: RedLightGreenLightPlayer,
  slidingpuzzle: SlidingPuzzlePlayer,
  torched: TorchedPlayer,
  chains: ChainsPlayer,
  labyrinth: LabyrinthPlayer,
  oraclesseal: OraclesSealPlayer,
};

export default function ChallengePlayer({ gameId, player, players, round, settings, readOnly = false }) {
  const [challenge, setChallenge] = useState(null);
  const [scores, setScores] = useState({});
  const [reentry, setReentry] = useState([]);
  const [readyToPlay, setReadyToPlay] = useState(false);
  // Minimizing keeps the overlay (and the mini-game inside it) fully
  // MOUNTED — just visually hidden — rather than unmounting it. That
  // matters because several games (Snake, Labyrinth, The Oracle's Seal,
  // ...) keep all their progress in local component state with nothing
  // persisted server-side; unmounting to "go back" would silently wipe
  // it. This just toggles visibility, so returning to the battle picks
  // up exactly where it was left, no matter which kind of game it is.
  const [minimized, setMinimized] = useState(false);
  // Demeter's character power (see lib/characterPowers.js) — forcing a
  // fresh `key` on GameComponent below triggers a full React remount,
  // which resets EVERY game's internal state cleanly (Snake's board,
  // Match3's grid, an in-progress Word Scramble scatter, all of it)
  // without needing to teach each individual game component anything
  // about being "retried" — they just mount fresh, exactly as if the
  // player had never played this round at all.
  const [attemptKey, setAttemptKey] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [forfeiting, setForfeiting] = useState(false);
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_CHALLENGE, setChallenge);
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!round?.round) return;
    const unsubscribe = subscribeScores(gameId, round.round, setScores);
    return unsubscribe;
  }, [gameId, round?.round]);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_REENTRY, (v) => setReentry(v || []));
    return unsubscribe;
  }, [gameId]);

  // A brand new challenge (new round, or the host re-starting one) always
  // needs the rules screen shown again — clicking "Go" on a previous
  // challenge shouldn't let a player skip straight past the next one.
  useEffect(() => {
    setReadyToPlay(false);
  }, [gameId, round?.round, challenge?.startedAt]);

  if (round?.phase !== "challenge") return null;

  if (!challenge?.active) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic", margin: 0 }}>
          Waiting for the host to start this round's challenge.
        </p>
      </Card>
    );
  }

  // Exiled players get exactly one re-entry attempt, ever — and they
  // decide, deliberately, per challenge, whether to use it here. Checked
  // against their LIVE lib/reentryLogic.js status (PENDING = eligible),
  // not a snapshot taken when the challenge started — a frozen snapshot
  // meant a player who wasn't captured in it (a race right after their
  // exile, a host resetting the round, anything) could be silently
  // locked out of ever opting in, with nothing on screen explaining why.
  // Not deciding by the time everyone else finishes just counts as
  // sitting this one out (see lib/roundEngine.js) — it costs nothing.
  // Once they opt in, they're folded into the normal competing flow
  // below, same as anyone else (see lib/reentryData.js's
  // setReentryDecision).
  const myReentry = reentry.find((r) => r.playerId === player?.id);
  const isReentryEligible = myReentry?.status === REENTRY_STATUS.PENDING;
  const reentryDecision = challenge.reentryDecisions?.[player?.id];

  if (isReentryEligible && reentryDecision !== "in") {
    if (readOnly) {
      return (
        <Card style={{ marginBottom: 20, borderColor: "rgba(255,56,96,0.4)", textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🔥</div>
          <p style={{ color: "#f5f0ff", fontSize: 15, fontWeight: 600, margin: "0 0 6px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            One shot at re-entry
          </p>
          <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
            {reentryDecision === "out" ? "Opted to sit this battle out." : "Hasn't decided whether to compete yet."}
          </p>
        </Card>
      );
    }

    const decide = async (decision) => {
      setDeciding(true);
      const ok = await setReentryDecision(gameId, player.id, decision);
      setDeciding(false);
      if (!ok) alert("Couldn't save your decision — try again.");
    };

    return (
      <Card style={{ marginBottom: 20, borderColor: "rgba(255,56,96,0.4)", textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🔥</div>
        <p style={{ color: "#f5f0ff", fontSize: 15, fontWeight: 600, margin: "0 0 6px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
          One shot at re-entry
        </p>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 14px" }}>
          Compete in THIS battle for a chance to return? Finish 1st and you're back in the game. Anything else, and this was
          your one shot. Not deciding by the time everyone else finishes counts as sitting this one out — that costs you nothing,
          and you'll get to decide again next challenge.
        </p>
        {reentryDecision === "out" && (
          <p style={{ color: "#6b4f99", fontSize: 12, margin: "0 0 10px", fontStyle: "italic" }}>You've opted out of this one — you can still change your mind below.</p>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Btn onClick={() => decide("in")} disabled={deciding}>{deciding ? "..." : "Compete this round"}</Btn>
          <Btn variant="ghost" onClick={() => decide("out")} disabled={deciding}>Sit this one out</Btn>
        </div>
      </Card>
    );
  }

  const amCompeting = (challenge.participantIds || []).includes(player?.id);
  const isDigital = challenge.gameType && challenge.gameType !== "manual";
  const myScore = scores?.[player?.id];
  const registryEntry = GAME_REGISTRY[challenge.gameType];
  const manuallyForfeited = (challenge.forfeitedIds || []).includes(player?.id);

  // Manual / in-person challenges have no digital score to lock in, so a
  // forfeit there just flags the player's row for the host (who still
  // enters everyone's finishing order by hand).
  const forfeitManual = async () => {
    if (!confirm("Forfeit this battle? This can't be undone once the battle is over.")) return;
    setForfeiting(true);
    await storageUpdate(gameId, KEY_CHALLENGE, (fresh) => {
      if (!fresh) return fresh;
      const ids = fresh.forfeitedIds || [];
      if (ids.includes(player.id)) return fresh;
      return { ...fresh, forfeitedIds: [...ids, player.id] };
    });
    setForfeiting(false);
  };

  const forfeitDigital = async () => {
    if (!confirm("Forfeit this battle? This can't be undone, and you'll be ranked last.")) return;
    setForfeiting(true);
    await forfeitChallenge(gameId, round.round, player.id, player.name);
    setForfeiting(false);
  };

  const retryAsDemeter = async () => {
    setRetrying(true);
    await unlockScoreForRetry(gameId, round.round, player.id);
    setAttemptKey((k) => k + 1);
    setRetrying(false);
  };

  if (isDigital && amCompeting) {
    // Already locked in a final score for this round (e.g. after a page
    // refresh) — show the result instead of restarting the mini-game
    // from scratch with fresh local state.
    if (myScore?.locked) {
      if (myScore.forfeited) {
        return (
          <Card style={{ marginBottom: 20, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🏳️</div>
            <p style={{ color: "#a68fd6", fontSize: 14, margin: 0 }}>You forfeited this battle.</p>
          </Card>
        );
      }
      // Demeter's character power (see lib/characterPowers.js): a
      // second attempt that outright replaces the first, once per
      // challenge. Not offered in a readOnly (host "view as") preview —
      // this unlocks and re-plays for real, same reasoning as every
      // other real write action in this file being readOnly-gated.
      const isDemeter = !readOnly && powerFor(player, settings) === "Demeter";
      const canRetry = isDemeter && !myScore.demeterRetried;
      return (
        <>
          <GameResultCard icon={registryEntry?.icon || "🎮"} title={`${registryEntry?.label || "Battle"} Complete`} valueLabel={String(myScore.value)} />
          {canRetry && (
            <Card style={{ marginBottom: 20, textAlign: "center" }}>
              <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 10px" }}>
                🌾 Demeter's power: you may make a second attempt — it will completely replace this result.
              </p>
              <Btn small onClick={retryAsDemeter} disabled={retrying}>
                {retrying ? "Preparing..." : "🌾 Retry (Demeter)"}
              </Btn>
            </Card>
          )}
        </>
      );
    }

    const GameComponent = GAME_COMPONENTS[challenge.gameType];
    if (GameComponent) {
      // A read-only viewer (the host "viewing as" this player) never
      // gets the actual interactive mini-game — clicking around inside
      // it would report real, final scores under this player's name.
      // Show their live progress (if any) as a plain status card instead.
      if (readOnly) {
        return (
          <Card style={{ marginBottom: 20, textAlign: "center" }}>
            <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#ff2d95", marginBottom: 6 }}>
              {registryEntry?.icon || "⚔️"} {registryEntry?.label || "Battle"}
            </div>
            <p style={{ color: "#f5f0ff", fontSize: 14, margin: 0 }}>
              {myScore ? "Currently playing — check the Current Round tab for their live score." : "Hasn't started playing yet."}
            </p>
          </Card>
        );
      }

      // Rules screen: the actual mini-game only mounts once the player
      // taps "Go" — this both gives them a chance to read how it's
      // played and keeps a fresh page load from silently dropping them
      // straight into a moving game.
      if (!readyToPlay) {
        return (
          <Card style={{ marginBottom: 20, textAlign: "center" }}>
            <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#ff2d95", marginBottom: 6 }}>
              {registryEntry?.icon || "⚔️"} {registryEntry?.label || "Battle"}
            </div>
            <h3 style={{ color: "#f5f0ff", margin: "0 0 8px", fontSize: 16, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>How to play</h3>
            <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 18px", lineHeight: 1.5 }}>{registryEntry?.blurb}</p>
            <Btn onClick={() => setReadyToPlay(true)}>Go ➜</Btn>
            <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 14, fontStyle: "italic" }}>
              {challenge.endsAt ? "The clock is already running — tap Go whenever you're ready to jump in." : "Tap Go whenever you're ready to jump in."}
            </p>
          </Card>
        );
      }
      return (
        <>
          {minimized && (
            <Card style={{ marginBottom: 20, textAlign: "center" }}>
              <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#ff2d95", marginBottom: 6 }}>
                {registryEntry?.icon || "⚔️"} {registryEntry?.label || "Battle"}
              </div>
              <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 14px" }}>
                Still in progress in the background — nothing's lost, come back whenever.
              </p>
              <Btn onClick={() => setMinimized(false)}>▶ Return to Battle</Btn>
            </Card>
          )}
          {/* Kept mounted even while minimized — see the minimized state's
              own comment above for why unmounting isn't an option here.
              display:none rather than a conditional return is what
              actually preserves it. */}
          <div style={{
            position: "fixed", inset: 0, background: "rgba(5,1,15,0.94)", zIndex: 900,
            display: minimized ? "none" : "flex", alignItems: "flex-start", justifyContent: "center",
            padding: "24px 12px", overflowY: "auto",
          }}>
            {/* Breaks out of the normal page's 400px-wide column entirely,
                and scales the whole thing up on top of that — a wider
                container alone wouldn't help games with small fixed-pixel
                grids (Whack-a-Mole's 70px holes, Minesweeper's 30px cells,
                etc.), since they'd just get more empty margin around an
                unchanged-size grid. The scale is what actually gives more
                real tap-target size everywhere, not just for the games
                that already resize responsively (like Breakout's canvas).
                Sized so 78vw/420px pre-scale times 1.28 lands at roughly
                99vw/538px post-scale — comfortably fits without triggering
                horizontal overflow on typical phone widths. */}
            <div style={{ width: "78vw", maxWidth: 420, transform: "scale(1.28)", transformOrigin: "center top", marginTop: 20 }}>
              <GameComponent key={attemptKey} gameId={gameId} round={round} challenge={challenge} player={player} players={players} />
              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 10 }}>
                <Btn small variant="ghost" onClick={() => setMinimized(true)}>↙ Minimize</Btn>
                <Btn small variant="ghost" onClick={forfeitDigital} disabled={forfeiting}>
                  {forfeiting ? "Forfeiting..." : "🏳️ Forfeit Battle"}
                </Btn>
              </div>
            </div>
          </div>
        </>
      );
    }
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#ff2d95", marginBottom: 6 }}>
        {registryEntry?.icon || "⚔️"} {registryEntry?.label || "Battle"}
      </div>
      {amCompeting ? (
        manuallyForfeited ? (
          <p style={{ color: "#a68fd6", fontSize: 14, margin: 0 }}>🏳️ You've forfeited this battle.</p>
        ) : (
          <>
            <p style={{ color: "#f5f0ff", fontSize: 15, margin: "0 0 6px" }}>You're competing!</p>
            {challenge.reentryAttemptIds?.includes(player.id) && <Badge color="#ff3860">Re-entry attempt — finish 1st to return</Badge>}
            {!readOnly && (
              <div style={{ marginTop: 12 }}>
                <Btn small variant="ghost" onClick={forfeitManual} disabled={forfeiting}>
                  {forfeiting ? "Forfeiting..." : "🏳️ Forfeit Battle"}
                </Btn>
              </div>
            )}
          </>
        )
      ) : player?.battleBanRound === round?.round ? (
        <p style={{ color: "#ff3860", fontSize: 14, margin: 0 }}>
          🚫 Barred from this battle — missed your {settings?.fatesDurationSec ? formatDurationHours(settings.fatesDurationSec) : "Fates"} nomination window last round, so the game auto-nominated for you and this is the consequence.
        </p>
      ) : (
        <p style={{ color: "#a68fd6", fontSize: 14, margin: 0 }}>Sitting this battle out — cheer everyone on!</p>
      )}
      <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 10, fontStyle: "italic" }}>
        The host will record results once the battle wraps up.
      </p>
    </Card>
  );
}

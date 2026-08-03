import { useState, useEffect } from "react";
import { Card, Badge } from "./ui";
import { subscribeGameState } from "../lib/gameStorage";
import { KEY_CHALLENGE } from "../lib/gameState";
import { subscribeReentry, setWantsToCompete } from "../lib/reentryData";
import { REENTRY_STATUS } from "../lib/reentryLogic";
import { subscribeScores } from "../lib/challengeScores";
import { GAME_REGISTRY } from "../lib/challengeGames";
import Match3Player from "./games/Match3Player";
import FroggerPlayer from "./games/FroggerPlayer";
import WordScramblePlayer from "./games/WordScramblePlayer";
import Maze2DPlayer from "./games/Maze2DPlayer";
import FarklePlayer from "./games/FarklePlayer";
import TriviaPlayer from "./games/TriviaPlayer";
import BreakoutPlayer from "./games/BreakoutPlayer";
import PlinkoPlayer from "./games/PlinkoPlayer";
import SpotDiffPlayer from "./games/SpotDiffPlayer";
import WhackMolePlayer from "./games/WhackMolePlayer";
import GameResultCard from "./games/GameResultCard";

const GAME_COMPONENTS = {
  match3: Match3Player,
  frogger: FroggerPlayer,
  wordscramble: WordScramblePlayer,
  maze2d: Maze2DPlayer,
  farkle: FarklePlayer,
  trivia: TriviaPlayer,
  breakout: BreakoutPlayer,
  plinko: PlinkoPlayer,
  spotdiff: SpotDiffPlayer,
  whackmole: WhackMolePlayer,
};

export default function ChallengePlayer({ gameId, player, round }) {
  const [challenge, setChallenge] = useState(null);
  const [reentry, setReentry] = useState([]);
  const [scores, setScores] = useState({});

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_CHALLENGE, setChallenge);
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsubscribe = subscribeReentry(gameId, setReentry);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    if (!round?.round) return;
    const unsubscribe = subscribeScores(gameId, round.round, setScores);
    return unsubscribe;
  }, [gameId, round?.round]);

  if (round?.phase !== "challenge") return null;

  const myReentry = reentry.find((r) => r.playerId === player?.id);
  const canOfferReentry = myReentry?.status === REENTRY_STATUS.PENDING && !challenge?.active;

  if (canOfferReentry) {
    const wants = myReentry.wantsToCompete === round.round;
    return (
      <Card style={{ marginBottom: 20, borderColor: "rgba(196,92,60,0.4)", textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🔥</div>
        <p style={{ color: "#f0e6d3", fontSize: 15, fontWeight: 600, margin: "0 0 6px", fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
          You have one shot at re-entry
        </p>
        <p style={{ color: "#a09080", fontSize: 13, margin: "0 0 14px" }}>
          If you believe you could finish 1st in this round's challenge, you can elect to compete. Come in 1st and you're back in the game — anything else, and you're out for good.
        </p>
        <button
          onClick={() => setWantsToCompete(gameId, player.id, round.round, !wants)}
          style={{
            background: wants ? "linear-gradient(135deg, #c45c3c, #9c3f26)" : "transparent",
            color: wants ? "#f0e6d3" : "#c45c3c", border: "1px solid #c45c3c",
            borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer",
            fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
          }}
        >
          {wants ? "✓ Requested — tap to withdraw" : "Request to compete this round"}
        </button>
        <p style={{ color: "#706050", fontSize: 11, marginTop: 10, fontStyle: "italic" }}>The host will confirm before the challenge starts.</p>
      </Card>
    );
  }

  if (!challenge?.active) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <p style={{ color: "#706050", fontSize: 13, fontStyle: "italic", margin: 0 }}>
          Waiting for the host to start this round's challenge.
        </p>
      </Card>
    );
  }

  const amCompeting = (challenge.participantIds || []).includes(player?.id);
  const isDigital = challenge.gameType && challenge.gameType !== "manual";
  const myScore = scores?.[player?.id];
  const registryEntry = GAME_REGISTRY[challenge.gameType];

  if (isDigital && amCompeting) {
    // Already locked in a final score for this round (e.g. after a page
    // refresh) — show the result instead of restarting the mini-game
    // from scratch with fresh local state.
    if (myScore?.locked) {
      return <GameResultCard icon={registryEntry?.icon || "🎮"} title={`${registryEntry?.label || "Challenge"} Complete`} valueLabel={String(myScore.value)} />;
    }
    const GameComponent = GAME_COMPONENTS[challenge.gameType];
    if (GameComponent) {
      return <GameComponent gameId={gameId} round={round} challenge={challenge} player={player} />;
    }
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#c9a84c", marginBottom: 6 }}>
        {registryEntry?.icon || "⚔️"} {registryEntry?.label || "Challenge"}
      </div>
      {amCompeting ? (
        <>
          <p style={{ color: "#f0e6d3", fontSize: 15, margin: "0 0 6px" }}>You're competing!</p>
          {challenge.reentryAttemptId === player.id && <Badge color="#c45c3c">Your one re-entry attempt</Badge>}
        </>
      ) : (
        <p style={{ color: "#a09080", fontSize: 14, margin: 0 }}>Sitting this challenge out — cheer everyone on!</p>
      )}
      <p style={{ color: "#706050", fontSize: 12, marginTop: 10, fontStyle: "italic" }}>
        The host will record results once the challenge wraps up.
      </p>
    </Card>
  );
}

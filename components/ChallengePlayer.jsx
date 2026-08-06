import { useState, useEffect } from "react";
import { Btn, Card, Badge } from "./ui";
import { subscribeGameState, storageUpdate } from "../lib/gameStorage";
import { KEY_CHALLENGE } from "../lib/gameState";
import { subscribeReentry, setWantsToCompete } from "../lib/reentryData";
import { REENTRY_STATUS } from "../lib/reentryLogic";
import { subscribeScores, forfeitChallenge } from "../lib/challengeScores";
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

export default function ChallengePlayer({ gameId, player, round, readOnly = false }) {
  const [challenge, setChallenge] = useState(null);
  const [reentry, setReentry] = useState([]);
  const [scores, setScores] = useState({});
  const [readyToPlay, setReadyToPlay] = useState(false);
  const [forfeiting, setForfeiting] = useState(false);

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

  // A brand new challenge (new round, or the host re-starting one) always
  // needs the rules screen shown again — clicking "Go" on a previous
  // challenge shouldn't let a player skip straight past the next one.
  useEffect(() => {
    setReadyToPlay(false);
  }, [gameId, round?.round, challenge?.startedAt]);

  if (round?.phase !== "challenge") return null;

  const myReentry = reentry.find((r) => r.playerId === player?.id);
  const canOfferReentry = myReentry?.status === REENTRY_STATUS.PENDING && !challenge?.active;

  if (canOfferReentry) {
    const wants = myReentry.wantsToCompete === round.round;
    return (
      <Card style={{ marginBottom: 20, borderColor: "rgba(255,56,96,0.4)", textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🔥</div>
        <p style={{ color: "#f5f0ff", fontSize: 15, fontWeight: 600, margin: "0 0 6px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
          Has one shot at re-entry
        </p>
        {readOnly ? (
          <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
            {wants ? "✓ Has requested to compete this round." : "Hasn't requested to compete this round yet."}
          </p>
        ) : (
          <>
            <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 14px" }}>
              If you believe you could finish 1st in this round's challenge, you can elect to compete. Come in 1st and you're back in the game — anything else, and you're out for good.
            </p>
            <button
              onClick={() => setWantsToCompete(gameId, player.id, round.round, !wants)}
              style={{
                background: wants ? "linear-gradient(135deg, #ff3860, #c9184a)" : "transparent",
                color: wants ? "#f5f0ff" : "#ff3860", border: "1px solid #ff3860",
                borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer",
                fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
              }}
            >
              {wants ? "✓ Requested — tap to withdraw" : "Request to compete this round"}
            </button>
            <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 10, fontStyle: "italic" }}>The host will confirm before the challenge starts.</p>
          </>
        )}
      </Card>
    );
  }

  if (!challenge?.active) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic", margin: 0 }}>
          Waiting for the host to start this round's challenge.
        </p>
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
    if (!confirm("Forfeit this challenge? This can't be undone once the challenge is over.")) return;
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
    if (!confirm("Forfeit this challenge? This can't be undone, and you'll be ranked last.")) return;
    setForfeiting(true);
    await forfeitChallenge(gameId, round.round, player.id, player.name);
    setForfeiting(false);
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
            <p style={{ color: "#a68fd6", fontSize: 14, margin: 0 }}>You forfeited this challenge.</p>
          </Card>
        );
      }
      return <GameResultCard icon={registryEntry?.icon || "🎮"} title={`${registryEntry?.label || "Challenge"} Complete`} valueLabel={String(myScore.value)} />;
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
              {registryEntry?.icon || "⚔️"} {registryEntry?.label || "Challenge"}
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
              {registryEntry?.icon || "⚔️"} {registryEntry?.label || "Challenge"}
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
          <GameComponent gameId={gameId} round={round} challenge={challenge} player={player} />
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <Btn small variant="ghost" onClick={forfeitDigital} disabled={forfeiting}>
              {forfeiting ? "Forfeiting..." : "🏳️ Forfeit Challenge"}
            </Btn>
          </div>
        </>
      );
    }
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#ff2d95", marginBottom: 6 }}>
        {registryEntry?.icon || "⚔️"} {registryEntry?.label || "Challenge"}
      </div>
      {amCompeting ? (
        manuallyForfeited ? (
          <p style={{ color: "#a68fd6", fontSize: 14, margin: 0 }}>🏳️ You've forfeited this challenge.</p>
        ) : (
          <>
            <p style={{ color: "#f5f0ff", fontSize: 15, margin: "0 0 6px" }}>You're competing!</p>
            {challenge.reentryAttemptIds?.includes(player.id) && <Badge color="#ff3860">Your one re-entry attempt</Badge>}
            {!readOnly && (
              <div style={{ marginTop: 12 }}>
                <Btn small variant="ghost" onClick={forfeitManual} disabled={forfeiting}>
                  {forfeiting ? "Forfeiting..." : "🏳️ Forfeit Challenge"}
                </Btn>
              </div>
            )}
          </>
        )
      ) : (
        <p style={{ color: "#a68fd6", fontSize: 14, margin: 0 }}>Sitting this challenge out — cheer everyone on!</p>
      )}
      <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 10, fontStyle: "italic" }}>
        The host will record results once the challenge wraps up.
      </p>
    </Card>
  );
}

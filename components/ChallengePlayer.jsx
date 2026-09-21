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
import WordScrambleTvPlayer from "./games/WordScrambleTvPlayer";
import SimonTvPlayer from "./games/SimonTvPlayer";
import MusicalChairsTvPlayer from "./games/MusicalChairsTvPlayer";
import EyesInTheSystemPlayer from "./games/EyesInTheSystemPlayer";
import EyesInTheSystemTvPlayer from "./games/EyesInTheSystemTvPlayer";
import BalloonoTvPlayer from "./games/BalloonoTvPlayer";
import LaurelThiefPlayer from "./games/LaurelThiefPlayer";
import LaurelThiefTvPlayer from "./games/LaurelThiefTvPlayer";
import WagerTriviaTvPlayer from "./games/WagerTriviaTvPlayer";
import TartarusTreadmillTvPlayer from "./games/TartarusTreadmillTvPlayer";
import SpyfallPlayer from "./games/SpyfallPlayer";
import AcrophobiaTvPlayer from "./games/AcrophobiaTvPlayer";
import MiniGolfTvPlayer from "./games/MiniGolfTvPlayer";
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
import SandsOfTimePlayer from "./games/SandsOfTimePlayer";
import SlidingPuzzlePlayer from "./games/SlidingPuzzlePlayer";
import LifesTapestryPlayer from "./games/LifesTapestryPlayer";
import TorchedPlayer from "./games/TorchedPlayer";
import ChainsPlayer from "./games/ChainsPlayer";
import LabyrinthPlayer from "./games/LabyrinthPlayer";
import OraclesSealPlayer from "./games/OraclesSealPlayer";
import ScavengerHuntPlayer from "./games/ScavengerHuntPlayer";
import HuePlayer from "./games/HuePlayer";
import OperatorPlayer from "./games/OperatorPlayer";
import TavoPlayer from "./games/TavoPlayer";
import TanglePlayer from "./games/TanglePlayer";
import BloomPlayer from "./games/BloomPlayer";
import HermesGraspPlayer from "./games/HermesGraspPlayer";
import PandorasBoxesPlayer from "./games/PandorasBoxesPlayer";
import MusicalChairsPlayer from "./games/MusicalChairsPlayer";
import FloorPlayer from "./games/FloorPlayer";
import BasketballPlayer from "./games/BasketballPlayer";
import PegasusFlightPlayer from "./games/PegasusFlightPlayer";
import StackPlayer from "./games/StackPlayer";
import StockMarketPlayer from "./games/StockMarketPlayer";
import ArtAuctionPlayer from "./games/ArtAuctionPlayer";
import SeasonTriviaPlayer from "./games/SeasonTriviaPlayer";
import TimelinePlayer from "./games/TimelinePlayer";
import MysteryButtonPlayer from "./games/MysteryButtonPlayer";
import GoldenFleecePlayer from "./games/GoldenFleecePlayer";
import RiverStyxPlayer from "./games/RiverStyxPlayer";
import WineDarkSeaPlayer from "./games/WineDarkSeaPlayer";
import MinotaurMazePlayer from "./games/MinotaurMazePlayer";
import MajorityRulesPlayer from "./games/MajorityRulesPlayer";
import MajorityRulesTvPlayer from "./games/MajorityRulesTvPlayer";
import TriggerHappyPlayer from "./games/TriggerHappyPlayer";
import TriggerHappyTvPlayer from "./games/TriggerHappyTvPlayer";
import GodsAndGambitsPlayer from "./games/GodsAndGambitsPlayer";
import GameResultCard from "./games/GameResultCard";

// Game types where a genuine "more room to tap/click/swipe" fullscreen
// mode actually helps — fast-reflex, precision-tap, drag or trace
// games (Whack-a-Mole and its arcade/speed/precision siblings) — as
// opposed to slower-paced or reading-heavy games (Trivia, Pandora's
// Boxes, Art Auction, Stock Market, negotiation/social games, ...)
// where blowing the same content up bigger would just be visual
// clutter, not a real gameplay improvement. The underlying fullscreen
// MECHANISM below (the `fullscreen` state + wrapper styling) works for
// any gameType — this set only controls which games are offered the
// "⛶ Fullscreen" entry point at all, so a game not worth it here isn't
// stopped from getting the button later just by adding its key below.
// Deliberately excludes the six big-screen strategy/board games this
// task was told not to touch (Trigger Happy, Majority Rules, Golden
// Fleece, River Styx, Wine-Dark Sea, Minotaur's Maze) and their TV
// variants, plus every other TV-companion phone view (e.g.
// wordscrambletv, simontv) — those already split their real
// gameplay across a shared screen, so blowing up just the phone half
// isn't the same win it is for a fully-on-phone game.
export const FULLSCREEN_ELIGIBLE_GAMES = new Set([
  "whackmole", "match3", "frogger", "breakout", "plinko", "basketball", "stack", "snake",
  "minesweeper", "spotdiff", "pegasusflight", "simon", "eyesinthesystem", "balloono",
  "laurelthief", "tartarustreadmill", "boggle", "metronome", "stroop", "redlightgreenlight",
  "slidingpuzzle", "lifestapestry", "torched", "labyrinth", "oraclesseal", "operator",
  "tavo", "tangle", "bloom", "hermesgrasp", "musicalchairs", "maze2d", "mazeinvisible",
  "mazetrivia", "wordscramble", "sandsoftime", "hue", "minigolf",
]);

export const GAME_COMPONENTS = {
  match3: Match3Player,
  frogger: FroggerPlayer,
  wordscramble: WordScramblePlayer,
  wordscrambletv: WordScrambleTvPlayer,
  simontv: SimonTvPlayer,
  musicalchairstv: MusicalChairsTvPlayer,
  eyesinthesystem: EyesInTheSystemPlayer,
  eyesinthesystemtv: EyesInTheSystemTvPlayer,
  balloono: BalloonoTvPlayer,
  laurelthief: LaurelThiefPlayer,
  laurelthieftv: LaurelThiefTvPlayer,
  wagertriviatv: WagerTriviaTvPlayer,
  tartarustreadmill: TartarusTreadmillTvPlayer,
  spyfall: SpyfallPlayer,
  acrophobia: AcrophobiaTvPlayer,
  minigolf: MiniGolfTvPlayer,
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
  sandsoftime: SandsOfTimePlayer,
  slidingpuzzle: SlidingPuzzlePlayer,
  lifestapestry: LifesTapestryPlayer,
  lifestapestrytv: LifesTapestryPlayer,
  torched: TorchedPlayer,
  chains: ChainsPlayer,
  labyrinth: LabyrinthPlayer,
  oraclesseal: OraclesSealPlayer,
  scavengerhunt: ScavengerHuntPlayer,
  hue: HuePlayer,
  operator: OperatorPlayer,
  tavo: TavoPlayer,
  tangle: TanglePlayer,
  bloom: BloomPlayer,
  hermesgrasp: HermesGraspPlayer,
  pandorasboxes: PandorasBoxesPlayer,
  musicalchairs: MusicalChairsPlayer,
  floor: FloorPlayer,
  basketball: BasketballPlayer,
  pegasusflight: PegasusFlightPlayer,
  stack: StackPlayer,
  stockmarket: StockMarketPlayer,
  artauction: ArtAuctionPlayer,
  seasontrivia: SeasonTriviaPlayer,
  timeline: TimelinePlayer,
  mysterybutton: MysteryButtonPlayer,
  goldenfleece: GoldenFleecePlayer,
  riverstyx: RiverStyxPlayer,
  winedarksea: WineDarkSeaPlayer,
  minotaurmaze: MinotaurMazePlayer,
  majorityrules: MajorityRulesPlayer,
  majorityrulestv: MajorityRulesTvPlayer,
  triggerhappy: TriggerHappyPlayer,
  triggerhappytv: TriggerHappyTvPlayer,
  godsandgambits: GodsAndGambitsPlayer,
};

export default function ChallengePlayer({ gameId, player, players, round, settings, readOnly = false, challengeHistory, exileHistory }) {
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
  // Opt-in "give me more room" mode for tap/click/swipe-heavy games —
  // see FULLSCREEN_ELIGIBLE_GAMES above for which games offer this at
  // all. Deliberately just a style toggle on the SAME mounted overlay
  // below, never a different render tree — GameComponent itself never
  // unmounts/remounts when this flips, so its live state (timer,
  // score, in-progress moves, ...) survives the transition exactly
  // like it already does across the minimize/restore toggle above.
  // Defaults off: this is something a player reaches for mid-game when
  // they want it, never forced on them.
  const [fullscreen, setFullscreen] = useState(false);
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
    setFullscreen(false);
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
                🌾 Power of Redemption (Demeter): you may make a second attempt — it will completely replace this result.
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
      const canGoFullscreen = FULLSCREEN_ELIGIBLE_GAMES.has(challenge.gameType);
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
          {/* Kept mounted even while minimized (AND while toggling
              fullscreen on/off) — see the minimized state's own comment
              above for why unmounting isn't an option here. This whole
              block is one continuous element tree; only inline styles
              below ever change between the normal/minimized/fullscreen
              looks, so GameComponent itself is never remounted and its
              own internal state (timer, score, in-progress board, ...)
              rides straight through every transition. display:none
              rather than a conditional return is what actually preserves
              it across minimize/restore. */}
          <div style={{
            position: "fixed", inset: 0, background: "rgba(5,1,15,0.94)", zIndex: 900,
            display: minimized ? "none" : "flex", flexDirection: "column",
            alignItems: "stretch", justifyContent: "flex-start",
            padding: fullscreen ? 0 : "24px 12px", overflow: "hidden",
          }}>
            {/* Fullscreen's own slim header bar — keeps the battle's
                identity and an always-reachable exit visible above the
                game itself, never something a player has to hunt for
                behind the game's own UI. Only rendered in fullscreen; the
                normal view already shows this same info on the rules
                screen just before the game mounts. */}
            {fullscreen && (
              <div style={{
                flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 10, padding: "10px 14px", background: "rgba(10,4,22,0.96)", borderBottom: "1px solid #3d1f5c",
              }}>
                <div style={{ fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: "#ff2d95", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {registryEntry?.icon || "⚔️"} {registryEntry?.label || "Battle"}
                </div>
                <Btn small variant="ghost" onClick={() => setFullscreen(false)}>⤡ Exit Fullscreen</Btn>
              </div>
            )}
            <div style={{
              flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: fullscreen ? "center" : "flex-start",
            }}>
              {/* Breaks out of the normal page's 400px-wide column
                  entirely, and blows the whole thing up on top of that
                  — a wider container alone wouldn't help games with
                  small fixed-pixel grids (Whack-a-Mole's 70px holes,
                  Minesweeper's 30px cells, etc.), since they'd just get
                  more empty margin around an unchanged-size grid. The
                  enlargement is what actually gives more real tap-target
                  size everywhere, not just for the games that already
                  resize responsively (like Breakout's canvas).
                  Non-fullscreen is sized so 78vw/420px pre-zoom times
                  1.28 lands at roughly 99vw/538px post-zoom —
                  comfortably fits without triggering horizontal overflow
                  on typical phone widths. Fullscreen drops the 420px cap
                  and pushes the zoom further — worth little extra on a
                  narrow phone (already near full width above) but a
                  real gain on a tablet/desktop browser, where the capped
                  version otherwise leaves most of the screen empty.

                  Uses CSS `zoom` here rather than `transform: scale()`.
                  This block sits inside a `overflow-y: auto` scrolling
                  ancestor (the wrapper above), and `transform: scale()`
                  on an element nested inside a scrolled container is a
                  known iOS Safari/WebKit touch hit-testing bug: WebKit's
                  touch/tap hit-testing can get misaligned with the
                  transformed element's actual painted position — worse
                  the further the ancestor has been scrolled — even
                  though everything still LOOKS right, so taps silently
                  land on the wrong coordinates or nowhere at all. This
                  is exactly what a player reported on iPhone with
                  Colorful Language (stroop): the game rendered fine but
                  tapping the answer buttons did nothing. `zoom` doesn't
                  have this bug because it's a real layout-affecting
                  zoom (like changing effective px), not a paint-time
                  transform — the element's actual box size, and
                  everything WebKit hit-tests against including
                  getBoundingClientRect(), reflects the zoomed size
                  directly, so taps land exactly where the content is
                  drawn. `zoom` is non-standard CSS but has long, solid
                  support in both WebKit and Chromium (i.e. exactly the
                  two engines a Capacitor WebView on iOS/Android is built
                  on), so it works the same inside the wrapped app as it
                  does in a normal mobile browser. Verified safe for
                  every game this button is offered for (see
                  FULLSCREEN_ELIGIBLE_GAMES): the DOM/CSS-grid games
                  (Whack-a-Mole, Minesweeper, Match3, ...) just reflow
                  with the container like any other CSS, and their taps
                  are ordinary DOM hit-testing against the (correctly
                  zoomed) painted position; the canvas games that map
                  taps to in-game coordinates (Breakout, Basketball,
                  Spot the Difference) already recompute that mapping
                  from the canvas's LIVE getBoundingClientRect() on every
                  pointer event rather than caching it at mount — and
                  unlike transform:scale(), zoom is exactly the case
                  getBoundingClientRect() is built to reflect correctly,
                  so this is actually SAFER for those games' click math
                  than the old transform ever was, not just equivalent;
                  and the canvas games with no such mapping at all
                  (Plinko's arrow buttons, Stack's tap-anywhere-to-drop,
                  Snake's swipe deltas) have nothing to desync in the
                  first place. */}
              <div style={{
                width: fullscreen ? "94vw" : "78vw",
                maxWidth: fullscreen ? 900 : 420,
                zoom: fullscreen ? 1.55 : 1.28,
                marginTop: fullscreen ? 12 : 20,
                marginBottom: fullscreen ? 24 : 0,
              }}>
                <GameComponent key={attemptKey} gameId={gameId} round={round} challenge={challenge} player={player} players={players} challengeHistory={challengeHistory} exileHistory={exileHistory} settings={settings} />
                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 10, flexWrap: "wrap" }}>
                  <Btn small variant="ghost" onClick={() => setMinimized(true)}>↙ Minimize</Btn>
                  {canGoFullscreen && !fullscreen && (
                    <Btn small variant="ghost" onClick={() => setFullscreen(true)}>⛶ Fullscreen</Btn>
                  )}
                  <Btn small variant="ghost" onClick={forfeitDigital} disabled={forfeiting}>
                    {forfeiting ? "Forfeiting..." : "🏳️ Forfeit Battle"}
                  </Btn>
                </div>
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

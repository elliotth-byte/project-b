import { GAME_TYPES, GAME_REGISTRY } from "./challengeGames";

// ─── In-app rules ───
// Replaces the old external Google Doc link (see HelpPanel.jsx) — kept
// as data specifically so this can actually stay in sync with the game
// as mechanics change, rather than drifting out of date the way an
// external doc easily could. Each mini-game's blurb below is pulled
// LIVE from lib/challengeGames.js's own registry rather than duplicated
// here by hand — if a game's mechanics or scoring ever change, this
// section updates itself automatically instead of needing a second edit
// somewhere else to stay accurate.
export const RULES_SECTIONS = [
  {
    title: "🏛 Overview",
    body: `Each round cycles through the same four phases: a Battle, a Fates Ceremony, an Exile Vote, and — once it's down to the final few — the Finale.

Win Battles, avoid nominations, survive votes. Last person standing wins.`,
  },
  {
    title: "⚔️ The Battle",
    body: `Everyone alive competes in a Battle — sometimes a digital mini-game, sometimes something run in person with results entered by hand. Whoever finishes 1st wins immunity for the round: they can't be nominated for exile.

The top 3 finishers become this round's nominators for the Fates Ceremony that follows — including whoever won.`,
  },
  {
    title: "⚖️ The Fates Ceremony",
    body: `The top 3 finishers from the Battle each nominate one player for possible exile — in finishing order, so the winner goes first, then 2nd place, then 3rd.

A few rules on nominating:
• You can't nominate yourself.
• Nobody can nominate the Battle winner — they're immune this round.
• All three nominees have to be different people — you can see who's already been picked live, and can't duplicate someone else's choice.

If any of the three nominators doesn't submit their own nomination within the season's configured time limit for this phase, the game picks a valid target on their behalf automatically — and bars THEM from competing in next round's Battle as the consequence for not deciding in time. Applies equally whether it's the winner, 2nd, or 3rd place who misses their window.`,
  },
  {
    title: "🗳️ The Exile Vote",
    body: `Every remaining player votes on which of the nominees to exile. Most votes among the nominees loses — they're out.

The Power of Khaos is also up for grabs this round (see below) — whoever draws it can secretly protect one nominee from being exiled no matter how many votes they get.

If there's a tie for the most votes, the Power of Khaos holder breaks it.`,
  },
  {
    title: "🃏 The Power of Khaos",
    body: `Once per Exile Vote (and once per Finale vote), every eligible player gets a single shot at secretly drawing the Power of Khaos — a set of mythological relics (Pandora's Box, Eris' Apple, Troy's Horse, and others), one of which is secretly the "correct" one. Whoever draws it becomes the holder for that vote.

The holder can protect one nominee from elimination entirely — that nominee's votes against them are wiped out, guaranteeing they survive the round no matter how many votes they actually got. Nobody else finds out who the holder was or who they protected until the vote is revealed.`,
  },
  {
    title: "🔥 Re-Entry",
    body: `Every exiled player gets exactly ONE shot at returning to the game, ever. For each Battle that happens while that shot is still unused, they choose — deliberately, on their own screen — whether to compete in that specific Battle for a chance to return.

Finish 1st in a Battle you've opted into, and you're back in the game. Anything else, and that was your one shot — you're out for good. Not deciding in time just counts as sitting that particular Battle out; it costs nothing and you'll get to decide again next time.

A successful return turns that same round's Exile Vote into a double-elimination round.`,
  },
  {
    title: "⚠️ Double Elimination",
    body: `Triggered automatically whenever someone successfully re-enters the game — that round's Exile Vote flips from voting to ELIMINATE a nominee to voting to SAVE one instead.

Everyone votes for which nominee to save. The nominee with the fewest save-votes is eliminated — and if the Power of Khaos holder protects a different nominee that round, that protected nominee's votes are wiped to zero, guaranteeing THEY'RE also eliminated. Two people go home instead of one.`,
  },
  {
    title: "🏆 The Finale",
    body: `Once the game's down to its final few, the Battle phase stops and the Finale begins. Voting opens right away — the jury (every exiled player who didn't quit or get removed) votes for a winner throughout, while finalists write a statement and answer jury questions the whole time voting is running, not as a separate step beforehand.

The Power of Khaos is up for grabs among the jury too — the holder can wipe one finalist's votes entirely, guaranteeing they finish no better than 3rd regardless of how they actually polled.`,
  },
  {
    title: "🎥 Confessionals",
    body: `A private space to reflect, in response to prompts the host sets (or just whenever you want to say something). Only you and the host can see what you write — nobody else in the game ever does.`,
  },
  {
    title: "💬 Chat",
    body: `Panopticon is the group chat everyone shares. You can also start direct messages with one or more other players, and react to any message with an emoji.

Once you're exiled, Panopticon and regular DMs close — you'll only see the Exile Room, a shared space for everyone who's been voted out.

Some Battles briefly lock chat for players actively competing in them, specifically when the challenge itself pulls from chat history or would let someone tip off a still-playing opponent — it unlocks automatically the moment you're done.`,
  },
  {
    title: "🎭 Aliases & Avatars",
    body: `Depending on how this season's set up, you may play under an alias instead of your real name, and/or have an avatar shown instead of (or alongside) your name. If aliases are on, other players only ever see your alias — never your real identity — until the season ends.`,
  },
  {
    title: "🔔 Notifications",
    body: `Entirely optional — turn them on from this Help tab if you want a push notification for round changes and/or new messages, even when the app's closed. Nothing is ever turned on for you automatically.`,
  },
  {
    title: "🎮 The Battles, One By One",
    body: null, // rendered specially below — see HelpPanel.jsx
  },
];

// Pulled live from the registry (see file header) rather than
// hand-duplicated — always reflects whatever's actually playable right
// now, including anything added after this file was last touched.
export function battleList() {
  return Object.values(GAME_TYPES)
    .filter((type) => type !== GAME_TYPES.MANUAL)
    .map((type) => GAME_REGISTRY[type])
    .filter(Boolean);
}

// ─── Stereo Types' own rules ───
// Same in-app-not-external-doc reasoning as RULES_SECTIONS above, and
// same accordion presentation (see components/RulesAccordion.jsx,
// mounted for Stereo Types via components/StereoTypesRulesPanel.jsx) —
// but genuinely separate content, not a re-skin of Project B's: Stereo
// Types has no Battles/Fates/Exile/Khaos/Finale at all, three entirely
// different named rounds instead (A Side, The Remix, On Blast — see
// lib/stereoTypesASide.js, lib/stereoTypesRemix.js, and
// lib/stereoTypesOnBlast.js, each of which this summarizes from,
// deliberately at "what a player needs to know to play," not every
// implementation-level judgment call those files' own header comments
// document for their own reasons).
export const STEREO_TYPES_RULES_SECTIONS = [
  {
    title: "📻 Overview",
    body: `Three rounds — A Side, The Remix, then On Blast — each one a different spin on the same idea: guessing which real person is behind an anonymous clue. Points carry across all three; whoever has the most when On Blast finishes wins the season.

Everyone plays every round — there's no elimination, no exile, nobody sits out.`,
  },
  {
    title: "🅰️ Round 1 — A Side",
    body: `You're dealt one random superlative ("Most likely to..."). Privately rank every player, including yourself, from MOST to LEAST it applies to them — nobody sees anyone else's list yet.

Once everyone's submitted, every list is shown to everyone, anonymized — you don't see whose is whose. Your job: guess which real player wrote each one. Every other player's name gets used exactly once (you already know which list is your own, so that one's free). Flag exactly one guess as "pumped up" for double points if it's right.

Scoring: 1 point for each other list you guess correctly (2 if it was your pumped guess). Separately, 1 point for everyone who guesses YOUR list correctly, regardless of whether they pumped it.`,
  },
  {
    title: "🔁 Round 2 — The Remix",
    body: `The reverse of A Side. You're dealt someone's RANKING (a random shuffle, not anything a real person actually ranked) with no name attached, and shown the same shared list of candidate superlatives everyone else sees this round. Pick whichever superlative you think best explains that ranking — no restriction on repeats, it's fine if several players land on the same pick.

Once everyone's picked, every (ranking, pick) pair is revealed anonymized, same guessing format as A Side — one guess per pair, no repeats, one pumped guess for extra points.

Scoring is exactly like A Side's, just doubled: 2 points per correct guess (4 if pumped), 2 points to whoever guessed your own pair correctly.`,
  },
  {
    title: "🎤 Round 3 — On Blast",
    body: `You're dealt THREE candidate superlatives, personalized to you. Pick whichever one you want, then rank every player by it, same as A Side.

Once everyone's submitted, you're randomly paired up with exactly one other player — you're their "bidder," they're yours, and every pairing is different. As a bidder, you privately see your partner's ranking and their original 3 candidates, then place a bid — any non-negative number of points, no cap — before guessing which of their 3 candidates they actually picked.

The size of your bid is a real trade-off: the bigger you bid, the harder your own guess gets — a big bid mixes in decoy superlatives and hides some of the player names on the ranking you're looking at, so you're betting more while seeing less. Guess right, and you win your full bid (your partner also gets a flat bonus for having guessed-about them). Guess wrong, and you LOSE your bid — a real deduction, not just a missed opportunity.

Once every pairing's bid and guess is in, everything's revealed to everyone: every true pick, every bid, every guess, every outcome.`,
  },
  {
    title: "💡 Submitting a superlative",
    body: `Got an idea for a superlative you'd like to see in a future game? You can suggest one — it goes to a platform admin for approval before it's ever added to the shared pool future rounds deal from. One pending suggestion at a time; submit another once your current one's been decided.`,
  },
  {
    title: "🎧 Your Boombox",
    body: `Your identity this season is a boombox, not an avatar photo — pick a color when you join (first come, first served — everyone in the room gets a different one), and if you've ever won a Stereo Types season before, you may also have a sticker or two to show off on it.`,
  },
  {
    title: "🎵 Music",
    body: `The host can optionally connect their own Spotify to play music everyone hears described live — the title screen's skyline reacts to whatever's playing (the windows pulse, the scroll speeds up) whether or not Spotify's connected. Nothing about playing the game itself requires it.`,
  },
  {
    title: "💬 Chat",
    body: `One shared group chat for the whole room, plus direct messages with one or more other players — react to any message with an emoji. Always available; nothing about it locks during a round the way it briefly can in other seasons.`,
  },
];

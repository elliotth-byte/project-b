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

If the Battle winner doesn't submit their own nomination within the season's configured time limit for this phase, the game picks a valid target for them automatically — and bars them from competing in next round's Battle as the consequence for not deciding in time.`,
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

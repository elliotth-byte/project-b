// ─── Stereo Types — superlative pool ───
// Round 1 ("A Side") deals one of these to each player at random; the
// player then ranks the whole room by how much it applies to them,
// most to least (see lib/stereoTypesASide.js for the dealing/ranking
// logic itself — this file is deliberately just the plain-data list,
// same "catalog file with no rendering/logic in it" split
// lib/stereoTypesStickers.js already uses).
//
// Shared export on purpose: Round 2 ("The Remix") is a later phase, not
// built here, but the spec for it also revolves around superlatives —
// rather than that phase inventing its own separate pool (and the two
// drifting out of sync over time), it should import SUPERLATIVES from
// here too.
//
// Extension point for a later phase: user-submitted superlatives (with
// moderation) aren't built yet, but when they land, the intent is for
// them to get appended to this same array at load time — e.g.
// `[...SUPERLATIVES, ...approvedUserSubmissions]` wherever a game
// actually deals from the pool — rather than living in a separate pool
// games have to remember to also check. Nothing here needs to change to
// support that; it's just how this array is meant to get consumed.
//
// Kept PG-13 and squarely "party game with people you know" — nothing
// that reads as genuinely mean, just silly/specific enough to prompt a
// laugh and a "okay yeah, that's definitely someone."
export const SUPERLATIVES = [
  "Most likely to shoplift an avocado",
  "Most likely to start a fight at a wedding",
  "Most likely to become a cult leader",
  "Most likely to get lost in their own neighborhood",
  "Most likely to cry during a car commercial",
  "Most likely to fake an accent for a week",
  "Most likely to win the lottery and lose the ticket",
  "Most likely to name a pet after an ex",
  "Most likely to get kicked out of a casino",
  "Most likely to accidentally join a pyramid scheme",
  "Most likely to survive a zombie apocalypse purely on vibes",
  "Most likely to talk their way out of a speeding ticket",
  "Most likely to forget their own birthday",
  "Most likely to become internet famous by accident",
  "Most likely to bring up a conspiracy theory unprompted",
  "Most likely to microwave fish at the office",
  "Most likely to marry someone they met on a layover",
  "Most likely to text an ex at 2am",
  "Most likely to start a band that never plays a show",
  "Most likely to get emotional over a group chat meme",
  "Most likely to end up on a reality TV show",
  "Most likely to over-explain a simple lie",
  "Most likely to adopt way too many pets",
  "Most likely to win an argument with a vending machine",
  "Most likely to become a regular somewhere shady",
  "Most likely to plan a heist just to see if it'd work",
  "Most likely to ghost their own surprise party",
  "Most likely to get a tattoo they regret within a year",
  "Most likely to fall asleep during a movie they picked",
  "Most likely to become suspiciously good at karaoke",
  "Most likely to start a road trip with no plan",
  "Most likely to accidentally start a cult-adjacent book club",
  "Most likely to win a fight they started by accident",
  "Most likely to cry laughing at their own joke",
  "Most likely to be banned from a group chat",
  "Most likely to become the villain of their own story",
  "Most likely to survive being stranded on a desert island",
  "Most likely to get way too competitive at board games",
  "Most likely to become a conspiracy theorist about the group chat",
  "Most likely to charm their way into a free upgrade",
  "Most likely to get recognized somewhere they've never been",
  "Most likely to try to return something clearly used",
  "Most likely to end up as someone's emergency contact by mistake",
  "Most likely to start a rumor about themselves for fun",
  "Most likely to win a dance-off they didn't know they were in",
  "Most likely to become a strangely intense hobbyist overnight",
  "Most likely to talk to strangers like old friends",
  "Most likely to get kicked out of an all-you-can-eat buffet",
  "Most likely to negotiate down a price that's already fair",
  "Most likely to start crying at their own going-away party",
  "Most likely to become the group's unofficial tour guide",
  "Most likely to accidentally become someone's rebound",
  "Most likely to win a staring contest with a baby and lose on purpose",
  "Most likely to make a group project entirely about themselves",
  "Most likely to become weirdly territorial about a parking spot",
  "Most likely to start a petty feud over a board game rule",
];

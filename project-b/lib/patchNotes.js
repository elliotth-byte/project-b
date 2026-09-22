// ─── Patch Notes ───
// A plain, hand-maintained list — not auto-generated from commits or
// git history, since most of what actually changes under the hood
// (a comment, a refactor, an internal data-model shift) isn't
// something a player should ever need to see. Each entry here is a
// deliberately-written, player-facing summary of what actually
// changed for THEM, in plain language — not a changelog of files
// touched. New entries go at the TOP of the array (most recent first)
// — pages/patch-notes.jsx renders this list in the order given here,
// it doesn't sort by date itself.
export const PATCH_NOTES = [
  {
    date: "September 2026",
    title: "Battles, powers, and a smarter Torched",
    items: [
      "Torched (the shared-grid battleship game) now runs for the round's normal time limit instead of potentially forever, and switched from one-player-at-a-time turns to everyone calling their shot simultaneously each round.",
      "Hosts can now watch the Torched board live as a battle plays out — hits, misses, and who's still standing — without spoiling anyone's hidden marker.",
      "You'll now get a notification the moment a Battle actually goes live, not just when the round begins.",
      "Apollo's power (a second vote at Exile) is now fully working, including on the host's own voting sheet.",
      "Fixed several other character powers that were quietly not working as intended.",
      "Fixed the Fates Ceremony occasionally asking someone to submit a nomination twice.",
      "If you're eliminated, win your way back in, and are eliminated again later, you can now attempt re-entry again instead of that door being permanently closed.",
      "Fixed Exile Votes sometimes getting stuck open when a player's power meant they couldn't vote that round.",
      "The voting history table is now fully scrollable on mobile instead of getting cut off at the edge of the screen.",
      "Traitors seasons can now run on a real day-by-day schedule instead of an open-ended free-for-all, including an optional work-day mode that pauses the game outside business hours.",
    ],
  },
  {
    date: "Previous update",
    title: "Onboarding, moderation, and general polish",
    items: [
      "New players now get a quick onboarding checklist and a mini profile popup to help them get oriented.",
      "Added Practice Mode so you can try most games solo before playing them for real.",
      "Redesigned The Agora's trading so you choose who you trade with, not just what.",
      "Added message reporting and player blocking in chat, plus a content filter and a Terms & Community Guidelines page.",
      "Fixed sound and ending issues in Simon, a double-tap bug in Stack, and several iOS scrolling/tapping issues.",
      "Hephaestus's challenge pick now has a fallback if he doesn't decide in time, and can be made a full round ahead of when it's needed.",
    ],
  },
];

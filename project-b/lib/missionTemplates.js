// Flavor-text "mission briefing" for each mini-game — purely descriptive
// and postable/schedulable to Slack; posting one of these never starts or
// affects the actual challenge (that still happens from the Challenges
// tab). Ported from the original artifact's MISSION_TEMPLATES, renamed to
// match the in-app challenge names 1:1.
export const MISSION_TEMPLATES = [
  {
    id: "word-scramble",
    name: "The Villa Cipher",
    desc: "Each guest at the villa is handed seven secret words — each glowing in its own color, each set in its own typeface — drifting loose across the loggia floor. Unscramble your cipher before the other guests do, and prove you belong among high society. No two guests share a word.",
    format: "Played live in the ⚔️ Challenges tab of this app — every guest solves from their own device.",
    defaultWinners: 3,
  },
  {
    id: "masquerade",
    name: "Masquerade at the Palazzo",
    desc: "Guests are split into secret Houses for the palazzo's masquerade ball. Each member gets one SHIELD guess (name your own House) and one DAGGER guess (unmask a rival House). The first Houses resolved — shielded or exposed — bring the ball to a close.",
    format: "Played live in the ⚔️ Challenges tab — the host chooses House size and number before it begins.",
    defaultWinners: 3,
  },
  {
    id: "attack-defend",
    name: "Siege of the Cliffside Villa",
    desc: "Two factions clash across the terraces above the sea. Every guest may launch one ASSAULT and mount one DEFENSE. When the spritz hour bells ring, the faction with the most strikes landed claims the villa.",
    format: "Played live in the ⚔️ Challenges tab — the host may draw teams at random or hand-pick them.",
    defaultWinners: 3,
  },
  {
    id: "coffin",
    name: "Escape from the Family Crypt",
    desc: "Down in the family crypt, the coffins have been arranged to trap the Traitor's own. By sliding the rival coffins aside, the first guest to clear a path and slip the golden coffin free wins the shield.",
    format: "Played live in the ⚔️ Challenges tab — a sliding puzzle; fastest escape wins.",
    defaultWinners: 1,
  },
  {
    id: "casino",
    name: "The Don's Card Room",
    desc: "Low lighting, red velvet tables, and a roulette wheel that never stops turning. Every guest starts with the same chips across Blackjack, Texas Hold 'Em, and Roulette — whoever's purse is heaviest when the room closes for the night wins.",
    format: "Played live in the ⚔️ Challenges tab — balances are tracked automatically by the host.",
    defaultWinners: 1,
  },
  {
    id: "piggy",
    name: "The Counterfeit Piggy Bank",
    desc: "Each guest quietly distributes thirteen coins across at least two rivals' piggy banks. Whoever lands closest to twenty coins without going over takes the shield home — but an overstuffed bank is disqualified on the spot.",
    format: "Played live in the ⚔️ Challenges tab — coins are assigned privately by each guest.",
    defaultWinners: 2,
  },
  {
    id: "voodoo",
    name: "The Evil Eye Doll",
    desc: "Anonymous dolls, each bearing a malocchio charm, hold a guest's private eulogy. Once an hour, prick a limb to reveal five letters — one guess only to name the doll's owner. Guess right, and they're eliminated. The last doll standing wins.",
    format: "Played live in the ⚔️ Challenges tab — one reveal per hour, until only one doll remains.",
    defaultWinners: 1,
  },
  {
    id: "hot-potato",
    name: "The Traitor's Hot Potato",
    desc: "Two hot potatoes, each hiding a secret timer between 15 and 60 minutes, are passed hand to hand around the villa. When a timer runs out, whoever's holding it is eliminated. Last guest standing takes the shield.",
    format: "Played live in the ⚔️ Challenges tab — the host starts the potatoes and tracks their path.",
    defaultWinners: 1,
  },
  {
    id: "icebreaker",
    name: "Who Am I?",
    desc: "Every guest quietly submits a favorite icebreaker question, then everyone answers all of them. The answers are anonymized and revealed one question per hour — guessing who wrote what is a game of memory and close observation. The last guest unidentified wins.",
    format: "Played live in the ⚔️ Challenges tab — one reveal per hour.",
    defaultWinners: 1,
  },
  {
    id: "maze3d",
    name: "Labyrinth of the Blackout Villa",
    desc: "A first-person labyrinth materializes identically for every guest inside the same darkened wing of the villa. Whoever finds the way out fastest proves they've earned the group's trust — and a shield.",
    format: "Played live in the ⚔️ Challenges tab — same labyrinth for everyone, fastest escape wins.",
    defaultWinners: 3,
  },
  {
    id: "zombie",
    name: "Fever at the Red Villa",
    desc: "Two secret carriers spread a mysterious fever through the resort over three rounds. Touching a healthy guest scores a point; a carrier's touch spreads the fever. An antidote cures within ten minutes. Whoever survives with the most points triumphs.",
    format: "Played live in the ⚔️ Challenges tab — three rounds of contagion, scored on survival.",
    defaultWinners: 3,
  },
];

export function missionAnnouncementScript(mission, round, winners) {
  return `Mission #${round}: ${mission.name}\n\n${mission.desc}\n\n${mission.format}\n\nShields at stake: ${winners} ${winners !== 1 ? "winners" : "winner"}.`;
}

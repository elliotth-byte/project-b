function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function roundtableAnnouncementScript(round) {
  return `Roundtable #${round}:

Today is your ${ordinal(round)} round table. While all players may have survived the murder, someone will be banished from the castle today.

All players will participate in a Roundtable. This is an open forum in which players can discuss who they believe to be a Traitor. By the end of the day, each player must cast a vote via DM following this format:
<PLAYERNAME> "Reason"

Once all votes are cast, the votes will be revealed. Both the person you voted for, _and_ your reasoning will become public information, so choose your vote and your words wisely. The player with the most votes will be banished from the castle, and will reveal whether they were a Faithful or a Traitor.

In the case of a tie, the tie will be broken in a game of luck.`;
}

export function murderScript(name, shieldedNames = []) {
  const shieldLine = shieldedNames.length > 0
    ? `\n\n🛡️ ${shieldedNames.join(", ")} ${shieldedNames.length === 1 ? "was" : "were"} protected by a shield.`
    : "";
  return `☠️ The Traitors have struck.\n\n${name} did not survive the night.${shieldLine}`;
}

export function banishScript(name) {
  return `${name}, that is enough votes. You have been banished from the castle.\n\nBut before you leave forever... reveal to us are you a faithful...\n\n_or a traitor?_`;
}

export function walkScript(name) {
  return `🚪 ${name} has chosen to walk away from the game.`;
}

// voteRows: [{ voterName, targetName, reason }] — same shape RoundtableHost
// already computes from the shared votes:round-N key.
export function voteRevealScript(voteRows) {
  return voteRows
    .map((r) => `*${r.voterName}:*\n${r.targetName} — ${r.reason || "no reason given"}`)
    .join("\n\n");
}

export function pandoraOpenScript() {
  return `📦 Pandora's Box is now open.\n\nOne player may open it. Once opened, everyone will know who did it.\n\nTime is limited.`;
}

export function pandoraOpenedScript(playerName) {
  return `📦 Pandora's Box has been opened.\n\n${playerName} opened the box.\n\nWhat comes next is in the host's hands.`;
}

export function pandoraExpiredScript() {
  return `📦 Pandora's Box has closed.\n\nNo one opened it.`;
}

// Splits alive players into up to 4 arrival groups ("First to arrive...",
// "Next to arrive...", etc.) for the staggered Afternoon Tea posts —
// ported from the original artifact's teaGroups().
export function teaArrivalScripts(aliveNames) {
  const shuffled = [...aliveNames].sort(() => Math.random() - 0.5);
  const groups = [];
  const size = Math.max(1, Math.ceil(shuffled.length / 4));
  for (let i = 0; i < shuffled.length; i += size) groups.push(shuffled.slice(i, i + size));
  const labels = ["First to arrive", "Next to arrive", "Third to arrive", "Last to arrive"];
  return groups.map((g, i) => `${labels[i] || "Also arriving"}... ${g.join(", ")}.`);
}

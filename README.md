# Project B (Supabase + Vercel)

A deployable, real-time host/player web app for running **Project B** — a
Challenge / Fates Ceremony / Exile Vote social deduction game — with a
Slack-free stack: GroupMe for group updates, Supabase for the database +
auth + realtime, Vercel for hosting.

This is a from-scratch adaptation of an earlier "Traitors" project of the
same shape. It keeps that project's admin tools, confessionals, voting
loop, and challenge system, rebuilt around Project B's actual rules
instead.

## Rules this implements

- **Challenge**: 1st place wins immunity. Top 3 finishers each get to
  make a nomination at the Fates Ceremony. **Final Four**: only 1st is
  safe — the other three are automatically nominated, no Fates Ceremony
  nominations phase needed that round.
- **Fates Ceremony**: nominations happen in finishing order (1st among
  the top 3 nominates first, then 2nd, then 3rd). No one can nominate
  themselves or the challenge winner.
- **Chaos & the Exile Vote**: one player is randomly given the Power of
  Chaos each round. Everyone votes to eliminate one of the 3 nominees;
  the Chaos holder nullifies all votes against their chosen nominee
  (that nominee can't be exiled no matter the count). Most votes among
  the rest is exiled; ties are broken by the Chaos holder.
- **Exiled players & re-entry**: every exiled player gets exactly ONE
  re-entry attempt, ever — opting into any later challenge. Finish 1st
  and they're back in (and that round becomes a **double elimination**:
  votes flip to voting to SAVE a nominee; whoever the Chaos holder
  nullifies AND whoever has the fewest save-votes among the rest are
  BOTH exiled). Anything else, and that attempt is used up for good.
- **Finale**: once 3 players remain, every exiled player returns to vote
  FOR a winner among the 3 finalists. A final Power of Chaos is drawn
  from the exiled pool and nullifies one finalist's votes entirely (they
  can't win); whoever has more votes between the other two wins, tie
  broken by the Chaos holder's own choice.

See `lib/challengeLogic.js`, `lib/fatesLogic.js`, `lib/chaosLogic.js`,
`lib/exileLogic.js`, and `lib/reentryLogic.js` for the rules as code —
each is pure logic with no storage dependency, so you can read (or unit
test) exactly how an outcome gets computed. `lib/roundEngine.js` is what
actually drives the game from phase to phase.

### Deliberate simplifications, called out honestly

- **Only one re-entry attempt is "in flight" per challenge.** If several
  exiled players all want to compete the same round, the host picks one
  from the requesters (see `ChallengeHost.jsx`). Nothing in the written
  rules requires supporting more than one at a time, and allowing several
  at once raises ambiguous cases the rules don't address (what if two
  exiled players tie for 1st?).
- **The "Fan of Cards" moment is flavor, not mechanics.** The rules
  describe it but never say it changes an outcome, so the host has a
  "Draw" button that pulls a flavor card to read aloud / post to GroupMe;
  it doesn't feed into any calculation.
- **The finale's "final 2" language** is read as: all 3 finalists get
  votes, the Chaos holder nullifies one finalist's votes entirely
  (removing them from contention), and the winner is decided between
  the other two — which is what "final 2" then refers to. This was the
  only self-consistent reading of the finale paragraph; flag it to your
  group before the finale if you want to run it differently.
- **A phase never auto-advances on a half-finished phase.** If the
  Challenge timer runs out but the host hasn't finished entering
  placements, the game waits (and nudges) rather than guessing at a
  winner. Same for incomplete nominations or an un-broken tie. This is a
  deliberate choice — see "Automatic phase advancement" below.
- **Final Four + a same-round re-entry attempt**: the written rules
  never address what happens if a re-entry challenge occurs while only 4
  players remain. Since a winning re-entrant immediately makes it 5
  players (not 4), `lib/roundEngine.js` treats any round with an active
  re-entry attempt as a normal round (top-3 nominate) rather than
  Final-Four rules, even if exactly 4 are currently alive.

## Setup

1. **Supabase**: create a project. In the SQL Editor, run every file in
   `sql/` **in this order**: `schema.sql`, `add-player-approval.sql`,
   `add-join-codes.sql`, `add-season-subtitle.sql`, `add-season-archive.sql`,
   `add-game-hosts.sql`, `add-elimination-type.sql`, `add-confessionals.sql`,
   `add-scheduled-groupme-posts.sql`.
2. **Copy `.env.local.example` to `.env.local`** and fill in your Supabase
   URL/keys, your GroupMe bot ID (create one at
   [dev.groupme.com/bots](https://dev.groupme.com/bots) for the group you
   want updates posted into), and a random `CRON_SECRET`.
3. Create a host account: in Supabase → Authentication → Users → Add
   user, or call `signUpHost()` from `lib/auth.js` once, then set that
   user's `raw_user_meta_data` to include `"role": "host"`.
4. `npm install && npm run dev` to run locally, or push to GitHub and
   import into Vercel. Set the same env vars in Vercel's Project Settings
   → Environment Variables (this is what actually makes it "a new Vercel
   project").

## Automatic phase advancement — how it actually works

Vercel's **Hobby plan only runs cron jobs once per day**, which isn't
close to real-time. Rather than requiring a paid plan, this app also
has any open browser tab (host **or** player) quietly check in every few
seconds via `pages/api/advance-phase.js` — the server only actually does
anything once the current phase's timer has genuinely elapsed and
everything that phase needed is complete. That's what makes "the game
automatically begins the next phase and posts an update" true in
practice, without requiring Vercel Pro.

`pages/api/cron/advance-rounds.js` is a second, belt-and-suspenders path
for the same logic, wired up in `vercel.json` at a frequency Hobby
supports (once/day) as a safety net for a game left running unattended.
**If you're on Vercel Pro**, change its schedule in `vercel.json` to
`* * * * *` (every minute) and it becomes a fully reliable path that
doesn't need anyone's browser tab open at all.

## What's the same as the original Traitors project

- Supabase auth (players use a plain username, hosts a real email),
  the join-code flow, co-hosts, season archive/rename, the confessional
  system, and the ambient music player are unchanged in shape — see
  `lib/auth.js`, `pages/join/[code].jsx`, `sql/add-game-hosts.sql`,
  `components/ConfessionalsHost.jsx` / `ConfessionalPlayer.jsx`.
- The generic `game_state` key/value store + atomic compare-and-swap
  update pattern (`lib/gameStorage.js`, now built on the reusable
  `lib/dbAdapter.js`) is the same mechanism, just with Project B's own
  keys (see `lib/gameState.js`).

## What's different

- **GroupMe instead of Slack** everywhere: `lib/groupmeClient.js`,
  `lib/groupmeScheduling.js`, `pages/api/post-to-groupme.js`,
  `pages/api/cron/post-scheduled.js`, `sql/add-scheduled-groupme-posts.sql`.
- All of the Traitors-specific mini-games, traitor roles, and murder
  vote were removed — Project B's Challenge/Fates/Exile loop replaces
  Roundtable entirely, and there's no host-only secret state anymore
  (no `host_state` table), since nothing in Project B needs to be hidden
  from other players the way traitor identities did.
- **Admin-configurable round lengths** (`components/AdminHost.jsx`,
  `lib/gameState.js`'s `getSettings`/`setSettings`), plus the whole
  auto-advance engine described above (`lib/roundEngine.js`).

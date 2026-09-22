# Project B (Supabase + Vercel)

A deployable, real-time host/player web app for running **Project B** — a
Challenge / Fates Ceremony / Exile Vote social deduction game — built on
Supabase for the database + auth + realtime, and Vercel for hosting. All
game announcements are in-app (see "Announcements" below) — no
third-party chat integration required.

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
- **The Power of Chaos is won, not assigned.** The written rules just say
  one player is "randomly given" it each round; this implementation makes
  that a real moment instead of a silent draw — every eligible player
  sees a row of mystery cards (see `components/ChaosPowerPlayer.jsx`) and
  gets one shot at picking the right one. The odds are identical to a
  flat random assignment; this only changes how it's revealed.
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

## Recent changes: aesthetic, radio, player colors, multi-attempt re-entry, infinite time

- **80s neon arcade look** — new palette and fonts (Orbitron / Press Start 2P)
  live in `components/ui.jsx` (Btn/Card/Badge, inherited almost everywhere)
  and were swept across every other file. Canvas-drawn gameplay colors
  inside the mini-games (car colors, bricks, pegs, gems) were left alone —
  only app chrome (backgrounds, borders, text, buttons) changed.
- **The radio's back** — `lib/musicEngine.js` now generates upbeat 80s
  synth-pop / retrowave / EDM / chiptune instead of dark ambient, behind
  the exact same `buildEngine(mood)` interface, so `MusicPlayer.jsx`
  (labeled "📻 Radio" now) needed zero changes.
- **Player colors** — `sql/add-player-color.sql` adds `players.color`.
  `lib/playerColors.js` holds the 12-color neon palette; `ColorPicker.jsx`
  is shown once, right after a player joins, letting them claim any
  color no one else in the game has taken yet.
- **Memory wall voting** — `components/MemoryWall.jsx` is a shared grid of
  big, chunky, color-coded tiles (Big Brother-style), used for every
  "pick a player" moment on the player side: Fates nominations, the Exile
  Vote, and the Finale vote. The host's own dropdowns for entering/
  monitoring votes stayed as compact tables — that's a different job
  (one person tracking many votes at once) than a player making one big
  decision.
- **Multiple simultaneous re-entry attempts** — any number of exiled
  players can now opt into the same challenge at once (`ChallengeHost.jsx`
  multi-select instead of single-select). Only whoever actually finishes
  1st overall returns; everyone else who tried still uses up their one
  shot, exactly as before — this only changes how many can try per
  challenge, not the underlying rule.
- **Infinite time toggle** — a new "∞ Infinite time" checkbox in Admin →
  Round Lengths removes the automatic timer from every phase; the host
  advances Challenge/Fates/Exile Vote/Finale manually via each screen's
  "Finish Now" / "Lock & Continue" / "Reveal Winner" button instead.

## Recent changes: voting overhaul (Chaos secrecy, reasons, in-app tiebreaker, reveal toggle, voting spreadsheet)

- **The Power of Chaos pick is now genuinely secret**, not just hidden in
  the UI. `sql/add-chaos-secrets.sql` adds a dedicated `chaos_secrets`
  table whose RLS policies only ever let the host or the current holder
  read it — every other player, even with dev tools open, gets nothing
  back. `components/ChaosPowerPlayer.jsx` is the holder's own screen for
  using it (works for both the Exile Vote and the Finale, since it's the
  same mechanic); `lib/chaosSecrets.js` is the storage layer.
- **Vote reasoning** — `ExileVotePlayer.jsx` and `FinalePlayer.jsx` both
  now have an optional "why?" text field alongside the vote itself,
  shown back to the voter as confirmation and revealed later during the
  host's reveal sequence.
- **Tiebreaks are cast in-app** by the actual Chaos holder now
  (`ChaosPowerPlayer.jsx`), computed client-side from the live votes the
  moment voting closes. The host's own tie-break buttons in
  `ExileVoteHost.jsx`/`FinaleHost.jsx` are kept as a manual fallback, not
  the primary path.
- **Reveal toggle**: at the end of a vote, the host now picks "🎭 Reveal
  In-App" (the existing step-by-step dramatic reveal) or "📋 Copy Results
  Summary" (composes a full text summary — votes, reasons, the Chaos
  pick — that the host can paste wherever they want, then finalizes
  immediately).
- **Voting history spreadsheet** — `components/VotingHistorySpreadsheet.jsx`,
  shown at the bottom of the History tab, flattens every past exile vote
  and the finale into one table (voter, target, reason, Chaos holder,
  who was nullified, tie-breaks, outcome) with a one-click CSV download.
  This only works going forward from this update — `lib/roundEngine.js`
  now archives the full vote-by-vote breakdown (previously it only kept
  the final outcome), so rounds played before this change won't appear
  in it.
- **Fixed:** `is_current_chaos_holder()` compared a `players.id` straight
  against `auth.uid()` — two different UUIDs for the same person — so the
  actual Power of Chaos holder could never read their own secret pick via
  `chaos_secrets`. See `sql/fix-chaos-holder-check.sql`.
- **New: a player-facing Ceremony tab** (`components/CeremonyPlayer.jsx`).
  Previously `FatesPlayer.jsx`/`ExileVotePlayer.jsx`/`FinalePlayer.jsx`
  only rendered while their phase was live and vanished the moment the
  round moved on — players had no way to look back at a nomination, vote
  breakdown, or Chaos reveal afterward, including once the game ended.
  The new tab in `pages/play.jsx` stays available for the whole game
  (tabs no longer disappear at game-over) and shows every past round's
  Fates Ceremony (who nominated whom, in finishing order) and Exile Vote
  (nominees, Chaos holder, nullification, vote-by-vote breakdown, who was
  exiled) plus the Finale, sourced from `pb:exile-history` / `pb:finale`
  so it only ever shows what's actually been revealed — never a live,
  in-progress tally. `lib/roundEngine.js` now also carries each round's
  Fates nomination detail (`fatesNominatorOrder`/`fatesNominations`) into
  that history record, since it otherwise gets overwritten the moment the
  next round's Fates Ceremony starts.
- **Fixed:** a tied Exile Vote / Finale vote could get permanently stuck
  even after the host used the tie-break fallback buttons in
  `ExileVoteHost.jsx`/`FinaleHost.jsx`. Those buttons were disabled purely
  based on `outcome.needsTieBreak`, which is a pure function of the vote
  tally and stays true forever once a tie exists — it never accounted for
  a tie-break choice having actually been made, unlike
  `ChaosPowerPlayer.jsx` (the primary tie-break path) and
  `lib/roundEngine.js` (which both already correctly check
  `needsTieBreak && !tieBreakChoiceId`). The host-facing tie card now also
  flips to a green "tie broken" confirmation once a choice is in, instead
  of staying on the red "it's tied" warning indefinitely.
- **Fixed + new: player removal.** `sql/schema.sql` never had a DELETE
  policy on `players` at all, so `AdminHost.jsx`'s existing "Remove"
  button (for pending join requests) always silently failed — see
  `sql/add-player-removal.sql`. While fixing that, also added: a host-side
  "Remove" button for already-approved players (`components/AdminHost.jsx`),
  and a self-serve "🚪 Quit" / "✕ Cancel" button for players themselves
  (top bar in `pages/play.jsx`). A pending player quitting/being removed
  is a genuine delete (nothing references them yet); an approved player
  quitting/being removed is NOT deleted — `lib/playerRemoval.js` instead
  marks them `alive: false, elimination_type: "quit"`, the same shape as
  an exile, so every alive-only filter and every past reference to their
  name keeps working, they just never get a re-entry attempt.
- **Changed: the Power of Chaos holder's identity is now shown to every
  player**, not just the host and the holder. `ExileVotePlayer.jsx` and
  `FinalePlayer.jsx` now show a small "🃏 X holds the Power of Chaos this
  round" line (skipped for the holder themselves, who already gets a much
  bigger card via `ChaosPowerPlayer.jsx`). This isn't a new data exposure
  — `chaosHolderId` was always fully readable by every player via
  `game_state` RLS, and the host UI and in-app announcements already
  disclosed it; it just wasn't ever surfaced in the player-facing vote
  screens. Only the holder's actual pick (who they nullify) stays secret
  until the reveal, same as before.



1. **Supabase**: create a project. In the SQL Editor, run every file in
   `sql/` **in this order**: `schema.sql`, `add-player-approval.sql`,
   `add-join-codes.sql`, `add-season-subtitle.sql`, `add-season-archive.sql`,
   `add-game-hosts.sql`, `add-elimination-type.sql`, `add-confessionals.sql`,
   `add-confessional-replies.sql`, `add-player-color.sql`,
   `add-player-color-policy.sql`, `add-chaos-secrets.sql`,
   `add-chaos-draw-index.sql`, `add-player-removal.sql`.

   **Already have a project running?** A few migrations only matter if
   you set this project up before they existed:
   - Run `add-game-type.sql` then `add-traitors-tables.sql` to pick up the
     Traitors game mode (see the "Game types" section below) — additive,
     safe to run on any existing project regardless of how old it is.
   - If you ran `add-chaos-secrets.sql` before this note was added, also
     run `sql/fix-chaos-holder-check.sql` once — it patches a bug where
     the player actually holding the Power of Chaos could never read
     their own secret pick (the RLS check compared a `players.id`
     straight against `auth.uid()`, which are different UUIDs for the
     same person). Fresh installs following the order above already get
     the fixed version and can skip this file.
   - If you ever ran the old `add-scheduled-groupme-posts.sql` (from
     before announcements moved in-app — see "Announcements" below), run
     `sql/remove-groupme-integration.sql` once to drop that now-unused
     table. Fresh installs never need to run either of these two files.
2. **Copy `.env.local.example` to `.env.local`** and fill in your Supabase
   URL/keys and a random `CRON_SECRET`.
3. Create a host account: in Supabase → Authentication → Users → Add
   user, or call `signUpHost()` from `lib/auth.js` once, then set that
   user's `raw_user_meta_data` to include `"role": "host"`.
4. `npm install && npm run dev` to run locally, or push to GitHub and
   import into Vercel. Set the same env vars in Vercel's Project Settings
   → Environment Variables (this is what actually makes it "a new Vercel
   project").

## The 10 built-in mini-games

The Challenge phase isn't limited to real-world/in-person challenges —
`components/ChallengeHost.jsx` lets the host pick any of these instead.
Players play on their own screens; each game reports its own score, which
`lib/challengeScores.js` automatically turns into finishing places the
instant the challenge timer runs out (see `lib/roundEngine.js`) — no
manual entry needed.

| Game | Icon | Rule | Default length |
|---|---|---|---|
| Match 3 | 💎 | Swap adjacent gems, clear lines of 3+. Highest score wins. | 3 minutes |
| Frogger | 🐸 | Cross the road, avoid the cars. 3 lives — most crossings wins. | 3 minutes |
| Word Scramble | 🔤 | Unscramble your own set of 7 floating words. Fastest wins. | 5 minutes |
| 2D Maze | 🧩 | Navigate a generated maze from start to finish. Fastest wins. | 5 minutes |
| Farkle | 🎲 | Solo push-your-luck dice scoring. Highest banked total wins. | 5 minutes |
| Trivia | ❓ | 10 questions, 10 seconds each. Most correct wins; ties go to whoever answered faster overall. | ~2 minutes |
| Breakout | 🧱 | Paddle-and-ball brick breaker. 3 lives — most bricks broken wins. | 3 minutes |
| Plinko | 🔴 | Drop 3 chips through the pegs into scoring slots. Highest total wins. | 2 minutes |
| Spot the Difference | 🔍 | Find all 5 differences between two procedurally generated scenes. Most found wins; ties go to whoever finished faster. | 3 minutes |
| Whack-a-Mole | 🔨 | 60 seconds, tap every mole you can. Most whacks wins. | 60 seconds |

Each game's own duration/lives/shots/questions/differences are stored per
challenge in `pb:challenge.gameConfig` (see `lib/challengeGames.js` for
defaults) — the host can still override the overall time limit when
starting the challenge. Every game is genuinely playable but intentionally
simple (no external art/asset dependencies, plain Canvas/DOM) — treat them
as solid, functional first drafts rather than polished arcade titles;
swapping in nicer visuals later doesn't require touching the scoring or
placement logic at all, since that all lives in `lib/challengeScores.js`
and is identical for every game.

Adding an 11th game later is 3 steps: write a `components/games/YourGamePlayer.jsx`
that calls `reportScore(...)` as it plays, add an entry to
`GAME_REGISTRY` in `lib/challengeGames.js`, and add it to the
`GAME_COMPONENTS` map in `components/ChallengePlayer.jsx`.

## Automatic phase advancement — how it actually works

Vercel's **Hobby plan only runs its own cron feature once per day**,
which isn't close to real-time. Rather than requiring a paid plan, this
app covers the gap two ways:

1. **Any open browser tab** (host **or** player) quietly checks in every
   few seconds via `pages/api/advance-phase.js` — the server only
   actually does anything once the current phase's timer has genuinely
   elapsed and everything that phase needed is complete. This is the
   primary, near-instant path whenever anyone has the app open.

2. **`pages/api/cron/advance-rounds.js`**, hit on a schedule, covers the
   gap when nobody does. Vercel's own once-daily cron entry in
   `vercel.json` stays wired up as a low-frequency backstop regardless
   of plan — but the once-per-day cap is a limit on *Vercel's own
   scheduler*, not on this endpoint, which is a completely ordinary HTTP
   route that answers any caller with the right secret. A free external
   scheduler calling it every few minutes gets you real, near-real-time
   coverage without upgrading anything:

   **Setup (cron-job.org, free, no code changes needed):**
   1. Confirm `CRON_SECRET` is set in Vercel → Project Settings →
      Environment Variables. If it isn't already set (Vercel's own cron
      entry works fine without it, since the check in
      `advance-rounds.js` only enforces it when the variable is
      present), add one now — any long random string works. Redeploy
      after adding it.
   2. Create a free account at [cron-job.org](https://cron-job.org).
   3. Create a new cron job:
      - **URL**: `https://<your-production-domain>/api/cron/advance-rounds`
        (find your exact domain in Vercel → Project → Domains — this
        changes if you ever rename the project)
      - **Schedule**: every 5 minutes (cron-job.org's own minimum)
      - **Request method**: GET (the default — this route doesn't
        restrict by method)
      - **Custom header**: `Authorization: Bearer <your CRON_SECRET value>`
   4. Save, then use cron-job.org's "Run now" / test option to confirm
      you get back a `200` with a JSON body like
      `{"checked": N, "results": [...]}` — a `401` means the header
      doesn't match what's in Vercel's environment variables.

   This is deliberately additive, not a replacement — Vercel's own
   once-daily cron entry stays in `vercel.json` as a backstop in case
   the external scheduler ever has an outage of its own. If you're ever
   on **Vercel Pro** instead, you can skip the external scheduler
   entirely and just change `vercel.json`'s schedule to `* * * * *`
   (every minute — Pro supports true per-minute cadence) or anything
   less frequent.

## Announcements

Every automated narration the round engine generates ("Challenge
complete! 🏆 X finishes 1st...", "Round begins...", eliminations, etc.)
is written straight into the game — `lib/roundEngine.js` calls a
`postMessage(text)` callback (`lib/announcements.js`'s
`makeInAppPostMessage`, wired up in `pages/api/advance-phase.js` and
`pages/api/cron/advance-rounds.js`) that appends it to a rolling
in-app feed (`components/AnnouncementsFeed.jsx`, shown on both the
host's History tab and the player's Ceremony tab, keeping the most
recent 30 entries). No external chat integration, bot, or API key
required.

For the host's own manual announcements — a vote reveal summary, a
confessional recap, anything they want to share outside the app entirely
(a group text, Slack, wherever) — `components/CopyMessage.jsx` composes
the text and copies it to the clipboard for the host to paste anywhere
they like, rather than posting it anywhere automatically.

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

- **In-app announcements instead of a third-party chat.** The automated
  "Challenge complete!" / "Round begins" / etc. narration
  `lib/roundEngine.js` generates gets written straight into the game
  (`lib/announcements.js`, `components/AnnouncementsFeed.jsx` — shown on
  both the host's History tab and the player's Ceremony tab), and the
  host can copy any vote/reveal summary out to paste wherever they
  actually want it (`components/CopyMessage.jsx`) — Slack, a group text,
  anything. No bot, no webhook, no third-party API key required.
- All of the Traitors-specific mini-games, traitor roles, and murder
  vote were removed — Project B's Challenge/Fates/Exile loop replaces
  Roundtable entirely, and there's no host-only secret state anymore
  (no `host_state` table), since nothing in Project B needs to be hidden
  from other players the way traitor identities did. **Update:** as of
  the "Game types" section below, this app is being re-merged with the
  Traitors app it forked from — `host_state`, `traitor_state`, and
  `player_roles` are coming back, but scoped to Traitors-type seasons
  only; Project B seasons still never touch them.

## Game types

This app now hosts two different sets of season rules from one
codebase/database, distinguished by `games.game_type` (`'project_b'` or
`'traitors'`, see `sql/add-game-type.sql`) — the intent being that a
third (Survivor) can be added later the same way, sharing the same
Supabase project, the same `auth.users`/`profiles` identity layer, and a
shared library of mini-games (see `lib/challenges/`) rather than being a
separate app.

- **Shared across every game type:** Supabase auth, `profiles`,
  `platform_admins`, `game_hosts` (co-hosts), the `games`/`players`/
  `game_state` core tables, and the mini-game challenge engine
  (`lib/challenges/registry.js`, `scores.js`, `selection.js`,
  `participants.js` — a game-type-agnostic "run a mini-game, collect
  scores, hand back a leaderboard" layer; what a game type's own round
  engine does with that leaderboard is entirely up to it).
- **`project_b` seasons** get this app's own Challenge → Fates → Exile
  engine (`lib/roundEngine.js`) — unchanged, this is the original
  behavior of this app.
- **`traitors` seasons** get the Roundtable/Murder Vote/Missions engine
  ported from the standalone Traitors app (`player_roles`, `host_state`,
  `traitor_state` — see `sql/add-traitors-tables.sql`), reusing this
  app's existing `confessionals` table rather than a separate one, since
  the schema was already identical.
- `game_type` is set once, at season creation, and not meant to change
  after — see `pages/host.jsx`'s `createSeason`.

As of this note, the schema side of this is in place; the host-facing
mode picker and the ported Traitors host/player UI are still landing —
check `sql/add-traitors-tables.sql`'s own header comment and this
section's git history for the current state.
- **Admin-configurable round lengths** (`components/AdminHost.jsx`,
  `lib/gameState.js`'s `getSettings`/`setSettings`), plus the whole
  auto-advance engine described above (`lib/roundEngine.js`).

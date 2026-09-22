// ─── One-off data fix: rewrite already-stored inactivity-removal ───
// ─── announcements/chat messages to use aliases, not real names   ───
//
// Context: lib/roundEngine.js's checkInstantInactivityRemoval used to
// build its "removed for inactivity" message with
// `p.display_name || playersById[p.id]` — real name checked FIRST, so
// it always won even when a season has aliases turned on. Every other
// announcement in that file did it the other way around
// (`playersById[p.id] || p.display_name`, where playersById is already
// alias-aware). That's now fixed going forward (see roundEngine.js).
//
// This script finds every announcement / group-chat message that
// matches that exact removal message's template and rewrites the real
// name(s) in it to the player's alias, for any game where aliases are
// (or were) turned on. It does NOT touch anything else — no other
// announcement text, no real chat messages, nothing host-authored —
// because every other automated announcement already used the correct
// alias-aware name, so a broad rewrite would just be a no-op there
// anyway, and being narrow here means there's no chance of this script
// mangling something it wasn't meant to touch.
//
// This can't be run from the sandboxed dev session that wrote it — that
// environment's network egress doesn't reach Supabase at all (blocked
// at the proxy level, confirmed by a direct connection test). Run it
// yourself, from a machine that CAN reach your Supabase project:
//
//   node scripts/fix-inactivity-announcement-names.mjs           # every game
//   node scripts/fix-inactivity-announcement-names.mjs <gameId>  # one game only
//   node scripts/fix-inactivity-announcement-names.mjs --dry-run # preview only, no writes
//
// Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL to be
// set — it reads them straight out of .env.local, the same file the
// app itself uses, so there's nothing extra to configure. The service
// role key bypasses row-level security, which is exactly what a script
// editing another player's stored announcement text needs — never put
// this key in anything that ships to a browser.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}

const env = { ...loadEnv(envPath), ...process.env };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (checked .env.local and the environment). Aborting.");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyGameId = args.find((a) => !a.startsWith("--"));

const client = createClient(SUPABASE_URL, SERVICE_KEY);

const KEY_ANNOUNCEMENTS = "pb:announcements";
const GROUP_CHAT_KEY = "pb:group-chat";

// Matches exactly what lib/roundEngine.js's checkInstantInactivityRemoval
// generates: "🚫 Name1, Name2 didn't vote, play in the Battle, or send
// any message this round — removed for inactivity."
const REMOVAL_MSG_RE = /^🚫 (.+?) didn't vote, play in the Battle, or send any message this round — removed for inactivity\.$/;

// CAS update, same shape as lib/dbAdapter.js's own makeDb().update —
// duplicated here (rather than imported) so this script has zero
// dependency on the app's build, and can run with plain node.
async function updateGameState(gameId, key, updater, retries = 6) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const { data: row } = await client.from("game_state").select("value, version").eq("game_id", gameId).eq("key", key).maybeSingle();
    if (!row) return { ok: true, value: null, unchanged: true };
    const current = row.value;
    const draft = JSON.parse(JSON.stringify(current));
    const { changed, value: nextVal } = updater(draft);
    if (!changed) return { ok: true, value: current, unchanged: true };

    if (dryRun) return { ok: true, value: nextVal, dryRun: true };

    const { data: updated, error } = await client
      .from("game_state")
      .update({ value: nextVal, version: row.version + 1, updated_at: new Date().toISOString() })
      .eq("game_id", gameId)
      .eq("key", key)
      .eq("version", row.version)
      .select();
    if (!error && updated && updated.length > 0) return { ok: true, value: nextVal };
  }
  return { ok: false };
}

function rewriteRemovalMessage(text, nameToAlias) {
  const m = text.match(REMOVAL_MSG_RE);
  if (!m) return { changed: false, text };
  const names = m[1].split(", ").map((n) => n.trim());
  let changed = false;
  const rewritten = names.map((n) => {
    if (nameToAlias[n] && nameToAlias[n] !== n) {
      changed = true;
      return nameToAlias[n];
    }
    return n;
  });
  if (!changed) return { changed: false, text };
  return { changed: true, text: `🚫 ${rewritten.join(", ")} didn't vote, play in the Battle, or send any message this round — removed for inactivity.` };
}

async function fixGame(gameId) {
  const { data: settings } = await client.from("game_state").select("value").eq("game_id", gameId).eq("key", "pb:settings").maybeSingle();
  const aliasEnabled = !!settings?.value?.aliasEnabled;

  const { data: players } = await client.from("players").select("id, display_name, alias").eq("game_id", gameId);
  const nameToAlias = {};
  (players || []).forEach((p) => {
    if (aliasEnabled && p.alias && p.display_name) nameToAlias[p.display_name] = p.alias;
  });

  if (Object.keys(nameToAlias).length === 0) {
    console.log(`  ${gameId}: aliases not in use here — nothing to fix.`);
    return { announcementsFixed: 0, chatFixed: 0 };
  }

  let announcementsFixed = 0;
  const annRes = await updateGameState(gameId, KEY_ANNOUNCEMENTS, (draft) => {
    const list = draft || [];
    let changedAny = false;
    const next = list.map((entry) => {
      if (entry.from !== "system" || typeof entry.text !== "string") return entry;
      const { changed, text } = rewriteRemovalMessage(entry.text, nameToAlias);
      if (changed) { changedAny = true; announcementsFixed++; return { ...entry, text }; }
      return entry;
    });
    return { changed: changedAny, value: next };
  });
  if (!annRes.ok) console.error(`  ${gameId}: announcements update failed after retries — left untouched.`);

  let chatFixed = 0;
  const chatRes = await updateGameState(gameId, GROUP_CHAT_KEY, (draft) => {
    const list = draft || [];
    let changedAny = false;
    const next = list.map((entry) => {
      if (entry.senderId !== "system" || typeof entry.body !== "string") return entry;
      const { changed, text } = rewriteRemovalMessage(entry.body, nameToAlias);
      if (changed) { changedAny = true; chatFixed++; return { ...entry, body: text }; }
      return entry;
    });
    return { changed: changedAny, value: next };
  });
  if (!chatRes.ok) console.error(`  ${gameId}: group chat update failed after retries — left untouched.`);

  console.log(`  ${gameId}: ${announcementsFixed} announcement(s), ${chatFixed} chat message(s) ${dryRun ? "would be" : ""} fixed.`);
  return { announcementsFixed, chatFixed };
}

async function main() {
  console.log(dryRun ? "Dry run — no writes will be made.\n" : "Live run — rewriting matching messages.\n");

  let gameIds;
  if (onlyGameId) {
    gameIds = [onlyGameId];
  } else {
    const { data: games, error } = await client.from("games").select("id");
    if (error) {
      console.error("Couldn't list games:", error.message);
      process.exit(1);
    }
    gameIds = (games || []).map((g) => g.id);
  }

  let totalAnn = 0;
  let totalChat = 0;
  for (const gameId of gameIds) {
    const { announcementsFixed, chatFixed } = await fixGame(gameId);
    totalAnn += announcementsFixed;
    totalChat += chatFixed;
  }

  console.log(`\nDone. ${totalAnn} announcement(s) and ${totalChat} chat message(s) ${dryRun ? "would be" : "were"} fixed across ${gameIds.length} game(s).`);
  if (dryRun) console.log("Run again without --dry-run to actually write these changes.");
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});

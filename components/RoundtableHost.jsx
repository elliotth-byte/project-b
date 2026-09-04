import { useState, useEffect, useRef } from "react";
import { Btn, Card } from "./traitorsUi";
import { supabase } from "../lib/supabaseClient";
import { storageGet, storageSet, storageUpdate, storageDelete, subscribeGameState } from "../lib/gameStorage";
import {
  buildDramaticVoteOrder, buildVoteRevealMessage, cumulativeTallyThrough,
  computeVoteTally, STORAGE_KEY_ROUND_INFO, VOTES_KEY_PREFIX, STORAGE_KEY_VOTE_HISTORY,
} from "../lib/roundtableData";
import { roundtableAnnouncementScript, voteRevealScript, banishScript } from "../lib/slackScripts";
import { notifyPlayersRoundChange } from "../lib/pushNotifications";
import PostToSlack from "./PostToSlack";
import { recordElimination } from "../lib/seasonPlacement";
import { GROUP_CHAT_KEY } from "../lib/chatData";
import { applyTraitorsRoundInactivity, decayTraitorsStrikesIfDue } from "../lib/traitorsInactivity";

// ─── Roundtable: Host Control ───
//
// Scope note: this converts the core voting loop (open/close voting, cast
// votes, dramatic reveal, banish, advance round) — the part of the original
// artifact that every other mission revolves around. Intentionally left out
// of this pass: traitor role assignment/murders/shields (a separate,
// larger host-state system in the original that hasn't been migrated yet)
// and Slack posting/staggered scheduled reveals (out of scope until the
// Slack integration itself gets converted). The suspenseful reveal ordering
// logic itself is unchanged from the original — it just plays out in the
// browser instead of being scripted for Slack.
export default function RoundtableHost({ gameId, players, settings }) {
  const [roundInfo, setRoundInfo] = useState(null);
  const [votes, setVotes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revealOrder, setRevealOrder] = useState(null);
  const [revealIndex, setRevealIndex] = useState(-1);
  const [banishing, setBanishing] = useState(false);

  // Local editable drafts for the "Manual Vote Entry" table below. Synced
  // from the live `votes` state whenever it changes, EXCEPT for any voter
  // currently marked dirty (host has an in-progress edit for them that
  // hasn't finished writing yet) — otherwise a realtime update arriving
  // mid-keystroke would overwrite what the host is typing.
  const [drafts, setDrafts] = useState({});
  const dirtyRef = useRef(new Set());

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      players.forEach((p) => {
        if (dirtyRef.current.has(p.display_name)) return;
        const v = votes?.[p.display_name];
        next[p.display_name] = { target: v?.target || "", reason: v?.reason || "" };
      });
      return next;
    });
  }, [votes, players]);

  const alive = players.filter((p) => p.alive);
  const round = roundInfo?.round || 1;

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_ROUND_INFO, (value) => {
      setRoundInfo(value);
      setLoading(false);
    });
    return unsubscribe;
  }, [gameId]);

  // Re-subscribe to this round's votes whenever the round number changes
  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, VOTES_KEY_PREFIX + round, setVotes);
    return unsubscribe;
  }, [gameId, round]);

  const openVoting = async () => {
    await storageSet(gameId, STORAGE_KEY_ROUND_INFO, {
      round,
      votingOpen: true,
      players: alive.map((p) => ({ id: p.id, name: p.display_name })),
      // Only meaningful for the inactivity system below — see its own
      // comment on why it needs a "since when" to check chat activity
      // against. Harmless/unread by anything else that reads roundInfo.
      startedAt: Date.now(),
    });
    setRevealOrder(null);
    setRevealIndex(-1);
    // Single host-triggered click, not an opportunistic multi-client
    // race the way Stereo Types' own round-starts are — no dedup
    // concern here, this only ever runs once per actual vote opening.
    notifyPlayersRoundChange(gameId, "🗳️ Roundtable Vote", `Round ${round} voting is open — head in to cast your vote.`, "round-change");
  };

  const closeVoting = async () => {
    await storageUpdate(gameId, STORAGE_KEY_ROUND_INFO, (fresh) => {
      if (!fresh) return null;
      fresh.votingOpen = false;
      return fresh;
    });
  };

  const voteRows = votes
    ? Object.entries(votes).map(([voterName, v]) => ({ voterName, targetName: v.target, reason: v.reason }))
    : [];
  const tally = computeVoteTally(voteRows);
  const rankedTargets = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const leadingTarget = rankedTargets[0]?.[0];

  const startReveal = () => {
    const order = buildDramaticVoteOrder(voteRows);
    setRevealOrder(order);
    setRevealIndex(order.length ? 0 : -1);
  };

  const revealNext = () => setRevealIndex((i) => Math.min(i + 1, (revealOrder?.length || 1) - 1));
  const revealAll = () => setRevealIndex((revealOrder?.length || 1) - 1);
  const revealDone = revealOrder && revealIndex >= revealOrder.length - 1;

  const banish = async () => {
    if (!leadingTarget) return;
    setBanishing(true);
    const target = players.find((p) => p.display_name === leadingTarget);
    if (target) {
      await supabase.from("players").update({ alive: false, elimination_type: "banished" }).eq("id", target.id);
      // See lib/seasonPlacement.js — same shared placement pool a murder
      // (MurderVoteHost.jsx) or a Project B exile feeds.
      await recordElimination(supabase, gameId, target.id);
      // Chat's Exile Room (see sql/add-group-chat.sql) — same treatment
      // Project B's own exile-by-vote path gives it (lib/roundEngine.js),
      // scoped the same narrow way: a banish is the vote-based equivalent
      // of an exile, so it gets this; a murder (MurderVoteHost.jsx) is
      // not treated as one, matching how Project B itself never adds a
      // quit/inactivity-removal to this room either. Best-effort — chat
      // being off, or this RPC failing, must never block a real banish.
      if (settings?.chatEnabled) {
        try {
          const { error: chatErr } = await supabase.rpc("add_to_exile_room", { p_game_id: gameId, p_player_id: target.id });
          if (chatErr) console.error("add_to_exile_room failed (non-fatal)", chatErr);
        } catch (chatErr) {
          console.error("add_to_exile_room threw (non-fatal)", chatErr);
        }
      }
    }
    setBanishing(false);
  };

  const nextRound = async () => {
    // Archive this round's votes before clearing them — otherwise there's
    // no record left once the round advances, and the History tab's vote
    // matrix would only ever be able to show the current round.
    if (voteRows.length > 0) {
      await storageUpdate(gameId, STORAGE_KEY_VOTE_HISTORY, (fresh) => {
        const list = fresh || [];
        const votesMap = {};
        voteRows.forEach((r) => { votesMap[r.voterName] = { target: r.targetName, reason: r.reason }; });
        return [...list, { round, votes: votesMap, banished: leadingTarget || null }];
      });
    }

    const survivors = alive.filter((p) => p.display_name !== leadingTarget);

    // Traitors' own (toggleable) inactivity system — see
    // lib/traitorsInactivity.js's own header comment for exactly what
    // counts as "activity" here and how it's narrowed from Project B's
    // fuller version. Computed BEFORE the votes for this round get
    // deleted below, and against `survivors` (post-banish) since the
    // banished player already has their own elimination on record and
    // has nothing left to be struck for.
    if (settings?.inactivityEnabled) {
      const voterNames = new Set(Object.keys(votes || {}));
      let chatSenderIds = null;
      if (settings.chatEnabled && roundInfo?.startedAt) {
        const groupChat = (await storageGet(gameId, GROUP_CHAT_KEY)) || [];
        chatSenderIds = new Set(groupChat.filter((m) => m.createdAt >= roundInfo.startedAt).map((m) => m.senderId));
      }
      await applyTraitorsRoundInactivity(supabase, gameId, { round, alivePlayers: survivors, voterNames, chatSenderIds });
      await decayTraitorsStrikesIfDue(supabase, gameId, round + 1);
    }

    await storageDelete(gameId, VOTES_KEY_PREFIX + round);
    await storageSet(gameId, STORAGE_KEY_ROUND_INFO, {
      round: round + 1,
      votingOpen: false,
      players: survivors.map((p) => ({ id: p.id, name: p.display_name })),
      startedAt: Date.now(),
    });
    setVotes(null);
    setRevealOrder(null);
    setRevealIndex(-1);
  };

  // Commit a single voter's target/reason directly to game_state. Used both
  // by the host's manual override table and could equally be what a
  // player's own submission does — it's the same underlying record either way.
  const commitVote = async (voterName, patch) => {
    dirtyRef.current.add(voterName);
    await storageUpdate(gameId, VOTES_KEY_PREFIX + round, (fresh) => {
      const existing = fresh || {};
      const current = existing[voterName] || {};
      existing[voterName] = { ...current, ...patch, time: current.time || new Date().toLocaleTimeString() };
      return existing;
    });
    dirtyRef.current.delete(voterName);
  };

  const setDraftField = (voterName, field, value) => {
    dirtyRef.current.add(voterName);
    setDrafts((prev) => ({ ...prev, [voterName]: { ...prev[voterName], [field]: value } }));
  };

  const clearVotes = async () => {
    dirtyRef.current.clear();
    await storageSet(gameId, VOTES_KEY_PREFIX + round, {});
    setDrafts({});
  };

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  return (
    <Card style={{ borderColor: "rgba(201,168,76,0.3)" }}>
      <h3 style={{ color: "#c9a84c", margin: "0 0 10px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
        ⚖️ Roundtable — Round {round}
      </h3>

      {!roundInfo?.votingOpen ? (
        <Btn onClick={openVoting} disabled={alive.length < 2}>Open Voting for Round {round}</Btn>
      ) : (
        <Btn variant="danger" onClick={closeVoting}>Close Voting</Btn>
      )}
      {alive.length < 2 && <p style={{ color: "#c45c3c", fontSize: 11, marginTop: 8 }}>Need at least 2 living players to open voting.</p>}

      <div style={{ marginTop: 10 }}>
        <PostToSlack gameId={gameId} icon="⚖️" label="Roundtable Announcement" text={roundtableAnnouncementScript(round)} />
      </div>

      {roundInfo && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#a09080", textTransform: "uppercase", letterSpacing: 1, margin: "16px 0 10px" }}>
            Votes: {voteRows.length}/{alive.length} in
          </div>

          {/* Manual Vote Entry — live view of every voter's pick + reasoning,
              directly editable so the host can see who voted for whom before
              the reveal, or fill in/correct a vote by hand. */}
          <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            {alive.map((voter) => {
              const draft = drafts[voter.display_name] || { target: "", reason: "" };
              return (
                <div key={voter.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{
                    width: 90, fontSize: 12, fontWeight: 700, color: "#f0e6d3", flexShrink: 0,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {voter.display_name}
                  </span>
                  <select
                    value={draft.target}
                    onChange={(e) => {
                      setDraftField(voter.display_name, "target", e.target.value);
                      commitVote(voter.display_name, { target: e.target.value });
                    }}
                    style={{
                      flex: "0 0 120px", background: "#0a1020", border: "1px solid #253550",
                      borderRadius: 6, padding: "4px 8px", color: "#f0e6d3", fontSize: 12,
                    }}
                  >
                    <option value="">—</option>
                    {alive.filter((p) => p.id !== voter.id).map((t) => (
                      <option key={t.id} value={t.display_name}>{t.display_name}</option>
                    ))}
                  </select>
                  <input
                    value={draft.reason}
                    onChange={(e) => setDraftField(voter.display_name, "reason", e.target.value)}
                    onBlur={(e) => commitVote(voter.display_name, { reason: e.target.value })}
                    placeholder="Reason..."
                    style={{
                      flex: 1, background: "#0a1020", border: "1px solid #253550", borderRadius: 6,
                      padding: "4px 8px", color: "#f0e6d3", fontSize: 12, outline: "none", minWidth: 0,
                    }}
                  />
                </div>
              );
            })}
            {alive.length === 0 && <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>No living players.</p>}
          </div>
          <Btn small variant="ghost" onClick={clearVotes}>Clear Votes</Btn>

          {rankedTargets.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, paddingTop: 12, borderTop: "1px solid #253550" }}>
              {rankedTargets.map(([name, count]) => (
                <span key={name} style={{
                  fontSize: 12, color: name === leadingTarget ? "#c45c3c" : "#a09080",
                  fontWeight: name === leadingTarget ? 700 : 500,
                }}>
                  {name}: {count}
                </span>
              ))}
            </div>
          )}

          {!roundInfo.votingOpen && voteRows.length > 0 && (
            <div style={{ marginTop: 12, borderTop: "1px solid #253550", paddingTop: 12 }}>
              {!revealOrder ? (
                <Btn onClick={startReveal}>Start Dramatic Reveal</Btn>
              ) : (
                <div>
                  <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
                    {revealOrder.slice(0, revealIndex + 1).map((row, i) => (
                      <div key={row.voterName} style={{
                        fontSize: 13, color: "#f0e6d3", background: "#0a1020",
                        border: "1px solid #253550", borderRadius: 8, padding: "8px 12px",
                        opacity: i === revealIndex ? 1 : 0.6,
                      }}>
                        {buildVoteRevealMessage(row, cumulativeTallyThrough(revealOrder, i))}
                      </div>
                    ))}
                  </div>
                  {!revealDone ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn onClick={revealNext}>Reveal Next Vote</Btn>
                      <Btn variant="ghost" small onClick={revealAll}>Reveal All</Btn>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      <p style={{ color: "#c45c3c", fontWeight: 700, marginBottom: 0 }}>
                        {leadingTarget} receives the most votes and is banished.
                      </p>
                      <PostToSlack gameId={gameId} icon="📊" label="Vote Reveal" text={voteRevealScript(voteRows)} />
                      <Btn variant="danger" onClick={banish} disabled={banishing}>
                        {banishing ? "Banishing..." : `Banish ${leadingTarget}`}
                      </Btn>
                      <PostToSlack gameId={gameId} icon="⚖️" label="Banish Announcement" text={banishScript(leadingTarget)} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!roundInfo.votingOpen && revealDone && (
            <div style={{ marginTop: 12 }}>
              <Btn variant="ghost" onClick={nextRound}>Advance to Round {round + 1} →</Btn>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

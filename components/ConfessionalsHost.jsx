import { useState, useEffect } from "react";
import { Btn, Card, Badge } from "./ui";
import {
  CONFESSIONAL_TAGS, fetchAllConfessionals, updateConfessional, subscribeConfessionalsTable,
  subscribeConfessionalPrompts, addConfessionalPrompt, removeConfessionalPrompt, respondToConfessional,
} from "../lib/confessionalsData";
import CopyMessage from "./CopyMessage";

export default function ConfessionalsHost({ gameId, round, players }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterPlayer, setFilterPlayer] = useState("");
  const [filterRound, setFilterRound] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [groupBy, setGroupBy] = useState("none");
  const [compact, setCompact] = useState(true);
  const [promptDraft, setPromptDraft] = useState("");
  const [promptTargets, setPromptTargets] = useState([]); // player ids — empty = everyone
  const [prompts, setPrompts] = useState([]);
  const [recapMode, setRecapMode] = useState(false);
  const [recapSelected, setRecapSelected] = useState([]);
  const [recapOpts, setRecapOpts] = useState({ names: true, anonymous: false, rounds: true, tags: false });
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replySaving, setReplySaving] = useState({});

  // The stored player_name is whatever was actually shown to the player
  // at submission time — their alias, if alias mode was on then. The
  // host's own roster (players prop) always resolves to real names
  // regardless of alias mode (see resolveIdentitiesForHost), so cross-
  // referencing by the stable player_id is what actually tells the host
  // who someone is — the stored alias alone doesn't. Only shown as a
  // parenthetical when it's actually informative (the two differ); no
  // redundant "(Sarah)" next to a name that already says Sarah. Defined
  // this early (rather than down near where it's first used) because the
  // filter/group/search logic further down runs directly during render,
  // not inside a later-firing callback — referencing a const declared
  // after that point would be a temporal-dead-zone crash, not just bad
  // style.
  const byPlayerId = {};
  (players || []).forEach((p) => (byPlayerId[p.id] = p.display_name));
  const identityLabel = (c) => {
    const realName = byPlayerId[c.player_id];
    if (!realName || realName === c.player_name) return c.player_name;
    return `${c.player_name} (${realName})`;
  };

  const reload = async () => {
    const data = await fetchAllConfessionals(gameId);
    setItems(data);
    setLoading(false);
  };

  useEffect(() => {
    reload();
    const unsubscribe = subscribeConfessionalsTable(gameId, reload);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeConfessionalPrompts(gameId, setPrompts);
    return unsubscribe;
  }, [gameId]);

  const unreadCount = items.filter((c) => !c.read_by_host && !c.archived).length;
  const archivedCount = items.filter((c) => c.archived).length;

  const markRead = (id, val = true) => updateConfessional(id, { read_by_host: val }).then(reload);
  const toggleStar = (c) => updateConfessional(c.id, { starred: !c.starred }).then(reload);
  const toggleArchive = (c) => updateConfessional(c.id, { archived: !c.archived }).then(reload);
  const markAllRead = async () => {
    await Promise.all(items.filter((c) => !c.read_by_host).map((c) => updateConfessional(c.id, { read_by_host: true })));
    reload();
  };
  const copyText = (c) => navigator.clipboard.writeText(`${identityLabel(c)}${c.round ? ` (Round ${c.round})` : ""}: ${c.text}`);

  // Compact rows truncate long confessionals to a preview — clicking one
  // expands just that row to show the full text, without switching the
  // whole inbox out of Compact View.
  const toggleExpand = (id) => setExpandedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const saveReply = async (c) => {
    const text = replyDrafts[c.id] ?? c.host_reply ?? "";
    setReplySaving((prev) => ({ ...prev, [c.id]: true }));
    await respondToConfessional(c.id, text);
    setReplySaving((prev) => ({ ...prev, [c.id]: false }));
    reload();
  };

  // Distinct player NAMES that actually appear in the confessional inbox
  // — just for the filter dropdown below. Deliberately not called
  // `players` (that's the roster prop, full player objects, used for the
  // prompt-targeting picker above).
  const playerNamesInInbox = [...new Set(items.map((c) => c.player_name))].sort();
  const rounds = [...new Set(items.map((c) => c.round).filter(Boolean))].sort((a, b) => a - b);
  // For the filter dropdown's display text only — the underlying filter
  // still matches on the raw stored player_name (below), this just makes
  // the option label show who that actually is too.
  const playerNameToLabel = {};
  items.forEach((c) => { if (!playerNameToLabel[c.player_name]) playerNameToLabel[c.player_name] = identityLabel(c); });

  let filtered = items.filter((c) => !c.archived || filterPlayer === "__archived__");
  if (filterPlayer && filterPlayer !== "__archived__") filtered = filtered.filter((c) => c.player_name === filterPlayer);
  if (filterPlayer === "__archived__") filtered = items.filter((c) => c.archived);
  if (filterRound) filtered = filtered.filter((c) => String(c.round) === filterRound);
  if (filterTag) filtered = filtered.filter((c) => c.tags?.includes(filterTag));
  if (unreadOnly) filtered = filtered.filter((c) => !c.read_by_host);
  if (starredOnly) filtered = filtered.filter((c) => c.starred);
  if (search.trim()) {
    const s = search.trim().toLowerCase();
    // identityLabel covers both the stored alias and the real name (when
    // they differ) in one check, so searching "Sarah" finds a
    // confessional stored under her alias too.
    filtered = filtered.filter((c) => identityLabel(c).toLowerCase().includes(s) || c.text.toLowerCase().includes(s) || c.tags?.some((t) => t.toLowerCase().includes(s)));
  }
  filtered = [...filtered].sort((a, b) => sortOrder === "newest" ? new Date(b.created_at) - new Date(a.created_at) : new Date(a.created_at) - new Date(b.created_at));

  const groups = (() => {
    if (groupBy === "none") return [["", filtered]];
    if (groupBy === "player") {
      const m = {};
      filtered.forEach((c) => { (m[identityLabel(c)] = m[identityLabel(c)] || []).push(c); });
      return Object.entries(m);
    }
    if (groupBy === "round") {
      const m = {};
      filtered.forEach((c) => { const k = c.round ? `Round ${c.round}` : "No round"; (m[k] = m[k] || []).push(c); });
      return Object.entries(m);
    }
    if (groupBy === "tag") {
      const m = {};
      filtered.forEach((c) => { (c.tags?.length ? c.tags : ["Untagged"]).forEach((t) => { (m[t] = m[t] || []).push(c); }); });
      return Object.entries(m);
    }
    if (groupBy === "starred") {
      return [["⭐ Starred", filtered.filter((c) => c.starred)], ["Not starred", filtered.filter((c) => !c.starred)]];
    }
    return [["", filtered]];
  })();

  const savePrompt = async () => {
    await addConfessionalPrompt(gameId, promptDraft, round, promptTargets);
    setPromptDraft("");
    setPromptTargets([]);
  };
  const togglePromptTarget = (id) => setPromptTargets((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const deactivatePrompt = async (promptId) => { await removeConfessionalPrompt(gameId, promptId); };

  const buildRecapText = () => {
    const chosen = items.filter((c) => recapSelected.includes(c.id));
    const lines = chosen.map((c) => {
      const who = recapOpts.anonymous ? "Anonymous Confessional" : identityLabel(c);
      const roundPart = recapOpts.rounds && c.round ? `, Round ${c.round}` : "";
      const tagPart = recapOpts.tags && c.tags?.length ? ` [${c.tags.join(", ")}]` : "";
      return `*${who}${roundPart}:*${tagPart}\n"${c.text}"`;
    });
    return `🎥 Panopticon Confessionals\n\n${lines.join("\n\n")}`;
  };

  if (loading) return <Card><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ color: "#f5f0ff", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎥 Confessional Inbox</h3>
          {unreadCount > 0 && <Badge color="#ff3860">{unreadCount} unread</Badge>}
        </div>
        <p style={{ color: "#6b4f99", fontSize: 12, margin: "0 0 10px", fontStyle: "italic" }}>
          Private player confessionals. Visible only here — players can't see each other's, this is never posted automatically.
        </p>

        {/* Prompts */}
        <div style={{ background: "#0d0618", borderRadius: 8, padding: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Confessional Prompts{prompts.length > 0 && ` (${prompts.length} active)`}
          </div>

          {prompts.length > 0 && (
            <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              {prompts.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "#1a0a2e", borderRadius: 6, padding: "6px 10px" }}>
                  <span style={{ fontSize: 12, color: "#f5f0ff" }}>
                    {p.prompt}
                    <span style={{ display: "block", fontSize: 10, color: p.targetPlayerIds ? "#ff2d95" : "#6b4f99", marginTop: 2 }}>
                      {p.targetPlayerIds ? `→ ${p.targetPlayerIds.map((id) => byPlayerId[id] || "?").join(", ")}` : "→ Everyone"}
                    </span>
                  </span>
                  <Btn small variant="ghost" onClick={() => deactivatePrompt(p.id)}>Deactivate</Btn>
                </div>
              ))}
            </div>
          )}

          <input
            value={promptDraft} onChange={(e) => setPromptDraft(e.target.value)} placeholder="e.g. Who do you trust least after tonight?"
            style={{ width: "100%", boxSizing: "border-box", background: "#1a0a2e", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 10px", color: "#f5f0ff", fontSize: 12, marginBottom: 8 }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
            {(players || []).map((p) => {
              const selected = promptTargets.includes(p.id);
              return (
                <button key={p.id} onClick={() => togglePromptTarget(p.id)} style={{
                  fontSize: 11, padding: "4px 10px", borderRadius: 12, cursor: "pointer",
                  background: selected ? "rgba(255,45,149,0.15)" : "transparent",
                  border: `1px solid ${selected ? "#ff2d95" : "#3d1f5c"}`,
                  color: selected ? "#ff2d95" : "#a68fd6",
                }}>{selected ? "✓ " : ""}{p.display_name}</button>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "#6b4f99", fontStyle: "italic" }}>
              {promptTargets.length === 0 ? "No one selected — sends to everyone." : `Sends only to ${promptTargets.length} selected player${promptTargets.length === 1 ? "" : "s"}.`}
            </span>
            <Btn small onClick={savePrompt} disabled={!promptDraft.trim()}>Send Prompt</Btn>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          <select value={filterPlayer} onChange={(e) => setFilterPlayer(e.target.value)} style={selStyle}>
            <option value="">All players</option>
            {playerNamesInInbox.map((p) => <option key={p} value={p}>{playerNameToLabel[p] || p}</option>)}
            <option value="__archived__">📦 Archived only</option>
          </select>
          <select value={filterRound} onChange={(e) => setFilterRound(e.target.value)} style={selStyle}>
            <option value="">All rounds</option>
            {rounds.map((r) => <option key={r} value={r}>Round {r}</option>)}
          </select>
          <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} style={selStyle}>
            <option value="">All tags</option>
            {CONFESSIONAL_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={selStyle}>
            <option value="none">No grouping</option>
            <option value="player">Group by player</option>
            <option value="round">Group by round</option>
            <option value="tag">Group by tag</option>
            <option value="starred">Group by starred</option>
          </select>
          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} style={selStyle}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search confessionals..."
            style={{ ...selStyle, flex: 1, minWidth: 160 }} />
          <label style={toggleLabel}><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> Unread only</label>
          <label style={toggleLabel}><input type="checkbox" checked={starredOnly} onChange={(e) => setStarredOnly(e.target.checked)} /> Starred only</label>
          <button onClick={() => setCompact(!compact)} style={{ ...selStyle, cursor: "pointer" }}>{compact ? "Expanded View" : "Compact View"}</button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn small variant="ghost" onClick={markAllRead} disabled={unreadCount === 0}>Mark All Read</Btn>
          <Btn small variant="ghost" onClick={() => setRecapMode(!recapMode)}>{recapMode ? "Exit Recap Builder" : "Build Recap"}</Btn>
          {archivedCount > 0 && (
            <Btn small variant={filterPlayer === "__archived__" ? "success" : "ghost"} onClick={() => setFilterPlayer(filterPlayer === "__archived__" ? "" : "__archived__")}>
              {filterPlayer === "__archived__" ? "◀ Back to Inbox" : `📦 View Archived (${archivedCount})`}
            </Btn>
          )}
        </div>
      </Card>

      {recapMode && (
        <Card style={{ borderColor: "rgba(0,217,255,0.3)" }}>
          <h3 style={{ color: "#f5f0ff", margin: "0 0 8px", fontSize: 14 }}>Build Recap</h3>
          <p style={{ fontSize: 11, color: "#6b4f99", margin: "0 0 8px", fontStyle: "italic" }}>Check the confessionals to include, choose options, then post or copy.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <label style={toggleLabel}><input type="checkbox" checked={recapOpts.names} onChange={(e) => setRecapOpts({ ...recapOpts, names: e.target.checked, anonymous: e.target.checked ? false : recapOpts.anonymous })} /> Include names</label>
            <label style={toggleLabel}><input type="checkbox" checked={recapOpts.anonymous} onChange={(e) => setRecapOpts({ ...recapOpts, anonymous: e.target.checked, names: e.target.checked ? false : recapOpts.names })} /> Anonymous instead</label>
            <label style={toggleLabel}><input type="checkbox" checked={recapOpts.rounds} onChange={(e) => setRecapOpts({ ...recapOpts, rounds: e.target.checked })} /> Include round</label>
            <label style={toggleLabel}><input type="checkbox" checked={recapOpts.tags} onChange={(e) => setRecapOpts({ ...recapOpts, tags: e.target.checked })} /> Include tags</label>
          </div>
          <div style={{ display: "grid", gap: 4, marginBottom: 10, maxHeight: 200, overflowY: "auto" }}>
            {items.filter((c) => !c.archived).map((c) => (
              <label key={c.id} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: "#a68fd6" }}>
                <input type="checkbox" checked={recapSelected.includes(c.id)} onChange={(e) => setRecapSelected(e.target.checked ? [...recapSelected, c.id] : recapSelected.filter((x) => x !== c.id))} style={{ marginTop: 3 }} />
                <span>{c.starred && "⭐ "}<strong style={{ color: "#f5f0ff" }}>{identityLabel(c)}</strong> — {c.text.slice(0, 80)}{c.text.length > 80 ? "..." : ""}</span>
              </label>
            ))}
          </div>
          {recapSelected.length > 0 && (
            <CopyMessage icon="🎥" label="Copy Confessional Recap" text={buildRecapText()} />
          )}
        </Card>
      )}

      {groups.map(([label, groupItems]) => (
        <div key={label || "all"}>
          {label && <div style={{ fontSize: 12, fontWeight: 700, color: "#ff2d95", textTransform: "uppercase", letterSpacing: 0.5, margin: "4px 0 8px" }}>{label} ({groupItems.length})</div>}
          <div style={{ display: "grid", gap: 8 }}>
            {groupItems.length === 0 ? (
              <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>No confessionals match these filters.</p>
            ) : groupItems.map((c) => (
              <Card key={c.id} style={{
                borderColor: !c.read_by_host ? "rgba(255,45,149,0.5)" : "#3d1f5c",
                background: !c.read_by_host ? "rgba(255,45,149,0.06)" : "#150a28",
              }}>
                {compact ? (
                  <div
                    onClick={() => c.text.length > 70 && toggleExpand(c.id)}
                    style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", cursor: c.text.length > 70 ? "pointer" : "default" }}
                  >
                    <span style={{ fontSize: 12, color: "#a68fd6" }}>
                      {!c.read_by_host && <strong style={{ color: "#ff2d95" }}>● </strong>}
                      <strong style={{ color: "#f5f0ff" }}>{identityLabel(c)}</strong>
                      {c.round ? ` · Round ${c.round}` : ""}{c.tags?.length ? ` · ${c.tags.join(", ")}` : ""}
                      {" · "}"{expandedIds.has(c.id) || c.text.length <= 70 ? c.text : c.text.slice(0, 70) + "..."}"
                    </span>
                    <span style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                      {c.host_reply && <span title="You replied">💬</span>}
                      {c.starred && <span>⭐</span>}
                      {c.text.length > 70 && <span style={{ color: "#6b4f99", fontSize: 10 }}>{expandedIds.has(c.id) ? "▲ collapse" : "▼ expand"}</span>}
                    </span>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#f5f0ff" }}>
                        {!c.read_by_host && <strong style={{ color: "#ff2d95" }}>● </strong>}
                        {identityLabel(c)}{c.round ? ` · Round ${c.round}` : ""}
                      </span>
                      <span style={{ fontSize: 11, color: "#6b4f99" }}>{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    {c.tags?.length > 0 && (
                      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                        {c.tags.map((t) => <Badge key={t} color="#00d9ff">{t}</Badge>)}
                      </div>
                    )}
                    <p style={{ fontSize: 14, color: "#f5f0ff", margin: "0 0 8px", lineHeight: 1.5 }}>{c.text}</p>
                  </>
                )}

                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #3d1f5c" }}>
                    {c.host_reply && (
                      <div style={{ background: "rgba(0,217,255,0.08)", border: "1px solid rgba(0,217,255,0.3)", borderRadius: 6, padding: "6px 10px", marginBottom: 6 }}>
                        <div style={{ fontSize: 10, color: "#00d9ff", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Your private reply</div>
                        <div style={{ fontSize: 12, color: "#f5f0ff" }}>{c.host_reply}</div>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        value={replyDrafts[c.id] ?? c.host_reply ?? ""}
                        onChange={(e) => setReplyDrafts({ ...replyDrafts, [c.id]: e.target.value })}
                        placeholder={c.host_reply ? "Edit your private reply..." : "Reply privately — only they'll see this..."}
                        style={{ flex: 1, background: "#1a0a2e", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 10px", color: "#f5f0ff", fontSize: 12 }}
                      />
                      <Btn small onClick={() => saveReply(c)} disabled={replySaving[c.id]}>
                        {replySaving[c.id] ? "Sending..." : c.host_reply ? "Update" : "Send"}
                      </Btn>
                    </div>
                  </div>

                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <Btn small variant="ghost" onClick={() => markRead(c.id, !c.read_by_host)}>{c.read_by_host ? "Mark Unread" : "Mark Read"}</Btn>
                  <Btn small variant={c.starred ? "success" : "ghost"} onClick={() => toggleStar(c)}>{c.starred ? "★ Starred" : "☆ Star"}</Btn>
                  <Btn small variant="ghost" onClick={() => toggleArchive(c)}>{c.archived ? "Unarchive" : "Archive"}</Btn>
                  <Btn small variant="ghost" onClick={() => copyText(c)}>Copy</Btn>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const selStyle = {
  background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 8px",
  color: "#f5f0ff", fontSize: 12,
};
const toggleLabel = { display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#a68fd6", cursor: "pointer" };

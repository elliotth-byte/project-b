// Moved to lib/challenges/registry.js as part of extracting a shared,
// game-type-agnostic challenge engine (Project B, Traitors, and future
// game types all draw mini-games from the same registry — see
// README.md's "Game types" section). This file is kept as a
// backward-compatible re-export so none of this app's existing ~40
// import sites needed to change; new code should import from
// lib/challenges/registry directly.
export * from "./challenges/registry";

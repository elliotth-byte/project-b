import { boomboxFileFor } from "../lib/playerColors";

// ─── Stereo Types — the boombox graphic ───
// Real sourced artwork (public/stereo-types/boombox/) replacing the
// earlier hand-drawn inline-SVG version — 14 separate full-color
// illustrations, one per lib/playerColors.js entry (see that file's own
// comment on the hex->file mapping), NOT one shape recolored via a
// single fill the way the old SVG worked. That's why there's no more
// DETAIL_COLOR/tinting logic here at all: the color choice now selects
// which whole image to load, full stop.
//
// Canvas is a 4:3 ratio (originally 960x720 per the asset pack's own
// README; downsampled to 480x360 afterward purely to cut file size —
// see that resize's own note in the repo history — same ratio either
// way, so nothing below actually depends on the exact pixel count).
// Height is
// still derived from `size` the same way the old viewBox math did, so
// every existing caller (StereoTypesPlayerPanels.jsx,
// StereoTypesHostPanels.jsx, StereoTypesIdentityPicker.jsx) keeps
// working unchanged at whatever size/label props it already passes.
//
// Sticker placement is an absolutely-positioned overlay at the exact
// coordinates the asset pack's README specifies (24.5%/62% of the
// canvas, centered on that point) — percentage-based rather than fixed
// pixels so it stays correctly placed at every rendered size, from the
// 56px roster thumbnails up to the 160px card. Sticker size itself
// scales off `size` for the same reason the old badge did.
const STICKER_LEFT_PCT = 24.5;
const STICKER_TOP_PCT = 62;

export default function Boombox({ color, stickerId, label, size = 120 }) {
  const file = boomboxFileFor(color);
  const height = size * (720 / 960);
  const stickerSize = Math.max(14, size * 0.22);

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: size, height }}>
        <img
          src={`/stereo-types/boombox/boombox-${file}.png`}
          alt=""
          width={size}
          height={height}
          style={{ display: "block", width: size, height, objectFit: "contain" }}
        />
        {stickerId && (
          <img
            src={`/stereo-types/stickers/sticker-${stickerId}.png`}
            alt=""
            width={stickerSize}
            height={stickerSize}
            style={{
              position: "absolute", left: `${STICKER_LEFT_PCT}%`, top: `${STICKER_TOP_PCT}%`,
              transform: "translate(-50%, -50%)", width: stickerSize, height: stickerSize,
            }}
          />
        )}
      </div>
      {label && (
        // A small cassette-label plate rather than bare text — border and
        // glow use the player's OWN body color (still the raw hex, not
        // the image file — this part never needed to change), so the tag
        // visually ties back to the box above it (particularly noticeable
        // in the roster grid, where several different-colored boomboxes
        // sit side by side). The two little reel dots echo the
        // cassette-deck window in the boombox artwork itself. Everything
        // here scales off `size` rather than fixed pixel values, since
        // this renders as small as 56px (roster rows) and as large as
        // 160px (a player's own card).
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: Math.max(3, size * 0.035),
            background: "#0a0e18",
            border: `1.5px solid ${color || "#f4c430"}`,
            borderRadius: 999,
            padding: `${Math.max(2, size * 0.02)}px ${Math.max(8, size * 0.09)}px`,
            boxShadow: `0 0 ${Math.max(4, size * 0.07)}px ${color || "#f4c430"}66`,
          }}
        >
          <span style={{ width: Math.max(3, size * 0.03), height: Math.max(3, size * 0.03), borderRadius: "50%", border: `1px solid ${color || "#f4c430"}`, flexShrink: 0 }} />
          <span
            style={{
              color: "#f5eddc", fontSize: Math.max(9, size * 0.075), fontWeight: 700,
              fontFamily: "'Anton', 'Arial Narrow', sans-serif", letterSpacing: 0.5,
              textTransform: "uppercase", whiteSpace: "nowrap",
            }}
          >
            {label}
          </span>
          <span style={{ width: Math.max(3, size * 0.03), height: Math.max(3, size * 0.03), borderRadius: "50%", border: `1px solid ${color || "#f4c430"}`, flexShrink: 0 }} />
        </div>
      )}
    </div>
  );
}

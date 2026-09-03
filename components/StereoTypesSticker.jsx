// ─── Stereo Types — sticker art ───
// Real sourced artwork now (public/stereo-types/stickers/), replacing
// the earlier hand-drawn single-color SVG shapes. Every id in
// lib/stereoTypesStickers.js's STICKER_CATALOG has a matching
// sticker-<id>.png here.
//
// `color` is accepted but unused — the old SVG version used it to tint
// its single-color shape to match whatever context it was badged onto
// (a boombox's dark detail color, a picker's accent color, etc.). Real
// multi-color artwork can't be tinted the same way, so callers that
// still pass it (components/StereoTypesFinalStandings.jsx,
// components/StereoTypesIdentityPicker.jsx) keep working unchanged —
// the prop is just a no-op now rather than something to strip from
// every call site.
export default function StereoTypesSticker({ stickerId, size = 32 }) {
  if (!stickerId) return null;

  return (
    <img
      src={`/stereo-types/stickers/sticker-${stickerId}.png`}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain", display: "block" }}
    />
  );
}

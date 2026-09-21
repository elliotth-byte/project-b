import { tilePathsD, tileMatchingFor, INK, CLAY } from "../../lib/games/tsuroTileArt";

// Shared tile face — a schematic black-figure-pottery-style rendering
// (see lib/games/tsuroTileArt.js) reused everywhere a River Styx or
// Wine-Dark Sea tile needs to show up: a hand preview, a board cell, a
// blank/empty cell placeholder.
export default function TsuroTileSvg({ designIndex, rotation = 0, size = 48, empty = false, dim = false }) {
  const matching = designIndex != null ? tileMatchingFor(designIndex, rotation) : null;
  const paths = matching ? tilePathsD(matching) : [];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block", opacity: dim ? 0.45 : 1 }}>
      <rect x={1} y={1} width={98} height={98} rx={6} fill={empty ? "#150a1f" : INK} stroke="#3d1f5c" strokeWidth={2} />
      {paths.map((d, i) => (
        <g key={i}>
          <path d={d} stroke={INK} strokeWidth={11} fill="none" strokeLinecap="round" />
          <path d={d} stroke={CLAY} strokeWidth={6} fill="none" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}

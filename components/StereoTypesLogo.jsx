// ─── Stereo Types — the blocky wordmark ───
// "That same yellow is used for the big blocky STEREO TYPES logo." No
// external art asset (unlike Cruel Summer House's own logo elsewhere in
// this app) — this is 'Anton' (already loaded, see pages/_app.jsx) plus
// a stack of offset, flat-color text-shadow layers faking a chunky
// extruded-block look: a slightly darker gold "bevel" layer right
// behind the letters, then two navy layers receding further back and
// darker, all colors pulled straight from lib/uiTheme.js's stereo_types
// palette rather than introducing anything new.
const SHADOW_STEPS = [
  [3, "#c99a1e"],
  [6, "#0a0e18"],
  [9, "#0a0e18"],
  [12, "#05070d"],
];

export default function StereoTypesLogo({ size = "large" }) {
  const isLarge = size === "large";
  const scale = isLarge ? 1 : 0.4;
  const textShadow = SHADOW_STEPS.map(([d, c]) => `${d * scale}px ${d * scale}px 0 ${c}`).join(", ");

  return (
    <div
      style={{
        fontFamily: "'Anton', 'Arial Narrow', sans-serif",
        color: "#f4c430",
        textTransform: "uppercase",
        letterSpacing: isLarge ? 4 : 1.5,
        lineHeight: 1.05,
        textAlign: "center",
        fontSize: isLarge ? 56 : 20,
        textShadow,
        userSelect: "none",
      }}
    >
      {isLarge ? (
        <>
          <div>STEREO</div>
          <div>TYPES</div>
        </>
      ) : (
        "STEREO TYPES"
      )}
    </div>
  );
}

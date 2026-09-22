// Shared by every game with directional movement (Frogger, the three
// maze variants, Snake) — a proper D-Pad shape (up top-center, left/
// empty-center/right on the middle row, down bottom-center), rather
// than each game rolling its own slightly different arrow-button
// layout. Some of those (Frogger, Snake) were previously a compressed
// 2-row layout instead of a true D-Pad; this is the standardized shape
// going forward everywhere.
export default function DPad({ onUp, onDown, onLeft, onRight, disabled = false, opacity = 1 }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "44px 44px 44px", gridTemplateRows: "44px 44px 44px",
      gap: 4, margin: "0 auto", width: "fit-content", opacity,
    }}>
      <div />
      <button onClick={onUp} disabled={disabled} style={arrowStyle}>↑</button>
      <div />
      <button onClick={onLeft} disabled={disabled} style={arrowStyle}>←</button>
      <div />
      <button onClick={onRight} disabled={disabled} style={arrowStyle}>→</button>
      <div />
      <button onClick={onDown} disabled={disabled} style={arrowStyle}>↓</button>
      <div />
    </div>
  );
}

const arrowStyle = {
  width: 44, height: 44, borderRadius: 8, background: "#0d0618", border: "1px solid #3d1f5c",
  color: "#f5f0ff", fontSize: 18, cursor: "pointer",
};

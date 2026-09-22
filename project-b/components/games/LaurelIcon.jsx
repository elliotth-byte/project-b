// ─── Laurel Thief — Laurel Icon ───
// Same hand-drawn SVG approach as this app's other game icon files
// (see e.g. components/games/EyesInTheSystemIcons.jsx). A single
// laurel sprig — two curved rows of leaves meeting at a stem — this
// game's only real visual, shown once per laurel a player currently
// holds.
export function LaurelIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d="M16,4 C16,4 12,10 12,18 C12,24 16,28 16,28" stroke="#3d8a4a" strokeWidth="1.5" fill="none" />
      <path d="M16,4 C16,4 20,10 20,18 C20,24 16,28 16,28" stroke="#3d8a4a" strokeWidth="1.5" fill="none" />
      {[6, 10, 14, 18, 22].map((y, i) => (
        <g key={i}>
          <ellipse cx={12 - i * 0.3} cy={y} rx="3.2" ry="1.6" fill="#4caf5f" stroke="#2e6b3a" strokeWidth="0.6" transform={`rotate(-35 ${12 - i * 0.3} ${y})`} />
          <ellipse cx={20 + i * 0.3} cy={y} rx="3.2" ry="1.6" fill="#4caf5f" stroke="#2e6b3a" strokeWidth="0.6" transform={`rotate(35 ${20 + i * 0.3} ${y})`} />
        </g>
      ))}
    </svg>
  );
}

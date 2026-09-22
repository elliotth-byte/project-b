import Link from "next/link";

// A small, consistent "back to home" link used across every page's header.
// theme is optional — every existing call site keeps its old pink/
// Orbitron look by default; pages that already compute their own
// per-game or site theme (host.jsx, play.jsx, the pre-login pages) pass
// it through so this matches instead of clashing against it.
export default function HomeLink({ theme } = {}) {
  return (
    <Link href="/" style={{
      color: theme?.textMuted || "#a68fd6", fontSize: 12, textDecoration: "none",
      fontFamily: theme?.font || "'Orbitron', 'Segoe UI', sans-serif",
    }}>
      {theme ? "🏠 Home" : "🃏 Home"}
    </Link>
  );
}

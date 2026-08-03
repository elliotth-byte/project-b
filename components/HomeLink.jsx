import Link from "next/link";

// A small, consistent "back to home" link used across every page's header.
export default function HomeLink() {
  return (
    <Link href="/" style={{
      color: "#a09080", fontSize: 12, textDecoration: "none",
      fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
    }}>
      🃏 Home
    </Link>
  );
}

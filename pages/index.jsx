import Link from "next/link";
import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();
  const game = router.query.game;
  const withGame = (path) => (game ? `${path}?game=${game}` : path);

  return (
    <div style={pageStyle}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 12, letterSpacing: 6, textTransform: "uppercase", color: "#c9a84c", marginBottom: 12 }}>✦</div>
        <h1 style={{ fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", fontSize: 26, marginBottom: 6 }}>
          Project B
        </h1>
        <p style={{ color: "#a09080", fontSize: 14, marginBottom: 28, fontStyle: "italic" }}>
          Survive the challenges. Survive the votes. Win the final vote.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href={withGame("/signup")} style={linkBtn}>👤 New player — Create account</Link>
          <Link href={withGame("/login")} style={linkBtn}>⚔️ Returning player — Log in</Link>
          <Link href="/host" style={{ ...linkBtn, borderColor: "#c9a84c", color: "#c9a84c" }}>👑 I'm the Host</Link>
        </div>
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #0c1425, #14203a)",
  color: "#f0e6d3",
  fontFamily: "'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const linkBtn = {
  display: "block",
  padding: "12px 18px",
  borderRadius: 10,
  border: "1px solid #253550",
  background: "#0e1830",
  color: "#f0e6d3",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
};

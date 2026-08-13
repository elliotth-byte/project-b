import Link from "next/link";
import { useRouter } from "next/router";
import LogoutButton from "../components/LogoutButton";

export default function Home() {
  const router = useRouter();
  const game = router.query.game;
  const withGame = (path) => (game ? `${path}?game=${game}` : path);

  return (
    <div style={pageStyle}>
      <div style={{ position: "absolute", top: 20, right: 24 }}><LogoutButton /></div>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 12, letterSpacing: 6, textTransform: "uppercase", color: "#ff2d95", marginBottom: 12 }}>✦</div>
        <h1 style={{ fontFamily: "'Orbitron', 'Segoe UI', sans-serif", fontSize: 26, marginBottom: 6 }}>
          Project B
        </h1>
        <p style={{ color: "#a68fd6", fontSize: 14, marginBottom: 28, fontStyle: "italic" }}>
          Dominate the battles. Manipulate the vote. Build your own mythology.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href={withGame("/signup")} style={linkBtn}>👤 New player — Create account</Link>
          <Link href={withGame("/login")} style={linkBtn}>⚔️ Returning player — Log in</Link>
          <Link href="/host" style={{ ...linkBtn, borderColor: "#ff2d95", color: "#ff2d95" }}>👑 I'm the Host</Link>
        </div>
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #05010f, #1a0a2e)",
  color: "#f5f0ff",
  fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const linkBtn = {
  display: "block",
  padding: "12px 18px",
  borderRadius: 10,
  border: "1px solid #3d1f5c",
  background: "#150a28",
  color: "#f5f0ff",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
};

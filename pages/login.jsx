import { useState } from "react";
import { useRouter } from "next/router";
import { signInPlayer } from "../lib/auth";
import HomeLink from "../components/HomeLink";
import LogoutButton from "../components/LogoutButton";
import { SITE_THEME } from "../lib/siteTheme";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signInPlayer(username, password);
    setLoading(false);
    if (!res.ok) { setError(res.error); return; }
    const game = router.query.game;
    router.push(game ? `/play?game=${game}` : "/play");
  };

  return (
    <div style={pageStyle}>
      <form onSubmit={submit} style={{ textAlign: "center", maxWidth: 320, width: "100%" }}>
        <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <HomeLink theme={SITE_THEME} />
          <LogoutButton theme={SITE_THEME} />
        </div>
        <h2 style={{ fontFamily: SITE_THEME.font, fontSize: 22, marginBottom: 16 }}>
          Log in
        </h2>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoFocus
          style={inputStyle}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          style={inputStyle}
        />
        {error && <p style={{ color: SITE_THEME.danger, fontSize: 13, margin: "6px 0" }}>{error}</p>}
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? "Logging in..." : "Log in"}
        </button>
        <p style={{ color: SITE_THEME.textDim, fontSize: 12, marginTop: 14 }}>
          New here?{" "}
          <a href={router.query.game ? `/signup?game=${router.query.game}` : "/signup"} style={{ color: SITE_THEME.accent }}>
            Create an account
          </a>
        </p>
      </form>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh", background: SITE_THEME.pageBg, color: SITE_THEME.text,
  fontFamily: SITE_THEME.font, display: "flex",
  alignItems: "center", justifyContent: "center", padding: 24,
};
const inputStyle = {
  display: "block", width: "100%", background: SITE_THEME.inputBg, border: `1px solid ${SITE_THEME.border}`,
  borderRadius: 8, padding: "10px 14px", color: SITE_THEME.text, fontSize: 14, outline: "none", marginBottom: 10,
  boxSizing: "border-box",
};
const btnStyle = {
  width: "100%", background: SITE_THEME.accentGradient, color: SITE_THEME.accentText,
  border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer",
};

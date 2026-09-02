import { useState } from "react";
import { useRouter } from "next/router";
import { signInPlayer } from "../lib/auth";
import HomeLink from "../components/HomeLink";
import LogoutButton from "../components/LogoutButton";
import { useSiteTheme } from "../lib/siteTheme";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { theme } = useSiteTheme();
  const pageStyle = {
    minHeight: "100vh", background: theme.pageBg, color: theme.text,
    fontFamily: theme.font, display: "flex",
    alignItems: "center", justifyContent: "center", padding: 24,
  };
  const inputStyle = {
    display: "block", width: "100%", background: theme.inputBg, border: `1px solid ${theme.border}`,
    borderRadius: 8, padding: "10px 14px", color: theme.text, fontSize: 14, outline: "none", marginBottom: 10,
    boxSizing: "border-box",
  };
  const btnStyle = {
    width: "100%", background: theme.accentGradient, color: theme.accentText,
    border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer",
  };

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
          <HomeLink theme={theme} />
          <LogoutButton theme={theme} />
        </div>
        <h2 style={{ fontFamily: theme.font, fontSize: 22, marginBottom: 16 }}>
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
        {error && <p style={{ color: theme.danger, fontSize: 13, margin: "6px 0" }}>{error}</p>}
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? "Logging in..." : "Log in"}
        </button>
        <p style={{ color: theme.textDim, fontSize: 12, marginTop: 14 }}>
          New here?{" "}
          <a href={router.query.game ? `/signup?game=${router.query.game}` : "/signup"} style={{ color: theme.accent }}>
            Create an account
          </a>
        </p>
      </form>
    </div>
  );
}

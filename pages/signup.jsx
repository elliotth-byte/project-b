import { useState } from "react";
import { useRouter } from "next/router";
import { signUpPlayer } from "../lib/auth";
import HomeLink from "../components/HomeLink";
import LogoutButton from "../components/LogoutButton";
import { useSiteTheme } from "../lib/siteTheme";

export default function Signup() {
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
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    const res = await signUpPlayer(username, password);
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
          Create your account
        </h2>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Choose a username"
          autoFocus
          style={inputStyle}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Choose a password (6+ characters)"
          style={inputStyle}
        />
        {error && <p style={{ color: theme.danger, fontSize: 13, margin: "6px 0" }}>{error}</p>}
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? "Creating..." : "Create account"}
        </button>
        <p style={{ color: theme.textDim, fontSize: 12, marginTop: 14 }}>
          Already have an account?{" "}
          <a href={router.query.game ? `/login?game=${router.query.game}` : "/login"} style={{ color: theme.accent }}>
            Log in
          </a>
        </p>
        <p style={{ color: theme.textDim, fontSize: 12, marginTop: 6 }}>
          <a href="/login" style={{ color: theme.accent }}>
            Host a game instead
          </a>
        </p>
      </form>
    </div>
  );
}

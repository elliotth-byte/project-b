import { useState } from "react";
import { useRouter } from "next/router";
import { signUpPlayer } from "../lib/auth";
import HomeLink from "../components/HomeLink";
import LogoutButton from "../components/LogoutButton";
import { SITE_THEME } from "../lib/siteTheme";

export default function Signup() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
          <HomeLink theme={SITE_THEME} />
          <LogoutButton theme={SITE_THEME} />
        </div>
        <h2 style={{ fontFamily: SITE_THEME.font, fontSize: 22, marginBottom: 16 }}>
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
        {error && <p style={{ color: SITE_THEME.danger, fontSize: 13, margin: "6px 0" }}>{error}</p>}
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? "Creating..." : "Create account"}
        </button>
        <p style={{ color: SITE_THEME.textDim, fontSize: 12, marginTop: 14 }}>
          Already have an account?{" "}
          <a href={router.query.game ? `/login?game=${router.query.game}` : "/login"} style={{ color: SITE_THEME.accent }}>
            Log in
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

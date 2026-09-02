import { useState } from "react";
import { useRouter } from "next/router";
import { signInPlayer, signUpHost } from "../lib/auth";
import HomeLink from "../components/HomeLink";
import LogoutButton from "../components/LogoutButton";
import { useSiteTheme } from "../lib/siteTheme";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Toggles this page from the default player sign-in into a self-serve
  // "become a host" form. Hosting used to require someone to hand-create
  // an account from the Supabase dashboard (see the comment on
  // signUpHost in lib/auth.js) — this just exposes that same, already-
  // existing function from the UI instead of requiring dashboard access.
  // Note this always creates a NEW host account; it doesn't turn the
  // player account you might already be logged in as into a host — those
  // stay separate identities, same as signUpPlayer/signUpHost always have.
  const [hostMode, setHostMode] = useState(false);
  const [hostEmail, setHostEmail] = useState("");
  const [hostPassword, setHostPassword] = useState("");
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

  const submitHostSignup = async (e) => {
    e.preventDefault();
    setError("");
    if (hostPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    const res = await signUpHost(hostEmail, hostPassword);
    setLoading(false);
    if (!res.ok) { setError(res.error); return; }
    router.push("/host");
  };

  if (hostMode) {
    return (
      <div style={pageStyle}>
        <form onSubmit={submitHostSignup} style={{ textAlign: "center", maxWidth: 320, width: "100%" }}>
          <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <HomeLink theme={theme} />
            <LogoutButton theme={theme} />
          </div>
          <h2 style={{ fontFamily: theme.font, fontSize: 22, marginBottom: 4 }}>
            Host a game
          </h2>
          <p style={{ color: theme.textDim, fontSize: 12, marginBottom: 16 }}>
            This creates a brand-new host account — separate from any player account.
          </p>
          <input
            type="email"
            value={hostEmail}
            onChange={(e) => setHostEmail(e.target.value)}
            placeholder="Email"
            autoFocus
            style={inputStyle}
          />
          <input
            type="password"
            value={hostPassword}
            onChange={(e) => setHostPassword(e.target.value)}
            placeholder="Choose a password (6+ characters)"
            style={inputStyle}
          />
          {error && <p style={{ color: theme.danger, fontSize: 13, margin: "6px 0" }}>{error}</p>}
          <button type="submit" disabled={loading} style={btnStyle}>
            {loading ? "Creating..." : "Create host account"}
          </button>
          <p style={{ color: theme.textDim, fontSize: 12, marginTop: 14 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); setError(""); setHostMode(false); }} style={{ color: theme.accent }}>
              Back to player log in
            </a>
          </p>
        </form>
      </div>
    );
  }

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
        <p style={{ color: theme.textDim, fontSize: 12, marginTop: 6 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); setError(""); setHostMode(true); }} style={{ color: theme.accent }}>
            Host a game instead
          </a>
        </p>
      </form>
    </div>
  );
}

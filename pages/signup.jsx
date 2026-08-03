import { useState } from "react";
import { useRouter } from "next/router";
import { signUpPlayer } from "../lib/auth";
import HomeLink from "../components/HomeLink";

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
        <div style={{ marginBottom: 16 }}><HomeLink /></div>
        <h2 style={{ fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", fontSize: 22, marginBottom: 16 }}>
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
        {error && <p style={{ color: "#c45c3c", fontSize: 13, margin: "6px 0" }}>{error}</p>}
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? "Creating..." : "Create account"}
        </button>
        <p style={{ color: "#706050", fontSize: 12, marginTop: 14 }}>
          Already have an account?{" "}
          <a href={router.query.game ? `/login?game=${router.query.game}` : "/login"} style={{ color: "#c9a84c" }}>
            Log in
          </a>
        </p>
      </form>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh", background: "linear-gradient(180deg, #0c1425, #14203a)", color: "#f0e6d3",
  fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", display: "flex",
  alignItems: "center", justifyContent: "center", padding: 24,
};
const inputStyle = {
  display: "block", width: "100%", background: "#0a1020", border: "1px solid #253550",
  borderRadius: 8, padding: "10px 14px", color: "#f0e6d3", fontSize: 14, outline: "none", marginBottom: 10,
  boxSizing: "border-box",
};
const btnStyle = {
  width: "100%", background: "linear-gradient(135deg, #c9a84c, #a5822f)", color: "#0c1425",
  border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer",
};

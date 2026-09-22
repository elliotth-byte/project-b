import HomeLink from "../components/HomeLink";

// ─── Terms & Community Guidelines ───
// Written for App Store Guideline 1.2 (User-Generated Content), which
// specifically expects a EULA that "makes it clear there is no
// tolerance for objectionable content," alongside the actual
// mechanisms it also requires: reporting (see lib/chatData.js's
// reportChatMessage, lib/adminModeration.js's review queue) and
// blocking (see lib/blockedUsers.js), both already built. This page is
// what pages/signup.jsx links to and requires agreement to before an
// account can be created (see that file's own acceptedTermsAt field).
//
// The contact email below is the actual, real one this app uses for
// Apple's "published developer contact information" requirement under
// this same guideline — needs to stay a real, monitored address, since
// Apple expects reports routed here to get a response within 24 hours.
const CONTACT_EMAIL = "elliotthay@gmail.com";

export default function TermsPage() {
  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 560, width: "100%", margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}><HomeLink /></div>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>Terms & Community Guidelines</h1>
        <p style={{ color: "#6b4f99", fontSize: 12, marginBottom: 24 }}>Last updated {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long" })}</p>

        <Section title="1. What this app is">
          <p>This is a social party-game platform where a host runs a season and invites real people to play together — group chat, direct messages, and gameplay that involves interacting with other real players throughout.</p>
        </Section>

        <Section title="2. No tolerance for objectionable content">
          <p>There is no tolerance for content or behavior that is threatening, harassing, hateful, illegal, or that encourages self-harm or harm to others — in chat, direct messages, profile photos, or anywhere else in the app. This applies regardless of whether it's directed at another player, a host, or anyone else.</p>
          <p>Accounts that violate this will have the offending content removed and may be suspended or permanently removed from the platform, at our discretion, without prior notice.</p>
        </Section>

        <Section title="3. Reporting and blocking">
          <p>Every message in group chat and direct messages can be reported directly from the message itself. Reports go to the platform's admins (not the game's host) and are reviewed, with action taken on genuine violations, within 24 hours.</p>
          <p>You can also block another player directly. Once blocked, you won't see their messages, and they can't start new direct message conversations with you. Blocking is entirely under your own control and isn't visible to anyone else.</p>
        </Section>

        <Section title="4. Your content">
          <p>You're responsible for what you post. Don't post anything you don't have the right to share.</p>
        </Section>

        <Section title="5. Account & data">
          <p>Creating an account requires a username and password; hosts may additionally collect a real name and other season-specific information directly from you as part of running their season. Photos you upload are visible to other players in the same season. You can request your account and its data be deleted at any time by contacting us below.</p>
        </Section>

        <Section title="6. Contact">
          <p>
            Questions, concerns, or something urgent that can't wait for the in-app report queue — reach us directly at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#ff2d95" }}>{CONTACT_EMAIL}</a>.
          </p>
        </Section>

        <Section title="7. Changes">
          <p>These terms may be updated from time to time. Continued use of the app after a change means you accept the updated terms.</p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 14, color: "#ff2d95", marginBottom: 6 }}>{title}</h2>
      <div style={{ fontSize: 13, color: "#e0d4ff", lineHeight: 1.6, display: "grid", gap: 8 }}>{children}</div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #05010f, #1a0a2e)",
  color: "#f5f0ff",
  fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
  padding: 24,
  paddingTop: "max(24px, env(safe-area-inset-top))",
};

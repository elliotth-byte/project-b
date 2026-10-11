import HomeLink from "../components/HomeLink";

// ─── Privacy Policy ───
// The URL App Store Connect asks for under App Privacy, and what
// pages/terms.jsx, HelpPanel and signup link to. Keep this in sync with:
//   - ios/App/App/PrivacyInfo.xcprivacy (the app's privacy manifest)
//   - the App Privacy answers in App Store Connect
// If a new kind of data gets collected or a new outside service is
// added, all three need updating together.
//
// DRAFT — Elliott to review before shipping (same as the terms).
const CONTACT_EMAIL = "elliotthay@gmail.com";
const LAST_UPDATED = "October 11, 2026";

export default function PrivacyPage() {
  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 560, width: "100%", margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}><HomeLink /></div>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>Privacy Policy</h1>
        <p style={{ color: "#6b4f99", fontSize: 12, marginBottom: 24 }}>Last updated {LAST_UPDATED}</p>

        <Section title="The short version">
          <p>We collect what's needed to run a game with other people: your login, what you post, and the photos you choose to upload. We don't sell your data, we don't show ads, and we don't track you across other apps or websites. You can delete your account and data yourself at any time.</p>
        </Section>

        <Section title="1. What we collect">
          <ul style={listStyle}>
            <li><strong>Account details.</strong> Players sign up with a username and password. Hosts sign up with an email address and password. Passwords are stored securely by our authentication provider and we can't see them.</li>
            <li><strong>Profile and game details.</strong> The display name you play under, your profile name and quote, your season history and achievements, and anything a host asks you for when you join their season (for example, your real name).</li>
            <li><strong>Photos.</strong> Profile photos and player portraits you choose to upload. The app only uses your camera or photo library when you pick a photo, and only the photo you pick is uploaded.</li>
            <li><strong>Things you post.</strong> Group chat and direct messages, confessionals, reactions, votes and other in-game choices, and any feedback you send through the app.</li>
            <li><strong>Notification tokens.</strong> If you turn on notifications, a token from your device or browser so we can send you game alerts.</li>
            <li><strong>Reports and blocks.</strong> Reports you file about other players' messages, and the list of people you've blocked.</li>
          </ul>
          <p><strong>Microphone:</strong> some mini-games react to how loud you are. The volume is measured on your device while the game is running. Audio is never recorded, stored or uploaded.</p>
        </Section>

        <Section title="2. How we use it">
          <p>Only to run the app: signing you in, running seasons and mini-games, showing your messages and photos to the other people in your season, sending the notifications you've turned on, keeping the community safe (reviewing reports and enforcing our <a href="/terms" style={linkStyle}>Terms & Community Guidelines</a>), and fixing problems.</p>
          <p>We don't use your data for advertising and we don't sell or rent it to anyone.</p>
        </Section>

        <Section title="3. Who can see it">
          <ul style={listStyle}>
            <li><strong>Other players in your season</strong> see your display name, portrait, and what you post in shared chats. Direct messages are visible to the people in that conversation.</li>
            <li><strong>The host of your season</strong> can see what's needed to run the game, including the player list and season chats, and can moderate content.</li>
            <li><strong>Platform admins</strong> review reported content.</li>
            <li><strong>Your public profile</strong> (profile name, photo, quote, past seasons and achievements) can be seen by other signed-in users.</li>
          </ul>
        </Section>

        <Section title="4. Services we use">
          <p>We rely on a few outside services to run the app. Each gets only what it needs for its job:</p>
          <ul style={listStyle}>
            <li><strong>Supabase</strong> stores the database, logins and uploaded photos.</li>
            <li><strong>Vercel</strong> hosts the app.</li>
            <li><strong>Google Firebase Cloud Messaging</strong> and your browser's push service deliver notifications.</li>
            <li><strong>Google Fonts</strong> serves the app's fonts, which means your device's IP address reaches Google when fonts load.</li>
            <li><strong>Slack and Spotify</strong> are used only if a host connects them to their season. A host can post season announcements to their own Slack workspace, and some game modes can play music through the host's Spotify account.</li>
          </ul>
        </Section>

        <Section title="5. How long we keep it">
          <p>We keep your data while you have an account. When you delete your account, your login, profile, photos, player entries, messages, confessionals, achievements, friends list and notification tokens are deleted. Some records that belong to a season as a whole (for example, the round-by-round results of a past game) are kept so the season still makes sense for the other players. These may still show the name you played under.</p>
        </Section>

        <Section title="6. Deleting your account">
          <p>Go to <a href="/profile#delete-account" style={linkStyle}>your profile</a> and tap <strong>Delete my account</strong> at the bottom. It takes effect immediately. If you can't get into your account, email us and we'll do it for you.</p>
        </Section>

        <Section title="7. Children">
          <p>This app isn't directed at children under 13 and we don't knowingly collect data from them. If you think a child under 13 has an account, contact us and we'll delete it.</p>
        </Section>

        <Section title="8. Changes">
          <p>If this policy changes, we'll update the date at the top of this page. For significant changes, we'll also let you know in the app.</p>
        </Section>

        <Section title="9. Contact">
          <p>
            Questions about your data, or want a copy of it? Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={linkStyle}>{CONTACT_EMAIL}</a>.
          </p>
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

const linkStyle = { color: "#ff2d95" };
const listStyle = { margin: 0, paddingLeft: 18, display: "grid", gap: 6 };

const pageStyle = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #05010f, #1a0a2e)",
  color: "#f5f0ff",
  fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
  padding: 24,
  paddingTop: "max(24px, env(safe-area-inset-top))",
};

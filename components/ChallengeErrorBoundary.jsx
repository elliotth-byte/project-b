import { Component } from "react";
import { Btn } from "./ui";

// Wraps a single mini-game panel. Before this existed, an uncaught error
// anywhere in one game's render (most often: leftover saved game_state
// from before that game's data shape changed in an update) crashed the
// ENTIRE host console — every tab, not just the one panel that broke.
// React error boundaries only work as class components; there's no hooks
// equivalent, hence this being the one class in the project.
export default class ChallengeErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          background: "#1a0e0e", border: "1px solid rgba(196,92,60,0.4)", borderRadius: 10,
          padding: 14, fontSize: 13, color: "#c45c3c",
        }}>
          <strong>{this.props.label || "This mission"} hit an error and couldn't render.</strong>
          <p style={{ fontSize: 11, color: "#a09080", margin: "6px 0" }}>
            This usually means there's old saved data for this mission from before an update changed its
            format. If you're the host, clearing it (Supabase → Table Editor → delete the row in
            <code> game_state</code> with this mission's key) should fix it. Either way, the rest of the
            console keeps working.
          </p>
          <p style={{ fontSize: 10, color: "#706050", fontFamily: "monospace", margin: "6px 0" }}>{String(this.state.error?.message || this.state.error)}</p>
          <Btn small variant="ghost" onClick={() => this.setState({ error: null })}>Try again</Btn>
        </div>
      );
    }
    return this.props.children;
  }
}

import { useState, useEffect } from "react";
import { fmtTime } from "../lib/hotPotatoData";

export default function PandoraCountdown({ expiresAt, style = {} }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const remainingMs = Math.max(0, (expiresAt || 0) - Date.now());
  return <span style={style}>{fmtTime(remainingMs)}</span>;
}

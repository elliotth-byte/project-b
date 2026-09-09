import { useRef, useLayoutEffect, useState } from "react";

// ─── AutoFitText ───
// Shrinks its own font size to fit the width it's given, rather than
// ever truncating with an ellipsis — this app's rule for names
// specifically (see this component's own call sites: vote tables in
// RoundtableHost/FinaleHost/ExileVoteHost, each with a fixed-width name
// column next to a row of per-target vote marks). A cut-off name looks
// harmless right up until it's the one piece of information a vote
// depends on being unambiguous — "Alex" and "Alexandra" are different
// people, and an ellipsis can't tell them apart.
//
// Tries shrinking first (in 0.5px steps down to minFontSize) so a
// tight, single-line table row stays single-line and aligned with
// every other row in it for the common case. If even the smallest
// still-readable size doesn't fit on one line, this falls back to
// wrapping onto a second line as the last resort — guaranteeing the
// full name is always visible somehow, never guaranteeing single-line
// layout at the cost of hiding part of it.
export default function AutoFitText({ children, maxFontSize = 12, minFontSize = 8, style = {}, ...props }) {
  const ref = useRef(null);
  const [fontSize, setFontSize] = useState(maxFontSize);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let size = maxFontSize;
    el.style.fontSize = `${size}px`;
    el.style.whiteSpace = "nowrap";
    while (el.scrollWidth > el.clientWidth && size > minFontSize) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
    if (el.scrollWidth > el.clientWidth) {
      // Still doesn't fit even at the floor size — wrap rather than
      // truncate. The name matters more than the row staying visually
      // single-line.
      el.style.whiteSpace = "normal";
    }
    setFontSize(size);
  }, [children, maxFontSize, minFontSize]);

  return (
    <span ref={ref} style={{ ...style, fontSize, overflow: "hidden", display: "block" }} title={typeof children === "string" ? children : undefined} {...props}>
      {children}
    </span>
  );
}

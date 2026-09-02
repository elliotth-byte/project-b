import Head from "next/head";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Cruel Summer House</title>
        {/* Locks pinch/double-tap zoom — without this, rapid taps on small
            game elements (Match 3 tiles, Whack-a-Mole holes, etc.) could
            get misread by the browser as a double-tap-zoom gesture
            instead of registering as gameplay. viewport-fit=cover also
            extends the page under notches/home-indicators on iPhone
            rather than leaving black bars. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Orbitron:wght@400;600;700;800;900&family=Playfair+Display:wght@400;600;700;800&family=Anton&display=swap" rel="stylesheet" />
      </Head>
      <style jsx global>{`
        * { box-sizing: border-box; }
        html, body {
          margin: 0;
          background: #05010f;
          -webkit-tap-highlight-color: transparent;
          /* The actual fix for horizontal page scrolling: clips
             anything that would otherwise force the whole page wider
             than the viewport (a long unbroken player name, a raw URL,
             any string with no natural break point). This only affects
             the PAGE-level scroll — an element with its own explicit
             overflowX: "auto" (the host's tab bar in HostPanels.jsx,
             the voting history table in VotingHistorySpreadsheet.jsx)
             keeps scrolling exactly as it does today; CSS overflow is
             scoped per-element, not inherited in a way that would
             override a child's own setting.
             overflow-x: hidden alone isn't the full story on iOS
             Safari specifically, though: if anything on the page is
             ever actually wider than the viewport at any moment (even
             briefly, or inside a flex row that didn't shrink the way
             it should have), iOS can still let the viewport itself get
             dragged/rubber-banded sideways past its edge — and once
             that happens, overflow-x: hidden then blocks the normal
             gesture that would scroll it back, leaving the page stuck
             showing a horizontally-shifted view with content clipped
             on both sides. overscroll-behavior-x below is the other
             half of this fix: it stops that sideways rubber-band from
             happening in the first place, rather than only cleaning up
             after it.
          */
          overflow-x: hidden;
          overscroll-behavior-x: none;
          max-width: 100vw;
        }
        ::selection { background: #ff2d95; color: #05010f; }
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: #0d0618; }
        ::-webkit-scrollbar-thumb { background: #3d1f5c; border-radius: 6px; }
        ::-webkit-scrollbar-thumb:hover { background: #ff2d95; }
        input, select, textarea, button { font-family: inherit; }
        input::placeholder, textarea::placeholder { color: #6b4f99; }
        /* Paired with the overflow-x: hidden above — without this, a
           genuinely unbroken string (long alias, raw URL, a run of
           characters with no space) would just get silently clipped
           at the edge instead of wrapping onto a new line, hiding
           content rather than showing all of it. word-break: break-word
           is the fallback for browsers that don't fully honor
           overflow-wrap on its own. Left off pre/code (if this app ever
           adds any) since breaking mid-token there would be actively
           wrong, not just unusual. */
        p, span, div, h1, h2, h3, h4, a, li, label, button {
          overflow-wrap: break-word;
          word-break: break-word;
        }
        /* touch-action: manipulation is the actual fix for the
           tap-registers-as-zoom problem — it's what tells the browser
           "this is a real tappable control, don't wait to see if it's
           part of a double-tap-to-zoom gesture." Backs up the viewport
           meta tag above rather than replacing it: iOS Safari has
           historically ignored maximum-scale/user-scalable in some
           contexts for accessibility reasons, but respects touch-action
           on individual elements reliably. */
        button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}

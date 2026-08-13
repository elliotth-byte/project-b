import Head from "next/head";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Project B</title>
        {/* Locks pinch/double-tap zoom — without this, rapid taps on small
            game elements (Match 3 tiles, Whack-a-Mole holes, etc.) could
            get misread by the browser as a double-tap-zoom gesture
            instead of registering as gameplay. viewport-fit=cover also
            extends the page under notches/home-indicators on iPhone
            rather than leaving black bars. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Orbitron:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>
      <style jsx global>{`
        * { box-sizing: border-box; }
        html, body {
          margin: 0;
          background: #05010f;
          -webkit-tap-highlight-color: transparent;
        }
        ::selection { background: #ff2d95; color: #05010f; }
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: #0d0618; }
        ::-webkit-scrollbar-thumb { background: #3d1f5c; border-radius: 6px; }
        ::-webkit-scrollbar-thumb:hover { background: #ff2d95; }
        input, select, textarea, button { font-family: inherit; }
        input::placeholder, textarea::placeholder { color: #6b4f99; }
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

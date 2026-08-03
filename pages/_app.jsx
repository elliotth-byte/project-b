import Head from "next/head";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Project B</title>
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
        button { -webkit-tap-highlight-color: transparent; }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}

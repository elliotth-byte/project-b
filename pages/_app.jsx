import Head from "next/head";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>The Traitors</title>
      </Head>
      <Component {...pageProps} />
    </>
  );
}

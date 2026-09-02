import Image from "next/image";

// ─── Stereo Types — the wordmark ───
// Real art now (public/stereo-types/logo.png — a glowing, deliberately
// blown-out neon-yellow treatment of the wordmark, provided directly),
// replacing the earlier CSS text-shadow block-letter approximation.
// 1536x1024 (3:2) — sized proportionally per size variant rather than a
// fixed box, so it never letterboxes.
export default function StereoTypesLogo({ size = "large" }) {
  const isLarge = size === "large";
  const width = isLarge ? 480 : 180;
  const height = Math.round(width * (1024 / 1536));

  return (
    <div style={{ position: "relative", width, height, margin: isLarge ? "0 auto" : undefined }}>
      <Image src="/stereo-types/logo.png" alt="Stereo Types" fill style={{ objectFit: "contain" }} priority={isLarge} />
    </div>
  );
}

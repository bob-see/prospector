import Link from "next/link";

type AppLogoProps = {
  href?: string;
  size?: "default" | "large";
};

export default function AppLogo({ href = "/", size = "default" }: AppLogoProps) {
  const markSize = size === "large" ? 52 : 34;
  const textSize = size === "large" ? 28 : 18;

  return (
    <Link className="app-logo" href={href}>
      <span
        className="app-logo-mark"
        style={{
          fontSize: size === "large" ? 24 : 16,
          height: markSize,
          width: markSize,
        }}
      >
        P
      </span>
      <span className="app-logo-text" style={{ fontSize: textSize }}>
        Prospecting App
      </span>
    </Link>
  );
}

import Link from "next/link";
import AppLogo from "@/components/AppLogo";

const links = [
  { href: "/", label: "Home" },
  { href: "/contacts", label: "Contacts" },
  { href: "/properties", label: "Properties" },
  { href: "/appraisals", label: "Appraisals" },
  { href: "/search", label: "Prospect" },
];

export default function NavBar() {
  return (
    <nav
      style={{
        background: "var(--card-background)",
        borderBottom: "1px solid var(--border)",
        marginBottom: 32,
        padding: "18px 0",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          margin: "0 auto",
          maxWidth: 1200,
          padding: "0 20px",
        }}
      >
        <AppLogo />
        <div style={{ display: "flex", gap: 18 }}>
          {links.map((link) => (
            <Link className="app-nav-link" href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

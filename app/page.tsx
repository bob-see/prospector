import Link from "next/link";
import NavBar from "@/components/NavBar";
import AppLogo from "@/components/AppLogo";

const actions = [
  {
    href: "/contacts",
    label: "Contacts",
    description: "Browse imported contacts",
  },
  {
    href: "/properties",
    label: "Properties",
    description: "Review extracted property records",
  },
  {
    href: "/search",
    label: "Prospect",
    description: "Search streets and generate call lists",
  },
];

export default function HomePage() {
  return (
    <>
      <NavBar />
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 20px" }}>
        <section style={{ marginBottom: 48, textAlign: "center" }}>
          <div style={{ display: "inline-flex", marginBottom: 22 }}>
            <AppLogo size="large" />
          </div>
          <h1 style={{ fontSize: 48, fontWeight: 900, margin: "0 0 20px" }}>
            Prospecting App
          </h1>
          <p style={{ color: "var(--muted-text)", fontSize: 19, margin: 0 }}>
            Search your database and generate call lists instantly
          </p>
        </section>

        <section
          style={{
            display: "grid",
            gap: 18,
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          }}
        >
          {actions.map((action) => (
            <Link
              className="home-card"
              href={action.href}
              key={action.href}
            >
              <strong style={{ display: "block", fontSize: 22, marginBottom: 8 }}>
                {action.label}
              </strong>
              <span style={{ color: "var(--muted-text)" }}>
                {action.description}
              </span>
            </Link>
          ))}
        </section>
      </main>
    </>
  );
}

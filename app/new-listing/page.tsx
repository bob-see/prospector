import Link from "next/link";

export default function NewListingPage() {
  return (
    <main style={{ maxWidth: 600, margin: "32px auto", padding: "0 20px" }}>
      <nav style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <Link href="/">Home</Link>
        <Link href="/contacts">Contacts</Link>
        <Link href="/properties">Properties</Link>
        <Link href="/search">Search</Link>
      </nav>

      <h1>New Listing Call List</h1>

      <form action="/search" method="get">
        <input type="hidden" name="relationshipType" value="owner" />
        <input type="hidden" name="mode" value="call-list" />

        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ display: "block", marginBottom: 4 }}>Street</span>
          <input
            name="street"
            type="search"
            placeholder="Street name"
            required
            style={{ padding: 8, width: "100%" }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ display: "block", marginBottom: 4 }}>Suburb</span>
          <input
            name="suburb"
            type="search"
            placeholder="Suburb"
            style={{ padding: 8, width: "100%" }}
          />
        </label>

        <button type="submit" style={{ padding: "10px 14px" }}>
          Generate Call List
        </button>
      </form>
    </main>
  );
}

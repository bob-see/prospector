import { prisma } from "@/lib/prisma";
import NavBar from "@/components/NavBar";
import Link from "next/link";
import NotesModal from "@/components/NotesModal";
import { toTitleCaseIfAllCaps } from "@/lib/formatting";

const PAGE_SIZE = 50;

type ContactsPageProps = {
  searchParams: Promise<{
    page?: string | string[];
    q?: string | string[];
  }>;
};

function getPageNumber(value: string | string[] | undefined) {
  const rawPage = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(rawPage || "1", 10);

  return Number.isFinite(page) && page > 0 ? page : 1;
}

function getSearchTerm(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return (rawValue || "").trim();
}

function truncate(value: string | null) {
  if (!value) {
    return "";
  }

  return value.length > 100 ? `${value.slice(0, 100)}...` : value;
}

function getPageHref(page: number, query: string) {
  const params = new URLSearchParams();
  params.set("page", String(page));

  if (query) {
    params.set("q", query);
  }

  return `/contacts?${params.toString()}`;
}

export const dynamic = "force-dynamic";

export default async function ContactsPage({
  searchParams,
}: ContactsPageProps) {
  const { page, q } = await searchParams;
  const currentPage = getPageNumber(page);
  const query = getSearchTerm(q);
  const skip = (currentPage - 1) * PAGE_SIZE;
  const where = query
    ? {
        OR: [
          {
            displayName: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
          {
            primaryPhone: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
          {
            primaryEmail: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
          {
            rawNotes: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
        ],
      }
    : undefined;

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: {
      createdAt: "desc",
    },
    skip,
    take: PAGE_SIZE,
    select: {
      id: true,
      displayName: true,
      primaryPhone: true,
      primaryEmail: true,
      rawNotes: true,
      properties: {
        orderBy: [
          {
            confidenceScore: "desc",
          },
          {
            addressRaw: "asc",
          },
        ],
        take: 6,
        select: {
          id: true,
          addressRaw: true,
          relationshipType: true,
          confidenceScore: true,
          streetName: true,
          suburb: true,
        },
      },
    },
  });
  const totalContacts = await prisma.contact.count({ where });

  const totalPages = Math.max(1, Math.ceil(totalContacts / PAGE_SIZE));
  const showingFrom = totalContacts === 0 ? 0 : skip + 1;
  const showingTo = Math.min(skip + contacts.length, totalContacts);

  return (
    <>
      <NavBar />
      <main className="prospector-page-shell">
        <header className="prospector-page-header">
          <p className="prospector-page-kicker">Prospector CRM</p>
          <h1 className="prospector-page-title">Contacts</h1>
          <p className="prospector-page-subtitle">
            Review imported contacts, search their key details, and inspect the
            linked properties that make each contact actionable.
          </p>
        </header>

        <section className="prospector-table-card">
          <div className="prospector-section-header">
            <div>
              <h2 className="prospector-section-title">Contact Directory</h2>
              <p className="prospector-section-subtitle">
                Showing {showingFrom}-{showingTo} of {totalContacts} contacts.
                Page {currentPage} of {totalPages}.
              </p>
            </div>
            <div className="prospector-section-badge">50 per page</div>
          </div>

          <form action="/contacts" className="prospector-filter-bar" method="get">
            <label className="prospector-filter-field">
              <span className="prospector-filter-label">Search contacts</span>
              <input
                className="prospector-filter-input"
                defaultValue={query}
                name="q"
                placeholder="Name, phone, email, or notes"
                type="search"
              />
            </label>
            <div className="prospector-filter-actions">
              <button className="prospector-filter-button" type="submit">
                Search
              </button>
              {query ? (
                <Link className="prospector-filter-reset" href="/contacts">
                  Clear
                </Link>
              ) : null}
            </div>
          </form>

          <nav className="prospector-pagination" aria-label="Contacts pagination top">
            <span className="prospector-pagination-status">
              Page {currentPage} of {totalPages}
            </span>
            <div className="prospector-pagination-actions">
              {currentPage > 1 ? (
                <Link
                  className="prospector-pagination-link"
                  href={getPageHref(currentPage - 1, query)}
                >
                  Previous
                </Link>
              ) : (
                <span className="prospector-pagination-link prospector-pagination-link-disabled">
                  Previous
                </span>
              )}
              {currentPage < totalPages ? (
                <Link
                  className="prospector-pagination-link"
                  href={getPageHref(currentPage + 1, query)}
                >
                  Next
                </Link>
              ) : (
                <span className="prospector-pagination-link prospector-pagination-link-disabled">
                  Next
                </span>
              )}
            </div>
          </nav>

          {contacts.length === 0 ? (
            <p className="prospector-empty-state">No contacts found.</p>
          ) : (
            <div className="prospector-table-shell">
              <table className="prospector-table">
                <thead>
                  <tr>
                    <th>displayName</th>
                    <th>primaryPhone</th>
                    <th>primaryEmail</th>
                    <th>linkedProperties</th>
                    <th>notes</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr key={contact.id}>
                      <td className="prospector-cell-strong">
                        {contact.displayName}
                      </td>
                      <td className="prospector-cell-secondary">
                        {contact.primaryPhone || ""}
                      </td>
                      <td className="prospector-cell-wrap prospector-cell-secondary">
                        {contact.primaryEmail || ""}
                      </td>
                      <td>
                        {contact.properties.length > 0 ? (
                          <div className="prospector-chip-list">
                            {contact.properties.map((property) => {
                              const location = [
                                property.streetName
                                  ? toTitleCaseIfAllCaps(property.streetName)
                                  : null,
                                property.suburb
                                  ? toTitleCaseIfAllCaps(property.suburb)
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(", ");

                              return (
                                <div
                                  className="prospector-related-item"
                                  key={property.id}
                                >
                                  <strong>{property.addressRaw}</strong>
                                  <span>
                                    {property.relationshipType || "unknown"}
                                    {property.confidenceScore !== null
                                      ? ` (${property.confidenceScore.toFixed(2)})`
                                      : ""}
                                  </span>
                                  {location ? <span>{location}</span> : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="prospector-cell-secondary">
                            No linked properties
                          </span>
                        )}
                      </td>
                      <td>
                        <NotesModal
                          displayName={contact.displayName}
                          rawNotes={contact.rawNotes}
                        />
                        {contact.rawNotes ? (
                          <p className="prospector-inline-hint">
                            {truncate(contact.rawNotes)}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <nav
            className="prospector-pagination"
            aria-label="Contacts pagination bottom"
          >
            <span className="prospector-pagination-status">
              Page {currentPage} of {totalPages}
            </span>
            <div className="prospector-pagination-actions">
              {currentPage > 1 ? (
                <Link
                  className="prospector-pagination-link"
                  href={getPageHref(currentPage - 1, query)}
                >
                  Previous
                </Link>
              ) : (
                <span className="prospector-pagination-link prospector-pagination-link-disabled">
                  Previous
                </span>
              )}
              {currentPage < totalPages ? (
                <Link
                  className="prospector-pagination-link"
                  href={getPageHref(currentPage + 1, query)}
                >
                  Next
                </Link>
              ) : (
                <span className="prospector-pagination-link prospector-pagination-link-disabled">
                  Next
                </span>
              )}
            </div>
          </nav>
        </section>
      </main>
    </>
  );
}

import Link from "next/link";
import NavBar from "@/components/NavBar";
import { prisma } from "@/lib/prisma";
import NotesModal from "@/components/NotesModal";
import { toTitleCaseIfAllCaps } from "@/lib/formatting";

const PAGE_SIZE = 50;

type AppraisalsPageProps = {
  searchParams: Promise<{
    page?: string | string[];
  }>;
};

function getPageNumber(value: string | string[] | undefined) {
  const rawPage = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(rawPage || "1", 10);

  return Number.isFinite(page) && page > 0 ? page : 1;
}

function getPageHref(page: number) {
  return `/appraisals?page=${page}`;
}

export const dynamic = "force-dynamic";

export default async function AppraisalsPage({
  searchParams,
}: AppraisalsPageProps) {
  const { page } = await searchParams;
  const currentPage = getPageNumber(page);
  const skip = (currentPage - 1) * PAGE_SIZE;

  const appraisals = await prisma.contactProperty.findMany({
    where: {
      relationshipType: "appraisal_lead",
    },
    orderBy: [
      {
        confidenceScore: "desc",
      },
      {
        contact: {
          displayName: "asc",
        },
      },
    ],
    skip,
    take: PAGE_SIZE,
    select: {
      id: true,
      addressRaw: true,
      suburb: true,
      confidenceScore: true,
      contact: {
        select: {
          displayName: true,
          primaryPhone: true,
          primaryEmail: true,
          rawNotes: true,
        },
      },
    },
  });
  const totalAppraisals = await prisma.contactProperty.count({
    where: {
      relationshipType: "appraisal_lead",
    },
  });

  const totalPages = Math.max(1, Math.ceil(totalAppraisals / PAGE_SIZE));
  const showingFrom = totalAppraisals === 0 ? 0 : skip + 1;
  const showingTo = Math.min(skip + appraisals.length, totalAppraisals);

  return (
    <>
      <NavBar />
      <main className="prospector-page-shell">
        <header className="prospector-page-header">
          <p className="prospector-page-kicker">Prospector Opportunities</p>
          <h1 className="prospector-page-title">Appraisals</h1>
          <p className="prospector-page-subtitle">
            Review extracted appraisal leads separately from the standard owner
            prospecting workflow.
          </p>
        </header>

        <section className="prospector-table-card">
          <div className="prospector-section-header">
            <div>
              <h2 className="prospector-section-title">Appraisal Leads</h2>
              <p className="prospector-section-subtitle">
                Showing {showingFrom}-{showingTo} of {totalAppraisals} appraisal
                leads. Page {currentPage} of {totalPages}.
              </p>
            </div>
            <div className="prospector-section-badge">50 per page</div>
          </div>

          <nav
            className="prospector-pagination"
            aria-label="Appraisals pagination top"
          >
            <span className="prospector-pagination-status">
              Page {currentPage} of {totalPages}
            </span>
            <div className="prospector-pagination-actions">
              {currentPage > 1 ? (
                <Link
                  className="prospector-pagination-link"
                  href={getPageHref(currentPage - 1)}
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
                  href={getPageHref(currentPage + 1)}
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

          {appraisals.length === 0 ? (
            <p className="prospector-empty-state">No appraisal leads found.</p>
          ) : (
            <div className="prospector-table-shell">
              <table className="prospector-table">
                <thead>
                  <tr>
                    <th>displayName</th>
                    <th>primaryPhone</th>
                    <th>primaryEmail</th>
                    <th>addressRaw</th>
                    <th>suburb</th>
                    <th>confidenceScore</th>
                    <th>notes</th>
                  </tr>
                </thead>
                <tbody>
                  {appraisals.map((property) => (
                    <tr key={property.id}>
                      <td className="prospector-cell-strong">
                        {property.contact.displayName}
                      </td>
                      <td className="prospector-cell-secondary">
                        {property.contact.primaryPhone || ""}
                      </td>
                      <td className="prospector-cell-wrap prospector-cell-secondary">
                        {property.contact.primaryEmail || ""}
                      </td>
                      <td className="prospector-cell-wrap prospector-cell-address">
                        {property.addressRaw}
                      </td>
                      <td className="prospector-cell-secondary">
                        {property.suburb
                          ? toTitleCaseIfAllCaps(property.suburb)
                          : ""}
                      </td>
                      <td className="prospector-cell-secondary">
                        {property.confidenceScore ?? ""}
                      </td>
                      <td>
                        <NotesModal
                          displayName={property.contact.displayName}
                          rawNotes={property.contact.rawNotes}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <nav
            className="prospector-pagination"
            aria-label="Appraisals pagination bottom"
          >
            <span className="prospector-pagination-status">
              Page {currentPage} of {totalPages}
            </span>
            <div className="prospector-pagination-actions">
              {currentPage > 1 ? (
                <Link
                  className="prospector-pagination-link"
                  href={getPageHref(currentPage - 1)}
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
                  href={getPageHref(currentPage + 1)}
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

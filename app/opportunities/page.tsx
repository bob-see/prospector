import Link from "next/link";
import { Prisma } from "@prisma/client";
import NavBar from "@/components/NavBar";
import { prisma } from "@/lib/prisma";
import OpportunityActions from "./OpportunityActions";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "watchlist", label: "Watchlist" },
  { value: "overdue", label: "Overdue" },
  { value: "no_signal", label: "No Signal" },
  { value: "overridden", label: "Overridden" },
] as const;

type StatusFilter = (typeof STATUS_TABS)[number]["value"];

type OpportunitiesPageProps = {
  searchParams: Promise<{
    status?: string | string[];
  }>;
};

function getStatusFilter(value: string | string[] | undefined): StatusFilter {
  const rawValue = Array.isArray(value) ? value[0] : value;

  return STATUS_TABS.some((tab) => tab.value === rawValue)
    ? (rawValue as StatusFilter)
    : "all";
}

function getTabHref(status: string) {
  return status === "all" ? "/opportunities" : `/opportunities?status=${status}`;
}

function getDisplayStatus(status: string, manualOverride: string | null) {
  const effectiveStatus = manualOverride || status;

  return effectiveStatus === "archive" ? "no_signal" : effectiveStatus;
}

function formatStatusLabel(status: string) {
  if (status === "no_signal" || status === "archive") {
    return "No Signal";
  }

  return status.replaceAll("_", " ");
}

function getOpportunityWhere(
  status: StatusFilter,
): Prisma.OpportunityWhereInput | undefined {
  if (status === "all") {
    return undefined;
  }

  if (status === "overridden") {
    return {
      manualOverride: {
        not: null,
      },
    };
  }

  if (status === "no_signal") {
    return {
      OR: [
        {
          manualOverride: "no_signal",
        },
        {
          manualOverride: null,
          status: {
            in: ["no_signal", "archive"],
          },
        },
      ],
    };
  }

  return {
    OR: [
      {
        manualOverride: status,
      },
      {
        manualOverride: null,
        status,
      },
    ],
  };
}

function formatDate(value: Date | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
  }).format(value);
}

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage({
  searchParams,
}: OpportunitiesPageProps) {
  const { status } = await searchParams;
  const activeStatus = getStatusFilter(status);
  const where = getOpportunityWhere(activeStatus);
  const opportunities = await prisma.opportunity.findMany({
    where,
    orderBy: [
      {
        opportunityScore: "desc",
      },
      {
        eventDate: "desc",
      },
    ],
    select: {
      id: true,
      contactName: true,
      eventTitle: true,
      noteDate: true,
      opportunityScore: true,
      manualOverride: true,
      scoreBreakdown: true,
      status: true,
      summary: true,
      calendarEvent: {
        select: {
          description: true,
        },
      },
    },
  });
  const totalOpportunities = await prisma.opportunity.count();

  return (
    <>
      <NavBar />
      <main className="prospector-page-shell">
        <header className="prospector-page-header">
          <p className="prospector-page-kicker">Opportunity Intelligence</p>
          <h1 className="prospector-page-title">Opportunities</h1>
          <p className="prospector-page-subtitle">
            Review seller signals detected from imported calendar event titles
            and notes.
          </p>
        </header>

        <section className="prospector-table-card">
          <div className="prospector-section-header">
            <div>
              <h2 className="prospector-section-title">Seller Opportunities</h2>
              <p className="prospector-section-subtitle">
                Showing {opportunities.length} of {totalOpportunities} detected
                opportunities.
              </p>
            </div>
            <div className="prospector-section-badge">Calendar intelligence</div>
          </div>

          <div className="prospector-tab-row" aria-label="Opportunity statuses">
            {STATUS_TABS.map((tab) => (
              <Link
                className={`prospector-tab-link${
                  activeStatus === tab.value ? " prospector-tab-link-active" : ""
                }`}
                href={getTabHref(tab.value)}
                key={tab.value}
              >
                {tab.label}
              </Link>
            ))}
          </div>

          {opportunities.length === 0 ? (
            <p className="prospector-empty-state">
              No opportunities found for this filter. Run
              `npm run build:opportunities` after importing calendar events.
            </p>
          ) : (
            <div className="prospector-table-shell">
              <table className="prospector-table">
                <thead>
                  <tr>
                    <th>contactName</th>
                    <th>eventTitle</th>
                    <th>noteDate</th>
                    <th>opportunityScore</th>
                    <th>status</th>
                    <th>summary</th>
                    <th>actions</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((opportunity) => (
                    <tr key={opportunity.id}>
                      <td className="prospector-cell-strong prospector-cell-wrap">
                        {opportunity.contactName || ""}
                      </td>
                      <td className="prospector-cell-wrap prospector-cell-wide">
                        {opportunity.eventTitle}
                      </td>
                      <td className="prospector-cell-secondary">
                        {formatDate(opportunity.noteDate)}
                      </td>
                      <td className="prospector-cell-secondary">
                        {opportunity.opportunityScore}
                      </td>
                      <td>
                        {opportunity.manualOverride ? (
                          <div className="opportunity-status-stack">
                            <span
                              className={`prospector-status-chip prospector-status-${getDisplayStatus(
                                opportunity.status,
                                opportunity.manualOverride,
                              )}`}
                            >
                              {formatStatusLabel(
                                getDisplayStatus(
                                  opportunity.status,
                                  opportunity.manualOverride,
                                ),
                              )}
                            </span>
                            <span className="opportunity-manual-badge">
                              Manual override
                            </span>
                          </div>
                        ) : (
                          <span
                            className={`prospector-status-chip prospector-status-${getDisplayStatus(
                              opportunity.status,
                              opportunity.manualOverride,
                            )}`}
                          >
                            {formatStatusLabel(
                              getDisplayStatus(
                                opportunity.status,
                                opportunity.manualOverride,
                              ),
                            )}
                          </span>
                        )}
                      </td>
                      <td className="prospector-cell-secondary prospector-cell-wrap prospector-cell-notes">
                        {opportunity.summary || ""}
                      </td>
                      <td>
                        <OpportunityActions
                          description={opportunity.calendarEvent.description}
                          eventTitle={opportunity.eventTitle}
                          manualOverride={
                            opportunity.manualOverride as
                              | "hot"
                              | "warm"
                              | "watchlist"
                              | "no_signal"
                              | null
                          }
                          opportunityId={opportunity.id}
                          opportunityScore={opportunity.opportunityScore}
                          scoreBreakdown={opportunity.scoreBreakdown}
                          status={opportunity.status}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

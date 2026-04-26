import { Prisma } from "@prisma/client";
import NavBar from "@/components/NavBar";
import CalendarNotesModal from "@/components/CalendarNotesModal";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import SyncCalendarButton from "@/components/SyncCalendarButton";

const CATEGORY_TABS = [
  { value: "all", label: "All" },
  { value: "prospecting", label: "Prospecting" },
  { value: "ofi", label: "OFI" },
  { value: "personal", label: "Personal" },
] as const;

type CalendarPageProps = {
  searchParams: Promise<{
    category?: string | string[];
  }>;
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export const dynamic = "force-dynamic";

function getCategoryFilter(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;

  return CATEGORY_TABS.some((tab) => tab.value === rawValue) ? rawValue : "all";
}

function getTabHref(category: string) {
  return category === "all" ? "/calendar" : `/calendar?category=${category}`;
}

export default async function CalendarPage({
  searchParams,
}: CalendarPageProps) {
  const { category } = await searchParams;
  const activeCategory = getCategoryFilter(category);
  const where: Prisma.CalendarEventWhereInput | undefined =
    activeCategory === "all"
      ? undefined
      : {
          category: activeCategory,
        };
  const events = await prisma.calendarEvent.findMany({
    where,
    orderBy: [
      {
        startDate: "asc",
      },
      {
        title: "asc",
      },
    ],
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      calendarName: true,
      category: true,
      startDate: true,
    },
  });

  return (
    <>
      <NavBar />
      <main className="prospector-page-shell">
        <header className="prospector-page-header">
          <p className="prospector-page-kicker">Prospector Calendar</p>
          <h1 className="prospector-page-title">Calendar</h1>
          <p className="prospector-page-subtitle">
            Review imported Outlook calendar events and open the stored notes
            for each appointment when you need more context.
          </p>
        </header>

        <section className="prospector-table-card">
          <div className="prospector-section-header">
            <div>
              <h2 className="prospector-section-title">Imported Events</h2>
              <p className="prospector-section-subtitle">
                {events.length} calendar events stored in Prospector.
              </p>
            </div>
            <div className="prospector-calendar-actions">
              <div className="prospector-section-badge">Outlook ICS import</div>
              <SyncCalendarButton />
            </div>
          </div>

          <div className="prospector-tab-row" aria-label="Calendar categories">
            {CATEGORY_TABS.map((tab) => (
              <Link
                className={`prospector-tab-link${
                  activeCategory === tab.value ? " prospector-tab-link-active" : ""
                }`}
                href={getTabHref(tab.value)}
                key={tab.value}
              >
                {tab.label}
              </Link>
            ))}
          </div>

          {events.length === 0 ? (
            <p className="prospector-empty-state">
              No calendar events found. Run the calendar import script after
              setting `OUTLOOK_CALENDAR_ICS_URL`.
            </p>
          ) : (
            <div className="prospector-table-shell">
              <table className="prospector-table">
                <thead>
                  <tr>
                    <th>title</th>
                    <th>startDate</th>
                    <th>location</th>
                    <th>calendarName</th>
                    <th>category</th>
                    <th>notes</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td className="prospector-cell-strong prospector-cell-wrap prospector-cell-wide">
                        {event.title}
                      </td>
                      <td className="prospector-cell-wrap">
                        {formatDate(event.startDate)}
                      </td>
                      <td className="prospector-cell-secondary prospector-cell-wrap">
                        {event.location || "—"}
                      </td>
                      <td className="prospector-cell-secondary prospector-cell-wrap">
                        {event.calendarName}
                      </td>
                      <td className="prospector-cell-secondary prospector-cell-wrap">
                        {event.category}
                      </td>
                      <td className="prospector-cell-wrap">
                        <CalendarNotesModal
                          description={event.description}
                          title={event.title}
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

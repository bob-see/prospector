import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import CopyButton from "./CopyButton";
import NotesModal from "@/components/NotesModal";
import { toTitleCaseIfAllCaps } from "@/lib/formatting";

const OWNER_STYLE_RELATIONSHIPS = [
  "owner",
  "investment_owner",
  "appraisal_lead",
] as const;

const RELATIONSHIP_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "owner", label: "Call List" },
  { value: "investment_owner", label: "Investment Owner" },
  { value: "appraisal_lead", label: "Appraisal Lead" },
  { value: "past_owner", label: "Past Owner" },
  { value: "buyer_enquiry", label: "Buyer Enquiry" },
  { value: "unknown", label: "Unknown" },
] as const;

type RelationshipFilterValue =
  (typeof RELATIONSHIP_FILTER_OPTIONS)[number]["value"];

const RELATIONSHIP_PRIORITY: Record<string, number> = {
  investment_owner: 0,
  owner: 1,
  appraisal_lead: 2,
};

const detailLabelStyle = {
  color: "#555",
  fontSize: 13,
} as const;

type SearchPageProps = {
  searchParams: Promise<{
    street?: string | string[];
    suburb?: string | string[];
    relationshipType?: string | string[];
    mode?: string | string[];
  }>;
};

type SearchResult = {
  id: string;
  contactId: string;
  addressRaw: string;
  streetNumber: string | null;
  streetName: string | null;
  streetType: string | null;
  suburb: string | null;
  relationshipType: string | null;
  confidenceScore: number | null;
  contact: {
    displayName: string;
    primaryPhone: string | null;
    primaryEmail: string | null;
    rawNotes: string | null;
  };
};

function getSearchTerm(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return (rawValue || "").trim();
}

function getDisplayMode(value: string | string[] | undefined) {
  return getSearchTerm(value) === "call-list" ? "call-list" : "detailed";
}

function getRelationshipFilter(value: string | string[] | undefined) {
  const relationshipType = getSearchTerm(value);
  const validOptions = new Set<string>(
    RELATIONSHIP_FILTER_OPTIONS.map((option) => option.value),
  );

  return validOptions.has(relationshipType)
    ? (relationshipType as RelationshipFilterValue)
    : "owner";
}

function hasExplicitFilter(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return typeof rawValue === "string" && rawValue.trim().length > 0;
}

function buildModeHref(
  mode: "detailed" | "call-list",
  values: {
    street: string;
    suburb: string;
    relationshipType: string;
  },
) {
  const params = new URLSearchParams();

  if (values.street) {
    params.set("street", values.street);
  }

  if (values.suburb) {
    params.set("suburb", values.suburb);
  }

  if (values.relationshipType !== "all") {
    params.set("relationshipType", values.relationshipType);
  }

  params.set("mode", mode);

  return `/search?${params.toString()}`;
}

function modeButtonStyle(isActive: boolean) {
  return {
    background: isActive ? "#111" : "#fff",
    border: "1px solid #111",
    borderRadius: 6,
    color: isActive ? "#fff" : "#111",
    display: "inline-block",
    fontWeight: isActive ? 700 : 500,
    padding: "9px 14px",
    textDecoration: "none",
  } as const;
}

function normalizeStreetName(value: string | null) {
  const normalized = (value || "").trim().toUpperCase();
  return normalized || "UNKNOWN STREET";
}

function normalizeStreetType(value: string | null) {
  return (value || "").trim().toUpperCase();
}

function streetHeading(property: SearchResult) {
  const streetName = toTitleCaseIfAllCaps(normalizeStreetName(property.streetName));
  const streetType = toTitleCaseIfAllCaps(normalizeStreetType(property.streetType));

  return streetType ? `${streetName} ${streetType}` : streetName;
}

function uniquePropertyKey(property: SearchResult) {
  return [
    property.contactId,
    (property.streetNumber || "").trim(),
    normalizeStreetName(property.streetName),
  ].join(":");
}

function dedupeProperties(properties: SearchResult[]) {
  const seen = new Set<string>();
  const uniqueProperties: SearchResult[] = [];

  for (const property of properties) {
    const key = uniquePropertyKey(property);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueProperties.push(property);
  }

  return uniqueProperties;
}

function dedupeContactsPerStreet(properties: SearchResult[]) {
  const seen = new Set<string>();
  const uniqueContacts: SearchResult[] = [];

  for (const property of properties) {
    const key = `${streetHeading(property)}:${property.contactId}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueContacts.push(property);
  }

  return uniqueContacts;
}

function groupByStreet(properties: SearchResult[]) {
  return properties.reduce<Record<string, SearchResult[]>>((groups, property) => {
    const streetName = streetHeading(property);

    groups[streetName] ||= [];
    groups[streetName].push(property);

    return groups;
  }, {});
}

function sortResults(results: SearchResult[]) {
  return [...results].sort((first, second) => {
    const firstScore = first.confidenceScore ?? -Infinity;
    const secondScore = second.confidenceScore ?? -Infinity;

    if (secondScore !== firstScore) {
      return secondScore - firstScore;
    }

    const firstPriority =
      RELATIONSHIP_PRIORITY[first.relationshipType || ""] ?? Number.MAX_SAFE_INTEGER;
    const secondPriority =
      RELATIONSHIP_PRIORITY[second.relationshipType || ""] ?? Number.MAX_SAFE_INTEGER;

    if (firstPriority !== secondPriority) {
      return firstPriority - secondPriority;
    }

    return first.contact.displayName.localeCompare(second.contact.displayName);
  });
}

function callListLine(property: SearchResult, index: number) {
  const parts = [
    property.contact.displayName,
    property.contact.primaryPhone,
    property.addressRaw,
  ].filter(Boolean);

  return `${index + 1}. ${parts.join(" - ")}`;
}

function callListText(streetName: string, results: SearchResult[]) {
  return [
    streetName,
    ...results.map((property, index) => callListLine(property, index)),
  ].join("\n");
}

function phoneListResults(results: SearchResult[]) {
  const seen = new Set<string>();
  const contactsWithPhones: SearchResult[] = [];

  for (const property of results) {
    if (!property.contact.primaryPhone || seen.has(property.contactId)) {
      continue;
    }

    seen.add(property.contactId);
    contactsWithPhones.push(property);
  }

  return contactsWithPhones;
}

function phoneListText(streetName: string, results: SearchResult[]) {
  return [
    streetName,
    ...phoneListResults(results).map(
      (property) =>
        `${property.contact.displayName} - ${property.contact.primaryPhone}`,
    ),
  ].join("\n");
}

function allCallListText(streetGroups: Array<[string, SearchResult[]]>) {
  return streetGroups
    .map(([streetName, results]) => callListText(streetName, results))
    .join("\n\n");
}

function relationshipLabel(relationshipType: string | null) {
  switch (relationshipType) {
    case "investment_owner":
      return "Investor";
    case "owner":
      return "Owner";
    case "appraisal_lead":
      return "Appraisal";
    case "past_owner":
      return "Past Owner";
    case "buyer_enquiry":
      return "Buyer Enquiry";
    default:
      return "Unknown";
  }
}

function relationshipDisplay(property: SearchResult) {
  const label = relationshipLabel(property.relationshipType);

  if (property.confidenceScore === null) {
    return label;
  }

  return `${label} (${property.confidenceScore.toFixed(2)})`;
}

function streetSummary(results: SearchResult[]) {
  const counts = results.reduce(
    (summary, property) => {
      if (property.relationshipType === "investment_owner") {
        summary.investors += 1;
      } else if (property.relationshipType === "appraisal_lead") {
        summary.appraisals += 1;
      } else if (property.relationshipType === "owner") {
        summary.owners += 1;
      }

      return summary;
    },
    {
      appraisals: 0,
      investors: 0,
      owners: 0,
    },
  );

  return `Owners: ${counts.owners} | Investors: ${counts.investors} | Appraisals: ${counts.appraisals}`;
}

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const street = getSearchTerm(params.street);
  const suburb = getSearchTerm(params.suburb);
  const relationshipType = getRelationshipFilter(params.relationshipType);
  const displayMode = getDisplayMode(params.mode);
  const hasExplicitRelationshipFilter = hasExplicitFilter(params.relationshipType);
  const hasFilters =
    street.length > 0 || suburb.length > 0 || hasExplicitRelationshipFilter;

  const filters: Prisma.ContactPropertyWhereInput[] = [];

  if (street) {
    filters.push({
      streetName: {
        contains: street,
        mode: "insensitive",
      },
    });
  }

  if (suburb) {
    filters.push({
      suburb: {
        contains: suburb,
        mode: "insensitive",
      },
    });
  }

  if (relationshipType === "owner") {
    filters.push({
      relationshipType: {
        in: [...OWNER_STYLE_RELATIONSHIPS],
      },
    });
  } else if (relationshipType !== "all") {
    filters.push({
      relationshipType,
    });
  }

  const properties = hasFilters
    ? await prisma.contactProperty.findMany({
        where: filters.length > 0 ? { AND: filters } : undefined,
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
        take: 200,
        select: {
          id: true,
          contactId: true,
          addressRaw: true,
          streetNumber: true,
          streetName: true,
          streetType: true,
          suburb: true,
          relationshipType: true,
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
      })
    : [];

  const uniqueProperties = dedupeProperties(properties);
  const visibleProperties =
    displayMode === "call-list"
      ? dedupeContactsPerStreet(uniqueProperties)
      : uniqueProperties;
  const groupedProperties = groupByStreet(visibleProperties);
  const streetGroups = Object.entries(groupedProperties).map(
    ([streetName, results]): [string, SearchResult[]] => [
      streetName,
      sortResults(results),
    ],
  );
  const copyAllText = allCallListText(streetGroups);
  const modeValues = {
    street,
    suburb,
    relationshipType:
      hasExplicitRelationshipFilter || street.length > 0 || suburb.length > 0
        ? relationshipType
        : "",
  };

  return (
    <>
      <NavBar />
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px" }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ marginBottom: 8 }}>Prospecting Dashboard</h1>
          <p style={{ margin: 0 }}>
            Search extracted property records by street, suburb, and
            relationship.
          </p>
        </header>

      <section
        aria-label="Display mode"
        style={{
          alignItems: "center",
          display: "flex",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <Link
          href={buildModeHref("detailed", modeValues)}
          style={modeButtonStyle(displayMode === "detailed")}
        >
          Detailed
        </Link>
        <Link
          href={buildModeHref("call-list", modeValues)}
          style={modeButtonStyle(displayMode === "call-list")}
        >
          Call List
        </Link>
        </section>

        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
          }}
        >
        <form
          action="/search"
          method="get"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
            alignItems: "end",
          }}
        >
          <input type="hidden" name="mode" value={displayMode} />

          <label>
            <span style={{ display: "block", marginBottom: 4 }}>Street</span>
            <input
              name="street"
              type="search"
              defaultValue={street}
              placeholder="Street name"
              style={{ width: "100%", padding: 8 }}
            />
          </label>

          <label>
            <span style={{ display: "block", marginBottom: 4 }}>Suburb</span>
            <input
              name="suburb"
              type="search"
              defaultValue={suburb}
              placeholder="Optional suburb"
              style={{ width: "100%", padding: 8 }}
            />
          </label>

          <label>
            <span style={{ display: "block", marginBottom: 4 }}>
              Relationship
            </span>
            <select
              name="relationshipType"
              defaultValue={relationshipType}
              style={{ width: "100%", padding: 8 }}
            >
              {RELATIONSHIP_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" style={{ padding: 9 }}>
            Search
          </button>
        </form>
        </section>

      {!hasFilters && (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 16,
          }}
        >
          <p style={{ margin: 0 }}>Enter a street name to start prospecting.</p>
        </section>
      )}

      {hasFilters && (
        <>
          <section style={{ marginBottom: 20 }}>
            <div
              style={{
                alignItems: "center",
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <h2 style={{ margin: 0 }}>
                Showing {visibleProperties.length} results
              </h2>
              {visibleProperties.length > 0 && (
                <CopyButton text={copyAllText} label="Copy All Results" />
              )}
            </div>
            <p style={{ margin: 0 }}>
              Results are grouped by street, ranked by confidence, and tuned
              for outreach first.
            </p>
          </section>

          {streetGroups.length === 0 && <p>No matching properties found.</p>}

          {streetGroups.map(([streetName, results]) => (
            <section
              key={streetName}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <h2 style={{ margin: 0 }}>
                  {streetName} ({results.length})
                </h2>
                <p style={{ color: "#666", margin: "6px 0 0" }}>
                  {streetSummary(results)}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <CopyButton
                    text={callListText(streetName, results)}
                    label="Copy Call List"
                  />
                  <CopyButton
                    text={phoneListText(streetName, results)}
                    label="Copy Phone List"
                  />
                </div>
              </div>

              {displayMode === "call-list" ? (
                <ol style={{ margin: 0, paddingLeft: 24 }}>
                  {results.map((property) => (
                    <li key={property.id} style={{ marginBottom: 10 }}>
                      <div style={{ alignItems: "baseline", display: "flex", gap: 8 }}>
                        <strong>{property.contact.displayName}</strong>
                        <span style={{ color: "#666", fontSize: 13 }}>
                          {relationshipDisplay(property)}
                        </span>
                        <NotesModal
                          displayName={property.contact.displayName}
                          rawNotes={property.contact.rawNotes}
                        />
                      </div>
                      <div style={{ fontWeight: 600 }}>
                        {property.contact.primaryPhone || "No phone"}
                      </div>
                      <div>{property.addressRaw}</div>
                    </li>
                  ))}
                </ol>
              ) : (
                <ol style={{ margin: 0, paddingLeft: 24 }}>
                  {results.map((property) => (
                    <li key={property.id} style={{ marginBottom: 14 }}>
                      <div>
                        <strong>{property.contact.displayName}</strong>
                      </div>
                      <div>
                        <span style={detailLabelStyle}>Phone:</span>{" "}
                        {property.contact.primaryPhone || ""}
                      </div>
                      <div>
                        <span style={detailLabelStyle}>Email:</span>{" "}
                        {property.contact.primaryEmail || ""}
                      </div>
                      <div>
                        <span style={detailLabelStyle}>Address:</span>{" "}
                        {property.addressRaw}
                      </div>
                      <div>
                        <span style={detailLabelStyle}>Relationship:</span>{" "}
                        {relationshipDisplay(property)}
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <NotesModal
                          displayName={property.contact.displayName}
                          rawNotes={property.contact.rawNotes}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </>
      )}
      </main>
    </>
  );
}

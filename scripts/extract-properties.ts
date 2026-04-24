import "dotenv/config";

import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONTACT_BATCH_SIZE = 500;
const INSERT_BATCH_SIZE = 500;

const STREET_TYPES =
  "Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Crescent|Cres|Lane|Ln|Way|Parade|Pde|Terrace|Tce|Boulevard|Blvd|Circuit|Cir|Close|Cl|Highway|Hwy";

const ADDRESS_PATTERN = new RegExp(
  String.raw`(?<address>(?<streetNumber>\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s+(?<streetName>[A-Za-z][A-Za-z' -]*?)\s+(?<streetType>${STREET_TYPES})\b(?<tail>[^.\n\r;]*))`,
  "gi",
);

const BUYER_ENQUIRY_PATTERN =
  /\b(?:OFI|inspected|looked\s+at|interested(?:\s+in)?|enquiry|called\s+about)\b/i;
const SALE_MARKER_PATTERN =
  /\b(?:Sale\s+Price|Sale\s+Date|Sale\s+Type)\b/i;
const APPRAISAL_PATTERN =
  /\b(?:Did\s+an\s+appraisal\s+on|Appraisal|appraised|valuation)\b/i;
const APPRAISAL_STRONG_PATTERN =
  /\b(?:Did\s+an\s+appraisal\s+on|Appraisal|appraised|valuation|valued|listing\s+presentation|presentation|met\s+with\s+owner|meeting\s+with\s+owner|wants?\s*\$|price\s+expectation|prep\s+for\s+sale|coming\s+to\s+market)\b/i;
const APPRAISAL_SOFT_PATTERN =
  /\b(?:value|price\s+update|market\s+update|thinking\s+of\s+selling|considering\s+selling)\b/i;
const INVESTMENT_OWNER_PATTERN = /\b(?:ALSO\s+OWNS|OWNS)\b/i;
const PURCHASED_OWNER_PATTERN = /\b(?:Bought|Purchased)\b/i;
const PAST_OWNER_PATTERN = /\b(?:OWNED|SOLD)\b/i;

const RELATIONSHIP_SCORES = {
  appraisal_lead: 0.82,
  appraisal_lead_soft: 0.75,
  buyer_enquiry: 0.45,
  investment_owner: 0.94,
  owner: 0.86,
  owner_purchase: 0.9,
  past_owner: 0.7,
  unknown: 0.5,
} as const;

type RelationshipType =
  | "appraisal_lead"
  | "buyer_enquiry"
  | "investment_owner"
  | "owner"
  | "past_owner"
  | "unknown";

type ContactForExtraction = {
  homePostcode: string | null;
  homeStreetName: string | null;
  homeStreetNumber: string | null;
  homeStreetRaw: string | null;
  homeStreetType: string | null;
  homeSuburb: string | null;
  id: string;
  rawNotes: string | null;
};

type ExtractedProperty = Prisma.ContactPropertyCreateManyInput;
type ExtractionStats = {
  cleanedAddressCount: number;
  suburbExtractedCount: number;
  suburbNullCount: number;
};

function clean(value: string | null | undefined) {
  const trimmed = (value || "").replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanTrailingText(value: string) {
  return (value || "")
    .replace(
      /\b(?:for\s+\$.*|at\s+auction.*|rented\s+out.*|from\s+me.*|and|also|plus|but|then|called|spoke|wants|looking|interested|owns|bought|sold|ofi)\b.*$/i,
      "",
    )
    .replace(/\s*\([^)]*$/, "")
    .replace(/\s*,\s*$/, "")
    .trim();
}

function normalizeSuburbCandidate(value: string | null) {
  if (!value) {
    return null;
  }

  const candidate = cleanTrailingText(value)
    .replace(/\b\d{4}\b/g, "")
    .replace(/^[,\s-]+|[,\s-]+$/g, "")
    .trim();

  if (!candidate) {
    return null;
  }

  if (/\d/.test(candidate)) {
    return null;
  }

  const words = candidate.split(/\s+/);

  if (words.length > 3 || candidate.length > 40) {
    return null;
  }

  if (!words.every((word) => /^[A-Za-z][A-Za-z'-]*$/.test(word))) {
    return null;
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function extractSuburb(tail: string | undefined) {
  const cleanedTail = clean(tail);

  if (!cleanedTail) {
    return null;
  }

  const cleaned = cleanTrailingText(cleanedTail);
  const commaParts = cleaned
    .split(",")
    .map((part) => normalizeSuburbCandidate(part))
    .filter(Boolean);

  if (commaParts.length > 0) {
    return commaParts[commaParts.length - 1];
  }

  return normalizeSuburbCandidate(cleaned);
}

function buildAddressRaw(
  originalAddress: string,
  streetNumber: string,
  streetName: string,
  streetType: string,
  suburb: string | null,
) {
  const addressOnly = [streetNumber, streetName, streetType].join(" ");

  if (suburb) {
    return `${addressOnly}, ${suburb}`;
  }

  return addressOnly || cleanTrailingText(originalAddress);
}

function addressKey(contactId: string, addressRaw: string) {
  return `${contactId}:${addressRaw.toLowerCase()}`;
}

function streetComponentKey(
  property: Pick<
    ExtractedProperty,
    "contactId" | "streetNumber" | "streetName" | "streetType"
  >,
) {
  return [
    property.contactId,
    property.streetNumber || "",
    property.streetName || "",
    property.streetType || "",
  ]
    .join(":")
    .toLowerCase();
}

function buildHomeAddressRaw(contact: ContactForExtraction) {
  const parts = [
    clean(contact.homeStreetRaw),
    clean(contact.homeSuburb),
    clean(contact.homePostcode),
  ].filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  return parts.join(", ");
}

function homeAddressProperty(contact: ContactForExtraction): ExtractedProperty | null {
  const homeStreetRaw = clean(contact.homeStreetRaw);

  if (!homeStreetRaw) {
    return null;
  }

  const addressRaw = buildHomeAddressRaw(contact);

  if (!addressRaw) {
    return null;
  }

  // Future schema support: if ContactProperty gets a source/context field,
  // mark these rows as `home_address` explicitly.
  return {
    contactId: contact.id,
    addressRaw,
    streetNumber: clean(contact.homeStreetNumber),
    streetName: clean(contact.homeStreetName),
    streetType: clean(contact.homeStreetType),
    suburb: clean(contact.homeSuburb),
    postcode: clean(contact.homePostcode),
    relationshipType: "owner",
    confidenceScore: 0.98,
  };
}

function noteSegmentBounds(note: string, index: number) {
  const segmentStart = Math.max(
    note.lastIndexOf(".", index),
    note.lastIndexOf("\n", index),
    note.lastIndexOf("\r", index),
    note.lastIndexOf(";", index),
    0,
  );
  const segmentEndCandidates = [
    note.indexOf(".", index),
    note.indexOf("\n", index),
    note.indexOf("\r", index),
    note.indexOf(";", index),
  ].filter((candidate) => candidate >= 0);
  const segmentEnd =
    segmentEndCandidates.length > 0
      ? Math.min(...segmentEndCandidates)
      : note.length;

  return {
    start: segmentStart,
    end: segmentEnd,
  };
}

function classifyRelationship(
  segment: string,
  prefix: string,
): {
  confidenceScore: number;
  relationshipType: RelationshipType;
} {
  if (INVESTMENT_OWNER_PATTERN.test(prefix)) {
    return {
      relationshipType: "investment_owner",
      confidenceScore: RELATIONSHIP_SCORES.investment_owner,
    };
  }

  if (PURCHASED_OWNER_PATTERN.test(prefix)) {
    return {
      relationshipType: "owner",
      confidenceScore: RELATIONSHIP_SCORES.owner_purchase,
    };
  }

  if (PAST_OWNER_PATTERN.test(prefix)) {
    return {
      relationshipType: "past_owner",
      confidenceScore: RELATIONSHIP_SCORES.past_owner,
    };
  }

  if (SALE_MARKER_PATTERN.test(segment)) {
    return {
      relationshipType: "owner",
      confidenceScore: RELATIONSHIP_SCORES.owner,
    };
  }

  if (
    APPRAISAL_PATTERN.test(prefix) ||
    APPRAISAL_STRONG_PATTERN.test(prefix) ||
    APPRAISAL_STRONG_PATTERN.test(segment)
  ) {
    return {
      relationshipType: "appraisal_lead",
      confidenceScore: RELATIONSHIP_SCORES.appraisal_lead,
    };
  }

  if (APPRAISAL_SOFT_PATTERN.test(prefix) || APPRAISAL_SOFT_PATTERN.test(segment)) {
    return {
      relationshipType: "appraisal_lead",
      confidenceScore: RELATIONSHIP_SCORES.appraisal_lead_soft,
    };
  }

  if (BUYER_ENQUIRY_PATTERN.test(prefix) || BUYER_ENQUIRY_PATTERN.test(segment)) {
    return {
      relationshipType: "buyer_enquiry",
      confidenceScore: RELATIONSHIP_SCORES.buyer_enquiry,
    };
  }

  return {
    relationshipType: "unknown",
    confidenceScore: RELATIONSHIP_SCORES.unknown,
  };
}

function propertyFromMatch(
  contactId: string,
  note: string,
  matchIndex: number,
  groups: Record<string, string>,
): { property: ExtractedProperty; wasCleaned: boolean } | null {
  const streetNumber = clean(groups.streetNumber);
  const streetName = clean(groups.streetName);
  const streetType = clean(groups.streetType);

  if (!streetNumber || !streetName || !streetType) {
    return null;
  }

  const suburb = extractSuburb(groups.tail);
  const addressRaw = buildAddressRaw(
    groups.address,
    streetNumber,
    streetName,
    streetType,
    suburb,
  );
  const cleanedOriginal = cleanTrailingText(groups.address);
  const bounds = noteSegmentBounds(note, matchIndex);
  const segment = note.slice(bounds.start, bounds.end);
  const prefix = note.slice(bounds.start, matchIndex);
  const relationship = classifyRelationship(segment, prefix);

  return {
    property: {
      contactId,
      addressRaw,
      streetNumber,
      streetName,
      streetType,
      suburb,
      relationshipType: relationship.relationshipType,
      confidenceScore: relationship.confidenceScore,
    },
    wasCleaned: cleanedOriginal !== addressRaw,
  };
}

function extractProperties(contact: ContactForExtraction): {
  properties: ExtractedProperty[];
  stats: ExtractionStats;
} {
  if (!contact.rawNotes) {
    return {
      properties: [],
      stats: {
        cleanedAddressCount: 0,
        suburbExtractedCount: 0,
        suburbNullCount: 0,
      },
    };
  }

  const properties: ExtractedProperty[] = [];
  const seenAddresses = new Set<string>();
  const stats: ExtractionStats = {
    cleanedAddressCount: 0,
    suburbExtractedCount: 0,
    suburbNullCount: 0,
  };
  const homeProperty = homeAddressProperty(contact);

  if (homeProperty) {
    const homeKey = addressKey(contact.id, homeProperty.addressRaw);
    seenAddresses.add(homeKey);
    stats.suburbExtractedCount += homeProperty.suburb ? 1 : 0;
    stats.suburbNullCount += homeProperty.suburb ? 0 : 1;
    properties.push(homeProperty);
  }

  for (const match of contact.rawNotes.matchAll(ADDRESS_PATTERN)) {
    const groups = match.groups;

    if (!groups || match.index === undefined) {
      continue;
    }

    const result = propertyFromMatch(
      contact.id,
      contact.rawNotes,
      match.index,
      groups,
    );

    if (!result) {
      continue;
    }

    const { property, wasCleaned } = result;
    const key = addressKey(contact.id, property.addressRaw);

    if (seenAddresses.has(key)) {
      continue;
    }

    seenAddresses.add(key);
    stats.cleanedAddressCount += wasCleaned ? 1 : 0;
    stats.suburbExtractedCount += property.suburb ? 1 : 0;
    stats.suburbNullCount += property.suburb ? 0 : 1;
    properties.push(property);
  }

  return {
    properties,
    stats,
  };
}

async function insertProperties(properties: ExtractedProperty[]) {
  let insertedCount = 0;
  let duplicateCount = 0;

  for (let index = 0; index < properties.length; index += INSERT_BATCH_SIZE) {
    const batch = properties.slice(index, index + INSERT_BATCH_SIZE);
    const existingProperties = await prisma.contactProperty.findMany({
      where: {
        OR: batch.map((property) => ({
          contactId: property.contactId,
          addressRaw: property.addressRaw,
        })),
      },
      select: {
        contactId: true,
        addressRaw: true,
        streetNumber: true,
        streetName: true,
        streetType: true,
        suburb: true,
      },
    });
    const existingKeys = new Set(
      existingProperties.map((property) =>
        addressKey(property.contactId, property.addressRaw),
      ),
    );
    const existingComponentKeys = new Set(
      existingProperties.map(streetComponentKey),
    );
    const newProperties = batch.filter(
      (property) =>
        !existingKeys.has(addressKey(property.contactId, property.addressRaw)) &&
        !existingComponentKeys.has(streetComponentKey(property)),
    );

    duplicateCount += batch.length - newProperties.length;

    if (newProperties.length === 0) {
      console.log(
        `Skipped ${duplicateCount} duplicates. Inserted ${insertedCount}/${properties.length} extracted properties.`,
      );
      continue;
    }

    const result = await prisma.contactProperty.createMany({
      data: newProperties,
    });

    insertedCount += result.count;
    console.log(
      `Skipped ${duplicateCount} duplicates. Inserted ${insertedCount}/${properties.length} extracted properties.`,
    );
  }

  return {
    duplicateCount,
    insertedCount,
  };
}

async function main() {
  let cursor: string | undefined;
  let scannedContacts = 0;
  let matchedContacts = 0;
  const extractedProperties: ExtractedProperty[] = [];
  const extractedKeys = new Set<string>();
  const extractedComponentKeys = new Set<string>();
  const stats: ExtractionStats = {
    cleanedAddressCount: 0,
    suburbExtractedCount: 0,
    suburbNullCount: 0,
  };

  for (;;) {
    const contacts = (await prisma.contact.findMany({
      take: CONTACT_BATCH_SIZE,
      ...(cursor
        ? {
            skip: 1,
            cursor: {
              id: cursor,
            },
          }
        : {}),
      orderBy: {
        id: "asc",
      },
      select: {
        homePostcode: true,
        homeStreetName: true,
        homeStreetNumber: true,
        homeStreetRaw: true,
        homeStreetType: true,
        homeSuburb: true,
        id: true,
        rawNotes: true,
      },
    })) as ContactForExtraction[];

    if (contacts.length === 0) {
      break;
    }

    for (const contact of contacts) {
      const extraction = extractProperties(contact);
      const properties = extraction.properties;

      if (properties.length > 0) {
        matchedContacts += 1;
        stats.cleanedAddressCount += extraction.stats.cleanedAddressCount;
        stats.suburbExtractedCount += extraction.stats.suburbExtractedCount;
        stats.suburbNullCount += extraction.stats.suburbNullCount;

        for (const property of properties) {
          const key = addressKey(property.contactId, property.addressRaw);
          const componentKey = streetComponentKey(property);

          if (
            extractedKeys.has(key) ||
            extractedComponentKeys.has(componentKey)
          ) {
            continue;
          }

          extractedKeys.add(key);
          extractedComponentKeys.add(componentKey);
          extractedProperties.push(property);
        }
      }
    }

    scannedContacts += contacts.length;
    cursor = contacts[contacts.length - 1].id;

    console.log(
      `Scanned ${scannedContacts} contacts. Extracted ${extractedProperties.length} properties so far.`,
    );
  }

  if (extractedProperties.length === 0) {
    console.log(`Scanned ${scannedContacts} contacts.`);
    console.log("No clear property addresses found.");
    return;
  }

  const { duplicateCount, insertedCount } =
    await insertProperties(extractedProperties);

  console.log(`Scanned contacts: ${scannedContacts}`);
  console.log(`Contacts with extracted properties: ${matchedContacts}`);
  console.log(`Properties extracted: ${extractedProperties.length}`);
  console.log(`Cleaned addresses: ${stats.cleanedAddressCount}`);
  console.log(`Suburbs extracted: ${stats.suburbExtractedCount}`);
  console.log(`Suburbs set to null: ${stats.suburbNullCount}`);
  console.log(`Duplicates skipped: ${duplicateCount}`);
  console.log(`Properties inserted: ${insertedCount}`);
}

main()
  .catch((error) => {
    console.error("Failed to extract contact properties.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

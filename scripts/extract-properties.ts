import "dotenv/config";

import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONTACT_BATCH_SIZE = 500;
const INSERT_BATCH_SIZE = 500;
const CONFIDENCE_SCORE = 0.8;

const STREET_TYPES =
  "Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Crescent|Cres|Lane|Ln|Way|Parade|Pde|Terrace|Tce|Boulevard|Blvd|Circuit|Cir|Close|Cl|Highway|Hwy";

const CONTEXT_ADDRESS_PATTERN = new RegExp(
  String.raw`\b(?:ALSO\s+OWNS|OWNS|Bought|Did\s+an\s+appraisal\s+on|Sold|OFI|Looked\s+at|Interested\s+in)\b[\s:,-]*(?:[^.\n\r;]*?\b)?(?<address>(?<streetNumber>\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s+(?<streetName>[A-Za-z][A-Za-z' -]*?)\s+(?<streetType>${STREET_TYPES})\b(?<tail>[^.\n\r;]*))`,
  "gi",
);

const ADDRESS_PATTERN = new RegExp(
  String.raw`(?<address>(?<streetNumber>\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s+(?<streetName>[A-Za-z][A-Za-z' -]*?)\s+(?<streetType>${STREET_TYPES})\b(?<tail>[^.\n\r;]*))`,
  "gi",
);

const CONTEXT_WORD_PATTERN =
  /\b(?:ALSO\s+OWNS|OWNS|Bought|Did\s+an\s+appraisal\s+on|Sold|OFI|Looked\s+at|Interested\s+in)\b/i;

type ContactForExtraction = {
  id: string;
  rawNotes: string | null;
};

type ExtractedProperty = Prisma.ContactPropertyCreateManyInput;
type ExtractionStats = {
  cleanedAddressCount: number;
  suburbExtractedCount: number;
  suburbNullCount: number;
};

function clean(value: string | undefined) {
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

function noteSegmentHasContext(note: string, index: number) {
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
  const segment = note.slice(segmentStart, segmentEnd);

  return CONTEXT_WORD_PATTERN.test(segment);
}

function propertyFromMatch(
  contactId: string,
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

  return {
    property: {
      contactId,
      addressRaw,
      streetNumber,
      streetName,
      streetType,
      suburb,
      relationshipType: "owner",
      confidenceScore: CONFIDENCE_SCORE,
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

  for (const match of contact.rawNotes.matchAll(CONTEXT_ADDRESS_PATTERN)) {
    const groups = match.groups;

    if (!groups) {
      continue;
    }

    const result = propertyFromMatch(contact.id, groups);

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

  for (const match of contact.rawNotes.matchAll(ADDRESS_PATTERN)) {
    if (!noteSegmentHasContext(contact.rawNotes, match.index)) {
      continue;
    }

    const groups = match.groups;

    if (!groups) {
      continue;
    }

    const result = propertyFromMatch(contact.id, groups);

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
    const contacts: ContactForExtraction[] = await prisma.contact.findMany({
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
        id: true,
        rawNotes: true,
      },
    });

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

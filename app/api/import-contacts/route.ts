import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const BATCH_SIZE = 500;
const STREET_TYPES =
  "Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Crescent|Cres|Lane|Ln|Way|Parade|Pde|Terrace|Tce|Boulevard|Blvd|Circuit|Cir|Close|Cl|Highway|Hwy";

const HOME_STREET_PATTERN = new RegExp(
  String.raw`^(?<streetNumber>\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s+(?<streetName>[A-Za-z][A-Za-z' -]*?)\s+(?<streetType>${STREET_TYPES})\b(?<tail>.*)$`,
  "i",
);

type CsvRow = Record<string, unknown>;

function clean(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isBlankRow(row: CsvRow) {
  return Object.values(row).every((value) => clean(value) === null);
}

function firstPresent(row: CsvRow, headers: string[]) {
  for (const header of headers) {
    const value = clean(row[header]);

    if (value) {
      return value;
    }
  }

  return null;
}

function cleanTrailingText(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[,\s-]+|[,\s-]+$/g, "").trim();
}

function normalizeSuburbCandidate(value: string | null) {
  if (!value) {
    return null;
  }

  const candidate = cleanTrailingText(value)
    .replace(/\b\d{4}\b/g, "")
    .replace(/^[,\s-]+|[,\s-]+$/g, "")
    .trim();

  if (!candidate || /\d/.test(candidate)) {
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

function parseSuburbAndPostcode(value: string | null) {
  if (!value) {
    return {
      suburb: null,
      postcode: null,
    };
  }

  const cleaned = cleanTrailingText(value);
  const postcodeMatch = cleaned.match(/\b(\d{4})\b/);

  return {
    suburb: normalizeSuburbCandidate(cleaned),
    postcode: postcodeMatch ? postcodeMatch[1] : null,
  };
}

function parseHomeStreet(homeStreetRaw: string | null) {
  if (!homeStreetRaw) {
    return {
      homeStreetNumber: null,
      homeStreetName: null,
      homeStreetType: null,
      parsedSuburb: null,
      parsedPostcode: null,
    };
  }

  const match = HOME_STREET_PATTERN.exec(homeStreetRaw);

  if (!match?.groups) {
    return {
      homeStreetNumber: null,
      homeStreetName: null,
      homeStreetType: null,
      parsedSuburb: null,
      parsedPostcode: null,
    };
  }

  const tail = clean(match.groups.tail);
  const parsedTail = parseSuburbAndPostcode(tail);

  return {
    homeStreetNumber: clean(match.groups.streetNumber),
    homeStreetName: clean(match.groups.streetName),
    homeStreetType: clean(match.groups.streetType),
    parsedSuburb: parsedTail.suburb,
    parsedPostcode: parsedTail.postcode,
  };
}

function contactFromRow(row: CsvRow) {
  const firstName = clean(row["First Name"]);
  const lastName = clean(row["Last Name"]);
  const company = clean(row["Company"]);
  const homeStreetRaw = firstPresent(row, ["Home Street", "Home Address"]);
  const parsedHomeStreet = parseHomeStreet(homeStreetRaw);
  const homeSuburb =
    firstPresent(row, ["Home City", "Home Suburb", "Home Town", "Home Address City"]) ||
    parsedHomeStreet.parsedSuburb;
  const homePostcode =
    firstPresent(row, [
      "Home Postal Code",
      "Home Postcode",
      "Home ZIP/Postal Code",
      "Home Zip",
    ]) || parsedHomeStreet.parsedPostcode;

  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") || company || "Unknown";

  return {
    firstName,
    lastName,
    displayName,
    primaryPhone:
      clean(row["Mobile Phone"]) ||
      clean(row["Home Phone"]) ||
      clean(row["Business Phone"]),
    primaryEmail:
      clean(row["E-mail Address"]) ||
      clean(row["E-mail 2 Address"]) ||
      clean(row["E-mail 3 Address"]),
    rawNotes: clean(row["Notes"]),
    homeStreetRaw,
    homeStreetNumber: parsedHomeStreet.homeStreetNumber,
    homeStreetName: parsedHomeStreet.homeStreetName,
    homeStreetType: parsedHomeStreet.homeStreetType,
    homeSuburb,
    homePostcode,
  };
}

export async function GET() {
  const contactCount = await prisma.contact.count();

  return NextResponse.json({
    ok: true,
    message:
      "Import endpoint is ready. POST a multipart/form-data request with a CSV file field named 'file'.",
    contactCount,
  });
}

export async function POST(req: NextRequest) {
  console.log("[import-contacts] Upload started.");

  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  console.log(
    `[import-contacts] Received file: ${file.name || "unnamed"} (${file.size} bytes).`,
  );

  const text = await file.text();

  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: false,
    transformHeader: (header) => header.trim(),
  });

  if (parsed.errors.length > 0) {
    console.warn("[import-contacts] CSV parse warnings:", parsed.errors);
  }

  const parsedRowCount = parsed.data.length;
  const rows = parsed.data.filter((row) => !isBlankRow(row));
  const skippedBlankRowCount = parsedRowCount - rows.length;
  const contacts = rows.map(contactFromRow);

  console.log(`[import-contacts] Parsed ${parsedRowCount} CSV rows.`);
  console.log(`[import-contacts] Skipped ${skippedBlankRowCount} blank rows.`);
  console.log(`[import-contacts] Inserting ${contacts.length} contacts.`);

  let insertedRowCount = 0;

  for (let index = 0; index < contacts.length; index += BATCH_SIZE) {
    const batch = contacts.slice(index, index + BATCH_SIZE);
    const batchNumber = Math.floor(index / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(contacts.length / BATCH_SIZE);

    console.log(
      `[import-contacts] Inserting batch ${batchNumber}/${totalBatches} (${batch.length} contacts).`,
    );

    const result = await prisma.contact.createMany({
      data: batch,
    });

    insertedRowCount += result.count;

    console.log(
      `[import-contacts] Batch ${batchNumber}/${totalBatches} complete. Inserted ${insertedRowCount}/${contacts.length}.`,
    );
  }

  console.log(
    `[import-contacts] Upload complete. Parsed ${parsedRowCount}, inserted ${insertedRowCount}.`,
  );

  return NextResponse.json({
    success: true,
    parsedRowCount,
    skippedBlankRowCount,
    insertedRowCount,
  });
}

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const BATCH_SIZE = 500;

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

function contactFromRow(row: CsvRow): Prisma.ContactCreateManyInput {
  const firstName = clean(row["First Name"]);
  const lastName = clean(row["Last Name"]);
  const company = clean(row["Company"]);

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

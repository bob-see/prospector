import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import {
  disconnectCalendarSyncPrisma,
  importParsedCalendarEvents,
  parseCalendarEvents,
} from "@/lib/calendar-sync";

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    throw new Error(
      "Missing .ics file path. Usage: npm run import:calendar:file -- ~/Desktop/calendar-export.ics",
    );
  }

  const resolvedPath = path.resolve(inputPath);
  console.log(`Reading ICS file: ${resolvedPath}`);
  const fileContents = await fs.readFile(resolvedPath, "utf8");
  const parsedEvents = parseCalendarEvents(fileContents, "Historical Import");
  console.log(`Parsed raw events: ${parsedEvents.length}`);
  const filteredEvents = parsedEvents.filter((event) => event.title !== "Busy");
  const skippedBusyEvents = parsedEvents.length - filteredEvents.length;
  const skippedReasons =
    skippedBusyEvents > 0
      ? parsedEvents
          .filter((event) => event.title === "Busy")
          .slice(0, 3)
          .map(
            (event, index) =>
              `${index + 1}. Skipped placeholder event "Busy" at ${event.startDate.toISOString()}`,
          )
      : [];
  const result = await importParsedCalendarEvents(filteredEvents);

  console.log(`Parsed events: ${parsedEvents.length}`);
  console.log(`Skipped busy events: ${skippedBusyEvents}`);
  if (skippedReasons.length > 0) {
    console.log("Skipped reasons:");
    for (const reason of skippedReasons) {
      console.log(reason);
    }
  }
  console.log(`Created events: ${result.createdEvents}`);
  console.log(`Updated events: ${result.updatedEvents}`);
  console.log(`Unchanged events: ${result.unchangedEvents}`);
}

main()
  .catch((error) => {
    console.error("Historical calendar import failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectCalendarSyncPrisma();
  });

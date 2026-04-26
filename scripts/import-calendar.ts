import "dotenv/config";

import {
  disconnectCalendarSyncPrisma,
  syncCalendarFeeds,
} from "@/lib/calendar-sync";

async function main() {
  const result = await syncCalendarFeeds();

  console.log(
    `Parsed ${result.parsedEvents} events. Created ${result.createdEvents}, updated ${result.updatedEvents}, unchanged ${result.unchangedEvents}.`,
  );
}

main()
  .catch((error) => {
    console.error("Calendar import failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectCalendarSyncPrisma();
  });

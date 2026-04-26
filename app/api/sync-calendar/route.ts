import { NextResponse } from "next/server";
import {
  disconnectCalendarSyncPrisma,
  syncCalendarFeeds,
} from "@/lib/calendar-sync";

export async function POST() {
  try {
    const result = await syncCalendarFeeds();

    return NextResponse.json({
      message: `Calendar synced successfully: ${result.createdEvents} created, ${result.updatedEvents} updated, ${result.unchangedEvents} unchanged`,
      ok: true,
      result,
    });
  } catch (error) {
    console.error("Calendar sync API failed.");
    console.error(error);

    return NextResponse.json(
      {
        error: "Calendar sync failed",
        ok: false,
      },
      { status: 500 },
    );
  } finally {
    await disconnectCalendarSyncPrisma();
  }
}

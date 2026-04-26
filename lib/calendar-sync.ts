import "dotenv/config";

import { Prisma, PrismaClient } from "@prisma/client";
import * as ical from "node-ical";

const prisma = new PrismaClient();

export type ParsedCalendarEvent = {
  calendarName: string;
  category: string;
  title: string;
  description: string | null;
  location: string | null;
  startDate: Date;
  endDate: Date;
  rawText: string;
};

export type CalendarSyncResult = {
  calendarsProcessed: number;
  createdEvents: number;
  parsedEvents: number;
  skippedBusyEvents: number;
  unchangedEvents: number;
  updatedEvents: number;
};

function objectTextValue(value: Record<string, unknown>): string | null {
  for (const key of ["val", "value", "text"]) {
    const candidate = normalizeText(value[key]);

    if (candidate) {
      return candidate;
    }
  }

  const serialized = Object.values(value)
    .map((entry) => normalizeText(entry))
    .filter(Boolean)
    .join(" ");

  return serialized || null;
}

export function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    const joined = value
      .map((entry) => normalizeText(entry))
      .filter(Boolean)
      .join(" ");

    return joined || null;
  }

  if (typeof value === "object") {
    return objectTextValue(value as Record<string, unknown>);
  }

  return null;
}

function getDeduplicationKey(title: string, startDate: Date) {
  return `${title.trim().toLocaleLowerCase()}::${startDate.toISOString()}`;
}

function getCalendarDeduplicationKey(
  calendarName: string,
  title: string,
  startDate: Date,
) {
  return `${calendarName.trim().toLocaleLowerCase()}::${getDeduplicationKey(title, startDate)}`;
}

function serializeEvent(value: unknown) {
  return JSON.stringify(
    value,
    (_key, currentValue) =>
      currentValue instanceof Date ? currentValue.toISOString() : currentValue,
    2,
  );
}

function extractEventBlocks(icsText: string) {
  return icsText.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
}

export function categorizeEvent(title: string, description: string | null) {
  const haystack = `${title}\n${description || ""}`;

  if (
    /\b(?:appraisal|valuation|presentation|market\s+update|seller|listing|list|pre-listing|price)\b/i.test(
      haystack,
    )
  ) {
    return "prospecting";
  }

  if (
    /\b(?:ofi|open\s+home|open\s+for\s+inspection|inspection)\b/i.test(haystack)
  ) {
    return "ofi";
  }

  return "personal";
}

export function parseCalendarEvents(
  icsText: string,
  calendarName: string,
): ParsedCalendarEvent[] {
  const blocks = extractEventBlocks(icsText);
  const parsed = ical.sync.parseICS(icsText);
  const events: ParsedCalendarEvent[] = [];
  let blockIndex = 0;

  for (const entry of Object.values(parsed)) {
    if (!entry || entry.type !== "VEVENT") {
      continue;
    }

    if (!(entry.start instanceof Date) || !(entry.end instanceof Date)) {
      continue;
    }

    const title = normalizeText(entry.summary);

    if (!title) {
      continue;
    }

    const description = normalizeText(entry.description);
    const location = normalizeText(entry.location);

    events.push({
      calendarName,
      category: categorizeEvent(title, description),
      title,
      description,
      location,
      startDate: entry.start,
      endDate: entry.end,
      rawText: blocks[blockIndex] ?? serializeEvent(entry),
    });
    blockIndex += 1;
  }

  return events;
}

async function withRetry<T>(operation: () => Promise<T>, label: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === 3) {
        break;
      }

      console.warn(
        `${label} failed on attempt ${attempt}. Retrying...`,
        error,
      );
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }

  throw lastError;
}

export async function importParsedCalendarEvents(
  parsedEvents: ParsedCalendarEvent[],
): Promise<Omit<CalendarSyncResult, "calendarsProcessed">> {
  if (parsedEvents.length === 0) {
    return {
      createdEvents: 0,
      parsedEvents: 0,
      skippedBusyEvents: 0,
      unchangedEvents: 0,
      updatedEvents: 0,
    };
  }

  const uniqueEvents: ParsedCalendarEvent[] = [];
  const seenKeys = new Set<string>();

  for (const event of parsedEvents) {
    const key = getCalendarDeduplicationKey(
      event.calendarName,
      event.title,
      event.startDate,
    );

    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    uniqueEvents.push(event);
  }

  const existingEventWhere: Prisma.CalendarEventWhereInput = {
    OR: uniqueEvents.map((event) => ({
      calendarName: event.calendarName,
      startDate: event.startDate,
      title: event.title,
    })),
  };

  const existingEvents = await prisma.calendarEvent.findMany({
    where: existingEventWhere,
    select: {
      id: true,
      calendarName: true,
      category: true,
      description: true,
      endDate: true,
      location: true,
      rawText: true,
      startDate: true,
      title: true,
    },
  });

  const existingByKey = new Map(
    existingEvents.map((event) => [
      getCalendarDeduplicationKey(
        event.calendarName,
        event.title,
        event.startDate,
      ),
      event,
    ]),
  );
  const eventsToCreate: ParsedCalendarEvent[] = [];
  const eventsToUpdate: Array<{
    data: {
      category: string;
      description: string | null;
      endDate: Date;
      location: string | null;
      rawText: string;
    };
    id: string;
  }> = [];
  let unchangedEvents = 0;

  for (const event of uniqueEvents) {
    const key = getCalendarDeduplicationKey(
      event.calendarName,
      event.title,
      event.startDate,
    );
    const existingEvent = existingByKey.get(key);

    if (!existingEvent) {
      eventsToCreate.push(event);
      continue;
    }

    const hasChanges =
      existingEvent.description !== event.description ||
      existingEvent.location !== event.location ||
      existingEvent.endDate.getTime() !== event.endDate.getTime() ||
      existingEvent.rawText !== event.rawText ||
      existingEvent.category !== event.category;

    if (!hasChanges) {
      unchangedEvents += 1;
      continue;
    }

    eventsToUpdate.push({
      id: existingEvent.id,
      data: {
        category: event.category,
        description: event.description,
        endDate: event.endDate,
        location: event.location,
        rawText: event.rawText,
      },
    });
  }

  if (eventsToCreate.length > 0) {
    await withRetry(
      () =>
        prisma.calendarEvent.createMany({
          data: eventsToCreate,
        }),
      "Calendar createMany",
    );
  }

  if (eventsToUpdate.length > 0) {
    for (const event of eventsToUpdate) {
      await withRetry(
        () =>
          prisma.calendarEvent.update({
            data: event.data,
            where: {
              id: event.id,
            },
          }),
        `Calendar update ${event.id}`,
      );
    }
  }

  console.log(
    `Calendar import processed ${uniqueEvents.length} deduplicated events: ${eventsToCreate.length} created, ${eventsToUpdate.length} updated, ${unchangedEvents} unchanged.`,
  );

  return {
    createdEvents: eventsToCreate.length,
    parsedEvents: uniqueEvents.length,
    skippedBusyEvents: 0,
    unchangedEvents,
    updatedEvents: eventsToUpdate.length,
  };
}

export async function syncCalendarFeeds(): Promise<CalendarSyncResult> {
  const icsUrls = (process.env.OUTLOOK_CALENDAR_ICS_URL || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (icsUrls.length === 0) {
    throw new Error("OUTLOOK_CALENDAR_ICS_URL is not set.");
  }

  const allParsedEvents: ParsedCalendarEvent[] = [];

  for (const [index, icsUrl] of icsUrls.entries()) {
    const response = await fetch(icsUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch ICS feed ${index + 1}: ${response.status} ${response.statusText}`,
      );
    }

    const icsText = await response.text();
    const parsedEvents = parseCalendarEvents(icsText, `Calendar ${index + 1}`);

    console.log(
      `Parsed ${parsedEvents.length} events from Calendar ${index + 1}.`,
    );

    allParsedEvents.push(...parsedEvents);
  }

  if (allParsedEvents.length === 0) {
    console.log("No VEVENT records found across the ICS feeds.");
    return {
      calendarsProcessed: icsUrls.length,
      createdEvents: 0,
      parsedEvents: 0,
      skippedBusyEvents: 0,
      unchangedEvents: 0,
      updatedEvents: 0,
    };
  }

  const result = await importParsedCalendarEvents(allParsedEvents);

  console.log(
    `Calendar sync processed ${result.parsedEvents} deduplicated events across ${icsUrls.length} calendar feed(s): ${result.createdEvents} created, ${result.updatedEvents} updated, ${result.unchangedEvents} unchanged.`,
  );

  return {
    calendarsProcessed: icsUrls.length,
    ...result,
  };
}

export async function disconnectCalendarSyncPrisma() {
  await prisma.$disconnect();
}

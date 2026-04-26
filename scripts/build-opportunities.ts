import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import {
  extractContactName,
  parseOpportunity,
} from "../lib/opportunity-engine";

const prisma = new PrismaClient();

async function main() {
  const events = await prisma.calendarEvent.findMany({
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
      startDate: true,
    },
  });

  const contactCounts = new Map<string, number>();

  for (const event of events) {
    const contactName = extractContactName(event.description);

    if (!contactName) {
      continue;
    }

    const key = contactName.toLowerCase();
    contactCounts.set(key, (contactCounts.get(key) ?? 0) + 1);
  }

  const existingOpportunities = await prisma.opportunity.findMany({
    select: {
      calendarEventId: true,
    },
  });
  const existingEventIds = new Set(
    existingOpportunities.map((opportunity) => opportunity.calendarEventId),
  );
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const event of events) {
    const contactName = extractContactName(event.description);
    const hasDuplicateContactHistory = contactName
      ? (contactCounts.get(contactName.toLowerCase()) ?? 0) > 1
      : false;
    const opportunity = parseOpportunity(event, {
      hasDuplicateContactHistory,
    });

    if (!opportunity) {
      skippedCount += 1;
      continue;
    }

    await prisma.opportunity.upsert({
      where: {
        calendarEventId: opportunity.calendarEventId,
      },
      create: opportunity,
      update: {
        contactName: opportunity.contactName,
        eventTitle: opportunity.eventTitle,
        eventDate: opportunity.eventDate,
        noteDate: opportunity.noteDate,
        signalType: opportunity.signalType,
        timingSignal: opportunity.timingSignal,
        opportunityScore: opportunity.opportunityScore,
        status: opportunity.status,
        scoreBreakdown: opportunity.scoreBreakdown,
        summary: opportunity.summary,
      },
    });

    if (existingEventIds.has(opportunity.calendarEventId)) {
      updatedCount += 1;
    } else {
      createdCount += 1;
    }
  }

  const totalOpportunities = await prisma.opportunity.count();

  console.log(`Scanned CalendarEvent records: ${events.length}`);
  console.log(`Created opportunities: ${createdCount}`);
  console.log(`Updated opportunities: ${updatedCount}`);
  console.log(`Skipped events: ${skippedCount}`);
  console.log(`Total opportunities: ${totalOpportunities}`);
}

main()
  .catch((error) => {
    console.error("Failed to build opportunities.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "contactName" TEXT,
    "eventTitle" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "noteDate" TIMESTAMP(3),
    "signalType" TEXT NOT NULL,
    "timingSignal" TEXT,
    "opportunityScore" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_calendarEventId_key" ON "Opportunity"("calendarEventId");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

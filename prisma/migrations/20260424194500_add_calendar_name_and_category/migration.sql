ALTER TABLE "CalendarEvent"
ADD COLUMN "calendarName" TEXT NOT NULL DEFAULT 'Calendar 1',
ADD COLUMN "category" TEXT NOT NULL DEFAULT 'personal';

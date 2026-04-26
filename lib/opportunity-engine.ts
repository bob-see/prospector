export type OpportunityCalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  startDate: Date;
};

export type ParsedOpportunity = {
  calendarEventId: string;
  contactName: string | null;
  eventTitle: string;
  eventDate: Date;
  noteDate: Date | null;
  signalType: string;
  timingSignal: string | null;
  opportunityScore: number;
  status: string;
  scoreBreakdown: string | null;
  summary: string | null;
};

const APPRAISAL_TITLE_PATTERNS = [
  "APPRAISAL/PRESENTATION",
  "LIST PRESENTATION",
  "APPRAISAL",
  "PRESENTATION",
  "VALUATION",
];

const SELLER_INTENT_RULES = [
  {
    score: 30,
    phrases: [
      "wants appraisal",
      "wants to sell",
      "ready to sell",
      "wants to list",
      "listing soon",
    ],
  },
  {
    score: 20,
    phrases: [
      "thinking of selling",
      "will sell",
      "considering selling",
      "may sell",
    ],
  },
  {
    score: 15,
    phrases: [
      "in a few years",
      "after renovation",
      "after lease",
      "next year",
      "after christmas",
    ],
  },
  {
    score: -20,
    phrases: ["not selling", "staying put", "hold off"],
  },
];

function containsPhrase(value: string, phrase: string) {
  return value.includes(phrase.toLowerCase());
}

export function extractNoteDate(description: string | null) {
  if (!description) {
    return null;
  }

  const match = description.match(/\b(\d{2})\/(\d{2})\/(\d{4})\s*:/);

  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const parsedDay = Number.parseInt(day, 10);
  const parsedMonth = Number.parseInt(month, 10);
  const parsedYear = Number.parseInt(year, 10);
  const parsedDate = new Date(
    parsedYear,
    parsedMonth - 1,
    parsedDay,
  );

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.getFullYear() !== parsedYear ||
    parsedDate.getMonth() !== parsedMonth - 1 ||
    parsedDate.getDate() !== parsedDay
  ) {
    return null;
  }

  return parsedDate;
}

export function extractContactName(description: string | null) {
  if (!description) {
    return null;
  }

  const match = description.match(/\bspoke to\s+([^.,:;\n\r]+)/i);

  if (!match) {
    return null;
  }

  const stopWords = new Set([
    "about",
    "regarding",
    "re",
    "and",
    "who",
    "today",
    "yesterday",
  ]);
  const nameParts = match[1]
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  const cleanParts: string[] = [];

  for (const part of nameParts) {
    if (stopWords.has(part.toLowerCase())) {
      break;
    }

    cleanParts.push(part);
  }

  return cleanParts.length > 0 ? cleanParts.join(" ") : null;
}

function classifyTitle(title: string) {
  const upperTitle = title.toUpperCase();

  if (APPRAISAL_TITLE_PATTERNS.some((pattern) => upperTitle.includes(pattern))) {
    return {
      score: 40,
      signalType: "appraisal",
    };
  }

  if (/\bFOLLOW UP\b|\bF\/U\b|\bFU\b/i.test(title)) {
    return {
      score: 15,
      signalType: "follow_up",
    };
  }

  return null;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);

  return result;
}

function addYears(date: Date, years: number) {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);

  return result;
}

function extractTimingSignal(description: string, noteDate: Date, now: Date) {
  const yearMatch = description.match(/\bin\s+(\d+)\s+years?\b/i);
  const monthMatch = description.match(/\bin\s+(\d+)\s+months?\b/i);
  const match = yearMatch || monthMatch;

  if (!match) {
    return {
      isOverdue: false,
      timingSignal: null,
    };
  }

  const amount = Number.parseInt(match[1], 10);
  const targetDate = yearMatch
    ? addYears(noteDate, amount)
    : addMonths(noteDate, amount);

  return {
    isOverdue: targetDate < now,
    timingSignal: `${match[0]} from note date (${targetDate.toISOString().slice(0, 10)})`,
  };
}

function getStatus(score: number, isOverdue: boolean) {
  if (isOverdue) {
    return "overdue";
  }

  if (score >= 80) {
    return "hot";
  }

  if (score >= 60) {
    return "warm";
  }

  if (score >= 40) {
    return "watchlist";
  }

    return "no_signal";
}

export function parseOpportunity(
  event: OpportunityCalendarEvent,
  options: {
    hasDuplicateContactHistory?: boolean;
    now?: Date;
  } = {},
): ParsedOpportunity | null {
  const description = event.description || "";
  const lowerDescription = description.toLowerCase();
  const titleClassification = classifyTitle(event.title);
  let opportunityScore = titleClassification?.score ?? 0;
  let signalType = titleClassification?.signalType ?? null;
  const scoreBreakdown: string[] = [];

  if (titleClassification) {
    scoreBreakdown.push(
      `${titleClassification.signalType} title signal: +${titleClassification.score}`,
    );
  }

  for (const rule of SELLER_INTENT_RULES) {
    const matchedPhrase = rule.phrases.find((phrase) =>
      containsPhrase(lowerDescription, phrase),
    );

    if (matchedPhrase) {
      opportunityScore += rule.score;
      scoreBreakdown.push(
        `"${matchedPhrase}" seller intent signal: ${rule.score > 0 ? "+" : ""}${rule.score}`,
      );

      if (!signalType) {
        signalType = "seller_intent";
      }
    }
  }

  const noteDate = extractNoteDate(event.description);
  const timing =
    noteDate && description
      ? extractTimingSignal(description, noteDate, options.now ?? new Date())
      : {
          isOverdue: false,
          timingSignal: null,
        };

  if (timing.isOverdue) {
    opportunityScore += 25;
    scoreBreakdown.push("timing target is overdue: +25");
  }

  if (!signalType && timing.timingSignal) {
    signalType = "timing";
    scoreBreakdown.push(`timing signal: ${timing.timingSignal}`);
  }

  if (!signalType) {
    return null;
  }

  return {
    calendarEventId: event.id,
    contactName: extractContactName(event.description),
    eventTitle: event.title,
    eventDate: event.startDate,
    noteDate,
    signalType,
    timingSignal: timing.timingSignal,
    opportunityScore,
    status: getStatus(opportunityScore, timing.isOverdue),
    scoreBreakdown: JSON.stringify(scoreBreakdown),
    summary: options.hasDuplicateContactHistory
      ? "Possible duplicate follow-up history"
      : null,
  };
}

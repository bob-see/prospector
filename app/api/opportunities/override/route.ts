import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_OVERRIDES = new Set(["hot", "warm", "watchlist", "no_signal"]);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    opportunityId?: unknown;
    manualOverride?: unknown;
  } | null;

  if (!body || typeof body.opportunityId !== "string") {
    return NextResponse.json(
      { error: "opportunityId is required." },
      { status: 400 },
    );
  }

  if (
    body.manualOverride !== null &&
    body.manualOverride !== undefined &&
    (typeof body.manualOverride !== "string" ||
      !VALID_OVERRIDES.has(body.manualOverride))
  ) {
    return NextResponse.json(
      { error: "manualOverride must be hot, warm, watchlist, no_signal, or null." },
      { status: 400 },
    );
  }

  const opportunity = await prisma.opportunity.update({
    where: {
      id: body.opportunityId,
    },
    data: {
      manualOverride:
        typeof body.manualOverride === "string" ? body.manualOverride : null,
    },
    select: {
      id: true,
      manualOverride: true,
    },
  });

  return NextResponse.json({ opportunity });
}

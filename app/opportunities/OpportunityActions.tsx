"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CalendarNotesModal from "@/components/CalendarNotesModal";

type ManualOverride = "hot" | "warm" | "watchlist" | "no_signal" | null;

type OpportunityActionsProps = {
  description: string | null;
  eventTitle: string;
  manualOverride: ManualOverride;
  opportunityId: string;
  opportunityScore: number;
  scoreBreakdown: string | null;
  status: string;
};

const OVERRIDE_ACTIONS: Array<{
  label: string;
  value: ManualOverride;
}> = [
  { label: "Promote to Hot", value: "hot" },
  { label: "Promote to Warm", value: "warm" },
  { label: "Move to Watchlist", value: "watchlist" },
  { label: "Move to No Signal", value: "no_signal" },
  { label: "Clear Override", value: null },
];

function getDisplayStatus(status: string, manualOverride: ManualOverride) {
  const effectiveStatus = manualOverride || status;

  return effectiveStatus === "archive" ? "no_signal" : effectiveStatus;
}

function formatStatusLabel(status: string) {
  if (status === "no_signal" || status === "archive") {
    return "No Signal";
  }

  return status.replaceAll("_", " ");
}

function parseScoreBreakdown(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [value];
  }
}

export default function OpportunityActions({
  description,
  eventTitle,
  manualOverride,
  opportunityId,
  opportunityScore,
  scoreBreakdown,
  status,
}: OpportunityActionsProps) {
  const router = useRouter();
  const [isWhyOpen, setIsWhyOpen] = useState(false);
  const [pendingOverride, setPendingOverride] = useState<ManualOverride | "idle">(
    "idle",
  );
  const displayStatus = getDisplayStatus(status, manualOverride);
  const breakdownItems = useMemo(
    () => parseScoreBreakdown(scoreBreakdown),
    [scoreBreakdown],
  );

  useEffect(() => {
    if (!isWhyOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsWhyOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isWhyOpen]);

  async function updateOverride(value: ManualOverride) {
    setPendingOverride(value);

    try {
      const response = await fetch("/api/opportunities/override", {
        body: JSON.stringify({
          manualOverride: value,
          opportunityId,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to update opportunity override.");
      }

      router.refresh();
    } finally {
      setPendingOverride("idle");
    }
  }

  const whyModal =
    typeof document !== "undefined" && isWhyOpen
      ? createPortal(
          <div
            aria-hidden="true"
            className="notes-modal-overlay"
            onClick={() => setIsWhyOpen(false)}
          >
            <div
              aria-labelledby="opportunity-why-title"
              aria-modal="true"
              className="notes-modal-card"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="notes-modal-header">
                <div>
                  <p className="notes-modal-kicker">Score Breakdown</p>
                  <h2 className="notes-modal-title" id="opportunity-why-title">
                    {eventTitle}
                  </h2>
                </div>
                <button
                  className="notes-modal-close"
                  onClick={() => setIsWhyOpen(false)}
                  type="button"
                >
                  Close
                </button>
              </div>
              <div className="notes-modal-body">
                <dl className="opportunity-why-grid">
                  <div>
                    <dt>opportunityScore</dt>
                    <dd>{opportunityScore}</dd>
                  </div>
                  <div>
                    <dt>status</dt>
                    <dd>{formatStatusLabel(displayStatus)}</dd>
                  </div>
                </dl>

                <h3 className="opportunity-why-heading">scoreBreakdown</h3>
                {breakdownItems.length > 0 ? (
                  <ul className="opportunity-breakdown-list">
                    {breakdownItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="notes-modal-empty">
                    No score breakdown has been stored for this opportunity yet.
                    Re-run `npm run build:opportunities`.
                  </p>
                )}

                <h3 className="opportunity-why-heading">
                  Original calendar notes
                </h3>
                {description ? (
                  <p className="notes-modal-text">{description}</p>
                ) : (
                  <p className="notes-modal-empty">No notes recorded.</p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="opportunity-actions">
      <div className="opportunity-primary-actions">
        <CalendarNotesModal description={description} title={eventTitle} />
        <button
          className="notes-modal-trigger"
          onClick={() => setIsWhyOpen(true)}
          type="button"
        >
          Why?
        </button>
      </div>
      <div className="opportunity-override-actions">
        {OVERRIDE_ACTIONS.map((action) => (
          <button
            className="opportunity-override-button"
            disabled={pendingOverride !== "idle"}
            key={action.label}
            onClick={() => updateOverride(action.value)}
            type="button"
          >
            {pendingOverride === action.value ? "Saving..." : action.label}
          </button>
        ))}
      </div>
      {whyModal}
    </div>
  );
}

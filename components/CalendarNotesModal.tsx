"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type CalendarNotesModalProps = {
  title: string;
  description: string | null;
};

export default function CalendarNotesModal({
  title,
  description,
}: CalendarNotesModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const modalContent =
    typeof document !== "undefined" && isOpen
      ? createPortal(
          <div
            aria-hidden="true"
            className="notes-modal-overlay"
            onClick={() => setIsOpen(false)}
          >
            <div
              aria-labelledby="notes-modal-title"
              aria-modal="true"
              className="notes-modal-card"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="notes-modal-header">
                <div>
                  <p className="notes-modal-kicker">Calendar Event Notes</p>
                  <h2 className="notes-modal-title" id="notes-modal-title">
                    {title}
                  </h2>
                </div>
                <button
                  className="notes-modal-close"
                  onClick={() => setIsOpen(false)}
                  type="button"
                >
                  Close
                </button>
              </div>

              <div className="notes-modal-body">
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
    <>
      <button
        className="notes-modal-trigger"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        View Notes
      </button>
      {modalContent}
    </>
  );
}

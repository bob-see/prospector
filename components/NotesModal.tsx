"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type NotesModalProps = {
  displayName: string;
  rawNotes: string | null;
};

export default function NotesModal({
  displayName,
  rawNotes,
}: NotesModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
    isMounted && isOpen
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
                  <p className="notes-modal-kicker">Original Contact Notes</p>
                  <h2 className="notes-modal-title" id="notes-modal-title">
                    {displayName}
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
                {rawNotes ? (
                  <p className="notes-modal-text">{rawNotes}</p>
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

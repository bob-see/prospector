"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncCalendarButton() {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSync() {
    setIsSyncing(true);
    setMessage(null);

    try {
      const response = await fetch("/api/sync-calendar", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message || "Calendar sync failed");
      }

      setMessage(payload.message || "Calendar synced successfully");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Calendar sync failed",
      );
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="prospector-sync-wrap">
      <button
        className="prospector-filter-button"
        disabled={isSyncing}
        onClick={handleSync}
        type="button"
      >
        {isSyncing ? "Syncing..." : "Sync Calendar"}
      </button>
      {message ? <p className="prospector-sync-message">{message}</p> : null}
    </div>
  );
}

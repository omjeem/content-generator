/**
 * Implicit Signal Tracking — Phase 4 #37
 *
 * Tracks passive user interactions with suggestion cards and batches them
 * for periodic upload. Signals are accumulated in memory and flushed every
 * 15 seconds or on page visibility change (beforeunload/visibilitychange).
 */

import type { ImplicitSignalType } from "@repo/shared-types";

interface PendingSignal {
  type: ImplicitSignalType;
  suggestionSetId: string;
  suggestionIndex: number;
  metadata?: { timeSpentMs?: number };
}

// ── Signal buffer ──────────────────────────────────────────────────────────────

let buffer: PendingSignal[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

const FLUSH_INTERVAL_MS = 15_000; // 15 seconds
const MAX_BUFFER_SIZE = 50;

// ── Public API ─────────────────────────────────────────────────────────────────

/** Track a single implicit signal. It will be batched and sent later. */
export function trackImplicitSignal(signal: PendingSignal): void {
  // De-duplicate: don't record the same signal type for the same suggestion twice
  const duplicate = buffer.find(
    (s) =>
      s.type === signal.type &&
      s.suggestionSetId === signal.suggestionSetId &&
      s.suggestionIndex === signal.suggestionIndex,
  );
  if (duplicate) return;

  buffer.push(signal);

  // Flush immediately if buffer is full
  if (buffer.length >= MAX_BUFFER_SIZE) {
    void flush();
  }
}

/** Start the automatic flush timer. Call once on app mount. */
export function startImplicitTracking(): void {
  if (flushTimer) return;

  flushTimer = setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);

  // Flush on page hide (tab switch / close)
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        void flush();
      }
    });
  }

  // Flush on page unload
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      void flush();
    });
  }
}

/** Stop the flush timer. */
export function stopImplicitTracking(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  // Final flush
  void flush();
}

// ── Internal ───────────────────────────────────────────────────────────────────

async function flush(): Promise<void> {
  if (buffer.length === 0) return;

  // Drain the buffer
  const batch = buffer.splice(0, buffer.length);

  try {
    await fetch("/api/feedback/implicit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ signals: batch }),
    });
  } catch {
    // Non-fatal: put failed signals back for next attempt (up to MAX_BUFFER_SIZE)
    buffer.push(...batch.slice(0, MAX_BUFFER_SIZE - buffer.length));
  }
}

// ── Convenience helpers for SuggestionCard ─────────────────────────────────────

export function trackHookCopied(setId: string, index: number): void {
  trackImplicitSignal({
    type: "hook_copied",
    suggestionSetId: setId,
    suggestionIndex: index,
  });
}

export function trackBriefCopied(setId: string, index: number): void {
  trackImplicitSignal({
    type: "brief_copied",
    suggestionSetId: setId,
    suggestionIndex: index,
  });
}

export function trackWriteClicked(setId: string, index: number): void {
  trackImplicitSignal({
    type: "write_clicked",
    suggestionSetId: setId,
    suggestionIndex: index,
  });
}

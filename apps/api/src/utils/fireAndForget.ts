/**
 * Fire-and-Forget Safety Wrapper — Phase 4 #3
 *
 * Wraps async fire-and-forget calls with structured error logging.
 * Prevents unhandled promise rejections from crashing the process.
 *
 * Usage:
 *   fireAndForget(() => trackTokenUsage(data), "token-tracking");
 *   fireAndForget(() => someAsyncFn(), "label");
 */

export function fireAndForget(
  fn: () => void | Promise<unknown>,
  label: string,
): void {
  try {
    const result = fn();
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      (result as Promise<unknown>).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[fire-and-forget:${label}]`, message);
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[fire-and-forget:${label}]`, message);
  }
}

/**
 * LinkedIn scraping via Puppeteer is disabled to keep the Docker image lean
 * (~726MB Chromium removed). Re-enable by installing `puppeteer`, adding
 * Chromium back to the Dockerfile, and restoring the original implementation.
 *
 * For now, users paste posts manually via parseManualPosts().
 */
export async function scrapeLinkedInProfile(
  _profileUrl: string,
): Promise<string[]> {
  throw new ScrapingBlockedError(
    "LinkedIn scraping is currently disabled. Please paste your posts manually.",
  );
}

/**
 * Parses manually pasted LinkedIn posts.
 * Posts should be separated by a blank line, "---", or "===".
 */
export function parseManualPosts(rawText: string): string[] {
  const separators = /\n\s*---+\s*\n|\n\s*===+\s*\n|\n{2,}/g;
  return rawText
    .split(separators)
    .map((p) => p.trim())
    .filter((p) => p.length > 30) // discard very short fragments
    .slice(0, 30); // max 30 posts
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export class ScrapingBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScrapingBlockedError";
  }
}

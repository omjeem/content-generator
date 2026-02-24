import puppeteer from "puppeteer";

/**
 * Attempts to scrape recent posts from a public LinkedIn profile.
 * LinkedIn aggressively blocks scrapers — if it fails, the caller
 * should fall back to parseManualPosts().
 */
export async function scrapeLinkedInProfile(
  profileUrl: string,
): Promise<string[]> {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    const page = await browser.newPage();

    // Spoof user-agent to reduce detection
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    // Navigate to profile
    await page.goto(profileUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Random delay to mimic human behaviour
    await delay(1500 + Math.random() * 1500);

    // Check if LinkedIn blocked us with a login wall
    const currentUrl = page.url();
    if (currentUrl.includes("/login") || currentUrl.includes("/authwall")) {
      throw new ScrapingBlockedError(
        "LinkedIn requires login to view this profile. Please paste your posts manually.",
      );
    }

    // Try to extract post text from the activity section
    // page.evaluate runs inside the browser context where document/DOM exist
    const posts = await page.evaluate((): string[] => {
      const postSelectors = [
        ".feed-shared-update-v2__description",
        ".break-words",
        '[data-test-id="main-feed-activity-card__commentary"]',
      ];

      const texts: string[] = [];
      for (const selector of postSelectors) {
        // eslint-disable-next-line no-undef
        document.querySelectorAll(selector).forEach((el: Element) => {
          const text = el.textContent?.trim();
          if (text && text.length > 50) texts.push(text);
        });
        if (texts.length >= 20) break;
      }

      return [...new Set(texts)].slice(0, 20);
    });

    if (posts.length === 0) {
      throw new ScrapingBlockedError(
        "No posts found on this profile. The profile may be private or LinkedIn blocked the request. " +
          "Please paste your posts manually.",
      );
    }

    return posts;
  } catch (err) {
    if (err instanceof ScrapingBlockedError) throw err;
    throw new ScrapingBlockedError(
      `LinkedIn scraping failed: ${err instanceof Error ? err.message : String(err)}. ` +
        "Please paste your posts manually instead.",
    );
  } finally {
    await browser?.close();
  }
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ScrapingBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScrapingBlockedError";
  }
}

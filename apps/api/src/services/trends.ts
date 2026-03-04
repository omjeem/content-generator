/**
 * Trend Research Service
 *
 * Fetches REAL trending content from live APIs — no LLM hallucination.
 * Multi-tier strategy (highest quality first):
 *
 *  Tier 1 — Tavily (when TAVILY_API_KEY is set)
 *    └─ AI-optimised web search; niche-targeted; recency-filtered
 *
 *  Tier 2 — Hacker News Algolia + RSS Feeds (always-on, zero API keys)
 *    ├─ HN Algolia: real trending tech/AI/startup stories (no key, no limit)
 *    └─ RSS Feeds: TechCrunch, Entrepreneur, VentureBeat, Fast Company,
 *                  MIT Technology Review, Inc. Magazine, NYT Technology (no key)
 *
 *  Tier 2.5 — Google News RSS (free, no key, fallback when HN+RSS yield < 5)
 *
 *  Tier 3 — Evergreen fallback (no network call)
 *    └─ Returns content-pillar-based fallback topics if all APIs fail
 *
 * The raw article titles fetched here are passed to the trendResearch agent
 * which filters them for relevance and adds LinkedIn content angles.
 *
 * Phase 3 Audit:
 *  #1  — Removed duplicate internal cache (canonical cache lives in trendCache.ts)
 *  #3  — HN Algolia queries now filter by created_at_i > 48h ago
 *  #4  — RSS feeds shuffled within equal-score tiers for variety
 *  #7  — HN_QUERY_MAP expanded to 30+ industries
 *  #8  — Lower HN points threshold (2) for raw/niche keyword queries
 *  #9  — RSS backup feed retry when all primary feeds fail
 *  #10 — Hyphen-normalized keyword matching in isRelevant()
 *  #11 — Google News RSS as Tier 2.5 fallback
 */

import Parser from "rss-parser";
import { tavily } from "@tavily/core";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RawTrendItem {
  title: string;
  url?: string;
  source: string; // "hackernews" | "rss:TechCrunch" | "tavily" | "google-news" | etc.
  score?: number; // HN points or Tavily relevance score
  publishedAt?: string;
}

// ── RSS feed sources ───────────────────────────────────────────────────────────
// Curated sources covering: tech, AI, business, leadership, startups, marketing
// All are free, no API key, no rate limits

const RSS_FEEDS: { name: string; url: string; topics: string[] }[] = [
  {
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    topics: ["tech", "ai", "startup", "saas", "software", "engineering"],
  },
  {
    // HBR feeds.hbr.org is dead (TLS failure). Replaced with Entrepreneur for
    // leadership/management/business content coverage.
    name: "Entrepreneur",
    url: "https://www.entrepreneur.com/latest.rss",
    topics: [
      "leadership",
      "management",
      "strategy",
      "business",
      "career",
      "hr",
      "entrepreneurship",
      "startup",
    ],
  },
  {
    // feeds.feedburner.com/venturebeat/SZYF still works but direct URL is more reliable
    name: "VentureBeat",
    url: "https://venturebeat.com/feed/",
    topics: ["ai", "ml", "enterprise", "tech", "startup", "data"],
  },
  {
    name: "Fast Company",
    url: "https://www.fastcompany.com/latest/rss",
    topics: ["innovation", "design", "business", "leadership", "marketing"],
  },
  {
    name: "MIT Technology Review",
    url: "https://www.technologyreview.com/feed/",
    topics: ["ai", "biotech", "climate", "computing", "engineering", "science"],
  },
  {
    name: "Inc. Magazine",
    url: "https://www.inc.com/rss",
    topics: [
      "entrepreneurship",
      "startup",
      "growth",
      "management",
      "marketing",
    ],
  },
  {
    name: "NYT Technology",
    url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
    topics: ["tech", "ai", "software", "computing", "science", "data"],
  },
];

// ── HN search terms per broad topic (#7 — expanded to 30+ industries) ────────
// Maps niche keywords → HN search queries for best results

const HN_QUERY_MAP: Record<string, string> = {
  // Tech & Software
  ai: "AI machine learning LLM",
  "artificial intelligence": "AI machine learning LLM",
  "machine learning": "machine learning neural network",
  "deep learning": "deep learning AI neural network",
  saas: "SaaS startup product",
  startup: "startup founder YC",
  engineering: "software engineering developer tools",
  software: "software engineering developer tools",
  devops: "devops CI CD infrastructure",
  cloud: "cloud AWS infrastructure devops",
  security: "security infosec cybersecurity",
  cybersecurity: "cybersecurity security infosec",
  data: "data engineering analytics",
  "data science": "data science analytics machine learning",
  blockchain: "blockchain crypto web3 decentralized",
  crypto: "crypto blockchain bitcoin ethereum",
  web3: "web3 blockchain decentralized",
  mobile: "mobile app iOS Android development",
  frontend: "frontend React JavaScript web development",
  backend: "backend API microservices infrastructure",

  // Business & Finance
  fintech: "fintech payments banking digital finance",
  finance: "fintech banking payments insurance",
  ecommerce: "ecommerce retail B2C online shopping",
  marketing: "marketing growth SEO content",
  "digital marketing": "marketing growth SEO content strategy",
  sales: "sales B2B revenue growth pipeline",
  hr: "hiring remote work people management",
  "human resources": "hiring remote work people management",
  leadership: "leadership management productivity",
  management: "management leadership team productivity",
  consulting: "consulting strategy management advisory",
  "real estate": "proptech real estate housing construction",
  proptech: "proptech real estate housing construction",
  insurance: "insurtech insurance fintech risk",

  // Healthcare & Science
  healthcare: "health tech medical biotech digital health",
  health: "health tech medical biotech digital health",
  biotech: "biotech pharma drug discovery genomics",
  pharma: "pharma biotech drug discovery healthcare",
  medtech: "medtech medical device healthcare technology",
  "mental health": "mental health wellness therapy tech",

  // Education
  education: "edtech learning education online course",
  edtech: "edtech learning education online course",

  // Legal & Government
  legal: "legaltech law compliance regulation",
  legaltech: "legaltech law compliance regulation",
  government: "govtech government public sector digital",

  // Consumer & Retail
  food: "foodtech restaurant supply chain agriculture",
  foodtech: "foodtech restaurant agriculture food delivery",
  fashion: "fashion retail D2C ecommerce brand",
  retail: "retail ecommerce D2C consumer brand",
  travel: "travel hospitality tourism booking",
  gaming: "gaming esports game development",

  // Industrial & Infrastructure
  manufacturing: "manufacturing industry 4.0 automation robotics",
  logistics: "logistics supply chain shipping warehouse",
  energy: "energy cleantech renewable sustainability",
  cleantech: "cleantech renewable energy climate sustainability",
  climate: "climate sustainability cleantech carbon",
  automotive: "automotive EV self-driving mobility",
  construction: "construction proptech building infrastructure",
  agriculture: "agtech agriculture farming sustainability",

  // Creative & Media
  design: "design UX product",
  media: "media publishing content creator journalism",
  creator: "creator economy content monetization",
  "content creation": "content creator economy social media",

  // General
  innovation: "innovation technology disruption startup",
  sustainability: "sustainability ESG climate green tech",
  diversity: "diversity inclusion DEI workplace culture",
  "remote work": "remote work hybrid distributed team",
  productivity: "productivity tools workflow automation",
};

// ── Utility: keyword relevance check (word-boundary aware) (#10) ─────────────
// Uses \b word boundaries so short words like "ai" don't match "tail" or "email".
// Falls back to simple includes() for multi-word phrases (spaces break \b matching).
// Phase 3 #10: Normalizes hyphens to spaces so "machine-learning" matches "machine learning".

function isRelevant(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase().replace(/-/g, " ");
  return keywords.some((kw) => {
    const kwLower = kw.toLowerCase().trim().replace(/-/g, " ");
    if (!kwLower) return false;
    // Multi-word keyword: use simple includes (word boundaries don't help across spaces)
    if (kwLower.includes(" ")) return lower.includes(kwLower);
    // Single word: use word-boundary regex to avoid false partial matches
    try {
      return new RegExp(
        `\\b${kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      ).test(lower);
    } catch {
      return lower.includes(kwLower);
    }
  });
}

// ── Fisher-Yates shuffle ──────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

// ── Source 1: Tavily — premium AI web search ──────────────────────────────────
// Returns real web articles relevant to the user's specific niche.
// Only called when TAVILY_API_KEY is set.

async function fetchFromTavily(
  keywords: string[],
  industry: string,
): Promise<RawTrendItem[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  try {
    const client = tavily({ apiKey });
    const query = `trending topics and news in ${industry}: ${keywords.slice(0, 3).join(", ")} 2026`;

    console.log(`[trends:tavily] Searching: "${query}"`);

    const response = await client.search(query, {
      topic: "news",
      time_range: "week", // only content from the last week
      max_results: 10,
      search_depth: "basic", // 1 credit each
    });

    const items: RawTrendItem[] = (response.results ?? []).map((r) => ({
      title: r.title ?? r.url,
      url: r.url,
      source: "tavily",
      score: r.score,
      publishedAt: r.publishedDate,
    }));

    console.log(`[trends:tavily] ✓ ${items.length} results`);
    return items;
  } catch (err) {
    console.warn("[trends:tavily] Failed:", (err as Error).message);
    return [];
  }
}

// ── Source 2a: Hacker News Algolia — real trending tech stories ───────────────
// Completely free, no API key, ~10,000 req/hour limit.
// Filters by points to ensure quality (only community-validated stories).
// Phase 3 #3: Adds created_at_i> time filter for recency.
// Phase 3 #8: Uses lower points threshold (2) for raw/niche keyword queries.

async function fetchFromHackerNews(
  keywords: string[],
  industry: string,
): Promise<RawTrendItem[]> {
  try {
    // Build a focused HN query — 3-5 terms max for best relevance.
    const firstMappedExpansion = keywords
      .map((k) => HN_QUERY_MAP[k.toLowerCase()])
      .find(Boolean); // first hit wins
    const fallbackTerms = keywords.slice(0, 3).join(" ") || industry;
    const query = firstMappedExpansion ?? fallbackTerms;

    // #8: Lower threshold for raw keyword queries (no HN_QUERY_MAP match)
    const pointsMin = firstMappedExpansion ? 5 : 2;

    console.log(
      `[trends:hn] Searching HN for: "${query}" (pointsMin=${pointsMin})`,
    );

    // #3: Only fetch stories from the last 48 hours for recency
    const twoDaysAgo = Math.floor(
      (Date.now() - 48 * 60 * 60 * 1000) / 1000,
    );

    // Helper to run a single HN Algolia fetch
    const fetchHN = async (
      endpoint: "search_by_date" | "search",
      ptsMin: number,
      useTimeFilter: boolean,
    ) => {
      const url = new URL(`https://hn.algolia.com/api/v1/${endpoint}`);
      url.searchParams.set("query", query);
      url.searchParams.set("tags", "story");
      // #3: Combine points filter with optional time filter
      const numericFilters = useTimeFilter
        ? `points>${ptsMin},created_at_i>${twoDaysAgo}`
        : `points>${ptsMin}`;
      url.searchParams.set("numericFilters", numericFilters);
      url.searchParams.set("hitsPerPage", "20");

      const res = await fetch(url.toString(), {
        headers: { "User-Agent": "ContentGeneratorApp/1.0" },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as {
        hits: {
          title: string;
          url?: string;
          story_url?: string;
          points: number;
          created_at: string;
        }[];
      };

      return (data.hits ?? [])
        .filter((h) => h.title && h.title.length > 10)
        .map(
          (h): RawTrendItem => ({
            title: h.title,
            url: h.url ?? h.story_url,
            source: "hackernews",
            score: h.points,
            publishedAt: h.created_at,
          }),
        );
    };

    // Attempt 1: recent stories (last 48h) with points filter
    let items = await fetchHN("search_by_date", pointsMin, true);

    // Attempt 2: if still sparse, try without time filter (ranked endpoint)
    if (items.length < 5) {
      console.log(
        `[trends:hn] Only ${items.length} recent stories — trying ranked search (no time filter)`,
      );
      const ranked = await fetchHN("search", pointsMin, false);
      // Merge: prefer recent stories, top up with ranked ones
      const existingUrls = new Set(items.map((i) => i.url));
      const newRanked = ranked.filter((r) => !existingUrls.has(r.url));
      items = [...items, ...newRanked].slice(0, 20);
    }

    // #8: If raw keyword query returned 0, try broad fallback
    if (items.length === 0 && !firstMappedExpansion) {
      console.log(
        "[trends:hn] Raw keyword search returned 0 — trying broad fallback query",
      );
      const broadUrl = new URL(
        "https://hn.algolia.com/api/v1/search_by_date",
      );
      broadUrl.searchParams.set(
        "query",
        "technology business innovation 2026",
      );
      broadUrl.searchParams.set("tags", "story");
      broadUrl.searchParams.set("numericFilters", `points>5`);
      broadUrl.searchParams.set("hitsPerPage", "15");

      const res = await fetch(broadUrl.toString(), {
        headers: { "User-Agent": "ContentGeneratorApp/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          hits: {
            title: string;
            url?: string;
            story_url?: string;
            points: number;
            created_at: string;
          }[];
        };
        items = (data.hits ?? [])
          .filter((h) => h.title && h.title.length > 10)
          .slice(0, 15)
          .map(
            (h): RawTrendItem => ({
              title: h.title,
              url: h.url ?? h.story_url,
              source: "hackernews",
              score: h.points,
              publishedAt: h.created_at,
            }),
          );
      }
    }

    console.log(`[trends:hn] ✓ ${items.length} stories`);
    return items;
  } catch (err) {
    console.warn("[trends:hn] Failed:", (err as Error).message);
    return [];
  }
}

// ── Source 2b: RSS Feeds — business/leadership/tech publications ──────────────
// Completely free, no keys. Fetches from 2-4 curated feeds relevant to
// the user's keywords, then filters items by keyword match.
// Phase 3 #4: Shuffles feeds within same-score tiers for variety.
// Phase 3 #9: Retries with backup feeds when all primary feeds fail.

async function fetchFromRSSFeeds(keywords: string[]): Promise<RawTrendItem[]> {
  const parser = new Parser({
    timeout: 12000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; ContentGeneratorBot/1.0; +https://github.com/contentgenerator)",
      Accept:
        "application/rss+xml, application/xml, text/xml, application/atom+xml, */*",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  // Score feeds by keyword match
  const scoredFeeds = RSS_FEEDS.map((feed) => ({
    ...feed,
    matchScore: feed.topics.filter((t) => isRelevant(t, keywords)).length,
  })).sort((a, b) => b.matchScore - a.matchScore);

  // #4: Shuffle feeds within same-score tiers for variety
  const shuffledFeeds = shuffleWithinScoreTiers(scoredFeeds);
  const selectedFeeds = shuffledFeeds.slice(0, 3);

  console.log(
    `[trends:rss] Fetching from: ${selectedFeeds.map((f) => f.name).join(", ")}`,
  );

  const { items: allItems, rejectedCount } = await fetchFeedsWithParser(
    parser,
    selectedFeeds,
    keywords,
  );

  // #9: If all primary feeds failed, retry with backup feeds
  if (allItems.length === 0 && rejectedCount > 0) {
    console.warn(
      `[trends:rss] All ${rejectedCount} primary feeds failed — trying backup feeds`,
    );
    const backupFeeds = shuffledFeeds.slice(3, 5);
    if (backupFeeds.length > 0) {
      const { items: backupItems } = await fetchFeedsWithParser(
        parser,
        backupFeeds,
        keywords,
      );
      return backupItems;
    }
  }

  return allItems;
}

// Helper to fetch multiple feeds and collect results + failure count
async function fetchFeedsWithParser(
  parser: Parser,
  feeds: { name: string; url: string; topics: string[] }[],
  keywords: string[],
): Promise<{ items: RawTrendItem[]; rejectedCount: number }> {
  const allItems: RawTrendItem[] = [];
  let rejectedCount = 0;

  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        const rawItems = (parsed.items ?? []).slice(0, 20);

        // First pass: keyword-relevant items
        let items = rawItems
          .filter((item) => {
            const text = `${item.title ?? ""} ${item.contentSnippet ?? ""}`;
            return keywords.length === 0 || isRelevant(text, keywords);
          })
          .map(
            (item): RawTrendItem => ({
              title: item.title ?? "",
              url: item.link,
              source: `rss:${feed.name}`,
              publishedAt: item.isoDate ?? item.pubDate,
            }),
          )
          .filter((item) => item.title.length > 0);

        // Fallback: if keyword filter wiped everything out, include the latest
        // 10 items anyway — the AI agent will judge relevance downstream.
        if (items.length === 0 && rawItems.length > 0) {
          console.log(
            `[trends:rss] No keyword match in ${feed.name} — including latest items as fallback`,
          );
          items = rawItems
            .slice(0, 10)
            .map(
              (item): RawTrendItem => ({
                title: item.title ?? "",
                url: item.link,
                source: `rss:${feed.name}`,
                publishedAt: item.isoDate ?? item.pubDate,
              }),
            )
            .filter((item) => item.title.length > 0);
        }

        allItems.push(...items);
        console.log(`[trends:rss] ✓ ${items.length} items from ${feed.name}`);
      } catch (err) {
        console.warn(
          `[trends:rss] ${feed.name} failed:`,
          (err as Error).message,
        );
        throw err; // re-throw so Promise.allSettled marks it as rejected
      }
    }),
  );

  rejectedCount = results.filter((r) => r.status === "rejected").length;
  return { items: allItems, rejectedCount };
}

// #4: Shuffle feeds within same-score tiers so different equally-scored
// feeds get selected across calls. Preserves tier ordering (higher scores first).
function shuffleWithinScoreTiers<T extends { matchScore: number }>(
  feeds: T[],
): T[] {
  const tiers = new Map<number, T[]>();
  for (const feed of feeds) {
    const tier = tiers.get(feed.matchScore) ?? [];
    tier.push(feed);
    tiers.set(feed.matchScore, tier);
  }

  const result: T[] = [];
  // Sort tier keys descending (highest score first)
  const sortedScores = [...tiers.keys()].sort((a, b) => b - a);
  for (const score of sortedScores) {
    result.push(...shuffleArray(tiers.get(score)!));
  }
  return result;
}

// ── Source 2.5: Google News RSS (#11) ─────────────────────────────────────────
// Free, no API key, rarely fails. Used as fallback when HN+RSS yield < 5 items.

async function fetchFromGoogleNewsRSS(
  keywords: string[],
  industry: string,
): Promise<RawTrendItem[]> {
  try {
    const query = encodeURIComponent(
      `${keywords.slice(0, 3).join(" ")} ${industry}`.trim(),
    );
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

    console.log(`[trends:google-news] Fetching: "${keywords.slice(0, 3).join(", ")}" in ${industry}`);

    const parser = new Parser({
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ContentGeneratorBot/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });

    const parsed = await parser.parseURL(url);
    const items: RawTrendItem[] = (parsed.items ?? [])
      .slice(0, 15)
      .map((item) => ({
        title: item.title ?? "",
        url: item.link,
        source: "google-news",
        publishedAt: item.isoDate ?? item.pubDate,
      }))
      .filter((item) => item.title.length > 10);

    console.log(`[trends:google-news] ✓ ${items.length} results`);
    return items;
  } catch (err) {
    console.warn("[trends:google-news] Failed:", (err as Error).message);
    return [];
  }
}

// ── Main export: fetch real trending content ──────────────────────────────────
/**
 * Fetches real trending content from live sources, personalised to the user's
 * industry and content keywords.
 *
 * Phase 3 #1: Removed internal cache — caching is handled by trendCache.ts.
 *
 * @param keywords  e.g. ['AI', 'product management', 'SaaS'] from user persona
 * @param industry  e.g. 'technology', 'healthcare', 'marketing'
 * @param geo       ISO country code, e.g. 'US' (used as hint, not a hard filter)
 * @returns Array of raw trending items ready for agent enrichment
 */
export async function fetchRealTrendingContent(
  keywords: string[],
  industry: string,
  geo = "US",
): Promise<RawTrendItem[]> {
  // #1: No internal cache — trendCache.ts is the single source of truth
  const hasTavily = !!process.env.TAVILY_API_KEY;

  console.log(
    `[trends] Fetching | industry="${industry}" keywords=[${keywords.join(", ")}] geo=${geo} tavily=${hasTavily}`,
  );

  let results: RawTrendItem[];

  if (hasTavily) {
    // Tier 1: Tavily — best quality, targeted, recency-filtered
    const [tavilyItems, hnItems, rssItems] = await Promise.all([
      fetchFromTavily(keywords, industry),
      fetchFromHackerNews(keywords, industry),
      fetchFromRSSFeeds(keywords),
    ]);
    // Tavily first (highest relevance), then HN + RSS for breadth
    results = deduplicateAndRank([...tavilyItems, ...hnItems, ...rssItems]);
  } else {
    // Tier 2: HN + RSS — always-on, no keys required
    const [hnItems, rssItems] = await Promise.all([
      fetchFromHackerNews(keywords, industry),
      fetchFromRSSFeeds(keywords),
    ]);
    results = deduplicateAndRank([...hnItems, ...rssItems]);
  }

  // #11: Tier 2.5 — Google News RSS fallback when combined results are sparse
  if (results.length < 5) {
    console.log(
      `[trends] Only ${results.length} results from primary sources — trying Google News RSS fallback`,
    );
    const googleNewsItems = await fetchFromGoogleNewsRSS(keywords, industry);
    results = deduplicateAndRank([...results, ...googleNewsItems]);
  }

  return results;
}

// ── Kept for backward compatibility with trendResearch.ts ─────────────────────
// These wrappers preserve the existing function signatures used by the agent.

/**
 * @deprecated Use fetchRealTrendingContent instead.
 * Kept for compatibility — internally calls the real API sources.
 */
export async function getTrendingTopics(
  keywords: string[],
  geo = "US",
): Promise<string[]> {
  const industry = keywords[0] ?? "business";
  const items = await fetchRealTrendingContent(keywords, industry, geo);
  return items.map((item) => item.title).slice(0, 15);
}

/**
 * @deprecated Use fetchRealTrendingContent instead.
 * Kept for compatibility — returns general trending items without keyword filter.
 */
export async function getDailyTrends(geo = "US"): Promise<string[]> {
  const items = await fetchRealTrendingContent(
    ["technology", "AI", "business", "leadership"],
    "technology",
    geo,
  );
  return items.map((item) => item.title).slice(0, 15);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Deduplicates items by title similarity and caps total count.
 * Items with higher scores are ranked first.
 */
function deduplicateAndRank(items: RawTrendItem[]): RawTrendItem[] {
  const seen = new Set<string>();
  const unique: RawTrendItem[] = [];

  for (const item of items) {
    // Normalise title for dedup check (lowercase, strip punctuation)
    const key = item.title
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .slice(0, 60);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  // Sort: Tavily (scored) first, then HN (by points), then RSS/Google News
  unique.sort((a, b) => {
    const aScore = a.score ?? 0;
    const bScore = b.score ?? 0;
    if (aScore !== bScore) return bScore - aScore;
    // Prefer Tavily > HN > Google News > RSS
    const sourcePriority = (s: string) =>
      s === "tavily" ? 4 : s === "hackernews" ? 3 : s === "google-news" ? 2 : 1;
    return sourcePriority(b.source) - sourcePriority(a.source);
  });

  return unique.slice(0, 30); // max 30 items passed to the agent
}

export function geoToLabel(geo: string): string {
  const map: Record<string, string> = {
    US: "the United States",
    GB: "the United Kingdom",
    IN: "India",
    CA: "Canada",
    AU: "Australia",
    SG: "Singapore",
    AE: "the UAE",
    DE: "Germany",
    FR: "France",
  };
  return map[geo.toUpperCase()] ?? geo;
}

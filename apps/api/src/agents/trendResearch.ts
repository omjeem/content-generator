import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import {
  fetchRealTrendingContent,
  getTrendingTopics,
  getDailyTrends,
  classifyDomain,
} from "../services/trends";
import type { RawTrendItem, DomainCategory } from "../services/trends";
import {
  buildTrendCacheKey,
  getCachedTrends,
  setCachedTrends,
} from "../services/trendCache";
import { getModel } from "../llm/provider";
import { parseLLMJson } from "../llm/structured";
import { scoreAndRankTrends, selectBalancedTrends } from "../utils/scoring";
import type { ScoredTrendItem } from "../utils/scoring";

// ── Output schema ─────────────────────────────────────────────────────────────

export const TrendResultSchema = z.object({
  trends: z
    .array(
      z.object({
        topic: z
          .string()
          .describe("The trending topic (can reference a real article/story)"),
        relevanceReason: z
          .string()
          .describe("Why this is relevant to the user's niche and audience"),
        contentAngle: z
          .string()
          .describe("A specific LinkedIn content angle the user could take"),
        source: z
          .string()
          .optional()
          .describe("Source name e.g. TechCrunch, Hacker News"),
      }),
    )
    .min(1)
    .max(15),
  rawTrends: z.array(z.string()),
});

export type TrendResult = z.infer<typeof TrendResultSchema>;

// ── Agent — relevance filtering + content angle enrichment ────────────────────
// This agent receives REAL article titles from live APIs (HN, RSS, Tavily).
// Its job is NOT to generate trends — only to filter and enrich real ones.

export const trendResearchAgent = new Agent({
  id: "trend-research",
  name: "trend-research",
  model: getModel(),
  instructions: `You are a trend research specialist for LinkedIn content creators across ALL industries.

You receive REAL article titles and stories fetched from live sources (industry-specific
RSS feeds, web news, and occasionally Hacker News for tech niches).

Your job is to:
1. Filter these real stories for relevance to this specific creator's industry and audience
2. Add a concise relevance reason explaining WHY this topic matters to their followers
3. Add a concrete, specific LinkedIn content angle they could take on this topic

Important rules:
- Base your output ONLY on the provided real stories — do NOT invent new topics
- Prefer stories that are recent or from quality sources in the creator's industry
- Select 4-8 of the most relevant stories — quality over quantity
- Content angles must be specific and actionable (not generic like "write about this")
- Use language appropriate to the creator's domain — avoid tech jargon for non-tech industries
- Include the source name when you know it (e.g. "Well+Good", "HR Dive", "Food Dive")

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "trends": [
    {
      "topic": "Exact or near-exact title from the provided stories",
      "relevanceReason": "Why this matters to their specific audience",
      "contentAngle": "Specific angle: e.g. 'Share how you navigated X — frame it as 3 lessons learned'",
      "source": "Publication Name"
    }
  ],
  "rawTrends": ["title 1", "title 2", ...]
}

rawTrends should list ALL the input titles (up to 30).`,
});

// ── Usage tuple type ──────────────────────────────────────────────────────────

export interface TrendResearchResult {
  result: TrendResult;
  usage: { inputTokens: number; outputTokens: number };
  /** Whether trends were from live APIs (true) or the evergreen fallback (false) */
  isLive: boolean;
}

// ── Helper: Fisher-Yates shuffle (#5) ─────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

// ── Domain-aware angle templates ──────────────────────────────────────────────
// Tech-adjacent domains use "practitioners / teams / engineering" language.
// Non-tech domains use human, accessible, profession-neutral language.

/**
 * Returns the appropriate set of content angle template functions
 * based on whether the domain is tech-adjacent or not.
 */
function getAngleTemplates(
  domain: DomainCategory,
): ((title: string, keyword: string) => string)[] {
  const isTechAdjacent =
    domain === "tech" || domain === "business" || domain === "finance";

  if (isTechAdjacent) {
    return [
      (title, keyword) =>
        `Share your take on "${title.slice(0, 60)}" — what it means for ${keyword} practitioners`,
      (title, keyword) =>
        `Break down the key insights from "${title.slice(0, 50)}" and how ${keyword} professionals should respond`,
      (title, keyword) =>
        `Use "${title.slice(0, 50)}" as a jumping-off point to share your ${keyword} experience`,
      (title, keyword) =>
        `Create a "hot take" post on "${title.slice(0, 50)}" from your ${keyword} perspective`,
    ];
  }

  // Non-tech domains: human, accessible language without "teams / practitioners" jargon
  return [
    (title, keyword) =>
      `Share your perspective on "${title.slice(0, 60)}" — what this means for people in ${keyword}`,
    (title, keyword) =>
      `Break down "${title.slice(0, 50)}" and what every ${keyword} professional needs to know`,
    (title, keyword) =>
      `Use "${title.slice(0, 50)}" to start an honest conversation about your ${keyword} journey`,
    (title, keyword) =>
      `Turn "${title.slice(0, 50)}" into a practical post — share 3 real lessons from your ${keyword} work`,
  ];
}

// ── Helper: run trend research for a user ────────────────────────────────────
// Phase 3 #6: Accepts optional recentTrends to penalize previously shown trends.

export async function researchTrendsForUser(input: {
  industry: string;
  topics: string[];
  contentPillars?: string[]; // used for balanced trend selection
  geo?: string;
  tone?: string; // e.g. "Professional", "Conversational", "Inspirational"
  /** Phase 3 #6: Titles from recently used trends (last 7 days) for stale penalty */
  recentTrends?: string[];
}): Promise<TrendResearchResult> {
  const geo = input.geo ?? "US";
  const keywords = [input.industry, ...input.topics]
    .filter(Boolean)
    .slice(0, 6);
  const contentPillars = input.contentPillars ?? input.topics.slice(0, 3);

  // Classify domain once — used for RSS feed selection, HN decision, angle templates
  const domain = classifyDomain(input.industry, input.topics);
  console.log(
    `[trendResearch] domain="${domain}" | industry="${input.industry}" | tone="${input.tone ?? "not set"}"`,
  );

  // #6: Build a Set of recent trend titles for stale penalty scoring
  const recentTrendsSet = input.recentTrends
    ? new Set(input.recentTrends)
    : undefined;

  // ── Step 1: Fetch REAL trending content from live APIs (with 30-min cache) ─
  const cacheKey = buildTrendCacheKey(keywords, input.industry, geo);
  let rawItems: RawTrendItem[] = [];

  // Track source breakdown for structured logging (#12)
  let cacheHit = false;
  let fetchError: string | undefined;

  // Check cache first — avoids duplicate API calls within a 30-min window (#13)
  const cachedItems = await getCachedTrends(cacheKey);
  if (cachedItems) {
    console.log(
      `[trendResearch] Cache HIT for key=${cacheKey} (${cachedItems.length} items)`,
    );
    rawItems = cachedItems;
    cacheHit = true;
  } else {
    console.log(
      `[trendResearch] Cache MISS — fetching from APIs | keywords=[${keywords.join(", ")}] geo=${geo} domain=${domain}`,
    );
    const fetchStart = Date.now();
    try {
      // Pass resolved domain so each fetcher uses the right pool
      rawItems = await fetchRealTrendingContent(
        keywords,
        input.industry,
        geo,
        domain,
      );
      const fetchDuration = Date.now() - fetchStart;
      const sources = [...new Set(rawItems.map((i) => i.source))];

      // #12: Structured logging with source breakdown
      console.log(
        JSON.stringify({
          event: "trend_fetch",
          keywords: keywords.slice(0, 4),
          industry: input.industry,
          domain,
          geo,
          sources: {
            total: rawItems.length,
            breakdown: sources.reduce(
              (acc, s) => {
                const key =
                  s === "hackernews"
                    ? "hn"
                    : s === "tavily"
                      ? "tavily"
                      : s === "google-news"
                        ? "googleNews"
                        : "rss";
                acc[key] = (acc[key] ?? 0) + rawItems.filter((i) => i.source === s).length;
                return acc;
              },
              {} as Record<string, number>,
            ),
          },
          cacheHit: false,
          durationMs: fetchDuration,
        }),
      );

      // Cache successful results
      if (rawItems.length > 0) {
        await setCachedTrends(cacheKey, rawItems);
      }
    } catch (err) {
      fetchError = (err as Error).message;
      console.warn(
        "[trendResearch] fetchRealTrendingContent failed:",
        fetchError,
      );
    }
  }

  // ── Fallback if all APIs fail ─────────────────────────────────────────────
  if (rawItems.length === 0) {
    // #12: Structured zero-result logging
    console.warn(
      JSON.stringify({
        event: "trend_fetch_zero",
        keywords: keywords.slice(0, 4),
        industry: input.industry,
        domain,
        geo,
        cacheHit,
        error: fetchError ?? "all sources returned 0 items",
      }),
    );
    console.warn("[trendResearch] All APIs failed — using evergreen fallback");
    return {
      result: buildFallbackResult(input.industry, input.topics),
      usage: { inputTokens: 0, outputTokens: 0 },
      isLive: false,
    };
  }

  // ── Step 2: Score + balanced-select items before sending to LLM (#15) ─────
  // #6: Pass recentTrends to scoring for stale penalty
  const personaSignals = {
    topics: input.topics,
    contentPillars,
    industry: input.industry,
  };
  const scoredItems = scoreAndRankTrends(rawItems, personaSignals, recentTrendsSet);
  const balancedItems = selectBalancedTrends(scoredItems, contentPillars, 20);

  const topScore = balancedItems[0]?.relevanceScore ?? 0;

  console.log(
    `[trendResearch] Scoring: ${rawItems.length} → ${balancedItems.length} items after scoring+balance`,
    `| top score: ${topScore}`,
  );

  // ── Step 3a: Heuristic-only fast path (#32) ────────────────────────────────
  const HEURISTIC_THRESHOLD = 3;
  const HEURISTIC_MIN_ITEMS = 4;

  const highRelevanceItems = balancedItems.filter(
    (item) => item.relevanceScore >= HEURISTIC_THRESHOLD,
  );
  const canUseHeuristic = highRelevanceItems.length >= HEURISTIC_MIN_ITEMS;

  if (canUseHeuristic) {
    console.log(
      `[trendResearch] Heuristic fast path: ${highRelevanceItems.length} high-relevance items — skipping LLM`,
    );
    // #5: Shuffle before slicing to prevent deterministic results
    const shuffled = shuffleArray(highRelevanceItems);
    const heuristicResult = buildHeuristicResult(
      shuffled.slice(0, 8),
      input.industry,
      input.topics,
      rawItems,
      domain,
    );
    return {
      result: heuristicResult,
      usage: { inputTokens: 0, outputTokens: 0 },
      isLive: true,
    };
  }

  // ── Step 3b: Format items for the LLM agent ───────────────────────────────
  const formattedList = balancedItems
    .map((item, i) => {
      const sourcePart = item.source.startsWith("rss:")
        ? item.source.replace("rss:", "")
        : item.source === "hackernews"
          ? `Hacker News${item.score ? ` (${item.score} pts)` : ""}`
          : item.source === "tavily"
            ? "Web (Tavily)"
            : item.source === "google-news"
              ? "Google News"
              : item.source;
      const scoreHint =
        item.relevanceScore > 0 ? ` [relevance:${item.relevanceScore}]` : "";
      return `${i + 1}. [${sourcePart}]${scoreHint} ${item.title}`;
    })
    .join("\n");

  const allRawTitles = rawItems.map((item) => item.title);

  // ── Step 4: Agent adds content angles to pre-scored items ─────────────────
  // Include domain + tone context so the LLM uses domain-appropriate language
  const toneNote = input.tone
    ? `Creator's communication tone: ${input.tone}.`
    : "";
  const domainNote = `Creator's domain category: ${domain}.`;

  const prompt = `Enrich these pre-scored trending stories for a LinkedIn creator in the **${input.industry}** industry.
Content pillars: ${contentPillars.slice(0, 5).join(", ")}.
Target geo: ${geo}.
${domainNote} ${toneNote}

Stories (pre-sorted by persona relevance — higher [relevance:N] = better fit):
${formattedList}

Select the 4-8 most relevant stories. Add relevance reason and content angle for each.
Use language appropriate to the creator's domain — avoid tech jargon for non-tech industries.
Return ONLY the JSON object.`;

  try {
    const agentResult = await trendResearchAgent.generate(prompt);
    const text = agentResult.text ?? "";
    console.log(`[trendResearch] Agent responded (${text.length} chars)`);

    const usage = {
      inputTokens: agentResult.usage?.inputTokens ?? 0,
      outputTokens: agentResult.usage?.outputTokens ?? 0,
    };

    // parseLLMJson extracts + validates and self-repairs malformed JSON. If it
    // still can't produce a valid TrendResult, fall back to evergreen topics.
    let parsed: TrendResult;
    try {
      parsed = await parseLLMJson(text, TrendResultSchema, "trend research agent");
    } catch (parseErr) {
      console.warn(
        "[trendResearch] Could not parse/repair agent response — using fallback with raw titles:",
        (parseErr as Error).message,
      );
      return {
        result: buildFallbackResult(input.industry, input.topics, allRawTitles),
        usage,
        isLive: false,
      };
    }

    console.log(
      `[trendResearch] ✓ ${parsed.trends.length} curated trends from real data`,
    );
    return { result: parsed, usage, isLive: true };
  } catch (err) {
    console.error("[trendResearch] Agent error:", (err as Error).message);
    return {
      result: buildFallbackResult(input.industry, input.topics, allRawTitles),
      usage: { inputTokens: 0, outputTokens: 0 },
      isLive: false,
    };
  }
}

// ── Heuristic result builder (#32) ───────────────────────────────────────────
// Constructs a TrendResult from high-confidence scored items without LLM.
// Phase 3 #5: Content angle templates vary by item index + day-of-week.
// Domain-aware: picks tech or general language templates based on domain.

function buildHeuristicResult(
  items: ScoredTrendItem[],
  industry: string,
  topics: string[],
  allItems: RawTrendItem[],
  domain: DomainCategory = "general",
): TrendResult {
  const dayOfWeek = new Date().getDay();
  const angleTemplates = getAngleTemplates(domain);

  const trends = items.map((item, index) => {
    const matchedKeyword = item.matchedKeywords[0] ?? topics[0] ?? industry;
    const sourceName = item.source.startsWith("rss:")
      ? item.source.replace("rss:", "")
      : item.source === "hackernews"
        ? "Hacker News"
        : item.source === "tavily"
          ? "Web"
          : item.source === "google-news"
            ? "Google News"
            : item.source;

    // #5 + domain-aware: Vary content angle template by index + day-of-week
    const templateIndex = (index + dayOfWeek) % angleTemplates.length;
    const template = angleTemplates[templateIndex]!;

    return {
      topic: item.title,
      relevanceReason: `Directly relevant to ${matchedKeyword} in the ${industry} space`,
      contentAngle: template(item.title, matchedKeyword),
      source: sourceName,
    };
  });

  return {
    trends,
    rawTrends: allItems.map((i) => i.title),
  };
}

// ── Fallback: always return something ────────────────────────────────────────

// Evergreen angle templates — rotated by topic index + day to avoid repetition
const EVERGREEN_ANGLES: ((topic: string, industry: string) => { topic: string; angle: string })[] = [
  (topic, industry) => ({
    topic: `Common ${topic} mistakes in ${industry}`,
    angle: `The top 3 mistakes practitioners make — and what to do instead`,
  }),
  (topic, _industry) => ({
    topic: `${topic}: what changed this year`,
    angle: `How ${topic} has evolved — a practitioner's honest take`,
  }),
  (topic, _industry) => ({
    topic: `${topic} for beginners vs experts`,
    angle: `What beginners get wrong about ${topic} that experts take for granted`,
  }),
  (topic, industry) => ({
    topic: `The future of ${topic} in ${industry}`,
    angle: `3 shifts that will reshape how we think about ${topic}`,
  }),
  (topic, _industry) => ({
    topic: `Unpopular opinion: ${topic}`,
    angle: `A contrarian take on ${topic} that most people won't agree with`,
  }),
];

function buildFallbackResult(
  industry: string,
  topics: string[],
  rawTrends: string[] = [],
): TrendResult {
  const pillars = topics.length ? topics : [industry];
  const dayOfWeek = new Date().getDay();

  return {
    trends: pillars.slice(0, 5).map((pillar, i) => {
      const templateIdx = (i + dayOfWeek) % EVERGREEN_ANGLES.length;
      const generated = EVERGREEN_ANGLES[templateIdx]!(pillar, industry);
      return {
        topic: generated.topic,
        relevanceReason: `Core to your ${industry} audience`,
        contentAngle: generated.angle,
        source: "evergreen",
      };
    }),
    rawTrends: rawTrends.length ? rawTrends : pillars.map((t) => `${t} trends`),
  };
}

// Re-export for routes/trends.ts which calls these directly
export { getTrendingTopics, getDailyTrends };

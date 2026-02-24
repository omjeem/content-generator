import { Agent } from '@mastra/core/agent'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { fetchRealTrendingContent, getTrendingTopics, getDailyTrends } from '../services/trends'
import type { RawTrendItem } from '../services/trends'
import { extractJSON } from '../utils/extractJSON'
import { scoreAndRankTrends, selectBalancedTrends } from '../utils/scoring'
import type { ScoredTrendItem } from '../utils/scoring'

// ── Output schema ─────────────────────────────────────────────────────────────

export const TrendResultSchema = z.object({
  trends: z.array(z.object({
    topic: z.string().describe('The trending topic (can reference a real article/story)'),
    relevanceReason: z.string().describe('Why this is relevant to the user\'s niche and audience'),
    contentAngle: z.string().describe('A specific LinkedIn content angle the user could take'),
    source: z.string().optional().describe('Source name e.g. TechCrunch, Hacker News'),
  })).min(1).max(10),
  rawTrends: z.array(z.string()),
})

export type TrendResult = z.infer<typeof TrendResultSchema>

// ── Agent — relevance filtering + content angle enrichment ────────────────────
// This agent receives REAL article titles from live APIs (HN, RSS, Tavily).
// Its job is NOT to generate trends — only to filter and enrich real ones.

export const trendResearchAgent = new Agent({
  id: 'trend-research',
  name: 'trend-research',
  model: google('gemini-2.5-flash'),
  instructions: `You are a trend research specialist for LinkedIn content creators.

You receive REAL article titles and stories fetched from live sources (Hacker News,
TechCrunch, HBR, VentureBeat, Tavily news search, etc.).

Your job is to:
1. Filter these real stories for relevance to this specific creator's industry and audience
2. Add a concise relevance reason explaining WHY this topic matters to their followers
3. Add a concrete, specific LinkedIn content angle they could take on this topic

Important rules:
- Base your output ONLY on the provided real stories — do NOT invent new topics
- Prefer stories that are recent, have high engagement (high HN points), or are from quality sources
- Select 4-8 of the most relevant stories — quality over quantity
- Content angles must be specific and actionable (not generic like "write about this")
- Include the source name when you know it (e.g. "TechCrunch", "Hacker News")

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "trends": [
    {
      "topic": "Exact or near-exact title from the provided stories",
      "relevanceReason": "Why this matters to their specific audience",
      "contentAngle": "Specific angle: e.g. 'Share how you used X to solve Y — frame it as a 3-step carousel'",
      "source": "TechCrunch"
    }
  ],
  "rawTrends": ["title 1", "title 2", ...]
}

rawTrends should list ALL the input titles (up to 30).`,
})

// ── Usage tuple type ──────────────────────────────────────────────────────────

export interface TrendResearchResult {
  result: TrendResult
  usage: { inputTokens: number; outputTokens: number }
  /** Whether trends were from live APIs (true) or the evergreen fallback (false) */
  isLive: boolean
}

// ── Helper: run trend research for a user ────────────────────────────────────

export async function researchTrendsForUser(input: {
  industry: string
  topics: string[]
  contentPillars?: string[]  // used for balanced trend selection
  geo?: string
}): Promise<TrendResearchResult> {
  const geo = input.geo ?? 'US'
  const keywords = [input.industry, ...input.topics].filter(Boolean).slice(0, 6)
  const contentPillars = input.contentPillars ?? input.topics.slice(0, 3)

  console.log(`[trendResearch] Starting real-API trend fetch | keywords=[${keywords.join(', ')}] geo=${geo}`)

  // ── Step 1: Fetch REAL trending content from live APIs ────────────────────
  // Tier 1: Tavily (if key set) + HN Algolia + RSS feeds in parallel
  // Tier 2: HN Algolia + RSS feeds (no keys required)
  let rawItems: RawTrendItem[] = []

  try {
    rawItems = await fetchRealTrendingContent(keywords, input.industry, geo)
    console.log(
      `[trendResearch] Got ${rawItems.length} real items from APIs`,
      `(sources: ${[...new Set(rawItems.map((i) => i.source))].join(', ')})`
    )
  } catch (err) {
    console.warn('[trendResearch] fetchRealTrendingContent failed:', (err as Error).message)
  }

  // ── Fallback if all APIs fail ─────────────────────────────────────────────
  if (rawItems.length === 0) {
    console.warn('[trendResearch] All APIs failed — using evergreen fallback')
    return { result: buildFallbackResult(input.industry, input.topics), usage: { inputTokens: 0, outputTokens: 0 }, isLive: false }
  }

  // ── Step 2: Score + balanced-select items before sending to LLM (#15) ─────
  // This pre-filters for relevance deterministically (zero LLM cost),
  // so the agent receives a smaller, more relevant input and needs less filtering.
  const personaSignals = {
    topics: input.topics,
    contentPillars,
    industry: input.industry,
  }
  const scoredItems = scoreAndRankTrends(rawItems, personaSignals)
  const balancedItems = selectBalancedTrends(scoredItems, contentPillars, 20)

  const topScore = balancedItems[0]?.relevanceScore ?? 0

  console.log(
    `[trendResearch] Scoring: ${rawItems.length} → ${balancedItems.length} items after scoring+balance`,
    `| top score: ${topScore}`
  )

  // ── Step 3a: Heuristic-only fast path (#32) ────────────────────────────────
  // When items have high relevance scores (top ≥ 3) AND there are enough of them,
  // skip the LLM call entirely — saves ~2,300 tokens and ~1-2s per generation.
  // The content generator receives the pre-scored titles directly as "trends",
  // with deterministically generated angles instead of LLM-crafted ones.
  const HEURISTIC_THRESHOLD = 3   // minimum top-item relevance score to skip LLM
  const HEURISTIC_MIN_ITEMS = 4   // need at least 4 good items to skip LLM

  const highRelevanceItems = balancedItems.filter((item) => item.relevanceScore >= HEURISTIC_THRESHOLD)
  const canUseHeuristic = highRelevanceItems.length >= HEURISTIC_MIN_ITEMS

  if (canUseHeuristic) {
    console.log(`[trendResearch] Heuristic fast path: ${highRelevanceItems.length} high-relevance items — skipping LLM`)
    const heuristicResult = buildHeuristicResult(highRelevanceItems.slice(0, 8), input.industry, input.topics, rawItems)
    return { result: heuristicResult, usage: { inputTokens: 0, outputTokens: 0 }, isLive: true }
  }

  // ── Step 3b: Format items for the LLM agent ───────────────────────────────
  const formattedList = balancedItems
    .map((item, i) => {
      const sourcePart = item.source.startsWith('rss:')
        ? item.source.replace('rss:', '')
        : item.source === 'hackernews'
        ? `Hacker News${item.score ? ` (${item.score} pts)` : ''}`
        : item.source === 'tavily'
        ? 'Web (Tavily)'
        : item.source
      const scoreHint = item.relevanceScore > 0 ? ` [relevance:${item.relevanceScore}]` : ''
      return `${i + 1}. [${sourcePart}]${scoreHint} ${item.title}`
    })
    .join('\n')

  const allRawTitles = rawItems.map((item) => item.title)

  // ── Step 4: Agent adds content angles to pre-scored items ─────────────────
  const prompt = `Enrich these pre-scored trending stories for a LinkedIn creator in the **${input.industry}** industry.
Content pillars: ${contentPillars.slice(0, 5).join(', ')}.
Target geo: ${geo}.

Stories (pre-sorted by persona relevance — higher [relevance:N] = better fit):
${formattedList}

Select the 4-8 most relevant stories. Add relevance reason and content angle for each.
Return ONLY the JSON object.`

  try {
    const agentResult = await trendResearchAgent.generate(prompt)
    const text = agentResult.text ?? ''
    console.log(`[trendResearch] Agent responded (${text.length} chars)`)

    const usage = {
      inputTokens: agentResult.usage?.inputTokens ?? 0,
      outputTokens: agentResult.usage?.outputTokens ?? 0,
    }

    let rawJson: unknown
    try {
      rawJson = extractJSON(text, 'trend research agent')
    } catch {
      console.warn('[trendResearch] No JSON in agent response — using fallback with raw titles')
      return { result: buildFallbackResult(input.industry, input.topics, allRawTitles), usage, isLive: false }
    }

    const parsed = TrendResultSchema.safeParse(rawJson)
    if (!parsed.success) {
      console.warn('[trendResearch] Schema validation failed:', parsed.error.message)
      return { result: buildFallbackResult(input.industry, input.topics, allRawTitles), usage, isLive: false }
    }

    console.log(`[trendResearch] ✓ ${parsed.data.trends.length} curated trends from real data`)
    return { result: parsed.data, usage, isLive: true }
  } catch (err) {
    console.error('[trendResearch] Agent error:', (err as Error).message)
    return { result: buildFallbackResult(input.industry, input.topics, allRawTitles), usage: { inputTokens: 0, outputTokens: 0 }, isLive: false }
  }
}

// ── Heuristic result builder (#32) ───────────────────────────────────────────
// Constructs a TrendResult from high-confidence scored items without LLM.
// Content angles are deterministically generated from matched keywords + industry.

function buildHeuristicResult(
  items: ScoredTrendItem[],
  industry: string,
  topics: string[],
  allItems: RawTrendItem[]
): TrendResult {
  const trends = items.map((item) => {
    const matchedKeyword = item.matchedKeywords[0] ?? topics[0] ?? industry
    const sourceName = item.source.startsWith('rss:')
      ? item.source.replace('rss:', '')
      : item.source === 'hackernews'
      ? 'Hacker News'
      : item.source === 'tavily'
      ? 'Web'
      : item.source

    return {
      topic: item.title,
      relevanceReason: `Directly relevant to ${matchedKeyword} in the ${industry} space`,
      contentAngle: `Share your take on "${item.title.slice(0, 60)}" — what it means for ${matchedKeyword} practitioners`,
      source: sourceName,
    }
  })

  return {
    trends,
    rawTrends: allItems.map((i) => i.title),
  }
}

// ── Fallback: always return something ────────────────────────────────────────

function buildFallbackResult(
  industry: string,
  topics: string[],
  rawTrends: string[] = []
): TrendResult {
  const pillars = topics.length ? topics : [industry]
  return {
    trends: pillars.slice(0, 5).map((topic) => ({
      topic: `${topic} in ${new Date().getFullYear()}`,
      relevanceReason: `Core to your ${industry} audience`,
      contentAngle: `Share your perspective on how ${topic} is evolving — what practitioners need to know now`,
      source: 'evergreen',
    })),
    rawTrends: rawTrends.length ? rawTrends : pillars.map((t) => `${t} trends`),
  }
}

// Re-export for routes/trends.ts which calls these directly
export { getTrendingTopics, getDailyTrends }

import { Agent } from '@mastra/core/agent'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { fetchRealTrendingContent, getTrendingTopics, getDailyTrends } from '../services/trends'
import type { RawTrendItem } from '../services/trends'
import { extractJSON } from '../utils/extractJSON'

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
}

// ── Helper: run trend research for a user ────────────────────────────────────

export async function researchTrendsForUser(input: {
  industry: string
  topics: string[]
  geo?: string
}): Promise<TrendResearchResult> {
  const geo = input.geo ?? 'US'
  const keywords = [input.industry, ...input.topics].filter(Boolean).slice(0, 6)

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
    console.log({rawItems})
  } catch (err) {
    console.warn('[trendResearch] fetchRealTrendingContent failed:', (err as Error).message)
  }

  // ── Fallback if all APIs fail ─────────────────────────────────────────────
  if (rawItems.length === 0) {
    console.warn('[trendResearch] All APIs failed — using evergreen fallback')
    return { result: buildFallbackResult(input.industry, input.topics), usage: { inputTokens: 0, outputTokens: 0 } }
  }

  // ── Step 2: Format items for the agent ───────────────────────────────────
  // Include source + score context so the agent can prioritise quality stories
  const formattedList = rawItems
    .slice(0, 30)
    .map((item, i) => {
      const sourcePart = item.source.startsWith('rss:')
        ? item.source.replace('rss:', '')
        : item.source === 'hackernews'
        ? `Hacker News${item.score ? ` (${item.score} pts)` : ''}`
        : item.source === 'tavily'
        ? 'Web (Tavily)'
        : item.source
      return `${i + 1}. [${sourcePart}] ${item.title}`
    })
    .join('\n')

  const allRawTitles = rawItems.map((item) => item.title)

  // ── Step 3: Agent filters for relevance and adds content angles ───────────
  const prompt = `Filter and enrich these REAL trending stories for a LinkedIn creator in the **${input.industry}** industry.
Their content pillars / keywords: ${input.topics.slice(0, 5).join(', ')}.
Target geo: ${geo}.

Real stories fetched from live sources (Hacker News, TechCrunch, HBR, VentureBeat, etc.):
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
      return { result: buildFallbackResult(input.industry, input.topics, allRawTitles), usage }
    }

    const parsed = TrendResultSchema.safeParse(rawJson)
    if (!parsed.success) {
      console.warn('[trendResearch] Schema validation failed:', parsed.error.message)
      return { result: buildFallbackResult(input.industry, input.topics, allRawTitles), usage }
    }

    console.log(`[trendResearch] ✓ ${parsed.data.trends.length} curated trends from real data`)
    return { result: parsed.data, usage }
  } catch (err) {
    console.error('[trendResearch] Agent error:', (err as Error).message)
    return { result: buildFallbackResult(input.industry, input.topics, allRawTitles), usage: { inputTokens: 0, outputTokens: 0 } }
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

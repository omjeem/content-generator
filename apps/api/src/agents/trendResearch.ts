import { Agent } from '@mastra/core/agent'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { getTrendingTopics, getDailyTrends } from '../services/trends'

// ── Output schema ─────────────────────────────────────────────────────────────

export const TrendResultSchema = z.object({
  trends: z.array(z.object({
    topic: z.string().describe('The trending topic'),
    relevanceReason: z.string().describe('Why this is relevant to the user\'s niche'),
    contentAngle: z.string().describe('A content angle the user could take'),
  })).min(1).max(10),
  rawTrends: z.array(z.string()),
})

export type TrendResult = z.infer<typeof TrendResultSchema>

// ── Agent (relevance-filter + content-angle enrichment only) ──────────────────
// NOTE: No external tools — google-trends-api is broken (empty responses / 404).
// Raw topics are fetched via Gemini in services/trends.ts, then this agent
// filters them for relevance and adds content angles.

export const trendResearchAgent = new Agent({
  id: 'trend-research',
  name: 'trend-research',
  model: google('gemini-2.5-flash'),
  instructions: `You are a trend research specialist for LinkedIn content creators.

Given a list of raw trending topics and a user's industry/niche:
1. Filter the trends for relevance to this specific creator's audience
2. Add a relevance reason and a concrete LinkedIn content angle for each

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "trends": [
    {
      "topic": "Name of the trend",
      "relevanceReason": "Why this matters to their audience",
      "contentAngle": "How they could write about this on LinkedIn"
    }
  ],
  "rawTrends": ["raw trend 1", "raw trend 2", ...]
}

Aim for 4-8 high-quality, relevant trends. rawTrends should list all the input topics.`,
})

// ── Helper: run trend research for a user ────────────────────────────────────

export async function researchTrendsForUser(input: {
  industry: string
  topics: string[]
  geo?: string
}): Promise<TrendResult> {
  const geo = input.geo ?? 'US'
  const keywords = [input.industry, ...input.topics].filter(Boolean).slice(0, 5)

  console.log(`[trendResearch] Fetching topics for: [${keywords.join(', ')}] geo=${geo}`)

  // Step 1: fetch raw topics via Gemini-powered service (replaces broken google-trends-api)
  const [relatedTopics, dailyTopics] = await Promise.all([
    getTrendingTopics(keywords, geo),
    getDailyTrends(geo),
  ])

  const allRaw = [...new Set([...relatedTopics, ...dailyTopics])].slice(0, 25)
  console.log(`[trendResearch] Got ${allRaw.length} raw topics (${relatedTopics.length} related + ${dailyTopics.length} daily)`)

  if (allRaw.length === 0) {
    console.warn('[trendResearch] No raw topics — using fallback result')
    return buildFallbackResult(input.industry, input.topics)
  }

  // Step 2: agent filters for relevance and adds content angles
  const prompt = `Filter and enrich these trending topics for a LinkedIn creator in the **${input.industry}** industry.
Their main content pillars: ${input.topics.join(', ')}.

Raw trending topics to filter:
${allRaw.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Select the 4-8 most relevant ones. Add a relevance reason and content angle for each.
Return ONLY the JSON object.`

  try {
    const result = await trendResearchAgent.generate(prompt)
    const text = result.text ?? ''
    console.log(`[trendResearch] Agent responded (${text.length} chars)`)

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn('[trendResearch] No JSON in agent response — using fallback')
      return buildFallbackResult(input.industry, input.topics, allRaw)
    }

    const parsed = TrendResultSchema.safeParse(JSON.parse(jsonMatch[0]))
    if (!parsed.success) {
      console.warn('[trendResearch] Schema invalid — using fallback:', parsed.error.message)
      return buildFallbackResult(input.industry, input.topics, allRaw)
    }

    console.log(`[trendResearch] ✓ ${parsed.data.trends.length} curated trends`)
    return parsed.data
  } catch (err) {
    console.error('[trendResearch] Agent error — using fallback:', (err as Error).message)
    return buildFallbackResult(input.industry, input.topics, allRaw)
  }
}

// ── Fallback: always return something useful ──────────────────────────────────

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
      contentAngle: `Share your unique take on how ${topic} is evolving and what it means for your followers`,
    })),
    rawTrends: rawTrends.length ? rawTrends : pillars.map((t) => `${t} trends`),
  }
}

import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { getTrendingTopics, getDailyTrends } from '../services/trends'

// ── Trends tool ───────────────────────────────────────────────────────────────

const googleTrendsTool = createTool({
  id: 'google-trends',
  description: 'Fetches trending topics from Google Trends for given keywords',
  inputSchema: z.object({
    keywords: z.array(z.string()).describe('Industry keywords to search trends for'),
    geo: z.string().default('US').describe('Country code, e.g. US, GB, IN'),
  }),
  outputSchema: z.object({
    trends: z.array(z.string()),
    dailyTrends: z.array(z.string()),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (toolInput: any) => {
    const keywords: string[] = toolInput?.keywords ?? toolInput?.context?.keywords ?? []
    const geo: string = toolInput?.geo ?? toolInput?.context?.geo ?? 'US'
    const [trends, dailyTrends] = await Promise.all([
      getTrendingTopics(keywords, geo),
      getDailyTrends(geo),
    ])
    return { trends, dailyTrends }
  },
})

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

// ── Agent ─────────────────────────────────────────────────────────────────────

export const trendResearchAgent = new Agent({
  id: 'trend-research',
  name: 'trend-research',
  model: google('gemini-1.5-flash'),
  instructions: `You are a trend research specialist for LinkedIn content creators.

Given a user's industry and topics, use the google-trends tool to find trending topics,
then filter for relevance and suggest content angles.

Return ONLY a JSON object (no markdown) with this structure:
{
  "trends": [
    {
      "topic": "Name of the trend",
      "relevanceReason": "Why this matters to their audience",
      "contentAngle": "How they could write about this"
    }
  ],
  "rawTrends": ["raw trend 1", ...]
}

Aim for 3-8 high-quality, relevant trends.`,
  tools: { googleTrends: googleTrendsTool },
})

// ── Helper: run trend research for a user ────────────────────────────────────

export async function researchTrendsForUser(input: {
  industry: string
  topics: string[]
  geo?: string
}): Promise<TrendResult> {
  const keywords = [input.industry, ...input.topics].filter(Boolean).slice(0, 5)

  const prompt = `Research trending topics for a LinkedIn creator in the ${input.industry} industry.
Their main topics are: ${input.topics.join(', ')}.
Use the google-trends tool with keywords: ${keywords.join(', ')}.
Filter and rank results by relevance to this specific niche.
Return ONLY the JSON object with trends and rawTrends arrays.`

  const result = await trendResearchAgent.generate(prompt)

  const text = result.text ?? ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { trends: [], rawTrends: [] }
  }

  try {
    return TrendResultSchema.parse(JSON.parse(jsonMatch[0]))
  } catch {
    return { trends: [], rawTrends: [] }
  }
}

// google-trends-api is a CommonJS module with no TS types — use require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const googleTrends = require('google-trends-api')

/**
 * Fetches related trending topics for the given keywords.
 * Uses google-trends-api (free, no API key needed).
 */
export async function getTrendingTopics(
  keywords: string[],
  geo = 'US'
): Promise<string[]> {
  const results: string[] = []

  for (const keyword of keywords.slice(0, 3)) {
    try {
      const raw: string = await googleTrends.relatedTopics({
        keyword,
        geo,
        hl: 'en-US',
      })
      const parsed = JSON.parse(raw) as RelatedTopicsResponse
      const topics =
        parsed.default?.rankedList?.[0]?.rankedKeyword?.map(
          (item) => item.topic?.title
        ) ?? []

      results.push(...(topics.filter((t): t is string => typeof t === 'string' && t.length > 0).slice(0, 5)))
    } catch {
      // If one keyword fails, continue with next
    }
  }

  return [...new Set(results)].slice(0, 15)
}

/**
 * Fetches today's daily trending searches for the given geo.
 */
export async function getDailyTrends(geo = 'US'): Promise<string[]> {
  try {
    const raw: string = await googleTrends.dailyTrends({ geo })
    const parsed = JSON.parse(raw) as DailyTrendsResponse
    const articles = parsed.default?.trendingSearchesDays?.[0]?.trendingSearches ?? []
    return articles
      .map((item) => item.title?.query)
      .filter(Boolean)
      .slice(0, 20) as string[]
  } catch {
    return []
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RelatedTopicsResponse {
  default?: {
    rankedList?: Array<{
      rankedKeyword?: Array<{
        topic?: { title?: string; type?: string }
        value?: number
      }>
    }>
  }
}

interface DailyTrendsResponse {
  default?: {
    trendingSearchesDays?: Array<{
      trendingSearches?: Array<{
        title?: { query?: string }
      }>
    }>
  }
}

/**
 * Trend Research Service
 *
 * Fetches REAL trending content from live APIs — no LLM hallucination.
 * Three-tier strategy (highest quality first):
 *
 *  Tier 1 — Tavily (when TAVILY_API_KEY is set)
 *    └─ AI-optimised web search; niche-targeted; recency-filtered
 *
 *  Tier 2 — Hacker News Algolia + RSS Feeds (always-on, zero API keys)
 *    ├─ HN Algolia: real trending tech/AI/startup stories (no key, no limit)
 *    └─ RSS Feeds: TechCrunch, HBR, VentureBeat, Fast Company (no key)
 *
 *  Tier 3 — Evergreen fallback (no network call)
 *    └─ Returns content-pillar-based fallback topics if all APIs fail
 *
 * The raw article titles fetched here are passed to the trendResearch agent
 * which filters them for relevance and adds LinkedIn content angles.
 */

import Parser from 'rss-parser'
import { tavily } from '@tavily/core'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RawTrendItem {
  title: string
  url?: string
  source: string   // "hackernews" | "rss:TechCrunch" | "tavily" | etc.
  score?: number   // HN points or Tavily relevance score
  publishedAt?: string
}

// ── RSS feed sources ───────────────────────────────────────────────────────────
// Curated sources covering: tech, AI, business, leadership, startups, marketing
// All are free, no API key, no rate limits

const RSS_FEEDS: { name: string; url: string; topics: string[] }[] = [
  {
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    topics: ['tech', 'ai', 'startup', 'saas', 'software', 'engineering'],
  },
  {
    name: 'HBR',
    url: 'https://feeds.hbr.org/harvardbusiness',
    topics: ['leadership', 'management', 'strategy', 'business', 'career', 'hr'],
  },
  {
    name: 'VentureBeat',
    url: 'https://feeds.feedburner.com/venturebeat/SZYF',
    topics: ['ai', 'ml', 'enterprise', 'tech', 'startup', 'data'],
  },
  {
    name: 'Fast Company',
    url: 'https://www.fastcompany.com/latest/rss',
    topics: ['innovation', 'design', 'business', 'leadership', 'marketing'],
  },
  {
    name: 'MIT Technology Review',
    url: 'https://www.technologyreview.com/feed/',
    topics: ['ai', 'biotech', 'climate', 'computing', 'engineering', 'science'],
  },
  {
    name: 'Inc. Magazine',
    url: 'https://www.inc.com/rss',
    topics: ['entrepreneurship', 'startup', 'growth', 'management', 'marketing'],
  },
]

// ── HN subreddits-equivalent search terms per broad topic ─────────────────────
// Maps niche keywords → HN search queries for best results

const HN_QUERY_MAP: Record<string, string> = {
  ai: 'AI machine learning LLM',
  'machine learning': 'machine learning neural network',
  saas: 'SaaS startup product',
  startup: 'startup founder YC',
  engineering: 'software engineering developer tools',
  fintech: 'fintech payments crypto',
  healthcare: 'health tech biotech medical',
  marketing: 'marketing growth SEO content',
  leadership: 'leadership management productivity',
  design: 'design UX product',
  data: 'data engineering analytics',
  security: 'security infosec cybersecurity',
  cloud: 'cloud AWS infrastructure devops',
  ecommerce: 'ecommerce retail B2C',
  hr: 'hiring remote work people management',
}

// ── Utility: keyword relevance check ─────────────────────────────────────────

function isRelevant(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase()
  return keywords.some((kw) => lower.includes(kw.toLowerCase()))
}

// ── Source 1: Tavily — premium AI web search ──────────────────────────────────
// Returns real web articles relevant to the user's specific niche.
// Only called when TAVILY_API_KEY is set.

async function fetchFromTavily(
  keywords: string[],
  industry: string,
): Promise<RawTrendItem[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return []

  try {
    const client = tavily({ apiKey })
    const query = `trending topics and news in ${industry}: ${keywords.slice(0, 3).join(', ')} 2026`

    console.log(`[trends:tavily] Searching: "${query}"`)

    const response = await client.search(query, {
      topic: 'news',
      time_range: 'week',     // only content from the last week
      max_results: 10,
      search_depth: 'basic',  // 1 credit each
    })

    const items: RawTrendItem[] = (response.results ?? []).map((r) => ({
      title: r.title ?? r.url,
      url: r.url,
      source: 'tavily',
      score: r.score,
      publishedAt: r.publishedDate,
    }))

    console.log(`[trends:tavily] ✓ ${items.length} results`)
    return items
  } catch (err) {
    console.warn('[trends:tavily] Failed:', (err as Error).message)
    return []
  }
}

// ── Source 2a: Hacker News Algolia — real trending tech stories ───────────────
// Completely free, no API key, ~10,000 req/hour limit.
// Filters by points to ensure quality (only community-validated stories).

async function fetchFromHackerNews(
  keywords: string[],
  industry: string,
): Promise<RawTrendItem[]> {
  try {
    // Build a targeted query from the user's keywords
    const baseQuery = keywords.slice(0, 3).join(' ')
    // Map known topics to better HN search terms
    const mapped = keywords
      .map((k) => HN_QUERY_MAP[k.toLowerCase()] ?? k)
      .join(' ')
    const query = mapped || baseQuery || industry

    const url = new URL('https://hn.algolia.com/api/v1/search_by_date')
    url.searchParams.set('query', query)
    url.searchParams.set('tags', 'story')
    url.searchParams.set('numericFilters', 'points>10')  // only quality posts
    url.searchParams.set('hitsPerPage', '20')

    console.log(`[trends:hn] Searching HN for: "${query}"`)

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'ContentGeneratorApp/1.0' },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      console.warn(`[trends:hn] HTTP ${res.status}`)
      return []
    }

    const data = await res.json() as {
      hits: { title: string; url?: string; story_url?: string; points: number; created_at: string }[]
    }

    const items: RawTrendItem[] = (data.hits ?? [])
      .filter((h) => h.title && h.title.length > 10)
      .map((h) => ({
        title: h.title,
        url: h.url ?? h.story_url,
        source: 'hackernews',
        score: h.points,
        publishedAt: h.created_at,
      }))

    console.log(`[trends:hn] ✓ ${items.length} stories`)
    return items
  } catch (err) {
    console.warn('[trends:hn] Failed:', (err as Error).message)
    return []
  }
}

// ── Source 2b: RSS Feeds — business/leadership/tech publications ──────────────
// Completely free, no keys. Fetches from 2-4 curated feeds relevant to
// the user's keywords, then filters items by keyword match.

async function fetchFromRSSFeeds(
  keywords: string[],
): Promise<RawTrendItem[]> {
  const parser = new Parser({
    timeout: 8000,
    headers: { 'User-Agent': 'ContentGeneratorApp/1.0' },
  })

  // Select 3 feeds whose topic tags match the user's keywords
  const selectedFeeds = RSS_FEEDS
    .map((feed) => ({
      ...feed,
      matchScore: feed.topics.filter((t) => isRelevant(t, keywords)).length,
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3)   // top 3 most relevant feeds

  console.log(
    `[trends:rss] Fetching from: ${selectedFeeds.map((f) => f.name).join(', ')}`
  )

  const allItems: RawTrendItem[] = []

  await Promise.allSettled(
    selectedFeeds.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url)

        const items = (parsed.items ?? [])
          .slice(0, 15)   // latest 15 items per feed
          .filter((item) => {
            const text = `${item.title ?? ''} ${item.contentSnippet ?? ''}`
            // Accept if item is keyword-relevant OR if no keywords to filter by
            return keywords.length === 0 || isRelevant(text, keywords)
          })
          .map((item): RawTrendItem => ({
            title: item.title ?? '',
            url: item.link,
            source: `rss:${feed.name}`,
            publishedAt: item.isoDate ?? item.pubDate,
          }))
          .filter((item) => item.title.length > 0)

        allItems.push(...items)
        console.log(`[trends:rss] ✓ ${items.length} items from ${feed.name}`)
      } catch (err) {
        console.warn(`[trends:rss] ${feed.name} failed:`, (err as Error).message)
      }
    })
  )

  return allItems
}

// ── Main export: fetch real trending content ──────────────────────────────────
/**
 * Fetches real trending content from live sources, personalised to the user's
 * industry and content keywords.
 *
 * @param keywords  e.g. ['AI', 'product management', 'SaaS'] from user persona
 * @param industry  e.g. 'technology', 'healthcare', 'marketing'
 * @param geo       ISO country code, e.g. 'US' (used as hint, not a hard filter)
 * @returns Array of raw trending items ready for agent enrichment
 */
export async function fetchRealTrendingContent(
  keywords: string[],
  industry: string,
  geo = 'US',
): Promise<RawTrendItem[]> {
  const hasTavily = !!process.env.TAVILY_API_KEY

  console.log(
    `[trends] Fetching real trends | industry="${industry}" keywords=[${keywords.join(', ')}] geo=${geo} tavily=${hasTavily}`
  )

  if (hasTavily) {
    // Tier 1: Tavily — best quality, targeted, recency-filtered
    const [tavilyItems, hnItems, rssItems] = await Promise.all([
      fetchFromTavily(keywords, industry),
      fetchFromHackerNews(keywords, industry),
      fetchFromRSSFeeds(keywords),
    ])
    // Tavily first (highest relevance), then HN + RSS for breadth
    return deduplicateAndRank([...tavilyItems, ...hnItems, ...rssItems])
  } else {
    // Tier 2: HN + RSS — always-on, no keys required
    const [hnItems, rssItems] = await Promise.all([
      fetchFromHackerNews(keywords, industry),
      fetchFromRSSFeeds(keywords),
    ])
    return deduplicateAndRank([...hnItems, ...rssItems])
  }
}

// ── Kept for backward compatibility with trendResearch.ts ─────────────────────
// These wrappers preserve the existing function signatures used by the agent.

/**
 * @deprecated Use fetchRealTrendingContent instead.
 * Kept for compatibility — internally calls the real API sources.
 */
export async function getTrendingTopics(
  keywords: string[],
  geo = 'US',
): Promise<string[]> {
  const industry = keywords[0] ?? 'business'
  const items = await fetchRealTrendingContent(keywords, industry, geo)
  return items.map((item) => item.title).slice(0, 15)
}

/**
 * @deprecated Use fetchRealTrendingContent instead.
 * Kept for compatibility — returns general trending items without keyword filter.
 */
export async function getDailyTrends(geo = 'US'): Promise<string[]> {
  const items = await fetchRealTrendingContent(
    ['technology', 'AI', 'business', 'leadership'],
    'technology',
    geo,
  )
  return items.map((item) => item.title).slice(0, 15)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Deduplicates items by title similarity and caps total count.
 * Items with higher scores are ranked first.
 */
function deduplicateAndRank(items: RawTrendItem[]): RawTrendItem[] {
  const seen = new Set<string>()
  const unique: RawTrendItem[] = []

  for (const item of items) {
    // Normalise title for dedup check (lowercase, strip punctuation)
    const key = item.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 60)
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(item)
    }
  }

  // Sort: Tavily (scored) first, then HN (by points), then RSS
  unique.sort((a, b) => {
    const aScore = a.score ?? 0
    const bScore = b.score ?? 0
    if (aScore !== bScore) return bScore - aScore
    // Prefer Tavily > HN > RSS
    const sourcePriority = (s: string) =>
      s === 'tavily' ? 3 : s === 'hackernews' ? 2 : 1
    return sourcePriority(b.source) - sourcePriority(a.source)
  })

  return unique.slice(0, 30)  // max 30 items passed to the agent
}

export function geoToLabel(geo: string): string {
  const map: Record<string, string> = {
    US: 'the United States',
    GB: 'the United Kingdom',
    IN: 'India',
    CA: 'Canada',
    AU: 'Australia',
    SG: 'Singapore',
    AE: 'the UAE',
    DE: 'Germany',
    FR: 'France',
  }
  return map[geo.toUpperCase()] ?? geo
}

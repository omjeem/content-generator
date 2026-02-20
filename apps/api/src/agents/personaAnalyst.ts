import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { scrapeLinkedInProfile, parseManualPosts, ScrapingBlockedError } from '../services/linkedin'

// ── Output schema ─────────────────────────────────────────────────────────────

export const PersonaSchema = z.object({
  writingStyle: z.string().describe('e.g. conversational, story-driven, data-heavy, listicle'),
  tone: z.string().describe('e.g. professional, inspiring, witty, educational, provocative'),
  topics: z.array(z.string()).describe('recurring subject areas in the posts'),
  postFormats: z.array(z.string()).describe('preferred formats observed'),
  estimatedPostFrequency: z.string().describe('e.g. daily, 3x per week, weekly'),
  engagementPatterns: z.string().describe('what types of posts get more engagement'),
  summary: z.string().describe('2-3 sentence summary of the person\'s LinkedIn presence'),
})

export type PersonaAnalysis = z.infer<typeof PersonaSchema>

// ── Scrape tool ───────────────────────────────────────────────────────────────

const linkedinScrapeTool = createTool({
  id: 'scrape-linkedin',
  description: 'Scrapes a LinkedIn profile URL and returns raw post texts',
  inputSchema: z.object({
    profileUrl: z.string(),
  }),
  outputSchema: z.object({
    posts: z.array(z.string()),
    source: z.enum(['scraped', 'blocked']),
    errorMessage: z.string().optional(),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (toolInput: any) => {
    const profileUrl: string = toolInput?.profileUrl ?? toolInput?.context?.profileUrl ?? ''
    try {
      const posts = await scrapeLinkedInProfile(profileUrl)
      return { posts, source: 'scraped' as const }
    } catch (err) {
      if (err instanceof ScrapingBlockedError) {
        return { posts: [], source: 'blocked' as const, errorMessage: err.message }
      }
      return { posts: [], source: 'blocked' as const, errorMessage: 'Unknown scraping error' }
    }
  },
})

// ── Agent ─────────────────────────────────────────────────────────────────────

export const personaAnalystAgent = new Agent({
  id: 'persona-analyst',
  name: 'persona-analyst',
  model: google('gemini-2.5-flash'),
  instructions: `You are an expert LinkedIn content analyst.

Given a collection of LinkedIn posts from a single author, analyse their content and extract:
1. Writing style (conversational? data-driven? storytelling? listicle?)
2. Tone (professional? inspiring? witty? educational? direct?)
3. Recurring topics and themes
4. Post formats used (text-only? carousels? polls?)
5. Estimated posting frequency
6. Engagement patterns

Be specific — avoid generic descriptions. Capture what makes this person's content UNIQUE.

Respond with valid JSON matching this exact structure:
{
  "writingStyle": "string",
  "tone": "string",
  "topics": ["string"],
  "postFormats": ["string"],
  "estimatedPostFrequency": "string",
  "engagementPatterns": "string",
  "summary": "string"
}`,
  tools: { scrapeLinkedIn: linkedinScrapeTool },
})

// ── Helper: run agent and get structured persona ──────────────────────────────

export async function analyzePersona(posts: string[]): Promise<PersonaAnalysis> {
  const postsText = posts
    .map((p, i) => `--- POST ${i + 1} ---\n${p}`)
    .join('\n\n')

  const prompt = `Analyze the following LinkedIn posts and return ONLY a JSON object with this exact structure (no markdown, no extra text):
{
  "writingStyle": "...",
  "tone": "...",
  "topics": ["..."],
  "postFormats": ["..."],
  "estimatedPostFrequency": "...",
  "engagementPatterns": "...",
  "summary": "..."
}

POSTS TO ANALYZE:
${postsText}`

  const result = await personaAnalystAgent.generate(prompt)

  // Parse JSON from the model's text response
  const text = result.text ?? ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Persona analysis did not return valid JSON')
  }
  return PersonaSchema.parse(JSON.parse(jsonMatch[0]))
}

// ── Helper: resolve posts from URL or manual paste ────────────────────────────

export async function resolvePostsFromInput(input: {
  linkedinUrl?: string
  manualPosts?: string
}): Promise<{ posts: string[]; scrapingBlocked: boolean; errorMessage?: string }> {
  if (input.linkedinUrl) {
    try {
      const posts = await scrapeLinkedInProfile(input.linkedinUrl)
      return { posts, scrapingBlocked: false }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scraping failed'
      return { posts: [], scrapingBlocked: true, errorMessage: msg }
    }
  }

  if (input.manualPosts) {
    const posts = parseManualPosts(input.manualPosts)
    return { posts, scrapingBlocked: false }
  }

  return { posts: [], scrapingBlocked: false }
}

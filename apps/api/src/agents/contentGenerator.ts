import { Agent } from '@mastra/core/agent'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import type { IUserPersonaDocument } from '../models/UserPersona'
import type { TrendResult } from './trendResearch'

// ── Output schema ─────────────────────────────────────────────────────────────

export const SuggestionSchema = z.object({
  topic: z.string().describe('What the post is about'),
  angle: z.string().describe('The unique perspective or spin on the topic'),
  format: z.enum(['carousel', 'text-post', 'poll', 'video-script', 'list'])
    .describe('Recommended LinkedIn post format'),
  hook: z.string().max(150).describe('Opening line — scroll-stopping, under 15 words'),
  whyItFits: z.string().describe('Why this idea matches the user\'s voice and audience'),
})

export const ContentIdeasSchema = z.object({
  ideas: z.array(SuggestionSchema).min(5).max(10),
})

export type ContentIdeas = z.infer<typeof ContentIdeasSchema>

// ── Agent ─────────────────────────────────────────────────────────────────────

export const contentGeneratorAgent = new Agent({
  id: 'content-generator',
  name: 'content-generator',
  model: google('gemini-1.5-pro'), // Pro for highest quality ideas
  instructions: `You are an expert LinkedIn ghostwriter and content strategist.

You will receive a user persona and trending topics.
Generate 5-10 LinkedIn post ideas that feel AUTHENTIC to this specific person's voice.

Each idea must include:
- topic: what the post is about
- angle: the unique perspective
- format: carousel | text-post | poll | video-script | list
- hook: opening line, scroll-stopping, under 15 words, sounds like THEM
- whyItFits: why this matches their voice and audience

Return ONLY a valid JSON object (no markdown, no extra text):
{
  "ideas": [
    {
      "topic": "...",
      "angle": "...",
      "format": "carousel",
      "hook": "...",
      "whyItFits": "..."
    }
  ]
}`,
})

// ── Helper: generate content ideas ───────────────────────────────────────────

export async function generateContentIdeas(input: {
  persona: IUserPersonaDocument
  trends: TrendResult
}): Promise<ContentIdeas> {
  const { persona, trends } = input

  const trendsList = trends.trends.length
    ? trends.trends
        .map((t) => `- ${t.topic}: ${t.relevanceReason} | Angle: ${t.contentAngle}`)
        .join('\n')
    : 'No trending topics available — use evergreen topics for this niche'

  const prompt = `Generate 5-10 authentic LinkedIn post ideas for this creator.

## USER PERSONA
Writing Style: ${persona.writingStyle ?? 'Not analysed'}
Tone: ${persona.tone ?? 'Professional'}
Topics: ${persona.topics.join(', ') || 'General business'}
Post Formats Preferred: ${persona.postFormats.join(', ') || 'text-post, carousel'}

## GOALS & STRATEGY
Professional Goals: ${persona.goals ?? 'Build thought leadership'}
Target Audience: ${persona.targetAudience ?? 'Business professionals'}
Industry: ${persona.industry ?? 'Business'}
Content Pillars: ${persona.contentPillars.join(', ') || 'Leadership, Growth, Innovation'}
Posting Frequency: ${persona.postingFrequency ?? 'Weekly'}

## CURRENT TRENDS IN THEIR NICHE
${trendsList}

Return ONLY the JSON object with the ideas array.`

  const result = await contentGeneratorAgent.generate(prompt)

  const text = result.text ?? ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Content generator did not return valid JSON')
  }

  return ContentIdeasSchema.parse(JSON.parse(jsonMatch[0]))
}

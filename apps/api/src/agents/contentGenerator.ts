import { Agent } from '@mastra/core/agent'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import type { IUserPersonaDocument } from '../models/UserPersona'
import type { TrendResult } from './trendResearch'
import type { IGenerateContextOptions } from '@repo/shared-types'

// ── Output schema ─────────────────────────────────────────────────────────────

export const SuggestionSchema = z.object({
  topic: z.string().describe('What the post is about'),
  angle: z.string().describe('The unique perspective or spin on the topic'),
  format: z.enum(['carousel', 'text-post', 'poll', 'video-script', 'list'])
    .describe('Recommended LinkedIn post format'),
  hook: z.string().max(200).describe('Opening line — scroll-stopping, under 15 words'),
  whyItFits: z.string().describe('Why this idea matches the user\'s voice and audience'),
  // Rich content brief fields
  seoKeywords: z.array(z.string()).min(3).max(5)
    .describe('3-5 LinkedIn hashtags / SEO keywords for this post'),
  clickbaitHooks: z.array(z.string()).min(2).max(3)
    .describe('2-3 bolder, punchier alternative hook variants'),
  postPointers: z.array(z.string()).min(4).max(6)
    .describe('4-6 bullet points outlining exactly what to write in the post body'),
  callToAction: z.string()
    .describe('A single suggested CTA to close the post (e.g. "What do you think? Drop a comment.")'),
})

export const ContentIdeasSchema = z.object({
  ideas: z.array(SuggestionSchema).min(5).max(10),
})

export type ContentIdeas = z.infer<typeof ContentIdeasSchema>

// ── Agent ─────────────────────────────────────────────────────────────────────

export const contentGeneratorAgent = new Agent({
  id: 'content-generator',
  name: 'content-generator',
  model: google('gemini-2.5-flash'),
  instructions: `You are an expert LinkedIn ghostwriter and content strategist.

You will receive a user persona and trending topics. Your job is to generate
5-10 LinkedIn post ideas that feel AUTHENTIC to this specific person's voice
AND provide a full content brief so they can immediately write the post.

Each idea MUST include ALL of these fields:
- topic: what the post is about (concise noun phrase)
- angle: the unique perspective or spin
- format: exactly one of: carousel | text-post | poll | video-script | list
- hook: opening line, scroll-stopping, under 15 words, sounds like THEM
- whyItFits: why this matches their voice, audience and goals
- seoKeywords: array of 3-5 LinkedIn hashtags / SEO keywords (e.g. ["#AILeadership", "#FutureOfWork"])
- clickbaitHooks: array of 2-3 bolder hook alternatives (punchier variants of the main hook)
- postPointers: array of 4-6 bullet points outlining the exact content to write in the post body
- callToAction: one suggested CTA sentence to close the post

Return ONLY a valid JSON object (no markdown, no extra text):
{
  "ideas": [
    {
      "topic": "AI adoption in mid-size companies",
      "angle": "The hidden cost no one talks about",
      "format": "carousel",
      "hook": "Your team adopted AI. Your culture didn't. Here's the gap.",
      "whyItFits": "Matches their thought-leadership goal and tech-savvy audience",
      "seoKeywords": ["#AIAdoption", "#ChangeManagement", "#FutureOfWork", "#Leadership"],
      "clickbaitHooks": [
        "Most AI rollouts fail by month 3. Here's why.",
        "You bought the tools. You forgot the humans. A lesson learned the hard way."
      ],
      "postPointers": [
        "Open with a surprising stat about AI implementation failure rates",
        "Describe the cultural resistance pattern you or your clients have seen",
        "Explain the 3 root causes: speed mismatch, skill gap, trust deficit",
        "Share one specific intervention that worked",
        "Close with a reframe: AI success is an org-design problem, not a tech problem"
      ],
      "callToAction": "What's been the biggest blocker in your team's AI adoption? Share below."
    }
  ]
}`,
})

// ── Helper: generate content ideas ───────────────────────────────────────────

export async function generateContentIdeas(input: {
  persona: IUserPersonaDocument
  trends: TrendResult
  context?: IGenerateContextOptions
}): Promise<ContentIdeas> {
  const { persona, trends, context } = input

  const trendsList = trends.trends.length
    ? trends.trends
        .map((t) => `- ${t.topic}: ${t.relevanceReason} | Angle: ${t.contentAngle}`)
        .join('\n')
    : 'No trending topics available — use evergreen topics for this niche'

  // Build context override section
  const contextSection = buildContextSection(context)

  const prompt = `Generate 5-10 authentic LinkedIn post ideas for this creator.
Each idea MUST include all fields: topic, angle, format, hook, whyItFits, seoKeywords (3-5), clickbaitHooks (2-3), postPointers (4-6), callToAction.

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
Platform Goal: ${persona.platformGoal ?? 'thought-leadership'}

## CURRENT TRENDS IN THEIR NICHE
${trendsList}
${contextSection}
Return ONLY the JSON object with the ideas array.`

  const result = await contentGeneratorAgent.generate(prompt)

  const text = result.text ?? ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Content generator did not return valid JSON')
  }

  return ContentIdeasSchema.parse(JSON.parse(jsonMatch[0]))
}

// ── Build optional context override section ───────────────────────────────────

function buildContextSection(context?: IGenerateContextOptions): string {
  if (!context) return ''

  const lines: string[] = ['\n## GENERATION CONTEXT OVERRIDE']

  switch (context.mode) {
    case 'topic-focus':
      if (context.topicFocus) {
        lines.push(`Focus Mode: Generate ALL ideas around this specific topic/niche: "${context.topicFocus}"`)
        lines.push('Prioritise this topic over the general content pillars above.')
      }
      break

    case 'chat-refined':
      if (context.chatRefinementContext) {
        lines.push('This generation was refined through a pre-gen chat. Use this summary as primary context:')
        lines.push(context.chatRefinementContext)
      }
      break

    case 'profile':
    default:
      lines.push('Mode: Standard profile-based generation. Use all persona data above.')
      break
  }

  if (context.targetAudienceOverride) {
    lines.push(`Target Audience Override: ${context.targetAudienceOverride}`)
  }

  if (context.platformGoal) {
    lines.push(`Platform Goal Override: ${context.platformGoal}`)
    lines.push(getPlatformGoalGuidance(context.platformGoal))
  }

  if (context.contentMix) {
    lines.push(`Content Mix Preference: ${getContentMixGuidance(context.contentMix)}`)
  }

  return lines.join('\n')
}

function getPlatformGoalGuidance(goal: string): string {
  const guidance: Record<string, string> = {
    'thought-leadership': 'Favour opinion pieces, contrarian takes, and insight-driven content.',
    'lead-generation': 'Favour value-demonstration posts that showcase expertise and attract prospects.',
    'personal-brand': 'Favour personal stories, behind-the-scenes, and vulnerability-driven posts.',
    'hiring': 'Favour culture-showcasing posts, team stories, and employer-brand content.',
    'community-building': 'Favour question-based posts, polls, and community discussion starters.',
  }
  return guidance[goal] ?? ''
}

function getContentMixGuidance(mix: string): string {
  const guidance: Record<string, string> = {
    'more-carousels': 'Skew format choices heavily towards carousel (at least 60% of ideas).',
    'more-text-posts': 'Skew format choices heavily towards text-post (at least 60% of ideas).',
    'more-polls': 'Include more poll format posts (at least 3 polls in the ideas).',
    'balanced': 'Mix formats evenly across carousel, text-post, list, and poll.',
  }
  return guidance[mix] ?? ''
}

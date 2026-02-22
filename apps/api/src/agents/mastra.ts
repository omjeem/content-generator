import { Mastra } from '@mastra/core'
import mongoose from 'mongoose'
import { personaAnalystAgent, analyzePersona, resolvePostsFromInput } from './personaAnalyst'
import { onboardingAgent } from './onboarding'
import { trendResearchAgent, researchTrendsForUser } from './trendResearch'
import { contentGeneratorAgent, generateContentIdeas } from './contentGenerator'
import { personaChatAgent } from './personaChat'
import { UserPersona } from '../models/UserPersona'
import { ContentSuggestion } from '../models/ContentSuggestion'
import { checkTokenQuota, trackTokenUsage } from '../services/tokenUsage'
import type { ISuggestion, IGenerateContextOptions } from '@repo/shared-types'

// ── Mastra instance ───────────────────────────────────────────────────────────

export const mastra = new Mastra({
  agents: {
    personaAnalyst: personaAnalystAgent,
    onboarding: onboardingAgent,
    trendResearch: trendResearchAgent,
    contentGenerator: contentGeneratorAgent,
    personaChat: personaChatAgent,
  },
})

// ── Pipeline input / output types ─────────────────────────────────────────────

export interface PipelineInput {
  userId: string
  linkedinUrl?: string
  manualPosts?: string
  forceReanalyze?: boolean
  context?: IGenerateContextOptions  // optional flexible generation context
}

export type PipelineStatus =
  | 'success'
  | 'interview_required'
  | 'persona_required'
  | 'scraping_blocked'
  | 'quota_exceeded'
  | 'error'

export interface PipelineResult {
  status: PipelineStatus
  message?: string
  suggestions?: ISuggestion[]
  suggestionId?: string
  trendsUsed?: string[]
  scrapingError?: string
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function runContentPipeline(input: PipelineInput): Promise<PipelineResult> {
  const userObjectId = new mongoose.Types.ObjectId(input.userId)

  // ── STEP 0: Token quota check ─────────────────────────────────────────────
  const quota = await checkTokenQuota(input.userId)
  if (!quota.allowed) {
    return {
      status: 'quota_exceeded',
      message: `Token quota exceeded. You have used ${quota.tokensUsed.toLocaleString()} of your ${quota.tokenLimit.toLocaleString()} token limit.`,
    }
  }

  // ── STEP 1: Persona Analysis (Agent 1) ──────────────────────────────────────
  try {
    const existingPersona = await UserPersona.findOne({ userId: userObjectId })
    const needsAnalysis = !existingPersona || input.forceReanalyze

    if (needsAnalysis && (input.linkedinUrl || input.manualPosts)) {
      console.log('[pipeline] Step 1: Running persona analysis...')

      const { posts, scrapingBlocked, errorMessage } = await resolvePostsFromInput({
        linkedinUrl: input.linkedinUrl,
        manualPosts: input.manualPosts,
      })

      if (scrapingBlocked) {
        return {
          status: 'scraping_blocked',
          message: 'LinkedIn scraping was blocked. Please paste your posts manually.',
          scrapingError: errorMessage,
        }
      }

      if (posts.length === 0) {
        return {
          status: 'persona_required',
          message: 'No posts provided. Please provide a LinkedIn URL or paste your posts.',
        }
      }

      const { analysis, usage: personaUsage } = await analyzePersona(posts)

      // Track persona analysis token usage — fire-and-forget
      trackTokenUsage({
        userId: input.userId,
        agent: 'persona-analyst',
        operation: 'persona_analysis',
        inputTokens: personaUsage.inputTokens,
        outputTokens: personaUsage.outputTokens,
        totalTokens: personaUsage.inputTokens + personaUsage.outputTokens,
      })

      await UserPersona.findOneAndUpdate(
        { userId: userObjectId },
        {
          $set: {
            linkedinUrl: input.linkedinUrl,
            scrapedPosts: posts,
            writingStyle: analysis.writingStyle,
            tone: analysis.tone,
            topics: analysis.topics,
            postFormats: analysis.postFormats,
          },
        },
        { upsert: true, new: true }
      )

      console.log('[pipeline] Step 1: Persona analysis complete.')
    } else if (needsAnalysis) {
      return {
        status: 'persona_required',
        message: 'Please complete the persona analysis step first (provide LinkedIn URL or posts).',
      }
    }
  } catch (err) {
    console.error('[pipeline] Step 1 error:', err)
    return {
      status: 'error',
      message: `Persona analysis failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // ── STEP 2: Check interview completion (Agent 2 must be done first) ──────────
  const persona = await UserPersona.findOne({ userId: userObjectId })

  if (!persona) {
    return {
      status: 'persona_required',
      message: 'Persona not found. Please complete the LinkedIn analysis step.',
    }
  }

  if (!persona.interviewComplete) {
    return {
      status: 'interview_required',
      message: 'Please complete the onboarding interview before generating content suggestions.',
    }
  }

  // ── STEP 3: Trend Research (Agent 3) ─────────────────────────────────────────
  let trends
  try {
    console.log('[pipeline] Step 3: Researching trends...')
    const { result: trendResult, usage: trendUsage } = await researchTrendsForUser({
      industry: persona.industry ?? 'business',
      topics: persona.topics.length ? persona.topics : persona.contentPillars,
    })
    trends = trendResult

    // Track trend research token usage — fire-and-forget
    trackTokenUsage({
      userId: input.userId,
      agent: 'trend-research',
      operation: 'trend_research',
      inputTokens: trendUsage.inputTokens,
      outputTokens: trendUsage.outputTokens,
      totalTokens: trendUsage.inputTokens + trendUsage.outputTokens,
    })

    console.log(`[pipeline] Step 3: Found ${trends.trends.length} relevant trends.`, trends)
  } catch (err) {
    console.warn('[pipeline] Step 3: Trend research failed, continuing with empty trends:', err, trends)
    trends = { trends: [], rawTrends: [] }
  }

  // ── STEP 4: Content Generation (Agent 4) ─────────────────────────────────────
  let contentIdeas
  let contentUsage = { inputTokens: 0, outputTokens: 0 }
  try {
    console.log('[pipeline] Step 4: Generating content ideas...')
    const genResult = await generateContentIdeas({ persona, trends, context: input.context })
    contentIdeas = genResult.ideas
    contentUsage = genResult.usage
    console.log(`[pipeline] Step 4: Generated ${contentIdeas.ideas.length} content ideas.`)
  } catch (err) {
    console.error('[pipeline] Step 4 error:', err)
    return {
      status: 'error',
      message: `Content generation failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // ── STEP 5: Persist results ───────────────────────────────────────────────────
  const saved = await ContentSuggestion.create({
    userId: userObjectId,
    generatedAt: new Date(),
    trendsUsed: trends.rawTrends,
    suggestions: contentIdeas.ideas.map((idea) => ({
      topic: idea.topic,
      angle: idea.angle,
      format: idea.format,
      hook: idea.hook,
      whyItFits: idea.whyItFits,
      seoKeywords: idea.seoKeywords ?? [],
      clickbaitHooks: idea.clickbaitHooks ?? [],
      postPointers: idea.postPointers ?? [],
      callToAction: idea.callToAction ?? '',
    })),
  })

  // Track content generation token usage — fire-and-forget (after save so we have suggestionId)
  trackTokenUsage({
    userId: input.userId,
    agent: 'content-generator',
    operation: 'content_generation',
    inputTokens: contentUsage.inputTokens,
    outputTokens: contentUsage.outputTokens,
    totalTokens: contentUsage.inputTokens + contentUsage.outputTokens,
    metadata: { suggestionId: String(saved._id) },
  })

  console.log(`[pipeline] Done. Saved suggestion set: ${saved._id}`)

  return {
    status: 'success',
    suggestions: contentIdeas.ideas as ISuggestion[],
    suggestionId: String(saved._id),
    trendsUsed: trends.rawTrends,
  }
}

// ── Retry wrapper ─────────────────────────────────────────────────────────────

export async function runContentPipelineWithRetry(
  input: PipelineInput,
  maxRetries = 2
): Promise<PipelineResult> {
  let lastResult: PipelineResult = { status: 'error', message: 'Pipeline not started' }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    lastResult = await runContentPipeline(input)

    // Only retry on transient errors, not on logic gates (interview_required etc.)
    if (lastResult.status !== 'error') return lastResult

    if (attempt < maxRetries) {
      console.warn(`[pipeline] Attempt ${attempt} failed. Retrying...`)
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }

  return lastResult
}

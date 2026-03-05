import { Mastra } from "@mastra/core";
import mongoose from "mongoose";
import {
  personaAnalystAgent,
  analyzePersona,
  resolvePostsFromInput,
} from "./personaAnalyst";
import { onboardingAgent } from "./onboarding";
import { trendResearchAgent, researchTrendsForUser } from "./trendResearch";
import {
  contentGeneratorAgent,
  generateContentIdeas,
} from "./contentGenerator";
import { personaChatAgent } from "./personaChat";
import { postEditorAgent } from "./postEditor";
import { UserPersona } from "../models/UserPersona";
import { ContentSuggestion } from "../models/ContentSuggestion";
import { checkTokenQuota, trackTokenUsage } from "../services/tokenUsage";
import { extractWritingDNA } from "../services/writingDNA";
import { computeConfidenceScore } from "../services/personaConfidence";
import { fireAndForget } from "../utils/fireAndForget";
import { CircuitBreaker } from "../utils/circuitBreaker";
import { PIPELINE } from "../config/constants";
import type { ISuggestion, IGenerateContextOptions } from "@repo/shared-types";

// ── Pipeline utilities (#12, #13) ────────────────────────────────────────────

/** Wraps a promise with a timeout — rejects with descriptive error on expiry (#12) */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/** Singleton circuit breaker for the content pipeline (#13) */
const pipelineBreaker = new CircuitBreaker("content-pipeline");

// ── Mastra instance ───────────────────────────────────────────────────────────

export const mastra = new Mastra({
  agents: {
    personaAnalyst: personaAnalystAgent,
    onboarding: onboardingAgent,
    trendResearch: trendResearchAgent,
    contentGenerator: contentGeneratorAgent,
    personaChat: personaChatAgent,
    postEditor: postEditorAgent,
  },
});

// ── Pipeline input / output types ─────────────────────────────────────────────

export interface PipelineInput {
  userId: string;
  linkedinUrl?: string;
  manualPosts?: string;
  /** Pre-split array of post strings — takes priority over linkedinUrl/manualPosts (#2) */
  postsArray?: string[];
  forceReanalyze?: boolean;
  context?: IGenerateContextOptions; // optional flexible generation context
  /** Target platforms for this generation run (#38) */
  platforms?: string[];
}

export type PipelineStatus =
  | "success"
  | "interview_required"
  | "persona_required"
  | "scraping_blocked"
  | "quota_exceeded"
  | "error";

export interface PipelineResult {
  status: PipelineStatus;
  message?: string;
  suggestions?: ISuggestion[];
  suggestionId?: string;
  trendsUsed?: string[];
  scrapingError?: string;
  /** Whether trends came from live APIs or the evergreen fallback (#34) */
  trendSource?: "live" | "fallback";
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function runContentPipeline(
  input: PipelineInput,
): Promise<PipelineResult> {
  const userObjectId = new mongoose.Types.ObjectId(input.userId);

  // Capture pipeline start time for generationMeta (#54)
  const pipelineStart = Date.now();

  // ── STEP 0: Token quota check ─────────────────────────────────────────────
  const quota = await checkTokenQuota(input.userId);
  if (!quota.allowed) {
    return {
      status: "quota_exceeded",
      message: `Token quota exceeded. You have used ${quota.tokensUsed.toLocaleString()} of your ${quota.tokenLimit.toLocaleString()} token limit.`,
    };
  }

  // ── STEP 1: Persona Analysis (Agent 1) ──────────────────────────────────────
  // Hoist existingPersona so Step 2 can reuse it without a second DB round-trip.
  // Only re-query in Step 2 when Step 1 ran an upsert (needsAnalysis=true).
  let personaAfterStep1 = await UserPersona.findOne({ userId: userObjectId });
  try {
    const needsAnalysis = !personaAfterStep1 || input.forceReanalyze;

    if (needsAnalysis && (input.postsArray?.length || input.linkedinUrl || input.manualPosts)) {
      console.log("[pipeline] Step 1: Running persona analysis...");

      let posts: string[];

      // postsArray takes priority — avoids double-parsing and resolvePostsFromInput overhead
      if (input.postsArray?.length) {
        posts = input.postsArray;
      } else {
        const { posts: resolvedPosts, scrapingBlocked, errorMessage } =
          await resolvePostsFromInput({
            linkedinUrl: input.linkedinUrl,
            manualPosts: input.manualPosts,
          });

        if (scrapingBlocked) {
          return {
            status: "scraping_blocked",
            message:
              "LinkedIn scraping was blocked. Please paste your posts manually.",
            scrapingError: errorMessage,
          };
        }

        posts = resolvedPosts;
      }

      if (posts.length === 0) {
        return {
          status: "persona_required",
          message:
            "No posts provided. Please provide a LinkedIn URL or paste your posts.",
        };
      }

      const { analysis, usage: personaUsage } = await withTimeout(
        analyzePersona(posts),
        PIPELINE.STEP_TIMEOUTS.persona,
        "Persona analysis",
      );

      // Track persona analysis token usage — fire-and-forget
      fireAndForget(
        () => trackTokenUsage({
          userId: input.userId,
          agent: "persona-analyst",
          operation: "persona_analysis",
          inputTokens: personaUsage.inputTokens,
          outputTokens: personaUsage.outputTokens,
          totalTokens: personaUsage.inputTokens + personaUsage.outputTokens,
        }),
        "persona-token-tracking",
      );

      // Extract Writing DNA — deterministic, no LLM (#17)
      const writingDNA = extractWritingDNA(posts);

      // Upsert and capture the updated document so Step 2 can skip another findOne
      personaAfterStep1 = await UserPersona.findOneAndUpdate(
        { userId: userObjectId },
        {
          $set: {
            linkedinUrl: input.linkedinUrl,
            scrapedPosts: posts,
            writingStyle: analysis.writingStyle,
            tone: analysis.tone,
            topics: analysis.topics,
            postFormats: analysis.postFormats,
            writingDNA,
          },
        },
        { upsert: true, new: true },
      );

      // Compute & persist confidence score — deterministic, 2 fast DB queries (#22)
      fireAndForget(async () => {
        const score = await computeConfidenceScore(personaAfterStep1!);
        await UserPersona.updateOne(
          { _id: personaAfterStep1!._id },
          { $set: { confidenceScore: score } },
        );
        // Update in-memory reference so downstream steps see the score
        personaAfterStep1!.confidenceScore = score;
      }, "pipeline-confidence-score");

      console.log("[pipeline] Step 1: Persona analysis complete.");
    } else if (needsAnalysis) {
      return {
        status: "persona_required",
        message:
          "Please complete the persona analysis step first (provide LinkedIn URL or posts).",
      };
    }
  } catch (err) {
    console.error("[pipeline] Step 1 error:", err);
    return {
      status: "error",
      message: `Persona analysis failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // ── STEP 2: Check interview completion (Agent 2 must be done first) ──────────
  // Reuse the persona already fetched/upserted in Step 1 — saves one DB round-trip.
  const persona = personaAfterStep1;

  if (!persona) {
    return {
      status: "persona_required",
      message: "Persona not found. Please complete the LinkedIn analysis step.",
    };
  }

  if (!persona.interviewComplete) {
    return {
      status: "interview_required",
      message:
        "Please complete the onboarding interview before generating content suggestions.",
    };
  }

  // ── STEP 3: Trend Research (Agent 3) ─────────────────────────────────────────
  // For returning users (persona already exists), trend research is independent
  // of any further persona work so we can start it immediately. (#31)
  //
  // Phase 3 #6: Load recently used trends to penalize repeats.
  let recentTrends: string[] = [];
  try {
    const recentSets = await ContentSuggestion.find({ userId: userObjectId })
      .sort({ createdAt: -1 })
      .limit(3)
      .select("trendsUsed")
      .lean();
    recentTrends = recentSets.flatMap(
      (s) => (s as { trendsUsed?: string[] }).trendsUsed ?? [],
    );
  } catch {
    // Non-fatal — proceed without stale penalty
  }

  let trends;
  let trendIsLive = false;
  let trendFetchDurationMs = 0;
  try {
    console.log("[pipeline] Step 3: Researching trends (parallel-ready)...");
    const trendStart = Date.now();
    const {
      result: trendResult,
      usage: trendUsage,
      isLive,
    } = await withTimeout(
      researchTrendsForUser({
        industry: persona.industry ?? "business",
        topics: persona.topics.length ? persona.topics : persona.contentPillars,
        contentPillars: persona.contentPillars, // for balanced selection (#15)
        tone: persona.tone, // for domain-aware angle language
        recentTrends: recentTrends.length > 0 ? recentTrends : undefined, // #6
      }),
      PIPELINE.STEP_TIMEOUTS.trends,
      "Trend research",
    );
    trendFetchDurationMs = Date.now() - trendStart;
    trends = trendResult;
    trendIsLive = isLive;

    // Track trend research token usage — fire-and-forget
    fireAndForget(
      () => trackTokenUsage({
        userId: input.userId,
        agent: "trend-research",
        operation: "trend_research",
        inputTokens: trendUsage.inputTokens,
        outputTokens: trendUsage.outputTokens,
        totalTokens: trendUsage.inputTokens + trendUsage.outputTokens,
      }),
      "trend-token-tracking",
    );

    console.log(
      `[pipeline] Step 3: Found ${trends.trends.length} relevant trends (${isLive ? "live" : "fallback"}).`,
    );
  } catch (err) {
    console.warn(
      "[pipeline] Step 3: Trend research failed, continuing with empty trends:",
      err,
    );
    trends = { trends: [], rawTrends: [] };
    trendIsLive = false;
  }

  // ── STEP 4: Content Generation (Agent 4) ─────────────────────────────────────
  let contentIdeas;
  let contentUsage = { inputTokens: 0, outputTokens: 0 };
  let llmDurationMs = 0;
  try {
    console.log("[pipeline] Step 4: Generating content ideas...");
    const llmStart = Date.now();
    const genResult = await withTimeout(
      generateContentIdeas({
        persona,
        trends,
        context: input.context,
        platforms: input.platforms,
      }),
      PIPELINE.STEP_TIMEOUTS.content,
      "Content generation",
    );
    llmDurationMs = Date.now() - llmStart;
    contentIdeas = genResult.ideas;
    contentUsage = genResult.usage;
    console.log(
      `[pipeline] Step 4: Generated ${contentIdeas.ideas.length} content ideas.`,
    );
  } catch (err) {
    console.error("[pipeline] Step 4 error:", err);
    return {
      status: "error",
      message: `Content generation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // ── STEP 5: Persist results ───────────────────────────────────────────────────
  // Store the ACCEPTED trend topics (not rawTrends which includes rejected ones).
  // This makes trendsUsed accurate for historical analysis and the frontend display.
  const acceptedTrendTopics = trends.trends.map((t) => t.topic);

  const pipelineDurationMs = Date.now() - pipelineStart;
  const totalInputTokens =
    contentUsage.inputTokens;
  const totalOutputTokens =
    contentUsage.outputTokens;

  const saved = await ContentSuggestion.create({
    userId: userObjectId,
    generatedAt: new Date(),
    trendsUsed: acceptedTrendTopics,
    // Top-level trendSource for fast admin analytics queries (#57)
    trendSource: trendIsLive ? "live" : "fallback",
    // Store generation mode + context for history/analytics (#17)
    generationMode: input.context?.mode ?? "profile",
    contextOptions: input.context,
    // Generation analytics (#54)
    generationMeta: {
      pipelineDurationMs,
      trendFetchDurationMs,
      llmDurationMs,
      tokenCost: {
        input: totalInputTokens,
        output: totalOutputTokens,
        total: totalInputTokens + totalOutputTokens,
      },
      trendSource: trendIsLive ? "live" : "fallback",
      modelId: "gemini-2.5-flash",
    },
    suggestions: contentIdeas.ideas.map((idea) => ({
      topic: idea.topic,
      angle: idea.angle,
      format: idea.format,
      hook: idea.hook,
      whyItFits: idea.whyItFits,
      seoKeywords: idea.seoKeywords ?? [],
      clickbaitHooks: idea.clickbaitHooks ?? [],
      postPointers: idea.postPointers ?? [],
      callToAction: idea.callToAction ?? "",
      platform: idea.platform ?? "linkedin",
    })),
  });

  // Track content generation token usage — fire-and-forget (after save so we have suggestionId)
  fireAndForget(
    () => trackTokenUsage({
      userId: input.userId,
      agent: "content-generator",
      operation: "content_generation",
      inputTokens: contentUsage.inputTokens,
      outputTokens: contentUsage.outputTokens,
      totalTokens: contentUsage.inputTokens + contentUsage.outputTokens,
      metadata: { suggestionId: String(saved._id) },
    }),
    "content-token-tracking",
  );

  console.log(`[pipeline] Done. Saved suggestion set: ${saved._id}`);

  return {
    status: "success",
    suggestions: contentIdeas.ideas as ISuggestion[],
    suggestionId: String(saved._id),
    trendsUsed: acceptedTrendTopics,
    trendSource: trendIsLive ? "live" : "fallback",
  };
}

// ── Retry wrapper with circuit breaker (#13) and exponential backoff (#14) ───

export async function runContentPipelineWithRetry(
  input: PipelineInput,
  maxRetries = PIPELINE.MAX_RETRY_ATTEMPTS,
): Promise<PipelineResult> {
  // Circuit breaker check — fast-fail if AI service is down (#13)
  try {
    return await pipelineBreaker.execute(async () => {
      let lastResult: PipelineResult = {
        status: "error",
        message: "Pipeline not started",
      };

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // Overall pipeline timeout (#12)
        lastResult = await withTimeout(
          runContentPipeline(input),
          PIPELINE.STEP_TIMEOUTS.overall,
          "Overall pipeline",
        );

        // Only retry on transient errors, not on logic gates (interview_required etc.)
        if (lastResult.status !== "error") return lastResult;

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s, ... (#14)
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.warn(
            `[pipeline] Attempt ${attempt} failed. Retrying in ${delay}ms...`,
          );
          await new Promise((r) => setTimeout(r, delay));
        }
      }

      return lastResult;
    });
  } catch (err) {
    // Circuit breaker open or timeout
    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

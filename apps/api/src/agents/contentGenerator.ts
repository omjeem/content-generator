import { Agent } from "@mastra/core/agent";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import type { IUserPersonaDocument } from "../models/UserPersona";
import type { TrendResult } from "./trendResearch";
import type { IGenerateContextOptions } from "@repo/shared-types";
import type { TrendResearchResult } from "./trendResearch";
import { extractJSON } from "../utils/extractJSON";

// ── Output schema ─────────────────────────────────────────────────────────────

export const SuggestionSchema = z.object({
  topic: z.string().describe("What the post is about"),
  angle: z.string().describe("The unique perspective or spin on the topic"),
  format: z
    .enum(["carousel", "text-post", "poll", "video-script", "list"])
    .describe("Recommended LinkedIn post format"),
  hook: z
    .string()
    .max(200)
    .describe("Opening line — scroll-stopping, under 15 words"),
  whyItFits: z
    .string()
    .describe("Why this idea matches the user's voice and audience"),
  // Rich content brief fields
  seoKeywords: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe("3-5 LinkedIn hashtags / SEO keywords for this post"),
  clickbaitHooks: z
    .array(z.string())
    .min(2)
    .max(3)
    .describe("2-3 bolder, punchier alternative hook variants"),
  postPointers: z
    .array(z.string())
    .min(4)
    .max(6)
    .describe(
      "4-6 bullet points outlining exactly what to write in the post body",
    ),
  callToAction: z
    .string()
    .describe(
      'A single suggested CTA to close the post (e.g. "What do you think? Drop a comment.")',
    ),
});

export const ContentIdeasSchema = z.object({
  ideas: z.array(SuggestionSchema).min(5).max(10),
});

export type ContentIdeas = z.infer<typeof ContentIdeasSchema>;

// ── Agent ─────────────────────────────────────────────────────────────────────

export const contentGeneratorAgent = new Agent({
  id: "content-generator",
  name: "content-generator",
  model: google("gemini-2.5-flash"),
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
});

// ── Compressed persona summary (#23) ─────────────────────────────────────────
// Produces a 5-bullet summary instead of per-field verbose listing.
// Saves ~150 tokens per generation call without losing signal.

function buildPersonaSummary(persona: IUserPersonaDocument): string {
  const lines: string[] = [
    `• Industry/niche: ${persona.industry ?? "Business"} | Goal: ${persona.platformGoal ?? "thought-leadership"}`,
    `• Audience: ${persona.targetAudience ?? "Business professionals"}`,
    `• Content pillars: ${persona.contentPillars.slice(0, 4).join(", ") || persona.topics.slice(0, 4).join(", ") || "Leadership, Growth, Innovation"}`,
    `• Voice: ${persona.tone ?? "Professional"} tone, ${persona.writingStyle ?? "clear"} style | Formats: ${persona.postFormats.slice(0, 3).join(", ") || "text-post, carousel"}`,
    `• Goal: ${persona.goals?.slice(0, 120) ?? "Build thought leadership on LinkedIn"}`,
  ];
  return lines.join("\n");
}

// ── Usage tuple type ──────────────────────────────────────────────────────────

export interface ContentGenerationResult {
  ideas: ContentIdeas;
  usage: { inputTokens: number; outputTokens: number };
}

// ── Helper: generate content ideas ───────────────────────────────────────────

export async function generateContentIdeas(input: {
  persona: IUserPersonaDocument;
  trends: TrendResult | TrendResearchResult["result"];
  context?: IGenerateContextOptions;
}): Promise<ContentGenerationResult> {
  const { persona, trends, context } = input;

  const trendsList = trends.trends.length
    ? trends.trends
        .map(
          (t) =>
            `- ${t.topic}: ${t.relevanceReason} | Angle: ${t.contentAngle}`,
        )
        .join("\n")
    : "No trending topics available — use evergreen topics for this niche";

  // Build context override section
  const contextSection = buildContextSection(context);

  // ── Compressed persona prompt (#23) ──────────────────────────────────────
  // 5-bullet summary instead of verbose field listing — saves ~150 tokens/call.
  const personaSummary = buildPersonaSummary(persona);

  const prompt = `Generate 5-10 authentic LinkedIn post ideas for this creator.
Each idea MUST include all fields: topic, angle, format, hook, whyItFits, seoKeywords (3-5), clickbaitHooks (2-3), postPointers (4-6), callToAction.

## CREATOR PROFILE
${personaSummary}

## CURRENT TRENDS IN THEIR NICHE
${trendsList}
${contextSection}
Return ONLY the JSON object with the ideas array.`;

  // ── LLM call with granular retry (#16) ──────────────────────────────────────
  // Retry only the LLM call (not the whole pipeline). On retry, simplify the
  // prompt to reduce token count and improve parsing reliability.
  const MAX_ATTEMPTS = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const promptToUse =
      attempt === 1 ? prompt : buildSimplifiedPrompt(persona, trends);

    try {
      const result = await contentGeneratorAgent.generate(promptToUse);
      const text = result.text ?? "";
      const raw = extractJSON<unknown>(
        text,
        `content generator (attempt ${attempt})`,
      );
      const ideas = ContentIdeasSchema.parse(raw);

      if (attempt > 1) {
        console.log(
          `[contentGenerator] ✓ Succeeded on retry attempt ${attempt}`,
        );
      }

      // ── Diversity validation (#22) ─────────────────────────────────────────
      // Warn (but don't fail) if output lacks format variety or topic diversity.
      // Issues logged so they can inform prompt tuning.
      const diversityWarnings = validateDiversity(ideas);
      if (diversityWarnings.length > 0) {
        console.warn(
          "[contentGenerator] Diversity check:",
          diversityWarnings.join(" | "),
        );
      }

      return {
        ideas,
        usage: {
          inputTokens: result.usage?.inputTokens ?? 0,
          outputTokens: result.usage?.outputTokens ?? 0,
        },
      };
    } catch (err) {
      lastError = err;
      console.warn(
        `[contentGenerator] Attempt ${attempt} failed:`,
        (err as Error).message,
      );
      if (attempt < MAX_ATTEMPTS) {
        console.log("[contentGenerator] Retrying with simplified prompt...");
      }
    }
  }

  throw lastError;
}

// ── Simplified retry prompt ────────────────────────────────────────────────────
// Used on retry to reduce token count and improve JSON parsing reliability.

function buildSimplifiedPrompt(
  persona: IUserPersonaDocument,
  trends: TrendResult | TrendResearchResult["result"],
): string {
  const topTopics =
    ((persona.topics ?? []).slice(0, 3).join(", ") || persona.industry) ??
    "business";
  const topTrends = trends.trends
    .slice(0, 3)
    .map((t) => t.topic)
    .join(", ");

  return `Generate 5 LinkedIn post ideas for a ${persona.industry ?? "business"} professional.
Topics: ${topTopics}. Recent trends: ${topTrends || "general industry trends"}.
Return ONLY a JSON object:
{"ideas":[{"topic":"...","angle":"...","format":"text-post","hook":"...","whyItFits":"...","seoKeywords":["#tag"],"clickbaitHooks":["...","..."],"postPointers":["...","...","...","..."],"callToAction":"..."}]}`;
}

// ── Diversity validation (#22) ────────────────────────────────────────────────
// Returns an array of warning strings (empty = all good).

function validateDiversity(ideas: ContentIdeas): string[] {
  const warnings: string[] = [];

  // Check format diversity — expect ≥3 unique formats
  const formats = ideas.ideas.map((i) => i.format);
  const uniqueFormats = new Set(formats);
  if (uniqueFormats.size < 3 && ideas.ideas.length >= 5) {
    warnings.push(
      `Low format diversity: only ${uniqueFormats.size} format(s) used (${[...uniqueFormats].join(", ")})`,
    );
  }

  // Check topic diversity — no topic should repeat more than twice
  const topicCounts = new Map<string, number>();
  for (const idea of ideas.ideas) {
    const topicKey = idea.topic.toLowerCase().slice(0, 40);
    topicCounts.set(topicKey, (topicCounts.get(topicKey) ?? 0) + 1);
  }
  for (const [topic, count] of topicCounts.entries()) {
    if (count > 2) {
      warnings.push(`Topic repeated ${count}x: "${topic}"`);
    }
  }

  return warnings;
}

// ── Build optional context override section ───────────────────────────────────

function buildContextSection(context?: IGenerateContextOptions): string {
  if (!context) return "";

  const lines: string[] = ["\n## GENERATION CONTEXT OVERRIDE"];

  switch (context.mode) {
    case "topic-focus":
      if (context.topicFocus) {
        lines.push(
          `Focus Mode: Generate ALL ideas around this specific topic/niche: "${context.topicFocus}"`,
        );
        lines.push(
          "Prioritise this topic over the general content pillars above.",
        );
      }
      break;

    case "chat-refined":
      if (context.chatRefinementContext) {
        lines.push(
          "This generation was refined through a pre-gen chat. Use this summary as primary context:",
        );
        lines.push(context.chatRefinementContext);
      }
      break;

    case "profile":
    default:
      lines.push(
        "Mode: Standard profile-based generation. Use all persona data above.",
      );
      break;
  }

  if (context.targetAudienceOverride) {
    lines.push(`Target Audience Override: ${context.targetAudienceOverride}`);
  }

  if (context.platformGoal) {
    lines.push(`Platform Goal Override: ${context.platformGoal}`);
    lines.push(getPlatformGoalGuidance(context.platformGoal));
  }

  if (context.contentMix) {
    lines.push(
      `Content Mix Preference: ${getContentMixGuidance(context.contentMix)}`,
    );
  }

  return lines.join("\n");
}

function getPlatformGoalGuidance(goal: string): string {
  const guidance: Record<string, string> = {
    "thought-leadership":
      "Favour opinion pieces, contrarian takes, and insight-driven content.",
    "lead-generation":
      "Favour value-demonstration posts that showcase expertise and attract prospects.",
    "personal-brand":
      "Favour personal stories, behind-the-scenes, and vulnerability-driven posts.",
    hiring:
      "Favour culture-showcasing posts, team stories, and employer-brand content.",
    "community-building":
      "Favour question-based posts, polls, and community discussion starters.",
  };
  return guidance[goal] ?? "";
}

function getContentMixGuidance(mix: string): string {
  const guidance: Record<string, string> = {
    "more-carousels":
      "Skew format choices heavily towards carousel (at least 60% of ideas).",
    "more-text-posts":
      "Skew format choices heavily towards text-post (at least 60% of ideas).",
    "more-polls":
      "Include more poll format posts (at least 3 polls in the ideas).",
    balanced: "Mix formats evenly across carousel, text-post, list, and poll.",
  };
  return guidance[mix] ?? "";
}

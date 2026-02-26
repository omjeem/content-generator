import { Agent } from "@mastra/core/agent";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import type { IUserPersonaDocument } from "../models/UserPersona";
import type { TrendResult } from "./trendResearch";
import type { IGenerateContextOptions } from "@repo/shared-types";
import type { TrendResearchResult } from "./trendResearch";
import { extractJSON } from "../utils/extractJSON";
import { getPlatformConfig } from "../config/platforms";

// ── Output schema ─────────────────────────────────────────────────────────────

export const SuggestionSchema = z.object({
  topic: z.string().describe("What the post is about"),
  angle: z.string().describe("The unique perspective or spin on the topic"),
  format: z
    .enum(["carousel", "text-post", "poll", "video-script", "list", "tweet", "thread", "quote-tweet", "image-tweet"])
    .describe("Recommended post format for the target platform"),
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
    .describe("3-5 hashtags / SEO keywords for this post"),
  clickbaitHooks: z
    .array(z.string())
    .min(2)
    .max(5)
    .describe("2-3 bolder, punchier alternative hook variants"),
  postPointers: z
    .array(z.string())
    .min(4)
    .max(10)
    .describe(
      "4-6 bullet points outlining exactly what to write in the post body",
    ),
  callToAction: z
    .string()
    .describe(
      'A single suggested CTA to close the post (e.g. "What do you think? Drop a comment.")',
    ),
  // Platform targeting (#34)
  platform: z
    .enum(["linkedin", "twitter"])
    .default("linkedin")
    .describe("Target platform for this suggestion"),
});

export const ContentIdeasSchema = z.object({
  ideas: z.array(SuggestionSchema).min(5).max(20),
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

// ── Feedback signals section (#19) ────────────────────────────────────────────
// Appended to the prompt when the user has ≥3 feedback records.
// Guides the LLM to produce ideas more aligned with what the user has responded
// well to in the past and away from topics/formats they've dismissed.

function buildFeedbackSection(persona: IUserPersonaDocument): string {
  const fp = persona.feedbackProfile;
  if (!fp || fp.totalFeedbackCount < 3) return "";

  const lines: string[] = ["\n## USER FEEDBACK SIGNALS"];
  lines.push(
    `(Based on ${fp.totalFeedbackCount} past rating${fp.totalFeedbackCount === 1 ? "" : "s"}, avg satisfaction: ${fp.averageRating}/4)`,
  );

  if (fp.preferredTopics.length > 0) {
    lines.push(
      `Topics they engage with most: ${fp.preferredTopics.slice(0, 5).join(", ")}`,
    );
    lines.push("→ Prioritise ideas within or adjacent to these topics.");
  }

  if (fp.avoidTopics.length > 0) {
    lines.push(
      `Topics they consistently dismiss: ${fp.avoidTopics.slice(0, 5).join(", ")}`,
    );
    lines.push("→ Avoid ideas centred on these topics.");
  }

  // Format preferences — show only those ≥10%
  const preferredFormats = Object.entries(fp.formatPreferences)
    .filter(([, pct]) => pct >= 0.1)
    .sort((a, b) => b[1] - a[1])
    .map(([fmt, pct]) => `${fmt} (${Math.round(pct * 100)}%)`);

  if (preferredFormats.length > 0) {
    lines.push(`Format preferences: ${preferredFormats.join(", ")}`);
    lines.push("→ Skew format choices to reflect these preferences.");
  }

  if (fp.tonePreference) {
    lines.push(`Tone preference: ${fp.tonePreference}`);
  }

  return lines.join("\n");
}

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

// ── Platform requirements section (#34) ──────────────────────────────────────
// Injected into the prompt when the user has requested specific platforms.
// Empty string when only LinkedIn is requested (the default) to save tokens.

function buildPlatformSection(platforms?: string[]): string {
  if (!platforms || platforms.length === 0) return "";

  // LinkedIn-only is the default — no section needed
  if (platforms.length === 1 && platforms[0] === "linkedin") return "";

  const lines: string[] = ["\n## PLATFORM REQUIREMENTS"];

  const hasLinkedIn = platforms.includes("linkedin");
  const hasTwitter = platforms.includes("twitter");

  if (hasLinkedIn && hasTwitter) {
    lines.push(
      "Generate ideas for BOTH LinkedIn AND Twitter/X. Split evenly: ~50% per platform.",
    );
    lines.push('Each idea MUST have a "platform" field: "linkedin" or "twitter".');
  } else if (hasTwitter) {
    lines.push(
      "Generate ALL ideas for Twitter/X only. No LinkedIn posts.",
    );
    lines.push('Set "platform": "twitter" on every idea.');
  }

  // Per-platform rules
  for (const platformId of platforms) {
    const cfg = getPlatformConfig(platformId);
    lines.push(`\n${cfg.name} rules:`);
    lines.push(`- Max chars: ${cfg.maxChars}`);
    lines.push(`- Supported formats: ${cfg.formats.join(", ")}`);
    lines.push(`- Hashtag strategy: ${cfg.hashtagStrategy}`);
    lines.push(`- Best practices: ${cfg.bestPractices}`);
    if (cfg.supportsThreads) {
      lines.push(
        `- Threads supported: yes (max ${cfg.threadMaxTweets ?? 25} tweets). Use format "thread" for multi-tweet ideas.`,
      );
    }
  }

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
  platforms?: string[];
}): Promise<ContentGenerationResult> {
  const { persona, trends, context, platforms } = input;

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

  // ── Feedback signals section (#19) ───────────────────────────────────────
  // Only appended if the user has ≥3 feedback records — signals are too noisy
  // with fewer data points and add unnecessary tokens.
  const feedbackSection = buildFeedbackSection(persona);

  // ── Platform requirements section (#34) ──────────────────────────────────
  // Only appended when Twitter or multi-platform is requested.
  // Passing context.platforms allows the dashboard to drive platform targeting.
  const effectivePlatforms = platforms ?? context?.platforms?.map(String);
  const platformSection = buildPlatformSection(effectivePlatforms);

  // Adjust prompt intro based on platforms requested
  const platformLabel =
    effectivePlatforms?.includes("twitter") &&
    !effectivePlatforms?.includes("linkedin")
      ? "Twitter/X"
      : effectivePlatforms?.includes("twitter") &&
          effectivePlatforms?.includes("linkedin")
        ? "LinkedIn + Twitter/X"
        : "LinkedIn";

  const prompt = `Generate 5-10 authentic ${platformLabel} post ideas for this creator.
Each idea MUST include all fields: topic, angle, format, hook, whyItFits, seoKeywords (3-5), clickbaitHooks (2-3), postPointers (4-6), callToAction, platform.

## CREATOR PROFILE
${personaSummary}

## CURRENT TRENDS IN THEIR NICHE
${trendsList}
${feedbackSection}
${platformSection}
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

      // ── Post-parse minimum count check (#5) ────────────────────────────────
      // ContentIdeasSchema requires min(5) via Zod, but guard against edge cases
      // where only a few ideas survive individual field validation.
      if (ideas.ideas.length < 3) {
        throw new Error(
          `Only ${ideas.ideas.length} valid ideas generated — expected at least 3. Retrying.`,
        );
      }

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
{"ideas":[{"topic":"...","angle":"...","format":"text-post","hook":"...","whyItFits":"...","seoKeywords":["#tag"],"clickbaitHooks":["...","..."],"postPointers":["...","...","...","..."],"callToAction":"...","platform":"linkedin"}]}`;
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

import { Agent } from "@mastra/core/agent";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import type { IUserPersonaDocument } from "../models/UserPersona";
import type { TrendResult } from "./trendResearch";
import type { IGenerateContextOptions, ISchedulingHint, ISeriesTag } from "@repo/shared-types";
import type { TrendResearchResult } from "./trendResearch";
import { extractJSON } from "../utils/extractJSON";
import { getPlatformConfig } from "../config/platforms";
import type { IContentSeries } from "../services/contentContinuity";

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

You will receive a user persona AND a list of trending topics. Your job is to generate
5-10 LinkedIn post ideas that:
1. Are DIRECTLY ANCHORED to the provided trending topics — each idea MUST clearly relate to one of the listed trends
2. Feel AUTHENTIC to this specific person's voice
3. Provide a full content brief so they can immediately write the post

CRITICAL RULE: Every generated idea MUST be based on or directly inspired by one of the
provided trending topics. Do NOT generate ideas about random topics from the creator's
general expertise. The trends section is your PRIMARY content source — the persona tells
you HOW to write about those trends, not WHAT to write about.

If the trending topics are about "Microservices vs Monoliths", your ideas must be about
microservices, monoliths, and related architecture decisions — NOT about unrelated topics
like AI costs or LLM hallucinations, even if the creator works in tech.

Each idea MUST include ALL of these fields:
- topic: what the post is about — must clearly connect to one of the provided trends
- angle: the unique perspective or spin the creator brings to this trend
- format: exactly one of: carousel | text-post | poll | video-script | list
- hook: opening line, scroll-stopping, under 15 words, sounds like THEM
- whyItFits: why this matches their voice, audience and goals
- seoKeywords: array of 3-5 LinkedIn hashtags / SEO keywords
- clickbaitHooks: array of 2-3 bolder hook alternatives (punchier variants of the main hook)
- postPointers: array of 4-6 bullet points outlining the exact content to write in the post body
- callToAction: one suggested CTA sentence to close the post

Return ONLY a valid JSON object (no markdown, no extra text):
{
  "ideas": [
    {
      "topic": "Microservices migration pitfalls",
      "angle": "The 3 questions nobody asks before rewriting",
      "format": "carousel",
      "hook": "Your monolith works fine. Here's why you shouldn't touch it yet.",
      "whyItFits": "Matches their backend expertise and system design audience",
      "seoKeywords": ["#Microservices", "#SystemDesign", "#BackendEngineering", "#SoftwareArchitecture"],
      "clickbaitHooks": [
        "We migrated to microservices. It was our most expensive mistake.",
        "Monoliths aren't the problem. Your deployment pipeline is."
      ],
      "postPointers": [
        "Open with a real-world story of a premature microservices migration",
        "Explain the 3 questions: Is it a scaling problem? A team boundary problem? A deployment problem?",
        "Show how answering 'no' to all 3 means you should stay monolithic",
        "Share a decision framework for when microservices actually make sense",
        "Close with the counterintuitive take: most companies need a better monolith, not microservices"
      ],
      "callToAction": "What's the worst microservices decision you've seen? Drop it below."
    }
  ]
}`,
});

// ── Feedback signals section (#19, Phase 3 #14 + #17) ───────────────────────
// Phase 3 #17: Lowered threshold from 3 to 1 with graduated injection.
//   Phase 1 (1-2 feedbacks): lightweight early signals
//   Phase 2 (3+ feedbacks): full directive section
// Phase 3 #14: Strengthened prompt language from advisory to directive RULES.

function buildFeedbackSection(persona: IUserPersonaDocument): string {
  const fp = persona.feedbackProfile;
  if (!fp || fp.totalFeedbackCount < 1) return "";

  const lines: string[] = [];

  // #17: Phase 1 — early signal (1-2 feedbacks)
  if (fp.totalFeedbackCount < 3) {
    lines.push("\n## USER FEEDBACK SIGNALS (early — limited data)");
    if (fp.preferredTopics.length > 0) {
      lines.push(
        `Early signal — user engaged positively with: ${fp.preferredTopics.join(", ")}`,
      );
    }
    if (fp.avoidTopics.length > 0) {
      lines.push(
        `Early signal — user rejected: ${fp.avoidTopics.join(", ")}`,
      );
    }
    return lines.join("\n");
  }

  // #17: Phase 2 — full directive section (3+ feedbacks)
  lines.push("\n## USER FEEDBACK SIGNALS");
  lines.push(
    `(Based on ${fp.totalFeedbackCount} past rating${fp.totalFeedbackCount === 1 ? "" : "s"}, avg satisfaction: ${fp.averageRating}/4)`,
  );

  // #14: Directive language for preferred topics
  if (fp.preferredTopics.length > 0) {
    lines.push(
      `Topics they engage with most: ${fp.preferredTopics.slice(0, 5).join(", ")}`,
    );
    lines.push(
      "→ RULE: At least 60% of generated ideas MUST relate to these preferred topics or closely adjacent ones.",
    );
  }

  // #14: Directive language for avoid topics
  if (fp.avoidTopics.length > 0) {
    lines.push(
      `Topics they consistently dismiss: ${fp.avoidTopics.slice(0, 5).join(", ")}`,
    );
    lines.push(
      "→ RULE: Do NOT generate ANY ideas about these topics. They have been explicitly rejected by the user. Zero tolerance.",
    );
  }

  // #14: Directive language for format preferences
  const preferredFormats = Object.entries(fp.formatPreferences)
    .filter(([, pct]) => pct >= 0.1)
    .sort((a, b) => b[1] - a[1])
    .map(([fmt, pct]) => `${fmt} (${Math.round(pct * 100)}%)`);

  if (preferredFormats.length > 0) {
    lines.push(`Format preferences: ${preferredFormats.join(", ")}`);
    lines.push(
      "→ RULE: Format distribution MUST approximately match these percentages. For example, if carousel is 40%, at least 2 out of 5 ideas must be carousel format.",
    );
  }

  if (fp.tonePreference) {
    lines.push(`Tone preference: ${fp.tonePreference}`);
  }

  // Average content length from published posts — Phase H #53
  if (fp.averageContentLength && fp.averageContentLength > 0) {
    lines.push(
      `Preferred post length: ~${fp.averageContentLength} chars (based on published posts)`,
    );
    lines.push("→ Aim for post bodies close to this length.");
  }

  return lines.join("\n");
}

// ── Compressed persona summary (#23) ─────────────────────────────────────────
// Produces a 5-bullet summary instead of per-field verbose listing.
// Saves ~150 tokens per generation call without losing signal.

export function buildPersonaSummary(persona: IUserPersonaDocument): string {
  const lines: string[] = [
    `• Industry/niche: ${persona.industry ?? "Business"} | Goal: ${persona.platformGoal ?? "thought-leadership"}`,
    `• Audience: ${persona.targetAudience ?? "Business professionals"}`,
    `• Content pillars: ${persona.contentPillars.slice(0, 4).join(", ") || persona.topics.slice(0, 4).join(", ") || "Leadership, Growth, Innovation"}`,
    `• Voice: ${persona.tone ?? "Professional"} tone, ${persona.writingStyle ?? "clear"} style | Formats: ${persona.postFormats.slice(0, 3).join(", ") || "text-post, carousel"}`,
    `• Goal: ${persona.goals?.slice(0, 120) ?? "Build thought leadership on LinkedIn"}`,
  ];
  return lines.join("\n");
}

// ── Writing DNA section (Phase 4 #20) ─────────────────────────────────────
// Only injected if writingDNA exists — guides the LLM on voice patterns.

function buildWritingDNASection(persona: IUserPersonaDocument): string {
  const dna = persona.writingDNA;
  if (!dna) return "";

  const lines: string[] = ["\n## WRITING PATTERN DNA (voice fingerprint)"];

  // Opening style
  const openings = dna.openingPatterns;
  if (openings) {
    const topOpening = Object.entries(openings).sort((a, b) => b[1] - a[1])[0];
    if (topOpening && topOpening[1] > 0) {
      lines.push(`Typical opening style: ${topOpening[0]} (${topOpening[1]} out of posts analyzed)`);
    }
  }

  // Post length
  if (dna.avgPostLength > 0) {
    lines.push(`Average post length: ~${dna.avgPostLength} chars (range: ${dna.postLengthRange[0]}–${dna.postLengthRange[1]})`);
  }

  // Emoji usage
  if (dna.emojiFrequency > 0.5) {
    lines.push(`Emoji usage: ${dna.emojiFrequency} per 100 words — uses emojis actively (faves: ${dna.emojiTypes.slice(0, 3).join(" ")})`);
  } else {
    lines.push("Emoji usage: minimal or none — keep posts emoji-free");
  }

  // Reading level
  lines.push(`Reading level: ${dna.readingLevel}`);

  // Structure
  if (dna.usesListFormat) lines.push("Frequently uses list format");
  if (dna.usesBulletPoints) lines.push("Prefers bullet points for structure");

  // Hashtag style
  if (dna.hashtagPlacement !== "none") {
    lines.push(`Hashtag style: ${dna.hashtagPlacement} placement, ~${dna.hashtagFrequency} per post`);
  }

  // CTA patterns
  if (dna.ctaPatterns.length > 0) {
    lines.push(`Common CTAs: "${dna.ctaPatterns.slice(0, 3).join('", "')}"`);
  }

  return lines.join("\n");
}

// ── Format strategy section (Phase 4 #28) ──────────────────────────────────
// Reads feedbackProfile.formatPreferences (proper 0-1 scores from #27).
// Categorises each format as "prioritise", "use sparingly", or "experiment".

function buildFormatStrategySection(persona: IUserPersonaDocument): string {
  const fp = persona.feedbackProfile;
  if (!fp || !fp.formatPreferences || Object.keys(fp.formatPreferences).length === 0) return "";

  const lines: string[] = ["\n## FORMAT STRATEGY (based on feedback data)"];
  const prioritise: string[] = [];
  const sparingly: string[] = [];
  const experiment: string[] = [];

  for (const [fmt, score] of Object.entries(fp.formatPreferences)) {
    if (typeof score !== "number") continue;
    if (score > 0.6) {
      prioritise.push(`${fmt} (${Math.round(score * 100)}% positive)`);
    } else if (score < 0.2) {
      sparingly.push(fmt);
    }
  }

  // Formats not in feedback data → experiment
  const knownFormats = new Set(Object.keys(fp.formatPreferences));
  const allFormats = ["carousel", "text-post", "poll", "video-script", "list"];
  for (const fmt of allFormats) {
    if (!knownFormats.has(fmt)) {
      experiment.push(fmt);
    }
  }

  if (prioritise.length > 0) {
    lines.push(`Prioritise: ${prioritise.join(", ")}`);
    lines.push("→ RULE: At least 50% of ideas should use these high-performing formats.");
  }
  if (sparingly.length > 0) {
    lines.push(`Use sparingly: ${sparingly.join(", ")}`);
    lines.push("→ These formats received poor feedback. Include at most 1.");
  }
  if (experiment.length > 0) {
    lines.push(`Experiment with: ${experiment.join(", ")}`);
    lines.push("→ No feedback data yet. Include 1-2 ideas in these formats to test.");
  }

  return lines.join("\n");
}

// ── Confidence score directive (Phase 4 #26) ──────────────────────────────
// Adjusts generation strategy based on how well we know the creator.

function buildConfidenceDirective(persona: IUserPersonaDocument): string {
  const score = persona.confidenceScore?.overall;
  if (score === undefined) return "";

  if (score < 40) {
    return "\n## CONFIDENCE NOTE: We have limited data on this creator. Use broader, exploratory topic suggestions. Include diverse formats to discover their preferences.";
  }
  if (score > 70) {
    return "\n## CONFIDENCE NOTE: We have strong data on this creator. You can be highly specific. Use niche topics matching their proven expertise and preferred formats.";
  }
  return ""; // 40-70: no extra directive needed
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

// ── Peer awareness section (Phase 4 #51) ─────────────────────────────────────

function buildPeerSection(persona: IUserPersonaDocument): string {
  const peers = persona.peerInsights;
  if (!peers?.peerTopics?.length) return "";

  return `\n## COMPETITOR/PEER AWARENESS\nYour peers recently posted about: ${peers.peerTopics.join(", ")}.\n→ Suggest angles that DIFFERENTIATE this creator from their peers. Avoid rehashing the same take — offer a contrarian view, deeper insight, or unique personal experience.`;
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
  /** Scheduling hint to attach to every suggestion (Phase 4 #31) */
  schedulingHint?: ISchedulingHint;
  /** Detected content series for continuation prompts (Phase 4 #34) */
  contentSeries?: IContentSeries[];
  /** Audience resonance signals (Phase 4 #48) */
  audienceSignals?: string;
}): Promise<ContentGenerationResult> {
  const { persona, trends, context, platforms, schedulingHint, contentSeries, audienceSignals } = input;

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

  // ── Writing DNA section (Phase 4 #20) ──────────────────────────────────
  const writingDNASection = buildWritingDNASection(persona);

  // ── Confidence directive (Phase 4 #26) ────────────────────────────────
  const confidenceDirective = buildConfidenceDirective(persona);

  // ── Format strategy section (Phase 4 #28) ─────────────────────────────
  const formatStrategySection = buildFormatStrategySection(persona);

  // ── Preferred formats hard constraint (Phase 4 #29) ───────────────────
  const preferredFormats = context?.preferredFormats;
  const formatConstraint = preferredFormats?.length
    ? `\n## FORMAT CONSTRAINT (user-selected)\nONLY use these formats: ${preferredFormats.join(", ")}. Do NOT use any other format.`
    : "";

  // ── Content series directive (Phase 4 #34) ────────────────────────────
  let seriesDirective = "";
  if (contentSeries && contentSeries.length > 0) {
    const seriesLines = contentSeries.map(
      (s) => `- "${s.seriesName}" (${s.postCount} posts: ${s.previousTitles.slice(0, 3).join(", ")})`,
    );
    const nextPart = (contentSeries[0]?.postCount ?? 1) + 1;
    seriesDirective = `\n## CONTENT SERIES DETECTED\nThis creator has ongoing content series:\n${seriesLines.join("\n")}\n→ Suggest 1-2 follow-up ideas continuing one of these series. Mark them as "Part ${nextPart}" continuations.`;
  }

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

  const hasTrends = trends.trends.length > 0;
  const trendAnchorDirective = hasTrends
    ? `\nCRITICAL: Every idea you generate MUST be directly based on one of the trending topics listed below. The creator's profile tells you their VOICE and STYLE — the trends tell you WHAT to write about. Do NOT invent unrelated topics from the creator's general expertise.`
    : "";

  const prompt = `Generate 5-10 authentic ${platformLabel} post ideas for this creator.
Each idea MUST include all fields: topic, angle, format, hook, whyItFits, seoKeywords (3-5), clickbaitHooks (2-3), postPointers (4-6), callToAction, platform.
${trendAnchorDirective}

## CREATOR PROFILE (voice & style reference — NOT the topic source)
${personaSummary}
${feedbackSection}${writingDNASection}${confidenceDirective}${formatStrategySection}${formatConstraint}

## TRENDING TOPICS TO BASE IDEAS ON
${trendsList}
${hasTrends ? "\nEach generated idea MUST clearly connect to one of these trends. Use the creator's voice to write about THESE topics." : ""}
${platformSection}${seriesDirective}${audienceSignals ?? ""}${buildPeerSection(persona)}
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

      // ── Post-process: attach scheduling hints + series tags (#31, #34) ────
      const enrichedIdeas = postProcessIdeas(ideas, schedulingHint, contentSeries);

      return {
        ideas: enrichedIdeas,
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

// ── Post-process: attach scheduling hints + series tags (#31, #34) ────────────

function postProcessIdeas(
  ideas: ContentIdeas,
  schedulingHint?: ISchedulingHint,
  contentSeries?: IContentSeries[],
): ContentIdeas {
  // Build a quick lookup for series matching by keyword overlap
  const seriesKeywords = (contentSeries ?? []).map((s) => ({
    series: s,
    keywords: new Set(
      s.seriesName
        .toLowerCase()
        .split(/[\s&]+/)
        .filter((w) => w.length >= 3),
    ),
  }));

  const enrichedIdeas = ideas.ideas.map((idea, idx) => {
    const enriched = { ...idea } as Record<string, unknown>;

    // Attach scheduling hint to every suggestion
    if (schedulingHint) {
      enriched.schedulingHint = schedulingHint;
    }

    // Match idea to a series if topics overlap
    if (seriesKeywords.length > 0) {
      const ideaWords = new Set(
        idea.topic
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length >= 3),
      );

      for (const { series, keywords } of seriesKeywords) {
        let overlap = 0;
        for (const kw of keywords) {
          if (ideaWords.has(kw)) overlap++;
        }
        if (overlap > 0 && overlap >= keywords.size * 0.5) {
          enriched.seriesTag = {
            name: series.seriesName,
            sequenceNumber: series.postCount + 1,
            previousPosts: series.previousTitles.slice(0, 3),
          } satisfies ISeriesTag;
          break;
        }
      }
    }

    return enriched;
  });

  return { ideas: enrichedIdeas } as ContentIdeas;
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

  const trendDirective = topTrends
    ? `IMPORTANT: Each idea must be about one of these trends: ${topTrends}. Do NOT generate ideas on unrelated topics.`
    : "";

  return `Generate 5 LinkedIn post ideas for a ${persona.industry ?? "business"} professional.
Creator expertise: ${topTopics}. ${trendDirective}${!topTrends ? `Use general ${persona.industry ?? "business"} trends.` : ""}
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

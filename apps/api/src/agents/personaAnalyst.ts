import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import {
  scrapeLinkedInProfile,
  parseManualPosts,
} from "../services/linkedin";
import { getJsonModel } from "../llm/provider";
import { generateAgentJSON, JSON_OUTPUT_RULE } from "../llm/structured";
import { sanitizePosts, wrapPostContent } from "../utils/sanitizeInput";

// ── Output schema ─────────────────────────────────────────────────────────────

export const PersonaSchema = z.object({
  writingStyle: z
    .string()
    .describe("e.g. conversational, story-driven, data-heavy, listicle"),
  tone: z
    .string()
    .describe("e.g. professional, inspiring, witty, educational, provocative"),
  topics: z.array(z.string()).describe("recurring subject areas in the posts"),
  postFormats: z.array(z.string()).describe("preferred formats observed"),
  estimatedPostFrequency: z
    .string()
    .describe("e.g. daily, 3x per week, weekly"),
  engagementPatterns: z
    .string()
    .describe("what types of posts get more engagement"),
  summary: z
    .string()
    .describe("2-3 sentence summary of the person's LinkedIn presence"),
});

export type PersonaAnalysis = z.infer<typeof PersonaSchema>;

// ── Agent ─────────────────────────────────────────────────────────────────────

export const personaAnalystAgent = new Agent({
  id: "persona-analyst",
  name: "persona-analyst",
  // Resolved per call so the JSON-mode kill-switch applies to agent calls too.
  model: () => getJsonModel(),
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
}

${JSON_OUTPUT_RULE}`,
  // Note: linkedinScrapeTool removed (#35) — scraping is done by resolvePostsFromInput()
  // before calling this agent. The agent only analyses pre-fetched text.
});

// ── Usage tuple types ─────────────────────────────────────────────────────────

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface PersonaAnalysisResult {
  analysis: PersonaAnalysis;
  usage: AgentUsage;
}

// ── Helper: run agent and get structured persona ──────────────────────────────

export async function analyzePersona(
  posts: string[],
): Promise<PersonaAnalysisResult> {
  // Sanitize user-supplied post content before embedding in the LLM prompt
  const sanitizedPosts = sanitizePosts(posts);
  const postsText = sanitizedPosts
    .map((p, i) => wrapPostContent(p, i + 1))
    .join("\n\n");

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
${postsText}`;

  // Native JSON mode + local extraction/repair; one model repair call only if
  // both fail. See llm/structured.ts.
  const { data: analysis, usage } = await generateAgentJSON(
    personaAnalystAgent,
    prompt,
    PersonaSchema,
    { context: "persona analyst", normalize: normalizePersona },
  );

  return { analysis, usage };
}

/**
 * Coerces the shapes models commonly return instead of the documented one —
 * a comma-separated string where an array is expected, or a snake_case key.
 * Cheaper than a repair call and far cheaper than a re-analysis.
 */
function normalizePersona(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;

  const aliases: Record<string, string> = {
    writing_style: "writingStyle",
    post_formats: "postFormats",
    formats: "postFormats",
    estimated_post_frequency: "estimatedPostFrequency",
    postFrequency: "estimatedPostFrequency",
    engagement_patterns: "engagementPatterns",
    themes: "topics",
  };

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[aliases[key] ?? key] = val;
  }

  for (const field of ["topics", "postFormats"]) {
    const val = out[field];
    if (typeof val === "string") {
      out[field] = val
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (!Array.isArray(val)) {
      out[field] = [];
    }
  }

  return out;
}

// ── Helper: resolve posts from URL or manual paste ────────────────────────────

export async function resolvePostsFromInput(input: {
  linkedinUrl?: string;
  manualPosts?: string;
}): Promise<{
  posts: string[];
  scrapingBlocked: boolean;
  errorMessage?: string;
}> {
  if (input.linkedinUrl) {
    try {
      const posts = await scrapeLinkedInProfile(input.linkedinUrl);
      return { posts, scrapingBlocked: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Scraping failed";
      return { posts: [], scrapingBlocked: true, errorMessage: msg };
    }
  }

  if (input.manualPosts) {
    const posts = parseManualPosts(input.manualPosts);
    return { posts, scrapingBlocked: false };
  }

  return { posts: [], scrapingBlocked: false };
}

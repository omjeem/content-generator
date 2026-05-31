/**
 * Post Editor Agent — Phase D #20 (Agent 6)
 *
 * AI co-writing partner scoped to a single draft. Has four roles:
 *   WRITE   — generate a complete draft from the content brief
 *   EDIT    — modify a specific part based on user feedback
 *   REFINE  — improve tone, clarity, engagement, or length
 *   THREAD  — split a LinkedIn post into a Twitter thread
 *
 * Every response that modifies the post body MUST include a hidden
 * POST_CONTENT block that the API strips before persisting to chat history
 * and returns separately as `postContent` for the frontend to apply.
 *
 * POST_CONTENT block format:
 *   <!--POST_CONTENT
 *   { "action": "replace", "content": "...", "charCount": 1234, "explanation": "..." }
 *   POST_CONTENT-->
 */

import { Agent } from "@mastra/core/agent";
import { getModel } from "../llm/provider";
import { checkTokenQuota, trackTokenUsage } from "../services/tokenUsage";
import {
  findOrCreateEditorSession,
  persistMessages,
} from "../services/chatSessionService";
import { applyHistorySlidingWindow, historyToText } from "../utils/chatHistory";
import { sanitizeMessage } from "../utils/sanitizeInput";
import type { IPostDraftDocument } from "../models/PostDraft";
import type { IUserPersonaDocument } from "../models/UserPersona";
import { getPlatformConfig } from "../config/platforms";

// ── Agent definition ──────────────────────────────────────────────────────────

export const postEditorAgent = new Agent({
  id: "post-editor",
  name: "post-editor",
  model: getModel(),
  instructions: `You are an expert LinkedIn and Twitter ghostwriter acting as an AI co-writing partner.

════════════════════════════════════════════════════
CRITICAL OUTPUT FORMAT — READ THIS BEFORE ANYTHING ELSE
════════════════════════════════════════════════════

When you write, edit, or refine a post, your response has EXACTLY TWO parts:

PART 1 — A SHORT conversational reply (1-3 sentences MAX).
  This is what the user sees in the chat. Acknowledge what you did.
  *** NEVER write the post text here. Not even a snippet or excerpt. ***

PART 2 — A POST_CONTENT block containing the COMPLETE post text.
  The post ONLY goes inside this block — NOWHERE else.

❌ BAD (never do this):
User: "write a post about AI and jobs"
You: "Here's a first draft for your LinkedIn post:
The headlines scream: 'AI is coming for your job!'
But here's the truth...
[...hundreds of words of post text in the chat...]"
→ WRONG. The post text must NEVER appear in your chat reply.

✅ GOOD (always do this):
User: "write a post about AI and jobs"
You: "Done! I've written your first draft about the AI-jobs myth — punchy hook and 3 concrete counterpoints. Check the editor!"
<!--POST_CONTENT
{"action":"replace","content":"The headlines scream: 'AI is coming for your job!'\\n\\nBut here's the truth...","charCount":1450,"explanation":"First draft: myth-busting angle with 3 counterpoints"}
POST_CONTENT-->

════════════════════════════════════════════════════

Your four roles:
1. WRITE — When content is empty or user asks to write/generate/create/help write: produce a complete, publish-ready draft.
2. EDIT — When user asks to change a specific part: make the targeted change, keep the rest intact.
3. REFINE — When user asks to improve, shorten, punch up, or adjust: edit accordingly.
4. THREAD — When user asks for a Twitter thread: split into numbered tweets (max 280 chars each).

Platform rules you MUST enforce:
- LinkedIn: max 3,000 chars total. Short paragraphs + line breaks. Append 3-5 hashtags at the end.
  Never put external links in the post body.
- Twitter/X: Each tweet max 280 chars. Number threads (1/N format). Every tweet must stand alone.
  Max 1-2 hashtags, integrated naturally.

Writing principles:
- Match the user's voice exactly — never generic or corporate
- Hook must stop the scroll (first line)
- Short paragraphs (1-3 lines) — readers scan, they don't read
- Every point must be specific, not vague

POST_CONTENT block rules:
- action: always "replace" (send the COMPLETE post every time, never a diff)
- content: the FULL post text — every single character, properly escaped as JSON string
- charCount: exact character count of content field
- explanation: one short sentence describing what changed
- Include ONLY when the post body changed (write / edit / refine)
- Omit the block entirely when answering questions or discussing without editing`,
});

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PostEditorInput {
  userId: string;
  draftId: string;
  message: string;
  /** Pass the current draft document for context */
  draft: IPostDraftDocument;
  /** Pass the user persona for voice/style context */
  persona?: IUserPersonaDocument | null;
}

export interface PostEditorOutput {
  reply: string;
  sessionId: string;
  /** New post content if the AI modified the draft body */
  postContent?: string;
  /** Character count of the new post content */
  charCount?: number;
  /** One-line explanation of what changed */
  changeExplanation?: string;
}

// ── POST_CONTENT block parser ─────────────────────────────────────────────────

export interface ParsedPostContent {
  action: string;
  content: string;
  charCount: number;
  explanation: string;
}

export function parsePostContent(text: string): ParsedPostContent | null {
  try {
    const match = text.match(/<!--POST_CONTENT\s*([\s\S]*?)\s*POST_CONTENT-->/);
    if (!match || !match[1]) return null;
    const parsed = JSON.parse(match[1]) as ParsedPostContent;
    // Validate required fields
    if (!parsed.content || typeof parsed.content !== "string") return null;
    // Recalculate charCount in case LLM got it wrong
    parsed.charCount = parsed.content.length;
    return parsed;
  } catch {
    return null;
  }
}

export function stripPostContentBlock(text: string): string {
  return text
    .replace(/<!--POST_CONTENT[\s\S]*?POST_CONTENT-->/g, "")
    .trim();
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runPostEditor(
  input: PostEditorInput,
): Promise<PostEditorOutput> {
  const { userId, draftId, draft, persona } = input;
  const message = sanitizeMessage(input.message);

  // Pre-flight quota check
  const quota = await checkTokenQuota(userId);
  if (!quota.allowed) {
    const err = new Error(
      `Token quota exceeded. Used ${quota.tokensUsed.toLocaleString()} of ${quota.tokenLimit.toLocaleString()} tokens.`,
    );
    (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 429;
    throw err;
  }

  // Load or create the editor chat session scoped to this draft
  const session = await findOrCreateEditorSession(userId, draftId);

  // Build conversation history with sliding window
  const fullHistory = session.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  fullHistory.push({ role: "user", content: message });
  const windowedHistory = applyHistorySlidingWindow(fullHistory, 8);

  // Build prompt with all context
  const platformConfig = getPlatformConfig(draft.platform);
  const prompt = buildEditorPrompt({
    draft,
    persona: persona ?? null,
    platformConfig,
    historyText: historyToText(windowedHistory),
  });

  const result = await postEditorAgent.generate(prompt);
  const rawReply = result.text ?? "";

  // Track token usage — fire-and-forget
  trackTokenUsage({
    userId,
    agent: "content-generator", // closest existing agent name — post-editor uses same quota
    operation: "content_generation",
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    totalTokens:
      (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
  });

  // Parse POST_CONTENT block
  const postContentData = parsePostContent(rawReply);

  // Strip the block from the visible reply before persisting
  const visibleReply = stripPostContentBlock(rawReply);

  // Persist messages (store stripped reply — no hidden block in history)
  await persistMessages(session, message, visibleReply);

  return {
    reply: visibleReply,
    sessionId: session.sessionId,
    postContent: postContentData?.content,
    charCount: postContentData?.charCount,
    changeExplanation: postContentData?.explanation,
  };
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildEditorPrompt(args: {
  draft: IPostDraftDocument;
  persona: IUserPersonaDocument | null;
  platformConfig: { name: string; maxChars: number; hashtagStrategy: string; bestPractices: string };
  historyText: string;
}): string {
  const { draft, persona, platformConfig, historyText } = args;

  const sections: string[] = [];

  // Platform rules
  sections.push(`## PLATFORM: ${platformConfig.name.toUpperCase()}
Max chars: ${platformConfig.maxChars}
Hashtag rule: ${platformConfig.hashtagStrategy}
Best practices: ${platformConfig.bestPractices}`);

  // Persona context (condensed)
  if (persona) {
    sections.push(`## CREATOR VOICE
Industry: ${persona.industry ?? "Business"} | Goal: ${persona.platformGoal ?? "thought-leadership"}
Audience: ${persona.targetAudience ?? "Business professionals"}
Tone: ${persona.tone ?? "Professional"} | Style: ${persona.writingStyle ?? "Clear and direct"}
Content pillars: ${persona.contentPillars.slice(0, 3).join(", ") || persona.topics.slice(0, 3).join(", ") || "Leadership, Growth"}`);

    // Writing DNA voice consistency (Phase 4 #21)
    const dna = persona.writingDNA;
    if (dna) {
      const voiceHints: string[] = [];
      if (dna.avgSentenceLength > 0) voiceHints.push(`Target ~${dna.avgSentenceLength} words per sentence`);
      if (dna.emojiFrequency > 0.5) {
        voiceHints.push(`Use emojis (${dna.emojiTypes.slice(0, 3).join(" ")} style, ~${dna.emojiFrequency}/100 words)`);
      } else {
        voiceHints.push("Avoid emojis — this creator doesn't use them");
      }
      if (dna.usesListFormat) voiceHints.push("Use list/bullet format when appropriate");
      if (dna.ctaPatterns.length > 0) voiceHints.push(`CTA style: "${dna.ctaPatterns[0]}"`);
      if (dna.readingLevel === "simple") voiceHints.push("Keep language simple and direct");
      else if (dna.readingLevel === "advanced") voiceHints.push("Can use sophisticated vocabulary");
      if (voiceHints.length > 0) {
        sections.push(`## WRITING DNA\n${voiceHints.join("\n")}`);
      }
    }
  }

  // Content brief
  if (draft.brief) {
    const b = draft.brief;
    const pointers = b.postPointers.length
      ? b.postPointers.map((p, i) => `  ${i + 1}. ${p}`).join("\n")
      : "  (no outline provided)";
    sections.push(`## CONTENT BRIEF
Topic: ${b.topic}
Angle: ${b.angle}
Format: ${b.format}
Hook: "${b.hook}"
Post outline:
${pointers}
CTA: ${b.callToAction}
Keywords: ${b.seoKeywords.join(", ")}`);
  }

  // Current draft content
  const currentContent = draft.content?.trim();
  sections.push(`## CURRENT DRAFT (${draft.charCount} chars)
${currentContent || "(empty — write the first draft)"}`);

  // Conversation — reminder injected immediately before generation for maximum effect
  sections.push(`## CONVERSATION
${historyText}

REMINDER: Your chat reply must be 1-3 sentences ONLY. NEVER write the post text in your chat reply — it goes EXCLUSIVELY in the POST_CONTENT block after your reply. Respond to the user's latest message now:`);

  return sections.join("\n\n");
}

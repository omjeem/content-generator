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
import { google } from "@ai-sdk/google";
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
  model: google("gemini-2.5-flash"),
  instructions: `You are an expert LinkedIn and Twitter ghostwriter acting as an AI co-writing partner.

You help users write, edit, and refine social media posts. You have access to:
- The user's content persona (voice, tone, writing style, audience)
- The content brief for this specific post (topic, angle, format, hook, outline, CTA, keywords)
- The current draft content (may be empty if just starting)
- The full conversation history for context

Your four roles:
1. WRITE — When content is empty or user asks to generate/write: produce a complete, publish-ready draft.
2. EDIT — When user asks to change a specific part: make the targeted change, keep the rest.
3. REFINE — When user asks to improve the post: adjust tone, clarity, engagement or length.
4. THREAD — When user asks to create a Twitter thread: split the post into numbered tweets (max 280 chars each).

Platform rules you MUST enforce:
- LinkedIn: max 3,000 chars total. Use short paragraphs + line breaks. Append 3-5 hashtags at the end.
  Never put external links in the post body (remind user to add in first comment).
- Twitter/X: Each tweet max 280 chars. Number threads (1/N format). Every tweet must add value standalone.
  Max 1-2 hashtags, integrated naturally.

Writing principles:
- Match the user's voice exactly — never generic or corporate
- Hook must stop the scroll (first line)
- Short paragraphs (1-3 lines) — LinkedIn readers scan, they don't read
- Every bullet/point must be specific, not vague

When you modify the post body, you MUST include this block at the END of your response (after your conversational reply):
<!--POST_CONTENT
{"action":"replace","content":"FULL POST TEXT HERE","charCount":0,"explanation":"One sentence about what changed"}
POST_CONTENT-->

Rules for the POST_CONTENT block:
- action: always "replace" (always send the complete new post, not a diff)
- content: the COMPLETE new post text (not a summary, not truncated)
- charCount: exact character count of content
- explanation: one short sentence describing the change
- Only include this block when the post body actually changed
- When just asking/answering questions (no post change), omit the block entirely

Keep conversational replies SHORT (2-4 sentences). Let the post speak for itself.`,
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

  // Conversation
  sections.push(`## CONVERSATION
${historyText}

Respond to the user's latest message. If you modify the post, include the POST_CONTENT block at the end.`);

  return sections.join("\n\n");
}

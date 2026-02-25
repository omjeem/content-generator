import { Agent } from "@mastra/core/agent";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { trackTokenUsage } from "../services/tokenUsage";
import {
  findOrCreateSession,
  persistMessages,
} from "../services/chatSessionService";
import { saveInterviewAnswers } from "../services/userPersonaService";
import { applyHistorySlidingWindow, historyToText } from "../utils/chatHistory";
import { sanitizeMessage } from "../utils/sanitizeInput";

// ── Interview questions the agent must cover ──────────────────────────────────

const INTERVIEW_QUESTIONS = [
  "goals",
  "targetAudience",
  "industry",
  "contentPillars",
  "postingFrequency",
] as const;

export type InterviewField = (typeof INTERVIEW_QUESTIONS)[number];

// ── Output schema for extracted interview answers ─────────────────────────────

export const InterviewAnswersSchema = z.object({
  goals: z
    .string()
    .optional()
    .describe("Professional goals for LinkedIn content"),
  targetAudience: z.string().optional().describe("Target audience description"),
  industry: z.string().optional().describe("Industry or niche"),
  contentPillars: z
    .array(z.string())
    .optional()
    .describe("3 main content themes"),
  postingFrequency: z
    .string()
    .optional()
    .describe("How often they want to post"),
  interviewComplete: z
    .boolean()
    .describe("True when all 5 questions have been answered"),
  questionsAnswered: z
    .number()
    .describe("Number of questions answered so far (0-5)"),
});

export type InterviewAnswers = z.infer<typeof InterviewAnswersSchema>;

// ── Agent ─────────────────────────────────────────────────────────────────────

export const onboardingAgent = new Agent({
  id: "onboarding-interview",
  name: "onboarding-interview",
  model: google("gemini-2.5-flash"),
  instructions: `You are a friendly content strategist conducting an onboarding interview to understand a creator's posting strategy.

Your job is to gather information by asking targeted questions ONE AT A TIME in a warm, conversational tone.

The 5 questions you must cover:
1. What are your main professional goals for posting content?
2. Who is your target audience? (describe in a single plain sentence, e.g. "Early-career software engineers and tech leads")
3. What industry or niche are you in?
4. What are your 3 main content pillars — the topics you want to be known for?
5. How often do you want to post? (e.g. daily, 3x/week, weekly)

Rules:
- Ask ONLY ONE question at a time
- Acknowledge the user's previous answer warmly before asking the next question
- If an answer is vague, ask a follow-up before moving on
- Track which questions have been answered based on conversation history
- When ALL 5 questions are answered, end with: "Perfect! I have everything I need to start finding content ideas for you. Head back to your dashboard to generate your first batch of personalized content suggestions!"
- Keep responses concise and friendly
- NEVER show the JSON data block to the user — it must be completely hidden

CRITICAL — at the very END of EVERY response, after your conversational text, append this exact block (the user will never see it):
<!--INTERVIEW_DATA
{
  "goals": "single plain string summarising goals, or null",
  "targetAudience": "single plain string describing audience, or null — NEVER use an object or nested keys",
  "industry": "single plain string, or null",
  "contentPillars": ["topic1", "topic2", "topic3"] or null,
  "postingFrequency": "single plain string, or null",
  "questionsAnswered": 0,
  "interviewComplete": false
}
INTERVIEW_DATA-->

IMPORTANT rules for the JSON block:
- ALL values must be plain strings (or null, or an array of strings for contentPillars)
- targetAudience MUST be a single plain string — NEVER an object like {"primary": ..., "secondary": ...}
- Do NOT include the JSON block in the visible part of your response
- The block must start with <!--INTERVIEW_DATA on its own line and end with INTERVIEW_DATA--> on its own line`,
});

// ── Chat with working memory from MongoDB ─────────────────────────────────────

export interface OnboardingChatInput {
  userId: string;
  message: string;
}

export interface OnboardingChatOutput {
  reply: string;
  sessionId: string;
  interviewComplete: boolean;
  questionsAnswered: number;
  extractedData: Partial<InterviewAnswers>;
}

export async function runOnboardingChat(
  input: OnboardingChatInput,
): Promise<OnboardingChatOutput> {
  const { userId } = input;
  // Sanitize user message before embedding in LLM prompt
  const message = sanitizeMessage(input.message);

  // Load or create the chat session for this user
  const session = await findOrCreateSession(userId, "onboarding");

  // Build conversation history for Mastra — apply sliding window to cap token usage
  const fullHistory = session.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Add the new user message to history
  fullHistory.push({ role: "user", content: message });

  // Apply sliding window: keep last 10 verbatim, summarize older messages
  const windowedHistory = applyHistorySlidingWindow(fullHistory);
  const historyText = historyToText(windowedHistory);

  const result = await onboardingAgent.generate(
    `Here is the conversation so far:\n\n${historyText}\n\nPlease respond to the user's latest message.`,
  );

  const reply = result.text;

  // Track token usage — fire-and-forget
  trackTokenUsage({
    userId,
    agent: "onboarding",
    operation: "onboarding_chat",
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    totalTokens:
      (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
    metadata: { sessionId: session.sessionId },
  });

  // Strip the hidden data block BEFORE persisting to DB so it never
  // re-appears in the conversation history fed back to the LLM on the next turn.
  const cleanReply = stripInterviewDataBlock(reply);

  // Persist new messages to MongoDB — always store the clean reply
  await persistMessages(session, message, cleanReply);

  // Parse the hidden data block from the original (unstripped) agent response
  const extractedData = parseInterviewData(reply);

  // ── Deterministic escape hatch (P0 #4) ────────────────────────────────────
  // After ≥12 messages, if the LLM hasn't set interviewComplete but all fields
  // are present in the extracted data, force-complete the interview.
  // This prevents users from getting permanently stuck in the interview loop.
  const totalMessages = session.messages.length + 2; // includes the 2 we're about to push
  if (!extractedData.interviewComplete && totalMessages >= 12) {
    const hasAllFields =
      !!extractedData.goals &&
      !!extractedData.targetAudience &&
      !!extractedData.industry &&
      (extractedData.contentPillars?.length ?? 0) > 0 &&
      !!extractedData.postingFrequency;

    if (hasAllFields) {
      console.log(
        "[onboarding] Deterministic escape hatch triggered — forcing interviewComplete=true",
      );
      extractedData.interviewComplete = true;
      extractedData.questionsAnswered = 5;
    }
  }

  // If interview is complete, persist interview answers to UserPersona.
  // Sanitize all fields before saving — the LLM sometimes returns objects
  // (e.g. targetAudience as {primary: "...", secondary: "..."}) which would
  // cause a Mongoose CastError since all fields are plain String in the schema.
  if (extractedData.interviewComplete) {
    await saveInterviewAnswers(userId, {
      goals: coerceToString(extractedData.goals),
      targetAudience: coerceToString(extractedData.targetAudience),
      industry: coerceToString(extractedData.industry),
      contentPillars: coerceToStringArray(extractedData.contentPillars),
      postingFrequency: coerceToString(extractedData.postingFrequency),
    });
  }

  return {
    reply: cleanReply,
    sessionId: session.sessionId,
    interviewComplete: extractedData.interviewComplete ?? false,
    questionsAnswered: extractedData.questionsAnswered ?? 0,
    extractedData,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseInterviewData(text: string): Partial<InterviewAnswers> {
  try {
    const match = text.match(
      /<!--INTERVIEW_DATA\s*([\s\S]*?)\s*INTERVIEW_DATA-->/,
    );
    if (!match || !match[1]) return {};
    return JSON.parse(match[1]) as Partial<InterviewAnswers>;
  } catch {
    return {};
  }
}

function stripInterviewDataBlock(text: string): string {
  return (
    text
      // Pattern 1: proper HTML comment wrapper <!--INTERVIEW_DATA ... INTERVIEW_DATA-->
      .replace(/<!--INTERVIEW_DATA[\s\S]*?INTERVIEW_DATA-->/g, "")
      // Pattern 2: bare block without comment markers (LLM forgets the <!-- -->)
      .replace(/INTERVIEW_DATA[\s\S]*?INTERVIEW_DATA/g, "")
      // Pattern 3: stray opening/closing tags left over after partial strips
      .replace(/<!--INTERVIEW_DATA[\s\S]*/g, "")
      .replace(/[\s\S]*?INTERVIEW_DATA-->/g, "")
      // Pattern 4: any trailing JSON-like block that starts with { on its own line
      // after the conversational text ends — catches raw JSON bleed-through
      .replace(/\n\s*\{[\s\S]*?\}\s*$/g, (match) => {
        // Only strip if it looks like our data block (contains known interview keys)
        if (
          match.includes('"goals"') ||
          match.includes('"targetAudience"') ||
          match.includes('"interviewComplete"') ||
          match.includes('"questionsAnswered"')
        ) {
          return "";
        }
        return match;
      })
      .trim()
  );
}

/**
 * Coerce any LLM value to a plain string.
 * If the LLM returns an object like {primary: "...", secondary: "..."},
 * flatten it to a comma-joined string of its values.
 */
function coerceToString(
  value: string | Record<string, unknown> | null | undefined,
): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "object") {
    // Flatten object values to a single readable string
    const parts = Object.values(value)
      .filter((v) => v != null && String(v).trim() !== "")
      .map((v) => String(v).trim());
    return parts.length > 0 ? parts.join("; ") : undefined;
  }
  return String(value).trim() || undefined;
}

/**
 * Coerce any LLM value to a string array.
 * Handles: string[], string (comma-split), or null/undefined.
 */
function coerceToStringArray(
  value: string[] | string | null | undefined,
): string[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value))
    return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") {
    const parts = value
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : undefined;
  }
  return undefined;
}

// ── Check interview status (delegated to UserPersonaService) ─────────────────
// Re-exported for backwards compatibility with routes/onboarding.ts

export { getInterviewStatus } from "../services/userPersonaService";

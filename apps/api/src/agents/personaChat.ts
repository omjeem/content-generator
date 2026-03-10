import { Agent } from "@mastra/core/agent";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { checkTokenQuota, trackTokenUsage } from "../services/tokenUsage";
import {
  findOrCreateSession,
  persistMessages,
} from "../services/chatSessionService";
import {
  findPersonaByUserId,
  applyPersonaChanges as applyPersonaChangesService,
} from "../services/userPersonaService";
import { applyHistorySlidingWindow, historyToText } from "../utils/chatHistory";
import { sanitizeMessage } from "../utils/sanitizeInput";
import type { IUserPersonaDocument } from "../models/UserPersona";
import type { IPersonaPendingChanges } from "@repo/shared-types";

// ── Pending changes schema ─────────────────────────────────────────────────────

export const PersonaChangesSchema = z.object({
  goals: z.string().optional(),
  targetAudience: z.string().optional(),
  industry: z.string().optional(),
  contentPillars: z.array(z.string()).optional(),
  postingFrequency: z.string().optional(),
  topics: z.array(z.string()).optional(),
  tone: z.string().optional(),
  writingStyle: z.string().optional(),
  platformGoal: z
    .enum([
      "thought-leadership",
      "lead-generation",
      "personal-brand",
      "hiring",
      "community-building",
    ])
    .optional(),
});

// ── Agent ─────────────────────────────────────────────────────────────────────

export const personaChatAgent = new Agent({
  id: "persona-chat",
  name: "persona-chat",
  model: google("gemini-2.5-flash"),
  instructions: `You are a LinkedIn content strategy coach. The user wants to update or refine their content persona.

Your role:
- Help the user clarify and improve their LinkedIn content strategy
- Ask probing questions to understand their goals, audience, and content pillars
- Suggest improvements to their strategy based on best practices
- When the user expresses a desire to change something about their profile, propose specific changes

Editable persona fields:
- goals: Professional goals for posting on LinkedIn
- targetAudience: Description of the target audience
- industry: Industry or niche
- contentPillars: Array of 3-5 main content topics (most important)
- postingFrequency: How often they post (e.g. "3x per week", "daily", "weekly")
- topics: Additional specific topics beyond the main pillars
- tone: Writing tone (e.g. "Professional and insightful", "Conversational and witty")
- writingStyle: Writing style description (e.g. "Data-driven with personal anecdotes")
- platformGoal: One of: thought-leadership | lead-generation | personal-brand | hiring | community-building

When the user explicitly asks to change something, OR when you have clear proposed updates, include a JSON block at the END of your response:
<!--PERSONA_CHANGES
{
  "goals": "updated goals text (omit field if no change)",
  "contentPillars": ["pillar 1", "pillar 2", "pillar 3"],
  "platformGoal": "thought-leadership"
}
PERSONA_CHANGES-->

Rules:
- ONLY include the PERSONA_CHANGES block when you have concrete changes to propose
- ONLY include fields that are actually changing — omit unchanged fields
- Keep responses concise and actionable (3-6 sentences max)
- Ask one focused question at a time when gathering info
- Be encouraging and strategic, not formulaic`,
});

// ── Chat with working memory ──────────────────────────────────────────────────

export interface PersonaChatInput {
  userId: string;
  message: string;
  sessionId?: string;
}

export interface PersonaChatOutput {
  reply: string;
  sessionId: string;
  pendingChanges?: IPersonaPendingChanges;
  changesApplied: boolean;
}

export async function runPersonaChat(
  input: PersonaChatInput,
): Promise<PersonaChatOutput> {
  const { userId } = input;
  // Sanitize user message before embedding in LLM prompt
  const message = sanitizeMessage(input.message);

  // Pre-flight quota check — throws 429 if blocked
  const quota = await checkTokenQuota(userId);
  if (!quota.allowed) {
    const err = new Error(
      `Token quota exceeded. Used ${quota.tokensUsed.toLocaleString()} of ${quota.tokenLimit.toLocaleString()} tokens.`,
    );
    (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 429;
    throw err;
  }

  // Load current persona for context and chat session in parallel
  const [persona, session] = await Promise.all([
    findPersonaByUserId(userId),
    findOrCreateSession(userId, "persona-chat"),
  ]);

  // Build conversation history — apply sliding window to cap token usage
  const fullHistory = session.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Add user message
  fullHistory.push({ role: "user", content: message });

  // Apply sliding window: keep last 10 verbatim, summarize older messages
  const windowedHistory = applyHistorySlidingWindow(fullHistory);

  // Build persona context for the agent
  const personaContext = persona
    ? buildPersonaContext(persona)
    : "No persona on file yet.";
  const historyText = historyToText(windowedHistory);

  const prompt = `## CURRENT PERSONA
${personaContext}

## CONVERSATION
${historyText}

Please respond to the user's latest message.`;

  const result = await personaChatAgent.generate(prompt);
  const reply = result.text;

  // Track token usage — fire-and-forget
  trackTokenUsage({
    userId,
    agent: "persona-chat",
    operation: "persona_chat",
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    totalTokens:
      (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
    metadata: { sessionId: session.sessionId },
  });

  // Parse pending changes
  const pendingChanges = parsePersonaChanges(reply);

  // Strip marker block BEFORE persisting so history loads are clean too
  const cleanReply = stripPersonaChangesBlock(reply);

  // Persist the cleaned reply — raw markers should never be stored in history
  await persistMessages(session, message, cleanReply);

  return {
    reply: cleanReply,
    sessionId: session.sessionId,
    pendingChanges: pendingChanges ?? undefined,
    changesApplied: false,
  };
}

// ── Apply changes ──────────────────────────────────────────────────────────────

/** Delegate to UserPersonaService — kept here for backwards compatibility with routes/personaChat.ts. */
export async function applyPersonaChanges(
  userId: string,
  changes: IPersonaPendingChanges,
): Promise<IUserPersonaDocument> {
  return applyPersonaChangesService(userId, changes);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPersonaContext(persona: IUserPersonaDocument): string {
  return [
    `Goals: ${persona.goals ?? "Not set"}`,
    `Target Audience: ${persona.targetAudience ?? "Not set"}`,
    `Industry: ${persona.industry ?? "Not set"}`,
    `Content Pillars: ${persona.contentPillars.length ? persona.contentPillars.join(", ") : "Not set"}`,
    `Topics: ${persona.topics.length ? persona.topics.join(", ") : "Not set"}`,
    `Tone: ${persona.tone ?? "Not set"}`,
    `Writing Style: ${persona.writingStyle ?? "Not set"}`,
    `Platform Goal: ${persona.platformGoal ?? "Not set"}`,
    `Posting Frequency: ${persona.postingFrequency ?? "Not set"}`,
  ].join("\n");
}

// Flexible regex that handles LLM format variations:
// <!--PERSONA_CHANGES ... PERSONA_CHANGES-->  (intended format)
// <!--PERSONA_CHANGES ... PERSONA_CHANGES→    (arrow variant)
// PERSONA_CHANGES ... PERSONA_CHANGES-->      (missing opening comment)
// <!--PERSONA_CHANGES { ... } PERSONA_CHANGES (missing closing)
const PERSONA_CHANGES_PARSE_RE =
  /<!--\s*PERSONA_CHANGES\s*([\s\S]*?)\s*PERSONA_CHANGES\s*(?:-->|→|$)/;
const PERSONA_CHANGES_STRIP_RE =
  /<!--\s*PERSONA_CHANGES[\s\S]*?PERSONA_CHANGES\s*(?:-->|→|$)/g;

function parsePersonaChanges(text: string): IPersonaPendingChanges | null {
  try {
    const match = text.match(PERSONA_CHANGES_PARSE_RE);
    if (!match || !match[1]) return null;
    const parsed = PersonaChangesSchema.safeParse(JSON.parse(match[1]));
    if (!parsed.success) return null;
    // Only return if there's at least one field
    if (Object.keys(parsed.data).length === 0) return null;
    return parsed.data as IPersonaPendingChanges;
  } catch {
    return null;
  }
}

function stripPersonaChangesBlock(text: string): string {
  return text
    .replace(PERSONA_CHANGES_STRIP_RE, "")
    .trim();
}

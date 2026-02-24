/**
 * chatHistory.ts
 *
 * Sliding window helper for chat history in agents.
 *
 * Strategy:
 * - Keep the last MAX_VERBATIM messages exactly as-is (most recent context)
 * - Older messages are replaced with a summary prefix to save tokens
 *
 * The summary prefix is constructed deterministically from the older messages
 * (no LLM call needed) — it captures key facts exchanged in the conversation.
 */

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_VERBATIM = 10; // keep last 10 messages verbatim

/**
 * Apply a sliding window to the conversation history.
 *
 * Returns a HistoryMessage array where:
 * - If totalMessages <= MAX_VERBATIM → returns all messages unchanged
 * - If totalMessages > MAX_VERBATIM  → returns a synthetic "summary" assistant
 *   message followed by the last MAX_VERBATIM messages
 */
export function applyHistorySlidingWindow(
  messages: HistoryMessage[],
  maxVerbatim = MAX_VERBATIM,
): HistoryMessage[] {
  if (messages.length <= maxVerbatim) return messages;

  const olderMessages = messages.slice(0, messages.length - maxVerbatim);
  const recentMessages = messages.slice(messages.length - maxVerbatim);

  const summaryLines: string[] = [
    `[Context summary: ${olderMessages.length} earlier messages]`,
  ];

  // Extract key facts from older messages:
  // - User messages that look like answers (contain useful data)
  // - Assistant messages that asked questions or confirmed something
  for (const msg of olderMessages) {
    const preview = msg.content.slice(0, 120).replace(/\n+/g, " ").trim();
    if (preview) {
      summaryLines.push(
        `${msg.role === "user" ? "User said" : "Assistant said"}: "${preview}${msg.content.length > 120 ? "…" : ""}"`,
      );
    }
  }

  const summaryMessage: HistoryMessage = {
    role: "assistant",
    content: summaryLines.join("\n"),
  };

  return [summaryMessage, ...recentMessages];
}

/**
 * Converts a history array to a formatted string for prompt injection.
 */
export function historyToText(messages: HistoryMessage[]): string {
  return messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");
}

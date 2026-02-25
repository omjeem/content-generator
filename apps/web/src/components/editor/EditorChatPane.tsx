"use client";

/**
 * EditorChatPane — Phase D #26
 *
 * The right pane of the editor page. Chat interface scoped to a draft:
 * - Shows conversation history with the Post Editor AI
 * - Sends messages to POST /api/drafts/:id/chat
 * - When AI returns postContent, shows an [Apply Edit] banner
 * - Calls onApplyEdit(content) to push the new text into PostEditorPane
 * - autoInit=true auto-sends "__INIT__" to generate the first draft
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { draftsApi, ApiError } from "@/lib/api";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface PendingEdit {
  content: string;
  charCount: number;
  explanation?: string;
}

interface EditorChatPaneProps {
  draftId: string;
  onApplyEdit: (content: string) => void;
  /** Initial messages loaded from history */
  initialMessages?: ChatMessage[];
  /**
   * When true, auto-sends "__INIT__" on mount to generate the first draft.
   * Should only be true when the draft has empty content AND no chat history.
   */
  autoInit?: boolean;
  disabled?: boolean;
}

export function EditorChatPane({
  draftId,
  onApplyEdit,
  initialMessages = [],
  autoInit = false,
  disabled = false,
}: EditorChatPaneProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Track whether auto-init has already been triggered
  const autoInitFiredRef = useRef(false);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingEdit]);

  const sendMessage = useCallback(
    async (messageText: string) => {
      if (!messageText.trim() || sending) return;

      const userMessage = messageText.trim();
      setInput("");
      setError(null);
      setPendingEdit(null);

      // Optimistically add user message (skip for __INIT__ — it's an internal trigger)
      const isInit = userMessage === "__INIT__";
      if (!isInit) {
        setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
      }
      setSending(true);

      try {
        const result = await draftsApi.chat(draftId, {
          message: userMessage,
          applyContent: false, // We let the user decide via the [Apply Edit] button
        });

        // Add AI reply
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: result.reply },
        ]);

        // If AI returned post content, show the Apply banner
        if (result.postContent) {
          setPendingEdit({
            content: result.postContent,
            charCount: result.charCount ?? result.postContent.length,
            explanation: result.changeExplanation,
          });
        }
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.status === 429
              ? "Token quota exceeded. You cannot send more AI messages."
              : err.message
            : "Failed to send message. Please try again.";
        setError(message);
        // Remove the optimistic user message on error (only if we added one)
        if (!isInit) {
          setMessages((prev) => prev.slice(0, -1));
        }
      } finally {
        setSending(false);
      }
    },
    [draftId, sending],
  );

  // Auto-init: trigger first-draft generation when content is empty and no history
  // Uses a ref guard to prevent double-firing in React StrictMode
  useEffect(() => {
    if (autoInit && !autoInitFiredRef.current) {
      autoInitFiredRef.current = true;
      void sendMessage("__INIT__");
    }
  }, [autoInit, sendMessage]);

  function handleApplyEdit() {
    if (!pendingEdit) return;
    onApplyEdit(pendingEdit.content);
    setPendingEdit(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="pb-2 mb-2 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          <span>✍️</span> AI Writing Partner
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Ask me to write, edit, refine, or shorten your post
        </p>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1" style={{ minHeight: 0 }}>
        {isEmpty && !sending && !autoInit && (
          <div className="text-center py-8">
            <div className="text-3xl mb-2">👋</div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Say <em>&ldquo;Write the first draft&rdquo;</em> to get started,
              or paste in a draft and ask me to improve it.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
              {[
                "Write the first draft",
                "Make it more punchy",
                "Shorten it",
                "Add a stronger hook",
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => void sendMessage(prompt)}
                  disabled={disabled}
                  className="text-xs bg-indigo-50 text-indigo-600 rounded-full px-3 py-1 hover:bg-indigo-100 transition-colors disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Auto-init loading state before first message arrives */}
        {isEmpty && sending && autoInit && (
          <div className="text-center py-8">
            <div className="text-3xl mb-2">✍️</div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Generating your first draft from the content brief…
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-sm"
                  : "bg-gray-100 text-gray-800 rounded-bl-sm",
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {sending && messages.length > 0 && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3 py-2">
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Apply Edit banner */}
        {pendingEdit && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
            <p className="text-xs font-semibold text-indigo-700 mb-1">
              ✨ AI updated the post
            </p>
            {pendingEdit.explanation && (
              <p className="text-xs text-indigo-600 mb-2">
                {pendingEdit.explanation}
              </p>
            )}
            <p className="text-xs text-gray-500 mb-2">
              {pendingEdit.charCount.toLocaleString()} chars
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 text-xs h-7" onClick={handleApplyEdit}>
                Apply Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 text-gray-500"
                onClick={() => setPendingEdit(null)}
              >
                Discard
              </Button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-red-500 text-center py-1">{error}</p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="pt-2 mt-2 border-t border-gray-100">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me to write, edit, or refine… (Enter to send)"
            disabled={sending || disabled}
            rows={2}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400 placeholder-gray-400 disabled:opacity-50"
          />
          <Button
            size="sm"
            onClick={() => void sendMessage(input)}
            disabled={!input.trim() || sending || disabled}
            className="shrink-0 h-[56px]"
          >
            {sending ? "…" : "Send"}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Shift+Enter for new line · Enter to send
        </p>
      </div>
    </div>
  );
}

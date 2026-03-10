"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PendingChangesCard } from "@/components/persona/PendingChangesCard";
import { PostInputCards } from "@/components/persona/PostInputCards";
import { PostBatchHistory } from "@/components/persona/PostBatchHistory";
import { PersonaDiffCard } from "@/components/persona/PersonaDiffCard";
import { personaChatApi, personaApi, feedbackApi, ApiError } from "@/lib/api";
import type {
  IUserPersona,
  IPersonaPendingChanges,
  IMessage,
  IPersonaDiff,
} from "@repo/shared-types";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PersonaChatResponse {
  reply: string;
  sessionId: string;
  pendingChanges?: IPersonaPendingChanges;
  changesApplied: boolean;
}

// ── Sanitize PERSONA_CHANGES markers from chat display ─────────────────────────
// The backend strips these, but old history or LLM format variations may leak through.

const PERSONA_CHANGES_DISPLAY_RE =
  /<!--?\s*PERSONA_CHANGES[\s\S]*?PERSONA_CHANGES\s*(?:-->|→|$)/g;

function sanitizeChatContent(text: string): string {
  return text.replace(PERSONA_CHANGES_DISPLAY_RE, "").trim();
}

// ── Chat bubble ────────────────────────────────────────────────────────────────

function ChatBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  const isUser = role === "user";
  const displayContent = isUser ? content : sanitizeChatContent(content);
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold mr-2 mt-0.5 shrink-0">
          AI
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-indigo-600 text-white rounded-br-sm"
            : "bg-gray-100 text-gray-800 rounded-bl-sm"
        }`}
      >
        {displayContent}
      </div>
    </div>
  );
}

// ── Persona display card ───────────────────────────────────────────────────────

function PersonaField({
  label,
  value,
}: {
  label: string;
  value: string | string[] | undefined;
}) {
  if (!value || (Array.isArray(value) && value.length === 0)) {
    return (
      <div className="py-2 border-b border-gray-100 last:border-0">
        <p className="text-xs font-medium text-gray-400">{label}</p>
        <p className="text-sm text-gray-300 italic">Not set</p>
      </div>
    );
  }
  return (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <p className="text-xs font-medium text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">
        {Array.isArray(value) ? value.join(", ") : value}
      </p>
    </div>
  );
}

// ── Main page (wrapped in Suspense for useSearchParams) ──────────────────────

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfilePageContent />
    </Suspense>
  );
}

function ProfilePageContent() {
  const [persona, setPersona] = useState<IUserPersona | null>(null);
  const [personaLoading, setPersonaLoading] = useState(true);

  const [messages, setMessages] = useState<IMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");

  const [pendingChanges, setPendingChanges] =
    useState<IPersonaPendingChanges | null>(null);
  const [applying, setApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState("");

  // Query param to auto-open add-posts section
  const searchParams = useSearchParams();
  const addPostsRef = useRef<HTMLDivElement>(null);
  const pendingChangesRef = useRef<HTMLDivElement>(null);

  // Add More Posts section
  const [showAddPosts, setShowAddPosts] = useState(false);
  const [addPostsLoading, setAddPostsLoading] = useState(false);
  const [addPostsResult, setAddPostsResult] = useState<{
    message: string;
    postsAdded: number;
    duplicatesSkipped: number;
  } | null>(null);
  const [addPostsError, setAddPostsError] = useState("");
  const [addPostsDiff, setAddPostsDiff] = useState<IPersonaDiff | null>(null);

  // Phase 4 #40: Feedback insights
  const [feedbackSummary, setFeedbackSummary] = useState<{
    totalFeedback: number;
    preferredTopics: string[];
    avoidTopics: string[];
    formatDistribution: Record<string, number>;
    averageRating: number;
  } | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load persona + history in parallel on mount.
  // Both calls go through the Next.js rewrite proxy (relative URLs) so the
  // httpOnly token cookie is always sent correctly in both dev and production.
  // Never use NEXT_PUBLIC_API_URL directly from the browser — that bypasses
  // the proxy and the cookie is never sent to a different domain → 401.
  useEffect(() => {
    personaChatApi
      .getHistory()
      .then(({ messages: hist, sessionId: sid }) => {
        setMessages(hist as IMessage[]);
        setSessionId(sid);
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));

    personaChatApi
      .getPersona()
      .then(({ persona: p }) => setPersona(p))
      .catch(() => {}) // persona stays null → "No persona found" message shown
      .finally(() => setPersonaLoading(false));

    // Phase 4 #40: Fetch feedback insights
    feedbackApi.getSummary().then(setFeedbackSummary).catch(() => {});
  }, []);

  // Auto-open and scroll to "Add More Posts" section when ?addPosts=true
  useEffect(() => {
    if (searchParams.get("addPosts") === "true" && !personaLoading) {
      setShowAddPosts(true);
      // Small delay to allow DOM to render the section
      setTimeout(() => {
        addPostsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [searchParams, personaLoading]);

  // Auto-scroll to PendingChangesCard when AI suggests profile changes
  useEffect(() => {
    if (pendingChanges && Object.keys(pendingChanges).length > 0) {
      // Small delay to allow the card to render in the DOM
      setTimeout(() => {
        pendingChangesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [pendingChanges]);

  // Auto-scroll — scroll only within the chat box, not the whole page.
  // We scroll the parent overflow-y-auto container, NOT the chatEndRef marker,
  // which was causing the entire page to jump to the bottom on every message.
  const chatContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setChatError("");
    const userMsg: IMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res: PersonaChatResponse = await personaChatApi.chat({
        message: text,
        sessionId: sessionId ?? undefined,
      });

      const assistantMsg: IMessage = {
        role: "assistant",
        content: res.reply,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setSessionId(res.sessionId);

      if (res.pendingChanges && Object.keys(res.pendingChanges).length > 0) {
        setPendingChanges(res.pendingChanges);
      }
    } catch (err) {
      setChatError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSending(false);
    }
  };

  const handleApplyChanges = async () => {
    if (!pendingChanges) return;
    setApplying(true);
    setApplySuccess("");

    try {
      const res = await personaChatApi.applyChanges({
        changes: pendingChanges,
      });
      setPersona(res.persona);
      setPendingChanges(null);
      setApplySuccess("Profile updated successfully! ✓");
      setTimeout(() => setApplySuccess(""), 3000);
    } catch (err) {
      setChatError(
        err instanceof ApiError ? err.message : "Failed to apply changes.",
      );
    } finally {
      setApplying(false);
    }
  };

  const handleAddPosts = async (postsArray: string[]) => {
    setAddPostsError("");
    setAddPostsResult(null);
    setAddPostsDiff(null);
    setAddPostsLoading(true);
    try {
      const res = await personaApi.addPosts({
        postsArray,
        mode: "incremental",
        source: "add-posts",
      });
      setPersona(res.persona);
      setAddPostsResult({
        message: res.message,
        postsAdded: res.postsAdded,
        duplicatesSkipped: res.duplicatesSkipped,
      });
      if (res.diff) setAddPostsDiff(res.diff);
      setShowAddPosts(false);
    } catch (err) {
      setAddPostsError(
        err instanceof ApiError
          ? err.message
          : "Failed to add posts. Please try again.",
      );
    } finally {
      setAddPostsLoading(false);
    }
  };

  const isReady = !historyLoading && !personaLoading;

  return (
    <main className="container max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Content Profile</h1>
          <p className="text-gray-500 text-sm mt-1">
            Chat with your AI strategy coach to refine your persona, goals, and
            content pillars.
          </p>
        </div>
        <Link
          href="/dashboard/profile/evolution"
          className="text-sm text-indigo-600 hover:underline font-medium"
        >
          View Evolution Timeline &rarr;
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Persona display — sticky + scrollable so it doesn't overflow the viewport */}
        <div className="lg:col-span-2 space-y-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
          <Card>
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span>👤</span> Current Persona
              </h2>

              {personaLoading ? (
                <div className="space-y-2 animate-pulse">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-8 bg-gray-100 rounded" />
                  ))}
                </div>
              ) : !persona ? (
                <p className="text-sm text-gray-400 italic">
                  No persona found. Complete onboarding first.
                </p>
              ) : (
                <div>
                  {/* Persona version + last updated badge */}
                  {(persona.personaVersion ||
                    persona.lastPostAddedAt ||
                    persona.updatedAt) && (
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                      {persona.personaVersion && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          Persona v{persona.personaVersion}
                        </span>
                      )}
                      {(persona.lastPostAddedAt ?? persona.updatedAt) && (
                        <span className="text-xs text-gray-400">
                          Updated{" "}
                          {new Date(
                            persona.lastPostAddedAt ?? persona.updatedAt!,
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      )}
                      {(persona.totalPostsAnalyzed ?? 0) > 0 && (
                        <span className="ml-auto text-xs text-gray-400">
                          {persona.totalPostsAnalyzed} posts
                        </span>
                      )}
                    </div>
                  )}
                  <PersonaField
                    label="Platform Goal"
                    value={persona.platformGoal}
                  />
                  <PersonaField label="Industry" value={persona.industry} />
                  <PersonaField
                    label="Professional Goals"
                    value={persona.goals}
                  />
                  <PersonaField
                    label="Target Audience"
                    value={persona.targetAudience}
                  />
                  <PersonaField
                    label="Content Pillars"
                    value={persona.contentPillars}
                  />
                  <PersonaField label="Topics" value={persona.topics} />
                  <PersonaField label="Tone" value={persona.tone} />
                  <PersonaField
                    label="Writing Style"
                    value={persona.writingStyle}
                  />
                  <PersonaField
                    label="Posting Frequency"
                    value={persona.postingFrequency}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add More Posts */}
          <div ref={addPostsRef}>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <span>📝</span> Add More Posts
                  </h2>
                  {persona && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {persona.totalPostsAnalyzed ??
                        persona.scrapedPosts?.length ??
                        0}{" "}
                      posts analyzed · v{persona.personaVersion ?? 1}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowAddPosts((s) => !s);
                    setAddPostsError("");
                    setAddPostsResult(null);
                    setAddPostsDiff(null);
                  }}
                  className="text-xs text-indigo-600 hover:underline font-medium"
                >
                  {showAddPosts ? "Cancel" : "+ Add posts"}
                </button>
              </div>

              {/* Success + diff (#28) */}
              {addPostsResult && !addPostsDiff && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700 mb-3">
                  {addPostsResult.message}
                  {addPostsResult.duplicatesSkipped > 0 && (
                    <span className="ml-1 text-xs text-green-600">
                      ({addPostsResult.duplicatesSkipped} duplicate
                      {addPostsResult.duplicatesSkipped !== 1 ? "s" : ""}{" "}
                      skipped)
                    </span>
                  )}
                </div>
              )}

              {/* Persona diff visualization (#28) */}
              {addPostsDiff && addPostsResult && (
                <PersonaDiffCard
                  diff={addPostsDiff}
                  postsAdded={addPostsResult.postsAdded}
                  className="mb-3"
                  onDismiss={() => setAddPostsDiff(null)}
                />
              )}

              {addPostsError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-3">
                  {addPostsError}
                </div>
              )}

              {showAddPosts && (
                <PostInputCards
                  onSubmit={handleAddPosts}
                  loading={addPostsLoading}
                  submitLabel="Add Posts to Persona"
                  maxPosts={20}
                  minCharsPerPost={30}
                />
              )}

              {!showAddPosts && !addPostsResult && (
                <p className="text-xs text-gray-400 mb-3">
                  Adding more posts improves accuracy. Duplicates are
                  automatically skipped.
                </p>
              )}

              {/* Batch history timeline (#20) */}
              {!showAddPosts &&
                persona &&
                (persona.postMetadata?.length ?? 0) > 0 && (
                  <PostBatchHistory
                    batches={persona.postMetadata}
                    totalPostsAnalyzed={persona.totalPostsAnalyzed}
                    className="mt-1"
                  />
                )}
            </CardContent>
          </Card>
          </div>

          {/* Phase 4 #40: Feedback Insights */}
          {feedbackSummary && feedbackSummary.totalFeedback >= 3 && (
            <Card>
              <CardContent className="p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span>📊</span> Feedback Insights
                </h2>

                {/* Average Rating */}
                {feedbackSummary.averageRating > 0 && (
                  <div className="flex items-center gap-3 mb-3 pb-3 border-b border-gray-100">
                    <div>
                      <p className="text-xs text-gray-500">Avg Rating</p>
                      <span className="text-xl font-bold text-indigo-600">
                        {feedbackSummary.averageRating.toFixed(1)}
                      </span>
                      <span className="text-xs text-gray-400 ml-0.5">/ 4.0</span>
                    </div>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          feedbackSummary.averageRating >= 3
                            ? "bg-green-500"
                            : feedbackSummary.averageRating >= 2
                              ? "bg-amber-400"
                              : "bg-red-400"
                        }`}
                        style={{
                          width: `${(feedbackSummary.averageRating / 4) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Preferred Topics */}
                {feedbackSummary.preferredTopics.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-gray-500 mb-1.5">
                      You love these topics
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {feedbackSummary.preferredTopics.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center rounded-full bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 text-[11px] font-medium"
                        >
                          {t.length > 35 ? t.slice(0, 35) + "…" : t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Topics to Avoid */}
                {feedbackSummary.avoidTopics.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-gray-500 mb-1.5">
                      Not interested in
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {feedbackSummary.avoidTopics.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center rounded-full bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 text-[11px] font-medium"
                        >
                          {t.length > 35 ? t.slice(0, 35) + "…" : t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Format Distribution */}
                {Object.keys(feedbackSummary.formatDistribution).length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1.5">
                      Format Preferences
                    </p>
                    <div className="space-y-1.5">
                      {Object.entries(feedbackSummary.formatDistribution)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
                        .map(([fmt, pct]) => (
                          <div key={fmt} className="flex items-center gap-2">
                            <span className="text-[11px] text-gray-600 w-20 truncate">
                              {fmt}
                            </span>
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-400 w-8 text-right">
                              {pct}%
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-gray-400 mt-3">
                  Based on {feedbackSummary.totalFeedback} feedback signals
                </p>
              </CardContent>
            </Card>
          )}

          {/* Apply success */}
          {applySuccess && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 font-medium">
              {applySuccess}
            </div>
          )}

          {/* Pending changes */}
          {pendingChanges && Object.keys(pendingChanges).length > 0 && (
            <div ref={pendingChangesRef}>
              <PendingChangesCard
                changes={pendingChanges}
                onApply={handleApplyChanges}
                onDiscard={() => setPendingChanges(null)}
                applying={applying}
              />
            </div>
          )}
        </div>

        {/* Right: Chat interface */}
        <div className="lg:col-span-3">
          <Card className="flex flex-col h-[600px]">
            {/* Chat header */}
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">
                💬 AI Strategy Coach
              </h2>
              <p className="text-xs text-gray-500">
                Chat to update your goals, pillars, tone, or any part of your
                profile
              </p>
            </div>

            {/* Messages — ref attached here so we scroll the container, not the page */}
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-5 py-4">
              {!isReady ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  Loading…
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
                  <div className="text-4xl">🧠</div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Start a conversation
                    </p>
                    <p className="text-xs text-gray-400 mt-1 max-w-xs">
                      Tell me what you&apos;d like to change about your content
                      strategy and I&apos;ll help refine your profile.
                    </p>
                  </div>
                  {/* Quick start prompts */}
                  <div className="flex flex-wrap gap-2 justify-center pt-2">
                    {[
                      "Change my content pillars",
                      "Update my target audience",
                      "Shift to lead generation focus",
                      "I want to post more video content",
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => setInput(prompt)}
                        className="text-xs rounded-full border border-gray-200 px-3 py-1 text-gray-600 hover:border-indigo-600 hover:text-indigo-600 transition-colors"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <ChatBubble key={i} role={msg.role} content={msg.content} />
                ))
              )}

              {sending && (
                <div className="flex justify-start mb-3">
                  <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold mr-2 mt-0.5 shrink-0">
                    AI
                  </div>
                  <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-gray-500">
                    <span className="inline-flex gap-1">
                      <span
                        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Error */}
            {chatError && (
              <div className="mx-4 mb-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {chatError}
              </div>
            )}

            {/* Input */}
            <div className="px-4 pb-4 pt-3 border-t border-gray-100 flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. I want to focus more on AI ethics content…"
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
                disabled={sending}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="shrink-0"
              >
                Send
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { suggestionsApi, ApiError } from "@/lib/api";
import type { IGenerateContextOptions, IMessage, SuggestionPlatform } from "@repo/shared-types";

type Mode = "profile" | "topic-focus" | "chat-refined";

// ── Platform option definitions ────────────────────────────────────────────────

const PLATFORM_OPTIONS: {
  value: SuggestionPlatform | "both";
  label: string;
  emoji: string;
  description: string;
}[] = [
  { value: "linkedin", label: "LinkedIn", emoji: "in", description: "Professional long-form posts" },
  { value: "twitter", label: "Twitter/X", emoji: "𝕏", description: "Tweets & threads (≤280 chars)" },
  { value: "both", label: "Both", emoji: "⊕", description: "Mix of LinkedIn + Twitter ideas" },
];

interface GenerateOptionsPanelProps {
  disabled?: boolean;
  onGenerate: (context: IGenerateContextOptions) => void;
  onCancel?: () => void;
}

// ── Chat bubble ───────────────────────────────────────────────────────────────

function ChatBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-indigo-600 text-white rounded-br-sm"
            : "bg-gray-100 text-gray-800 rounded-bl-sm"
        }`}
      >
        {content}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function GenerateOptionsPanel({
  disabled,
  onGenerate,
  onCancel,
}: GenerateOptionsPanelProps) {
  const [mode, setMode] = useState<Mode | null>(null);

  // Platform selector state (#35)
  const [selectedPlatform, setSelectedPlatform] = useState<SuggestionPlatform | "both">("linkedin");

  // Topic focus state
  const [topicFocus, setTopicFocus] = useState("");

  // Chat refinement state
  const [chatMessages, setChatMessages] = useState<IMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [refinedContext, setRefinedContext] = useState<{
    summary?: string;
    topicFocus?: string;
    targetAudienceOverride?: string;
    platformGoal?: string;
  } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Kick off the chat with a greeting from the assistant
  useEffect(() => {
    if (mode === "chat-refined" && chatMessages.length === 0) {
      setChatMessages([
        {
          role: "assistant",
          content:
            "Hi! I'll help you refine the focus for your next batch of content ideas. What topic or niche would you like to explore — or is there a specific audience or goal you have in mind?",
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [mode, chatMessages.length]);

  const handleChatSend = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    const userMsg: IMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await suggestionsApi.refineContext({
        messages: updatedMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      const assistantMsg: IMessage = {
        role: "assistant",
        content: res.reply,
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, assistantMsg]);

      if (res.summary) {
        setRefinedContext({
          summary: res.summary,
          topicFocus: res.topicFocus,
          targetAudienceOverride: res.targetAudienceOverride,
          platformGoal: res.platformGoal,
        });
      }
    } catch (err) {
      const errMsg: IMessage = {
        role: "assistant",
        content:
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, errMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  // Resolve SuggestionPlatform[] from the selector value
  function resolvePlatforms(): SuggestionPlatform[] {
    if (selectedPlatform === "both") return ["linkedin", "twitter"];
    return [selectedPlatform];
  }

  const handleGenerate = () => {
    const platforms = resolvePlatforms();
    if (mode === "profile") {
      onGenerate({ mode: "profile", platforms });
    } else if (mode === "topic-focus") {
      onGenerate({
        mode: "topic-focus",
        topicFocus: topicFocus.trim() || undefined,
        platforms,
      });
    } else if (mode === "chat-refined" && refinedContext) {
      onGenerate({
        mode: "chat-refined",
        chatRefinementContext: refinedContext.summary,
        topicFocus: refinedContext.topicFocus,
        targetAudienceOverride: refinedContext.targetAudienceOverride,
        platformGoal:
          refinedContext.platformGoal as IGenerateContextOptions["platformGoal"],
        platforms,
      });
    }
  };

  // ── Mode selection ──────────────────────────────────────────────────────────
  if (mode === null) {
    return (
      <Card>
        <CardContent className="p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1 text-center">
            How do you want to generate ideas?
          </h2>
          <p className="text-sm text-gray-500 text-center mb-6">
            Choose how to tailor this batch of content ideas.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <ModeCard
              icon="👤"
              title="Use My Profile"
              description="Generate ideas based on your full persona, goals, and content pillars."
              onClick={() => setMode("profile")}
              disabled={disabled}
            />
            <ModeCard
              icon="🎯"
              title="Focus on a Topic"
              description="Narrow in on a specific topic, niche, or theme for this batch."
              onClick={() => setMode("topic-focus")}
              disabled={disabled}
            />
            <ModeCard
              icon="💬"
              title="Chat to Refine"
              description="Chat with AI to refine your angle, audience, and tone before generating."
              onClick={() => setMode("chat-refined")}
              disabled={disabled}
            />
          </div>

          {/* Platform selector — shared across all modes (#35) */}
          <div className="mb-5">
            <PlatformSelector
              selected={selectedPlatform}
              onChange={setSelectedPlatform}
            />
          </div>

          {onCancel && (
            <div className="text-center">
              <button
                onClick={onCancel}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Profile mode — one click generate ──────────────────────────────────────
  if (mode === "profile") {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-4xl mb-3">👤</div>
          <h2 className="text-lg font-semibold mb-1">
            Generate from Your Profile
          </h2>
          <p className="text-sm text-gray-500 mb-5 max-w-sm mx-auto">
            We&apos;ll use your full persona — writing style, goals, content
            pillars, and trending topics in your niche.
          </p>
          <div className="mb-6">
            <PlatformSelector
              selected={selectedPlatform}
              onChange={setSelectedPlatform}
            />
          </div>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => setMode(null)}>
              ← Back
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={disabled}
              className="min-w-[200px]"
            >
              Generate Content Ideas →
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Topic focus mode ────────────────────────────────────────────────────────
  if (mode === "topic-focus") {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-4xl mb-3 text-center">🎯</div>
          <h2 className="text-lg font-semibold mb-1 text-center">
            Focus on a Specific Topic
          </h2>
          <p className="text-sm text-gray-500 text-center mb-5 max-w-sm mx-auto">
            All ideas in this batch will focus on the topic or niche you
            specify.
          </p>

          <div className="max-w-md mx-auto space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Topic / Niche Focus
              </label>
              <input
                type="text"
                value={topicFocus}
                onChange={(e) => setTopicFocus(e.target.value)}
                placeholder="e.g. AI in healthcare, B2B SaaS sales, remote team leadership…"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin focus:border-transparent"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && topicFocus.trim()) handleGenerate();
                }}
              />
            </div>
            <PlatformSelector
              selected={selectedPlatform}
              onChange={setSelectedPlatform}
            />
            <div className="flex gap-3 justify-center pt-2">
              <Button variant="outline" onClick={() => setMode(null)}>
                ← Back
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={disabled || !topicFocus.trim()}
                className="min-w-[200px]"
              >
                Generate Focused Ideas →
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Chat refinement mode ────────────────────────────────────────────────────
  return (
    <Card>
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              💬 Refine with AI
            </h2>
            <p className="text-xs text-gray-500">
              Chat to clarify your angle before generating
            </p>
          </div>
          <button
            onClick={() => setMode(null)}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            ← Back
          </button>
        </div>

        {/* Chat area */}
        <div className="px-4 py-4 h-64 overflow-y-auto">
          {chatMessages.map((msg, i) => (
            <ChatBubble key={i} role={msg.role} content={msg.content} />
          ))}
          {chatLoading && (
            <div className="flex justify-start mb-3">
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

        {/* Context gathered banner */}
        {refinedContext?.summary && (
          <div className="mx-4 mb-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
            <p className="text-xs font-semibold text-green-700 mb-0.5">
              ✓ Context gathered
            </p>
            <p className="text-xs text-green-600">{refinedContext.summary}</p>
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-4 flex gap-2 border-t border-gray-100 pt-3">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Type your message…"
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin focus:border-transparent"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleChatSend();
            }}
            disabled={chatLoading}
          />
          <Button
            size="sm"
            onClick={handleChatSend}
            disabled={!chatInput.trim() || chatLoading}
          >
            Send
          </Button>
        </div>

        {/* Generate button — shown when context is gathered */}
        {refinedContext?.summary && (
          <div className="px-4 pb-4">
            <Button
              className="w-full"
              onClick={handleGenerate}
              disabled={disabled}
            >
              Generate Ideas with This Context →
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Platform selector widget ───────────────────────────────────────────────────

function PlatformSelector({
  selected,
  onChange,
}: {
  selected: SuggestionPlatform | "both";
  onChange: (v: SuggestionPlatform | "both") => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-gray-600 text-center">Target platform</p>
      <div className="flex gap-2 justify-center">
        {PLATFORM_OPTIONS.map(({ value, label, emoji }) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors",
              selected === value
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-400",
            )}
          >
            <span className={cn("text-[10px] font-bold", selected === value ? "" : "opacity-60")}>
              {emoji}
            </span>
            {label}
          </button>
        ))}
      </div>
      {selected === "twitter" && (
        <p className="text-[10px] text-sky-600 text-center">
          Ideas will be tweet &amp; thread formats (≤280 chars per tweet)
        </p>
      )}
      {selected === "both" && (
        <p className="text-[10px] text-gray-500 text-center">
          ~50% LinkedIn ideas + ~50% Twitter/X ideas
        </p>
      )}
    </div>
  );
}

// ── Mode card ─────────────────────────────────────────────────────────────────

function ModeCard({
  icon,
  title,
  description,
  onClick,
  disabled,
}: {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-left rounded-xl border-2 p-5 transition-all duration-150 ${
        disabled
          ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
          : "border-gray-200 bg-white hover:border-indigo-600 hover:shadow-md cursor-pointer"
      }`}
    >
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="font-semibold text-gray-900 text-sm mb-1">{title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
    </button>
  );
}

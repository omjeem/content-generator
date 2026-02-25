"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { PostInputCards } from "@/components/persona/PostInputCards";
import { personaApi, onboardingApi, authApi, ApiError } from "@/lib/api";
import type { IMessage } from "@repo/shared-types";

type Step = "profile-input" | "interview" | "complete";

export default function OnboardingPage() {
  const router = useRouter();

  // User
  const [userName, setUserName] = useState("");

  // Step management
  const [step, setStep] = useState<Step>("profile-input");

  // Analyse state
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");

  // Interview chat
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [interviewComplete, setInterviewComplete] = useState(false);

  // Load current user + restore any existing session
  useEffect(() => {
    async function init() {
      try {
        const { user } = await authApi.me();
        setUserName(user.name);
      } catch {
        router.push("/login");
        return;
      }

      // Restore existing chat session
      try {
        const session = await onboardingApi.getSession();
        if (session.messages.length > 0) {
          setMessages(session.messages);
          setStep("interview");
        }
        if (session.interviewComplete) {
          setInterviewComplete(true);
          setStep("complete");
        }
      } catch {
        // No session yet — stay on profile-input step
      }
    }
    init();
  }, [router]);

  // Step 1: Analyze from pasted posts
  async function handleAnalyzePosts(postsArray: string[]) {
    setAnalyzeError("");
    setAnalyzeLoading(true);

    try {
      await personaApi.analyze({ postsArray });
      setStep("interview");

      // Send the first message to kick off the interview
      setChatLoading(true);
      const reply = await onboardingApi.chat({
        message: "Hi! I'm ready to set up my content strategy.",
      });
      setMessages([
        {
          role: "user",
          content: "Hi! I'm ready to set up my content strategy.",
          timestamp: new Date().toISOString(),
        },
        {
          role: "assistant",
          content: reply.reply,
          timestamp: new Date().toISOString(),
        },
      ]);
      setQuestionsAnswered(reply.questionsAnswered);
      setChatLoading(false);
    } catch (err) {
      setAnalyzeError(
        err instanceof ApiError
          ? err.message
          : "Analysis failed. Please try again.",
      );
    } finally {
      setAnalyzeLoading(false);
    }
  }

  // Step 2: Interview chat
  const handleChatSend = useCallback(async (message: string) => {
    const userMsg: IMessage = {
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setChatLoading(true);

    try {
      const reply = await onboardingApi.chat({ message });
      const assistantMsg: IMessage = {
        role: "assistant",
        content: reply.reply,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setQuestionsAnswered(reply.questionsAnswered);

      if (reply.interviewComplete) {
        setInterviewComplete(true);
        setStep("complete");
      }
    } catch (err) {
      const errorMsg: IMessage = {
        role: "assistant",
        content:
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }
  }, []);

  // ── Step labels ──────────────────────────────────────────────────────────────
  const stepLabels: Record<Step, string> = {
    "profile-input": "Paste Your Posts",
    interview: "Interview",
    complete: "Complete",
  };
  const stepKeys: Step[] = ["profile-input", "interview", "complete"];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar userName={userName} />

      <main className="flex-1 container max-w-3xl mx-auto px-4 py-8">
        {/* ── Progress indicator ─────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            {stepKeys.map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors
                  ${
                    step === s
                      ? "bg-indigo-600 text-white"
                      : s < step ||
                          (s === "complete" && interviewComplete)
                        ? "bg-green-500 text-white"
                        : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {s < step || (s === "complete" && interviewComplete)
                    ? "✓"
                    : i + 1}
                </div>
                {i < 2 && (
                  <div
                    className={`h-0.5 w-12 ${
                      step !== "profile-input" && i === 0
                        ? "bg-green-500"
                        : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-8 text-xs text-gray-500 ml-1">
            {stepKeys.map((s) => (
              <span
                key={s}
                className={
                  step === s
                    ? s === "complete"
                      ? "text-green-600 font-medium"
                      : "text-indigo-600 font-medium"
                    : ""
                }
              >
                {stepLabels[s]}
              </span>
            ))}
          </div>
        </div>

        {/* ── STEP 1: Paste Posts ───────────────────────────────────────── */}
        {step === "profile-input" && (
          <Card>
            <CardHeader>
              <CardTitle>Step 1: Paste Your LinkedIn Posts</CardTitle>
              <CardDescription>
                Copy and paste{" "}
                <span className="font-semibold text-gray-700">
                  at least 5–6 of your own posts
                </span>{" "}
                so the AI can understand your writing style, tone, and topics.
                The more you share, the more it sounds like you.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* tip banner */}
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
                <span className="text-lg mt-0.5">💡</span>
                <p className="text-sm text-amber-800 leading-relaxed">
                  <span className="font-semibold">Tip:</span> Paste posts you
                  have already published{" "}
                  <span className="font-medium">or</span> posts you wish you
                  had written — either works. The AI learns your preferred
                  style, not just what you&apos;ve done before. Minimum{" "}
                  <span className="font-semibold">5–6 posts</span> for best
                  results.
                </p>
              </div>

              {analyzeError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
                  {analyzeError}
                </div>
              )}

              <PostInputCards
                onSubmit={handleAnalyzePosts}
                loading={analyzeLoading}
                submitLabel="Analyse My Posts & Build My Persona →"
                maxPosts={20}
                minCharsPerPost={30}
              />
            </CardContent>
          </Card>
        )}

        {/* ── STEP 2: Interview Chat ─────────────────────────────────────── */}
        {step === "interview" && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">
                      Step 2: Strategy Interview
                    </h2>
                    <p className="text-sm text-gray-500">
                      Answer 5 quick questions to personalise your content
                      strategy
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-indigo-600">
                      {questionsAnswered}/5
                    </div>
                    <div className="text-xs text-gray-500">answered</div>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-3 h-1.5 rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                    style={{ width: `${(questionsAnswered / 5) * 100}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="flex flex-col" style={{ height: "520px" }}>
              <ChatInterface
                messages={messages}
                onSend={handleChatSend}
                loading={chatLoading}
                placeholder="Type your answer..."
              />
            </Card>
          </div>
        )}

        {/* ── STEP 3: Complete ───────────────────────────────────────────── */}
        {step === "complete" && (
          <Card>
            <CardContent className="p-10 text-center">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                You&apos;re all set!
              </h2>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                We&apos;ve built your AI persona from your posts and gathered
                your content strategy. Head to your dashboard to generate your
                first batch of personalised content ideas.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button size="lg" onClick={() => router.push("/dashboard")}>
                  Generate Content Ideas →
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setStep("profile-input")}
                >
                  Update Posts
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

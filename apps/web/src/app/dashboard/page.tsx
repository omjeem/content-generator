"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SuggestionCard } from "@/components/suggestions/SuggestionCard";
import { GenerateOptionsPanel } from "@/components/suggestions/GenerateOptionsPanel";
import { TrendBrowser } from "@/components/trends/TrendBrowser";
import { TopicBrowser } from "@/components/suggestions/TopicBrowser";
import type { TopicItem } from "@/components/suggestions/TopicBrowser";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { personaApi, suggestionsApi, trendsApi, tokenApi, feedbackApi, ApiError } from "@/lib/api";
import { startImplicitTracking } from "@/lib/implicitTracking";
import type {
  ISuggestion,
  IUserPersona,
  IGenerateContextOptions,
  ITokenUsageSummary,
  ITrendDiscoveryResponse,
} from "@repo/shared-types";

type GenerateState = "idle" | "choosing" | "loading" | "done" | "error";
type GenerateFlow = "one-shot" | "browse-trends" | "browse-topics";

const LOADING_STEPS = [
  "Analysing your LinkedIn persona\u2026",
  "Fetching trending topics in your niche\u2026",
  "Generating personalised content ideas\u2026",
  "Finalising your suggestions\u2026",
];

const TREND_LOADING_STEPS = [
  "Generating personalised content ideas from your selected trends\u2026",
  "Crafting hooks and angles tailored to your voice\u2026",
  "Finalising your suggestions\u2026",
];

const TOPIC_LOADING_STEPS = [
  "Generating content ideas for your selected topic\u2026",
  "Crafting unique angles and hooks\u2026",
  "Finalising your suggestions\u2026",
];

export default function DashboardPage() {
  const router = useRouter();

  const [persona, setPersona] = useState<IUserPersona | null>(null);
  const [personaLoading, setPersonaLoading] = useState(true);

  const [generateState, setGenerateState] = useState<GenerateState>("idle");
  const [generateFlow, setGenerateFlow] = useState<GenerateFlow>("one-shot");
  const [loadingStep, setLoadingStep] = useState(0);
  const [suggestions, setSuggestions] = useState<ISuggestion[]>([]);
  const [currentSuggestionSetId, setCurrentSuggestionSetId] = useState<string | null>(null);
  const [trendsUsed, setTrendsUsed] = useState<string[]>([]);
  const [trendSource, setTrendSource] = useState<"live" | "fallback" | null>(
    null,
  );
  const [generateError, setGenerateError] = useState("");
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<ITokenUsageSummary | null>(null);

  // Trend browsing state (Phase 3 #25)
  const [trendDiscovery, setTrendDiscovery] = useState<ITrendDiscoveryResponse | null>(null);
  const [trendBrowseLoading, setTrendBrowseLoading] = useState(false);
  const [trendGenerating, setTrendGenerating] = useState(false);

  // Topic browsing state (Phase 3 #33)
  const [topicIdeas, setTopicIdeas] = useState<TopicItem[]>([]);
  const [topicBrowseLoading, setTopicBrowseLoading] = useState(false);
  const [topicGenerating, setTopicGenerating] = useState(false);

  // Phase 4 #9: Cache last generation options for retry
  const [lastGenerationContext, setLastGenerationContext] = useState<IGenerateContextOptions | null>(null);

  // Phase 4 #43: Regenerate with tweaks
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenMoreLike, setRegenMoreLike] = useState<Set<number>>(new Set());
  const [regenDiffAngle, setRegenDiffAngle] = useState<Set<number>>(new Set());
  const [regenAvoid, setRegenAvoid] = useState("");
  const [regenLoading, setRegenLoading] = useState(false);

  // Phase 4 #39: Feedback summary state
  const [feedbackSummary, setFeedbackSummary] = useState<{
    totalFeedback: number;
    preferredTopics: string[];
    avoidTopics: string[];
    formatDistribution: Record<string, number>;
    averageRating: number;
  } | null>(null);

  // Load persona + token quota on mount
  useEffect(() => {
    personaApi
      .get()
      .then(({ persona }) => setPersona(persona))
      .catch(() => setPersona(null))
      .finally(() => setPersonaLoading(false));

    // Check quota upfront so the UI can block generation before even trying
    tokenApi.getUsage().then((usage) => {
      setTokenUsage(usage);
      if (!usage.allowed) setQuotaExceeded(true);
    }).catch(() => {}); // non-fatal — only blocks UX if we have data

    // Phase 4 #37: Start implicit signal tracking
    startImplicitTracking();

    // Phase 4 #39: Fetch feedback summary for dashboard card
    feedbackApi.getSummary().then(setFeedbackSummary).catch(() => {});
  }, []);

  // Cycle through loading step messages while generating
  useEffect(() => {
    if (generateState !== "loading") return;
    setLoadingStep(0);
    const steps = generateFlow === "browse-trends" ? TREND_LOADING_STEPS : generateFlow === "browse-topics" ? TOPIC_LOADING_STEPS : LOADING_STEPS;
    const interval = setInterval(() => {
      setLoadingStep((s) => (s + 1) % steps.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [generateState, generateFlow]);

  // Quick generate (existing one-shot flow)
  const handleGenerate = useCallback(
    async (context: IGenerateContextOptions) => {
      // Phase 4 #9: Cache options for retry
      setLastGenerationContext(context);
      setGenerateError("");
      setGenerateState("loading");
      setGenerateFlow("one-shot");
      setSuggestions([]);

      // Phase 4 #10: Re-check token quota before each generation
      try {
        const freshQuota = await tokenApi.getUsage();
        setTokenUsage(freshQuota);
        if (!freshQuota.allowed) {
          setQuotaExceeded(true);
          setGenerateState("idle");
          return;
        }
      } catch {
        // Non-fatal — proceed if quota check fails
      }

      try {
        const result = await suggestionsApi.generate({ context });
        setSuggestions(result.suggestions);
        setCurrentSuggestionSetId(result.id);
        setTrendsUsed(result.trendsUsed);
        setTrendSource(result.trendSource ?? "live");
        setGenerateState("done");
        // Refresh quota after a successful generation
        tokenApi.getUsage().then((u) => { setTokenUsage(u); if (!u.allowed) setQuotaExceeded(true); }).catch(() => {});
      } catch (err) {
        if (err instanceof ApiError && err.status === 400) {
          router.push("/onboarding");
          return;
        }
        if (err instanceof ApiError && err.status === 429) {
          setQuotaExceeded(true);
          setGenerateState("idle");
          return;
        }
        setGenerateError(
          err instanceof ApiError
            ? err.message
            : "Generation failed. Please try again.",
        );
        setGenerateState("error");
      }
    },
    [router],
  );

  // Browse Trends flow — Step 1: fetch discoverable trends
  const handleBrowseTrends = useCallback(async () => {
    setTrendBrowseLoading(true);
    setGenerateError("");
    setGenerateFlow("browse-trends");
    try {
      const discovery = await trendsApi.discover();
      setTrendDiscovery(discovery);
      setGenerateState("choosing");
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setQuotaExceeded(true);
        return;
      }
      setGenerateError(
        err instanceof ApiError
          ? err.message
          : "Failed to fetch trends. Please try again.",
      );
      setGenerateState("error");
    } finally {
      setTrendBrowseLoading(false);
    }
  }, []);

  // Browse Trends flow — Step 2: generate from selected trends
  const handleGenerateFromTrends = useCallback(
    async (selectedTrendIds: string[]) => {
      setGenerateError("");
      setTrendGenerating(true);
      setGenerateState("loading");
      setSuggestions([]);

      try {
        const result = await suggestionsApi.generateFromTrends(selectedTrendIds);
        setSuggestions(result.suggestions);
        setCurrentSuggestionSetId(result.id);
        setTrendsUsed(result.trendsUsed);
        setTrendSource(result.trendSource ?? "live");
        setGenerateState("done");
        tokenApi.getUsage().then((u) => { setTokenUsage(u); if (!u.allowed) setQuotaExceeded(true); }).catch(() => {});
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          setQuotaExceeded(true);
          setGenerateState("idle");
          return;
        }
        setGenerateError(
          err instanceof ApiError
            ? err.message
            : "Generation failed. Please try again.",
        );
        setGenerateState("error");
      } finally {
        setTrendGenerating(false);
      }
    },
    [],
  );

  // Browse Topics flow — Step 1: fetch AI-suggested topics from persona
  const handleBrowseTopics = useCallback(async () => {
    setTopicBrowseLoading(true);
    setGenerateError("");
    setGenerateFlow("browse-topics");
    try {
      const res = await suggestionsApi.getTopicIdeas();
      setTopicIdeas(res.topics as TopicItem[]);
      setGenerateState("choosing");
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setQuotaExceeded(true);
        return;
      }
      setGenerateError(
        err instanceof ApiError
          ? err.message
          : "Failed to fetch topic suggestions. Please try again.",
      );
      setGenerateState("error");
    } finally {
      setTopicBrowseLoading(false);
    }
  }, []);

  // Browse Topics flow — Step 2: generate from selected topic
  const handleGenerateFromTopic = useCallback(
    async (topicId: string, topicTitle: string) => {
      setGenerateError("");
      setTopicGenerating(true);
      setGenerateState("loading");
      setSuggestions([]);

      try {
        const result = await suggestionsApi.generateFromTopic(topicId, topicTitle);
        setSuggestions(result.suggestions);
        setCurrentSuggestionSetId(result.id);
        setTrendsUsed(result.trendsUsed);
        setTrendSource(result.trendSource ?? "fallback");
        setGenerateState("done");
        tokenApi.getUsage().then((u) => { setTokenUsage(u); if (!u.allowed) setQuotaExceeded(true); }).catch(() => {});
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          setQuotaExceeded(true);
          setGenerateState("idle");
          return;
        }
        setGenerateError(
          err instanceof ApiError
            ? err.message
            : "Generation failed. Please try again.",
        );
        setGenerateState("error");
      } finally {
        setTopicGenerating(false);
      }
    },
    [],
  );

  // Reset to idle
  const handleReset = useCallback(() => {
    setGenerateState("idle");
    setGenerateFlow("one-shot");
    setTrendDiscovery(null);
    setTrendGenerating(false);
    setTopicIdeas([]);
    setTopicGenerating(false);
    setRegenOpen(false);
    setRegenMoreLike(new Set());
    setRegenDiffAngle(new Set());
    setRegenAvoid("");
  }, []);

  // Phase 4 #43: Regenerate with tweaks
  const handleRegenerate = useCallback(async () => {
    if (!currentSuggestionSetId) return;
    setRegenLoading(true);
    setGenerateError("");

    try {
      const result = await suggestionsApi.regenerate(currentSuggestionSetId, {
        moreLike: regenMoreLike.size > 0 ? Array.from(regenMoreLike) : undefined,
        differentAngle: regenDiffAngle.size > 0 ? Array.from(regenDiffAngle) : undefined,
        avoid: regenAvoid.trim() || undefined,
      });
      setSuggestions(result.suggestions);
      setCurrentSuggestionSetId(result.id);
      setTrendsUsed(result.trendsUsed);
      setTrendSource(result.trendSource ?? "live");
      setRegenOpen(false);
      setRegenMoreLike(new Set());
      setRegenDiffAngle(new Set());
      setRegenAvoid("");
      // Refresh quota
      tokenApi.getUsage().then((u) => { setTokenUsage(u); if (!u.allowed) setQuotaExceeded(true); }).catch(() => {});
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setQuotaExceeded(true);
        return;
      }
      setGenerateError(
        err instanceof ApiError ? err.message : "Regeneration failed. Please try again.",
      );
    } finally {
      setRegenLoading(false);
    }
  }, [currentSuggestionSetId, regenMoreLike, regenDiffAngle, regenAvoid]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const interviewComplete = persona?.interviewComplete ?? false;
  const personaReady = !personaLoading && persona !== null;
  const currentLoadingSteps = generateFlow === "browse-trends" ? TREND_LOADING_STEPS : generateFlow === "browse-topics" ? TOPIC_LOADING_STEPS : LOADING_STEPS;

  return (
    <main className="container max-w-5xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Content Dashboard
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Generate AI-powered LinkedIn post ideas tailored to your voice
          </p>
        </div>
        <Link
          href="/dashboard/suggestions"
          className="text-sm text-indigo-600 hover:underline font-medium"
        >
          View History →
        </Link>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatusCard
          label="Profile Analysis"
          value={personaLoading ? "\u2026" : persona ? "Complete" : "Pending"}
          ok={personaReady && persona !== null}
          pending={personaLoading}
          action={
            !personaLoading && !persona
              ? { label: "Set up profile", href: "/onboarding" }
              : undefined
          }
        />
        <StatusCard
          label="Strategy Interview"
          value={
            personaLoading ? "\u2026" : interviewComplete ? "Complete" : "Pending"
          }
          ok={interviewComplete}
          pending={personaLoading}
          action={
            !personaLoading && !interviewComplete
              ? { label: "Finish interview", href: "/onboarding" }
              : undefined
          }
        />
        <StatusCard
          label="Content Pillars"
          value={
            personaLoading
              ? "\u2026"
              : persona?.contentPillars?.length
                ? persona.contentPillars.slice(0, 2).join(", ")
                : "Not set"
          }
          ok={!!persona?.contentPillars?.length}
          pending={personaLoading}
        />
      </div>

      {/* Quick nav + token usage */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/profile"
            className="text-xs text-indigo-600 hover:underline font-medium flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
            </svg>
            View Profile
          </Link>
          <Link
            href="/dashboard/posts"
            className="text-xs text-indigo-600 hover:underline font-medium flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
            </svg>
            My Drafts
          </Link>
        </div>

        {/* Token usage mini-bar */}
        {tokenUsage && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Tokens:</span>
            <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  tokenUsage.tokensUsed / tokenUsage.tokenLimit > 0.9
                    ? "bg-red-500"
                    : tokenUsage.tokensUsed / tokenUsage.tokenLimit > 0.7
                      ? "bg-amber-400"
                      : "bg-green-500"
                }`}
                style={{ width: `${Math.min(100, (tokenUsage.tokensUsed / tokenUsage.tokenLimit) * 100)}%` }}
              />
            </div>
            <span className="font-medium">
              {Math.round((tokenUsage.tokensUsed / tokenUsage.tokenLimit) * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* ── Confidence score badge (Phase 4 #25) ───────────────────────── */}
      {persona?.confidenceScore && (
        <div data-tour="confidence-score" className="mb-6 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-600">
              We understand you
            </span>
            <span className={`text-lg font-bold ${
              persona.confidenceScore.overall >= 70
                ? "text-green-600"
                : persona.confidenceScore.overall >= 40
                  ? "text-amber-600"
                  : "text-red-500"
            }`}>
              {persona.confidenceScore.overall}%
            </span>
          </div>
          <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                persona.confidenceScore.overall >= 70
                  ? "bg-green-500"
                  : persona.confidenceScore.overall >= 40
                    ? "bg-amber-400"
                    : "bg-red-400"
              }`}
              style={{ width: `${persona.confidenceScore.overall}%` }}
            />
          </div>
          {persona.confidenceScore.overall < 40 ? (
            <Link
              href="/dashboard/profile?addPosts=true"
              className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline whitespace-nowrap font-medium"
            >
              Add more posts to improve →
            </Link>
          ) : (
            <span className="text-xs text-gray-500 whitespace-nowrap">
              {persona.confidenceScore.overall < 70
                ? "Good — keep providing feedback"
                : "Excellent — highly personalized"}
            </span>
          )}
        </div>
      )}

      {/* ── Feedback Summary Card — Phase 4 #39 ──────────────────────────── */}
      {feedbackSummary && feedbackSummary.totalFeedback >= 3 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <span>🧠</span> What We&apos;ve Learned About You
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Preferred Topics */}
            {feedbackSummary.preferredTopics.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                  Preferred Topics
                </p>
                <div className="flex flex-wrap gap-1">
                  {feedbackSummary.preferredTopics.map((topic) => (
                    <span
                      key={topic}
                      className="inline-flex items-center rounded-full bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 text-[11px] font-medium"
                    >
                      {topic.length > 30 ? topic.slice(0, 30) + "…" : topic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Format Preferences */}
            {Object.keys(feedbackSummary.formatDistribution).length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                  Format Mix
                </p>
                <div className="space-y-1">
                  {Object.entries(feedbackSummary.formatDistribution)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4)
                    .map(([fmt, pct]) => (
                      <div key={fmt} className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-gray-600 w-24 text-right">
                          {fmt} ({pct}%)
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Rating + Avoid */}
            <div>
              {feedbackSummary.averageRating > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Avg Rating
                  </p>
                  <span className="text-lg font-bold text-indigo-600">
                    {feedbackSummary.averageRating.toFixed(1)}
                  </span>
                  <span className="text-xs text-gray-400 ml-1">/ 4.0</span>
                </div>
              )}
              {feedbackSummary.avoidTopics.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Topics to Avoid
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {feedbackSummary.avoidTopics.map((topic) => (
                      <span
                        key={topic}
                        className="inline-flex items-center rounded-full bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 text-[11px] font-medium"
                      >
                        {topic.length > 25 ? topic.slice(0, 25) + "…" : topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            Based on {feedbackSummary.totalFeedback} feedback signals
          </p>
        </div>
      )}

      {/* ── Token quota exhausted banner ──────────────────────────────────── */}
      {quotaExceeded && (
        <div className="mb-6 flex items-start gap-4 rounded-xl border border-red-200 bg-red-50 p-5">
          <span className="text-2xl leading-none">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-red-800">Token quota exhausted</p>
            <p className="text-sm text-red-700 mt-1">
              You have used{" "}
              <span className="font-medium">
                {tokenUsage
                  ? `${tokenUsage.tokensUsed.toLocaleString()} / ${tokenUsage.tokenLimit.toLocaleString()}`
                  : "all available"}
              </span>{" "}
              tokens. AI operations are blocked until your limit is increased.
            </p>
            <p className="text-sm text-red-600 mt-2">
              Go to{" "}
              <Link
                href="/dashboard/usage"
                className="font-medium underline underline-offset-2"
              >
                Token Usage
              </Link>{" "}
              to request a limit increase.
            </p>
          </div>
        </div>
      )}

      {/* Generate section */}
      {generateState !== "done" && (
        <div data-tour="generate-section" className="mb-8">
          {/* Idle — show two generation options */}
          {generateState === "idle" && (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  {!personaReady
                    ? "Loading your profile\u2026"
                    : !interviewComplete
                      ? "Complete your strategy interview first to unlock content generation."
                      : "Choose how you'd like to generate content ideas."}
                </p>
                {generateError && (
                  <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {generateError}
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button
                    size="lg"
                    onClick={() => {
                      setGenerateFlow("one-shot");
                      setGenerateState("choosing");
                    }}
                    disabled={!interviewComplete || personaLoading || quotaExceeded}
                    className="min-w-[200px]"
                  >
                    Quick Generate
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleBrowseTrends}
                    disabled={!interviewComplete || personaLoading || quotaExceeded || trendBrowseLoading}
                    className="min-w-[200px]"
                  >
                    {trendBrowseLoading ? "Fetching Trends\u2026" : "Browse Trends First"}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleBrowseTopics}
                    disabled={!interviewComplete || personaLoading || quotaExceeded || topicBrowseLoading}
                    className="min-w-[200px]"
                  >
                    {topicBrowseLoading ? "Fetching Topics\u2026" : "AI Topic Suggestions"}
                  </Button>
                </div>
                {!interviewComplete && personaReady && (
                  <p className="mt-3 text-sm text-gray-500">
                    <Link
                      href="/onboarding"
                      className="text-indigo-600 hover:underline"
                    >
                      Complete your onboarding
                    </Link>{" "}
                    first.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Choosing — either quick generate options panel OR trend browser */}
          {generateState === "choosing" && generateFlow === "one-shot" && (
            <GenerateOptionsPanel
              disabled={!interviewComplete || personaLoading}
              onGenerate={handleGenerate}
              onCancel={handleReset}
            />
          )}

          {generateState === "choosing" && generateFlow === "browse-trends" && trendDiscovery && (
            <TrendBrowser
              discovery={trendDiscovery}
              loading={trendGenerating}
              onGenerate={handleGenerateFromTrends}
              onRefresh={handleBrowseTrends}
              onCancel={handleReset}
            />
          )}

          {generateState === "choosing" && generateFlow === "browse-topics" && topicIdeas.length > 0 && (
            <TopicBrowser
              topics={topicIdeas}
              loading={topicGenerating}
              onSelect={handleGenerateFromTopic}
              onRefresh={handleBrowseTopics}
              onCancel={handleReset}
            />
          )}

          {/* Loading */}
          {generateState === "loading" && (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="space-y-4">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600/10 mb-2">
                    <svg className="w-7 h-7 text-indigo-600 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                  <p className="text-gray-700 font-medium">
                    {currentLoadingSteps[loadingStep % currentLoadingSteps.length]}
                  </p>
                  <div className="mx-auto max-w-xs h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                      style={{ width: `${((loadingStep + 1) / currentLoadingSteps.length) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    This takes 10&ndash;20 seconds
                  </p>
                </div>

                {/* Skeleton preview of upcoming cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-4 animate-pulse">
                      <div className="h-3 w-16 bg-gray-200 rounded mb-3" />
                      <div className="h-5 w-full bg-gray-200 rounded mb-2" />
                      <div className="h-3 w-3/4 bg-gray-200 rounded mb-1" />
                      <div className="h-3 w-1/2 bg-gray-200 rounded" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error — Phase 4 #9: includes "Retry with same options" button */}
          {generateState === "error" && (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-red-600 mb-4">
                  {generateError || "Something went wrong."}
                </p>
                <div className="flex gap-3 justify-center">
                  <Button
                    variant="outline"
                    onClick={handleReset}
                  >
                    Cancel
                  </Button>
                  {lastGenerationContext && (
                    <Button
                      onClick={() => void handleGenerate(lastGenerationContext)}
                    >
                      Retry with Same Options
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => setGenerateState("idle")}
                  >
                    Change Options
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Results */}
      {generateState === "done" && suggestions.length > 0 && (
        <div className="space-y-6">
          {/* Trends used */}
          {trendsUsed.length > 0 && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Live / Fallback badge (#34) */}
                {trendSource === "live" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    Live trends
                  </span>
                ) : trendSource === "fallback" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                    Evergreen topics
                  </span>
                ) : null}
                <p className="text-sm text-blue-700 min-w-0">
                  <span className="font-medium">Trending topics used: </span>
                  {trendsUsed.slice(0, 5).join(", ")}
                  {trendsUsed.length > 5
                    ? ` +${trendsUsed.length - 5} more`
                    : ""}
                </p>
              </div>
            </div>
          )}

          {/* Suggestion cards */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {suggestions.length} Content Ideas
            </h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRegenOpen((o) => !o)}
                disabled={regenLoading || quotaExceeded}
              >
                {regenOpen ? "Cancel Tweaks" : "Regenerate with Tweaks"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
              >
                + Generate New
              </Button>
            </div>
          </div>

          {/* Phase 4 #43: Regenerate with tweaks panel */}
          {regenOpen && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">
                Refine Your Next Batch
              </h3>
              <p className="text-xs text-gray-500">
                Select ideas you want more of, ideas to take in a different direction, or topics to avoid.
              </p>

              {/* More Like / Different Angle selectors */}
              <div className="space-y-2">
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                  >
                    <span className="text-xs text-gray-400 w-5 shrink-0">
                      #{i + 1}
                    </span>
                    <p className="flex-1 text-sm text-gray-700 truncate">
                      {s.hook}
                    </p>
                    <button
                      onClick={() => {
                        setRegenMoreLike((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i); else next.add(i);
                          return next;
                        });
                        // Remove from diffAngle if selected
                        setRegenDiffAngle((prev) => {
                          const next = new Set(prev);
                          next.delete(i);
                          return next;
                        });
                      }}
                      className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                        regenMoreLike.has(i)
                          ? "bg-green-600 text-white border-green-600"
                          : "bg-white text-gray-600 border-gray-200 hover:border-green-400"
                      }`}
                    >
                      More like this
                    </button>
                    <button
                      onClick={() => {
                        setRegenDiffAngle((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i); else next.add(i);
                          return next;
                        });
                        // Remove from moreLike if selected
                        setRegenMoreLike((prev) => {
                          const next = new Set(prev);
                          next.delete(i);
                          return next;
                        });
                      }}
                      className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                        regenDiffAngle.has(i)
                          ? "bg-amber-600 text-white border-amber-600"
                          : "bg-white text-gray-600 border-gray-200 hover:border-amber-400"
                      }`}
                    >
                      Different angle
                    </button>
                  </div>
                ))}
              </div>

              {/* Avoid text */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Topics / angles to avoid (optional)
                </label>
                <input
                  type="text"
                  value={regenAvoid}
                  onChange={(e) => setRegenAvoid(e.target.value)}
                  placeholder="e.g. generic advice, hiring posts..."
                  className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  maxLength={300}
                />
              </div>

              {/* Selection summary */}
              <div className="flex items-center gap-4 text-xs text-gray-500">
                {regenMoreLike.size > 0 && (
                  <span className="text-green-600 font-medium">
                    {regenMoreLike.size} &ldquo;more like&rdquo;
                  </span>
                )}
                {regenDiffAngle.size > 0 && (
                  <span className="text-amber-600 font-medium">
                    {regenDiffAngle.size} &ldquo;different angle&rdquo;
                  </span>
                )}
                {regenAvoid.trim() && (
                  <span className="text-red-500 font-medium">Avoiding topics</span>
                )}
              </div>

              {/* Submit */}
              <Button
                onClick={() => void handleRegenerate()}
                disabled={
                  regenLoading ||
                  (regenMoreLike.size === 0 &&
                    regenDiffAngle.size === 0 &&
                    !regenAvoid.trim())
                }
                className="w-full"
              >
                {regenLoading
                  ? "Regenerating..."
                  : "Regenerate Ideas"}
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {suggestions.map((s, i) => (
              <SuggestionCard
                key={String(s.hook ?? i)}
                suggestion={s}
                index={i}
                suggestionSetId={currentSuggestionSetId ?? undefined}
              />
            ))}
          </div>

          <div className="text-center pt-4">
            <Link
              href="/dashboard/suggestions"
              className="text-sm text-indigo-600 hover:underline"
            >
              View all past suggestion sets &rarr;
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusCard({
  label,
  value,
  ok,
  pending,
  action,
}: {
  label: string;
  value: string;
  ok: boolean;
  pending: boolean;
  action?: { label: string; href: string };
}) {
  return (
    <Card>
      <CardContent className="p-4">
        {pending ? (
          /* Skeleton loader */
          <div className="animate-pulse space-y-2">
            <div className="h-3 w-24 bg-gray-200 rounded" />
            <div className="h-5 w-32 bg-gray-200 rounded" />
          </div>
        ) : (
          <>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              {label}
            </p>
            <div className="flex items-center gap-2">
              {/* SVG icon instead of Unicode */}
              {ok ? (
                <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
              )}
              <span
                className={`text-sm font-medium ${ok ? "text-gray-900" : "text-gray-500"}`}
              >
                {value}
              </span>
            </div>
            {action && (
              <Link
                href={action.href}
                className="mt-2 block text-xs text-indigo-600 hover:underline"
              >
                {action.label} &rarr;
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

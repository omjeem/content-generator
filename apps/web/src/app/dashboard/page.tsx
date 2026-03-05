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
import { personaApi, suggestionsApi, trendsApi, tokenApi, ApiError } from "@/lib/api";
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
  }, []);

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

      {/* ── Confidence score badge (Phase 4 #25) ───────────────────────── */}
      {persona?.confidenceScore && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3">
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
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {persona.confidenceScore.overall < 40
              ? "Add more posts to improve"
              : persona.confidenceScore.overall < 70
                ? "Good — keep providing feedback"
                : "Excellent — highly personalized"}
          </span>
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
        <div className="mb-8">
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
                    <span className="text-2xl animate-spin">⚙️</span>
                  </div>
                  <p className="text-gray-700 font-medium">
                    {currentLoadingSteps[loadingStep % currentLoadingSteps.length]}
                  </p>
                  <div className="mx-auto max-w-xs h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full animate-pulse"
                      style={{ width: "60%" }}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    This takes 10–20 seconds
                  </p>
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
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
            >
              + Generate New
            </Button>
          </div>

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
              View all past suggestion sets →
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
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
          {label}
        </p>
        <div className="flex items-center gap-2">
          <span
            className={`text-lg ${pending ? "text-gray-300" : ok ? "text-green-500" : "text-amber-400"}`}
          >
            {pending ? "○" : ok ? "✓" : "!"}
          </span>
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
            {action.label} →
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

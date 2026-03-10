"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { personaApi, suggestionsApi, feedbackApi } from "@/lib/api";

// ── Tour Step Configuration ─────────────────────────────────────────────────

interface TourStep {
  /** Unique key for tracking completion */
  id: string;
  /** CSS selector for the target element to highlight */
  target: string;
  /** Short title */
  title: string;
  /** Description shown in the popover */
  description: string;
  /** Which page this step applies to (pathname prefix) */
  page: string;
  /** Placement of the popover relative to target */
  placement: "top" | "bottom" | "left" | "right";
  /** Emoji icon for the step */
  icon: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "confidence-score",
    target: "[data-tour='confidence-score']",
    title: "Persona Confidence",
    description:
      "This shows how well the AI understands your writing style. Add more posts and give feedback to increase it!",
    page: "/dashboard",
    placement: "bottom",
    icon: "📊",
  },
  {
    id: "generate-section",
    target: "[data-tour='generate-section']",
    title: "Generate Content Ideas",
    description:
      "Choose from Quick Generate, Browse Trends, or AI Topic Suggestions to create personalized content ideas.",
    page: "/dashboard",
    placement: "top",
    icon: "✨",
  },
  {
    id: "nav-profile",
    target: "[data-tour='nav-profile']",
    title: "Your Profile",
    description:
      "View your persona, add more posts to improve accuracy, and chat with AI to refine your profile.",
    page: "/dashboard",
    placement: "bottom",
    icon: "👤",
  },
  {
    id: "nav-history",
    target: "[data-tour='nav-history']",
    title: "Suggestion History",
    description:
      "All your previously generated content ideas are saved here. Rate them to help the AI learn!",
    page: "/dashboard",
    placement: "bottom",
    icon: "📋",
  },
  {
    id: "nav-posts",
    target: "[data-tour='nav-posts']",
    title: "Your Drafts",
    description:
      "Posts you've started writing live here. Click 'Write This Post' on any suggestion to create a draft.",
    page: "/dashboard",
    placement: "bottom",
    icon: "📝",
  },
];

const TOUR_STORAGE_KEY = "postmind-tour-completed";
const TOUR_DISMISSED_KEY = "postmind-tour-dismissed";

// ── Usage Signals ───────────────────────────────────────────────────────────
// Maps step IDs to the features they represent. If a feature has been used,
// the step is auto-skipped even if the user never saw the tour popup.

interface UsageSignals {
  hasPersona: boolean;
  hasHighConfidence: boolean;
  hasGeneratedSuggestions: boolean;
  hasFeedback: boolean;
}

/** Determine which steps are already "known" based on actual usage */
function getUsageSkippedSteps(signals: UsageSignals): Set<string> {
  const skipped = new Set<string>();

  // If user has a persona with a confidence score, they understand the badge
  if (signals.hasHighConfidence) {
    skipped.add("confidence-score");
  }

  // If user has generated suggestions before, they know how to generate
  if (signals.hasGeneratedSuggestions) {
    skipped.add("generate-section");
  }

  // If user has given feedback, they've navigated history & used suggestions
  if (signals.hasFeedback) {
    skipped.add("nav-history");
  }

  // If user has generated suggestions, they likely saw the generate UI and
  // suggestion cards which show the "Write This Post" button
  if (signals.hasGeneratedSuggestions && signals.hasFeedback) {
    skipped.add("nav-posts");
  }

  // If confidence >= 40, they've been actively using profile features
  if (signals.hasHighConfidence) {
    skipped.add("nav-profile");
  }

  return skipped;
}

// ── LocalStorage Helpers ────────────────────────────────────────────────────

function getCompletedSteps(): Set<string> {
  try {
    const raw = localStorage.getItem(TOUR_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markStepCompleted(stepId: string) {
  const completed = getCompletedSteps();
  completed.add(stepId);
  localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(Array.from(completed)));
}

function isTourDismissed(): boolean {
  try {
    return localStorage.getItem(TOUR_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function dismissTour() {
  localStorage.setItem(TOUR_DISMISSED_KEY, "true");
}

// ── Popover Position Calculation ────────────────────────────────────────────

interface PopoverPosition {
  top: number;
  left: number;
  arrowSide: "top" | "bottom" | "left" | "right";
}

function calculatePosition(
  targetRect: DOMRect,
  placement: TourStep["placement"],
  popoverWidth: number,
  popoverHeight: number,
): PopoverPosition {
  const gap = 12;
  let top = 0;
  let left = 0;

  switch (placement) {
    case "bottom":
      top = targetRect.bottom + gap;
      left = targetRect.left + targetRect.width / 2 - popoverWidth / 2;
      break;
    case "top":
      top = targetRect.top - popoverHeight - gap;
      left = targetRect.left + targetRect.width / 2 - popoverWidth / 2;
      break;
    case "left":
      top = targetRect.top + targetRect.height / 2 - popoverHeight / 2;
      left = targetRect.left - popoverWidth - gap;
      break;
    case "right":
      top = targetRect.top + targetRect.height / 2 - popoverHeight / 2;
      left = targetRect.right + gap;
      break;
  }

  // Clamp to viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  left = Math.max(12, Math.min(left, vw - popoverWidth - 12));
  top = Math.max(12, Math.min(top, vh - popoverHeight - 12));

  const arrowSide =
    placement === "bottom"
      ? "top"
      : placement === "top"
        ? "bottom"
        : placement === "left"
          ? "right"
          : "left";

  return { top, left, arrowSide };
}

// ── Component ───────────────────────────────────────────────────────────────

export function FeatureTour() {
  const pathname = usePathname();
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [visible, setVisible] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [usageSkipped, setUsageSkipped] = useState<Set<string>>(new Set());
  const [usageLoaded, setUsageLoaded] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch actual usage signals on mount to auto-skip explored features
  useEffect(() => {
    if (isTourDismissed()) {
      setUsageLoaded(true);
      return;
    }

    let cancelled = false;

    async function fetchUsage() {
      const signals: UsageSignals = {
        hasPersona: false,
        hasHighConfidence: false,
        hasGeneratedSuggestions: false,
        hasFeedback: false,
      };

      // Fire all 3 calls in parallel — each is non-critical
      const [personaResult, suggestionsResult, feedbackResult] =
        await Promise.allSettled([
          personaApi.get(),
          suggestionsApi.list(1, 1), // just need count, fetch 1 item
          feedbackApi.getSummary(),
        ]);

      if (personaResult.status === "fulfilled") {
        const p = personaResult.value.persona;
        if (p) {
          signals.hasPersona = true;
          signals.hasHighConfidence =
            (p.confidenceScore?.overall ?? 0) >= 40;
        }
      }

      if (suggestionsResult.status === "fulfilled") {
        const data = suggestionsResult.value;
        signals.hasGeneratedSuggestions = (data.total ?? 0) > 0;
      }

      if (feedbackResult.status === "fulfilled") {
        const fb = feedbackResult.value;
        signals.hasFeedback = (fb?.totalFeedback ?? 0) > 0;
      }

      if (!cancelled) {
        setUsageSkipped(getUsageSkippedSteps(signals));
        setUsageLoaded(true);
      }
    }

    fetchUsage();
    return () => {
      cancelled = true;
    };
  }, []);

  // Filter steps for current page that haven't been completed
  const getAvailableSteps = useCallback(() => {
    if (isTourDismissed() || !usageLoaded) return [];
    const completed = getCompletedSteps();
    return TOUR_STEPS.filter(
      (step) =>
        pathname === step.page &&
        !completed.has(step.id) &&
        !usageSkipped.has(step.id) &&
        document.querySelector(step.target),
    );
  }, [pathname, usageSkipped, usageLoaded]);

  // Initialize tour after usage data is loaded + DOM is ready
  useEffect(() => {
    if (!usageLoaded) return;

    // Small delay for DOM elements to render
    const timer = setTimeout(() => {
      const available = getAvailableSteps();
      if (available.length > 0) {
        const firstStep = TOUR_STEPS.findIndex(
          (s) => s.id === available[0].id,
        );
        setCurrentStepIndex(firstStep);
        setVisible(true);
      } else {
        setVisible(false);
        setCurrentStepIndex(-1);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [pathname, usageLoaded, getAvailableSteps]);

  // Track target element position
  useEffect(() => {
    if (currentStepIndex < 0 || !visible) {
      setTargetRect(null);
      return;
    }

    const step = TOUR_STEPS[currentStepIndex];
    if (!step) return;

    const updateRect = () => {
      const el = document.querySelector(step.target);
      if (el) {
        setTargetRect(el.getBoundingClientRect());
      }
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [currentStepIndex, visible]);

  // Navigate to next uncompleted step
  const goNext = useCallback(() => {
    const step = TOUR_STEPS[currentStepIndex];
    if (step) markStepCompleted(step.id);

    // Build combined skip set: localStorage + usage-based
    const completed = getCompletedSteps();
    if (step) completed.add(step.id);

    const nextIndex = TOUR_STEPS.findIndex(
      (s, i) =>
        i > currentStepIndex &&
        pathname === s.page &&
        !completed.has(s.id) &&
        !usageSkipped.has(s.id) &&
        document.querySelector(s.target),
    );

    if (nextIndex >= 0) {
      setCurrentStepIndex(nextIndex);
    } else {
      setVisible(false);
      setCurrentStepIndex(-1);
    }
  }, [currentStepIndex, pathname, usageSkipped]);

  // Skip/dismiss entire tour
  const handleSkip = useCallback(() => {
    dismissTour();
    setVisible(false);
    setCurrentStepIndex(-1);
  }, []);

  // Don't render if nothing to show
  if (!visible || currentStepIndex < 0 || !targetRect) return null;

  const step = TOUR_STEPS[currentStepIndex];
  if (!step) return null;

  // Count remaining steps on this page
  const completed = getCompletedSteps();
  const stepsOnPage = TOUR_STEPS.filter(
    (s) =>
      pathname === s.page &&
      !completed.has(s.id) &&
      !usageSkipped.has(s.id) &&
      document.querySelector(s.target),
  );
  const currentInPage =
    stepsOnPage.findIndex((s) => s.id === step.id) + 1;
  const totalOnPage = stepsOnPage.length;

  const popoverWidth = 320;
  const popoverHeight = 180;
  const pos = calculatePosition(
    targetRect,
    step.placement,
    popoverWidth,
    popoverHeight,
  );

  return (
    <>
      {/* Spotlight overlay */}
      <div className="fixed inset-0 z-[9998] pointer-events-none">
        <svg className="w-full h-full">
          <defs>
            <mask id="tour-spotlight">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={targetRect.left - 6}
                y={targetRect.top - 6}
                width={targetRect.width + 12}
                height={targetRect.height + 12}
                rx="10"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.4)"
            mask="url(#tour-spotlight)"
          />
        </svg>
      </div>

      {/* Highlight ring around target */}
      <div
        className="fixed z-[9999] pointer-events-none rounded-xl ring-2 ring-indigo-500 ring-offset-2 transition-all duration-300"
        style={{
          top: targetRect.top - 6,
          left: targetRect.left - 6,
          width: targetRect.width + 12,
          height: targetRect.height + 12,
        }}
      />

      {/* Click shield — allows dismissing by clicking overlay */}
      <div
        className="fixed inset-0 z-[9999]"
        onClick={handleSkip}
        aria-hidden
      />

      {/* Popover */}
      <div
        ref={popoverRef}
        className="fixed z-[10000] w-[320px] bg-white rounded-2xl shadow-2xl border border-gray-200 p-5 animate-in fade-in slide-in-from-bottom-2 duration-300"
        style={{ top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Arrow indicator */}
        <div
          className={`absolute w-3 h-3 bg-white border border-gray-200 rotate-45 ${
            pos.arrowSide === "top"
              ? "-top-1.5 left-1/2 -translate-x-1/2 border-b-0 border-r-0"
              : pos.arrowSide === "bottom"
                ? "-bottom-1.5 left-1/2 -translate-x-1/2 border-t-0 border-l-0"
                : pos.arrowSide === "left"
                  ? "-left-1.5 top-1/2 -translate-y-1/2 border-t-0 border-r-0"
                  : "-right-1.5 top-1/2 -translate-y-1/2 border-b-0 border-l-0"
          }`}
        />

        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{step.icon}</span>
            <h4 className="font-semibold text-gray-900 text-sm">
              {step.title}
            </h4>
          </div>
          <button
            onClick={handleSkip}
            className="text-gray-400 hover:text-gray-600 transition-colors -mt-1 -mr-1 p-1"
            aria-label="Skip tour"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-600 leading-relaxed mb-4">
          {step.description}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {currentInPage} of {totalOnPage}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSkip}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 transition-colors"
            >
              Skip tour
            </button>
            <button
              onClick={goNext}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg font-medium transition-colors"
            >
              {currentInPage === totalOnPage ? "Got it!" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

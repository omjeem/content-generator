/**
 * Scheduling Hints — Phase 4 #30
 *
 * Hardcoded domain-average optimal posting times based on industry research.
 * Returns a scheduling hint per DomainCategory that the content generator
 * can attach to each suggestion.
 *
 * Data sources: HubSpot, Sprout Social, Buffer posting-time studies.
 * Future: personalized hints from performance data (Phase G #49).
 */

import type { DomainCategory } from "./trends";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ISchedulingHint {
  bestDay: string;
  bestTimeRange: string;
  reasoning: string;
  confidence: "domain-average" | "personalized";
}

// ── Domain-level optimal posting times ────────────────────────────────────────

const OPTIMAL_POSTING_TIMES: Record<
  DomainCategory,
  { bestDay: string; bestTimeRange: string; reasoning: string }
> = {
  tech: {
    bestDay: "Tuesday",
    bestTimeRange: "9–11 AM",
    reasoning: "Tech audiences are most active mid-morning after stand-ups",
  },
  business: {
    bestDay: "Wednesday",
    bestTimeRange: "8–10 AM",
    reasoning: "Business professionals browse LinkedIn early in the work week",
  },
  healthcare: {
    bestDay: "Tuesday",
    bestTimeRange: "10 AM–12 PM",
    reasoning: "Healthcare workers check feeds during late-morning breaks",
  },
  wellness: {
    bestDay: "Monday",
    bestTimeRange: "7–9 AM",
    reasoning: "Wellness content performs best at the start of the week",
  },
  finance: {
    bestDay: "Thursday",
    bestTimeRange: "8–10 AM",
    reasoning: "Finance professionals engage before market-moving events",
  },
  legal: {
    bestDay: "Tuesday",
    bestTimeRange: "9–11 AM",
    reasoning: "Legal professionals review content during structured mornings",
  },
  education: {
    bestDay: "Wednesday",
    bestTimeRange: "10 AM–12 PM",
    reasoning: "Educators engage mid-week during planning periods",
  },
  creative: {
    bestDay: "Thursday",
    bestTimeRange: "11 AM–1 PM",
    reasoning: "Creative professionals browse during flexible midday breaks",
  },
  food: {
    bestDay: "Friday",
    bestTimeRange: "11 AM–1 PM",
    reasoning: "Food industry content peaks around lunch and weekend planning",
  },
  sustainability: {
    bestDay: "Wednesday",
    bestTimeRange: "9–11 AM",
    reasoning: "Sustainability content resonates mid-week when impact is top of mind",
  },
  hr: {
    bestDay: "Tuesday",
    bestTimeRange: "8–10 AM",
    reasoning: "HR leaders engage early in the week for talent and culture content",
  },
  "real-estate": {
    bestDay: "Thursday",
    bestTimeRange: "9–11 AM",
    reasoning: "Real estate audiences research ahead of weekend showings",
  },
  manufacturing: {
    bestDay: "Wednesday",
    bestTimeRange: "7–9 AM",
    reasoning: "Manufacturing professionals check feeds before shift start",
  },
  general: {
    bestDay: "Tuesday",
    bestTimeRange: "9–11 AM",
    reasoning: "General LinkedIn engagement peaks Tuesday mid-morning",
  },
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get a scheduling hint for the given domain category.
 * Returns domain-average data; personalized hints will come from Phase G #49.
 */
export function getSchedulingHint(domain: DomainCategory): ISchedulingHint {
  const data = OPTIMAL_POSTING_TIMES[domain] ?? OPTIMAL_POSTING_TIMES.general;
  return {
    bestDay: data.bestDay,
    bestTimeRange: data.bestTimeRange,
    reasoning: data.reasoning,
    confidence: "domain-average",
  };
}

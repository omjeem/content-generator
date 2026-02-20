/**
 * Trend research service.
 *
 * NOTE: google-trends-api v4.9.2 is broken as of 2026:
 *   - relatedTopics returns {"default":{"rankedList":[]}} (empty — Google requires consent cookies)
 *   - dailyTrends returns a 404 HTML page (endpoint removed)
 *
 * Replacement: use Gemini directly to generate relevant, up-to-date trending topics.
 * This gives better-targeted results for LinkedIn content creators anyway.
 */
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

/**
 * Uses Gemini to generate trending/relevant topics for the given keywords + geo.
 */
export async function getTrendingTopics(
  keywords: string[],
  geo = "US",
): Promise<string[]> {
  if (!keywords.length) return fallbackTopics([]);

  const keywordStr = keywords.slice(0, 5).join(", ");
  const geoLabel = geoToLabel(geo);
  const month = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  try {
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt: `List 10 specific trending topics, discussions, and emerging themes right now (${month}) that are highly relevant to professionals working in: ${keywordStr}.
Focus on ${geoLabel}.
Include topics from: recent news, viral LinkedIn conversations, industry shifts, new tools/frameworks, and emerging best practices.

Return ONLY a JSON array of short topic strings — no markdown, no code block, no explanation:
["topic 1", "topic 2", ...]`,
    });

    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return fallbackTopics(keywords);

    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return fallbackTopics(keywords);

    const topics = (parsed as unknown[])
      .filter((t): t is string => typeof t === "string" && t.length > 0)
      .slice(0, 15);

    console.log(
      `[trends] getTrendingTopics → ${topics.length} topics for [${keywordStr}]`,
    );
    return topics;
  } catch (err) {
    console.warn(
      "[trends] getTrendingTopics failed, using fallback:",
      (err as Error).message,
    );
    return fallbackTopics(keywords);
  }
}

/**
 * Uses Gemini to generate daily trending search topics for the geo.
 */
export async function getDailyTrends(geo = "US"): Promise<string[]> {
  const geoLabel = geoToLabel(geo);
  const month = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  try {
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt: `What are 15 trending topics, news events, and viral discussions happening right now (${month}) in ${geoLabel} that a LinkedIn content creator should know about?
Focus on: business, technology, AI, leadership, entrepreneurship, career development.

Return ONLY a JSON array of short topic strings — no markdown, no code block, no explanation:
["topic 1", "topic 2", ...]`,
    });

    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return [];

    const topics = (parsed as unknown[])
      .filter((t): t is string => typeof t === "string" && t.length > 0)
      .slice(0, 20);

    console.log(
      `[trends] getDailyTrends → ${topics.length} daily trends for geo=${geo}`,
      { topics, parsed },
    );
    return topics;
  } catch (err) {
    console.warn("[trends] getDailyTrends failed:", (err as Error).message);
    return [];
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function geoToLabel(geo: string): string {
  const map: Record<string, string> = {
    US: "the United States",
    GB: "the United Kingdom",
    IN: "India",
    CA: "Canada",
    AU: "Australia",
    SG: "Singapore",
    AE: "the UAE",
    DE: "Germany",
    FR: "France",
  };
  return map[geo.toUpperCase()] ?? geo;
}

function fallbackTopics(keywords: string[]): string[] {
  const base = keywords[0] ?? "business";
  return [
    `AI tools transforming ${base}`,
    `Future of ${base}`,
    `${base} leadership lessons`,
    `Career growth in ${base}`,
    `${base} innovation strategies`,
  ];
}

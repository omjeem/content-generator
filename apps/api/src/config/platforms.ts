/**
 * Platform configuration constants.
 *
 * Each platform defines its constraints, supported formats, hashtag strategy,
 * and best practices. The content generator and post editor use these to
 * produce platform-appropriate suggestions and enforce character limits.
 */

export interface PlatformConfig {
  id: string;
  name: string;
  maxChars: number;
  supportsThreads: boolean;
  threadMaxTweets?: number;
  formats: string[];
  hashtagStrategy: string;
  bestPractices: string;
}

export const PLATFORMS: Record<string, PlatformConfig> = {
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    maxChars: 3000,
    supportsThreads: false,
    formats: ["carousel", "text-post", "poll", "video-script", "list"],
    hashtagStrategy: "3-5 hashtags at the end of the post",
    bestPractices:
      "Use short paragraphs, line breaks for readability, hook in first line. No external links in post body (add in first comment).",
  },
  twitter: {
    id: "twitter",
    name: "Twitter/X",
    maxChars: 280,
    supportsThreads: true,
    threadMaxTweets: 25,
    formats: ["tweet", "thread", "poll", "quote-tweet", "image-tweet"],
    hashtagStrategy: "1-2 hashtags max, integrated naturally into the text",
    bestPractices:
      "Concise, punchy, hook in first tweet. For threads: each tweet should be able to stand alone. Number threads (1/N). No filler — every tweet must add value.",
  },
};

/**
 * Returns the platform config for a given platform ID.
 * Falls back to linkedin config if the ID is unknown.
 */
export function getPlatformConfig(platformId: string): PlatformConfig {
  return PLATFORMS[platformId] ?? PLATFORMS["linkedin"]!;
}

/**
 * Default platform for all generation requests.
 */
export const DEFAULT_PLATFORM = "linkedin";

/**
 * All supported platform IDs.
 */
export type SupportedPlatform = "linkedin" | "twitter";

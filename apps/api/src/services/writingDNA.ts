/**
 * Writing Pattern DNA — Phase 4 #17
 *
 * Deterministic (no LLM) extraction of 15+ writing patterns from a post array.
 * Fast, free, runs in <50ms for up to 500 posts.
 *
 * These patterns capture the creator's "fingerprint" — how they write —
 * so generated content matches their natural voice and structure.
 */

export interface IWritingDNA {
  avgSentenceLength: number;         // avg words per sentence
  sentenceLengthVariance: number;    // stddev of sentence word counts
  avgParagraphLength: number;        // avg sentences per paragraph
  openingPatterns: {
    question: number;
    story: number;
    statistic: number;
    boldClaim: number;
    other: number;
  };
  emojiFrequency: number;            // emojis per 100 words
  emojiTypes: string[];              // top 5 most-used emojis
  hashtagFrequency: number;          // hashtags per post
  hashtagPlacement: "inline" | "end" | "mixed" | "none";
  avgPostLength: number;             // chars
  postLengthRange: [number, number]; // [min, max]
  usesListFormat: boolean;
  usesBulletPoints: boolean;
  lineBreakFrequency: number;        // line breaks per 100 words
  readingLevel: "simple" | "moderate" | "advanced";
  firstPersonRatio: number;          // 0-1
  ctaPatterns: string[];             // extracted CTA phrases (top 5)
}

// ── Regex patterns ────────────────────────────────────────────────────────

const EMOJI_REGEX = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
const HASHTAG_REGEX = /#\w+/g;
const SENTENCE_SPLIT = /[.!?]+(?:\s|$)/;
const FIRST_PERSON_REGEX = /\b(i|i'm|i've|i'll|i'd|me|my|mine|myself|we|we're|we've|our|ours|ourselves)\b/gi;
const LIST_REGEX = /^[\s]*[-•●◦▪▸►→➡✓✔☑]\s/m;
const NUMBERED_LIST_REGEX = /^[\s]*\d+[.)]\s/m;
const BOLD_CLAIM_REGEX = /^(the truth is|here'?s the thing|unpopular opinion|hot take|bold claim|let me be honest|stop |most people|nobody talks about)/i;
const STORY_REGEX = /^(last (week|month|year)|i remember|when i|one day|a few (weeks|months|years) ago|it was|story time|true story|i once)/i;
const STAT_REGEX = /^(\d{1,3}[%,]|\$?\d+[MBK]|according to|studies show|research (shows|suggests)|data from|a recent (study|survey|report))/i;
const QUESTION_REGEX = /^[^.!]{3,}\?/;
const CTA_REGEX = /(follow me|share this|drop a comment|comment below|save this|let me know|what do you think|agree\??|thoughts\??|tag someone|repost|like if you|bookmark this|link in (bio|comments|the first comment)|dm me|check out|subscribe|join me|hit the bell|tell me|share your|leave a)/gi;

// ── Main extraction ─────────────────────────────────────────────────────

/**
 * Extracts Writing DNA from an array of posts.
 * All calculations are deterministic — no network calls, no LLM.
 */
export function extractWritingDNA(posts: string[]): IWritingDNA {
  if (posts.length === 0) return defaultDNA();

  // Collect stats across all posts
  const allSentenceLengths: number[] = [];
  const allParagraphLengths: number[] = [];
  const emojiCounts: Record<string, number> = {};
  let totalEmojis = 0;
  let totalHashtags = 0;
  let totalWords = 0;
  let totalLineBreaks = 0;
  let totalFirstPerson = 0;
  let totalWordCount = 0;
  const openingPatterns = { question: 0, story: 0, statistic: 0, boldClaim: 0, other: 0 };
  const ctaCounts: Record<string, number> = {};
  const postLengths: number[] = [];
  let listFormatCount = 0;
  let bulletPointCount = 0;
  let hashtagEndCount = 0;
  let hashtagInlineCount = 0;
  let hashtagNoneCount = 0;
  let totalSyllables = 0;
  let totalSyllableWords = 0;

  for (const post of posts) {
    const trimmed = post.trim();
    if (!trimmed) continue;

    postLengths.push(trimmed.length);

    // Words
    const words = trimmed.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    totalWords += wordCount;

    // Sentences
    const sentences = trimmed.split(SENTENCE_SPLIT).filter((s) => s.trim().length > 0);
    for (const sent of sentences) {
      const sentWords = sent.trim().split(/\s+/).filter(Boolean).length;
      if (sentWords > 0) allSentenceLengths.push(sentWords);
    }

    // Paragraphs (split by double newline or single newline)
    const paragraphs = trimmed.split(/\n{2,}/).filter((p) => p.trim().length > 0);
    for (const para of paragraphs) {
      const paraSentences = para.split(SENTENCE_SPLIT).filter((s) => s.trim().length > 0);
      allParagraphLengths.push(paraSentences.length);
    }

    // Line breaks
    const lineBreaks = (trimmed.match(/\n/g) || []).length;
    totalLineBreaks += lineBreaks;

    // Emojis
    const emojis = trimmed.match(EMOJI_REGEX) || [];
    totalEmojis += emojis.length;
    for (const e of emojis) {
      emojiCounts[e] = (emojiCounts[e] ?? 0) + 1;
    }

    // Hashtags
    const hashtags = trimmed.match(HASHTAG_REGEX) || [];
    totalHashtags += hashtags.length;

    // Hashtag placement
    if (hashtags.length === 0) {
      hashtagNoneCount++;
    } else {
      const lastLineStart = trimmed.lastIndexOf("\n");
      const lastLine = lastLineStart >= 0 ? trimmed.slice(lastLineStart) : trimmed;
      const allInLastLine = hashtags.every((h) => lastLine.includes(h));
      if (allInLastLine) hashtagEndCount++;
      else hashtagInlineCount++;
    }

    // Opening pattern
    const firstLine = trimmed.split("\n")[0]!.trim();
    if (QUESTION_REGEX.test(firstLine)) openingPatterns.question++;
    else if (STORY_REGEX.test(firstLine)) openingPatterns.story++;
    else if (STAT_REGEX.test(firstLine)) openingPatterns.statistic++;
    else if (BOLD_CLAIM_REGEX.test(firstLine)) openingPatterns.boldClaim++;
    else openingPatterns.other++;

    // Lists
    if (LIST_REGEX.test(trimmed) || NUMBERED_LIST_REGEX.test(trimmed)) listFormatCount++;
    if (LIST_REGEX.test(trimmed)) bulletPointCount++;

    // First person
    const fpMatches = trimmed.match(FIRST_PERSON_REGEX) || [];
    totalFirstPerson += fpMatches.length;
    totalWordCount += wordCount;

    // CTA
    const ctaMatches = trimmed.match(CTA_REGEX) || [];
    for (const cta of ctaMatches) {
      const normalized = cta.toLowerCase().trim();
      ctaCounts[normalized] = (ctaCounts[normalized] ?? 0) + 1;
    }

    // Syllables (for reading level)
    for (const word of words) {
      const syllables = countSyllables(word);
      totalSyllables += syllables;
      totalSyllableWords++;
    }
  }

  // ── Aggregate results ───────────────────────────────────────────────────

  const n = posts.length;
  const avgSentenceLength = mean(allSentenceLengths);
  const sentenceLengthVariance = stddev(allSentenceLengths);
  const avgParagraphLength = mean(allParagraphLengths);

  // Emojis per 100 words
  const emojiFrequency = totalWords > 0 ? round((totalEmojis / totalWords) * 100, 2) : 0;

  // Top 5 emojis
  const emojiTypes = Object.entries(emojiCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([e]) => e);

  // Hashtags per post
  const hashtagFrequency = round(totalHashtags / n, 2);

  // Hashtag placement
  let hashtagPlacement: IWritingDNA["hashtagPlacement"] = "none";
  if (hashtagEndCount > 0 || hashtagInlineCount > 0) {
    if (hashtagInlineCount > hashtagEndCount) hashtagPlacement = "inline";
    else if (hashtagEndCount > hashtagInlineCount) hashtagPlacement = "end";
    else hashtagPlacement = "mixed";
  }

  // Post lengths
  const avgPostLength = round(mean(postLengths), 0);
  const postLengthRange: [number, number] = postLengths.length > 0
    ? [Math.min(...postLengths), Math.max(...postLengths)]
    : [0, 0];

  // Lists
  const usesListFormat = listFormatCount / n > 0.2;
  const usesBulletPoints = bulletPointCount / n > 0.15;

  // Line breaks per 100 words
  const lineBreakFrequency = totalWords > 0 ? round((totalLineBreaks / totalWords) * 100, 2) : 0;

  // Reading level via avg syllables per word
  const avgSyllablesPerWord = totalSyllableWords > 0 ? totalSyllables / totalSyllableWords : 1.5;
  const readingLevel: IWritingDNA["readingLevel"] =
    avgSyllablesPerWord < 1.4 ? "simple" : avgSyllablesPerWord < 1.7 ? "moderate" : "advanced";

  // First person ratio
  const firstPersonRatio = totalWordCount > 0 ? round(totalFirstPerson / totalWordCount, 3) : 0;

  // Top 5 CTAs
  const ctaPatterns = Object.entries(ctaCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([phrase]) => phrase);

  return {
    avgSentenceLength: round(avgSentenceLength, 1),
    sentenceLengthVariance: round(sentenceLengthVariance, 1),
    avgParagraphLength: round(avgParagraphLength, 1),
    openingPatterns,
    emojiFrequency,
    emojiTypes,
    hashtagFrequency,
    hashtagPlacement,
    avgPostLength,
    postLengthRange,
    usesListFormat,
    usesBulletPoints,
    lineBreakFrequency,
    readingLevel,
    firstPersonRatio,
    ctaPatterns,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function defaultDNA(): IWritingDNA {
  return {
    avgSentenceLength: 0,
    sentenceLengthVariance: 0,
    avgParagraphLength: 0,
    openingPatterns: { question: 0, story: 0, statistic: 0, boldClaim: 0, other: 0 },
    emojiFrequency: 0,
    emojiTypes: [],
    hashtagFrequency: 0,
    hashtagPlacement: "none",
    avgPostLength: 0,
    postLengthRange: [0, 0],
    usesListFormat: false,
    usesBulletPoints: false,
    lineBreakFrequency: 0,
    readingLevel: "moderate",
    firstPersonRatio: 0,
    ctaPatterns: [],
  };
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const avg = mean(arr);
  const squareDiffs = arr.map((v) => (v - avg) ** 2);
  return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / arr.length);
}

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/** Simple syllable counter — not perfect but good enough for reading level */
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  let count = 0;
  const vowels = "aeiouy";
  let prevVowel = false;
  for (const ch of w) {
    const isVowel = vowels.includes(ch);
    if (isVowel && !prevVowel) count++;
    prevVowel = isVowel;
  }
  // Silent e
  if (w.endsWith("e") && count > 1) count--;
  return Math.max(1, count);
}

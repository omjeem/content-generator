# Phase 3: Mastra AI Setup + All 4 Agents + Orchestrator

# Status: COMPLETE ✓ (2026-02-20)

# IMPORTANT NOTES for future sessions:

# - Mastra version: 1.5.0 — Agent requires 'id' field in addition to 'name'

# - Import path: Agent from '@mastra/core/agent', createTool from '@mastra/core/tools'

# - generate() returns result.text (string) — NOT result.object

# - Structured output: parse JSON from result.text using regex, then Zod.parse()

# - Tool execute receives raw input object (not {context: ...}) — use toolInput?.field ?? toolInput?.context?.field

# - tsconfig lib must include "DOM" for Puppeteer page.evaluate() to see document

# - google-trends-api has no @types package — use require() with manual interface types

---

## Goal

Build the complete multi-agent pipeline using Mastra AI. All agents must be
functional and the orchestrator must sequence them correctly.

## Checklist

- [ ] Install Mastra packages + Gemini provider
- [ ] Install Puppeteer for LinkedIn scraping
- [ ] Install google-trends-api
- [ ] apps/api/src/services/linkedin.ts — Puppeteer scraper
- [ ] apps/api/src/services/trends.ts — google-trends-api wrapper
- [ ] apps/api/src/agents/mastra.ts — Mastra instance + memory config
- [ ] apps/api/src/agents/personaAnalyst.ts — Agent 1
- [ ] apps/api/src/agents/onboarding.ts — Agent 2
- [ ] apps/api/src/agents/trendResearch.ts — Agent 3
- [ ] apps/api/src/agents/contentGenerator.ts — Agent 4
- [ ] Orchestrator function in mastra.ts
- [ ] Test each agent individually

## npm packages to install (apps/api)

### Dependencies

```
@mastra/core
@ai-sdk/google
puppeteer
google-trends-api
```

## Mastra Configuration

### apps/api/src/agents/mastra.ts

```typescript
import { Mastra } from "@mastra/core";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

export const mastra = new Mastra({
  agents: {
    personaAnalyst: personaAnalystAgent,
    onboarding: onboardingAgent,
    trendResearch: trendResearchAgent,
    contentGenerator: contentGeneratorAgent,
  },
});

// Orchestrator function — sequences all 4 agents
export async function runContentPipeline(userId: string, input: PipelineInput) {
  // Step 1: Persona Analysis
  // Step 2: Check if interview complete, else prompt
  // Step 3: Trend Research
  // Step 4: Content Generation
  // Save results, return suggestions
}
```

## Agent 1: Persona Analyst

### File: apps/api/src/agents/personaAnalyst.ts

```typescript
// Tools:
//   - scrapeLinkedIn(url): Uses Puppeteer to scrape posts
//   - analyzePersona(posts[]): Uses Gemini to extract style/tone/topics

// System prompt:
// "You are a LinkedIn content analyst. Given a set of LinkedIn posts,
//  analyze the author's writing style, tone, recurring topics, preferred
//  post formats, and engagement patterns. Return a structured JSON persona."

// Output schema (validated with Zod):
// {
//   writingStyle: string,
//   tone: string,
//   topics: string[],
//   postFormats: string[],
//   estimatedPostFrequency: string,
//   engagementPatterns: string,
// }
```

### File: apps/api/src/services/linkedin.ts

```typescript
// Function: scrapeLinkedInProfile(url: string): Promise<string[]>
// - Launch Puppeteer (headless: true, args: ['--no-sandbox'])
// - Navigate to LinkedIn URL
// - Wait for post elements to load
// - Extract text content of each post (max 20 posts)
// - Return array of post strings
// - On error: throw with message "LinkedIn scraping failed — use manual paste"
//
// Function: parseManualPosts(rawText: string): string[]
// - Split by double newline or "---" separator
// - Return array of individual post strings
```

## Agent 2: Onboarding/Interview Agent

### File: apps/api/src/agents/onboarding.ts

```typescript
// System prompt:
// "You are a LinkedIn content strategist conducting a friendly interview.
//  Ask ONE question at a time from this list (skip if already answered):
//  1. What are your main professional goals for LinkedIn?
//  2. Who is your target audience? (role, industry, seniority)
//  3. What industry/niche are you in?
//  4. What are your 3 content pillars? (topics you want to own)
//  5. How often do you want to post? (daily/3x week/weekly)
//  When all 5 are answered, say: 'Interview complete! I have everything I need.'
//  and set interviewComplete: true in your response."

// Working memory:
// - Load chat history from MongoDB ChatSession for this userId
// - Append new messages after each turn
// - Extract structured answers from conversation when complete

// Input: { userId, message, sessionId }
// Output: { reply: string, interviewComplete: boolean, extractedData?: Partial<IUserPersona> }
```

## Agent 3: Trend Research Agent

### File: apps/api/src/agents/trendResearch.ts

```typescript
// Tools:
//   - getGoogleTrends(keywords: string[], geo?: string): trending searches
//   - searchTavily(query: string): broader web search (if TAVILY_API_KEY set)

// System prompt:
// "You are a trend research specialist. Given a user's industry and topics,
//  identify the top 5-10 trending discussions relevant to their niche.
//  Prioritize trends from the last 7 days. Return as a ranked list with
//  brief context for each trend."

// Logic:
// 1. Get user's industry/topics from UserPersona
// 2. Call google-trends-api with those keywords
// 3. If results < 3, fallback to Tavily search
// 4. Return top 5-10 trends as string[]
```

### File: apps/api/src/services/trends.ts

```typescript
import googleTrends from "google-trends-api";

// Function: getTrendingTopics(keywords: string[], geo = 'US'): Promise<string[]>
// - Call googleTrends.relatedTopics({ keyword, geo })
// - Parse response JSON
// - Extract topic titles
// - Deduplicate and return top 10
//
// Function: getTrendingSearches(geo = 'US'): Promise<string[]>
// - Call googleTrends.dailyTrends({ geo })
// - Return trending search titles
```

## Agent 4: Content Idea Generator

### File: apps/api/src/agents/contentGenerator.ts

```typescript
// System prompt:
// "You are an expert LinkedIn ghostwriter. Given:
//   - The user's persona (writing style, tone, topics)
//   - Their goals and target audience
//   - Current trending topics in their niche
//  Generate 5-10 LinkedIn post ideas that feel AUTHENTIC to their voice.
//  Each idea must include: topic, angle, format, hook, and whyItFits.
//  Formats: carousel | text-post | poll | video-script | list
//  The hook must be scroll-stopping and under 15 words.
//  Return valid JSON array."

// Input: { persona: IUserPersona, trends: string[] }
// Output: ISuggestion[] (5-10 items)
// Validate output with Zod schema
// Save to ContentSuggestion collection in MongoDB
```

## Orchestrator Flow

```typescript
export async function runContentPipeline(
  userId: string,
  input: {
    linkedinUrl?: string;
    manualPosts?: string;
  },
) {
  // 1. Agent 1: Analyze persona (skip if already done)
  const existingPersona = await UserPersona.findOne({ userId });
  if (!existingPersona || input.linkedinUrl || input.manualPosts) {
    const posts = input.linkedinUrl
      ? await scrapeLinkedInProfile(input.linkedinUrl)
      : parseManualPosts(input.manualPosts!);
    const persona = await personaAnalystAgent.generate(posts);
    await UserPersona.findOneAndUpdate({ userId }, persona, { upsert: true });
  }

  // 2. Agent 2: Check interview status (must be complete before generating)
  const persona = await UserPersona.findOne({ userId });
  if (!persona?.interviewComplete) {
    return {
      status: "interview_required",
      message: "Complete the onboarding interview first",
    };
  }

  // 3. Agent 3: Get trends for user's niche
  const trends = await trendResearchAgent.generate({
    industry: persona.industry,
    topics: persona.topics,
  });

  // 4. Agent 4: Generate content ideas
  const suggestions = await contentGeneratorAgent.generate({ persona, trends });

  // 5. Save to DB
  await ContentSuggestion.create({ userId, trendsUsed: trends, suggestions });

  return { status: "success", suggestions };
}
```

## Completion Criteria

- Each agent can be called individually and returns expected output
- Orchestrator sequences all 4 agents correctly
- Persona saved to MongoDB after Agent 1
- Interview state persists across HTTP requests (via ChatSession)
- Content suggestions saved to MongoDB after Agent 4
- LinkedIn scraping fails gracefully with helpful error message

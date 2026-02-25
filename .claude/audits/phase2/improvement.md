# Phase 2 — Architectural Audit & Improvement Plan

**Date**: 2026-02-25
**Auditor**: AI System Architect
**Scope**: Pipeline robustness audit + 6 new feature architectures + continuous persona learning
**Baseline**: All Phase 1 audit fixes assumed applied (see `.claude/audits/phase1/improvement.md`)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Pipeline Robustness Audit — Gaps, Breaks & Enhancements](#2-pipeline-robustness-audit--gaps-breaks--enhancements)
3. [Feature: Suggestion Feedback Loop](#3-feature-suggestion-feedback-loop)
4. [Feature: AI Co-Writing Post Editor](#4-feature-ai-co-writing-post-editor)
5. [Feature: User Post Library (Drafts & Published)](#5-feature-user-post-library-drafts--published)
6. [Feature: Twitter/X Multi-Platform Support](#6-feature-twitterx-multi-platform-support)
7. [Feature: Admin Dashboard with Security](#7-feature-admin-dashboard-with-security)
8. [Continuous Persona Learning System](#8-continuous-persona-learning-system)
9. [Prioritized Action Plan & Dependency Graph](#9-prioritized-action-plan--dependency-graph)

---

## 1. Executive Summary

### Current System State (Post-Phase 1)

The system is a functional MVP with a 4-agent pipeline (Persona Analyst → Onboarding → Trend Research → Content Generator) that generates LinkedIn post ideas. Phase 1 fixes addressed JSON parsing, CORS, rate limiting, chat history sliding window, and incremental post addition.

### What's Missing for a Production-Grade Platform

1. **No feedback loop** — The system generates suggestions but never learns whether the user liked them. It's a fire-and-forget system with zero learning signal post-generation.
2. **No post creation workflow** — Users get ideas but can't act on them inside the platform. They must copy/paste to LinkedIn manually. No AI assistance to turn an idea into a finished post.
3. **No content library** — Drafted/published posts have no home. Users can't track what they've created, revisit drafts, or feed finished posts back into the persona.
4. **LinkedIn-only** — The entire architecture is hardcoded for LinkedIn. Twitter/X (a major platform for thought leaders) is not supported.
5. **No admin controls** — Token increase requests go into a DB but there's no admin dashboard. Admin endpoints have zero access control (any authenticated user can call `/api/tokens/admin/requests`).
6. **Persona is static between explicit updates** — The persona only updates when the user actively adds posts or chats with the persona editor. There is no passive learning from feedback, drafts, or publishing patterns.

### Guiding Principle

> **The system should continuously learn about the user at every touchpoint — every piece of feedback, every edit, every published post, and every rejected suggestion is a signal that should refine the persona and improve future suggestions.**

---

## 2. Pipeline Robustness Audit — Gaps, Breaks & Enhancements

### 2.1 Critical: Admin Endpoints Have No Authorization

**Evidence — `routes/tokenUsage.ts:289-313`:**

```typescript
// Admin-only: list all token increase requests across all users.
// No auth middleware beyond the existing `authenticate` — you control access
// by only sharing these endpoints with yourself / not exposing them publicly.
router.get(
  "/admin/requests",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
```

The comment even acknowledges the problem: "you control access by only sharing these endpoints." This means **any authenticated user can see ALL users' token requests** and can approve/reject them via `PATCH /api/tokens/admin/requests/:id`. This is a critical security hole.

**Impact**: Any registered user can:
- See all other users' email addresses, names, and token usage
- Approve their own token increase request with an arbitrary limit
- Reject other users' requests

**Fix**: See Section 7 for the full Admin role system. Immediate stopgap:

```typescript
// Add this middleware before all /admin/* routes:
function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  // Check user.role === 'admin' (requires schema change)
  if (req.userRole !== 'admin') {
    res.status(403).json({ error: 'Admin access required.' });
    return;
  }
  next();
}
```

### 2.2 Critical: Pipeline Ignores the `postsArray` Field

**Evidence — `mastra.ts:84-91`:**

```typescript
if (needsAnalysis && (input.linkedinUrl || input.manualPosts)) {
  const { posts, scrapingBlocked, errorMessage } =
    await resolvePostsFromInput({
      linkedinUrl: input.linkedinUrl,
      manualPosts: input.manualPosts,
    });
```

The `PipelineInput` interface only has `linkedinUrl` and `manualPosts`. But the `/api/persona/analyze` route now accepts `postsArray`. If a user triggers the full generation pipeline with `postsArray` input (e.g., force re-analyze), the pipeline silently ignores it because `resolvePostsFromInput()` doesn't accept `postsArray`.

**Fix**:

```typescript
// In PipelineInput — add:
postsArray?: string[];

// In mastra.ts Step 1 — update resolution:
let posts: string[];
if (input.postsArray?.length) {
  posts = input.postsArray;
} else {
  const resolved = await resolvePostsFromInput({
    linkedinUrl: input.linkedinUrl,
    manualPosts: input.manualPosts,
  });
  posts = resolved.posts;
  // ... handle scrapingBlocked, etc.
}
```

### 2.3 High: `DEFAULT_TIMEOUT_MS` Misconfigured

**Evidence — `index.ts:128`:**

```typescript
const DEFAULT_TIMEOUT_MS = 180_000; // 30 s for all other routes
```

The comment says "30 s for all other routes" but the value is `180_000` ms (3 minutes). This means non-AI routes like `GET /api/persona` or `GET /api/suggestions` also get a 3-minute timeout instead of the intended 30 seconds.

**Fix**: Change to `80_000`.

### 2.4 High: Trend Cache Missing (Phase 1 Unfixed)

**Evidence — `trendResearch.ts:116`:**

```typescript
rawItems = await fetchRealTrendingContent(keywords, input.industry, geo);
```

Every generation call makes fresh API calls to Tavily + HN + RSS. There is no caching layer. Two generations 30 seconds apart for the same user will make identical network requests.

**Fix**: Add a TTL cache keyed on `(industry, topics_hash, geo)` with a 30-minute window:

```typescript
// New file: services/trendCache.ts
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 1800 }); // 30 min

export function getCachedTrends(key: string): RawTrendItem[] | undefined {
  return cache.get(key);
}

export function setCachedTrends(key: string, items: RawTrendItem[]): void {
  cache.set(key, items);
}

function buildCacheKey(keywords: string[], industry: string, geo: string): string {
  const sorted = [...keywords].sort().join(',');
  return `trends:${industry}:${sorted}:${geo}`;
}
```

### 2.5 Medium: `mergePersonaAnalysis` Overwrites `writingStyle` and `tone`

**Evidence — `personaMerge.ts:89-90`:**

```typescript
return {
  writingStyle: newAnalysis.writingStyle,
  tone: newAnalysis.tone,
```

When adding 2 new posts to a persona built from 20 posts, the merge function **completely replaces** `writingStyle` and `tone` with the analysis of just those 2 new posts. This is incorrect — 2 posts should not override the signal from 20 posts.

**Fix**: Use weighted blending as originally proposed in Phase 1 Section 8:

```typescript
function blendTextFields(
  existing: string | undefined,
  incoming: string,
  existingWeight: number, // 0-1
): string {
  if (!existing) return incoming;
  if (existingWeight > 0.7) {
    return `${existing} — with emerging ${incoming} tendencies`;
  }
  return incoming; // new batch is large enough to be representative
}
```

### 2.6 Medium: No Validation That `suggestions` Array Is Non-Empty

**Evidence — `mastra.ts:248-259`:**

```typescript
const saved = await ContentSuggestion.create({
  userId: userObjectId,
  suggestions: contentIdeas.ideas.map((idea) => ({ ... })),
});
```

If the LLM returns `{"ideas": []}` (empty array), the `ContentIdeasSchema.parse()` at line 181 would fail due to `.min(5)`. But if it returns exactly 5 items and 3 fail individual field validation after Zod parsing, there's no post-parse check that we still have enough valid ideas. The system would save 2 suggestions and return them as "success."

**Fix**: Add a minimum count check after parsing:

```typescript
const ideas = ContentIdeasSchema.parse(raw);
if (ideas.ideas.length < 3) {
  throw new Error(`Only ${ideas.ideas.length} valid ideas generated — expected at least 3`);
}
```

### 2.7 Medium: Fire-and-Forget Token Tracking Can Silently Fail

**Evidence — `tokenUsage.ts:188-204`:**

```typescript
Promise.all([
  TokenUsageLog.create({ ... }),
  User.updateOne({ _id: userObjectId }, { $inc: { tokensUsed: totalTokens } }),
]).catch((err: Error) => {
  console.error("[tokenUsage] Tracking error (non-fatal):", err.message);
});
```

If the `User.updateOne` fails (e.g., user was deleted mid-pipeline), the `TokenUsageLog` is still created but `User.tokensUsed` is never incremented. This causes the user's quota to appear under-counted in the UI while the admin sees the actual usage in the logs.

**Fix**: If either write fails, log the discrepancy with enough detail for manual reconciliation:

```typescript
const results = await Promise.allSettled([
  TokenUsageLog.create({ ... }),
  User.updateOne({ ... }, { $inc: { tokensUsed: totalTokens } }),
]);
const logFailed = results[0].status === 'rejected';
const userFailed = results[1].status === 'rejected';
if (logFailed || userFailed) {
  console.error('[tokenUsage] DESYNC:', {
    userId, totalTokens, logFailed, userFailed,
  });
}
```

### 2.8 Low: `chatSessionService.findOrCreate` Is Not Atomic

**Evidence — `chatSessionService.ts:42-53`:**

```typescript
let session = await ChatSession.findOne({ userId: userObjectId, agentType });
if (!session) {
  session = await ChatSession.create({ ... });
}
```

Two concurrent requests can both see `session === null`, both create a new session, and the user ends up with 2 sessions for the same agent type. The compound index at `chatSessionSchema.index({ userId: 1, agentType: 1 })` is not unique, so both succeed.

**Fix**:

```typescript
// Option A: Make the index unique and use findOneAndUpdate with upsert
const session = await ChatSession.findOneAndUpdate(
  { userId: userObjectId, agentType },
  { $setOnInsert: { sessionId: `${agentType}-${userId}`, messages: [] } },
  { upsert: true, new: true }
);
```

### 2.9 Enhancement: Pipeline Should Return `trendSource` Consistently

**Evidence — `mastra.ts:275-281`:**

The pipeline returns `trendSource: trendIsLive ? "live" : "fallback"` in the success response, but this information is not persisted in `ContentSuggestion`. For analytics and the admin dashboard, we need to know which suggestions used live vs fallback trends.

**Fix**: Add `trendSource` field to `ContentSuggestion` schema and persist it alongside `trendsUsed`.

### 2.10 Enhancement: No Generation Analytics

The system generates suggestions but stores no analytics about the generation itself:
- How many tokens was each generation?
- What was the prompt size?
- How long did each pipeline step take?
- What was the LLM model response time?

**Fix**: Add a `generationMeta` field to `ContentSuggestion`:

```typescript
generationMeta: {
  pipelineDurationMs: number;
  trendFetchDurationMs: number;
  llmDurationMs: number;
  tokenCost: { input: number; output: number; total: number };
  trendSource: 'live' | 'fallback';
  modelId: string;
}
```

### Summary Table

| # | Severity | Issue | Impact |
|---|----------|-------|--------|
| 2.1 | CRITICAL | Admin endpoints have no authorization | Any user can admin operations |
| 2.2 | CRITICAL | Pipeline ignores `postsArray` field | PostInputCards submissions silently fail |
| 2.3 | HIGH | `DEFAULT_TIMEOUT_MS` is 180s, not 30s | All routes get 3-min timeout |
| 2.4 | HIGH | No trend caching | Duplicate API calls, wasted time |
| 2.5 | MEDIUM | Merge overwrites writingStyle/tone | 2 new posts erase 20-post signal |
| 2.6 | MEDIUM | No post-parse suggestion count check | Could save empty suggestion sets |
| 2.7 | MEDIUM | Token tracking desync on partial failure | Quota appears incorrect |
| 2.8 | LOW | Session creation race condition | Duplicate sessions possible |
| 2.9 | ENHANCEMENT | trendSource not persisted | Analytics blind spot |
| 2.10 | ENHANCEMENT | No generation analytics | Can't measure pipeline performance |

---

## 3. Feature: Suggestion Feedback Loop

### 3.1 The Problem

The current flow is: **Generate → Display → Done.**

The system generates 5-10 suggestions and shows them on the dashboard. But there's no way for the user to tell the system:
- "I loved this one — more like this"
- "This doesn't fit my brand at all"
- "The topic is good but the angle is wrong"
- "I actually wrote this one and it did great / bombed"

Without feedback, the system generates content in a vacuum. It makes the same types of suggestions every time, never adapting to what the user actually resonates with.

### 3.2 Feedback Data Model

```typescript
// NEW: Model — apps/api/src/models/SuggestionFeedback.ts

export type FeedbackRating = 'loved' | 'good' | 'meh' | 'bad';
export type FeedbackAction = 'saved' | 'draft' | 'published' | 'dismissed';

export interface ISuggestionFeedbackDocument extends Document {
  userId: mongoose.Types.ObjectId;
  suggestionSetId: mongoose.Types.ObjectId;    // ref to ContentSuggestion._id
  suggestionIndex: number;                      // which idea in the set (0-indexed)

  // Feedback signals
  rating?: FeedbackRating;                      // explicit quality signal
  action: FeedbackAction;                       // what the user did with it
  feedbackText?: string;                        // optional free-text feedback

  // Parsed signals (extracted from feedbackText by LLM or rules)
  parsedSignals?: {
    topicRelevance: 'on-brand' | 'off-brand' | 'neutral';
    toneMatch: 'perfect' | 'close' | 'mismatch';
    formatPreference: 'liked-format' | 'disliked-format' | 'neutral';
    specificNotes?: string;   // LLM-summarized key point
  };

  // Snapshot of the suggestion for historical reference
  suggestionSnapshot: {
    topic: string;
    angle: string;
    format: string;
    hook: string;
  };

  createdAt: Date;
  updatedAt: Date;
}
```

**Mongoose Schema:**

```typescript
const suggestionFeedbackSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  suggestionSetId: { type: Schema.Types.ObjectId, ref: 'ContentSuggestion', required: true },
  suggestionIndex: { type: Number, required: true, min: 0 },
  rating: { type: String, enum: ['loved', 'good', 'meh', 'bad'] },
  action: { type: String, enum: ['saved', 'draft', 'published', 'dismissed'], required: true },
  feedbackText: { type: String, maxlength: 1000 },
  parsedSignals: { type: Schema.Types.Mixed },
  suggestionSnapshot: {
    topic: { type: String, required: true },
    angle: { type: String, required: true },
    format: { type: String, required: true },
    hook: { type: String, required: true },
  },
}, { timestamps: true });

suggestionFeedbackSchema.index({ userId: 1, createdAt: -1 });
suggestionFeedbackSchema.index({ userId: 1, suggestionSetId: 1, suggestionIndex: 1 }, { unique: true });
```

### 3.3 API Endpoints

```
POST   /api/suggestions/:setId/feedback      — Submit feedback for a specific suggestion
GET    /api/suggestions/:setId/feedback      — Get feedback for a suggestion set
GET    /api/feedback/summary                  — Get aggregated feedback summary for dashboard
```

**POST Schema:**

```typescript
const feedbackSchema = z.object({
  suggestionIndex: z.number().int().min(0).max(19),
  rating: z.enum(['loved', 'good', 'meh', 'bad']).optional(),
  action: z.enum(['saved', 'draft', 'published', 'dismissed']),
  feedbackText: z.string().max(1000).optional(),
});
```

### 3.4 Frontend: Feedback UI on SuggestionCard

Each `SuggestionCard` gets a feedback row at the bottom:

```
┌─────────────────────────────────────────────────────────────┐
│ #1  [Carousel]                                 [Copy Hook] │
│ "Your team adopted AI. Your culture didn't."               │
│ Topic: AI adoption...                                      │
│ Angle: The hidden cost...                                  │
│                                                             │
│ ── Feedback ──────────────────────────────────────────────  │
│                                                             │
│  How was this suggestion?                                   │
│  [❤️ Loved] [👍 Good] [😐 Meh] [👎 Bad]                   │
│                                                             │
│  What would you do with this?                               │
│  [📌 Save] [✏️ Write Draft] [❌ Dismiss]                   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Optional: Tell us more (e.g. "topic is good but     │   │
│  │ angle doesn't match my brand")                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  [Submit Feedback]                                          │
└─────────────────────────────────────────────────────────────┘
```

### 3.5 Feedback Signal Processing

When feedback is submitted, a background job parses the free-text (if any) into structured signals:

```typescript
// services/feedbackProcessor.ts

export async function processFeedback(feedback: ISuggestionFeedbackDocument): Promise<void> {
  // 1. If there's free-text feedback, parse it into signals
  if (feedback.feedbackText) {
    const signals = await parseFeedbackText(feedback.feedbackText, feedback.suggestionSnapshot);
    await SuggestionFeedback.updateOne(
      { _id: feedback._id },
      { $set: { parsedSignals: signals } }
    );
  }

  // 2. Update the user's feedback aggregation in UserPersona
  await updateFeedbackAggregation(feedback.userId.toString());
}
```

### 3.6 How Feedback Flows Into the Pipeline

This is the critical design — feedback must influence future suggestions:

```
┌──────────────────────────────────────────────────────────────────┐
│                    FEEDBACK → PIPELINE FLOW                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  User rates suggestion → SuggestionFeedback saved                 │
│                              ↓                                    │
│  Background: aggregate last 20 feedbacks → FeedbackSummary        │
│                              ↓                                    │
│  FeedbackSummary stored on UserPersona:                           │
│    preferredTopics: ["AI adoption", "leadership"]                  │
│    avoidTopics: ["recruiting", "workplace culture"]                │
│    preferredFormats: { carousel: 0.6, text-post: 0.3, poll: 0.1 }│
│    tonePreference: "more-provocative"                              │
│    averageRating: 3.2                                              │
│    lastFeedbackAt: Date                                            │
│                              ↓                                    │
│  Content Generator reads FeedbackSummary in prompt:               │
│    "## USER FEEDBACK SIGNALS                                       │
│    Topics they love: AI adoption, leadership                       │
│    Topics to avoid: recruiting                                     │
│    Preferred formats: mostly carousels (60%), some text-posts      │
│    Tone preference: push toward more provocative/bold hooks"       │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 3.7 UserPersona Schema Extension

```typescript
// Add to UserPersona model:

feedbackProfile: {
  preferredTopics: string[];      // topics rated 'loved' or 'good'
  avoidTopics: string[];          // topics rated 'bad' multiple times
  formatPreferences: {            // percentage distribution based on feedback
    carousel: number;
    'text-post': number;
    poll: number;
    'video-script': number;
    list: number;
  };
  tonePreference?: string;        // extracted from feedback text patterns
  averageRating: number;          // rolling average of last 20 ratings
  totalFeedbackCount: number;
  lastFeedbackAt: Date;
}
```

### 3.8 Content Generator Prompt Enhancement

```typescript
// In contentGenerator.ts — add to prompt if feedback exists:

function buildFeedbackSection(persona: IUserPersonaDocument): string {
  const fb = persona.feedbackProfile;
  if (!fb || fb.totalFeedbackCount < 3) return ''; // need minimum signals

  const lines: string[] = ['\n## USER FEEDBACK SIGNALS (from past suggestions)'];

  if (fb.preferredTopics.length > 0) {
    lines.push(`Topics they LOVE: ${fb.preferredTopics.slice(0, 5).join(', ')}`);
  }
  if (fb.avoidTopics.length > 0) {
    lines.push(`Topics to AVOID: ${fb.avoidTopics.join(', ')}`);
  }
  if (fb.formatPreferences) {
    const sorted = Object.entries(fb.formatPreferences)
      .filter(([_, v]) => v > 0.1)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} (${Math.round(v * 100)}%)`)
      .join(', ');
    lines.push(`Format preferences: ${sorted}`);
  }
  if (fb.tonePreference) {
    lines.push(`Tone preference: ${fb.tonePreference}`);
  }
  lines.push(`Average satisfaction: ${fb.averageRating.toFixed(1)}/4`);

  return lines.join('\n');
}
```

### 3.9 Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `models/SuggestionFeedback.ts` | **CREATE** | Feedback data model |
| `routes/feedback.ts` | **CREATE** | POST/GET feedback endpoints |
| `services/feedbackProcessor.ts` | **CREATE** | Signal extraction + aggregation |
| `models/UserPersona.ts` | **MODIFY** | Add `feedbackProfile` field |
| `agents/contentGenerator.ts` | **MODIFY** | Add `buildFeedbackSection()` to prompt |
| `components/suggestions/SuggestionCard.tsx` | **MODIFY** | Add feedback UI row |
| `packages/shared-types/src/index.ts` | **MODIFY** | Add feedback interfaces |
| `apps/web/src/lib/api.ts` | **MODIFY** | Add `feedbackApi` methods |

---

## 4. Feature: AI Co-Writing Post Editor

### 4.1 The Problem

Currently, the user journey ends at "here's an idea." The user must:
1. Copy the hook and content brief
2. Open LinkedIn/Buffer/another tool
3. Manually write the full post from the brief
4. Paste and publish

There's no way to go from "idea" → "finished post" inside the platform. And critically, no AI assistance during the actual writing process.

### 4.2 Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    POST EDITOR ARCHITECTURE                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  SuggestionCard → [Write This Post] button                        │
│       ↓                                                           │
│  /dashboard/editor?draftId=xxx                                     │
│       ↓                                                           │
│  ┌─────────────────────────────────────┬───────────────────────┐  │
│  │         POST EDITOR (LEFT)          │  AI CHAT (RIGHT)      │  │
│  │                                     │                       │  │
│  │  [Platform: LinkedIn ▼]             │  Hi! I see you're     │  │
│  │  ─────────────────────              │  writing about AI     │  │
│  │                                     │  adoption. Let me     │  │
│  │  ┌──────────────────────────────┐   │  help you craft the   │  │
│  │  │                              │   │  perfect post.        │  │
│  │  │  Rich text editor area       │   │                       │  │
│  │  │  with real-time char count   │   │  The brief suggests   │  │
│  │  │  and formatting hints        │   │  a carousel format.   │  │
│  │  │                              │   │  Want me to generate  │  │
│  │  │  AI can inject text here     │   │  slide content?       │  │
│  │  │  based on chat discussion    │   │                       │  │
│  │  │                              │   │  ─────────────────    │  │
│  │  │                              │   │  [user types...]      │  │
│  │  │                              │   │  ─────────────────    │  │
│  │  └──────────────────────────────┘   │  [Send] [Apply Edit]  │  │
│  │                                     │                       │  │
│  │  2,847 / 3,000 chars  LinkedIn ✓    │                       │  │
│  │                                     │                       │  │
│  │  [Save Draft] [Mark Ready] [Copy]   │                       │  │
│  └─────────────────────────────────────┴───────────────────────┘  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 4.3 New Agent: Post Editor AI (Agent 6)

```typescript
// NEW: apps/api/src/agents/postEditor.ts

export const postEditorAgent = new Agent({
  id: 'post-editor',
  name: 'post-editor',
  model: google('gemini-2.5-flash'),
  instructions: `You are an AI writing partner helping a user write a LinkedIn post.

You have access to:
- The user's persona (writing style, tone, topics)
- The content brief (topic, angle, hook, post pointers, CTA)
- The current draft text
- The conversation history

Your roles:
1. WRITE: Generate full draft text based on the brief
2. EDIT: Modify specific parts of the draft based on user feedback
3. REFINE: Improve tone, clarity, engagement, or length
4. EXPAND: Add more depth to a section
5. COMPRESS: Make the post shorter without losing impact

When the user asks you to write or edit, include the full updated post text in a hidden block:
<!--POST_CONTENT
{
  "action": "replace" | "insert" | "append",
  "content": "The full post text here...",
  "charCount": 1234,
  "explanation": "What I changed and why"
}
POST_CONTENT-->

Platform-specific rules:
- LinkedIn: max 3,000 characters. Use line breaks for readability. Include relevant hashtags.
- Twitter/X: max 280 chars per tweet. For threads, output each tweet separately.

Always maintain the user's authentic voice as described in their persona.
Keep responses concise (2-3 sentences of explanation + the post content block).`,
});
```

### 4.4 Data Model: PostDraft

```typescript
// NEW: models/PostDraft.ts

export type DraftStatus = 'drafting' | 'ready' | 'published';
export type DraftPlatform = 'linkedin' | 'twitter';

export interface IPostDraftDocument extends Document {
  userId: mongoose.Types.ObjectId;

  // Source — which suggestion sparked this draft
  sourceSuggestionSetId?: mongoose.Types.ObjectId;  // ref ContentSuggestion
  sourceSuggestionIndex?: number;                    // which idea in the set

  // Content
  platform: DraftPlatform;
  title: string;                   // user-friendly title (from suggestion topic)
  content: string;                 // the actual post text
  contentHistory: Array<{          // version history
    content: string;
    editedAt: Date;
    editedBy: 'user' | 'ai';
    changeNote?: string;
  }>;

  // Brief snapshot (from suggestion)
  brief?: {
    topic: string;
    angle: string;
    format: string;
    hook: string;
    postPointers: string[];
    callToAction: string;
    seoKeywords: string[];
  };

  // Twitter-specific
  twitterThread?: Array<{          // for Twitter threads
    tweetIndex: number;
    content: string;
    charCount: number;
  }>;

  // Metadata
  status: DraftStatus;
  charCount: number;
  chatSessionId?: string;          // ref to the editor chat session
  publishedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}
```

### 4.5 API Endpoints

```
POST   /api/drafts                    — Create new draft (from suggestion or blank)
GET    /api/drafts                    — List user's drafts (paginated)
GET    /api/drafts/:id                — Get a specific draft
PATCH  /api/drafts/:id                — Update draft content/status
DELETE /api/drafts/:id                — Delete a draft

POST   /api/drafts/:id/chat           — Chat with AI about this specific draft
GET    /api/drafts/:id/chat/history    — Get chat history for this draft
POST   /api/drafts/:id/publish         — Mark as published (triggers persona learning)
```

### 4.6 Editor Chat Session

The editor chat is different from the persona chat — it's scoped to a specific draft:

```typescript
// In ChatSession model — add new agentType:
agentType: 'onboarding' | 'orchestrator' | 'persona-chat' | 'post-editor';

// The session includes draft context:
// chatSessionService.ts — new function:
export async function findOrCreateEditorSession(
  userId: string,
  draftId: string,
): Promise<IChatSessionDocument> {
  return findOrCreateSession(userId, 'post-editor', `post-editor-${draftId}`);
}
```

### 4.7 "Write This Post" Flow

```
User clicks [Write This Post] on SuggestionCard
    ↓
Frontend calls POST /api/drafts with:
  {
    sourceSuggestionSetId,
    sourceSuggestionIndex,
    platform: 'linkedin',
    title: suggestion.topic,
    content: '', // empty — AI will generate first draft
    brief: { topic, angle, hook, postPointers, callToAction, seoKeywords }
  }
    ↓
Backend creates PostDraft document
    ↓
Frontend redirects to /dashboard/editor?draftId=xxx
    ↓
Editor page loads draft + brief + persona context
    ↓
AI auto-generates first draft from brief:
  POST /api/drafts/:id/chat { message: "__INIT__" }
  → Agent sees brief, persona, and generates full post
  → Returns POST_CONTENT block + explanation
    ↓
Frontend renders AI-generated draft in editor
User edits / chats with AI to refine
    ↓
Each edit/chat round:
  1. User types in chat or edits directly
  2. Chat message sent with current draft snapshot
  3. AI responds with updated POST_CONTENT block
  4. Frontend applies the update to the editor
```

### 4.8 Frontend Component: PostEditor

```
apps/web/src/app/dashboard/editor/page.tsx     — Editor page
apps/web/src/components/editor/PostEditorPane.tsx — Left: text editor
apps/web/src/components/editor/EditorChatPane.tsx — Right: AI chat
apps/web/src/components/editor/PlatformSelector.tsx — Platform tab bar
apps/web/src/components/editor/CharCounter.tsx   — Real-time char counter
```

### 4.9 Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `models/PostDraft.ts` | **CREATE** | Draft data model with version history |
| `agents/postEditor.ts` | **CREATE** | Agent 6 — AI writing partner |
| `routes/drafts.ts` | **CREATE** | CRUD + chat endpoints for drafts |
| `services/draftService.ts` | **CREATE** | Draft business logic layer |
| `app/dashboard/editor/page.tsx` | **CREATE** | Editor page with split panes |
| `components/editor/PostEditorPane.tsx` | **CREATE** | Rich text editor |
| `components/editor/EditorChatPane.tsx` | **CREATE** | Scoped chat for draft |
| `components/editor/PlatformSelector.tsx` | **CREATE** | LinkedIn/Twitter toggle |
| `components/editor/CharCounter.tsx` | **CREATE** | Platform-aware char counter |
| `models/ChatSession.ts` | **MODIFY** | Add 'post-editor' agent type |
| `agents/mastra.ts` | **MODIFY** | Register postEditorAgent |
| `packages/shared-types/src/index.ts` | **MODIFY** | Add draft interfaces |
| `apps/web/src/lib/api.ts` | **MODIFY** | Add `draftsApi` methods |
| `components/suggestions/SuggestionCard.tsx` | **MODIFY** | Add [Write This Post] button |

---

## 5. Feature: User Post Library (Drafts & Published)

### 5.1 The Problem

Users create drafts in the editor (Section 4) and mark them as published, but there's no place to see all their posts in one view. There's also no way to:
- Browse all drafts by status (drafting / ready / published)
- Resume editing an old draft
- Feed a published post back into the persona pipeline

### 5.2 Page Design

```
/dashboard/posts — New route

┌──────────────────────────────────────────────────────────────────┐
│  My Posts                                              [+ New]   │
│                                                                  │
│  [All] [Drafting (3)] [Ready (2)] [Published (8)]                │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  "Your team adopted AI..."                    LinkedIn     │  │
│  │  Draft · 2,847 chars · Last edited 2h ago                 │  │
│  │  [Edit] [Mark Ready] [Delete]                              │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │  "5 leadership lessons from..."               LinkedIn     │  │
│  │  Ready · 1,923 chars · Last edited 1d ago                 │  │
│  │  [Edit] [Copy to Clipboard] [Mark Published]               │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │  "AI is not replacing managers..."            Twitter      │  │
│  │  Published · 3 tweets · Published Feb 20                   │  │
│  │  [View] [Feed to Persona]                                  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Showing 1-10 of 13 posts    [← Prev] [Next →]                  │
└──────────────────────────────────────────────────────────────────┘
```

### 5.3 "Feed to Persona" — Published Posts Auto-Enrich Persona

When a user marks a draft as published, the system should:

1. Add the published post text to the user's `scrapedPosts` array via the existing `add-posts` endpoint
2. Trigger an incremental persona re-analysis
3. Log the batch with `source: 'published-draft'`

This creates a virtuous cycle: **User creates posts → Posts feed persona → Better suggestions → Better posts.**

```typescript
// In routes/drafts.ts — POST /api/drafts/:id/publish handler:

async function handlePublish(draft: IPostDraftDocument, userId: string) {
  // 1. Mark the draft as published
  draft.status = 'published';
  draft.publishedAt = new Date();
  await draft.save();

  // 2. Feed the published content back into the persona pipeline
  // This uses the existing add-posts infrastructure
  const addPostsResult = await internalAddPosts(userId, [draft.content], 'published-draft');

  // 3. Create a positive feedback signal (published = the user liked it enough to post)
  await SuggestionFeedback.findOneAndUpdate(
    { userId, suggestionSetId: draft.sourceSuggestionSetId, suggestionIndex: draft.sourceSuggestionIndex },
    { $set: { action: 'published', rating: 'loved' } }, // published = strong positive signal
    { upsert: true }
  );

  return { draft, personaUpdated: addPostsResult.postsAdded > 0 };
}
```

### 5.4 API Endpoints

These are already covered in Section 4 (drafts CRUD). The post library is purely a frontend page that uses those same endpoints with status filtering:

```
GET /api/drafts?status=drafting&page=1&limit=10
GET /api/drafts?status=ready
GET /api/drafts?status=published
```

### 5.5 Files to Create

| File | Action | Description |
|------|--------|-------------|
| `app/dashboard/posts/page.tsx` | **CREATE** | Post library page with tabs |
| `components/posts/PostListItem.tsx` | **CREATE** | Individual post row |
| `components/posts/PostStatusFilter.tsx` | **CREATE** | Tab filter component |
| `components/layout/Sidebar.tsx` | **MODIFY** | Add "My Posts" link |

---

## 6. Feature: Twitter/X Multi-Platform Support

### 6.1 The Problem

The entire system is hardcoded for LinkedIn:
- `ISuggestion.format` only has LinkedIn-relevant values (`carousel`, `text-post`, `poll`, `video-script`, `list`)
- Content generator prompt says "LinkedIn post ideas"
- Character limits, formatting rules, hashtag strategies are all LinkedIn-specific
- There's no concept of Twitter threads, tweets, or Twitter-specific formats

### 6.2 Architecture: Platform Abstraction Layer

Instead of duplicating the entire pipeline for Twitter, introduce a **platform abstraction** that runs on top of the existing pipeline:

```
┌──────────────────────────────────────────────────────────────────┐
│                  MULTI-PLATFORM ARCHITECTURE                       │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Existing Pipeline (unchanged):                                   │
│    Persona → Trends → Content Ideas                               │
│                                                                    │
│  NEW: Platform Adapter Layer                                      │
│    ↓                                                              │
│    Content Ideas (platform-agnostic)                              │
│         ↓                                                         │
│    ┌──────────────┐     ┌──────────────┐                          │
│    │   LinkedIn    │     │   Twitter    │                          │
│    │   Adapter     │     │   Adapter    │                          │
│    ├──────────────┤     ├──────────────┤                          │
│    │ max 3000 chr │     │ max 280 chr  │                          │
│    │ carousel     │     │ tweet        │                          │
│    │ text-post    │     │ thread       │                          │
│    │ poll         │     │ poll         │                          │
│    │ video-script │     │ quote-tweet  │                          │
│    │ list         │     │ image-tweet  │                          │
│    └──────────────┘     └──────────────┘                          │
│                                                                    │
│  Each adapter transforms the suggestion into platform-specific    │
│  format, constraints, and best practices.                         │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 6.3 Platform Config

```typescript
// NEW: config/platforms.ts

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
    id: 'linkedin',
    name: 'LinkedIn',
    maxChars: 3000,
    supportsThreads: false,
    formats: ['carousel', 'text-post', 'poll', 'video-script', 'list'],
    hashtagStrategy: '3-5 hashtags at the end of the post',
    bestPractices: 'Use short paragraphs, line breaks for readability, hook in first line',
  },
  twitter: {
    id: 'twitter',
    name: 'Twitter/X',
    maxChars: 280,
    supportsThreads: true,
    threadMaxTweets: 25,
    formats: ['tweet', 'thread', 'poll', 'quote-tweet', 'image-tweet'],
    hashtagStrategy: '1-2 hashtags max, integrated naturally',
    bestPractices: 'Concise, punchy, hook in first tweet. Threads: each tweet should standalone',
  },
};
```

### 6.4 Content Generator Enhancement

The content generator prompt needs to be platform-aware:

```typescript
// In contentGenerator.ts — update prompt builder:

function buildPlatformSection(platforms: string[]): string {
  if (!platforms.length || (platforms.length === 1 && platforms[0] === 'linkedin')) {
    return ''; // default LinkedIn behavior, no extra prompt needed
  }

  const lines = ['\n## PLATFORM REQUIREMENTS'];
  for (const platformId of platforms) {
    const config = PLATFORMS[platformId];
    if (!config) continue;
    lines.push(`\n### ${config.name}`);
    lines.push(`- Max characters: ${config.maxChars}`);
    lines.push(`- Formats: ${config.formats.join(', ')}`);
    lines.push(`- Hashtag strategy: ${config.hashtagStrategy}`);
    lines.push(`- Best practices: ${config.bestPractices}`);
    if (config.supportsThreads) {
      lines.push(`- Thread support: Yes (max ${config.threadMaxTweets} tweets per thread)`);
    }
  }
  lines.push('\nFor EACH idea, specify which platform it targets in the "platform" field.');

  return lines.join('\n');
}
```

### 6.5 Updated Suggestion Schema

```typescript
// Extend ISuggestion:

export type SuggestionPlatform = 'linkedin' | 'twitter';

export interface ISuggestion {
  // ...existing fields...
  platform: SuggestionPlatform;              // NEW: which platform this targets

  // Twitter-specific fields (only present when platform = 'twitter')
  threadContent?: Array<{                    // NEW: for Twitter threads
    tweetIndex: number;
    content: string;
    charCount: number;
  }>;
}
```

### 6.6 Frontend: Platform Selection

```
// On GenerateOptionsPanel — add platform selector:

Target Platform:
  [LinkedIn (default)] [Twitter/X] [Both]

// When "Both" selected:
//   - Pipeline generates ideas for both platforms
//   - Results display in two tabs: LinkedIn | Twitter

// When "Twitter" selected:
//   - Formats change to Twitter-specific
//   - Character limit guidance shown
//   - Thread option becomes available
```

### 6.7 Twitter Thread Builder

When a suggestion is for Twitter and format is "thread", the AI auto-generates individual tweets:

```typescript
// In postEditor.ts — Twitter thread mode:

// The editor UI changes to show numbered tweet boxes:
// Tweet 1/5: [280 chars] ✓
// Tweet 2/5: [280 chars] ✓
// Tweet 3/5: [212 chars] ✓
// ...
// [+ Add Tweet] [Remove Last]
```

### 6.8 Generation Context Update

```typescript
// Update IGenerateContextOptions:

export interface IGenerateContextOptions {
  // ...existing fields...
  platforms?: SuggestionPlatform[];  // NEW: target platforms (default: ['linkedin'])
}
```

### 6.9 Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `config/platforms.ts` | **CREATE** | Platform configuration constants |
| `agents/contentGenerator.ts` | **MODIFY** | Add `buildPlatformSection()`, update schema |
| `models/ContentSuggestion.ts` | **MODIFY** | Add `platform` field to suggestion item |
| `packages/shared-types/src/index.ts` | **MODIFY** | Add `SuggestionPlatform`, update types |
| `components/suggestions/GenerateOptionsPanel.tsx` | **MODIFY** | Add platform selector |
| `components/suggestions/SuggestionCard.tsx` | **MODIFY** | Show platform badge |
| `components/editor/PostEditorPane.tsx` | **MODIFY** | Twitter thread editor mode |
| `models/PostDraft.ts` | **MODIFY** | Already has `twitterThread` field |
| `routes/suggestions.ts` | **MODIFY** | Accept `platforms` in generate schema |

---

## 7. Feature: Admin Dashboard with Security

### 7.1 The Problem

Current admin functionality is limited to two unsecured endpoints:
- `GET /api/tokens/admin/requests` — anyone can see all users' requests
- `PATCH /api/tokens/admin/requests/:id` — anyone can approve/reject

There is no:
- Admin role system
- Admin authentication beyond regular JWT
- Dashboard UI for admin operations
- User management capabilities
- System analytics
- Audit logging

### 7.2 Admin Role System

#### 7.2.1 User Model Extension

```typescript
// In User model — add role field:

export type UserRole = 'user' | 'admin';

// Add to userSchema:
role: {
  type: String,
  enum: ['user', 'admin'],
  default: 'user',
},
```

#### 7.2.2 Initial Admin Seeding

As per the user's requirement: admin starts with null email/password, then updates them later.

```typescript
// NEW: services/adminSeed.ts

export async function seedAdminAccount(): Promise<void> {
  const existingAdmin = await User.findOne({ role: 'admin' });
  if (existingAdmin) {
    console.log('[admin] Admin account already exists:', existingAdmin.email);
    return;
  }

  // Create admin with placeholder credentials
  // Admin MUST update email and password on first login
  const placeholderEmail = `admin-${Date.now()}@placeholder.local`;
  const placeholderPassword = crypto.randomBytes(32).toString('hex'); // random, unusable

  const admin = await User.create({
    email: placeholderEmail,
    password: placeholderPassword, // will be hashed by pre-save hook
    name: 'System Administrator',
    role: 'admin',
    requiresSetup: true, // NEW field — forces setup on first access
  });

  console.log('[admin] Admin account seeded. ID:', admin._id);
  console.log('[admin] ⚠ Admin must complete setup at /admin/setup');
}
```

#### 7.2.3 Admin Setup Flow

```
FIRST TIME:
  Admin navigates to /admin/setup
    ↓
  POST /api/admin/setup with { setupToken, email, password }
    setupToken = one-time token generated during seeding, stored in SystemConfig
    ↓
  If valid: update admin email + password, set requiresSetup=false
  If already set up: return 409 "Admin already configured"
    ↓
  Admin can now log in normally at /login with their new credentials

SUBSEQUENT:
  Admin logs in at /login → JWT contains role='admin'
    ↓
  Admin-only routes check req.userRole === 'admin'
    ↓
  Admin dashboard accessible at /admin/*
```

### 7.3 Admin Middleware

```typescript
// NEW: middleware/adminAuth.ts

import { AuthRequest } from './auth';
import { User } from '../models/User';
import { Response, NextFunction } from 'express';

/**
 * Middleware that requires the authenticated user to have role='admin'.
 * Must be used AFTER the standard `authenticate` middleware.
 *
 * Flow: authenticate → requireAdmin → route handler
 */
export async function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await User.findById(req.userId).select('role').lean();

    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }

    next();
  } catch (err) {
    res.status(500).json({ error: 'Authorization check failed.' });
  }
}
```

### 7.4 Admin API Routes

```typescript
// NEW: routes/admin.ts

router.use(authenticate, requireAdmin); // ALL admin routes require admin role

// ── User Management ──────────────────────────────────────────────

GET    /api/admin/users                   // Paginated user list with activity metadata
GET    /api/admin/users/:id               // Single user detail + persona + usage
PATCH  /api/admin/users/:id               // Update user (role, tokenLimit, etc.)
DELETE /api/admin/users/:id               // Soft-delete / deactivate user

// ── Token Requests ───────────────────────────────────────────────
// (moved from tokenUsage.ts to admin.ts with proper auth)

GET    /api/admin/token-requests           // List all requests (filterable by status)
PATCH  /api/admin/token-requests/:id       // Approve / reject

// ── Analytics ────────────────────────────────────────────────────

GET    /api/admin/analytics/overview       // Key metrics
GET    /api/admin/analytics/usage          // Token usage over time
GET    /api/admin/analytics/activity       // User activity timeline

// ── System Config ────────────────────────────────────────────────

GET    /api/admin/config                   // Read all system config values
PATCH  /api/admin/config/:key              // Update a config value

// ── Admin Profile ────────────────────────────────────────────────

GET    /api/admin/profile                  // Get admin's own profile
PATCH  /api/admin/profile                  // Update email / password
```

### 7.5 Analytics: Overview Endpoint

```typescript
// GET /api/admin/analytics/overview

{
  users: {
    total: 142,
    activeThisWeek: 37,
    activeThisMonth: 89,
    newThisWeek: 5,
  },
  tokens: {
    totalUsed: 12_450_000,
    averagePerUser: 87_676,
    topConsumer: { userId: '...', email: '...', tokensUsed: 450_000 },
    pendingRequests: 3,
  },
  content: {
    totalSuggestionsGenerated: 1_247,
    totalDraftsCreated: 389,
    totalPostsPublished: 112,
    averageSuggestionsPerUser: 8.8,
    averageFeedbackRating: 3.1,
  },
  pipeline: {
    averageGenerationTimeMs: 8_500,
    trendSourceDistribution: { live: 0.72, fallback: 0.28 },
    errorRate: 0.03,
  },
}
```

### 7.6 Admin Frontend

```
/admin/                    — Dashboard overview with metrics cards
/admin/users               — User management table
/admin/users/:id           — Individual user detail
/admin/token-requests      — Token increase request queue
/admin/analytics           — Charts and trends
/admin/config              — System configuration editor
/admin/profile             — Admin profile settings (email/password)
```

### 7.7 Admin Dashboard Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Admin Dashboard                                    [Admin ▼]    │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  [Overview] [Users] [Token Requests] [Analytics] [Config]        │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ 142      │  │ 37       │  │ 12.4M    │  │ 3        │        │
│  │ Total    │  │ Active   │  │ Tokens   │  │ Pending  │        │
│  │ Users    │  │ This Wk  │  │ Used     │  │ Requests │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│                                                                   │
│  ── Recent Activity ────────────────────────────────────────     │
│                                                                   │
│  john@co.com   Generated 8 ideas          2 min ago             │
│  sarah@biz.io  Published "AI adoption.."  15 min ago            │
│  mike@dev.com  Requested token increase   1 hr ago              │
│                                                                   │
│  ── Token Requests Queue ───────────────────────────────────     │
│                                                                   │
│  mike@dev.com   Used: 280K/300K   "Need more for Q1 campaign"   │
│  [Approve: 500K ▼] [Reject] [View User]                         │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 7.8 Security Measures

| Measure | Implementation |
|---------|---------------|
| Role-based access | `requireAdmin` middleware on all `/api/admin/*` routes |
| Admin setup token | One-time token stored in `SystemConfig`, deleted after first use |
| Password requirements | Min 12 chars for admin (stricter than user min 8) |
| Rate limiting | Separate stricter limiter on admin routes (10 req/min) |
| Audit logging | All admin actions logged to `AdminAuditLog` collection |
| Session isolation | Admin JWT includes `role` claim, verified on each request |
| IP logging | Admin login attempts logged with IP for security review |

### 7.9 Admin Audit Log

```typescript
// NEW: models/AdminAuditLog.ts

export interface IAdminAuditLog extends Document {
  adminId: mongoose.Types.ObjectId;
  action: string;       // 'approve_token_request', 'reject_token_request', 'update_user', etc.
  targetUserId?: mongoose.Types.ObjectId;
  details: Record<string, unknown>;  // what was changed
  ip: string;
  userAgent: string;
  createdAt: Date;
}
```

### 7.10 Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `middleware/adminAuth.ts` | **CREATE** | `requireAdmin` middleware |
| `services/adminSeed.ts` | **CREATE** | First-time admin seeding |
| `routes/admin.ts` | **CREATE** | All admin API endpoints |
| `models/AdminAuditLog.ts` | **CREATE** | Audit log for admin actions |
| `models/User.ts` | **MODIFY** | Add `role`, `requiresSetup` fields |
| `routes/tokenUsage.ts` | **MODIFY** | Remove unsecured admin endpoints |
| `index.ts` | **MODIFY** | Register admin routes, call seedAdmin |
| `middleware/auth.ts` | **MODIFY** | Include `role` in JWT payload |
| `app/admin/layout.tsx` | **CREATE** | Admin layout with sidebar |
| `app/admin/page.tsx` | **CREATE** | Overview dashboard |
| `app/admin/users/page.tsx` | **CREATE** | User management |
| `app/admin/token-requests/page.tsx` | **CREATE** | Request queue |
| `app/admin/analytics/page.tsx` | **CREATE** | Charts |
| `app/admin/config/page.tsx` | **CREATE** | System config |
| `app/admin/profile/page.tsx` | **CREATE** | Admin profile |
| `app/admin/setup/page.tsx` | **CREATE** | First-time setup |
| `middleware.ts` (Next.js) | **MODIFY** | Add admin route protection |
| `packages/shared-types/src/index.ts` | **MODIFY** | Add admin interfaces |
| `apps/web/src/lib/api.ts` | **MODIFY** | Add `adminApi` methods |

---

## 8. Continuous Persona Learning System

### 8.1 The Core Vision

The persona should not be a static profile that only updates when the user explicitly adds posts or edits it. It should be a **living document** that evolves with every user interaction:

```
┌──────────────────────────────────────────────────────────────────┐
│              CONTINUOUS PERSONA LEARNING SYSTEM                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Signal Sources (automatic — no user action needed):              │
│                                                                    │
│  1. FEEDBACK on suggestions                                       │
│     "Loved this AI adoption post" → preferredTopics += AI         │
│     "Bad — too generic" → reduce generic angles                   │
│                                                                    │
│  2. DRAFTS created from suggestions                               │
│     User chose to write suggestion #3 → strong positive signal    │
│     User ignored suggestions #1,2,4,5 → weak negative signal     │
│                                                                    │
│  3. EDITS in the post editor                                      │
│     User changed tone from formal to casual → tonePreference      │
│     User added personal stories → writingStyle update             │
│     User shortened from 2500 to 1200 chars → length preference   │
│                                                                    │
│  4. PUBLISHED posts                                               │
│     Published post added to scrapedPosts → persona re-analysis    │
│     Published post = strongest positive signal                    │
│                                                                    │
│  5. PERSONA CHAT conversations                                    │
│     "I want to focus more on leadership" → direct persona update  │
│     (already implemented)                                         │
│                                                                    │
│  6. GENERATION PATTERNS                                           │
│     User always picks "topic-focus" mode → prefers specific       │
│     User always overrides audience → default isn't right          │
│     User generates 3x/week → high engagement signal               │
│                                                                    │
│  Signal Processing:                                                │
│                                                                    │
│    Raw Signals → Signal Aggregator → Persona Update Queue         │
│                                         ↓                         │
│                               Periodic Batch Update               │
│                               (every 5 feedbacks OR               │
│                                every published post OR             │
│                                daily cron)                         │
│                                         ↓                         │
│                               UserPersona.$set({                  │
│                                 feedbackProfile: {...},            │
│                                 learningSignals: {...},            │
│                                 lastLearningUpdate: Date           │
│                               })                                  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 8.2 Signal Types and Weights

```typescript
// NEW: services/personaLearning.ts

export interface LearningSignal {
  type: 'feedback' | 'draft-created' | 'edit-pattern' | 'published' | 'generation-pattern';
  weight: number;       // 0-1 — how strong this signal is
  timestamp: Date;
  data: Record<string, unknown>;
}

export const SIGNAL_WEIGHTS = {
  // Explicit signals (user consciously acted)
  'feedback-loved': 1.0,
  'feedback-good': 0.6,
  'feedback-meh': 0.2,
  'feedback-bad': -0.8,    // negative signal

  // Action signals (user behavior)
  'draft-created': 0.7,    // user chose to write this
  'draft-ignored': -0.1,   // weak negative (maybe they just didn't get to it)
  'published': 1.0,        // strongest positive — user put their name on it

  // Edit signals (inferred from changes)
  'tone-shifted': 0.5,     // user changed tone in editor
  'length-shortened': 0.3, // user prefers shorter content
  'length-expanded': 0.3,  // user prefers longer content
  'format-changed': 0.4,   // user changed suggested format

  // Generation pattern signals (aggregate behavior)
  'always-topic-focus': 0.6,  // user consistently uses topic-focus mode
  'always-overrides-audience': 0.4, // user's default audience is wrong
};
```

### 8.3 Signal Collection Points

#### At Suggestion Feedback (Section 3):
```typescript
// When feedback is submitted:
emitLearningSignal({
  type: 'feedback',
  weight: SIGNAL_WEIGHTS[`feedback-${rating}`],
  data: {
    topic: suggestion.topic,
    format: suggestion.format,
    angle: suggestion.angle,
    rating,
    feedbackText,
  },
});
```

#### At Draft Creation (Section 4):
```typescript
// When user clicks "Write This Post":
emitLearningSignal({
  type: 'draft-created',
  weight: SIGNAL_WEIGHTS['draft-created'],
  data: {
    topic: suggestion.topic,
    format: suggestion.format,
    sourceSuggestionIndex,
  },
});

// For suggestions NOT drafted (calculated on next generation):
// Compare previous suggestion set's suggestions vs which were drafted
```

#### At Post Editor Edits (Section 4):
```typescript
// Compare original AI-generated draft vs user's final edit:
const editAnalysis = analyzeEdits(originalDraft, finalContent);
// Returns: { toneShift, lengthDelta, formatChange, personalStoryAdded, ... }

if (editAnalysis.toneShift !== 'none') {
  emitLearningSignal({
    type: 'edit-pattern',
    weight: SIGNAL_WEIGHTS['tone-shifted'],
    data: { from: editAnalysis.originalTone, to: editAnalysis.newTone },
  });
}
```

#### At Publication (Section 5):
```typescript
// Strongest signal — user published this:
emitLearningSignal({
  type: 'published',
  weight: SIGNAL_WEIGHTS['published'],
  data: {
    topic: draft.title,
    platform: draft.platform,
    charCount: draft.charCount,
    hadThread: draft.twitterThread?.length > 1,
  },
});
```

### 8.4 Signal Aggregation Service

```typescript
// NEW: services/personaLearning.ts

import type { IUserPersonaDocument } from '../models/UserPersona';
import { SuggestionFeedback } from '../models/SuggestionFeedback';
import { PostDraft } from '../models/PostDraft';

/**
 * Aggregates all learning signals for a user and updates their persona.
 * Called:
 *   - After every 5th feedback submission
 *   - After every published post
 *   - On a daily cron job (catches edge cases)
 */
export async function aggregateAndUpdatePersona(userId: string): Promise<void> {
  // 1. Fetch last 30 days of signals
  const [feedbacks, publishedDrafts] = await Promise.all([
    SuggestionFeedback.find({ userId, createdAt: { $gte: thirtyDaysAgo } })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    PostDraft.find({ userId, status: 'published', publishedAt: { $gte: thirtyDaysAgo } })
      .lean(),
  ]);

  // 2. Compute topic preferences
  const topicScores = new Map<string, number>();
  for (const fb of feedbacks) {
    const weight = SIGNAL_WEIGHTS[`feedback-${fb.rating}`] ?? 0;
    const topic = fb.suggestionSnapshot.topic;
    topicScores.set(topic, (topicScores.get(topic) ?? 0) + weight);
  }

  const preferredTopics = [...topicScores.entries()]
    .filter(([_, score]) => score > 0.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic]) => topic);

  const avoidTopics = [...topicScores.entries()]
    .filter(([_, score]) => score < -0.3)
    .map(([topic]) => topic);

  // 3. Compute format preferences
  const formatCounts = new Map<string, number>();
  for (const fb of feedbacks.filter(f => f.rating === 'loved' || f.rating === 'good')) {
    const format = fb.suggestionSnapshot.format;
    formatCounts.set(format, (formatCounts.get(format) ?? 0) + 1);
  }
  const totalPositive = [...formatCounts.values()].reduce((a, b) => a + b, 0) || 1;
  const formatPreferences: Record<string, number> = {};
  for (const [format, count] of formatCounts) {
    formatPreferences[format] = count / totalPositive;
  }

  // 4. Compute average rating
  const ratings = feedbacks.filter(f => f.rating).map(f => {
    const map = { loved: 4, good: 3, meh: 2, bad: 1 };
    return map[f.rating!] ?? 2;
  });
  const averageRating = ratings.length > 0
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : 0;

  // 5. Detect content length preference from published drafts
  const avgLength = publishedDrafts.length > 0
    ? publishedDrafts.reduce((sum, d) => sum + d.charCount, 0) / publishedDrafts.length
    : null;

  // 6. Update UserPersona with learned signals
  await UserPersona.updateOne(
    { userId: new mongoose.Types.ObjectId(userId) },
    {
      $set: {
        feedbackProfile: {
          preferredTopics,
          avoidTopics,
          formatPreferences,
          averageRating,
          totalFeedbackCount: feedbacks.length,
          lastFeedbackAt: feedbacks[0]?.createdAt ?? null,
          averageContentLength: avgLength,
        },
        lastLearningUpdate: new Date(),
      },
    },
  );
}
```

### 8.5 UserPersona Schema — Complete Learning Extension

```typescript
// Add to UserPersona model:

// Learning signals (auto-updated by personaLearning service)
feedbackProfile: {
  preferredTopics: [String],
  avoidTopics: [String],
  formatPreferences: Schema.Types.Mixed,   // { carousel: 0.4, 'text-post': 0.3 }
  tonePreference: String,
  averageRating: { type: Number, default: 0 },
  totalFeedbackCount: { type: Number, default: 0 },
  lastFeedbackAt: Date,
  averageContentLength: Number,            // from published drafts
},
lastLearningUpdate: Date,
```

### 8.6 Content Generator — Full Learning Integration

The content generator prompt becomes:

```
## CREATOR PROFILE
[existing persona summary]

## USER FEEDBACK SIGNALS (from past suggestions)
[Section from 3.8 — topics to love/avoid, format prefs, etc.]

## CURRENT TRENDS IN THEIR NICHE
[existing trends]

## GENERATION CONTEXT OVERRIDE
[existing context section]
```

This means every generation benefits from all accumulated learning signals.

### 8.7 Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `services/personaLearning.ts` | **CREATE** | Signal aggregation + persona update |
| `models/UserPersona.ts` | **MODIFY** | Add `feedbackProfile`, `lastLearningUpdate` |
| `agents/contentGenerator.ts` | **MODIFY** | Add `buildFeedbackSection()` to prompt |
| `routes/feedback.ts` | **MODIFY** | Trigger `aggregateAndUpdatePersona` after every 5th feedback |
| `routes/drafts.ts` | **MODIFY** | Emit learning signals on draft/publish |
| `packages/shared-types/src/index.ts` | **MODIFY** | Add learning signal types |

---

## 9. Prioritized Action Plan & Dependency Graph

### Phase A — Critical Fixes (Do Immediately)

| # | Action | Section | Files | Effort |
|---|--------|---------|-------|--------|
| 1 | Add admin authorization middleware | §2.1, §7.3 | `middleware/adminAuth.ts` (CREATE), `routes/tokenUsage.ts` | 2 hours |
| 2 | Fix pipeline `postsArray` gap | §2.2 | `agents/mastra.ts` | 30 min |
| 3 | Fix `DEFAULT_TIMEOUT_MS` to 80_000 | §2.3 | `index.ts` | 5 min |
| 4 | Fix `mergePersonaAnalysis` overwrite bug | §2.5 | `services/personaMerge.ts` | 1 hour |
| 5 | Add post-parse suggestion count check | §2.6 | `agents/contentGenerator.ts` | 15 min |

### Phase B — Data Models & Backend Foundation (Week 1)

| # | Action | Section | Files | Effort |
|---|--------|---------|-------|--------|
| 6 | Create `SuggestionFeedback` model | §3.2 | `models/SuggestionFeedback.ts` (CREATE) | 1 hour |
| 7 | Create `PostDraft` model | §4.4 | `models/PostDraft.ts` (CREATE) | 1 hour |
| 8 | Create `AdminAuditLog` model | §7.9 | `models/AdminAuditLog.ts` (CREATE) | 30 min |
| 9 | Extend `User` model with `role` field | §7.2 | `models/User.ts` | 30 min |
| 10 | Extend `UserPersona` with `feedbackProfile` | §3.7, §8.5 | `models/UserPersona.ts` | 1 hour |
| 11 | Extend `ChatSession` with 'post-editor' type | §4.6 | `models/ChatSession.ts` | 15 min |
| 12 | Create platform config | §6.3 | `config/platforms.ts` (CREATE) | 30 min |
| 13 | Add trend caching service | §2.4 | `services/trendCache.ts` (CREATE) | 2 hours |
| 14 | Update shared types for all new features | §3-8 | `packages/shared-types/src/index.ts` | 2 hours |

### Phase C — Feedback Loop (Week 1-2)

| # | Action | Section | Files | Effort |
|---|--------|---------|-------|--------|
| 15 | Create feedback API routes | §3.3 | `routes/feedback.ts` (CREATE) | 3 hours |
| 16 | Create feedback processor service | §3.5 | `services/feedbackProcessor.ts` (CREATE) | 2 hours |
| 17 | Build feedback UI on SuggestionCard | §3.4 | `components/suggestions/SuggestionCard.tsx` | 3 hours |
| 18 | Add feedback API client | §3.9 | `apps/web/src/lib/api.ts` | 30 min |
| 19 | Integrate feedback into content generator prompt | §3.8 | `agents/contentGenerator.ts` | 2 hours |

### Phase D — Post Editor & AI Co-Writing (Week 2-3)

| # | Action | Section | Files | Effort |
|---|--------|---------|-------|--------|
| 20 | Create Post Editor Agent (Agent 6) | §4.3 | `agents/postEditor.ts` (CREATE) | 3 hours |
| 21 | Register agent in Mastra instance | §4.3 | `agents/mastra.ts` | 15 min |
| 22 | Create drafts API routes (CRUD + chat) | §4.5 | `routes/drafts.ts` (CREATE) | 4 hours |
| 23 | Create draft service layer | §4.5 | `services/draftService.ts` (CREATE) | 2 hours |
| 24 | Build editor page with split panes | §4.8 | `app/dashboard/editor/page.tsx` (CREATE) | 6 hours |
| 25 | Build PostEditorPane component | §4.8 | `components/editor/PostEditorPane.tsx` (CREATE) | 4 hours |
| 26 | Build EditorChatPane component | §4.8 | `components/editor/EditorChatPane.tsx` (CREATE) | 3 hours |
| 27 | Add [Write This Post] button to SuggestionCard | §4.9 | `components/suggestions/SuggestionCard.tsx` | 1 hour |
| 28 | Add drafts API client | §4.9 | `apps/web/src/lib/api.ts` | 1 hour |

### Phase E — Post Library (Week 3)

| # | Action | Section | Files | Effort |
|---|--------|---------|-------|--------|
| 29 | Build post library page | §5.2 | `app/dashboard/posts/page.tsx` (CREATE) | 4 hours |
| 30 | Build PostListItem component | §5.5 | `components/posts/PostListItem.tsx` (CREATE) | 2 hours |
| 31 | Implement "Feed to Persona" publish flow | §5.3 | `routes/drafts.ts` | 2 hours |
| 32 | Add "My Posts" to sidebar | §5.5 | `components/layout/Sidebar.tsx` | 30 min |

### Phase F — Twitter/X Support (Week 3-4)

| # | Action | Section | Files | Effort |
|---|--------|---------|-------|--------|
| 33 | Add platform field to suggestion schema | §6.5 | `models/ContentSuggestion.ts` | 1 hour |
| 34 | Add platform section to content generator | §6.4 | `agents/contentGenerator.ts` | 3 hours |
| 35 | Build platform selector on GenerateOptionsPanel | §6.6 | `components/suggestions/GenerateOptionsPanel.tsx` | 2 hours |
| 36 | Build Twitter thread editor mode | §6.7 | `components/editor/PostEditorPane.tsx` | 4 hours |
| 37 | Add platform badge to SuggestionCard | §6.9 | `components/suggestions/SuggestionCard.tsx` | 1 hour |
| 38 | Update generate route to accept platforms | §6.9 | `routes/suggestions.ts` | 1 hour |

### Phase G — Admin Dashboard (Week 4-5)

| # | Action | Section | Files | Effort |
|---|--------|---------|-------|--------|
| 39 | Create admin seed service | §7.2 | `services/adminSeed.ts` (CREATE) | 2 hours |
| 40 | Create admin API routes | §7.4 | `routes/admin.ts` (CREATE) | 6 hours |
| 41 | Move admin token endpoints from tokenUsage | §7.4 | `routes/tokenUsage.ts`, `routes/admin.ts` | 1 hour |
| 42 | Build admin layout | §7.6 | `app/admin/layout.tsx` (CREATE) | 2 hours |
| 43 | Build admin overview page | §7.7 | `app/admin/page.tsx` (CREATE) | 4 hours |
| 44 | Build user management page | §7.6 | `app/admin/users/page.tsx` (CREATE) | 4 hours |
| 45 | Build token requests page | §7.6 | `app/admin/token-requests/page.tsx` (CREATE) | 3 hours |
| 46 | Build analytics page | §7.6 | `app/admin/analytics/page.tsx` (CREATE) | 4 hours |
| 47 | Build admin profile + setup pages | §7.6 | `app/admin/profile/page.tsx`, `setup/page.tsx` (CREATE) | 3 hours |
| 48 | Add admin route protection to Next.js middleware | §7.10 | `middleware.ts` | 1 hour |
| 49 | Add admin API client | §7.10 | `apps/web/src/lib/api.ts` | 2 hours |

### Phase H — Continuous Persona Learning (Week 5)

| # | Action | Section | Files | Effort |
|---|--------|---------|-------|--------|
| 50 | Create persona learning service | §8.4 | `services/personaLearning.ts` (CREATE) | 4 hours |
| 51 | Wire learning signals to feedback routes | §8.3 | `routes/feedback.ts` | 1 hour |
| 52 | Wire learning signals to draft routes | §8.3 | `routes/drafts.ts` | 1 hour |
| 53 | Integrate learning into content generator prompt | §8.6 | `agents/contentGenerator.ts` | 2 hours |
| 54 | Add generation analytics to pipeline | §2.10 | `agents/mastra.ts`, `models/ContentSuggestion.ts` | 2 hours |

### Phase I — Polish & Integration Testing

| # | Action | Section | Files | Effort |
|---|--------|---------|-------|--------|
| 55 | Fix token tracking desync (Promise.allSettled) | §2.7 | `services/tokenUsage.ts` | 30 min |
| 56 | Make ChatSession index unique | §2.8 | `models/ChatSession.ts`, `services/chatSessionService.ts` | 1 hour |
| 57 | Persist trendSource in ContentSuggestion | §2.9 | `models/ContentSuggestion.ts`, `agents/mastra.ts` | 30 min |
| 58 | End-to-end testing: feedback → learning → generation | all | Manual testing | 4 hours |
| 59 | End-to-end testing: suggestion → draft → publish → persona update | all | Manual testing | 4 hours |

---

### Implementation Dependency Graph

```
Phase A (Critical Fixes) ─── no dependencies, do first
    ↓
Phase B (Data Models) ─── foundation for everything else
    ↓
    ├──→ Phase C (Feedback Loop) ─── needs SuggestionFeedback model
    │       ↓
    ├──→ Phase D (Post Editor) ─── needs PostDraft model + ChatSession extension
    │       ↓
    │   Phase E (Post Library) ─── needs PostDraft from Phase D
    │       ↓
    │   Phase H (Persona Learning) ─── needs Feedback + Drafts + Publish flow
    │
    ├──→ Phase F (Twitter) ─── needs platform config, can parallel with D/E
    │
    └──→ Phase G (Admin Dashboard) ─── needs User.role, can parallel with C/D/E
              ↓
         Phase I (Polish) ─── after all features are built
```

**Parallel execution opportunities:**
- Phase C + Phase F can run in parallel (different developers)
- Phase D + Phase G can run in parallel (different developers)
- Phase E depends on Phase D but Phase F is independent

### Estimated Total Effort

| Phase | Items | Hours |
|-------|-------|-------|
| A — Critical Fixes | 5 | 4 |
| B — Data Models | 9 | 10 |
| C — Feedback Loop | 5 | 11 |
| D — Post Editor | 9 | 24 |
| E — Post Library | 4 | 9 |
| F — Twitter Support | 6 | 12 |
| G — Admin Dashboard | 11 | 32 |
| H — Persona Learning | 5 | 10 |
| I — Polish | 5 | 10 |
| **TOTAL** | **59** | **~122 hours** |

---

*End of Phase 2 audit report.*

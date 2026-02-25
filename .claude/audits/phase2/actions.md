# Audit Implementation Action Tracker — Phase 2

**Source**: `/Users/hexahealth/Documents/PP/content-generator/.claude/audits/phase2/improvement.md`
**Started**: 2026-02-26
**Last Updated**: 2026-02-26

---

## How to Resume

If context runs out, come back here and:

1. Read this file to see what is done and what is next
2. Start from the first unchecked `[ ]` item
3. Do NOT redo completed `[x]` items
4. Read the referenced improvement.md section (e.g. §2.1) for full implementation details and code snippets

---

## Phase A — Critical Fixes ✅ COMPLETE (2026-02-26)

*These 5 items block production use and have no dependencies on other phases.*

- [x] **#1 — Admin authorization middleware** (`middleware/adminAuth.ts` CREATE, `routes/tokenUsage.ts` MODIFY): Created `requireAdmin` middleware — fetches `User.findById(req.userId).select('role')`, returns `403` if not `'admin'`. Applied to both `GET /api/tokens/admin/requests` and `PATCH /api/tokens/admin/requests/:id` via inline `requireAdmin` argument. ✅ DONE
- [x] **#2 — Fix `postsArray` gap in pipeline** (`agents/mastra.ts` MODIFY): Added `postsArray?: string[]` to `PipelineInput`. Step 1 now checks `input.postsArray?.length` first — if present, uses directly; otherwise falls through to `resolvePostsFromInput()`. ✅ DONE
- [x] **#3 — Fix `DEFAULT_TIMEOUT_MS` value** (`index.ts` MODIFY): Changed from `180_000` to `30_000`. Comment updated to match. ✅ DONE
- [x] **#4 — Fix `mergePersonaAnalysis` overwrite bug** (`services/personaMerge.ts` MODIFY): Added `blendTextFields(existing, incoming, existingWeight)` helper. `mergePersonaAnalysis` now accepts `newPostCount` parameter; computes `existingWeight = existingCount / totalCount`; if `existingWeight > 0.7` appends `"— with emerging X tendencies"` instead of replacing. Updated call site in `routes/persona.ts` to pass `uniqueNewPosts.length`. ✅ DONE
- [x] **#5 — Post-parse suggestion count check** (`agents/contentGenerator.ts` MODIFY): After `ContentIdeasSchema.parse(raw)`, throws if `ideas.ideas.length < 3` — triggers retry on the next attempt. ✅ DONE

---

## Phase B — Data Models & Backend Foundation ✅ COMPLETE (2026-02-26)

*Foundation layer — all subsequent phases depend on this being complete first.*

- [x] **#6 — Create `SuggestionFeedback` model** (`models/SuggestionFeedback.ts` CREATE): Fields: `userId` (ref User), `suggestionSetId` (ref ContentSuggestion), `suggestionIndex` (number), `rating` (enum: `'loved' | 'good' | 'meh' | 'bad'`, optional), `action` (enum: `'saved' | 'draft' | 'published' | 'dismissed'`, required), `feedbackText` (string, maxlength 1000), `parsedSignals` (Mixed — topic relevance, tone match, format preference), `suggestionSnapshot` (topic, angle, format, hook). Indexes: `{ userId, createdAt: -1 }` and unique `{ userId, suggestionSetId, suggestionIndex }`. (§3.2) ✅ DONE
- [x] **#7 — Create `PostDraft` model** (`models/PostDraft.ts` CREATE): Fields: `userId` (ref User), `sourceSuggestionSetId` (optional ref ContentSuggestion), `sourceSuggestionIndex` (optional number), `platform` (enum: `'linkedin' | 'twitter'`), `title` (string), `content` (string — the post text), `contentHistory` (array of `{ content, editedAt, editedBy: 'user'|'ai', changeNote? }`), `brief` (topic, angle, format, hook, postPointers, callToAction, seoKeywords — all optional), `twitterThread` (array of `{ tweetIndex, content, charCount }` — Twitter-only), `status` (enum: `'drafting' | 'ready' | 'published'`), `charCount` (number), `chatSessionId` (string optional), `publishedAt` (Date optional). Timestamps on. Index: `{ userId, status, createdAt: -1 }`. (§4.4) ✅ DONE
- [x] **#8 — Create `AdminAuditLog` model** (`models/AdminAuditLog.ts` CREATE): Fields: `adminId` (ref User), `action` (string — e.g. `'approve_token_request'`), `targetUserId` (optional ref User), `details` (Mixed — what changed), `ip` (string), `userAgent` (string), `createdAt`. Index: `{ adminId, createdAt: -1 }`. (§7.9) ✅ DONE
- [x] **#9 — Add `role` and `requiresSetup` fields to User model** (`models/User.ts` MODIFY): Added `role: { type: String, enum: ['user', 'admin'], default: 'user' }` and `requiresSetup: { type: Boolean, default: false }` to `userSchema`. Added `UserRole = 'user' | 'admin'` type export. (§7.2.1, §7.3) ✅ DONE
- [x] **#10 — Add `feedbackProfile` to UserPersona model** (`models/UserPersona.ts` MODIFY): Added nested `feedbackProfile` schema with `preferredTopics`, `avoidTopics`, `formatPreferences`, `tonePreference`, `averageRating`, `totalFeedbackCount`, `lastFeedbackAt`, `averageContentLength`. Added `lastLearningUpdate: Date` at top level. (§3.7, §8.5) ✅ DONE
- [x] **#11 — Add `'post-editor'` agent type to ChatSession** (`models/ChatSession.ts` MODIFY): Updated `agentType` enum to include `'post-editor'`. Added unique index on `sessionId`. Updated `chatSessionService.ts` with atomic `findOneAndUpdate` upsert + `findOrCreateEditorSession(userId, draftId)` helper. (§4.6) ✅ DONE
- [x] **#12 — Create platform config** (`config/platforms.ts` CREATE): `PlatformConfig` interface, `PLATFORMS` record (linkedin: 3000 chars; twitter: 280 chars + 25-tweet threads), `getPlatformConfig()`, `DEFAULT_PLATFORM`, `SupportedPlatform` type. (§6.3) ✅ DONE
- [x] **#13 — Add trend caching service** (`services/trendCache.ts` CREATE, `agents/trendResearch.ts` MODIFY): In-memory Map-based TTL cache (30 min). `buildTrendCacheKey()` sorts keywords for deterministic keys. `trendResearch.ts` checks cache before calling `fetchRealTrendingContent()` and writes to cache on success. (§2.4) ✅ DONE
- [x] **#14 — Update shared types for all new features** (`packages/shared-types/src/index.ts` MODIFY): Added `SuggestionPlatform`, `FeedbackRating`, `FeedbackAction`, `ISuggestionFeedback`, `IFeedbackRequest`, `DraftStatus`, `DraftPlatform`, `IDraftContentHistory`, `IDraftBrief`, `ITwitterTweet`, `IPostDraft`, `ICreateDraftRequest`, `IUpdateDraftRequest`, `IDraftListItem`, `IAdminUser`, `IAdminAnalyticsOverview`, `IAdminAuditLogEntry`, `ILearningSignal`, `IPersonaLearningResult`. Updated `PostFormat` with Twitter formats, `ISuggestion` with `platform?` + `threadContent?`, `IGenerateContextOptions` with `platforms?`. ✅ DONE

---

## Phase C — Feedback Loop ✅ COMPLETE (2026-02-26)

*Depends on Phase B (specifically #6 SuggestionFeedback model and #10 UserPersona feedbackProfile).*

- [x] **#15 — Create feedback API routes** (`routes/feedback.ts` CREATE, `index.ts` MODIFY): 3 endpoints: `POST /api/suggestions/:setId/feedback` (zod validation, snapshot lookup, upsert feedback, fire-and-forget processFeedback), `GET /api/suggestions/:setId/feedback` (returns map keyed by suggestionIndex), `GET /api/feedback/summary` (preferred topics, avoid topics, format distribution, avg rating). Registered via `app.use('/api', feedbackRoutes)`. ✅ DONE
- [x] **#16 — Create feedback processor service** (`services/feedbackProcessor.ts` CREATE): `processFeedback()` is fire-and-forget. Background pipeline: (1) LLM signal parsing via Gemini when feedbackText present — extracts topicRelevance/toneMatch/formatPreference/specificNotes, saves via `$set`; (2) `_maybeTrigerLearning()` checks if count divisible by 5 and fires `aggregateAndUpdatePersona()`. Full aggregation function: tallies topic scores, format signals, computes normalised format preferences, updates `UserPersona.feedbackProfile`. ✅ DONE
- [x] **#17 — Build feedback UI on SuggestionCard** (`components/suggestions/SuggestionCard.tsx` MODIFY): Added optional `suggestionSetId` prop. Collapsible feedback panel with: ❤️/👍/😐/👎 rating toggle buttons, 📌/✏️/❌ action buttons, optional textarea (shown after any selection), Submit Feedback button (disabled until action selected), "✓ Feedback saved — thanks!" confirmation state, error state. `dashboard/page.tsx` stores `currentSuggestionSetId` and passes it down. Both `dashboard/page.tsx` and `suggestions/page.tsx` pass `suggestionSetId`. ✅ DONE
- [x] **#18 — Add feedback API client** (`apps/web/src/lib/api.ts` MODIFY): Added `feedbackApi` with `submit()`, `getForSet()`, `getSummary()`. Added `FeedbackRating`, `FeedbackAction`, `ISuggestionFeedback` to imports and re-exports. ✅ DONE
- [x] **#19 — Integrate feedback into content generator prompt** (`agents/contentGenerator.ts` MODIFY): Added `buildFeedbackSection(persona)` — returns `""` if `totalFeedbackCount < 3`; otherwise builds `## USER FEEDBACK SIGNALS` block with preferred topics, avoid topics, format preferences (≥10% only), tone preference, avg satisfaction score. Injected between trendsList and contextSection in the main prompt. ✅ DONE

---

## Phase D — Post Editor & AI Co-Writing

*Depends on Phase B (specifically #7 PostDraft model, #11 ChatSession extension, #12 platform config).*

- [ ] **#20 — Create Post Editor Agent (Agent 6)** (`agents/postEditor.ts` CREATE): New Mastra agent with `id: 'post-editor'`, model `google('gemini-2.5-flash')`. System prompt: writing partner with access to user persona, content brief, current draft, and chat history. Four roles: WRITE (generate draft from brief), EDIT (modify parts based on feedback), REFINE (tone/clarity/engagement/length), EXPAND/COMPRESS. Every response that modifies the post must include a hidden `<!--POST_CONTENT { "action": "replace"|"insert"|"append", "content": "...", "charCount": 1234, "explanation": "..." } POST_CONTENT-->` block. Platform rules: LinkedIn max 3000 chars + hashtags; Twitter max 280 per tweet + thread format. (§4.3)
- [ ] **#21 — Register post editor agent in Mastra** (`agents/mastra.ts` MODIFY): Import `postEditorAgent` from `./postEditor` and add it to the Mastra instance registration alongside the existing 5 agents. (§4.3)
- [ ] **#22 — Create drafts API routes** (`routes/drafts.ts` CREATE, `index.ts` MODIFY): Implement CRUD + chat: `POST /api/drafts` (create draft from suggestion or blank — accepts `sourceSuggestionSetId?`, `sourceSuggestionIndex?`, `platform`, `title`, `content`, `brief?`), `GET /api/drafts` (paginated list with optional `?status=` filter), `GET /api/drafts/:id`, `PATCH /api/drafts/:id` (update content/status — appends to `contentHistory` on content change), `DELETE /api/drafts/:id` (soft delete by status or hard delete), `POST /api/drafts/:id/chat` (chat with AI about this draft — passes persona + brief + current content to postEditorAgent; strips POST_CONTENT block before persisting to session; returns `{ reply, postContent? }`), `GET /api/drafts/:id/chat/history`, `POST /api/drafts/:id/publish` (see #31 in Phase E). Register in `index.ts`. (§4.5)
- [ ] **#23 — Create draft service layer** (`services/draftService.ts` CREATE): Extract business logic from the route handlers: `createDraft(userId, input)`, `getDraft(userId, draftId)`, `updateDraft(userId, draftId, changes)` — auto-appends to `contentHistory`, updates `charCount`, `getPublishedDrafts(userId)`, `buildEditorPrompt(draft, persona)` — constructs the agent prompt including persona summary, brief, and current content. (§4.5)
- [ ] **#24 — Build editor page** (`app/dashboard/editor/page.tsx` CREATE): Page reads `?draftId=` from URL. Fetches draft + loads persona. Left pane: `PostEditorPane`. Right pane: `EditorChatPane`. On initial load with empty content, auto-sends `__INIT__` message to chat endpoint which generates the first draft. Handles `postContent` response by updating editor content. Toolbar: Save Draft button (`PATCH /api/drafts/:id`), platform selector, char counter. (§4.8)
- [ ] **#25 — Build PostEditorPane component** (`components/editor/PostEditorPane.tsx` CREATE): Controlled `<textarea>` with real-time char count. Platform-aware: LinkedIn shows `"X / 3,000 chars"` + green/amber/red indicator; Twitter shows `"X / 280 chars"` per tweet. When platform is Twitter and content exceeds 280 chars, auto-split preview into tweets. "Save Draft" button, "Mark Ready" button, "Copy to Clipboard" button. Accepts `content`, `onChange`, `platform` props. (§4.8)
- [ ] **#26 — Build EditorChatPane component** (`components/editor/EditorChatPane.tsx` CREATE): Similar to existing `ChatInterface.tsx` but scoped to a draft. Shows chat messages, input box, [Send] button. When the API response contains a `postContent` field (extracted from the POST_CONTENT block), show an [Apply Edit] button that calls the parent's `onApplyEdit(content)` callback to inject into PostEditorPane. Props: `draftId`, `onApplyEdit`. (§4.8)
- [ ] **#27 — Add [Write This Post] button to SuggestionCard** (`components/suggestions/SuggestionCard.tsx` MODIFY): Add a "✏️ Write This Post" button in the suggestion card footer (alongside the existing "Copy Hook" button area). On click: call `draftsApi.create({ sourceSuggestionSetId, sourceSuggestionIndex, platform: 'linkedin', title: suggestion.topic, content: '', brief: { topic, angle, format, hook, postPointers, callToAction, seoKeywords } })` then `router.push(\`/dashboard/editor?draftId=${draft._id}\`)`. Show loading state on the button during creation. (§4.9)
- [ ] **#28 — Add drafts API client** (`apps/web/src/lib/api.ts` MODIFY): Add `draftsApi` object with: `create(body)` → `POST /api/drafts`, `list(params?)` → `GET /api/drafts`, `get(id)` → `GET /api/drafts/${id}`, `update(id, body)` → `PATCH /api/drafts/${id}`, `delete(id)` → `DELETE /api/drafts/${id}`, `chat(id, message)` → `POST /api/drafts/${id}/chat`, `getHistory(id)` → `GET /api/drafts/${id}/chat/history`, `publish(id)` → `POST /api/drafts/${id}/publish`. (§4.9)

---

## Phase E — Post Library

*Depends on Phase D (#22 drafts routes, #23 draft service, #28 API client).*

- [ ] **#29 — Build post library page** (`app/dashboard/posts/page.tsx` CREATE): Page at `/dashboard/posts`. Status tab bar: All / Drafting / Ready / Published with counts. Paginated list of `PostListItem` rows. Uses `draftsApi.list({ status, page })` with query params. Pagination: Previous / Next buttons with "Page X of Y (Z total)". Empty state per tab. [+ New Post] button navigates to editor with blank draft. (§5.2)
- [ ] **#30 — Build PostListItem component** (`components/posts/PostListItem.tsx` CREATE): Row showing: title/first-line of content, platform badge (LinkedIn / Twitter), status (Drafting / Ready / Published), char count, "Last edited N ago" or "Published N ago". Action buttons vary by status — Drafting: [Edit] [Mark Ready] [Delete]; Ready: [Edit] [Copy] [Mark Published]; Published: [View] [Feed to Persona]. (§5.2, §5.5)
- [ ] **#31 — Implement "Feed to Persona" publish flow** (`routes/drafts.ts` MODIFY): In `POST /api/drafts/:id/publish` handler: (1) set `draft.status = 'published'` and `draft.publishedAt = new Date()`, (2) call internal `addPosts(userId, [draft.content], 'published-draft')` to feed the post back into the persona pipeline — this triggers incremental re-analysis, (3) upsert a `SuggestionFeedback` record with `action: 'published', rating: 'loved'` if the draft has a `sourceSuggestionSetId` (published = strong positive signal for the feedback loop), (4) return `{ draft, personaUpdated: postsAdded > 0 }`. (§5.3)
- [ ] **#32 — Add "My Posts" link to sidebar** (`components/layout/Sidebar.tsx` MODIFY): Add `{ href: '/dashboard/posts', label: 'My Posts', icon: '📄' }` to the sidebar navigation list, between "History" and "My Profile". (§5.5)

---

## Phase F — Twitter/X Multi-Platform Support

*Depends on Phase B (#12 platform config, #14 shared types). Can run in parallel with Phase D/E.*

- [ ] **#33 — Add `platform` field to ContentSuggestion / ISuggestion** (`models/ContentSuggestion.ts` MODIFY, `packages/shared-types/src/index.ts` MODIFY): Add `platform: { type: String, enum: ['linkedin', 'twitter'], default: 'linkedin' }` to the individual suggestion item schema inside `ContentSuggestion`. Update `ISuggestion` in shared-types to include `platform: SuggestionPlatform` and optional `threadContent?: Array<{ tweetIndex: number, content: string, charCount: number }>` for Twitter threads. (§6.5)
- [ ] **#34 — Add platform section to content generator prompt** (`agents/contentGenerator.ts` MODIFY): Add `buildPlatformSection(platforms: string[])` function — returns empty string if only LinkedIn (default); otherwise builds a `## PLATFORM REQUIREMENTS` section with per-platform rules from `PLATFORMS` config (maxChars, formats, hashtag strategy, best practices, thread support). Append to prompt. Also update `ContentIdeasSchema` to include `platform` field per idea. (§6.4)
- [ ] **#35 — Add platform selector to GenerateOptionsPanel** (`components/suggestions/GenerateOptionsPanel.tsx` MODIFY): Add a "Target Platform" row with three toggle buttons: [LinkedIn (default)] [Twitter/X] [Both]. Wire to `IGenerateContextOptions.platforms`. When Twitter selected, show a note about thread support. When "Both" selected, results should display in two tabs on the dashboard. Pass `platforms` through the generate request body. (§6.6)
- [ ] **#36 — Build Twitter thread editor in PostEditorPane** (`components/editor/PostEditorPane.tsx` MODIFY): When `platform === 'twitter'` and content exceeds 280 chars, render a thread view: numbered tweet boxes (Tweet 1/N, Tweet 2/N, etc.), each with its own 280-char counter and colour indicator. [+ Add Tweet] and [Remove Last] buttons. Sync the thread array back to `draft.twitterThread`. (§6.7)
- [ ] **#37 — Add platform badge to SuggestionCard** (`components/suggestions/SuggestionCard.tsx` MODIFY): In the card header (near the format badge), show a platform chip — LinkedIn icon (indigo) or Twitter/X bird icon (sky-500/gray). Only show if `suggestion.platform === 'twitter'` (don't show LinkedIn badge for every card to keep UI clean). (§6.9)
- [ ] **#38 — Update generate route to accept `platforms`** (`routes/suggestions.ts` MODIFY): In the `POST /api/suggestions/generate` zod schema, add `platforms: z.array(z.enum(['linkedin', 'twitter'])).optional()` inside `context`. Pass `platforms` through to `runContentPipeline()` input so it reaches the content generator. Update `PipelineInput` in `mastra.ts` to accept `platforms?: string[]`. (§6.9)

---

## Phase G — Admin Dashboard

*Depends on Phase B (#8 AdminAuditLog, #9 User.role). Can run in parallel with Phase C/D/E.*

- [ ] **#39 — Create admin seed service** (`services/adminSeed.ts` CREATE, `index.ts` MODIFY): `seedAdminAccount()` — checks if any user with `role: 'admin'` exists; if yes, logs and returns. If no: generate `placeholderEmail = admin-${Date.now()}@placeholder.local`, generate `setupToken = crypto.randomBytes(32).toString('hex')`, create User with `role: 'admin', requiresSetup: true, password: bcrypt.hashSync(randomBytes, 12)`. Store `setupToken` in `SystemConfig` with key `admin_setup_token`. Log the admin ID and the instruction to visit `/admin/setup`. Call `seedAdminAccount()` inside `start()` in `index.ts` after `seedDefaultTokenLimit()`. (§7.2.2)
- [ ] **#40 — Create admin API routes** (`routes/admin.ts` CREATE, `index.ts` MODIFY): All routes: `router.use(authenticate, requireAdmin)`. Implement: `GET /api/admin/users` (paginated, include `tokensUsed`, `tokenLimit`, last activity), `GET /api/admin/users/:id` (full user detail + persona summary + token logs), `PATCH /api/admin/users/:id` (update `role`, `tokenLimit`, `name`), `GET /api/admin/analytics/overview` (aggregation query — total users, active this week/month, total tokens used, pending requests, suggestions generated, avg rating), `GET /api/admin/config` (all SystemConfig entries), `PATCH /api/admin/config/:key` (update a config value + log to AdminAuditLog), `GET /api/admin/profile`, `PATCH /api/admin/profile` (update own email/password — bcrypt hash, stricter min-12-char validation), `POST /api/admin/setup` (one-time setup — validate `setupToken` from SystemConfig, update email + password, set `requiresSetup: false`, delete token from SystemConfig). Register: `app.use('/api/admin', adminRoutes)`. (§7.4)
- [ ] **#41 — Move token admin endpoints to admin routes** (`routes/tokenUsage.ts` MODIFY, `routes/admin.ts` MODIFY): Cut `GET /api/tokens/admin/requests` and `PATCH /api/tokens/admin/requests/:id` from `routes/tokenUsage.ts`. Add them to `routes/admin.ts` as `GET /api/admin/token-requests` and `PATCH /api/admin/token-requests/:id` — now protected by `requireAdmin` middleware. Log all approve/reject actions to `AdminAuditLog`. (§7.4, §2.1)
- [ ] **#42 — Build admin layout** (`app/admin/layout.tsx` CREATE, `middleware.ts` MODIFY): Admin layout with sidebar navigation: Overview / Users / Token Requests / Analytics / Config / Profile. Show admin badge / "Admin" label in header. In `middleware.ts` (Next.js), add `/admin` to protected routes AND add a role check — if the JWT cookie's decoded `role !== 'admin'`, redirect to `/dashboard`. (§7.6, §7.10)
- [ ] **#43 — Build admin overview page** (`app/admin/page.tsx` CREATE): Four stat cards (Total Users, Active This Week, Tokens Used, Pending Requests) using data from `GET /api/admin/analytics/overview`. Recent activity timeline (last 10 token usage log entries across all users). Token Requests Queue section — show pending requests with [Approve] / [Reject] inline buttons (calls `PATCH /api/admin/token-requests/:id`). (§7.5, §7.7)
- [ ] **#44 — Build user management page** (`app/admin/users/page.tsx` CREATE): Paginated table with columns: Email, Name, Role, Tokens Used / Limit, Joined. Row actions: [View Detail] → `/admin/users/:id` detail page. Detail page shows: persona summary (goals, industry, content pillars), token usage history, `tokenLimit` override input. `PATCH /api/admin/users/:id` to save. (§7.6)
- [ ] **#45 — Build token requests page** (`app/admin/token-requests/page.tsx` CREATE): Table of all token increase requests filterable by status (pending / approved / rejected). Columns: User email, Current Usage, Requested Limit, Reason, Submitted. Actions: [Approve with Limit: input] [Reject]. On approve: calls `PATCH /api/admin/token-requests/:id` with `{ status: 'approved', newLimit }`. (§7.6)
- [ ] **#46 — Build analytics page** (`app/admin/analytics/page.tsx` CREATE): Key stats section (totals from overview endpoint). Token usage over time (last 30 days — aggregate `TokenUsageLog` by day). Pipeline metrics: avg generation time, live vs fallback trend distribution, error rate. Content stats: suggestions generated, drafts created, published posts, avg feedback rating. (§7.5, §7.6)
- [ ] **#47 — Build admin profile and setup pages** (`app/admin/profile/page.tsx` CREATE, `app/admin/setup/page.tsx` CREATE): Profile page: form to update admin email and password (min 12 chars). Setup page (accessible without auth): form for `setupToken` + new email + new password → calls `POST /api/admin/setup`. After success, redirect to `/login`. Show "Setup already complete" if `setupToken` no longer exists in SystemConfig. (§7.2.3, §7.6)
- [ ] **#48 — Add admin route protection to Next.js middleware** (`middleware.ts` MODIFY): In the existing `middleware.ts`, add `/admin` path to the protected routes matcher. Decode the JWT cookie and check `role` claim — if not `'admin'`, redirect to `/dashboard` instead of `/login`. (§7.10)
- [ ] **#49 — Add admin API client** (`apps/web/src/lib/api.ts` MODIFY): Add `adminApi` object with methods: `getUsers(page?)`, `getUser(id)`, `updateUser(id, body)`, `getTokenRequests(status?)`, `updateTokenRequest(id, body)`, `getAnalyticsOverview()`, `getConfig()`, `updateConfig(key, value)`, `getProfile()`, `updateProfile(body)`, `setup(body)`. (§7.10)

---

## Phase H — Continuous Persona Learning

*Depends on Phase C (#15 feedback routes, #16 processor), Phase D (#22 draft routes, #31 publish flow). Full learning cycle requires all signals.*

- [ ] **#50 — Create persona learning service** (`services/personaLearning.ts` CREATE): `aggregateAndUpdatePersona(userId)` — fetches last 30 days of `SuggestionFeedback` (limit 50) and `PostDraft` (status: published) in parallel via `Promise.all`. Computes: (1) `topicScores` map using `SIGNAL_WEIGHTS` per rating — `preferredTopics` (score > 0.5), `avoidTopics` (score < -0.3); (2) `formatPreferences` from loved/good feedback — percentage distribution; (3) `averageRating` from feedback; (4) `averageContentLength` from published drafts. Writes all to `UserPersona.$set({ feedbackProfile, lastLearningUpdate })`. Export `SIGNAL_WEIGHTS` constants for use in processors. (§8.4, §8.2)
- [ ] **#51 — Wire learning to feedback routes** (`routes/feedback.ts` MODIFY): After saving `SuggestionFeedback`, check `if (feedbackCount % 5 === 0)` — if so, fire-and-forget `aggregateAndUpdatePersona(userId)`. This batches the expensive aggregation instead of running it every single submission. (§8.3)
- [ ] **#52 — Wire learning to draft routes** (`routes/drafts.ts` MODIFY): In `POST /api/drafts/:id/publish` handler, after marking draft as published, fire-and-forget `aggregateAndUpdatePersona(userId)` — a published post is the strongest signal and warrants an immediate persona update. Also, when creating a draft from a suggestion (`POST /api/drafts` with `sourceSuggestionSetId`), upsert a `SuggestionFeedback` with `action: 'draft', rating: undefined` as a weak positive signal. (§8.3)
- [ ] **#53 — Integrate learning into content generator prompt** (`agents/contentGenerator.ts` MODIFY): The `buildFeedbackSection(persona)` from Phase C #19 handles the feedback profile injection. In Phase H, verify it also reads `averageContentLength` from `feedbackProfile` and adds a length guidance line: `"Preferred post length: ~${avgLength} chars (based on published posts)"`. Ensure the full prompt structure follows: `## CREATOR PROFILE` → `## USER FEEDBACK SIGNALS` → `## CURRENT TRENDS` → `## GENERATION CONTEXT OVERRIDE`. (§8.6)
- [ ] **#54 — Add generation analytics to pipeline** (`agents/mastra.ts` MODIFY, `models/ContentSuggestion.ts` MODIFY): Add `generationMeta` field to `ContentSuggestion` schema: `{ pipelineDurationMs, trendFetchDurationMs, llmDurationMs, tokenCost: { input, output, total }, trendSource: 'live'|'fallback', modelId }`. In `runContentPipeline()`, capture timestamps at start + after each step using `Date.now()` and populate `generationMeta` when saving the `ContentSuggestion` document. (§2.10)

---

## Phase I — Polish & Integration Testing

*Final phase — runs after all features are built and integrated.*

- [ ] **#55 — Fix token tracking desync** (`services/tokenUsage.ts` MODIFY): Replace `Promise.all([...]).catch(...)` with `Promise.allSettled([...])`. Check each result's `.status`. If either write fails, log a structured `DESYNC` warning with `{ userId, totalTokens, logFailed, userFailed }` so discrepancies can be manually reconciled. This prevents the token quota appearing under-counted when the `User.updateOne` fails silently. (§2.7)
- [ ] **#56 — Fix ChatSession race condition** (`models/ChatSession.ts` MODIFY, `services/chatSessionService.ts` MODIFY): Make the compound index `{ userId: 1, agentType: 1 }` unique. Replace the `findOne → create` pattern in `findOrCreateSession()` with atomic `findOneAndUpdate({ $setOnInsert: { sessionId, messages: [] } }, { upsert: true, new: true })`. This prevents duplicate sessions under concurrent requests. (§2.8)
- [ ] **#57 — Persist `trendSource` in ContentSuggestion** (`models/ContentSuggestion.ts` MODIFY, `agents/mastra.ts` MODIFY): Add `trendSource: { type: String, enum: ['live', 'fallback'] }` to `ContentSuggestion` schema (alongside existing `trendsUsed` array). In `runContentPipeline()` Step 4, set `trendSource: trendIsLive ? 'live' : 'fallback'` in the `ContentSuggestion.create()` call. This enables admin analytics to track live vs fallback trend usage over time. (§2.9)
- [ ] **#58 — E2E test: feedback → learning → generation cycle** (manual testing): Test flow: (1) Generate suggestions, (2) rate 3 "Loved" with specific topics, rate 2 "Bad" with different topics, (3) submit 5th feedback — should trigger `aggregateAndUpdatePersona`, (4) verify `UserPersona.feedbackProfile.preferredTopics` updated in DB, (5) generate new suggestions — verify `## USER FEEDBACK SIGNALS` appears in LLM prompt (via debug log), (6) confirm loved topics are weighted in new suggestions. (§3, §8)
- [ ] **#59 — E2E test: suggestion → draft → publish → persona loop** (manual testing): Test flow: (1) Generate suggestion, (2) click "Write This Post" → verify draft created and editor opens, (3) chat with AI to generate first draft, (4) edit manually and save, (5) click "Mark Published" — verify draft status changes, (6) verify `POST /api/persona/add-posts` was called internally with the draft content, (7) verify `UserPersona.postMetadata` has new entry with `source: 'published-draft'`, (8) verify `SuggestionFeedback` upserted with `action: 'published', rating: 'loved'`. (§5.3, §8.3)

---

## Files To Create / Modify

### NEW files to create

**Backend — API**
- `apps/api/src/middleware/adminAuth.ts` — requireAdmin middleware (#1, #41)
- `apps/api/src/services/adminSeed.ts` — admin account first-time seeding (#39)
- `apps/api/src/services/feedbackProcessor.ts` — feedback signal extraction + aggregation trigger (#16)
- `apps/api/src/services/draftService.ts` — draft business logic (#23)
- `apps/api/src/services/trendCache.ts` — 30-min TTL cache for trend results (#13)
- `apps/api/src/services/personaLearning.ts` — signal aggregation + persona update (#50)
- `apps/api/src/models/SuggestionFeedback.ts` — feedback document (#6)
- `apps/api/src/models/PostDraft.ts` — draft with version history (#7)
- `apps/api/src/models/AdminAuditLog.ts` — admin action audit trail (#8)
- `apps/api/src/routes/feedback.ts` — feedback API endpoints (#15)
- `apps/api/src/routes/drafts.ts` — drafts CRUD + chat endpoints (#22)
- `apps/api/src/routes/admin.ts` — all admin API endpoints (#40)
- `apps/api/src/agents/postEditor.ts` — Agent 6: AI writing partner (#20)
- `apps/api/src/config/platforms.ts` — LinkedIn + Twitter config constants (#12)

**Frontend — Web**
- `apps/web/src/app/dashboard/editor/page.tsx` — split-pane post editor page (#24)
- `apps/web/src/app/dashboard/posts/page.tsx` — post library page (#29)
- `apps/web/src/app/admin/layout.tsx` — admin layout with sidebar (#42)
- `apps/web/src/app/admin/page.tsx` — admin overview dashboard (#43)
- `apps/web/src/app/admin/users/page.tsx` — user management table (#44)
- `apps/web/src/app/admin/token-requests/page.tsx` — token requests queue (#45)
- `apps/web/src/app/admin/analytics/page.tsx` — analytics charts (#46)
- `apps/web/src/app/admin/profile/page.tsx` — admin profile settings (#47)
- `apps/web/src/app/admin/setup/page.tsx` — first-time admin setup (#47)
- `apps/web/src/components/editor/PostEditorPane.tsx` — rich text editor pane (#25)
- `apps/web/src/components/editor/EditorChatPane.tsx` — AI chat for draft (#26)
- `apps/web/src/components/posts/PostListItem.tsx` — post library row (#30)

---

### Key files to modify

**Backend — Models**
- `apps/api/src/models/User.ts` — add `role`, `requiresSetup` fields (#9)
- `apps/api/src/models/UserPersona.ts` — add `feedbackProfile`, `lastLearningUpdate` (#10)
- `apps/api/src/models/ChatSession.ts` — add `'post-editor'` agent type, unique index (#11, #56)
- `apps/api/src/models/ContentSuggestion.ts` — add `trendSource`, `generationMeta`, `platform` per suggestion (#33, #54, #57)

**Backend — Routes & Middleware**
- `apps/api/src/index.ts` — register new routes, call seedAdminAccount (#39, #40, #41)
- `apps/api/src/middleware/auth.ts` — include `role` in JWT payload (#9)
- `apps/api/src/routes/tokenUsage.ts` — remove unsecured admin endpoints (#41)
- `apps/api/src/routes/suggestions.ts` — add `platforms` to generate schema (#38)
- `apps/api/src/routes/feedback.ts` — trigger learning aggregation (#51)
- `apps/api/src/routes/drafts.ts` — publish flow + learning signals (#31, #52)

**Backend — Agents & Services**
- `apps/api/src/agents/mastra.ts` — postsArray fix, trendSource persist, generationMeta, register postEditorAgent (#2, #21, #54, #57)
- `apps/api/src/agents/contentGenerator.ts` — feedback section, platform section, min-count check (#5, #19, #34, #53)
- `apps/api/src/agents/trendResearch.ts` — wire trend cache (#13)
- `apps/api/src/services/personaMerge.ts` — weighted blending for writingStyle/tone (#4)
- `apps/api/src/services/tokenUsage.ts` — Promise.allSettled desync fix (#55)
- `apps/api/src/services/chatSessionService.ts` — atomic upsert, editor session helper (#11, #56)
- `apps/api/src/index.ts` — DEFAULT_TIMEOUT_MS fix (#3)

**Frontend — Components & Pages**
- `apps/web/src/components/suggestions/SuggestionCard.tsx` — feedback UI, [Write This Post] button, platform badge (#17, #27, #37)
- `apps/web/src/components/suggestions/GenerateOptionsPanel.tsx` — platform selector (#35)
- `apps/web/src/components/editor/PostEditorPane.tsx` — Twitter thread editor mode (#36)
- `apps/web/src/components/layout/Sidebar.tsx` — add My Posts link (#32)
- `apps/web/src/middleware.ts` — admin route protection + role check (#42, #48)

**Shared**
- `packages/shared-types/src/index.ts` — all new interfaces (feedback, draft, admin, platform) (#14)
- `apps/web/src/lib/api.ts` — feedbackApi, draftsApi, adminApi (#18, #28, #49)

---

## Dependency Graph

```
Phase A (Critical Fixes) — no dependencies — DO FIRST
    ↓
Phase B (Data Models) — foundation for everything else
    ↓
    ├──→ Phase C (Feedback Loop) — needs #6 SuggestionFeedback, #10 feedbackProfile
    │
    ├──→ Phase D (Post Editor) — needs #7 PostDraft, #11 ChatSession extension, #12 platforms
    │       ↓
    │   Phase E (Post Library) — needs Phase D drafts routes (#22) and API client (#28)
    │
    ├──→ Phase F (Twitter/X) — needs #12 platform config — CAN RUN PARALLEL WITH D/E
    │
    └──→ Phase G (Admin Dashboard) — needs #8 AuditLog, #9 User.role — CAN RUN PARALLEL WITH C/D
              ↓
         Phase H (Persona Learning) — needs Phase C (#15 feedback) + Phase D (#22 drafts #31 publish)
              ↓
         Phase I (Polish & E2E testing) — runs last, after all features integrated
```

---

## Effort Summary

| Phase | Items | Est. Hours |
|-------|-------|------------|
| A — Critical Fixes | 5 | ~4 h |
| B — Data Models & Foundation | 9 | ~10 h |
| C — Feedback Loop | 5 | ~11 h |
| D — Post Editor & AI Co-Writing | 9 | ~24 h |
| E — Post Library | 4 | ~9 h |
| F — Twitter/X Support | 6 | ~12 h |
| G — Admin Dashboard | 11 | ~32 h |
| H — Continuous Persona Learning | 5 | ~10 h |
| I — Polish & Integration Testing | 5 | ~10 h |
| **TOTAL** | **59** | **~122 h** |

---

## Key Architecture Notes for Implementation

- **`trackTokenUsage()` is always fire-and-forget** — never `await` it. After Phase I #55, use `Promise.allSettled` with desync logging inside.
- **`processFeedback()` is fire-and-forget** — called from the feedback route handler without `await`.
- **`aggregateAndUpdatePersona()` is fire-and-forget** — triggered every 5th feedback and on every publish.
- **`buildFeedbackSection(persona)`** — only activates when `persona.feedbackProfile.totalFeedbackCount >= 3` to avoid noise from single data points.
- **Admin JWT** — `role` must be included in the JWT payload at login time (in `routes/auth.ts`) so `requireAdmin` can do a fast in-memory check on most routes without a DB hit.
- **PostEditor agent** — uses the same `<!--POST_CONTENT ... POST_CONTENT-->` hidden block pattern as the onboarding agent. Must be stripped before persisting to the session DB.
- **`platforms` field** — defaults to `['linkedin']` throughout the entire stack. Never break existing LinkedIn-only flows.
- **Phase G admin setup** — the `setupToken` is a one-time use token stored in `SystemConfig`. It must be deleted from DB immediately after successful use.

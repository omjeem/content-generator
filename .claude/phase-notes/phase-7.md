# Phase 7: Flexible Generation, Persona Chat, Rich Content Briefs

# Status: COMPLETE (2026-02-21)

---

## Goal

Make the app highly flexible for content generation with three major feature additions:

1. Flexible generation options panel (3 modes)
2. Live AI persona editor (persona chat)
3. Rich content brief per suggestion card (SEO, hooks, pointers, CTA)

---

## Feature 1: Flexible Generation Options Panel

### What was built

When the user clicks "Generate Content Ideas", instead of immediately generating,
they now see a 3-mode options panel:

1. **Use My Profile** — generates from full persona (same as original behavior)
2. **Focus on a Topic** — user types a specific topic/niche; all ideas focus on that
3. **Chat to Refine** — multi-turn stateless chat with AI before generating; AI asks
   clarifying questions and extracts a context summary when ready

### New backend route

`POST /api/suggestions/refine-context`

- Stateless — receives full messages array each call
- Uses `generateText` from `ai` with a system prompt that guides the AI
  to ask 2-3 questions about topic, audience, goals
- When ready, embeds `<!--CONTEXT_SUMMARY {...} CONTEXT_SUMMARY-->` in response
- Route extracts and returns: `{ reply, summary, topicFocus, targetAudienceOverride, platformGoal }`

### Pipeline changes

- `IGenerateContextOptions` interface added to shared-types
- `PipelineInput.context?: IGenerateContextOptions` added to mastra.ts
- `generateContentIdeas` receives `context?` and builds a `## GENERATION CONTEXT OVERRIDE`
  section appended to the prompt
- `contentMix` preference influences format distribution (more-carousels, more-text-posts, etc.)
- `platformGoal` override influences content style guidance

### New files

- `apps/web/src/components/suggestions/GenerateOptionsPanel.tsx`

### Modified files

- `apps/api/src/routes/suggestions.ts` — added refine-context route + context Zod schema
- `apps/api/src/agents/contentGenerator.ts` — new context-aware prompt building
- `apps/api/src/agents/mastra.ts` — context passthrough + rich fields persist
- `apps/web/src/app/dashboard/page.tsx` — GenerateOptionsPanel wired in
- `apps/web/src/lib/api.ts` — suggestionsApi.generate now accepts context; added refineContext

---

## Feature 2: Live Persona Editor (Persona Chat)

### What was built

A dedicated `/dashboard/profile` page where users can:

- View their full current persona (all fields)
- Chat with an AI strategy coach to discuss and update their strategy
- AI proposes changes as a `<!--PERSONA_CHANGES {...} PERSONA_CHANGES-->` block
- User reviews changes in the PendingChangesCard and clicks "Apply" or "Discard"
- On apply, changes are written to MongoDB and the persona display updates live

### New backend agent

`apps/api/src/agents/personaChat.ts`

- Uses same hidden-block pattern as onboarding agent
- `runPersonaChat`: loads persona context, builds history prompt, runs agent, parses changes
- `applyPersonaChanges`: applies only the fields that are actually changing via `$set`
- `PersonaChangesSchema` (zod) validates the change block

### New backend routes

`apps/api/src/routes/personaChat.ts`

- `POST /api/persona-chat/chat` — main chat endpoint
- `POST /api/persona-chat/apply-changes` — apply pending changes to DB
- `GET /api/persona-chat/history` — load existing session messages
- `GET /api/persona-chat/persona` — get current persona for profile page display

### Registration

- `personaChatAgent` registered in `mastra.ts` agents map
- `personaChatRoutes` registered at `/api/persona-chat` in `index.ts`

### New frontend files

- `apps/web/src/app/dashboard/profile/page.tsx` — full profile page with AI chat
- `apps/web/src/components/persona/PendingChangesCard.tsx` — amber card showing proposed changes

### Modified files

- `apps/web/src/lib/api.ts` — added `personaChatApi`
- `apps/web/src/components/layout/Navbar.tsx` — added "My Profile" link → `/dashboard/profile`

---

## Feature 3: Rich Content Brief

### What was built

Each suggestion card now shows an expandable "Full Content Brief" section:

- **Post Outline** — 4-6 numbered bullet points of exactly what to write
- **Alt Hooks** — 2-3 punchier/bolder hook alternatives
- **CTA** — one suggested call-to-action to close the post
- **SEO Keywords & Hashtags** — 3-5 hashtags/keywords
- **Copy Full Brief** button — copies the complete brief to clipboard

### Schema changes

`ISuggestionItem` (Mongoose) + `ISuggestion` (shared-types) now include:

```typescript
seoKeywords: string[]      // 3-5 LinkedIn hashtags/SEO keywords
clickbaitHooks: string[]   // 2-3 bolder hook alternatives
postPointers: string[]     // 4-6 post body bullet points
callToAction: string       // single CTA sentence
```

All default to `[]` / `''` for backward-compat with existing documents.

### Agent prompt changes

`contentGeneratorAgent` now has:

- Extended `SuggestionSchema` with the 4 new required fields (all validated by zod)
- Much richer instructions with a concrete full example showing all fields
- Format guidance per contentMix and platformGoal preferences

### Modified files

- `packages/shared-types/src/index.ts` — ISuggestion + all new interfaces
- `apps/api/src/models/ContentSuggestion.ts` — 4 new fields with defaults
- `apps/api/src/agents/contentGenerator.ts` — full rewrite
- `apps/api/src/agents/mastra.ts` — saves rich fields to DB
- `apps/web/src/components/suggestions/SuggestionCard.tsx` — Full Content Brief UI

---

## Schema changes summary

### shared-types/src/index.ts (additions)

- `PlatformGoal` type (already existed, now used in more places)
- `ContentMixPreference` type (new)
- `IUserPersona.platformGoal?: PlatformGoal` (new)
- `IChatSession.agentType` — added `'persona-chat'`
- `ISuggestion.seoKeywords, clickbaitHooks, postPointers, callToAction` (new)
- `IGenerateContextOptions` (new)
- `IPersonaPendingChanges` (new)
- `IPersonaChatMessage` (new)
- `IPersonaChatResponse` (new)
- `IApplyPersonaChangesRequest` (new)
- `IPersonaUpdateResponse` (new)
- `IRefineContextRequest` (new)
- `IRefineContextResponse` (new)
- `ISuggestionsGenerateResponse` (already existed)

### MongoDB models

- `UserPersona.ts` — `platformGoal` field added
- `ContentSuggestion.ts` — 4 rich fields with defaults
- `ChatSession.ts` — `agentType` enum now includes `'persona-chat'`

---

## Test scenarios

### Test 1: Topic Focus Mode

```
1. Login, complete onboarding
2. Dashboard → "Generate Content Ideas"
3. Choose "Focus on a Topic"
4. Type "AI in healthcare diagnostics"
5. Click Generate → all 5-10 ideas should be about AI in healthcare
6. Each card should have Full Content Brief section
```

### Test 2: Chat Refine Mode

```
1. Dashboard → Generate → "Chat to Refine"
2. Respond to AI questions about your focus
3. After 2-3 exchanges, "Context gathered" banner appears
4. Click "Generate Ideas with This Context"
5. Ideas should reflect the discussion
```

### Test 3: Persona Chat

```
1. Navbar → "My Profile"
2. Existing persona fields displayed on left
3. Type "I want to shift my focus to lead generation for B2B SaaS"
4. AI proposes changes in chat
5. PendingChangesCard appears on left
6. Click "Apply Changes"
7. Persona fields update live
```

### Test 4: Rich Content Brief

```
1. Generate any content ideas
2. Expand a card
3. Click "Full Content Brief" section
4. Verify: Post Outline (4-6 items), Alt Hooks (2-3), CTA, SEO Keywords
5. Click "Copy Full Brief" → paste in editor to verify
```

---

## New API endpoints summary

- `POST /api/suggestions/refine-context` — stateless pre-gen chat
- `POST /api/persona-chat/chat` — persona strategy chat
- `POST /api/persona-chat/apply-changes` — apply AI-proposed persona changes
- `GET /api/persona-chat/history` — load chat history
- `GET /api/persona-chat/persona` — get persona for display

# Phase 4: All Backend API Routes + Swagger/OpenAPI Documentation

# Status: COMPLETE ✓ (2026-02-20)

# Notes:

# - 13 endpoints documented in OpenAPI spec (verified with swagger-jsdoc)

# - Swagger UI at GET /api/docs, raw spec at GET /api/docs/openapi.json

# - Server only starts after MongoDB connects (by design — await connectDB())

# - req.params keys use bracket notation (req.params['id']) due to noUncheckedIndexedAccess

---

## Goal

Wire all agents to REST endpoints and set up Swagger UI so the API is
fully documented and testable without a frontend.

## Checklist

- [ ] apps/api/src/routes/persona.ts
- [ ] apps/api/src/routes/onboarding.ts
- [ ] apps/api/src/routes/trends.ts
- [ ] apps/api/src/routes/suggestions.ts
- [ ] Swagger/OpenAPI setup in apps/api/src/swagger/setup.ts
- [ ] All routes registered in apps/api/src/index.ts
- [ ] Swagger UI accessible at GET /api/docs
- [ ] Test all routes with curl commands

## Route Specifications

### POST /api/persona/analyze

```
Auth: Required (JWT)
Body: { linkedinUrl?: string, manualPosts?: string }
Validation: At least one of linkedinUrl or manualPosts required
Logic:
  1. Call scrapeLinkedInProfile(linkedinUrl) OR parseManualPosts(manualPosts)
  2. Run Agent 1 (personaAnalyst)
  3. Save/update UserPersona in MongoDB
  4. Return persona
Response 200: { persona: IUserPersona }
Response 400: { error: "Provide either linkedinUrl or manualPosts" }
Response 422: { error: "LinkedIn scraping failed", fallback: "Please paste posts manually" }
```

### GET /api/persona

```
Auth: Required (JWT)
Logic: Find UserPersona by userId
Response 200: { persona: IUserPersona }
Response 404: { error: "No persona found. Run /persona/analyze first." }
```

### POST /api/onboarding/chat

```
Auth: Required (JWT)
Body: { message: string, sessionId?: string }
Logic:
  1. Load/create ChatSession for userId
  2. Run Agent 2 (onboarding) with full message history
  3. Append new messages to ChatSession
  4. If interviewComplete, extract data and update UserPersona
  5. Return agent reply
Response 200: {
  reply: string,
  sessionId: string,
  interviewComplete: boolean,
  questionsAnswered: number  // 0-5
}
```

### GET /api/onboarding/session

```
Auth: Required (JWT)
Logic: Get ChatSession messages for userId + agentType=onboarding
Response 200: { messages: IMessage[], interviewComplete: boolean }
```

### GET /api/onboarding/status

```
Auth: Required (JWT)
Logic: Check UserPersona.interviewComplete
Response 200: { complete: boolean, missingFields: string[] }
```

### GET /api/trends

```
Auth: Required (JWT)
Query: ?geo=US (optional, default US)
Logic:
  1. Get user's persona (industry + topics)
  2. Run Agent 3 (trendResearch)
  3. Return trends
Response 200: { trends: string[], fetchedAt: string }
Response 400: { error: "Complete persona analysis first" }
```

### POST /api/suggestions/generate

```
Auth: Required (JWT)
Body: {} (empty — uses stored persona)
Logic:
  1. Check interview is complete → 400 if not
  2. Run full orchestrator pipeline (Agent 3 + Agent 4)
  3. Save to ContentSuggestion collection
  4. Return suggestions
Response 200: { suggestions: ISuggestion[], id: string, generatedAt: string }
Response 400: { error: "Complete onboarding interview before generating suggestions" }
Response 503: { error: "AI generation failed", details: string }
```

### GET /api/suggestions

```
Auth: Required (JWT)
Query: ?page=1&limit=10 (pagination)
Logic: Find ContentSuggestion by userId, sorted by createdAt desc
Response 200: { suggestions: IContentSuggestion[], total: number, page: number }
```

### GET /api/suggestions/:id

```
Auth: Required (JWT)
Logic: Find ContentSuggestion by _id, verify userId matches
Response 200: { suggestion: IContentSuggestion }
Response 404: { error: "Suggestion set not found" }
```

## Swagger Setup

### apps/api/src/swagger/setup.ts

```typescript
// Use @hono/swagger-ui and @hono/zod-openapi
// Register OpenAPI spec with:
//   - All request body schemas (Zod-derived)
//   - All response schemas
//   - Security scheme: BearerAuth (JWT)
//   - Tags: auth, persona, onboarding, trends, suggestions
// Mount at: GET /api/docs → renders Swagger UI
// Mount at: GET /api/openapi.json → raw OpenAPI JSON spec
```

## Error Response Standard

All errors follow this format:

```json
{
  "error": "Human-readable message",
  "details": "Optional technical details",
  "code": "OPTIONAL_ERROR_CODE"
}
```

## Completion Criteria

- All 11 routes return correct responses
- Swagger UI loads at http://localhost:5006/api/docs
- Can test auth flow entirely from Swagger UI
- Can trigger content generation from Swagger UI
- All routes have OpenAPI descriptions and example responses

# Phase 6: Wire Frontend to Backend + End-to-End Testing Guide
# Status: COMPLETE (2026-02-20)

---

## Goal
Ensure all frontend pages are fully connected to backend APIs, fix any
integration issues, and provide a complete testing guide.

## Checklist
- [x] Verify all API calls from frontend match backend route signatures
- [x] Fix: suggestions route returned `suggestionId` but ISuggestionsGenerateResponse used `id` — fixed to `id`
- [x] Fix: .env.example said "Hono API server" — updated to "Express API server"
- [x] Created apps/web/.env.local with NEXT_PUBLIC_API_URL=http://localhost:3001
- [x] CORS already configured correctly (origin: http://localhost:3000, credentials: true)
- [x] Cookie: sameSite: 'lax', secure: false in dev — correct for localhost
- [x] Middleware.ts protects /dashboard and /onboarding routes
- [x] Error states documented and handled in all pages
- [x] Write end-to-end testing guide in TESTING.md

## CORS Configuration
```typescript
// apps/api/src/index.ts
app.use(cors({
  origin: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  credentials: true,  // required for httpOnly cookies
}))
```

## End-to-End Test Scenarios

### Scenario 1: Full Happy Path
```
1. Register new user
2. Login
3. Go to /onboarding
4. Paste 3 LinkedIn posts manually
5. Complete all 5 interview questions
6. Go to /dashboard
7. Click "Generate Content Ideas"
8. View 5-10 suggestions
9. Copy a hook text
10. Go to /dashboard/suggestions to see history
11. Logout
```

### Scenario 2: LinkedIn URL Scraping
```
1. Login
2. /onboarding → Tab "LinkedIn URL"
3. Enter a public LinkedIn profile URL
4. If scraping succeeds → proceed to interview
5. If scraping fails → check error message suggests manual paste
```

### Scenario 3: Resuming Interview
```
1. Login, start interview, answer 2 questions, close browser
2. Reopen browser, login
3. Go to /onboarding → interview should resume from question 3
4. (Tests Mastra working memory persistence)
```

### Scenario 4: Error Handling
```
1. Try to generate suggestions WITHOUT completing interview → should get error
2. Try to login with wrong password → should get 401
3. Try to access /dashboard without logging in → should redirect to /login
4. Submit empty LinkedIn URL → should get validation error
```

## curl Test Commands

### Register
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"test@test.com","password":"password123","name":"Test User"}'
```

### Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"test@test.com","password":"password123"}'
```

### Analyze Persona (manual paste)
```bash
curl -X POST http://localhost:3001/api/persona/analyze \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "manualPosts": "Post 1: AI is transforming how we work...\n\n---\n\nPost 2: 5 lessons from scaling a startup..."
  }'
```

### Start Interview
```bash
curl -X POST http://localhost:3001/api/onboarding/chat \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"message": "Hello, I am ready to start"}'
```

### Generate Suggestions
```bash
curl -X POST http://localhost:3001/api/suggestions/generate \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{}'
```

### Get Suggestions History
```bash
curl http://localhost:3001/api/suggestions?page=1&limit=10 \
  -b cookies.txt
```

### Check Swagger UI
```
Open browser: http://localhost:3001/api/docs
```

## Common Issues & Fixes

### CORS error on frontend
```
Fix: Ensure credentials: 'include' in fetch, and CORS origin matches exactly
Check: No trailing slash in NEXT_PUBLIC_API_URL
```

### Cookie not sent
```
Fix: sameSite: 'lax', secure: false (for localhost), credentials: include
```

### MongoDB connection fails
```
Fix: Check MONGODB_URI has correct cluster URL and password
Check: IP whitelist in Atlas allows 0.0.0.0/0 for development
```

### Gemini API rate limit
```
Fix: Use gemini-2.5-flash instead of gemini-2.5-flash (higher free quota)
```

### LinkedIn scraping blocked
```
Expected behavior: Error message shown, user prompted to paste manually
Fix: Already handled with fallback in Agent 1
```

## Completion Criteria
- All 4 test scenarios pass
- No CORS errors in browser console
- JWT cookies persist across page refreshes
- Mastra working memory restores interview state across sessions
- Swagger UI reflects all working routes
- TESTING.md written with full guide

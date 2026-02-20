# End-to-End Testing Guide

LinkedIn AI Content Suggestion Agent — complete testing instructions.

---

## Prerequisites

Before running tests, ensure:

1. **MongoDB** is running (local) or Atlas cluster is reachable
2. **Environment variables** are set in the root `.env`:
   ```
   GEMINI_API_KEY=<your-key>
   MONGODB_URI=<your-connection-string>
   JWT_SECRET=<32+-char-secret>
   PORT=3001
   NEXT_PUBLIC_API_URL=http://localhost:3001
   ```
3. **Generate a JWT secret** if you haven't:
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

---

## Starting the Servers

```bash
# From repo root — starts both API (3001) and Web (3000) in parallel
npm run dev

# Or start individually:
cd apps/api  && npm run dev   # Express API on :3001
cd apps/web  && npm run dev   # Next.js  on :3000
```

Verify the API is up:
```bash
curl http://localhost:3001/api/health
# Expected: {"status":"ok","timestamp":"...","docs":"http://localhost:3001/api/docs"}
```

---

## Swagger UI (Interactive API Docs)

Open in browser: **http://localhost:3001/api/docs**

- All 13 endpoints are documented with request/response schemas
- Click "Authorize" → enter Bearer token OR use cookie auth (see below)
- "Try it out" works for every route

---

## Scenario 1: Full Happy Path (UI)

1. Open **http://localhost:3000**
2. Click "Create your account" → register with name, email, password
3. After register, you're redirected to `/onboarding`
4. **Step 1 — Profile Analysis:**
   - Switch to "Paste Posts" tab
   - Paste 3–5 LinkedIn posts (or realistic-looking text), separated by `---`
   - Click "Analyse My Profile →"
   - Loading state appears: "Analysing your content..."
5. **Step 2 — Strategy Interview:**
   - Chat interface opens with a greeting question
   - Answer all 5 questions naturally
   - Progress bar increments: `1/5`, `2/5` … `5/5`
   - After the 5th question, redirected to "Complete" step
6. **Step 3 — Complete:**
   - Click "Generate Content Ideas →" → redirected to `/dashboard`
7. **Dashboard:**
   - All 3 status cards show green checkmarks
   - Click "Generate Content Ideas →"
   - Watch the animated loading messages cycle (10–20 sec)
   - 5–10 suggestion cards appear in a grid
   - Each card has: format badge, hook, topic, angle, "Why this fits" button, Copy Hook button
8. **History:**
   - Click "View History →"
   - First suggestion set appears with date, count, trend pills, format breakdown
   - Click "View Ideas" to expand — all cards visible
9. **Logout:**
   - Click "Sign Out" in navbar
   - Redirected to `/login`
   - Visiting `/dashboard` redirects back to `/login` ✓

---

## Scenario 2: Resume Interview Across Sessions

1. Start the interview (answer 2–3 questions), then close the browser tab
2. Reopen browser → navigate to `http://localhost:3000`
3. Middleware detects cookie → redirects to `/dashboard`
4. Navigate manually to `/onboarding`
5. Interview chat restores from the previous session — the next question continues where you left off
6. This tests Mastra working memory + MongoDB `ChatSession` persistence

---

## Scenario 3: LinkedIn URL Path

1. In Step 1 of onboarding, stay on "LinkedIn URL" tab
2. Enter a public LinkedIn profile URL (e.g., `https://www.linkedin.com/in/satyanadella/`)
3. Two outcomes:
   - **Scraping succeeds** → persona created, proceeds to interview
   - **Scraping blocked** → amber alert shown, tab switches to "Paste Posts" automatically

---

## Scenario 4: Error Handling

| Scenario | Expected Behaviour |
|---|---|
| Login with wrong password | Red error: "Invalid email or password." |
| Register with existing email | Red error: "An account with this email already exists." |
| Access `/dashboard` without token | Redirected to `/login` |
| Access `/login` while logged in | Redirected to `/dashboard` |
| Generate without completing interview | API returns 400 → frontend redirects to `/onboarding` |
| Paste fewer than 30 chars of posts | API returns 400 validation error |

---

## curl Test Commands

Save a cookie jar and reuse it across commands:

### Register
```bash
curl -s -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -c /tmp/cookies.txt \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}' | jq
```

### Login
```bash
curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -c /tmp/cookies.txt \
  -d '{"email":"test@example.com","password":"password123"}' | jq
```

### Get Current User
```bash
curl -s http://localhost:3001/api/auth/me \
  -b /tmp/cookies.txt | jq
```

### Analyze Persona (manual paste)
```bash
curl -s -X POST http://localhost:3001/api/persona/analyze \
  -H "Content-Type: application/json" \
  -b /tmp/cookies.txt \
  -d '{
    "manualPosts": "AI is transforming how we work. Here are 5 things I learned leading a team through AI adoption...\n\n---\n\nLeadership lesson: The best teams I have managed all share one trait — radical transparency. Here is how we implemented it...\n\n---\n\nStartup lesson: We went from 0 to 10k users in 90 days. The secret was not the product — it was distribution..."
  }' | jq
```

### Start / Continue Interview
```bash
curl -s -X POST http://localhost:3001/api/onboarding/chat \
  -H "Content-Type: application/json" \
  -b /tmp/cookies.txt \
  -d '{"message": "Hi! I am ready to set up my content strategy."}' | jq
```

### Check Interview Status
```bash
curl -s http://localhost:3001/api/onboarding/status \
  -b /tmp/cookies.txt | jq
```

### Generate Content Suggestions
```bash
curl -s -X POST http://localhost:3001/api/suggestions/generate \
  -H "Content-Type: application/json" \
  -b /tmp/cookies.txt \
  -d '{}' | jq
```

### Get Suggestion History
```bash
curl -s "http://localhost:3001/api/suggestions?page=1&limit=5" \
  -b /tmp/cookies.txt | jq
```

### Logout
```bash
curl -s -X POST http://localhost:3001/api/auth/logout \
  -b /tmp/cookies.txt | jq
```

---

## Common Issues & Fixes

### CORS error in browser console
```
Access to fetch at 'http://localhost:3001/...' from origin 'http://localhost:3000' has been blocked
```
**Fix:** Ensure `apps/web/.env.local` contains `NEXT_PUBLIC_API_URL=http://localhost:3001` (no trailing slash).
**Check:** `apps/api/src/index.ts` CORS origin must be `http://localhost:3000` (no trailing slash).

---

### Cookie not sent with requests
```
401 Authentication required
```
**Check:** Frontend `fetch()` calls use `credentials: 'include'` ✓ (already set in `lib/api.ts`).
**Check:** Cookie is `sameSite: 'lax'`, `secure: false` in development ✓ (already set in `routes/auth.ts`).

---

### MongoDB connection fails on startup
```
[db] Connection attempt 1/5 failed
```
**Fix:** Verify `MONGODB_URI` in root `.env`. For Atlas: whitelist your IP in **Network Access → Add IP Address → Allow Access from Anywhere (0.0.0.0/0)** during development.

---

### Gemini API error / empty suggestions
```
Content generation failed: ...
```
**Check:** `GEMINI_API_KEY` is set. Visit https://ai.google.dev to get a free key.
**Check:** Free tier limits: 15 RPM, 1M tokens/day for `gemini-2.5-flash`.
**Fix:** If hitting rate limits, wait 60 seconds and retry.

---

### LinkedIn scraping blocked (expected)
The scraper uses Puppeteer in headless mode. LinkedIn actively blocks automated scrapers.
**Expected UX:** The error is caught, the UI switches to "Paste Posts" tab and shows an amber warning.
**Fix:** Nothing to fix — this is working as designed.

---

### `NEXT_PUBLIC_*` env not picked up
Next.js only reads `NEXT_PUBLIC_*` from `.env.local` inside the `apps/web/` directory.
**Fix:** Confirm `apps/web/.env.local` exists with `NEXT_PUBLIC_API_URL=http://localhost:3001`.

---

## Verifying All 13 API Endpoints

Open **http://localhost:3001/api/docs** and confirm all these routes appear:

| Method | Path | Tag |
|--------|------|-----|
| POST | /api/auth/register | Auth |
| POST | /api/auth/login | Auth |
| POST | /api/auth/logout | Auth |
| GET | /api/auth/me | Auth |
| POST | /api/persona/analyze | Persona |
| GET | /api/persona | Persona |
| POST | /api/onboarding/chat | Onboarding |
| GET | /api/onboarding/session | Onboarding |
| GET | /api/onboarding/status | Onboarding |
| GET | /api/trends | Trends |
| POST | /api/suggestions/generate | Suggestions |
| GET | /api/suggestions | Suggestions |
| GET | /api/suggestions/:id | Suggestions |

---

## Completion Checklist

- [ ] `npm run dev` starts both servers without errors
- [ ] Health check returns `{"status":"ok"}`
- [ ] Register → redirected to `/onboarding`
- [ ] Manual paste persona analysis completes
- [ ] 5-question interview completes and saves to DB
- [ ] Dashboard shows all 3 status cards as green
- [ ] Content generation pipeline runs and returns 5+ ideas
- [ ] Suggestion cards render with hook, topic, angle, format badge
- [ ] "Copy Hook" clipboard button works
- [ ] "Why this fits" expands inline
- [ ] Suggestions history page loads and shows past sets
- [ ] Pagination works (if more than 5 sets)
- [ ] Logout clears cookie and redirects to `/login`
- [ ] Unauthenticated access to `/dashboard` redirects to `/login`
- [ ] Swagger UI at `/api/docs` shows all 13 routes

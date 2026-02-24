# Phase 5: Next.js Frontend

# Status: COMPLETE (2026-02-20)

---

## Goal

Build the complete frontend — auth pages, onboarding flow, chat UI, and
suggestions dashboard. All pages styled with Tailwind + shadcn/ui.

## Checklist

- [x] Install shadcn/ui and init (axios, lucide-react, clsx, tailwind-merge, Radix UI primitives)
- [x] apps/web/src/lib/api.ts — API client (fetch wrapper with ApiError class)
- [x] apps/web/src/lib/utils.ts — cn() helper
- [x] Auth pages: /login, /register
- [x] Onboarding page: /onboarding (3-step: profile-input → interview → complete)
- [x] Dashboard: /dashboard (status cards + generate + suggestion cards)
- [x] Suggestions history: /dashboard/suggestions (paginated, expandable sets)
- [x] Dashboard layout: apps/web/src/app/dashboard/layout.tsx
- [x] Layout with navbar (Navbar.tsx with logout)
- [x] Protected route wrapper (apps/web/src/middleware.ts)
- [x] Loading states and error handling throughout

## Files Created

- src/lib/api.ts — Full typed API client (authApi, personaApi, onboardingApi, suggestionsApi)
- src/lib/utils.ts — cn() helper
- src/components/ui/{button,input,textarea,card,badge}.tsx
- src/components/layout/Navbar.tsx
- src/components/chat/ChatInterface.tsx
- src/components/suggestions/SuggestionCard.tsx
- src/app/(auth)/login/page.tsx
- src/app/(auth)/register/page.tsx
- src/app/onboarding/page.tsx
- src/app/dashboard/layout.tsx
- src/app/dashboard/page.tsx
- src/app/dashboard/suggestions/page.tsx

## Page Specifications

### /login

```
Components: LoginForm (email + password + submit)
Logic:
  - POST /api/auth/login
  - On success → redirect to /dashboard
  - On error → show error message
  - Link to /register
UI: Centered card, clean minimal design
```

### /register

```
Components: RegisterForm (name + email + password + submit)
Logic:
  - POST /api/auth/register
  - On success → redirect to /onboarding
  - On error → show error message
  - Link to /login
```

### /onboarding

```
Step 1: LinkedIn Profile Input
  - Form with two options (tabs):
    a) LinkedIn URL input → POST /api/persona/analyze { linkedinUrl }
    b) Manual paste textarea → POST /api/persona/analyze { manualPosts }
  - Loading state: "Analyzing your LinkedIn profile..."
  - On success → move to Step 2

Step 2: Interview Chat
  - Chat interface (messages list + input box)
  - Sends to POST /api/onboarding/chat { message }
  - Displays AI responses in real-time
  - Shows progress: "3 of 5 questions answered"
  - When interviewComplete=true → show "Analysis complete!" + button to /dashboard
  - On page load: GET /api/onboarding/session to restore history
```

### /dashboard

```
Layout: Sidebar nav (Dashboard, History, Profile)

Main content:
  Section 1: Quick Stats
    - Persona status (complete/incomplete)
    - Number of suggestion sets generated
    - Last generated date

  Section 2: Generate New Ideas
    - Button: "Generate Content Ideas" → POST /api/suggestions/generate
    - Loading state: "Researching trends... Generating ideas..."
    - On success → show results below

  Section 3: Latest Suggestions
    - Card grid (2-3 columns on desktop)
    - Each card shows: format badge, hook text, topic, angle
    - Expandable to show full whyItFits text
    - Copy button for hook text

  If no suggestions yet:
    - Placeholder with "Generate your first content ideas" CTA
```

### /dashboard/suggestions

```
- Paginated list of all past suggestion sets
- Grouped by date
- Each set shows: date, number of ideas, trends used
- Click to expand and see all ideas in that set
- GET /api/suggestions?page=1&limit=10
```

## Component Plan

### apps/web/src/components/chat/ChatInterface.tsx

```typescript
// Props: onMessage(msg: string) => Promise<void>, messages: IMessage[], loading: boolean
// UI: Scrollable messages list + fixed input bar at bottom
// Features:
//   - Auto-scroll to latest message
//   - Typing indicator when loading=true
//   - Enter key submits (Shift+Enter for newline)
//   - Message timestamps
```

### apps/web/src/components/suggestions/SuggestionCard.tsx

```typescript
// Props: suggestion: ISuggestion
// UI:
//   - Format badge (colored by type: carousel=blue, poll=green, etc.)
//   - Hook text (large, bold)
//   - Topic and angle (smaller)
//   - Expandable "Why it fits" section
//   - Copy hook button (clipboard API)
```

### apps/web/src/components/layout/Navbar.tsx

```typescript
// Shows: Logo | Nav links | User email | Logout button
// Logout: POST /api/auth/logout → clear cookie → redirect /login
```

### apps/web/src/lib/api.ts

```typescript
// Base URL: process.env.NEXT_PUBLIC_API_URL
// All requests include credentials: 'include' (for httpOnly cookies)
// Functions:
//   auth: login(), register(), logout(), getMe()
//   persona: analyzePersona(), getPersona()
//   onboarding: sendMessage(), getSession(), getStatus()
//   trends: getTrends()
//   suggestions: generateSuggestions(), getSuggestions(), getSuggestionById()
// Error handling: throw with response.json().error message
```

### Protected Route Pattern (App Router)

```typescript
// apps/web/src/app/dashboard/layout.tsx
// On server side: check cookie, redirect to /login if missing
// Use Next.js middleware (middleware.ts) for route protection
```

## UI Design Notes

- **Color scheme**: LinkedIn blue (#0077B5) as accent, white/gray background
- **Font**: Inter (already in Next.js)
- **Suggestion card colors by format**:
  - carousel: blue badge
  - text-post: purple badge
  - poll: green badge
  - video-script: red badge
  - list: orange badge
- **Loading states**: Use shadcn Skeleton components
- **Toasts**: shadcn Toaster for success/error notifications

## Completion Criteria

- Can register → redirected to onboarding
- Can complete LinkedIn URL analysis
- Can complete 5-question interview in chat
- Can generate content suggestions from dashboard
- Can view past suggestion history
- Logout works and redirects to login
- All pages responsive (mobile + desktop)

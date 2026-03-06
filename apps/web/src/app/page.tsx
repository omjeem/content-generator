"use client";

import Link from "next/link";
import { useState } from "react";

// ── Icon helpers (inline SVGs) ──────────────────────────────────────────────

function IconSpark({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  );
}

function IconArrow({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

function IconCheck({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

// ── Step card for "How it works" ────────────────────────────────────────────

interface StepProps {
  number: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  isLast?: boolean;
}

function Step({ number, icon, title, description, color, isLast }: StepProps) {
  return (
    <div className="flex flex-col items-center text-center relative">
      {!isLast && (
        <div className="hidden lg:block absolute top-10 left-[calc(50%+3rem)] w-[calc(100%-6rem)] h-[2px] bg-gradient-to-r from-blue-200 to-blue-100 z-0" />
      )}
      <div className={`relative z-10 w-20 h-20 rounded-2xl flex items-center justify-center text-white shadow-lg mb-4 ${color}`}>
        {icon}
        <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border-2 border-gray-200 text-xs font-bold text-gray-700 flex items-center justify-center shadow">
          {number}
        </span>
      </div>
      <h3 className="font-bold text-gray-900 text-lg mb-2">{title}</h3>
      <p className="text-gray-500 text-sm leading-relaxed max-w-[220px]">{description}</p>
    </div>
  );
}

// ── Feature card ────────────────────────────────────────────────────────────

function FeatureCard({ icon, title, description, badge }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow group">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            {badge && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{badge}</span>
            )}
          </div>
          <p className="text-gray-500 text-sm leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

// ── Stat pill ───────────────────────────────────────────────────────────────

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl md:text-4xl font-extrabold text-white">{value}</div>
      <div className="text-blue-200 text-sm mt-1">{label}</div>
    </div>
  );
}

// ── Animated Architecture Pipeline (Technical view) ─────────────────────────

function AnimatedPipeline() {
  const nodes = [
    { icon: "📋", label: "Your Posts", sub: "5-10 posts pasted", bg: "from-blue-500 to-blue-600", delay: "0s" },
    { icon: "🔬", label: "Persona Analyst", sub: "Agent 1: Voice + Writing DNA", bg: "from-violet-500 to-violet-600", delay: "0.3s" },
    { icon: "🤝", label: "Onboarding", sub: "Agent 2: Goals & audience", bg: "from-purple-500 to-purple-600", delay: "0.6s" },
    { icon: "📡", label: "Trend Research", sub: "Agent 3: 60+ domain feeds", bg: "from-emerald-500 to-emerald-600", delay: "0.9s" },
    { icon: "✨", label: "Content Engine", sub: "Agent 4: Rich briefs", bg: "from-orange-500 to-rose-500", delay: "1.2s" },
    { icon: "🎯", label: "Your Feed", sub: "5-7 personalized ideas", bg: "from-indigo-500 to-indigo-700", delay: "1.5s" },
  ];

  return (
    <div className="w-full overflow-x-auto pb-4">
      <div className="flex items-center justify-center gap-0 min-w-[800px] py-4">
        {nodes.map((node, i) => (
          <div key={node.label} className="flex items-center">
            <div className="flex flex-col items-center gap-2 animate-fadeInUp" style={{ animationDelay: node.delay }}>
              <div className={`w-[72px] h-[72px] rounded-2xl bg-gradient-to-br ${node.bg} flex items-center justify-center shadow-lg text-2xl animate-pulse-slow`} style={{ animationDelay: node.delay }}>
                {node.icon}
              </div>
              <span className="font-semibold text-gray-800 text-xs text-center whitespace-nowrap">{node.label}</span>
              <span className="text-[10px] text-gray-400 text-center max-w-[100px] leading-tight">{node.sub}</span>
            </div>
            {i < nodes.length - 1 && (
              <div className="flex items-center px-1 mt-[-24px]">
                <div className="w-6 h-[2px] bg-gradient-to-r from-gray-300 to-gray-400 animate-flowRight" style={{ animationDelay: `${0.3 * i + 0.15}s` }} />
                <svg className="w-2.5 h-2.5 text-gray-400 -ml-0.5" fill="currentColor" viewBox="0 0 6 10">
                  <path d="M0 0l6 5-6 5V0z" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Technical Architecture Deep Dive ────────────────────────────────────────

function TechnicalArchitecture() {
  return (
    <div className="space-y-10">
      {/* System Architecture Diagram */}
      <div className="bg-slate-900 rounded-2xl p-6 md:p-8 overflow-x-auto">
        <h4 className="text-emerald-400 font-mono text-sm mb-4 uppercase tracking-wider">System Architecture</h4>
        <pre className="text-xs md:text-sm text-slate-300 font-mono leading-relaxed whitespace-pre overflow-x-auto">
{`  Browser (Next.js 14 — port 3000)
  ┌─────────────────────────────────────────────────────────────┐
  │  Landing ─→ Auth ─→ Onboarding ─→ Dashboard ─→ Editor       │
  │                                    │                        │
  │  Components: SuggestionCard, TrendBrowser, TopicBrowser,    │
  │              PostEditorPane, EditorChatPane, AiDetectorPanel│
  └────────────────────────┬────────────────────────────────────┘
                           │ HTTP (axios)
                           ▼
  Express API (TypeScript — port 5006)
  ┌─────────────────────────────────────────────────────────────┐
  │  Middleware: JWT Auth → Rate Limiter → Route Handler        │
  │                                                             │
  │  Routes: auth, persona, onboarding, trends, suggestions,    │
  │          personaChat, feedback, drafts, tokenUsage,         │
  │          admin, audience                                    │
  │                                                             │
  │  Agents (Mastra AI + Gemini 2.5 Flash):                     │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
  │  │ Persona  │→ │Onboarding│→ │  Trend   │→ │Content   │     │
  │  │ Analyst  │  │  Coach   │  │Researcher│  │Generator │     │
  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
  │  ┌──────────┐  ┌──────────┐                                 │
  │  │ Persona  │  │  Post    │  Services: writingDNA,          │
  │  │  Chat    │  │ Editor   │  personaConfidence, trendCache, │
  │  └──────────┘  └──────────┘  feedbackProcessor, abTest...   │
  │                                                             │
  │  Utils: circuitBreaker, fireAndForget, scoring, extractJSON │
  └────────────────────────┬────────────────────────────────────┘
                           │ Mongoose
                           ▼
  MongoDB (13 Collections)
  ┌─────────────────────────────────────────────────────────────┐
  │  users, user_personas, chat_sessions, content_suggestions,  │
  │  suggestion_feedbacks, post_drafts, token_usage_logs,       │
  │  token_requests, admin_audit_logs, system_configs,          │
  │  refresh_tokens, trend_caches, audience_insights            │
  └─────────────────────────────────────────────────────────────┘`}
        </pre>
      </div>

      {/* Multi-Agent Pipeline Detail */}
      <div className="bg-slate-900 rounded-2xl p-6 md:p-8 overflow-x-auto">
        <h4 className="text-emerald-400 font-mono text-sm mb-4 uppercase tracking-wider">Multi-Agent Pipeline Flow</h4>
        <pre className="text-xs md:text-sm text-slate-300 font-mono leading-relaxed whitespace-pre overflow-x-auto">
{`  POST /api/suggestions/generate
  ┌──────────────────────────────────────────────────────────────┐
  │ Step 0: Token Quota Check                                    │
  │         ↓ (fail fast if exceeded)                            │
  │ Step 1: Persona Analysis (Agent 1) ──── 30s timeout          │
  │         Extract: tone, topics, writingStyle, expertise       │
  │         + Writing DNA (deterministic, no LLM)                │
  │         + Confidence Score computation                       │
  │         ↓                                                    │
  │ Step 2: Interview Check (Agent 2) ──── skip if complete      │
  │         Fills: goals, targetAudience, industry, pillars      │
  │         ↓                                                    │
  │ Step 3: Trend Research (Agent 3) ──── 15s timeout            │
  │         classifyDomain() → select from 14 domain categories  │
  │         Tier 1: Tavily web search (if API key available)     │
  │         Tier 2: HN Algolia (tech-adjacent only) + Domain RSS │
  │         Tier 2.5: Google News RSS fallback                   │
  │         Tier 3: Evergreen fallback                           │
  │         + Trend deduplication across sources                 │
  │         + Scheduling hints from domain data                  │
  │         + Content series detection                           │
  │         ↓                                                    │
  │ Step 4: Content Generation (Agent 4) ──── 45s timeout        │
  │         Prompt includes: persona + Writing DNA + confidence  │
  │         directive + feedback signals + format strategy +     │
  │         trends + scheduling hints + series data + audience   │
  │         signals + peer awareness                             │
  │         Output: 5-7 rich content briefs with hooks, points,  │
  │         CTAs, SEO keywords, scheduling hints, series tags    │
  │         ↓                                                    │
  │ Step 5: Persist to MongoDB + fire-and-forget token tracking  │
  └──────────────────────────────────────────────────────────────┘
  Overall pipeline timeout: 90s  |  Retry: 2 attempts + exp backoff
  Circuit breaker: opens after 5 consecutive failures, 60s cooldown`}
        </pre>
      </div>

      {/* Feedback Learning Loop */}
      <div className="bg-slate-900 rounded-2xl p-6 md:p-8 overflow-x-auto">
        <h4 className="text-emerald-400 font-mono text-sm mb-4 uppercase tracking-wider">Feedback Learning Loop</h4>
        <pre className="text-xs md:text-sm text-slate-300 font-mono leading-relaxed whitespace-pre overflow-x-auto">
{`  User Action                  Signal Weight         Learning Path
  ─────────────                  ─────────────         ─────────────
  Rate "loved" + publish         2.0  × 1.0 = 2.0   →  personaLearning
  Rate "good" + save             1.2  × 0.75 = 0.9  →  personaLearning
  Rate "bad" + dismiss           1.0  × -1.0 = -1.0 →  personaLearning
  Copy hook (implicit)           0.75 × 0.5 = 0.38  →  personaLearning
  Copy brief (implicit)          1.0  × 0.5 = 0.5   →  personaLearning
  Click "Write This Post"        1.5  × 0.5 = 0.75  →  personaLearning
  Publish + report 500 likes     3.0  × 1.0 = 3.0   →  personaLearning
  Publish + report 5 likes       1.0  × 1.0 = 1.0   →  personaLearning

  All signals apply recency decay: weight × 0.5^(days/14)
  First 3 feedbacks trigger learning on every single one
  After that, every 3rd feedback triggers a learning cycle

  Learning updates → UserPersona.feedbackProfile:
    preferredTopics, avoidTopics, formatPreferences,
    tonePreference, averageRating, implicitSignalCount`}
        </pre>
      </div>

      {/* Domain-Aware Trend Fetching */}
      <div className="bg-slate-900 rounded-2xl p-6 md:p-8 overflow-x-auto">
        <h4 className="text-emerald-400 font-mono text-sm mb-4 uppercase tracking-wider">Domain-Aware Trend Fetching</h4>
        <pre className="text-xs md:text-sm text-slate-300 font-mono leading-relaxed whitespace-pre overflow-x-auto">
{`  classifyDomain(industry, topics)
  ┌──────────────────────────────────────────────────-┐
  │ tech       → TechCrunch, Ars Technica, Wired      │
  │ healthcare → HealthIT News, MedPage Today, WHO    │
  │ finance    → Bloomberg, CNBC, Financial Times     │
  │ legal      → Law.com, ABA Journal, Reuters Legal  │
  │ education  → EdSurge, Inside Higher Ed            │
  │ creative   → Creative Bloq, Behance, Colossal     │
  │ food       → Eater, Food & Wine, Bon Appetit      │
  │ wellness   → Mindful, Well+Good, Psychology Today │
  │ sustainability → GreenBiz, CleanTechnica          │
  │ hr         → SHRM, HR Dive, People Matters        │
  │ real-estate→ Inman, HousingWire                   │
  │ manufacturing → IndustryWeek, The Fabricator      │
  │ business   → HBR, Entrepreneur, Inc, Fast Company │
  │ general    → CNN, BBC, Reuters                    │
  └──────────────────────────────────────────────────-┘
  60+ domain-specific RSS feeds across 14 categories
  HN Algolia: only for tech-adjacent domains
  Two-tier cache: L1 in-memory (5min) + L2 MongoDB (30min)`}
        </pre>
      </div>

      {/* Tech Stack Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: "Backend", items: ["Express + TypeScript", "Mastra AI framework", "Gemini 2.5 Flash LLM", "Mongoose ODM", "JWT httpOnly cookies", "Zod validation", "Rate limiting", "Circuit breaker"] },
          { title: "Frontend", items: ["Next.js 14 App Router", "Tailwind CSS", "shadcn/ui components", "Axios HTTP client", "Lucide React icons", "React Hot Toast", "Implicit signal tracking"] },
          { title: "Infrastructure", items: ["Turborepo monorepo", "MongoDB Atlas", "Docker Compose", "Swagger/OpenAPI docs", "13 DB collections", "TTL indexes", "Shared TypeScript types"] },
        ].map((col) => (
          <div key={col.title} className="bg-white rounded-xl border border-gray-200 p-5">
            <h4 className="font-bold text-gray-900 text-sm mb-3 uppercase tracking-wide">{col.title}</h4>
            <ul className="space-y-1.5">
              {col.items.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Non-Technical User Guide ────────────────────────────────────────────────

function NonTechnicalGuide() {
  return (
    <div className="space-y-8">
      {/* Simple visual pipeline */}
      <div className="bg-gradient-to-br from-blue-50 to-violet-50 rounded-2xl border border-blue-100 p-6 md:p-8">
        <h4 className="text-lg font-bold text-gray-900 mb-6 text-center">How PostMind AI Works For You</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { step: "1", icon: "📝", title: "You share your posts", desc: "Paste 5-10 of your best LinkedIn or Twitter posts. This teaches the AI what topics you care about, how you write, and what makes your voice unique.", color: "bg-blue-100 border-blue-200 text-blue-800" },
            { step: "2", icon: "🧠", title: "AI learns your voice", desc: "Six specialized AI agents analyze your writing style, sentence patterns, emoji habits, and opening techniques. It builds a complete profile of YOU — not a generic template.", color: "bg-violet-100 border-violet-200 text-violet-800" },
            { step: "3", icon: "🎯", title: "Get personalized ideas", desc: "The AI combines your unique voice with today's trending topics in your industry to suggest 5-7 post ideas complete with hooks, talking points, and calls-to-action.", color: "bg-emerald-100 border-emerald-200 text-emerald-800" },
          ].map((item) => (
            <div key={item.step} className={`rounded-xl border p-5 ${item.color}`}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider opacity-60">Step {item.step}</span>
                  <h5 className="font-bold text-base">{item.title}</h5>
                </div>
              </div>
              <p className="text-sm leading-relaxed opacity-80">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* What makes it different */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8">
        <h4 className="text-lg font-bold text-gray-900 mb-2">What makes PostMind AI different from ChatGPT?</h4>
        <p className="text-gray-500 text-sm mb-6">Most AI tools generate generic content. PostMind AI is purpose-built to understand YOU.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { bad: "Generic AI gives you the same ideas as everyone else", good: "PostMind AI generates ideas based on YOUR unique expertise and voice" },
            { bad: "ChatGPT doesn't know what's trending in your industry", good: "PostMind AI pulls real-time news from 60+ sources in your specific field" },
            { bad: "Generic AI forgets your preferences after each session", good: "PostMind AI learns from every interaction and gets smarter over time" },
            { bad: "Other tools produce robotic-sounding content", good: "PostMind AI matches your sentence patterns, emoji habits, and vocabulary" },
          ].map((row, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="flex items-start gap-2 text-sm">
                <span className="text-red-400 shrink-0 mt-0.5">&#10007;</span>
                <span className="text-gray-400 line-through">{row.bad}</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <span className="text-emerald-500 shrink-0 mt-0.5">&#10003;</span>
                <span className="text-gray-700 font-medium">{row.good}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* The learning cycle */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-6 md:p-8">
        <h4 className="text-lg font-bold text-gray-900 mb-2">The more you use it, the better it gets</h4>
        <p className="text-gray-600 text-sm mb-6">PostMind AI has a built-in learning cycle. Here's how it works:</p>
        <div className="space-y-4">
          {[
            { emoji: "1️⃣", title: "Generate ideas", desc: "The AI suggests 5-7 content ideas based on your profile + current trends" },
            { emoji: "2️⃣", title: "Rate what you like", desc: "Tell the AI which ideas you loved, which were okay, and which missed the mark" },
            { emoji: "3️⃣", title: "Write and publish", desc: "Use the built-in AI editor to turn an idea into a polished post — then publish it" },
            { emoji: "4️⃣", title: "Report performance", desc: "Tell the AI how your post performed (likes, comments, reposts) — this is the most powerful signal" },
            { emoji: "5️⃣", title: "Get better suggestions", desc: "Next time you generate, the AI uses everything it learned to give you even better ideas" },
          ].map((step) => (
            <div key={step.emoji} className="flex items-start gap-3">
              <span className="text-lg shrink-0">{step.emoji}</span>
              <div>
                <h5 className="font-semibold text-gray-900 text-sm">{step.title}</h5>
                <p className="text-gray-600 text-sm">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Best Practices / Efficient Usage Guide ──────────────────────────────────

function UsageGuide() {
  return (
    <div className="space-y-6">
      {/* Pro tips grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[
          {
            icon: "📝",
            title: "Input Quality = Output Quality",
            tips: [
              "Paste 5-10 of your BEST posts — not random ones, your highest-engagement content",
              "Include variety: mix stories, lists, opinions, and how-to posts",
              "Use recent posts (last 6 months) — your voice evolves",
              "Longer posts (200+ words) give the AI 10x more signal than short updates",
              "Add posts from the platform you want to generate for",
            ],
            importance: "critical",
          },
          {
            icon: "🎯",
            title: "Complete Your Strategy Profile",
            tips: [
              "Answer ALL 5 interview questions — don't skip any",
              "Be specific about your audience: 'SaaS founders with 10-50 employees' beats 'business people'",
              "List 3-5 content pillars that define your expertise",
              "Set a realistic posting frequency — the AI calibrates urgency",
              "Choose your platform goal (thought leadership, lead gen, community, etc.)",
            ],
            importance: "high",
          },
          {
            icon: "⭐",
            title: "Rate Every Single Suggestion",
            tips: [
              "Always give BOTH a rating (loved/good/meh/bad) AND an action (save/draft/dismiss)",
              "The first 3 feedbacks trigger instant learning — don't skip them",
              "After 10+ feedbacks, the AI significantly adapts to your preferences",
              "After 20+ feedbacks, suggestions become highly personalized to you",
              "Use the optional text feedback to explain WHY you liked/disliked an idea",
            ],
            importance: "critical",
          },
          {
            icon: "📊",
            title: "Report Your Post Performance",
            tips: [
              "After publishing, wait 24-48 hours then report your engagement numbers",
              "This is the STRONGEST learning signal — 3x weight in the AI's memory",
              "Even rough numbers help: '~100 likes, ~20 comments' is better than nothing",
              "The AI dashboard will remind you to report — don't skip the notification",
              "Over time, the AI learns what your audience actually engages with",
            ],
            importance: "critical",
          },
          {
            icon: "🔄",
            title: "Use the Right Generation Mode",
            tips: [
              "Quick Generate — fast ideas when you just need inspiration",
              "Browse Trends — when you want to ride a specific trending wave",
              "AI Topics — when you want the AI to suggest what you should write about",
              "Topic Focus — when you have a specific topic in mind",
              "Chat Refined — when you want full control over direction",
            ],
            importance: "high",
          },
          {
            icon: "✏️",
            title: "Maximize the Post Editor",
            tips: [
              "Click 'Write This Post' to turn any idea into a full draft with AI",
              "The AI editor uses your Writing DNA to maintain your voice",
              "Run the AI Detector before publishing — aim for a low AI score",
              "Use the Humanizer at 'moderate' intensity for the best balance",
              "Review version history to see how the post evolved",
            ],
            importance: "high",
          },
        ].map((card) => (
          <div key={card.title} className={`bg-white rounded-2xl border p-6 ${card.importance === "critical" ? "border-indigo-200 ring-1 ring-indigo-100" : "border-gray-200"}`}>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">{card.icon}</span>
              <div>
                <h4 className="font-bold text-gray-900">{card.title}</h4>
                {card.importance === "critical" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">Most Important</span>
                )}
              </div>
            </div>
            <ul className="space-y-2">
              {card.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="text-indigo-400 shrink-0 mt-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 12 12"><circle cx="6" cy="6" r="3" /></svg>
                  </span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Confidence Score Explanation */}
      <div className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-2xl border border-indigo-200 p-6 md:p-8">
        <h4 className="text-lg font-bold text-gray-900 mb-2">Your Persona Confidence Score</h4>
        <p className="text-gray-600 text-sm mb-5">PostMind AI shows you a 0-100% score of how well it understands you. Here's how to max it out:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Post Volume", max: "25 pts", tip: "Add 10+ posts", icon: "📝" },
            { label: "Interview", max: "20 pts", tip: "Answer all 5 questions", icon: "🎤" },
            { label: "Feedback", max: "25 pts", tip: "Rate 10+ suggestions", icon: "⭐" },
            { label: "Performance", max: "15 pts", tip: "Report 3+ post results", icon: "📊" },
            { label: "Recency", max: "15 pts", tip: "Stay active weekly", icon: "🕐" },
          ].map((dim) => (
            <div key={dim.label} className="bg-white rounded-xl border border-indigo-100 p-4 text-center">
              <span className="text-xl mb-1 block">{dim.icon}</span>
              <h5 className="font-bold text-gray-900 text-sm">{dim.label}</h5>
              <p className="text-indigo-600 font-mono text-xs font-bold">{dim.max}</p>
              <p className="text-gray-500 text-xs mt-1">{dim.tip}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Landing Page ───────────────────────────────────────────────────────

export default function LandingPage() {
  const [viewMode, setViewMode] = useState<"non-technical" | "technical">("non-technical");

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* CSS animations */}
      <style jsx global>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes flowRight {
          from { width: 0; opacity: 0; }
          to { width: 24px; opacity: 1; }
        }
        .animate-fadeInUp {
          animation: fadeInUp 0.6s ease-out both;
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }
        .animate-flowRight {
          animation: flowRight 0.4s ease-out both;
        }
      `}</style>

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center shadow-sm">
              <IconSpark className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-lg">PostMind AI</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-600">
            <a href="#how-it-works" className="hover:text-[#6366f1] transition-colors">How it works</a>
            <a href="#understand" className="hover:text-[#6366f1] transition-colors">Deep Dive</a>
            <a href="#best-practices" className="hover:text-[#6366f1] transition-colors">Best Practices</a>
            <a href="#features" className="hover:text-[#6366f1] transition-colors">Features</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Log in</Link>
            <Link href="/register" className="text-sm bg-[#6366f1] hover:bg-[#4f46e5] text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm">Get started free</Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-blue-100 via-blue-50 to-transparent opacity-70" />
          <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-violet-100 via-transparent to-transparent opacity-50" />
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 md:pt-28 md:pb-32 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-4 py-1.5 text-sm text-blue-700 font-medium mb-6">
            <IconSpark className="w-4 h-4" />
            6-Agent AI Pipeline + Real-Time Domain Trends + Adaptive Learning
          </div>

          <div className="flex items-center justify-center gap-3 mb-5">
            <span className="inline-flex items-center gap-1.5 bg-[#0A66C2]/10 text-[#0A66C2] border border-[#0A66C2]/20 rounded-full px-3 py-1 text-sm font-semibold">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              LinkedIn
            </span>
            <span className="text-gray-300 text-lg font-light">+</span>
            <span className="inline-flex items-center gap-1.5 bg-black/5 text-gray-800 border border-gray-200 rounded-full px-3 py-1 text-sm font-semibold">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              Twitter / X
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
            Content that sounds
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#6366f1] to-violet-500">exactly like you</span>
          </h1>

          <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto mb-8 leading-relaxed">
            Paste your existing posts. PostMind AI analyzes your Writing DNA,
            learns your unique voice, then combines it with real-time trending
            topics from your industry to generate ideas that feel 100% authentic.
          </p>

          <div className="inline-flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5 text-left mb-10 max-w-xl mx-auto">
            <span className="text-xl mt-0.5">💡</span>
            <p className="text-sm text-amber-800 leading-relaxed">
              <span className="font-semibold">Pro tip:</span> Paste at least <span className="font-semibold">5-10 of your best-performing posts</span> so the AI has enough data to understand your tone, topics, sentence patterns, and style. The more you share, the more it sounds like you.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="inline-flex items-center justify-center gap-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white px-8 py-3.5 rounded-xl font-semibold text-base shadow-lg hover:shadow-xl transition-all">
              Paste your posts &amp; start
              <IconArrow className="w-4 h-4" />
            </Link>
            <a href="#how-it-works" className="inline-flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-700 px-8 py-3.5 rounded-xl font-semibold text-base transition-all">
              See how it works
            </a>
          </div>

          <p className="mt-8 text-sm text-gray-400">
            No credit card required &nbsp;·&nbsp; Free 400K token quota included
          </p>
        </div>
      </section>

      {/* ── Stats band ── */}
      <section className="bg-gradient-to-r from-[#6366f1] to-violet-600 py-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-2 md:grid-cols-5 gap-8">
          <Stat value="6" label="AI Agents" />
          <Stat value="14" label="Industry Domains" />
          <Stat value="60+" label="Trend Sources" />
          <Stat value="2" label="Platforms" />
          <Stat value="400K" label="Free Tokens" />
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-20 md:py-28 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-blue-600 uppercase tracking-wider">Simple 4-step process</span>
            <h2 className="mt-2 text-3xl md:text-4xl font-extrabold text-gray-900">From your posts to a full content plan — in minutes</h2>
            <p className="mt-4 text-gray-500 max-w-xl mx-auto">No complicated setup. Just paste some of your past posts and the AI takes care of everything else.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
            <Step number={1} icon={<svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" /></svg>} title="Paste your posts" description="Copy-paste 5-10 of your best LinkedIn or Twitter posts. That's all the AI needs to learn your voice." color="bg-gradient-to-br from-indigo-500 to-indigo-700" />
            <Step number={2} icon={<svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3a9 9 0 110 18A9 9 0 0112 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 10h.01M15 10h.01M9.5 14s.8 1.5 2.5 1.5 2.5-1.5 2.5-1.5" /></svg>} title="AI builds your Writing DNA" description="Six AI agents analyze your writing patterns, voice, sentence structure, and style — building a complete fingerprint." color="bg-gradient-to-br from-violet-500 to-violet-700" />
            <Step number={3} icon={<svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>} title="Industry trends fetched" description="Pulls from 60+ feeds specific to YOUR industry — not generic tech news unless that's your domain." color="bg-gradient-to-br from-emerald-500 to-emerald-700" />
            <Step number={4} icon={<IconSpark className="w-8 h-8" />} title="5-7 personalized ideas" description="Rich content briefs with hooks, talking points, CTAs, scheduling hints, and format recommendations." color="bg-gradient-to-br from-orange-400 to-rose-500" isLast />
          </div>
        </div>
      </section>

      {/* ── Deep Dive: Technical vs Non-Technical Toggle ── */}
      <section id="understand" className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <span className="text-sm font-semibold text-violet-600 uppercase tracking-wider">Understand the Platform</span>
            <h2 className="mt-2 text-3xl md:text-4xl font-extrabold text-gray-900">See How PostMind AI Works Under the Hood</h2>
            <p className="mt-4 text-gray-500 max-w-2xl mx-auto">
              Switch between a simple visual overview or a detailed technical architecture view.
            </p>
          </div>

          {/* Toggle */}
          <div className="flex items-center justify-center mb-10">
            <div className="inline-flex rounded-xl bg-gray-100 p-1 border border-gray-200">
              <button
                onClick={() => setViewMode("non-technical")}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${viewMode === "non-technical" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                Simple Overview
              </button>
              <button
                onClick={() => setViewMode("technical")}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${viewMode === "technical" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                Technical Architecture
              </button>
            </div>
          </div>

          {/* Content based on mode */}
          {viewMode === "non-technical" ? <NonTechnicalGuide /> : <TechnicalArchitecture />}
        </div>
      </section>

      {/* ── Animated Pipeline (always visible) ── */}
      <section className="py-16 bg-gradient-to-br from-slate-50 to-blue-50 border-y border-blue-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h3 className="text-xl font-bold text-gray-900">The 6-Agent AI Pipeline</h3>
            <p className="text-gray-500 text-sm mt-1">Each agent specializes in one task, passing context to the next</p>
          </div>
          <AnimatedPipeline />
          <div className="flex items-center justify-center mt-6">
            <div className="border-2 border-dashed border-blue-200 rounded-full px-6 py-2 text-sm text-blue-500 font-medium flex items-center gap-2">
              <span>🔄</span>
              <span>Every interaction trains the AI — it gets smarter about your style over time</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Best Practices / Efficient Usage ── */}
      <section id="best-practices" className="py-20 md:py-28 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className="text-sm font-semibold text-emerald-600 uppercase tracking-wider">Get Maximum Value</span>
            <h2 className="mt-2 text-3xl md:text-4xl font-extrabold text-gray-900">How to Use PostMind AI Most Efficiently</h2>
            <p className="mt-4 text-gray-500 max-w-2xl mx-auto">
              Follow these best practices to get dramatically better content suggestions. The difference between a 40% confidence score and a 90% confidence score is huge.
            </p>
          </div>

          <UsageGuide />
        </div>
      </section>

      {/* ── Platform Support ── */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <span className="text-sm font-semibold text-blue-600 uppercase tracking-wider">Multi-platform</span>
            <h2 className="mt-2 text-3xl md:text-4xl font-extrabold text-gray-900">One voice. Two platforms.</h2>
            <p className="mt-4 text-gray-500 max-w-xl mx-auto">PostMind AI generates tailored content for both LinkedIn and Twitter/X from the same persona.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl border-2 border-[#0A66C2]/20 bg-[#0A66C2]/5 p-7">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#0A66C2] flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </div>
                <h3 className="text-xl font-bold text-[#0A66C2]">LinkedIn</h3>
              </div>
              <ul className="space-y-2.5 text-sm text-gray-700">
                {["Long-form text posts (up to 3,000 chars)", "Carousels with structured talking points", "Poll-style posts for engagement", "Video scripts optimized for LinkedIn", "Thought-leadership & story-format posts", "SEO hashtags for LinkedIn search"].map((item) => (
                  <li key={item} className="flex items-start gap-2"><span className="text-[#0A66C2] shrink-0 mt-0.5">&#10003;</span>{item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border-2 border-gray-200 bg-gray-50 p-7">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900">Twitter / X</h3>
              </div>
              <ul className="space-y-2.5 text-sm text-gray-700">
                {["Single tweets (max 280 chars)", "Multi-tweet threads (up to 25 tweets)", "Quote-tweet commentary angles", "Image-tweet captions & concepts", "Punchy hooks optimized for retweets", "Minimal hashtags — X algorithm friendly"].map((item) => (
                  <li key={item} className="flex items-start gap-2"><span className="text-gray-800 shrink-0 mt-0.5">&#10003;</span>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20 md:py-28 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className="text-sm font-semibold text-orange-500 uppercase tracking-wider">Everything you need</span>
            <h2 className="mt-2 text-3xl md:text-4xl font-extrabold text-gray-900">Built for serious content creators</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FeatureCard
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A17.888 17.888 0 0112 2.5c1.437 0 2.838.164 4.136.474M7.864 4.243a17.888 17.888 0 00-4.764 3.8M7.864 4.243L6 2m13.036 2.243a17.888 17.888 0 014.764 3.8M19.136 4.243L21 2m-1.2 6.043a17.962 17.962 0 011.2 5.957c0 1.084-.095 2.145-.279 3.174M2.279 17.174A17.962 17.962 0 012 12c0-2.12.367-4.157 1.04-6.043m0 0L1 4m2.04 2.043L5 8m14.136-.043L21 10m-2.279 7.174l1.279 2.826m-1.279-2.826A17.888 17.888 0 0112 21.5a17.888 17.888 0 01-6.721-1.326m0 0L3 23" /></svg>}
              title="Writing DNA Fingerprint"
              description="Analyzes 15+ patterns from your posts: sentence length, opening style, emoji usage, reading level, CTA patterns, and more — all deterministically, no AI needed."
              badge="Phase 4"
            />
            <FeatureCard
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>}
              title="Domain-aware trend intelligence"
              description="14 industry categories with 60+ dedicated RSS feeds. Healthcare creators get healthcare trends, not tech news. Finance gets Bloomberg, not TechCrunch."
              badge="Smart Routing"
            />
            <FeatureCard
              icon={<IconSpark className="w-6 h-6" />}
              title="Rich content briefs"
              description="Each idea comes with a hook, talking points, CTA, SEO keywords, format recommendation, scheduling hint, and content series detection."
            />
            <FeatureCard
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" /></svg>}
              title="Persona Confidence Score"
              description="A 0-100% score showing how well the AI understands you. Below 40%: broader suggestions. Above 70%: highly specific, niche-targeted ideas."
              badge="Phase 4"
            />
            <FeatureCard
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>}
              title="Adaptive feedback learning"
              description="Every rating, copy, click, and published post feeds back into your profile. Implicit signals captured automatically. 14-day recency decay keeps preferences fresh."
              badge="Learns"
            />
            <FeatureCard
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              title="Scheduling hints & series detection"
              description="Industry-specific best posting times. Auto-detects recurring themes in your content and suggests follow-up posts to build a content series."
              badge="Phase 4"
            />
            <FeatureCard
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>}
              title="AI co-writing editor"
              description="Turn any suggestion into a full post with the AI editor. Uses your Writing DNA for voice consistency. Built-in AI detector + humanizer."
              badge="Agent 6"
            />
            <FeatureCard
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>}
              title="Performance tracking & A/B testing"
              description="Report post engagement to close the loop. A/B testing compares heuristic vs LLM paths. Admin dashboard with full analytics."
              badge="Phase 4"
            />
          </div>
        </div>
      </section>

      {/* ── What's included ── */}
      <section className="py-20 md:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-[#6366f1] to-violet-600 rounded-3xl p-8 md:p-14 text-white">
            <div className="md:flex items-start gap-12">
              <div className="flex-1 mb-10 md:mb-0">
                <h2 className="text-2xl md:text-3xl font-extrabold mb-4 leading-tight">Everything included in the free plan</h2>
                <p className="text-blue-100 mb-8 leading-relaxed">No paywalls for the core features. Start generating personalized content today.</p>
                <Link href="/register" className="inline-flex items-center gap-2 bg-white text-[#6366f1] hover:bg-blue-50 px-7 py-3 rounded-xl font-semibold transition-colors shadow-lg">
                  Create your free account
                  <IconArrow className="w-4 h-4" />
                </Link>
              </div>
              <ul className="flex-1 space-y-3">
                {[
                  "6-agent AI pipeline fully included",
                  "400,000 free tokens per account",
                  "LinkedIn & Twitter/X multi-platform support",
                  "14 industry domains with 60+ trend sources",
                  "Writing DNA fingerprint analysis",
                  "Persona confidence scoring",
                  "Full AI co-writing editor with humanizer",
                  "Content series detection & scheduling hints",
                  "Implicit signal tracking & feedback learning",
                  "Performance tracking for published posts",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                      <IconCheck className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-blue-50">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-gray-50 py-20 md:py-28 text-center">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">Ready to post with confidence?</h2>
          <p className="text-gray-500 text-lg mb-10">Stop staring at a blank screen. Start posting ideas that resonate — in your own authentic voice.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="inline-flex items-center justify-center gap-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white px-8 py-3.5 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all">
              Get started — it&apos;s free
              <IconArrow className="w-4 h-4" />
            </Link>
            <Link href="/login" className="inline-flex items-center justify-center gap-2 bg-white border border-gray-200 hover:border-blue-300 text-gray-700 hover:text-blue-700 px-8 py-3.5 rounded-xl font-semibold transition-all">
              I already have an account
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center">
              <IconSpark className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-700">PostMind AI</span>
          </div>
          <p className="text-xs text-gray-400">Built with Mastra AI · Gemini 2.5 Flash · Next.js 14 · Express · MongoDB</p>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <Link href="/login" className="hover:text-gray-700 transition-colors">Log in</Link>
            <Link href="/register" className="hover:text-gray-700 transition-colors">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

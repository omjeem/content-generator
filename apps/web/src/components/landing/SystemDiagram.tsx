"use client";

import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

interface DiagramNode {
  id: string;
  label: string;
  icon: string;
  color: string; // tailwind gradient classes
  detail: string; // shown on hover
  x: number;
  y: number; // viewBox coords (0-1000 x, 0-1300 y)
  w: number;
  h: number;
  accent?: string; // border color for central nodes
}

// ── Node Data ──────────────────────────────────────────────────────────────

const NODES: DiagramNode[] = [
  // Row 0 — Input
  {
    id: "posts",
    label: "Your Posts",
    icon: "📝",
    color: "from-blue-500 to-blue-600",
    detail:
      "Paste 5-10 of your best LinkedIn/Twitter posts. This teaches the AI your voice, tone, sentence patterns, emoji habits, and vocabulary. Longer posts (200+ words) give 10x more signal.",
    x: 400,
    y: 20,
    w: 200,
    h: 64,
  },

  // Row 1 — Analysis
  {
    id: "persona-analyst",
    label: "Persona Analyst",
    icon: "🔬",
    color: "from-violet-500 to-violet-600",
    detail:
      "Agent 1 analyzes your posts and extracts: writing style, tone, recurring topics, post formats, estimated frequency, and engagement patterns. Creates your base UserPersona in the database.",
    x: 280,
    y: 130,
    w: 200,
    h: 64,
  },
  {
    id: "writing-dna",
    label: "Writing DNA",
    icon: "🧬",
    color: "from-pink-500 to-rose-500",
    detail:
      "Deterministic fingerprint (no LLM needed): average sentence length, vocabulary richness, emoji frequency, question ratio, opening style, CTA patterns, reading grade level — 15+ metrics extracted from your posts.",
    x: 520,
    y: 130,
    w: 200,
    h: 64,
  },

  // Row 2 — Onboarding
  {
    id: "onboarding",
    label: "Onboarding Interview",
    icon: "🤝",
    color: "from-purple-500 to-purple-600",
    detail:
      "Agent 2 conducts a 5-7 question chat interview: your goals, target audience, industry, content pillars, posting frequency, and platform strategy. Answers merge into your persona.",
    x: 400,
    y: 240,
    w: 200,
    h: 64,
  },

  // Row 3 — Central Hub
  {
    id: "persona",
    label: "User Persona",
    icon: "🧠",
    color: "from-indigo-600 to-blue-700",
    detail:
      "The central hub — stores everything: your voice profile, Writing DNA, interview answers, feedback preferences (topics you love/avoid), format preferences, confidence score (0-100), and peer insights. Every other component reads from or writes to this.",
    x: 350,
    y: 360,
    w: 300,
    h: 80,
    accent: "ring-2 ring-indigo-400 ring-offset-2",
  },
  {
    id: "persona-chat",
    label: "Persona Chat",
    icon: "💬",
    color: "from-teal-500 to-cyan-600",
    detail:
      "Agent 5: A live AI chat where you can edit your persona. Say 'Make my tone more casual' — the AI proposes specific changes to your profile. You review and apply them.",
    x: 720,
    y: 370,
    w: 180,
    h: 64,
  },
  {
    id: "confidence",
    label: "Confidence Score",
    icon: "📊",
    color: "from-amber-500 to-orange-500",
    detail:
      "5-dimension score (0-100): Post Volume (25pts), Interview (20pts), Feedback (25pts), Performance Data (15pts), Recency (15pts). Below 40%: broader suggestions. Above 70%: highly targeted.",
    x: 70,
    y: 370,
    w: 180,
    h: 64,
  },

  // Row 4 — Generation Sources
  {
    id: "trends",
    label: "Trend Sources",
    icon: "📡",
    color: "from-emerald-500 to-green-600",
    detail:
      "Multi-tier domain-aware fetching: Tavily web search (Tier 1) → HN Algolia for tech (Tier 2a) → 60+ Domain RSS feeds across 14 industry categories (Tier 2b) → Google News fallback (Tier 2.5). Two-tier cache: 5-min in-memory + 30-min MongoDB.",
    x: 60,
    y: 520,
    w: 180,
    h: 64,
  },
  {
    id: "gen-modes",
    label: "Generation Modes",
    icon: "🎛️",
    color: "from-sky-500 to-blue-600",
    detail:
      "5 ways to generate: Quick Generate (one-click), Topic Focus (you pick topic), Browse Trends (pick specific trends), AI Topic Suggestions (AI suggests what to write), Chat to Refine (full control via conversation).",
    x: 350,
    y: 520,
    w: 300,
    h: 80,
  },

  // Row 5 — Content Engine
  {
    id: "content-gen",
    label: "Content Generator",
    icon: "✨",
    color: "from-orange-500 to-rose-500",
    detail:
      "Agent 4 combines: your persona + Writing DNA + confidence directive + trends + feedback signals + scheduling hints + content series data + audience insights + peer awareness → produces 5-7 rich content briefs with hooks, talking points, CTAs, SEO keywords.",
    x: 325,
    y: 660,
    w: 350,
    h: 72,
  },

  // Row 6 — Output
  {
    id: "suggestions",
    label: "Suggestion Cards",
    icon: "🎯",
    color: "from-indigo-500 to-violet-600",
    detail:
      "Each card includes: a compelling hook, 3-5 talking points, a CTA, format recommendation (text/carousel/poll/thread), SEO keywords, scheduling hint (best time to post), content series tag, and an A/B test variant.",
    x: 350,
    y: 790,
    w: 300,
    h: 64,
  },

  // Row 7 — Feedback + Editor
  {
    id: "feedback",
    label: "Feedback & Rating",
    icon: "⭐",
    color: "from-yellow-500 to-amber-600",
    detail:
      "Rate each suggestion: loved/good/meh/bad + action: save/draft/dismiss/publish. Implicit signals auto-captured: copying hooks, expanding cards, time spent reading. Signal strength × action multiplier × recency decay → learns your preferences.",
    x: 70,
    y: 920,
    w: 200,
    h: 64,
  },
  {
    id: "editor",
    label: "Post Editor",
    icon: "✏️",
    color: "from-blue-600 to-indigo-700",
    detail:
      "Agent 6: AI co-writing partner that uses your Writing DNA to maintain your voice. Built-in AI Detection (7-signal analysis) scores how 'AI-like' your text sounds. Humanizer rewrites at light/moderate/aggressive intensity.",
    x: 700,
    y: 920,
    w: 200,
    h: 64,
  },

  // Row 8 — Learning
  {
    id: "learning",
    label: "Persona Learning",
    icon: "🔄",
    color: "from-emerald-600 to-teal-600",
    detail:
      "Aggregates all feedback (last 90 days) with recency decay (14-day half-life). Computes: preferred topics, avoid topics, format preferences, tone preference. First 3 feedbacks trigger instant learning. After that, every 3rd feedback triggers a cycle.",
    x: 70,
    y: 1060,
    w: 200,
    h: 64,
  },
  {
    id: "performance",
    label: "Performance Tracker",
    icon: "📈",
    color: "from-rose-500 to-pink-600",
    detail:
      "After publishing, report engagement (likes, comments, reposts). This is the strongest signal — 3x weight. The AI learns what your audience actually engages with, not just what you think they'll like.",
    x: 700,
    y: 1060,
    w: 200,
    h: 64,
  },
];

// ── Arrow Paths ────────────────────────────────────────────────────────────
// Each path is an SVG path string connecting two nodes

interface Arrow {
  d: string;
  animated?: boolean;
  label?: string;
  labelX?: number;
  labelY?: number;
}

const ARROWS: Arrow[] = [
  // Posts → Persona Analyst
  { d: "M500,84 L500,100 L380,100 L380,130", animated: true },
  // Posts → Writing DNA
  { d: "M500,84 L500,100 L620,100 L620,130", animated: true },
  // Persona Analyst → Onboarding
  { d: "M380,194 L380,210 L500,210 L500,240", animated: true },
  // Writing DNA → Onboarding
  { d: "M620,194 L620,210 L500,210 L500,240", animated: true },
  // Onboarding → User Persona
  { d: "M500,304 L500,360", animated: true },
  // Confidence ← User Persona
  {
    d: "M350,400 L250,400",
    animated: true,
    label: "computes",
    labelX: 295,
    labelY: 392,
  },
  // Persona Chat → User Persona
  {
    d: "M720,402 L650,402",
    animated: true,
    label: "edits",
    labelX: 680,
    labelY: 394,
  },
  // User Persona → Generation Modes
  { d: "M500,440 L500,520", animated: true },
  // Trends → Content Generator (via Generation Modes)
  {
    d: "M150,584 L150,696 L325,696",
    animated: true,
    label: "feeds",
    labelX: 220,
    labelY: 688,
  },
  // Gen Modes → Content Generator
  { d: "M500,600 L500,660", animated: true },
  // Content Generator → Suggestions
  { d: "M500,732 L500,790", animated: true },
  // Suggestions → Feedback
  {
    d: "M350,854 L170,854 L170,920",
    animated: true,
    label: "rate",
    labelX: 250,
    labelY: 846,
  },
  // Suggestions → Editor
  {
    d: "M650,854 L800,854 L800,920",
    animated: true,
    label: "write",
    labelX: 720,
    labelY: 846,
  },
  // Feedback → Learning
  { d: "M170,984 L170,1060", animated: true },
  // Editor → Performance
  {
    d: "M800,984 L800,1060",
    animated: true,
    label: "publish",
    labelX: 815,
    labelY: 1022,
  },
  // Learning → User Persona (loop back — left side)
  {
    d: "M70,1092 L30,1092 L30,400 L350,400",
    animated: true,
    label: "updates persona",
    labelX: 30,
    labelY: 750,
  },
  // Performance → User Persona (loop back — right side)
  {
    d: "M900,1092 L950,1092 L950,400 L650,400",
    animated: true,
    label: "strengthens",
    labelX: 935,
    labelY: 750,
  },
];

// ── Component ──────────────────────────────────────────────────────────────

export function SystemDiagram() {
  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredNode = NODES.find((n) => n.id === hovered);

  return (
    <div className="relative w-full">
      {/* Tooltip overlay */}
      {hoveredNode && (
        <div
          className="fixed z-[100] pointer-events-none"
          style={{
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          <div className="bg-slate-900 text-white rounded-2xl shadow-2xl px-6 py-5 max-w-sm pointer-events-none animate-[fadeIn_0.15s_ease-out]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{hoveredNode.icon}</span>
              <h4 className="font-bold text-base">{hoveredNode.label}</h4>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              {hoveredNode.detail}
            </p>
          </div>
        </div>
      )}

      {/* Diagram container — horizontal scroll on mobile */}
      <div className="w-full overflow-x-auto pb-4">
        <div className="min-w-[700px] md:min-w-0">
          <svg
            viewBox="0 0 1000 1180"
            className="w-full h-auto"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Defs: arrow marker + animation */}
            <defs>
              <marker
                id="arrowhead"
                markerWidth="8"
                markerHeight="6"
                refX="8"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L8,3 L0,6 Z" fill="#94a3b8" />
              </marker>
              <marker
                id="arrowhead-active"
                markerWidth="8"
                markerHeight="6"
                refX="8"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L8,3 L0,6 Z" fill="#818cf8" />
              </marker>
              <linearGradient
                id="flow-gradient"
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#818cf8" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#818cf8" stopOpacity="0.15" />
              </linearGradient>
            </defs>

            {/* Background subtle grid */}
            <pattern
              id="grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M40,0 L0,0 L0,40"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="0.5"
                opacity="0.5"
              />
            </pattern>
            <rect width="1000" height="1180" fill="url(#grid)" rx="16" />

            {/* Loop-back paths (drawn first, behind everything) */}
            {ARROWS.map((arrow, i) => (
              <g key={i}>
                {/* Shadow path */}
                <path
                  d={arrow.d}
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                  markerEnd="url(#arrowhead)"
                  opacity="0.5"
                />
                {/* Animated flow overlay */}
                {arrow.animated && (
                  <path
                    d={arrow.d}
                    fill="none"
                    stroke="#818cf8"
                    strokeWidth="2.5"
                    strokeDasharray="8 16"
                    markerEnd="url(#arrowhead-active)"
                    opacity="0.7"
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from="24"
                      to="0"
                      dur={`${1.5 + (i % 3) * 0.3}s`}
                      repeatCount="indefinite"
                    />
                  </path>
                )}
                {/* Arrow label */}
                {arrow.label &&
                  arrow.labelX != null &&
                  arrow.labelY != null && (
                    <text
                      x={arrow.labelX}
                      y={arrow.labelY}
                      fontSize="10"
                      fill="#94a3b8"
                      fontFamily="system-ui, sans-serif"
                      textAnchor="middle"
                    >
                      {arrow.label}
                    </text>
                  )}
              </g>
            ))}

            {/* Nodes as foreignObject */}
            {NODES.map((node) => (
              <foreignObject
                key={node.id}
                x={node.x}
                y={node.y}
                width={node.w}
                height={node.h}
                className="cursor-pointer"
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setHovered(hovered === node.id ? null : node.id)}
              >
                <div
                  className={`
                    w-full h-full rounded-xl bg-gradient-to-br ${node.color}
                    flex items-center gap-2 px-3 text-white shadow-lg
                    transition-all duration-200
                    ${hovered === node.id ? "scale-105 shadow-2xl ring-2 ring-white/60" : "hover:scale-[1.03]"}
                    ${node.accent ?? ""}
                  `}
                >
                  <span className="text-lg shrink-0">{node.icon}</span>
                  <span className="font-semibold text-[11px] md:text-xs leading-tight">
                    {node.label}
                  </span>
                </div>
              </foreignObject>
            ))}

            {/* Central "hub" glow */}
            <ellipse
              cx="500"
              cy="400"
              rx="180"
              ry="55"
              fill="url(#flow-gradient)"
              opacity="0.15"
            >
              <animate
                attributeName="rx"
                values="180;190;180"
                dur="3s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="ry"
                values="55;60;55"
                dur="3s"
                repeatCount="indefinite"
              />
            </ellipse>
          </svg>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 mt-4 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div
            className="w-6 h-0.5 bg-indigo-400"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, #818cf8 0, #818cf8 6px, transparent 6px, transparent 12px)",
            }}
          />
          <span>Data flow</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-gradient-to-br from-indigo-600 to-blue-700" />
          <span>Central hub</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm">hover / tap a node</span> for details
        </div>
      </div>

      {/* CSS */}
      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
      `}</style>
    </div>
  );
}

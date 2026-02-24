import Link from "next/link";

// ── Icon helpers (inline SVGs — no extra dep needed) ──────────────────────────

// Generic "people network / professional" icon — original, no trademark issues
function IconNetwork({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  );
}

function IconBrain({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3a9 9 0 110 18A9 9 0 0112 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 10h.01M15 10h.01M9.5 14s.8 1.5 2.5 1.5 2.5-1.5 2.5-1.5" />
    </svg>
  );
}

function IconTrend({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}

function IconSpark({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  );
}

function IconRefresh({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
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

function IconArrow({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

// ── Step card for "How it works" ───────────────────────────────────────────────

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
      {/* connector line */}
      {!isLast && (
        <div className="hidden lg:block absolute top-10 left-[calc(50%+3rem)] w-[calc(100%-6rem)] h-[2px] bg-gradient-to-r from-blue-200 to-blue-100 z-0" />
      )}
      <div
        className={`relative z-10 w-20 h-20 rounded-2xl flex items-center justify-center text-white shadow-lg mb-4 ${color}`}
      >
        {icon}
        <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border-2 border-gray-200 text-xs font-bold text-gray-700 flex items-center justify-center shadow">
          {number}
        </span>
      </div>
      <h3 className="font-bold text-gray-900 text-lg mb-2">{title}</h3>
      <p className="text-gray-500 text-sm leading-relaxed max-w-[200px]">{description}</p>
    </div>
  );
}

// ── Feature card ───────────────────────────────────────────────────────────────

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
}

function FeatureCard({ icon, title, description, badge }: FeatureCardProps) {
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
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                {badge}
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

// ── Architecture diagram (visual pipeline) ─────────────────────────────────────

function ArchDiagram() {
  const nodes = [
    {
      emoji: "📋",
      label: "Your Posts",
      sub: "5–6 pasted posts",
      bg: "from-blue-500 to-blue-600",
    },
    {
      emoji: "🧠",
      label: "Persona AI",
      sub: "Learns your voice",
      bg: "from-violet-500 to-violet-600",
    },
    {
      emoji: "📈",
      label: "Trend Scout",
      sub: "Fetches what's hot",
      bg: "from-emerald-500 to-emerald-600",
    },
    {
      emoji: "✨",
      label: "Content Engine",
      sub: "Crafts your ideas",
      bg: "from-orange-500 to-rose-500",
    },
    {
      emoji: "🎯",
      label: "Your Feed",
      sub: "Ready to post",
      bg: "from-indigo-500 to-indigo-700",
    },
  ];

  return (
    <div className="w-full overflow-x-auto pb-4">
      <div className="flex items-center justify-center gap-0 min-w-[640px]">
        {nodes.map((node, i) => (
          <div key={node.label} className="flex items-center">
            {/* node */}
            <div className="flex flex-col items-center gap-2">
              <div
                className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${node.bg} flex items-center justify-center shadow-lg text-3xl`}
              >
                {node.emoji}
              </div>
              <span className="font-semibold text-gray-800 text-sm text-center">
                {node.label}
              </span>
              <span className="text-xs text-gray-400 text-center">{node.sub}</span>
            </div>
            {/* arrow between nodes */}
            {i < nodes.length - 1 && (
              <div className="flex flex-col items-center px-2 mt-[-18px]">
                <div className="w-8 h-[2px] bg-gradient-to-r from-gray-300 to-gray-400" />
                <svg
                  className="w-3 h-3 text-gray-400 -ml-1"
                  fill="currentColor"
                  viewBox="0 0 6 10"
                >
                  <path d="M0 0l6 5-6 5V0z" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* feedback loop arrow */}
      <div className="relative mt-6 mx-auto" style={{ maxWidth: 640 }}>
        <div className="flex items-center justify-center">
          <div className="border-2 border-dashed border-blue-200 rounded-full px-6 py-2 text-sm text-blue-500 font-medium flex items-center gap-2">
            <span>🔄</span>
            <span>
              You train it over time → it gets smarter about your style
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Stat pill ──────────────────────────────────────────────────────────────────

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl md:text-4xl font-extrabold text-white">{value}</div>
      <div className="text-blue-200 text-sm mt-1">{label}</div>
    </div>
  );
}

// ── Main landing page ──────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
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
            <a href="#how-it-works" className="hover:text-[#6366f1] transition-colors">
              How it works
            </a>
            <a href="#features" className="hover:text-[#6366f1] transition-colors">
              Features
            </a>
            <a href="#architecture" className="hover:text-[#6366f1] transition-colors">
              The AI Pipeline
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="text-sm bg-[#6366f1] hover:bg-[#4f46e5] text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
            >
              Get started free
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        {/* background gradient blob */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 overflow-hidden"
        >
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-blue-100 via-blue-50 to-transparent opacity-70" />
          <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-violet-100 via-transparent to-transparent opacity-50" />
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 md:pt-28 md:pb-32 text-center">
          {/* badge */}
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-4 py-1.5 text-sm text-blue-700 font-medium mb-6">
            <IconSpark className="w-4 h-4" />
            Powered by Gemini AI + real-time trends
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
            LinkedIn content that
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#6366f1] to-violet-500">
              sounds exactly like you
            </span>
          </h1>

          <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto mb-8 leading-relaxed">
            Paste 5–6 of your existing LinkedIn posts. PostMind AI reads them,
            learns your unique voice and style, then combines it with today's
            trending topics to suggest ideas that feel 100% authentic — not like
            a generic AI wrote them.
          </p>

          {/* "how to start" hint box */}
          <div className="inline-flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5 text-left mb-10 max-w-xl mx-auto">
            <span className="text-xl mt-0.5">💡</span>
            <p className="text-sm text-amber-800 leading-relaxed">
              <span className="font-semibold">Pro tip:</span> Paste at least{" "}
              <span className="font-semibold">5–6 of your own posts</span> so the
              AI has enough to understand your tone, topics, and style. The more
              you share, the more it sounds like you.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white px-8 py-3.5 rounded-xl font-semibold text-base shadow-lg hover:shadow-xl transition-all"
            >
              Paste your posts &amp; start
              <IconArrow className="w-4 h-4" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-700 px-8 py-3.5 rounded-xl font-semibold text-base transition-all"
            >
              See how it works
            </a>
          </div>

          {/* social proof strip */}
          <p className="mt-8 text-sm text-gray-400">
            No credit card required &nbsp;·&nbsp; Free 300K token quota included
          </p>

          {/* mock paste-posts UI card */}
          <div className="mt-14 max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden text-left">
              {/* card header */}
              <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50">
                <div className="w-3 h-3 rounded-full bg-red-300" />
                <div className="w-3 h-3 rounded-full bg-yellow-300" />
                <div className="w-3 h-3 rounded-full bg-green-300" />
                <span className="ml-2 text-xs text-gray-400 font-medium">
                  PostMind AI — Paste your posts
                </span>
              </div>
              {/* fake textarea */}
              <div className="px-5 py-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Your LinkedIn posts
                </p>
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-sm text-gray-400 leading-relaxed min-h-[110px]">
                  <span className="text-gray-700 italic">
                    "Just wrapped up a 6-month project on AI-powered hiring tools.
                    Here's what surprised me the most about working with non-tech
                    stakeholders..."
                  </span>
                  <br />
                  <br />
                  <span className="text-gray-400">
                    Paste 5–6 more posts like this one ↑ so the AI learns your
                    voice...
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                    <span>⚠️</span> Paste at least 5–6 posts for best results
                  </span>
                  <span className="text-xs text-gray-400">1 / 6 posts</span>
                </div>
              </div>
              {/* fake button row */}
              <div className="px-5 pb-4 flex gap-2">
                <div className="flex-1 h-9 rounded-lg bg-[#6366f1] flex items-center justify-center">
                  <span className="text-white text-xs font-semibold">
                    ✨ Analyse my style &amp; generate ideas
                  </span>
                </div>
              </div>
            </div>
            <p className="text-center text-xs text-gray-400 mt-3">
              ↑ This is what the onboarding screen looks like inside the app
            </p>
          </div>
        </div>
      </section>

      {/* ── Stats band ── */}
      <section className="bg-gradient-to-r from-[#6366f1] to-violet-600 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          <Stat value="5 AI" label="Specialist agents" />
          <Stat value="6+" label="Trend sources" />
          <Stat value="300K" label="Free tokens/user" />
          <Stat value="∞" label="Ideas, your voice" />
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-20 md:py-28 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-blue-600 uppercase tracking-wider">
              Simple 4-step process
            </span>
            <h2 className="mt-2 text-3xl md:text-4xl font-extrabold text-gray-900">
              From your posts to a full content plan — in minutes
            </h2>
            <p className="mt-4 text-gray-500 max-w-xl mx-auto">
              No complicated setup. Just paste some of your past posts and the
              AI takes care of everything else.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
            <Step
              number={1}
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                </svg>
              }
              title="Paste your posts"
              description="Copy-paste 5–6 of your LinkedIn posts (or posts you like). That's all the AI needs to get started."
              color="bg-gradient-to-br from-indigo-500 to-indigo-700"
            />
            <Step
              number={2}
              icon={<IconBrain className="w-8 h-8" />}
              title="AI builds your persona"
              description="The Persona AI reads your writing style, topics, tone, and expertise."
              color="bg-gradient-to-br from-violet-500 to-violet-700"
            />
            <Step
              number={3}
              icon={<IconTrend className="w-8 h-8" />}
              title="Trends are fetched live"
              description="The Trend Scout pulls today's hot topics from TechCrunch, HN, VentureBeat & more."
              color="bg-gradient-to-br from-emerald-500 to-emerald-700"
            />
            <Step
              number={4}
              icon={<IconSpark className="w-8 h-8" />}
              title="You get 5 tailored ideas"
              description="The Content Engine merges your voice + trends into ready-to-use post briefs."
              color="bg-gradient-to-br from-orange-400 to-rose-500"
              isLast
            />
          </div>
        </div>
      </section>

      {/* ── Architecture / AI Pipeline visual ── */}
      <section id="architecture" className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className="text-sm font-semibold text-violet-600 uppercase tracking-wider">
              Under the hood
            </span>
            <h2 className="mt-2 text-3xl md:text-4xl font-extrabold text-gray-900">
              Meet the 5-agent AI pipeline
            </h2>
            <p className="mt-4 text-gray-500 max-w-2xl mx-auto">
              You paste your posts — five specialized AI agents do the rest, working
              together like a mini content team, each with a specific job, passing
              context to the next.
            </p>
          </div>

          {/* visual pipeline */}
          <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-3xl border border-blue-100 p-8 md:p-12 mb-12">
            <ArchDiagram />
          </div>

          {/* agent explainers */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                emoji: "🔍",
                title: "Agent 1 — Persona Analyst",
                desc: "Reads the posts you paste and extracts your writing tone, favourite topics, vocabulary, and expertise level. The more posts you share (5–6 minimum), the sharper the picture it builds.",
                badge: "Understands YOU",
                badgeColor: "bg-blue-100 text-blue-700",
              },
              {
                emoji: "🤝",
                title: "Agent 2 — Onboarding Coach",
                desc: "Has a short interview with you to fill in any gaps — asks about your goals, target audience, and what kind of content you want to be known for.",
                badge: "Knows your goals",
                badgeColor: "bg-violet-100 text-violet-700",
              },
              {
                emoji: "📡",
                title: "Agent 3 — Trend Researcher",
                desc: "Scans TechCrunch, HN, VentureBeat, MIT Tech Review, Entrepreneur, and more in real-time to find what people in your niche are already talking about.",
                badge: "Always up-to-date",
                badgeColor: "bg-emerald-100 text-emerald-700",
              },
              {
                emoji: "✍️",
                title: "Agent 4 — Content Generator",
                desc: "Blends your persona + live trends to produce 5 rich post briefs: hook, key points, call-to-action, hashtags — all written in your voice.",
                badge: "Your voice, not AI's",
                badgeColor: "bg-orange-100 text-orange-700",
              },
              {
                emoji: "🎓",
                title: "Agent 5 — Persona Trainer",
                desc: "Chat with it to refine your persona over time. Tell it what worked, what didn't — it updates your style profile so suggestions keep improving.",
                badge: "Gets smarter with you",
                badgeColor: "bg-pink-100 text-pink-700",
              },
              {
                emoji: "🔄",
                title: "The feedback loop",
                desc: "Every generation, every chat, every refinement trains the system on your preferences. The longer you use it, the more it sounds like the best version of you.",
                badge: "Continuous learning",
                badgeColor: "bg-slate-100 text-slate-700",
              },
            ].map((a) => (
              <div
                key={a.title}
                className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="text-2xl mb-3">{a.emoji}</div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-gray-900 text-sm">{a.title}</h3>
                </div>
                <span
                  className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mb-3 ${a.badgeColor}`}
                >
                  {a.badge}
                </span>
                <p className="text-gray-500 text-sm leading-relaxed">{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20 md:py-28 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className="text-sm font-semibold text-orange-500 uppercase tracking-wider">
              Everything you need
            </span>
            <h2 className="mt-2 text-3xl md:text-4xl font-extrabold text-gray-900">
              Built for serious LinkedIn creators
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FeatureCard
              icon={<IconBrain className="w-6 h-6" />}
              title="Persona that actually sounds like you"
              description="Not a generic AI voice. The system learns your sentence length, vocabulary, humour level, and topic preferences from your real posts."
              badge="Core AI"
            />
            <FeatureCard
              icon={<IconTrend className="w-6 h-6" />}
              title="Real-time trend integration"
              description="Pulls live data from 6+ tech/business news sources so your content is always relevant to what your audience is reading right now."
            />
            <FeatureCard
              icon={<IconSpark className="w-6 h-6" />}
              title="Rich content briefs, not just titles"
              description="Each idea comes with a hook, talking points, a CTA, suggested hashtags, and a format recommendation (list post, story, opinion, etc.)."
            />
            <FeatureCard
              icon={<IconRefresh className="w-6 h-6" />}
              title="3 generation modes"
              description="Generate from your existing persona, paste fresh posts anytime to re-train the AI, or add a topic focus / target audience for precision-targeted ideas."
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                </svg>
              }
              title="Train your AI with a chat"
              description="Don't like a suggestion? Chat with the Persona Trainer to tell it what to improve. It updates your profile on the spot."
              badge="Agent 5"
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              }
              title="Full token usage dashboard"
              description="See exactly how many tokens you've used, request a limit increase with one click, and track your request history."
            />
          </div>
        </div>
      </section>

      {/* ── "What you get" checklist ── */}
      <section className="py-20 md:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-[#6366f1] to-violet-600 rounded-3xl p-8 md:p-14 text-white">
            <div className="md:flex items-start gap-12">
              <div className="flex-1 mb-10 md:mb-0">
                <h2 className="text-2xl md:text-3xl font-extrabold mb-4 leading-tight">
                  Everything included in the free plan
                </h2>
                <p className="text-blue-100 mb-8 leading-relaxed">
                  No paywalls for the core features. Start generating personalized
                  LinkedIn content today.
                </p>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 bg-white text-[#6366f1] hover:bg-blue-50 px-7 py-3 rounded-xl font-semibold transition-colors shadow-lg"
                >
                  Create your free account
                  <IconArrow className="w-4 h-4" />
                </Link>
              </div>

              <ul className="flex-1 space-y-3">
                {[
                  "5-agent AI pipeline fully included",
                  "300,000 free tokens per account",
                  "Real-time trend data from 6+ sources",
                  "Unlimited content generation sessions",
                  "Full persona editor + AI training chat",
                  "Rich content briefs with hooks & CTAs",
                  "Token usage dashboard + increase requests",
                  "Suggestion history — never lose an idea",
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
          <div className="text-4xl mb-4">🚀</div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            Ready to post with confidence?
          </h2>
          <p className="text-gray-500 text-lg mb-10">
            Join creators who stopped staring at a blank screen and started
            posting ideas that resonate — in their own authentic voice.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white px-8 py-3.5 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              Get started — it's free
              <IconArrow className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 bg-white border border-gray-200 hover:border-blue-300 text-gray-700 hover:text-blue-700 px-8 py-3.5 rounded-xl font-semibold transition-all"
            >
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
          <p className="text-xs text-gray-400">
            Built with Mastra AI · Gemini · Next.js · Express · MongoDB
          </p>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <Link href="/login" className="hover:text-gray-700 transition-colors">
              Log in
            </Link>
            <Link href="/register" className="hover:text-gray-700 transition-colors">
              Register
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

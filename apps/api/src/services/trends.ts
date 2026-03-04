/**
 * Trend Research Service
 *
 * Fetches REAL trending content from live APIs — no LLM hallucination.
 * Multi-tier strategy (highest quality first):
 *
 *  Tier 1 — Tavily (when TAVILY_API_KEY is set)
 *    └─ AI-optimised web search; niche-targeted; recency-filtered
 *
 *  Tier 2 — Hacker News Algolia + RSS Feeds (always-on, zero API keys)
 *    ├─ HN Algolia: real trending stories (skipped for non-tech-adjacent domains)
 *    └─ RSS Feeds: domain-specific curated publications per DomainCategory
 *
 *  Tier 2.5 — Google News RSS (free, no key, fallback when HN+RSS yield < 5)
 *
 *  Tier 3 — Evergreen fallback (no network call)
 *    └─ Returns content-pillar-based fallback topics if all APIs fail
 *
 * The raw article titles fetched here are passed to the trendResearch agent
 * which filters them for relevance and adds LinkedIn content angles.
 *
 * Phase 3 Audit:
 *  #1  — Removed duplicate internal cache (canonical cache lives in trendCache.ts)
 *  #3  — HN Algolia queries now filter by created_at_i > 48h ago
 *  #4  — RSS feeds shuffled within equal-score tiers for variety
 *  #7  — HN_QUERY_MAP expanded to 30+ industries
 *  #8  — Lower HN points threshold (2) for raw/niche keyword queries
 *  #9  — RSS backup feed retry when all primary feeds fail
 *  #10 — Hyphen-normalized keyword matching in isRelevant()
 *  #11 — Google News RSS as Tier 2.5 fallback
 *
 * Domain-aware update:
 *  #DA1 — classifyDomain() maps industry+topics → DomainCategory (exported)
 *  #DA2 — DOMAIN_RSS_FEEDS replaces flat RSS_FEEDS array; each domain has its
 *          own curated publication pool (4-6 feeds per category)
 *  #DA3 — fetchFromHackerNews() skips HN entirely for non-tech-adjacent domains
 *          (healthcare, legal, wellness, food, etc.) — HN is a tech community
 *  #DA4 — Broad HN fallback now uses domain-aware query instead of the
 *          hardcoded "technology business innovation 2026" string
 */

import Parser from "rss-parser";
import { tavily } from "@tavily/core";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RawTrendItem {
  title: string;
  url?: string;
  source: string; // "hackernews" | "rss:TechCrunch" | "tavily" | "google-news" | etc.
  score?: number; // HN points or Tavily relevance score
  publishedAt?: string;
}

// ── Domain Classification (#DA1) ──────────────────────────────────────────────

/**
 * Broad domain categories used to select appropriate RSS feed pools and
 * decide whether Hacker News is a relevant source for this creator.
 */
export type DomainCategory =
  | "tech"
  | "business"
  | "healthcare"
  | "wellness"
  | "finance"
  | "legal"
  | "education"
  | "creative"
  | "food"
  | "sustainability"
  | "hr"
  | "real-estate"
  | "manufacturing"
  | "general";

/**
 * Classifies the user's domain from their industry + topic keywords.
 * Returns a DomainCategory used to:
 *  - Select the right RSS feed pool (DOMAIN_RSS_FEEDS)
 *  - Decide whether to query Hacker News (TECH_ADJACENT_DOMAINS)
 *  - Choose a domain-appropriate HN broad-fallback query
 */
export function classifyDomain(
  industry: string,
  topics: string[],
): DomainCategory {
  const text = [industry, ...topics].join(" ").toLowerCase();

  // Tech — check before generic "ai" since many industries are adopting AI too
  if (
    /\b(software|saas|devops|cloud|cybersecurity|blockchain|frontend|backend|mobile app|ios|android|machine learning|deep learning|neural network|llm|programming|coding|developer|engineering|api|microservice|kubernetes|docker|web development|data science|mlops)\b/.test(
      text,
    )
  )
    return "tech";
  // Standalone "ai" or "tech" without a health/edu/legal/green/wellness qualifier
  if (
    /\b(ai|tech)\b/.test(text) &&
    !/\b(health|medical|edu|legal|clean|green|food|restaurant)\b/.test(text)
  )
    return "tech";

  // Healthcare
  if (
    /\b(healthcare|medical|medtech|biotech|pharma|clinical|hospital|nursing|doctor|telemedicine|digital health|patient|dentist|veterinar|health system|pharma)\b/.test(
      text,
    )
  )
    return "healthcare";

  // Wellness — check before healthcare to catch yoga/fitness/coaching niches
  if (
    /\b(fitness|yoga|wellness|mental health|meditation|nutrition|personal training|mindfulness|therapy|coaching|life coach|holistic|pilates|breathwork|nutritionist|health coach)\b/.test(
      text,
    )
  )
    return "wellness";

  // Finance
  if (
    /\b(finance|fintech|banking|accounting|investment|trading|mortgage|wealth management|insurance|financial planning|asset management|cfo|audit|tax advisor|financial advisor)\b/.test(
      text,
    )
  )
    return "finance";

  // Legal
  if (
    /\b(legal|law firm|attorney|lawyer|compliance|legaltech|litigation|contract|paralegal|regulation|notary|intellectual property|solicitor|barrister)\b/.test(
      text,
    )
  )
    return "legal";

  // Education
  if (
    /\b(education|edtech|teaching|e-learning|elearning|curriculum|school|university|professor|learning management|instructional design|tutor|educator|teacher|academic)\b/.test(
      text,
    )
  )
    return "education";

  // Creative & Media
  if (
    /\b(design|ux|ui|graphic|photography|film|video production|content creator|media|journalism|publishing|art|animation|creative director|branding|copywriting|podcasting|videography)\b/.test(
      text,
    )
  )
    return "creative";

  // Food & Hospitality
  if (
    /\b(food|restaurant|culinary|chef|foodtech|beverage|hospitality|catering|dining|nutrition|cooking|bakery|food service|agriculture|food industry)\b/.test(
      text,
    )
  )
    return "food";

  // Sustainability & Climate
  if (
    /\b(sustainability|climate|cleantech|esg|environmental|green energy|renewable|carbon|net.?zero|impact investing|circular economy|decarbonization)\b/.test(
      text,
    )
  )
    return "sustainability";

  // HR & People Ops
  if (
    /\b(hr|human resources|talent|recruitment|hiring|people ops|workforce|dei|diversity|employee engagement|people management|talent acquisition|hr tech)\b/.test(
      text,
    )
  )
    return "hr";

  // Real Estate & Property
  if (
    /\b(real estate|proptech|property|construction|architecture|housing|mortgage broker|landlord|reit|commercial real estate|property management)\b/.test(
      text,
    )
  )
    return "real-estate";

  // Manufacturing & Industrial
  if (
    /\b(manufacturing|industrial|logistics|supply chain|warehouse|robotics|automation|industry 4|factory|procurement|operations management|lean manufacturing)\b/.test(
      text,
    )
  )
    return "manufacturing";

  // Business (catch-all for business/marketing/sales niches)
  if (
    /\b(marketing|sales|b2b|startup|entrepreneurship|consulting|strategy|leadership|management|retail|ecommerce|growth|brand|advertising)\b/.test(
      text,
    )
  )
    return "business";

  return "general";
}

// ── Domain-specific RSS feed pools (#DA2) ──────────────────────────────────────
// Each DomainCategory maps to 4-6 curated RSS feeds from domain-relevant
// publications. All are free, no API key required.
// Feed failures are handled gracefully by Promise.allSettled in fetchFeedsWithParser.

const DOMAIN_RSS_FEEDS: Record<
  DomainCategory,
  { name: string; url: string; topics: string[] }[]
> = {
  tech: [
    {
      name: "TechCrunch",
      url: "https://techcrunch.com/feed/",
      topics: ["tech", "ai", "startup", "saas", "software", "engineering"],
    },
    {
      name: "VentureBeat",
      url: "https://venturebeat.com/feed/",
      topics: ["ai", "ml", "enterprise", "tech", "startup", "data"],
    },
    {
      name: "MIT Technology Review",
      url: "https://www.technologyreview.com/feed/",
      topics: ["ai", "biotech", "computing", "engineering", "science"],
    },
    {
      name: "Ars Technica",
      url: "https://feeds.arstechnica.com/arstechnica/index",
      topics: ["tech", "software", "computing", "science", "security"],
    },
    {
      name: "The Verge",
      url: "https://www.theverge.com/rss/index.xml",
      topics: ["tech", "gadgets", "software", "ai", "computing"],
    },
    {
      name: "NYT Technology",
      url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
      topics: ["tech", "ai", "software", "computing", "data"],
    },
  ],

  business: [
    {
      name: "Entrepreneur",
      url: "https://www.entrepreneur.com/latest.rss",
      topics: [
        "leadership",
        "management",
        "strategy",
        "business",
        "entrepreneurship",
        "startup",
      ],
    },
    {
      name: "Fast Company",
      url: "https://www.fastcompany.com/latest/rss",
      topics: ["innovation", "design", "business", "leadership", "marketing"],
    },
    {
      name: "Inc. Magazine",
      url: "https://www.inc.com/rss",
      topics: [
        "entrepreneurship",
        "startup",
        "growth",
        "management",
        "marketing",
      ],
    },
    {
      name: "Harvard Business Review",
      url: "https://feeds.hbr.org/harvardbusiness",
      topics: ["leadership", "management", "strategy", "business", "hr"],
    },
    {
      name: "Forbes",
      url: "https://www.forbes.com/most-popular/feed/",
      topics: [
        "business",
        "leadership",
        "entrepreneurship",
        "finance",
        "strategy",
      ],
    },
  ],

  healthcare: [
    {
      name: "STAT News",
      url: "https://www.statnews.com/feed/",
      topics: [
        "healthcare",
        "medical",
        "biotech",
        "pharma",
        "health",
        "clinical",
      ],
    },
    {
      name: "Medical Xpress",
      url: "https://medicalxpress.com/rss-feed/",
      topics: ["medical", "health", "research", "clinical", "biotech"],
    },
    {
      name: "Fierce Healthcare",
      url: "https://www.fiercehealthcare.com/rss/xml",
      topics: [
        "healthcare",
        "hospital",
        "health system",
        "medical",
        "health tech",
      ],
    },
    {
      name: "MedCity News",
      url: "https://medcitynews.com/feed/",
      topics: [
        "healthcare",
        "health tech",
        "biotech",
        "medtech",
        "digital health",
      ],
    },
    {
      name: "Becker's Hospital Review",
      url: "https://www.beckershospitalreview.com/rss/rss.php",
      topics: [
        "hospital",
        "healthcare",
        "health system",
        "clinical",
        "administration",
      ],
    },
  ],

  wellness: [
    {
      name: "Well+Good",
      url: "https://www.wellandgood.com/feed/",
      topics: [
        "wellness",
        "fitness",
        "mental health",
        "nutrition",
        "yoga",
        "mindfulness",
      ],
    },
    {
      name: "MindBodyGreen",
      url: "https://www.mindbodygreen.com/rss.xml",
      topics: [
        "wellness",
        "mindfulness",
        "yoga",
        "nutrition",
        "mental health",
        "fitness",
      ],
    },
    {
      name: "Psychology Today",
      url: "https://www.psychologytoday.com/us/front/feed",
      topics: [
        "mental health",
        "psychology",
        "therapy",
        "wellness",
        "mindfulness",
        "coaching",
      ],
    },
    {
      name: "Shape",
      url: "https://www.shape.com/rss",
      topics: ["fitness", "wellness", "nutrition", "exercise", "yoga"],
    },
    {
      name: "Healthline",
      url: "https://www.healthline.com/rss/health-news",
      topics: ["health", "wellness", "nutrition", "mental health", "fitness"],
    },
  ],

  finance: [
    {
      name: "Investopedia",
      url: "https://www.investopedia.com/feedbuilder/feed/getfeed/?feedName=rss_headline",
      topics: [
        "finance",
        "investment",
        "trading",
        "banking",
        "insurance",
        "fintech",
      ],
    },
    {
      name: "Finance Magnates",
      url: "https://www.financemagnates.com/feed/",
      topics: [
        "fintech",
        "finance",
        "trading",
        "banking",
        "payments",
        "crypto",
      ],
    },
    {
      name: "American Banker",
      url: "https://www.americanbanker.com/feed",
      topics: [
        "banking",
        "fintech",
        "payments",
        "financial services",
        "regulation",
      ],
    },
    {
      name: "CFO Dive",
      url: "https://www.cfodive.com/feeds/news/",
      topics: ["finance", "accounting", "cfo", "management", "strategy"],
    },
    {
      name: "Axios Markets",
      url: "https://api.axios.com/feed/markets",
      topics: ["finance", "markets", "economy", "investing", "business"],
    },
  ],

  legal: [
    {
      name: "Above The Law",
      url: "https://abovethelaw.com/feed/",
      topics: [
        "law",
        "legal",
        "attorney",
        "courts",
        "regulation",
        "legal tech",
      ],
    },
    {
      name: "Legal Dive",
      url: "https://www.legaldive.com/feeds/news/",
      topics: ["legal", "compliance", "law", "regulation", "courts"],
    },
    {
      name: "JD Supra",
      url: "https://www.jdsupra.com/resources/syndication/docsRSSfeed.aspx?ftype=AllContent&count=20",
      topics: [
        "legal",
        "law",
        "compliance",
        "regulation",
        "litigation",
        "contract",
      ],
    },
    {
      name: "Law360",
      url: "https://www.law360.com/rss",
      topics: [
        "law",
        "legal",
        "litigation",
        "courts",
        "attorney",
        "legal tech",
      ],
    },
    {
      name: "Entrepreneur",
      url: "https://www.entrepreneur.com/latest.rss",
      topics: [
        "compliance",
        "regulation",
        "contract",
        "business law",
        "startup law",
      ],
    },
  ],

  education: [
    {
      name: "EdSurge",
      url: "https://www.edsurge.com/news.rss",
      topics: [
        "edtech",
        "education",
        "learning",
        "e-learning",
        "teaching",
      ],
    },
    {
      name: "Education Week",
      url: "https://www.edweek.org/feed.rss",
      topics: ["education", "teaching", "curriculum", "school", "k-12"],
    },
    {
      name: "EdTech Magazine",
      url: "https://edtechmagazine.com/k12/rss.xml",
      topics: ["edtech", "technology", "education", "classroom", "learning"],
    },
    {
      name: "E-Learning Industry",
      url: "https://elearningindustry.com/feed",
      topics: [
        "e-learning",
        "lms",
        "online learning",
        "instructional design",
        "training",
      ],
    },
    {
      name: "Inside Higher Ed",
      url: "https://www.insidehighered.com/rss",
      topics: [
        "higher education",
        "university",
        "academic",
        "research",
        "teaching",
      ],
    },
  ],

  creative: [
    {
      name: "Creative Bloq",
      url: "https://www.creativebloq.com/feeds/rss",
      topics: [
        "design",
        "creative",
        "art",
        "graphic design",
        "photography",
        "ux",
      ],
    },
    {
      name: "Dezeen",
      url: "https://www.dezeen.com/feed/",
      topics: ["design", "architecture", "art", "creative", "innovation"],
    },
    {
      name: "Digiday",
      url: "https://digiday.com/feed/",
      topics: [
        "media",
        "content",
        "marketing",
        "publishing",
        "digital media",
        "creator economy",
      ],
    },
    {
      name: "Communication Arts",
      url: "https://www.commarts.com/feed",
      topics: [
        "design",
        "creative",
        "advertising",
        "branding",
        "art direction",
      ],
    },
    {
      name: "Fast Company Design",
      url: "https://www.fastcompany.com/co-design/rss",
      topics: ["design", "ux", "innovation", "creative", "product design"],
    },
  ],

  food: [
    {
      name: "Food Dive",
      url: "https://www.fooddive.com/feeds/news/",
      topics: [
        "food",
        "food industry",
        "foodtech",
        "restaurant",
        "beverage",
        "nutrition",
      ],
    },
    {
      name: "Eater",
      url: "https://www.eater.com/rss/index.xml",
      topics: [
        "restaurant",
        "food",
        "culinary",
        "chef",
        "dining",
        "hospitality",
      ],
    },
    {
      name: "Nation's Restaurant News",
      url: "https://www.nrn.com/rss.xml",
      topics: [
        "restaurant",
        "food service",
        "hospitality",
        "food industry",
        "culinary",
      ],
    },
    {
      name: "Food Business News",
      url: "https://www.foodbusinessnews.net/rss/topic/news",
      topics: [
        "food",
        "beverage",
        "food industry",
        "restaurant",
        "foodtech",
      ],
    },
    {
      name: "Agri Pulse",
      url: "https://www.agri-pulse.com/feed.rss",
      topics: ["agriculture", "food", "farm", "supply chain", "food policy"],
    },
  ],

  sustainability: [
    {
      name: "GreenBiz",
      url: "https://www.greenbiz.com/rss.xml",
      topics: [
        "sustainability",
        "climate",
        "esg",
        "cleantech",
        "green business",
        "carbon",
      ],
    },
    {
      name: "CleanTechnica",
      url: "https://cleantechnica.com/feed/",
      topics: [
        "cleantech",
        "renewable energy",
        "solar",
        "electric vehicle",
        "climate",
        "sustainability",
      ],
    },
    {
      name: "Environmental Leader",
      url: "https://www.environmentalleader.com/feed/",
      topics: [
        "sustainability",
        "environmental",
        "green",
        "climate",
        "esg",
        "energy",
      ],
    },
    {
      name: "Eco-Business",
      url: "https://www.eco-business.com/rss/",
      topics: [
        "sustainability",
        "esg",
        "green",
        "climate",
        "business",
        "environment",
      ],
    },
    {
      name: "Sustainable Brands",
      url: "https://sustainablebrands.com/rss.xml",
      topics: [
        "sustainability",
        "esg",
        "green",
        "brand",
        "consumer",
        "climate",
      ],
    },
  ],

  hr: [
    {
      name: "HR Dive",
      url: "https://www.hrdive.com/feeds/news/",
      topics: [
        "hr",
        "human resources",
        "talent",
        "recruitment",
        "workforce",
        "employee",
        "dei",
      ],
    },
    {
      name: "Workology",
      url: "https://workology.com/feed/",
      topics: ["hr", "talent", "recruitment", "people", "workforce", "hiring"],
    },
    {
      name: "SHRM",
      url: "https://www.shrm.org/rss/Pages/rss.aspx",
      topics: [
        "hr",
        "human resources",
        "management",
        "talent",
        "workforce",
        "employee relations",
      ],
    },
    {
      name: "People Management",
      url: "https://www.peoplemanagement.co.uk/rss",
      topics: [
        "hr",
        "people",
        "management",
        "talent",
        "workforce",
        "leadership",
      ],
    },
    {
      name: "HR Morning",
      url: "https://www.hrmorning.com/feed/",
      topics: [
        "hr",
        "compliance",
        "benefits",
        "employee relations",
        "talent",
      ],
    },
  ],

  "real-estate": [
    {
      name: "Inman",
      url: "https://www.inman.com/feed/",
      topics: [
        "real estate",
        "housing",
        "mortgage",
        "property",
        "proptech",
        "market",
      ],
    },
    {
      name: "The Real Deal",
      url: "https://therealdeal.com/feed/",
      topics: [
        "real estate",
        "commercial",
        "residential",
        "property",
        "investment",
        "development",
      ],
    },
    {
      name: "HousingWire",
      url: "https://www.housingwire.com/feed/",
      topics: [
        "real estate",
        "mortgage",
        "housing",
        "lending",
        "market",
        "proptech",
      ],
    },
    {
      name: "GlobeSt",
      url: "https://www.globest.com/rss/",
      topics: [
        "commercial real estate",
        "property",
        "investment",
        "development",
        "market",
      ],
    },
    {
      name: "Bisnow",
      url: "https://www.bisnow.com/rss",
      topics: [
        "commercial real estate",
        "development",
        "investment",
        "market",
        "construction",
      ],
    },
  ],

  manufacturing: [
    {
      name: "Industry Week",
      url: "https://www.industryweek.com/rss",
      topics: [
        "manufacturing",
        "industrial",
        "industry 4.0",
        "automation",
        "supply chain",
      ],
    },
    {
      name: "Manufacturing Dive",
      url: "https://www.manufacturingdive.com/feeds/news/",
      topics: [
        "manufacturing",
        "industrial",
        "automation",
        "supply chain",
        "production",
      ],
    },
    {
      name: "Supply Chain Dive",
      url: "https://www.supplychaindive.com/feeds/news/",
      topics: [
        "supply chain",
        "logistics",
        "warehouse",
        "shipping",
        "manufacturing",
      ],
    },
    {
      name: "Automation World",
      url: "https://www.automationworld.com/rss.xml",
      topics: [
        "automation",
        "robotics",
        "manufacturing",
        "industrial",
        "iot",
        "industry 4.0",
      ],
    },
    {
      name: "Thomas Net News",
      url: "https://news.thomasnet.com/rss",
      topics: [
        "manufacturing",
        "industrial",
        "supply chain",
        "procurement",
        "engineering",
      ],
    },
  ],

  general: [
    {
      name: "Entrepreneur",
      url: "https://www.entrepreneur.com/latest.rss",
      topics: [
        "leadership",
        "management",
        "strategy",
        "business",
        "entrepreneurship",
      ],
    },
    {
      name: "Fast Company",
      url: "https://www.fastcompany.com/latest/rss",
      topics: ["innovation", "design", "business", "leadership", "marketing"],
    },
    {
      name: "Inc. Magazine",
      url: "https://www.inc.com/rss",
      topics: [
        "entrepreneurship",
        "startup",
        "growth",
        "management",
        "marketing",
      ],
    },
    {
      name: "TechCrunch",
      url: "https://techcrunch.com/feed/",
      topics: ["tech", "ai", "startup", "saas", "software"],
    },
    {
      name: "BBC News Business",
      url: "https://feeds.bbci.co.uk/news/business/rss.xml",
      topics: ["business", "economy", "finance", "global", "markets"],
    },
  ],
};

// ── Domains where HN provides signal (#DA3) ───────────────────────────────────
// HN (Hacker News) is a tech/startup community. For healthcare, legal, yoga,
// food, etc., keyword searches on HN return 0 results or tech-framed articles.
// We skip HN entirely for non-tech-adjacent domains and rely on RSS + Google News.

const TECH_ADJACENT_DOMAINS = new Set<DomainCategory>([
  "tech",
  "business",
  "finance",
  "general",
]);

// ── Domain-aware HN broad fallback (#DA4) ─────────────────────────────────────
// When a keyword-specific HN search returns 0 results AND the domain is
// tech-adjacent, use a domain-appropriate broad query instead of the old
// hardcoded "technology business innovation 2026".

const DOMAIN_BROAD_HN_FALLBACK: Record<DomainCategory, string> = {
  tech: "technology software AI innovation 2026",
  business: "business entrepreneurship startup strategy growth",
  healthcare: "health tech digital health medical innovation",
  wellness: "wellness fitness mental health biohacking",
  finance: "fintech banking finance investment markets",
  legal: "legaltech law compliance regulation",
  education: "edtech education learning online courses",
  creative: "design media content creator economy",
  food: "foodtech restaurant industry consumer food trends",
  sustainability: "sustainability climate green tech ESG",
  hr: "HR talent remote work workforce future of work",
  "real-estate": "proptech real estate housing market trends",
  manufacturing: "manufacturing automation supply chain industry",
  general: "business innovation leadership trends 2026",
};

// ── HN search terms per broad topic (#7 — expanded to 30+ industries) ────────
// Maps niche keywords → focused HN search queries for best relevance.
// Only used for tech-adjacent domains.

const HN_QUERY_MAP: Record<string, string> = {
  // Tech & Software
  ai: "AI machine learning LLM",
  "artificial intelligence": "AI machine learning LLM",
  "machine learning": "machine learning neural network",
  "deep learning": "deep learning AI neural network",
  saas: "SaaS startup product",
  startup: "startup founder YC",
  engineering: "software engineering developer tools",
  software: "software engineering developer tools",
  devops: "devops CI CD infrastructure",
  cloud: "cloud AWS infrastructure devops",
  security: "security infosec cybersecurity",
  cybersecurity: "cybersecurity security infosec",
  data: "data engineering analytics",
  "data science": "data science analytics machine learning",
  blockchain: "blockchain crypto web3 decentralized",
  crypto: "crypto blockchain bitcoin ethereum",
  web3: "web3 blockchain decentralized",
  mobile: "mobile app iOS Android development",
  frontend: "frontend React JavaScript web development",
  backend: "backend API microservices infrastructure",

  // Business & Finance
  fintech: "fintech payments banking digital finance",
  finance: "fintech banking payments insurance",
  ecommerce: "ecommerce retail B2C online shopping",
  marketing: "marketing growth SEO content",
  "digital marketing": "marketing growth SEO content strategy",
  sales: "sales B2B revenue growth pipeline",
  hr: "hiring remote work people management",
  "human resources": "hiring remote work people management",
  leadership: "leadership management productivity",
  management: "management leadership team productivity",
  consulting: "consulting strategy management advisory",
  "real estate": "proptech real estate housing construction",
  proptech: "proptech real estate housing construction",
  insurance: "insurtech insurance fintech risk",

  // Healthcare & Science
  healthcare: "health tech medical biotech digital health",
  health: "health tech medical biotech digital health",
  biotech: "biotech pharma drug discovery genomics",
  pharma: "pharma biotech drug discovery healthcare",
  medtech: "medtech medical device healthcare technology",
  "mental health": "mental health wellness therapy tech",

  // Education
  education: "edtech learning education online course",
  edtech: "edtech learning education online course",

  // Legal & Government
  legal: "legaltech law compliance regulation",
  legaltech: "legaltech law compliance regulation",
  government: "govtech government public sector digital",

  // Consumer & Retail
  food: "foodtech restaurant supply chain agriculture",
  foodtech: "foodtech restaurant agriculture food delivery",
  fashion: "fashion retail D2C ecommerce brand",
  retail: "retail ecommerce D2C consumer brand",
  travel: "travel hospitality tourism booking",
  gaming: "gaming esports game development",

  // Industrial & Infrastructure
  manufacturing: "manufacturing industry 4.0 automation robotics",
  logistics: "logistics supply chain shipping warehouse",
  energy: "energy cleantech renewable sustainability",
  cleantech: "cleantech renewable energy climate sustainability",
  climate: "climate sustainability cleantech carbon",
  automotive: "automotive EV self-driving mobility",
  construction: "construction proptech building infrastructure",
  agriculture: "agtech agriculture farming sustainability",

  // Creative & Media
  design: "design UX product",
  media: "media publishing content creator journalism",
  creator: "creator economy content monetization",
  "content creation": "content creator economy social media",

  // General
  innovation: "innovation technology disruption startup",
  sustainability: "sustainability ESG climate green tech",
  diversity: "diversity inclusion DEI workplace culture",
  "remote work": "remote work hybrid distributed team",
  productivity: "productivity tools workflow automation",
};

// ── Utility: keyword relevance check (word-boundary aware) (#10) ─────────────
// Uses \b word boundaries so short words like "ai" don't match "tail" or "email".
// Falls back to simple includes() for multi-word phrases (spaces break \b matching).
// Phase 3 #10: Normalizes hyphens to spaces so "machine-learning" matches "machine learning".

function isRelevant(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase().replace(/-/g, " ");
  return keywords.some((kw) => {
    const kwLower = kw.toLowerCase().trim().replace(/-/g, " ");
    if (!kwLower) return false;
    // Multi-word keyword: use simple includes (word boundaries don't help across spaces)
    if (kwLower.includes(" ")) return lower.includes(kwLower);
    // Single word: use word-boundary regex to avoid false partial matches
    try {
      return new RegExp(
        `\\b${kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      ).test(lower);
    } catch {
      return lower.includes(kwLower);
    }
  });
}

// ── Fisher-Yates shuffle ──────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

// ── Source 1: Tavily — premium AI web search ──────────────────────────────────
// Returns real web articles relevant to the user's specific niche.
// Only called when TAVILY_API_KEY is set.

async function fetchFromTavily(
  keywords: string[],
  industry: string,
): Promise<RawTrendItem[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  try {
    const client = tavily({ apiKey });
    const query = `trending topics and news in ${industry}: ${keywords.slice(0, 3).join(", ")} 2026`;

    console.log(`[trends:tavily] Searching: "${query}"`);

    const response = await client.search(query, {
      topic: "news",
      time_range: "week", // only content from the last week
      max_results: 10,
      search_depth: "basic", // 1 credit each
    });

    const items: RawTrendItem[] = (response.results ?? []).map((r) => ({
      title: r.title ?? r.url,
      url: r.url,
      source: "tavily",
      score: r.score,
      publishedAt: r.publishedDate,
    }));

    console.log(`[trends:tavily] ✓ ${items.length} results`);
    return items;
  } catch (err) {
    console.warn("[trends:tavily] Failed:", (err as Error).message);
    return [];
  }
}

// ── Source 2a: Hacker News Algolia — real trending tech stories ───────────────
// Completely free, no API key, ~10,000 req/hour limit.
// Filters by points to ensure quality (only community-validated stories).
// Phase 3 #3: Adds created_at_i > time filter for recency.
// Phase 3 #8: Uses lower points threshold (2) for raw/niche keyword queries.
// Domain-aware #DA3: Skips entirely for non-tech-adjacent domains.
// Domain-aware #DA4: Uses domain-appropriate broad fallback query.

async function fetchFromHackerNews(
  keywords: string[],
  industry: string,
  domain?: DomainCategory,
): Promise<RawTrendItem[]> {
  // #DA3: Skip HN for non-tech-adjacent domains — returns sparse/irrelevant results
  if (domain && !TECH_ADJACENT_DOMAINS.has(domain)) {
    console.log(
      `[trends:hn] Skipping HN for domain="${domain}" (not tech-adjacent) — using RSS+GoogleNews instead`,
    );
    return [];
  }

  try {
    // Build a focused HN query — 3-5 terms max for best relevance.
    const firstMappedExpansion = keywords
      .map((k) => HN_QUERY_MAP[k.toLowerCase()])
      .find(Boolean); // first hit wins
    const fallbackTerms = keywords.slice(0, 3).join(" ") || industry;
    const query = firstMappedExpansion ?? fallbackTerms;

    // #8: Lower threshold for raw keyword queries (no HN_QUERY_MAP match)
    const pointsMin = firstMappedExpansion ? 5 : 2;

    console.log(
      `[trends:hn] Searching HN for: "${query}" (pointsMin=${pointsMin})`,
    );

    // #3: Only fetch stories from the last 48 hours for recency
    const twoDaysAgo = Math.floor(
      (Date.now() - 48 * 60 * 60 * 1000) / 1000,
    );

    // Helper to run a single HN Algolia fetch
    const fetchHN = async (
      endpoint: "search_by_date" | "search",
      ptsMin: number,
      useTimeFilter: boolean,
    ) => {
      const url = new URL(`https://hn.algolia.com/api/v1/${endpoint}`);
      url.searchParams.set("query", query);
      url.searchParams.set("tags", "story");
      // #3: Combine points filter with optional time filter
      const numericFilters = useTimeFilter
        ? `points>${ptsMin},created_at_i>${twoDaysAgo}`
        : `points>${ptsMin}`;
      url.searchParams.set("numericFilters", numericFilters);
      url.searchParams.set("hitsPerPage", "20");

      const res = await fetch(url.toString(), {
        headers: { "User-Agent": "ContentGeneratorApp/1.0" },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as {
        hits: {
          title: string;
          url?: string;
          story_url?: string;
          points: number;
          created_at: string;
        }[];
      };

      return (data.hits ?? [])
        .filter((h) => h.title && h.title.length > 10)
        .map(
          (h): RawTrendItem => ({
            title: h.title,
            url: h.url ?? h.story_url,
            source: "hackernews",
            score: h.points,
            publishedAt: h.created_at,
          }),
        );
    };

    // Attempt 1: recent stories (last 48h) with points filter
    let items = await fetchHN("search_by_date", pointsMin, true);

    // Attempt 2: if still sparse, try without time filter (ranked endpoint)
    if (items.length < 5) {
      console.log(
        `[trends:hn] Only ${items.length} recent stories — trying ranked search (no time filter)`,
      );
      const ranked = await fetchHN("search", pointsMin, false);
      // Merge: prefer recent stories, top up with ranked ones
      const existingUrls = new Set(items.map((i) => i.url));
      const newRanked = ranked.filter((r) => !existingUrls.has(r.url));
      items = [...items, ...newRanked].slice(0, 20);
    }

    // #8 + #DA4: If raw keyword query returned 0, try domain-aware broad fallback
    if (items.length === 0 && !firstMappedExpansion) {
      const broadQuery =
        DOMAIN_BROAD_HN_FALLBACK[domain ?? "general"];
      console.log(
        `[trends:hn] Raw keyword search returned 0 — trying broad fallback: "${broadQuery}"`,
      );
      const broadUrl = new URL(
        "https://hn.algolia.com/api/v1/search_by_date",
      );
      broadUrl.searchParams.set("query", broadQuery);
      broadUrl.searchParams.set("tags", "story");
      broadUrl.searchParams.set("numericFilters", `points>5`);
      broadUrl.searchParams.set("hitsPerPage", "15");

      const res = await fetch(broadUrl.toString(), {
        headers: { "User-Agent": "ContentGeneratorApp/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          hits: {
            title: string;
            url?: string;
            story_url?: string;
            points: number;
            created_at: string;
          }[];
        };
        items = (data.hits ?? [])
          .filter((h) => h.title && h.title.length > 10)
          .slice(0, 15)
          .map(
            (h): RawTrendItem => ({
              title: h.title,
              url: h.url ?? h.story_url,
              source: "hackernews",
              score: h.points,
              publishedAt: h.created_at,
            }),
          );
      }
    }

    console.log(`[trends:hn] ✓ ${items.length} stories`);
    return items;
  } catch (err) {
    console.warn("[trends:hn] Failed:", (err as Error).message);
    return [];
  }
}

// ── Source 2b: RSS Feeds — domain-specific publications ───────────────────────
// Completely free, no keys. Fetches from 2-4 curated feeds from the domain's
// feed pool, then filters items by keyword match.
// Phase 3 #4: Shuffles feeds within same-score tiers for variety.
// Phase 3 #9: Retries with backup feeds when all primary feeds fail.
// Domain-aware #DA2: Uses DOMAIN_RSS_FEEDS[domain] pool instead of a flat list.

async function fetchFromRSSFeeds(
  keywords: string[],
  domain?: DomainCategory,
): Promise<RawTrendItem[]> {
  // #DA2: Select feed pool appropriate to this creator's domain
  const feedPool = DOMAIN_RSS_FEEDS[domain ?? "general"];

  const parser = new Parser({
    timeout: 12000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; ContentGeneratorBot/1.0; +https://github.com/contentgenerator)",
      Accept:
        "application/rss+xml, application/xml, text/xml, application/atom+xml, */*",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  // Score feeds by keyword match
  const scoredFeeds = feedPool
    .map((feed) => ({
      ...feed,
      matchScore: feed.topics.filter((t) => isRelevant(t, keywords)).length,
    }))
    .sort((a, b) => b.matchScore - a.matchScore);

  // #4: Shuffle feeds within same-score tiers for variety
  const shuffledFeeds = shuffleWithinScoreTiers(scoredFeeds);
  const selectedFeeds = shuffledFeeds.slice(0, 3);

  console.log(
    `[trends:rss] domain="${domain ?? "general"}" | Fetching from: ${selectedFeeds.map((f) => f.name).join(", ")}`,
  );

  const { items: allItems, rejectedCount } = await fetchFeedsWithParser(
    parser,
    selectedFeeds,
    keywords,
  );

  // #9: If all primary feeds failed, retry with backup feeds
  if (allItems.length === 0 && rejectedCount > 0) {
    console.warn(
      `[trends:rss] All ${rejectedCount} primary feeds failed — trying backup feeds`,
    );
    const backupFeeds = shuffledFeeds.slice(3, 5);
    if (backupFeeds.length > 0) {
      const { items: backupItems } = await fetchFeedsWithParser(
        parser,
        backupFeeds,
        keywords,
      );
      return backupItems;
    }
  }

  return allItems;
}

// Helper to fetch multiple feeds and collect results + failure count
async function fetchFeedsWithParser(
  parser: Parser,
  feeds: { name: string; url: string; topics: string[] }[],
  keywords: string[],
): Promise<{ items: RawTrendItem[]; rejectedCount: number }> {
  const allItems: RawTrendItem[] = [];
  let rejectedCount = 0;

  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        const rawItems = (parsed.items ?? []).slice(0, 20);

        // First pass: keyword-relevant items
        let items = rawItems
          .filter((item) => {
            const text = `${item.title ?? ""} ${item.contentSnippet ?? ""}`;
            return keywords.length === 0 || isRelevant(text, keywords);
          })
          .map(
            (item): RawTrendItem => ({
              title: item.title ?? "",
              url: item.link,
              source: `rss:${feed.name}`,
              publishedAt: item.isoDate ?? item.pubDate,
            }),
          )
          .filter((item) => item.title.length > 0);

        // Fallback: if keyword filter wiped everything out, include the latest
        // 10 items anyway — the AI agent will judge relevance downstream.
        if (items.length === 0 && rawItems.length > 0) {
          console.log(
            `[trends:rss] No keyword match in ${feed.name} — including latest items as fallback`,
          );
          items = rawItems
            .slice(0, 10)
            .map(
              (item): RawTrendItem => ({
                title: item.title ?? "",
                url: item.link,
                source: `rss:${feed.name}`,
                publishedAt: item.isoDate ?? item.pubDate,
              }),
            )
            .filter((item) => item.title.length > 0);
        }

        allItems.push(...items);
        console.log(`[trends:rss] ✓ ${items.length} items from ${feed.name}`);
      } catch (err) {
        console.warn(
          `[trends:rss] ${feed.name} failed:`,
          (err as Error).message,
        );
        throw err; // re-throw so Promise.allSettled marks it as rejected
      }
    }),
  );

  rejectedCount = results.filter((r) => r.status === "rejected").length;
  return { items: allItems, rejectedCount };
}

// #4: Shuffle feeds within same-score tiers so different equally-scored
// feeds get selected across calls. Preserves tier ordering (higher scores first).
function shuffleWithinScoreTiers<T extends { matchScore: number }>(
  feeds: T[],
): T[] {
  const tiers = new Map<number, T[]>();
  for (const feed of feeds) {
    const tier = tiers.get(feed.matchScore) ?? [];
    tier.push(feed);
    tiers.set(feed.matchScore, tier);
  }

  const result: T[] = [];
  // Sort tier keys descending (highest score first)
  const sortedScores = [...tiers.keys()].sort((a, b) => b - a);
  for (const score of sortedScores) {
    result.push(...shuffleArray(tiers.get(score)!));
  }
  return result;
}

// ── Source 2.5: Google News RSS (#11) ─────────────────────────────────────────
// Free, no API key, rarely fails. Used as fallback when HN+RSS yield < 5 items.

async function fetchFromGoogleNewsRSS(
  keywords: string[],
  industry: string,
): Promise<RawTrendItem[]> {
  try {
    const query = encodeURIComponent(
      `${keywords.slice(0, 3).join(" ")} ${industry}`.trim(),
    );
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

    console.log(`[trends:google-news] Fetching: "${keywords.slice(0, 3).join(", ")}" in ${industry}`);

    const parser = new Parser({
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ContentGeneratorBot/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });

    const parsed = await parser.parseURL(url);
    const items: RawTrendItem[] = (parsed.items ?? [])
      .slice(0, 15)
      .map((item) => ({
        title: item.title ?? "",
        url: item.link,
        source: "google-news",
        publishedAt: item.isoDate ?? item.pubDate,
      }))
      .filter((item) => item.title.length > 10);

    console.log(`[trends:google-news] ✓ ${items.length} results`);
    return items;
  } catch (err) {
    console.warn("[trends:google-news] Failed:", (err as Error).message);
    return [];
  }
}

// ── Main export: fetch real trending content ──────────────────────────────────
/**
 * Fetches real trending content from live sources, personalised to the user's
 * industry and content keywords.
 *
 * Phase 3 #1: Removed internal cache — caching is handled by trendCache.ts.
 * Domain-aware: accepts optional `domain` param to route to correct RSS pools
 * and skip HN for non-tech domains.
 *
 * @param keywords  e.g. ['yoga', 'mindfulness', 'wellness coaching'] from user persona
 * @param industry  e.g. 'wellness', 'healthcare', 'technology', 'finance'
 * @param geo       ISO country code, e.g. 'US' (used as hint, not a hard filter)
 * @param domain    Optional pre-classified domain; auto-classified from industry if omitted
 * @returns Array of raw trending items ready for agent enrichment
 */
export async function fetchRealTrendingContent(
  keywords: string[],
  industry: string,
  geo = "US",
  domain?: DomainCategory,
): Promise<RawTrendItem[]> {
  // #1: No internal cache — trendCache.ts is the single source of truth
  const hasTavily = !!process.env.TAVILY_API_KEY;

  // Auto-classify domain if not provided
  const resolvedDomain = domain ?? classifyDomain(industry, keywords);

  console.log(
    `[trends] Fetching | industry="${industry}" domain="${resolvedDomain}" keywords=[${keywords.join(", ")}] geo=${geo} tavily=${hasTavily}`,
  );

  let results: RawTrendItem[];

  if (hasTavily) {
    // Tier 1: Tavily — best quality, targeted, recency-filtered
    const [tavilyItems, hnItems, rssItems] = await Promise.all([
      fetchFromTavily(keywords, industry),
      fetchFromHackerNews(keywords, industry, resolvedDomain),
      fetchFromRSSFeeds(keywords, resolvedDomain),
    ]);
    // Tavily first (highest relevance), then HN + RSS for breadth
    results = deduplicateAndRank([...tavilyItems, ...hnItems, ...rssItems]);
  } else {
    // Tier 2: HN + RSS — always-on, no keys required
    const [hnItems, rssItems] = await Promise.all([
      fetchFromHackerNews(keywords, industry, resolvedDomain),
      fetchFromRSSFeeds(keywords, resolvedDomain),
    ]);
    results = deduplicateAndRank([...hnItems, ...rssItems]);
  }

  // #11: Tier 2.5 — Google News RSS fallback when combined results are sparse
  if (results.length < 5) {
    console.log(
      `[trends] Only ${results.length} results from primary sources — trying Google News RSS fallback`,
    );
    const googleNewsItems = await fetchFromGoogleNewsRSS(keywords, industry);
    results = deduplicateAndRank([...results, ...googleNewsItems]);
  }

  return results;
}

// ── Kept for backward compatibility with trendResearch.ts ─────────────────────
// These wrappers preserve the existing function signatures used by the agent.

/**
 * @deprecated Use fetchRealTrendingContent instead.
 * Kept for compatibility — internally calls the real API sources.
 */
export async function getTrendingTopics(
  keywords: string[],
  geo = "US",
): Promise<string[]> {
  const industry = keywords[0] ?? "business";
  const items = await fetchRealTrendingContent(keywords, industry, geo);
  return items.map((item) => item.title).slice(0, 15);
}

/**
 * @deprecated Use fetchRealTrendingContent instead.
 * Kept for compatibility — returns general trending items without keyword filter.
 */
export async function getDailyTrends(geo = "US"): Promise<string[]> {
  const items = await fetchRealTrendingContent(
    ["technology", "AI", "business", "leadership"],
    "technology",
    geo,
  );
  return items.map((item) => item.title).slice(0, 15);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Deduplicates items by title similarity and caps total count.
 * Items with higher scores are ranked first.
 */
function deduplicateAndRank(items: RawTrendItem[]): RawTrendItem[] {
  const seen = new Set<string>();
  const unique: RawTrendItem[] = [];

  for (const item of items) {
    // Normalise title for dedup check (lowercase, strip punctuation)
    const key = item.title
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .slice(0, 60);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  // Sort: Tavily (scored) first, then HN (by points), then RSS/Google News
  unique.sort((a, b) => {
    const aScore = a.score ?? 0;
    const bScore = b.score ?? 0;
    if (aScore !== bScore) return bScore - aScore;
    // Prefer Tavily > HN > Google News > RSS
    const sourcePriority = (s: string) =>
      s === "tavily" ? 4 : s === "hackernews" ? 3 : s === "google-news" ? 2 : 1;
    return sourcePriority(b.source) - sourcePriority(a.source);
  });

  return unique.slice(0, 30); // max 30 items passed to the agent
}

export function geoToLabel(geo: string): string {
  const map: Record<string, string> = {
    US: "the United States",
    GB: "the United Kingdom",
    IN: "India",
    CA: "Canada",
    AU: "Australia",
    SG: "Singapore",
    AE: "the UAE",
    DE: "Germany",
    FR: "France",
  };
  return map[geo.toUpperCase()] ?? geo;
}

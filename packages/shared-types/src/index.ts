// ============================================================
// Shared TypeScript interfaces used by both apps/api and apps/web
// ============================================================

// --- User ---

export type UserRole = "user" | "admin";

export interface IUser {
  _id: string;
  email: string;
  name: string;
  role?: UserRole;
  requiresSetup?: boolean;
  tokensUsed?: number;
  tokenLimit?: number | null;
  createdAt: string;
  updatedAt: string;
}

// --- User Persona ---

export type PlatformGoal =
  | "thought-leadership"
  | "lead-generation"
  | "personal-brand"
  | "hiring"
  | "community-building";

export type ContentMixPreference =
  | "more-carousels"
  | "more-text-posts"
  | "more-polls"
  | "balanced";

// Post batch metadata — one entry per analysis batch (incremental post addition)
export interface IPostBatchMetadata {
  batchId: string;
  addedAt: string;
  postCount: number;
  source: "manual" | "linkedin-scrape" | "add-posts";
}

// Persona snapshot — saved before each incremental update for diff/history
export interface IPersonaSnapshot {
  snapshotAt: string;
  personaVersion: number;
  writingStyle?: string;
  tone?: string;
  topics: string[];
  postFormats: string[];
  summary?: string;
}

// Feedback profile — auto-updated by persona learning service
export interface IFeedbackProfile {
  preferredTopics: string[];
  avoidTopics: string[];
  formatPreferences: Record<string, number>; // e.g. { carousel: 0.4, "text-post": 0.3 }
  tonePreference?: string;
  averageRating: number; // 1-4 scale
  totalFeedbackCount: number;
  lastFeedbackAt?: string;
  averageContentLength?: number;
}

// Writing Pattern DNA — deterministic voice fingerprint (Phase 4 #17)
export interface IWritingDNA {
  avgSentenceLength: number;
  sentenceLengthVariance: number;
  avgParagraphLength: number;
  openingPatterns: {
    question: number;
    story: number;
    statistic: number;
    boldClaim: number;
    other: number;
  };
  emojiFrequency: number;
  emojiTypes: string[];
  hashtagFrequency: number;
  hashtagPlacement: "inline" | "end" | "mixed" | "none";
  avgPostLength: number;
  postLengthRange: [number, number];
  usesListFormat: boolean;
  usesBulletPoints: boolean;
  lineBreakFrequency: number;
  readingLevel: "simple" | "moderate" | "advanced";
  firstPersonRatio: number;
  ctaPatterns: string[];
}

// Persona Confidence Score — how well we know this creator (Phase 4 #22)
export interface IPersonaConfidenceScore {
  overall: number;
  breakdown: {
    postVolume: number;
    interviewComplete: number;
    feedbackVolume: number;
    performanceData: number;
    recency: number;
  };
}

// Peer insights — competitor/peer awareness (Phase 4 #51)
export interface IPeerInsights {
  peerUrls: string[];
  lastScrapedAt?: string;
  peerTopics: string[];
}

export interface IUserPersona {
  _id: string;
  userId: string;
  linkedinUrl?: string;
  scrapedPosts: string[];
  // Post tracking
  postMetadata: IPostBatchMetadata[];
  totalPostsAnalyzed: number;
  lastPostAddedAt?: string;
  personaVersion: number;
  analysisHistory: IPersonaSnapshot[];
  // Derived from scraping + Gemini analysis
  writingStyle?: string;
  tone?: string;
  topics: string[];
  postFormats: string[];
  // Interview answers
  goals?: string;
  targetAudience?: string;
  industry?: string;
  contentPillars: string[];
  postingFrequency?: string;
  platformGoal?: PlatformGoal;
  interviewComplete: boolean;
  // Continuous learning signals
  feedbackProfile?: IFeedbackProfile;
  lastLearningUpdate?: string;
  // Writing DNA — deterministic voice fingerprint (Phase 4 #17)
  writingDNA?: IWritingDNA;
  // Confidence score — how well we know this creator (Phase 4 #22)
  confidenceScore?: IPersonaConfidenceScore;
  // Peer insights — competitor awareness (Phase 4 #51)
  peerInsights?: IPeerInsights;
  createdAt: string;
  updatedAt: string;
}

// --- Chat ---

export interface IMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface IChatSession {
  _id: string;
  userId: string;
  sessionId: string;
  agentType: "onboarding" | "orchestrator" | "persona-chat" | "post-editor";
  messages: IMessage[];
  contextSummary?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Content Suggestions ---

export type PostFormat =
  | "carousel"
  | "text-post"
  | "poll"
  | "video-script"
  | "list"
  | "tweet"
  | "thread"
  | "quote-tweet"
  | "image-tweet";

/** Platform a suggestion or draft targets */
export type SuggestionPlatform = "linkedin" | "twitter";

// --- Feature: Scheduling Hints (Phase 4 #30-#32) ---

export interface ISchedulingHint {
  bestDay: string;
  bestTimeRange: string;
  reasoning: string;
  confidence: "domain-average" | "personalized";
}

// --- Feature: Content Series Detection (Phase 4 #33-#35) ---

export interface ISeriesTag {
  name: string;
  sequenceNumber: number;
  previousPosts: string[];
}

// --- Feature: Implicit Feedback Signals (Phase 4 #36-#38) ---

export type ImplicitSignalType =
  | "hook_copied"
  | "brief_copied"
  | "write_clicked"
  | "time_spent"
  | "skipped"
  | "regenerated";

export interface IImplicitSignal {
  type: ImplicitSignalType;
  suggestionSetId: string;
  suggestionIndex: number;
  metadata?: { timeSpentMs?: number };
}

// --- Feature: Published Post Performance (Phase 4 #41-#42) ---

export interface IPerformanceData {
  likes: number;
  comments: number;
  reposts: number;
  impressions?: number;
  reportedAt: string;
}

export interface ISuggestion {
  topic: string;
  angle: string;
  format: PostFormat;
  hook: string;
  whyItFits: string;
  // ← new rich fields for full content brief
  seoKeywords: string[]; // 3-5 hashtags / SEO keywords
  clickbaitHooks: string[]; // 2-3 bolder alternative hook variants
  postPointers: string[]; // 4-6 bullet points of content to write
  callToAction: string; // suggested CTA to close the post
  /** Platform this suggestion is targeted for (#36) */
  platform?: SuggestionPlatform;
  /** Individual tweets for thread format (Twitter only) */
  threadContent?: string[];
  /** Scheduling hint for optimal posting time (Phase 4 #31) */
  schedulingHint?: ISchedulingHint;
  /** Content series tag — links to related previous posts (Phase 4 #34) */
  seriesTag?: ISeriesTag;
}

export interface IContentSuggestion {
  _id: string;
  userId: string;
  generatedAt: string;
  trendsUsed: string[];
  suggestions: ISuggestion[];
  generationMode?: string;
  contextOptions?: IGenerateContextOptions;
  createdAt: string;
}

// --- API Request/Response ---

export interface IApiResponse<T = unknown> {
  data?: T;
  error?: string;
  details?: string;
  message?: string;
}

export interface ILoginRequest {
  email: string;
  password: string;
}

export interface IRegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface IAuthResponse {
  user: IUser;
  token: string;
}

export interface IPersonaAnalysisInput {
  linkedinUrl?: string;
  manualPosts?: string;
  postsArray?: string[]; // structured array of posts (preferred over manualPosts raw string)
}

// Add-posts request — for incremental post addition to an existing persona
export interface IAddPostsRequest {
  postsArray: string[]; // new posts to merge into persona
  mode?: "incremental" | "full"; // default: incremental
  source?: "manual" | "linkedin-scrape" | "add-posts";
}

// Diff between persona before and after a post addition (#28)
export interface IPersonaDiff {
  topicsAdded: string[];
  topicsRemoved: string[];
  formatsAdded: string[];
  writingStyleChanged: boolean;
  toneChanged: boolean;
}

// Response from POST /api/persona/add-posts
export interface IAddPostsResponse {
  message: string;
  postsAdded: number;
  duplicatesSkipped: number;
  persona: IUserPersona;
  batchId: string;
  diff?: IPersonaDiff | null;
}

// Response from GET /api/persona/posts
export interface IPersonaPostsResponse {
  batches: Array<{
    batchId: string;
    addedAt: string;
    postCount: number;
    source: string;
    posts: string[];
  }>;
  totalPostsAnalyzed: number;
}

export interface IOnboardingMessage {
  message: string;
  sessionId?: string;
}

export interface IOnboardingResponse {
  reply: string;
  sessionId: string;
  interviewComplete: boolean;
  questionsAnswered: number;
}

// --- Feature: Flexible Content Generation Context ---

export interface IGenerateContextOptions {
  mode: "profile" | "topic-focus" | "chat-refined" | "trend-selected" | "persona-topics";
  topicFocus?: string; // used when mode='topic-focus'
  targetAudienceOverride?: string;
  platformGoal?: PlatformGoal;
  contentMix?: ContentMixPreference;
  chatRefinementContext?: string; // summary from pre-gen chat, mode='chat-refined'
  /** Target platforms for this generation run (#36) */
  platforms?: SuggestionPlatform[];
  /** IDs of user-selected trends from the discovery cache (Phase 3 #22) */
  selectedTrendIds?: string[];
  /** Preferred formats filter — hard constraint overriding learned preferences (Phase 4 #29) */
  preferredFormats?: PostFormat[];
  /** Link to the parent suggestion set this was regenerated from (Phase 4 #43) */
  parentSetId?: string;
}

export interface ISuggestionsGenerateResponse {
  suggestions: ISuggestion[];
  id: string;
  generatedAt: string;
  trendsUsed: string[];
  /** Whether trends came from live APIs or evergreen fallback (#34) */
  trendSource?: "live" | "fallback";
}

export interface IPaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// --- Feature: Trend Discovery (Phase 3 #22) ---

export interface IDiscoveryTrend {
  id: string;
  topic: string;
  source?: string;
  url?: string;
  relevanceScore: number;
  relevanceReason: string;
  contentAngle: string;
  category: string;
  publishedAt?: string;
}

export interface ITrendDiscoveryResponse {
  trends: IDiscoveryTrend[];
  categories: string[];
  fetchedAt: string;
  expiresAt: string;
  isLive: boolean;
}

// --- Feature: AI-Suggested Topics from Persona (Phase 3 #27) ---

export interface ITopicIdea {
  id: string;
  title: string;
  category: string;
  reasoning: string;
  suggestedFormat: "carousel" | "text-post" | "poll" | "video-script" | "list";
  confidence: number;
}

export interface ITopicIdeasResponse {
  topics: ITopicIdea[];
  basedOn: {
    contentPillars: string[];
    topTopics: string[];
    preferredFormats: string[];
    avoidTopics: string[];
  };
}

// --- Feature: AI Detector + Humanizer (Phase 3 #35) ---

export type AiVerdict = "human" | "mixed" | "likely-ai";
export type HumanizeIntensity = "light" | "moderate" | "aggressive";

export interface IAiCheckResponse {
  score: number;
  verdict: AiVerdict;
  signals: string[];
  suggestions: string[];
}

export interface IHumanizeResponse {
  humanizedContent: string;
  charCount: number;
  changesSummary: string;
  beforeScore: number;
  afterScore: number;
}

// --- Feature: Persona Chat (live profile update via AI) ---

export interface IPersonaPendingChanges {
  goals?: string;
  targetAudience?: string;
  industry?: string;
  contentPillars?: string[];
  postingFrequency?: string;
  topics?: string[];
  tone?: string;
  writingStyle?: string;
  platformGoal?: PlatformGoal;
}

export interface IPersonaChatMessage {
  message: string;
  sessionId?: string;
}

export interface IPersonaChatResponse {
  reply: string;
  sessionId: string;
  pendingChanges?: IPersonaPendingChanges;
  changesApplied: boolean;
}

export interface IApplyPersonaChangesRequest {
  changes: IPersonaPendingChanges;
}

export interface IPersonaUpdateResponse {
  persona: IUserPersona;
  message: string;
}

// --- Feature: Pre-generation context refinement chat ---

export interface IRefineContextRequest {
  messages: IMessage[];
}

export interface IRefineContextResponse {
  reply: string;
  summary: string;
}

// --- Feature: Token Usage Tracking ---

export type AgentName =
  | "persona-analyst"
  | "onboarding"
  | "trend-research"
  | "content-generator"
  | "persona-chat"
  | "refine-context";

export type OperationType =
  | "persona_analysis"
  | "onboarding_chat"
  | "trend_research"
  | "content_generation"
  | "persona_chat"
  | "refine_context";

export interface ITokenUsageLog {
  _id: string;
  userId: string;
  agent: AgentName;
  operation: OperationType;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  metadata: {
    suggestionId?: string;
    sessionId?: string;
  };
  createdAt: string;
}

export interface ITokenUsageSummary {
  tokensUsed: number;
  tokenLimit: number;
  percentUsed: number;
  tokensRemaining: number;
  allowed: boolean;
}

// --- Feature: Token Increase Requests ---

export type TokenRequestStatus = "pending" | "approved" | "rejected";

export interface ITokenRequest {
  _id: string;
  /** userId is a string on user-facing endpoints; populated object on admin list */
  userId:
    | string
    | {
        _id: string;
        email: string;
        name: string;
        tokensUsed: number;
        tokenLimit: number | null;
      };
  message?: string;
  status: TokenRequestStatus;
  /** Usage snapshot captured at time of request */
  tokensUsed: number;
  tokenLimit: number;
  /** New limit set by admin when approving */
  newLimit?: number;
  adminNote?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Feature: Suggestion Feedback Loop (#B-6) ---

export type FeedbackRating = "loved" | "good" | "meh" | "bad";
export type FeedbackAction = "saved" | "draft" | "published" | "dismissed";

export interface ISuggestionFeedback {
  _id: string;
  userId: string;
  suggestionSetId: string; // ContentSuggestion._id
  suggestionIndex: number; // 0-based index within the set
  rating?: FeedbackRating;
  action?: FeedbackAction;
  feedbackText?: string; // optional free-text note (max 1000 chars)
  /** Signals extracted by the learning service */
  parsedSignals?: Record<string, unknown>;
  /** Snapshot of the suggestion at time of feedback */
  suggestionSnapshot?: {
    topic: string;
    angle: string;
    format: PostFormat;
    hook: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface IFeedbackRequest {
  rating?: FeedbackRating;
  action?: FeedbackAction;
  feedbackText?: string;
}

// --- Feature: Post Draft / Co-Writing Editor (#B-7) ---

export type DraftStatus = "drafting" | "ready" | "published";
export type DraftPlatform = "linkedin" | "twitter";

export interface IDraftContentHistory {
  content: string;
  editedAt: string;
  editedBy: "user" | "ai";
  changeNote?: string;
}

export interface IDraftBrief {
  topic: string;
  angle: string;
  format: PostFormat;
  hook: string;
  postPointers: string[];
  callToAction: string;
  seoKeywords: string[];
}

export interface ITwitterTweet {
  tweetIndex: number;
  content: string;
  charCount: number;
}

export interface IPostDraft {
  _id: string;
  userId: string;
  sourceSuggestionSetId?: string;
  sourceSuggestionIndex?: number;
  platform: DraftPlatform;
  title?: string;
  content: string;
  contentHistory: IDraftContentHistory[];
  brief?: IDraftBrief;
  twitterThread?: ITwitterTweet[];
  status: DraftStatus;
  charCount: number;
  chatSessionId?: string;
  publishedAt?: string;
  // Phase 4 #41: Post performance data (user-reported)
  performanceData?: IPerformanceData;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateDraftRequest {
  suggestionSetId?: string;
  suggestionIndex?: number;
  platform?: DraftPlatform;
  title?: string;
  content?: string;
  brief?: IDraftBrief;
}

export interface IUpdateDraftRequest {
  content?: string;
  title?: string;
  status?: DraftStatus;
  changeNote?: string;
}

export interface IDraftListItem {
  _id: string;
  title?: string;
  platform: DraftPlatform;
  status: DraftStatus;
  charCount: number;
  updatedAt: string;
  brief?: Pick<IDraftBrief, "topic" | "format">;
}

// --- Feature: Admin Dashboard (#B-8) ---

/** Admin-facing user record (includes usage stats) */
export interface IAdminUser {
  _id: string;
  email: string;
  name: string;
  role: UserRole;
  requiresSetup: boolean;
  tokensUsed: number;
  tokenLimit: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Platform-wide analytics snapshot for admin overview */
export interface IAdminAnalyticsOverview {
  totalUsers: number;
  activeUsersLast7Days: number;
  totalTokensConsumed: number;
  totalSuggestionsGenerated: number;
  totalDraftsCreated: number;
  pendingTokenRequests: number;
  /** Per-agent token breakdown */
  tokensByAgent: Record<AgentName, number>;
}

export interface IAdminAuditLogEntry {
  _id: string;
  adminId: string;
  action: string;
  targetUserId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

// --- Feature: Continuous Persona Learning (#B-10) ---

/** A single learning signal derived from user feedback */
export interface ILearningSignal {
  userId: string;
  feedbackId: string;
  rating: FeedbackRating;
  topic: string;
  format: PostFormat;
  platform?: SuggestionPlatform;
  signalStrength: number; // 1.0 (loved) → 0.25 (bad)
  createdAt: string;
}

/** Result returned by the persona learning aggregation service */
export interface IPersonaLearningResult {
  userId: string;
  signalsProcessed: number;
  feedbackProfileUpdated: boolean;
  changes: {
    topicsAdded: string[];
    topicsRemoved: string[];
    formatsAdjusted: Record<string, number>;
  };
}

// --- Feature: Audience Resonance Tracking (Phase 4 #47-#48) ---

export interface IAudienceEngagement {
  likes: number;
  comments: number;
  reposts: number;
  impressions?: number;
}

export interface IAudienceInsight {
  _id: string;
  userId: string;
  postDraftId?: string;
  postContent: string;
  engagement: IAudienceEngagement;
  topics: string[];
  format: string;
  dayOfWeek: string;
  timeOfDay: string;
  audienceQuestions: string[];
  recordedAt: string;
}

export interface IAudienceInsightsResult {
  topPerformingTopics: { topic: string; avgEngagement: number; count: number }[];
  bestPostingTimes: { dayOfWeek: string; timeOfDay: string; avgEngagement: number }[];
  formatPerformance: { format: string; avgEngagement: number; count: number }[];
  totalRecords: number;
  overallAvgEngagement: number;
}

// --- Feature: A/B Test Framework (Phase 4 #50) ---

export interface IAbTestData {
  servedPath: "default" | "experimental";
  shadowResult?: {
    suggestions: unknown[];
    generatedAt: string;
  };
  enrolledAt: string;
}

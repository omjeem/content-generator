// ============================================================
// Shared TypeScript interfaces used by both apps/api and apps/web
// ============================================================

// --- User ---

export interface IUser {
  _id: string
  email: string
  name: string
  createdAt: string
  updatedAt: string
}

// --- User Persona ---

export type PlatformGoal =
  | 'thought-leadership'
  | 'lead-generation'
  | 'personal-brand'
  | 'hiring'
  | 'community-building'

export type ContentMixPreference =
  | 'more-carousels'
  | 'more-text-posts'
  | 'more-polls'
  | 'balanced'

// Post batch metadata — one entry per analysis batch (incremental post addition)
export interface IPostBatchMetadata {
  batchId: string
  addedAt: string
  postCount: number
  source: 'manual' | 'linkedin-scrape' | 'add-posts'
}

// Persona snapshot — saved before each incremental update for diff/history
export interface IPersonaSnapshot {
  snapshotAt: string
  personaVersion: number
  writingStyle?: string
  tone?: string
  topics: string[]
  postFormats: string[]
  summary?: string
}

export interface IUserPersona {
  _id: string
  userId: string
  linkedinUrl?: string
  scrapedPosts: string[]
  // Post tracking
  postMetadata: IPostBatchMetadata[]
  totalPostsAnalyzed: number
  lastPostAddedAt?: string
  personaVersion: number
  analysisHistory: IPersonaSnapshot[]
  // Derived from scraping + Gemini analysis
  writingStyle?: string
  tone?: string
  topics: string[]
  postFormats: string[]
  // Interview answers
  goals?: string
  targetAudience?: string
  industry?: string
  contentPillars: string[]
  postingFrequency?: string
  platformGoal?: PlatformGoal
  interviewComplete: boolean
  createdAt: string
  updatedAt: string
}

// --- Chat ---

export interface IMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface IChatSession {
  _id: string
  userId: string
  sessionId: string
  agentType: 'onboarding' | 'orchestrator' | 'persona-chat'  // ← added persona-chat
  messages: IMessage[]
  contextSummary?: string
  createdAt: string
  updatedAt: string
}

// --- Content Suggestions ---

export type PostFormat = 'carousel' | 'text-post' | 'poll' | 'video-script' | 'list'

export interface ISuggestion {
  topic: string
  angle: string
  format: PostFormat
  hook: string
  whyItFits: string
  // ← new rich fields for full content brief
  seoKeywords: string[]         // 3-5 hashtags / SEO keywords
  clickbaitHooks: string[]      // 2-3 bolder alternative hook variants
  postPointers: string[]        // 4-6 bullet points of content to write
  callToAction: string          // suggested CTA to close the post
}

export interface IContentSuggestion {
  _id: string
  userId: string
  generatedAt: string
  trendsUsed: string[]
  suggestions: ISuggestion[]
  createdAt: string
}

// --- API Request/Response ---

export interface IApiResponse<T = unknown> {
  data?: T
  error?: string
  details?: string
  message?: string
}

export interface ILoginRequest {
  email: string
  password: string
}

export interface IRegisterRequest {
  email: string
  password: string
  name: string
}

export interface IAuthResponse {
  user: IUser
  token: string
}

export interface IPersonaAnalysisInput {
  linkedinUrl?: string
  manualPosts?: string
  postsArray?: string[]    // structured array of posts (preferred over manualPosts raw string)
}

// Add-posts request — for incremental post addition to an existing persona
export interface IAddPostsRequest {
  postsArray: string[]                // new posts to merge into persona
  mode?: 'incremental' | 'full'       // default: incremental
  source?: 'manual' | 'linkedin-scrape' | 'add-posts'
}

// Response from GET /api/persona/posts
export interface IPersonaPostsResponse {
  batches: Array<{
    batchId: string
    addedAt: string
    postCount: number
    source: string
    posts: string[]
  }>
  totalPostsAnalyzed: number
}

export interface IOnboardingMessage {
  message: string
  sessionId?: string
}

export interface IOnboardingResponse {
  reply: string
  sessionId: string
  interviewComplete: boolean
  questionsAnswered: number
}

// --- Feature: Flexible Content Generation Context ---

export interface IGenerateContextOptions {
  mode: 'profile' | 'topic-focus' | 'chat-refined'
  topicFocus?: string                    // used when mode='topic-focus'
  targetAudienceOverride?: string
  platformGoal?: PlatformGoal
  contentMix?: ContentMixPreference
  chatRefinementContext?: string         // summary from pre-gen chat, mode='chat-refined'
}

export interface ISuggestionsGenerateResponse {
  suggestions: ISuggestion[]
  id: string
  generatedAt: string
  trendsUsed: string[]
}

export interface IPaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// --- Feature: Persona Chat (live profile update via AI) ---

export interface IPersonaPendingChanges {
  goals?: string
  targetAudience?: string
  industry?: string
  contentPillars?: string[]
  postingFrequency?: string
  topics?: string[]
  tone?: string
  writingStyle?: string
  platformGoal?: PlatformGoal
}

export interface IPersonaChatMessage {
  message: string
  sessionId?: string
}

export interface IPersonaChatResponse {
  reply: string
  sessionId: string
  pendingChanges?: IPersonaPendingChanges
  changesApplied: boolean
}

export interface IApplyPersonaChangesRequest {
  changes: IPersonaPendingChanges
}

export interface IPersonaUpdateResponse {
  persona: IUserPersona
  message: string
}

// --- Feature: Pre-generation context refinement chat ---

export interface IRefineContextRequest {
  messages: IMessage[]
}

export interface IRefineContextResponse {
  reply: string
  summary: string
}

// --- Feature: Token Usage Tracking ---

export type AgentName =
  | 'persona-analyst'
  | 'onboarding'
  | 'trend-research'
  | 'content-generator'
  | 'persona-chat'
  | 'refine-context'

export type OperationType =
  | 'persona_analysis'
  | 'onboarding_chat'
  | 'trend_research'
  | 'content_generation'
  | 'persona_chat'
  | 'refine_context'

export interface ITokenUsageLog {
  _id: string
  userId: string
  agent: AgentName
  operation: OperationType
  inputTokens: number
  outputTokens: number
  totalTokens: number
  metadata: {
    suggestionId?: string
    sessionId?: string
  }
  createdAt: string
}

export interface ITokenUsageSummary {
  tokensUsed: number
  tokenLimit: number
  percentUsed: number
  tokensRemaining: number
  allowed: boolean
}

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

export interface IUserPersona {
  _id: string
  userId: string
  linkedinUrl?: string
  scrapedPosts: string[]
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
  agentType: 'onboarding' | 'orchestrator'
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

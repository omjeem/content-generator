import type {
  IAuthResponse,
  ILoginRequest,
  IRegisterRequest,
  IUserPersona,
  IPersonaAnalysisInput,
  IOnboardingMessage,
  IOnboardingResponse,
  IChatSession,
  ISuggestionsGenerateResponse,
  IContentSuggestion,
  IPaginatedResponse,
  IGenerateContextOptions,
  IPersonaChatMessage,
  IPersonaChatResponse,
  IApplyPersonaChangesRequest,
  IPersonaUpdateResponse,
} from '@repo/shared-types'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const data = await res.json().catch(() => ({ error: 'Request failed' }))

  if (!res.ok) {
    throw new ApiError(
      res.status,
      (data as { error?: string }).error || `HTTP ${res.status}`,
      (data as { details?: string }).details
    )
  }

  return data as T
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (body: IRegisterRequest) =>
    request<IAuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: ILoginRequest) =>
    request<IAuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  logout: () =>
    request<{ message: string }>('/api/auth/logout', { method: 'POST' }),

  me: () => request<{ user: IAuthResponse['user'] }>('/api/auth/me'),
}

// ── Persona ───────────────────────────────────────────────────────────────────

export const personaApi = {
  analyze: (body: IPersonaAnalysisInput) =>
    request<{ persona: IUserPersona; postsAnalyzed: number }>('/api/persona/analyze', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  get: () => request<{ persona: IUserPersona }>('/api/persona'),
}

// ── Onboarding ────────────────────────────────────────────────────────────────

export const onboardingApi = {
  chat: (body: IOnboardingMessage) =>
    request<IOnboardingResponse>('/api/onboarding/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getSession: () =>
    request<
      Pick<IChatSession, 'messages'> & {
        interviewComplete: boolean
        sessionId: string | null
      }
    >('/api/onboarding/session'),

  getStatus: () =>
    request<{ complete: boolean; missingFields: string[] }>('/api/onboarding/status'),
}

// ── Suggestions ───────────────────────────────────────────────────────────────

export const suggestionsApi = {
  generate: (body?: {
    linkedinUrl?: string
    manualPosts?: string
    forceReanalyze?: boolean
    context?: IGenerateContextOptions
  }) =>
    request<ISuggestionsGenerateResponse>('/api/suggestions/generate', {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),

  refineContext: (body: { messages: { role: 'user' | 'assistant'; content: string }[] }) =>
    request<{
      reply: string
      summary?: string
      topicFocus?: string
      targetAudienceOverride?: string
      platformGoal?: string
    }>('/api/suggestions/refine-context', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  list: (page = 1, limit = 10) =>
    request<IPaginatedResponse<IContentSuggestion>>(
      `/api/suggestions?page=${page}&limit=${limit}`
    ),

  getById: (id: string) =>
    request<{ suggestion: IContentSuggestion }>(`/api/suggestions/${id}`),
}

// ── Persona Chat ───────────────────────────────────────────────────────────────

export const personaChatApi = {
  chat: (body: IPersonaChatMessage) =>
    request<IPersonaChatResponse>('/api/persona-chat/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  applyChanges: (body: IApplyPersonaChangesRequest) =>
    request<IPersonaUpdateResponse>('/api/persona-chat/apply-changes', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getHistory: () =>
    request<{ messages: IChatSession['messages']; sessionId: string | null }>(
      '/api/persona-chat/history'
    ),
}

import type {
  IAuthResponse,
  ILoginRequest,
  IRegisterRequest,
  IUserPersona,
  IPersonaAnalysisInput,
  IAddPostsRequest,
  IAddPostsResponse,
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
  ITokenUsageSummary,
  ITokenUsageLog,
  IPersonaPostsResponse,
  ITokenRequest,
} from "@repo/shared-types";

// In production, Next.js rewrites /api/* → the Express backend (same domain).
// This means cookies are set on the frontend's domain and the middleware can
// read them — fixing the cross-origin cookie redirect bug.
//
// We use a relative base URL so all API calls go through the Next.js rewrite
// proxy in both local dev and production. NEXT_PUBLIC_API_URL is only used by
// next.config.mjs to configure the rewrite destination.
const BASE_URL = "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await res.json().catch(() => ({ error: "Request failed" }));

  if (!res.ok) {
    throw new ApiError(
      res.status,
      (data as { error?: string }).error || `HTTP ${res.status}`,
      (data as { details?: string }).details,
    );
  }

  return data as T;
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (body: IRegisterRequest) =>
    request<IAuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  login: (body: ILoginRequest) =>
    request<IAuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  logout: () =>
    request<{ message: string }>("/api/auth/logout", { method: "POST" }),

  me: () => request<{ user: IAuthResponse["user"] }>("/api/auth/me"),
};

// ── Persona ───────────────────────────────────────────────────────────────────

export const personaApi = {
  analyze: (body: IPersonaAnalysisInput) =>
    request<{ persona: IUserPersona; postsAnalyzed: number }>(
      "/api/persona/analyze",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),

  get: () => request<{ persona: IUserPersona }>("/api/persona"),

  addPosts: (body: IAddPostsRequest) =>
    request<IAddPostsResponse>("/api/persona/add-posts", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getPosts: () => request<IPersonaPostsResponse>("/api/persona/posts"),
};

// ── Onboarding ────────────────────────────────────────────────────────────────

export const onboardingApi = {
  chat: (body: IOnboardingMessage) =>
    request<IOnboardingResponse>("/api/onboarding/chat", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getSession: () =>
    request<
      Pick<IChatSession, "messages"> & {
        interviewComplete: boolean;
        sessionId: string | null;
      }
    >("/api/onboarding/session"),

  getStatus: () =>
    request<{ complete: boolean; missingFields: string[] }>(
      "/api/onboarding/status",
    ),
};

// ── Suggestions ───────────────────────────────────────────────────────────────

export const suggestionsApi = {
  generate: (body?: {
    linkedinUrl?: string;
    manualPosts?: string;
    forceReanalyze?: boolean;
    context?: IGenerateContextOptions;
  }) =>
    request<ISuggestionsGenerateResponse>("/api/suggestions/generate", {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),

  refineContext: (body: {
    messages: { role: "user" | "assistant"; content: string }[];
  }) =>
    request<{
      reply: string;
      summary?: string;
      topicFocus?: string;
      targetAudienceOverride?: string;
      platformGoal?: string;
    }>("/api/suggestions/refine-context", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  list: (page = 1, limit = 10) =>
    request<IPaginatedResponse<IContentSuggestion>>(
      `/api/suggestions?page=${page}&limit=${limit}`,
    ),

  getById: (id: string) =>
    request<{ suggestion: IContentSuggestion }>(`/api/suggestions/${id}`),
};

// ── Token Usage ───────────────────────────────────────────────────────────────

export const tokenApi = {
  getUsage: () => request<ITokenUsageSummary>("/api/tokens/usage"),

  getLogs: (page = 1, limit = 20) =>
    request<IPaginatedResponse<ITokenUsageLog>>(
      `/api/tokens/logs?page=${page}&limit=${limit}`,
    ),

  // Submit a request for a token limit increase (optional message)
  requestIncrease: (message?: string) =>
    request<{ message: string; request: ITokenRequest }>(
      "/api/tokens/request-increase",
      { method: "POST", body: JSON.stringify({ message }) },
    ),

  // Get the current user's own token increase requests
  getMyRequests: () =>
    request<{ requests: ITokenRequest[] }>("/api/tokens/my-requests"),
};

// ── Persona Chat ───────────────────────────────────────────────────────────────

export const personaChatApi = {
  chat: (body: IPersonaChatMessage) =>
    request<IPersonaChatResponse>("/api/persona-chat/chat", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  applyChanges: (body: IApplyPersonaChangesRequest) =>
    request<IPersonaUpdateResponse>("/api/persona-chat/apply-changes", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getHistory: () =>
    request<{ messages: IChatSession["messages"]; sessionId: string | null }>(
      "/api/persona-chat/history",
    ),
};

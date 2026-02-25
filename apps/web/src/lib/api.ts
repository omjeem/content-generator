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

// ── Base URL ──────────────────────────────────────────────────────────────────
//
// ALL requests go through the Next.js rewrite proxy (/api/* → Express).
// This is non-negotiable: the httpOnly `token` cookie is set on the frontend
// domain by the proxy, so it can only be sent back to the same domain.
// Calling the Express API directly from the browser (a different domain/port)
// means the cookie is never sent → 401 every time, regardless of sameSite.
//
// The proxy timeout concern is handled at the platform level (see README) and
// by the Express requestTimeout middleware which sends 503 before the platform
// drops the connection. AbortSignal.timeout() is set generously on AI calls so
// the browser stays connected for the full pipeline duration.
const BASE_URL = "";

// Browser timeout for long-running AI requests — matches Express middleware (3 min)
const AI_TIMEOUT_MS = 180_000;
// Browser timeout for regular requests (30 s)
const DEFAULT_TIMEOUT_MS = 30_000;

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

// ── Silent token refresh ──────────────────────────────────────────────────────
// Access tokens expire after 15 min. On any 401 we transparently call
// /api/auth/refresh (rotating refresh token, 30-day TTL) to get a new access
// token cookie and retry the original request — the user sees nothing.
//
// If refresh also fails (truly expired session) we redirect to /login.
// Multiple concurrent 401s share a single in-flight refresh promise.

let _refreshing: Promise<void> | null = null;

async function silentRefresh(): Promise<void> {
  if (_refreshing) return _refreshing;

  _refreshing = (async () => {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      throw new ApiError(401, "Session expired. Please log in again.");
    }
  })().finally(() => {
    _refreshing = null;
  });

  return _refreshing;
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

async function execute<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
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

// ── request — all calls go through the Next.js rewrite proxy ─────────────────
async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const init: RequestInit = {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  };

  try {
    return await execute<T>(`${BASE_URL}${path}`, init);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      await silentRefresh();
      // Retry with a fresh signal (the old one may have already fired)
      return execute<T>(`${BASE_URL}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    }
    throw err;
  }
}

// Convenience wrapper for long-running AI endpoints
function requestAI<T>(path: string, options: RequestInit = {}): Promise<T> {
  return request<T>(path, options, AI_TIMEOUT_MS);
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
  // AI endpoint — full LLM pipeline (30–60 s), uses extended timeout
  analyze: (body: IPersonaAnalysisInput) =>
    requestAI<{ persona: IUserPersona; postsAnalyzed: number }>(
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
  // AI endpoint — LLM agent (30–60 s), uses extended timeout
  chat: (body: IOnboardingMessage) =>
    requestAI<IOnboardingResponse>("/api/onboarding/chat", {
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
  // AI endpoint — multi-step LLM pipeline (30–90 s), uses extended timeout
  generate: (body?: {
    linkedinUrl?: string;
    manualPosts?: string;
    forceReanalyze?: boolean;
    context?: IGenerateContextOptions;
  }) =>
    requestAI<ISuggestionsGenerateResponse>("/api/suggestions/generate", {
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
  // AI endpoint — LLM agent (30–60 s), uses extended timeout
  chat: (body: IPersonaChatMessage) =>
    requestAI<IPersonaChatResponse>("/api/persona-chat/chat", {
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

  // Fetch the current user's full persona for the profile page display.
  // Uses the proxy (relative URL) — never call NEXT_PUBLIC_API_URL directly
  // from the browser or the httpOnly cookie won't be sent → 401 in production.
  getPersona: () =>
    request<{ persona: IUserPersona }>("/api/persona-chat/persona"),
};

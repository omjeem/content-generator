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

// ── Base URLs ─────────────────────────────────────────────────────────────────
//
// All regular calls use BASE_URL="" (relative) so they go through the Next.js
// rewrite proxy (/api/* → Express). Cookies are then same-origin and always
// forwarded correctly in both dev and production.
//
// Long-running AI calls (30–90 s) use DIRECT_API_URL to bypass the proxy's
// ~60 s timeout. In production NEXT_PUBLIC_API_URL points to the public API
// host. In dev it falls back to "" so they also go through the proxy (the
// Next.js dev server has no timeout, so this is safe in dev).
const BASE_URL = "";
const DIRECT_API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";

// Timeout for long-running AI requests (3 min — matches Express middleware)
const AI_TIMEOUT_MS = 180_000;

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
// Access tokens expire after 15 min. Rather than kicking the user to /login on
// every expiry, we silently call /api/auth/refresh (which rotates the refresh
// token and issues a new access token cookie) and retry the original request.
// Only one refresh is attempted per original call — if refresh also fails we
// redirect to /login so the user can log back in.
//
// The refresh call always goes through BASE_URL (the Next.js proxy) because
// the refreshToken cookie has path:"/api/auth" — the browser only sends it to
// that path prefix, which works correctly via the proxy rewrite.

let _refreshing: Promise<void> | null = null; // deduplicate concurrent refreshes

async function silentRefresh(): Promise<void> {
  if (_refreshing) return _refreshing; // piggyback on an in-flight refresh

  _refreshing = (async () => {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      // Refresh token expired / invalid — redirect to login
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

// ── Low-level fetchers ────────────────────────────────────────────────────────

/** Execute a fetch and parse JSON, throwing ApiError on non-2xx. */
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

// ── request — goes through Next.js rewrite proxy (same-origin, no timeout) ──
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    return await execute<T>(`${BASE_URL}${path}`, options);
  } catch (err) {
    // On 401: silently refresh the access token and retry once
    if (err instanceof ApiError && err.status === 401) {
      await silentRefresh(); // throws if refresh fails → surfaces to caller
      return execute<T>(`${BASE_URL}${path}`, options);
    }
    throw err;
  }
}

// ── requestDirect — bypasses proxy for long AI calls (AbortSignal timeout) ──
//
// In production, calls NEXT_PUBLIC_API_URL directly from the browser.
// Cookies are sameSite:"none" + secure in production so they are forwarded
// correctly for cross-origin requests.
//
// In dev, DIRECT_API_URL falls back to "" (same as BASE_URL) so all calls
// go through the Next.js dev proxy — no cross-origin cookie issues.
async function requestDirect<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${DIRECT_API_URL}${path}`;
  const init: RequestInit = { ...options, signal: AbortSignal.timeout(AI_TIMEOUT_MS) };

  try {
    return await execute<T>(url, init);
  } catch (err) {
    // On 401: silently refresh then retry
    if (err instanceof ApiError && err.status === 401) {
      await silentRefresh();
      return execute<T>(url, { ...init, signal: AbortSignal.timeout(AI_TIMEOUT_MS) });
    }
    throw err;
  }
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
  // Direct call — persona analysis runs a full LLM pipeline (30–60 s)
  analyze: (body: IPersonaAnalysisInput) =>
    requestDirect<{ persona: IUserPersona; postsAnalyzed: number }>(
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
  // Direct call — onboarding chat runs an LLM agent (can take 30–60 s)
  chat: (body: IOnboardingMessage) =>
    requestDirect<IOnboardingResponse>("/api/onboarding/chat", {
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
  // Uses requestDirect (bypasses Next.js proxy) + AbortSignal.timeout(180s)
  // to avoid the ~60 s proxy timeout that causes spurious 500s for long AI runs.
  generate: (body?: {
    linkedinUrl?: string;
    manualPosts?: string;
    forceReanalyze?: boolean;
    context?: IGenerateContextOptions;
  }) =>
    requestDirect<ISuggestionsGenerateResponse>("/api/suggestions/generate", {
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
  // Direct call — persona chat runs an LLM agent (can take 30–60 s)
  chat: (body: IPersonaChatMessage) =>
    requestDirect<IPersonaChatResponse>("/api/persona-chat/chat", {
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

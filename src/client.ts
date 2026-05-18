export class JungleGridApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "JungleGridApiError";
  }
}

export interface JungleGridClient {
  estimateJob(input: unknown): Promise<unknown>;
  submitJob(input: unknown): Promise<unknown>;
  getJob(jobId: string): Promise<unknown>;
  getJobLogs(jobId: string, options?: { limit?: number; cursor?: string | number }): Promise<unknown>;
  cancelJob(jobId: string, reason?: string): Promise<unknown>;
  listArtifacts(jobId: string): Promise<unknown>;
  getArtifact(jobId: string, artifactId: string): Promise<unknown>;
}

export function createJungleGridClient(
  apiBase: string,
  bearerToken: string,
): JungleGridClient {
  const request = <T>(method: string, path: string, body?: unknown): Promise<T> =>
    apiRequest<T>(apiBase, bearerToken, method, path, body);

  return {
    estimateJob(input) {
      return request("POST", "/v1/jobs/estimate", input);
    },
    submitJob(input) {
      return request("POST", "/v1/jobs", input);
    },
    getJob(jobId) {
      return request("GET", `/v1/jobs/${encodeURIComponent(jobId)}`);
    },
    getJobLogs(jobId, options = {}) {
      const params = new URLSearchParams();
      if (typeof options.limit === "number") params.set("limit", String(options.limit));
      if (options.cursor !== undefined && String(options.cursor).trim() !== "") {
        params.set("cursor", String(options.cursor).trim());
      }
      const suffix = params.size > 0 ? `?${params.toString()}` : "";
      return request("GET", `/v1/jobs/${encodeURIComponent(jobId)}/logs${suffix}`);
    },
    cancelJob(jobId, reason) {
      return request("POST", `/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {
        reason: reason?.trim() || "Cancelled via MCP",
      });
    },
    listArtifacts(jobId) {
      return request("GET", `/v1/jobs/${encodeURIComponent(jobId)}/artifacts`);
    },
    getArtifact(jobId, artifactId) {
      return request(
        "POST",
        `/v1/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifactId)}/download`,
      );
    },
  };
}

async function apiRequest<T>(
  apiBase: string,
  bearerToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;

  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res.status, data);
  }

  return data as T;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (res.ok) {
      throw new JungleGridApiError(502, "INVALID_API_RESPONSE", "Jungle Grid API returned an invalid JSON response.");
    }
    return undefined;
  }
}

function toApiError(status: number, data: unknown): JungleGridApiError {
  const parsed = parseApiError(data);
  const code = parsed.code ?? statusCodeToErrorCode(status);
  const message = parsed.message ?? statusCodeToMessage(status);
  return new JungleGridApiError(status, code, message);
}

function parseApiError(data: unknown): { code?: string; message?: string } {
  if (!data || typeof data !== "object") return {};
  const record = data as Record<string, unknown>;
  const nested = record.error;
  if (nested && typeof nested === "object") {
    const nestedRecord = nested as Record<string, unknown>;
    return {
      code: cleanString(nestedRecord.code),
      message: cleanString(nestedRecord.message),
    };
  }
  return {
    code: cleanString(record.code),
    message: cleanString(record.message),
  };
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function statusCodeToErrorCode(status: number): string {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "UPSTREAM_ERROR";
  return "API_ERROR";
}

function statusCodeToMessage(status: number): string {
  if (status === 401) return "Authentication is required or the token is invalid.";
  if (status === 403) return "The token is not authorized for this Jungle Grid action.";
  if (status === 404) return "The requested Jungle Grid resource was not found.";
  if (status === 429) return "Jungle Grid API rate limit exceeded.";
  if (status >= 500) return "Jungle Grid API is temporarily unavailable.";
  return `Jungle Grid API request failed with status ${status}.`;
}

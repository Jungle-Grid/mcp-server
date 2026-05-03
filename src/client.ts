import type {
  Job,
  JobArtifactDownloadResult,
  JobArtifactListResult,
  JobEstimate,
  JobRuntime,
  ListJobsResult,
  SubmitJobInput,
  SubmitJobResult,
} from "./types.js";

async function request<T>(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, method, path));
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function responseErrorMessage(
  res: Response,
  method: string,
  path: string,
): Promise<string> {
  const fallback = `${method} ${path} failed with status ${res.status}`;
  let body = "";
  try {
    body = await res.text();
  } catch {
    return fallback;
  }

  const trimmed = body.trim();
  if (!trimmed) return fallback;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const detail = formatAPIError(parsed);
    return detail ? `${fallback}: ${detail}` : fallback;
  } catch {
    return `${fallback}: ${trimmed}`;
  }
}

function formatAPIError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const nested = record.error;

  if (typeof nested === "string" && nested.trim()) {
    return nested.trim();
  }
  if (nested && typeof nested === "object") {
    const nestedRecord = nested as Record<string, unknown>;
    const code = stringField(nestedRecord.code);
    const message = stringField(nestedRecord.message);
    if (code && message) return `${code}: ${message}`;
    return message ?? code;
  }

  const code = stringField(record.code);
  const message = stringField(record.message);
  if (code && message) return `${code}: ${message}`;
  return message ?? code;
}

function stringField(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function submitJob(
  baseUrl: string,
  apiKey: string,
  input: SubmitJobInput,
): Promise<SubmitJobResult> {
  return request(baseUrl, apiKey, "POST", "/v1/jobs", input);
}

export function getJob(
  baseUrl: string,
  apiKey: string,
  jobId: string,
): Promise<Job> {
  return request(baseUrl, apiKey, "GET", `/v1/jobs/${jobId}`);
}

export function listJobs(
  baseUrl: string,
  apiKey: string,
  limit = 20,
  status?: string,
): Promise<ListJobsResult> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set("status", status);
  return request(baseUrl, apiKey, "GET", `/v1/jobs?${params}`);
}

export function cancelJob(
  baseUrl: string,
  apiKey: string,
  jobId: string,
  reason?: string,
): Promise<void> {
  return request(baseUrl, apiKey, "POST", `/v1/jobs/${jobId}/cancel`, {
    reason: reason ?? "Cancelled via MCP",
  });
}

export function getJobLogs(
  baseUrl: string,
  apiKey: string,
  jobId: string,
): Promise<JobRuntime> {
  return request(baseUrl, apiKey, "GET", `/v1/jobs/${jobId}/runtime`);
}

export function listJobArtifacts(
  baseUrl: string,
  apiKey: string,
  jobId: string,
): Promise<JobArtifactListResult> {
  return request(baseUrl, apiKey, "GET", `/v1/jobs/${jobId}/artifacts`);
}

export function getJobArtifactDownloadURL(
  baseUrl: string,
  apiKey: string,
  jobId: string,
  artifactId: string,
): Promise<JobArtifactDownloadResult> {
  return request(baseUrl, apiKey, "POST", `/v1/jobs/${jobId}/artifacts/${artifactId}/download`);
}

export function estimateJob(
  baseUrl: string,
  apiKey: string,
  input: Omit<SubmitJobInput, "webhook_url">,
): Promise<JobEstimate> {
  return request(baseUrl, apiKey, "POST", "/v1/jobs/estimate", input);
}

export interface LogResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

/**
 * streamJobLogs opens the SSE live-log stream for a job and resolves when the
 * job reaches a terminal state (terminal event) or the AbortSignal fires.
 *
 * SSE event types: status | notice | stdout | stderr | terminal | heartbeat
 */
export async function streamJobLogs(
  baseUrl: string,
  apiKey: string,
  jobId: string,
  signal: AbortSignal,
): Promise<LogResult> {
  const path = `/v1/jobs/${jobId}/logs/live`;
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "text/event-stream",
    },
    signal,
  });

  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, "GET", path));
  }

  const body = res.body;
  if (!body) {
    throw new Error("stream_job_logs: response body is null");
  }

  const result: LogResult = { stdout: "", stderr: "", exitCode: null, timedOut: false };
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let eventType = "";
      let dataLine = "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLine = line.slice(5).trim();
        } else if (line === "" && dataLine) {
          // Dispatch accumulated event.
          try {
            const payload = JSON.parse(dataLine) as {
              text?: string;
              message?: string;
              exit_code?: number;
              timed_out?: boolean;
            };
            const chunk = payload.text ?? payload.message;
            if (eventType === "stdout" && chunk) {
              result.stdout += chunk;
            } else if (eventType === "stderr" && chunk) {
              result.stderr += chunk;
            } else if (eventType === "terminal") {
              result.exitCode = payload.exit_code ?? null;
              result.timedOut = payload.timed_out ?? false;
              return result;
            }
          } catch {
            // Ignore malformed SSE data lines.
          }
          eventType = "";
          dataLine = "";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return result;
}

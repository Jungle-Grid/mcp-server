import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import * as client from "./client.js";
import type { GatewayConfig } from "./config.js";

type ToolArgs = Record<string, unknown>;
type HandlerExtra = RequestHandlerExtra<never, never>;

const WORKLOAD_ENUM = ["inference", "training", "fine_tuning", "batch"];
const ROUTING_MODE_ENUM = ["cost", "speed", "balanced"];

function result(summary: string, raw: unknown): CallToolResult {
  return {
    content: [{ type: "text" as const, text: summary }],
    structuredContent: { data: raw },
  };
}

function errorResult(toolName: string, err: unknown): CallToolResult {
  return {
    content: [{ type: "text" as const, text: formatToolError(toolName, err) }],
    isError: true,
  };
}

export function formatToolError(toolName: string, err: unknown): string {
  if (err instanceof client.JungleGridApiError) {
    return `${toolName} failed: ${err.code}: ${err.message}`;
  }
  const detail = err instanceof Error && err.message
    ? err.message
    : typeof err === "string" && err.trim()
      ? err.trim()
      : "unknown error";
  return `${toolName} failed: ${detail}`;
}

export function resolveBearerToken(
  config: Pick<GatewayConfig, "internalServiceToken" | "legacyApiKey">,
  extra?: Pick<HandlerExtra, "authInfo" | "requestInfo">,
): string {
  const incoming = bearerFromExtra(extra);
  if (incoming) return incoming;
  if (config.internalServiceToken) return config.internalServiceToken;
  if (config.legacyApiKey) return config.legacyApiKey;
  throw new Error("Authentication is required. Provide a Bearer token or configure JUNGLEGRID_INTERNAL_SERVICE_TOKEN.");
}

function bearerFromExtra(extra?: Pick<HandlerExtra, "authInfo" | "requestInfo">): string | undefined {
  if (extra?.authInfo?.token?.trim()) return extra.authInfo.token.trim();

  const headers = extra?.requestInfo?.headers;
  const authorization = headers?.get("authorization") ?? headers?.get("Authorization");
  if (!authorization) return undefined;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

function apiClient(config: GatewayConfig, extra: HandlerExtra): client.JungleGridClient {
  return client.createJungleGridClient(config.apiBase, resolveBearerToken(config, extra));
}

function optionalString(args: ToolArgs, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${key} must be a string.`);
  const trimmed = value.trim();
  return trimmed || undefined;
}

function requiredString(args: ToolArgs, key: string): string {
  const value = optionalString(args, key);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function optionalNumber(args: ToolArgs, key: string): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} must be a finite number.`);
  return value;
}

function optionalStringArray(args: ToolArgs, key: string): string[] | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error(`${key} must be an array of strings.`);
  return value.map((item) => {
    if (typeof item !== "string") throw new Error(`${key} must contain only strings.`);
    return item;
  });
}

function optionalStringRecord(args: ToolArgs, key: string): Record<string, string> | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${key} must be an object with string values.`);
  }

  const output: Record<string, string> = {};
  for (const [recordKey, recordValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof recordValue !== "string") throw new Error(`${key}.${recordKey} must be a string.`);
    output[recordKey] = recordValue;
  }
  return output;
}

function optionalRecord(args: ToolArgs, key: string): Record<string, unknown> | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${key} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function enumValue(args: ToolArgs, key: string, allowed: string[], required = false): string | undefined {
  const value = optionalString(args, key);
  if (!value) {
    if (required) throw new Error(`${key} is required.`);
    return undefined;
  }
  if (!allowed.includes(value)) {
    throw new Error(`${key} must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}

function toApiWorkload(workload: string): string {
  return workload === "fine_tuning" ? "fine-tuning" : workload;
}

export function buildEstimateInput(args: ToolArgs): Record<string, unknown> {
  const workload = enumValue(args, "workload", WORKLOAD_ENUM, true) as string;
  const input: Record<string, unknown> = {
    workload_type: toApiWorkload(workload),
  };
  copyIfDefined(input, "model_size_gb", optionalNumber(args, "model_size"));
  copyIfDefined(input, "image", optionalString(args, "image"));
  copyIfDefined(input, "command", optionalString(args, "command"));
  copyIfDefined(input, "args", optionalStringArray(args, "args"));
  copyIfDefined(input, "optimize_for", enumValue(args, "routing_mode", ROUTING_MODE_ENUM));
  copyIfDefined(input, "template", optionalString(args, "template"));
  copyIfDefined(input, "notes", optionalString(args, "notes"));
  return input;
}

export function buildSubmitInput(args: ToolArgs): Record<string, unknown> {
  const workload = enumValue(args, "workload", WORKLOAD_ENUM, true) as string;
  const input: Record<string, unknown> = {
    name: requiredString(args, "name"),
    workload_type: toApiWorkload(workload),
    image: requiredString(args, "image"),
  };
  copyIfDefined(input, "command", optionalString(args, "command"));
  copyIfDefined(input, "args", optionalStringArray(args, "args"));
  copyIfDefined(input, "environment", optionalStringRecord(args, "env"));
  copyIfDefined(input, "optimize_for", enumValue(args, "routing_mode", ROUTING_MODE_ENUM));
  copyIfDefined(input, "template", optionalString(args, "template"));
  copyIfDefined(input, "metadata", optionalRecord(args, "metadata"));
  return input;
}

function copyIfDefined(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined) target[key] = value;
}

function numberInRange(args: ToolArgs, key: string, defaultValue: number, max: number): number {
  const value = optionalNumber(args, key);
  if (value === undefined) return defaultValue;
  if (value <= 0) throw new Error(`${key} must be greater than 0.`);
  return Math.min(Math.floor(value), max);
}

function estimateSummary(data: unknown): string {
  const record = objectData(data);
  const cost = record.estimated_cost_usd ?? record.estimated_cost_min_usd ?? "unknown";
  const gpu = record.likely_gpu_type ?? record.routed_gpu_tier ?? "best available route";
  const available = record.available === false ? "not currently available" : "available";
  return `Estimate ${available}. Likely route: ${String(gpu)}. Estimated cost: ${String(cost)} USD.`;
}

function submitSummary(data: unknown): string {
  const record = objectData(data);
  const id = record.job_id ?? record.id ?? "unknown";
  const status = record.status ?? "submitted";
  return `Job submitted and real compute may start. id=${String(id)} status=${String(status)}.`;
}

function jobSummary(data: unknown): string {
  const record = objectData(data);
  const id = record.job_id ?? record.id ?? "unknown";
  const status = record.status ?? "unknown";
  return `Job ${String(id)} is ${String(status)}.`;
}

function logsSummary(data: unknown): string {
  const record = objectData(data);
  const items = Array.isArray(record.items) ? record.items.length : 0;
  const next = record.next_cursor !== undefined ? ` next_cursor=${String(record.next_cursor)}.` : "";
  return `Fetched ${items} log entr${items === 1 ? "y" : "ies"}.${next}`;
}

function cancelSummary(data: unknown, jobId: string): string {
  const record = objectData(data);
  const status = record.status ? ` status=${String(record.status)}.` : "";
  return `Cancellation requested for job ${jobId}.${status}`;
}

function artifactsSummary(data: unknown): string {
  const record = objectData(data);
  const artifacts = Array.isArray(record.artifacts) ? record.artifacts.length : 0;
  return `Found ${artifacts} artifact${artifacts === 1 ? "" : "s"}.`;
}

function artifactSummary(data: unknown): string {
  const record = objectData(data);
  const artifact = objectData(record.artifact);
  const filename = artifact.filename ?? "artifact";
  return `Created a temporary download URL for ${String(filename)}.`;
}

function objectData(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
}

export const TOOLS = [
  {
    name: "estimate_job",
    description:
      "Read-only. Estimate or prepare the best Jungle Grid workload execution plan by calling the Jungle Grid API.",
    inputSchema: {
      type: "object",
      properties: {
        workload: { type: "string", enum: WORKLOAD_ENUM },
        model_size: { type: "number", description: "Optional model size in GB." },
        image: { type: "string" },
        command: { type: "string" },
        args: { type: "array", items: { type: "string" } },
        routing_mode: { type: "string", enum: ROUTING_MODE_ENUM },
        template: { type: "string" },
        notes: { type: "string" },
      },
      required: ["workload"],
    },
  },
  {
    name: "submit_job",
    description:
      "Starts a real Jungle Grid workload for execution. This may launch real compute and may cost money. Use estimate_job first when cost is uncertain.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        workload: { type: "string", enum: WORKLOAD_ENUM },
        image: { type: "string" },
        command: { type: "string" },
        args: { type: "array", items: { type: "string" } },
        env: { type: "object", additionalProperties: { type: "string" } },
        routing_mode: { type: "string", enum: ROUTING_MODE_ENUM },
        template: { type: "string" },
        metadata: { type: "object" },
      },
      required: ["name", "workload", "image"],
    },
  },
  {
    name: "get_job",
    description: "Read-only. Get the current state of a Jungle Grid job.",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
    },
  },
  {
    name: "get_job_logs",
    description: "Read-only. Fetch recent logs for a Jungle Grid job.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        limit: { type: "number" },
        cursor: { type: "string" },
      },
      required: ["jobId"],
    },
  },
  {
    name: "cancel_job",
    description:
      "Requests cancellation of a real Jungle Grid job. This is a real action that may stop running compute.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        reason: { type: "string" },
      },
      required: ["jobId"],
    },
  },
  {
    name: "list_artifacts",
    description: "Read-only. List managed artifacts uploaded for a Jungle Grid job.",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
    },
  },
  {
    name: "get_artifact",
    description: "Read-only. Create a temporary signed download URL for a Jungle Grid job artifact.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        artifactId: { type: "string" },
      },
      required: ["jobId", "artifactId"],
    },
  },
];

export function registerTools(server: Server, config: GatewayConfig): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
    const args = (req.params.arguments ?? {}) as ToolArgs;
    const toolName = req.params.name;

    try {
      const api = apiClient(config, extra as HandlerExtra);
      switch (toolName) {
      case "estimate_job": {
        const data = await api.estimateJob(buildEstimateInput(args));
        return result(estimateSummary(data), data);
      }
      case "submit_job": {
        const data = await api.submitJob(buildSubmitInput(args));
        return result(submitSummary(data), data);
      }
      case "get_job": {
        const data = await api.getJob(requiredString(args, "jobId"));
        return result(jobSummary(data), data);
      }
      case "get_job_logs": {
        const data = await api.getJobLogs(requiredString(args, "jobId"), {
          limit: numberInRange(args, "limit", 100, 1000),
          cursor: optionalString(args, "cursor"),
        });
        return result(logsSummary(data), data);
      }
      case "cancel_job": {
        const jobId = requiredString(args, "jobId");
        const data = await api.cancelJob(jobId, optionalString(args, "reason"));
        return result(cancelSummary(data, jobId), data);
      }
      case "list_artifacts": {
        const data = await api.listArtifacts(requiredString(args, "jobId"));
        return result(artifactsSummary(data), data);
      }
      case "get_artifact": {
        const data = await api.getArtifact(
          requiredString(args, "jobId"),
          requiredString(args, "artifactId"),
        );
        return result(artifactSummary(data), data);
      }
      default:
        throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      if (TOOLS.some((tool) => tool.name === toolName)) return errorResult(toolName, err);
      throw err;
    }
  });
}

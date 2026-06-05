import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { hasScope, TOOL_SCOPES, type McpAuthContext } from "./auth.js";
import * as client from "./client.js";
import type { GatewayConfig } from "./config.js";

type JsonSchema = Record<string, unknown>;
type ToolArgs = Record<string, unknown>;
type HandlerExtra = RequestHandlerExtra<never, never>;

const WORKLOAD_ENUM = ["inference", "training", "fine_tuning", "batch"];
const ROUTING_MODE_ENUM = ["cost", "speed", "balanced"];

const costRangeSchema = objectSchema({
  min: { type: "number" },
  max: { type: "number" },
}, ["min", "max"]);

const nullableNumberSchema = { anyOf: [{ type: "number" }, { type: "null" }] };
const nullableBooleanSchema = { anyOf: [{ type: "boolean" }, { type: "null" }] };
const nullableStringSchema = { anyOf: [{ type: "string" }, { type: "null" }] };
const commandArraySchema = { type: "array", items: { type: "string" } };
const inputReferenceSchema = objectSchema({ input_id: { type: "string" } }, ["input_id"]);

const estimateOutputSchema = wrappedDataSchema(objectSchema({
  classification: objectSchema({
    workload_type: { type: "string" },
    requires_gpu: { type: "boolean" },
    acceleration_requirement: { type: "string" },
    confidence: { type: "string" },
    reasons: { type: "array", items: { type: "string" } },
  }),
  routing: objectSchema({
    route_status: { type: "string" },
    selected_accelerator: { type: "string" },
    selected_route_source: { type: "string" },
    selection_reason: { type: "string" },
  }),
  capacity: objectSchema({
    live_capacity_available: { type: "boolean" },
    live_candidate_count: { type: "number" },
    managed_capacity_available: nullableBooleanSchema,
    managed_profile_count: { type: "number" },
    estimate_source: { type: "string" },
  }),
  estimated_cost_usd: costRangeSchema,
  estimated_cost_min_usd: { type: "number" },
  estimated_cost_max_usd: { type: "number" },
  can_submit: { type: "boolean" },
  screening: {},
  available: { type: "boolean" },
  likely_gpu_type: { type: "string" },
  routed_gpu_tier: { type: "string" },
}));

const submitOutputSchema = wrappedDataSchema(objectSchema({
  job_id: { type: "string" },
  id: { type: "string" },
  status: { type: "string" },
  status_message: { type: "string" },
  submitted_at: { type: "string" },
  estimated_cost_usd: costRangeSchema,
}));

const listJobsOutputSchema = wrappedDataSchema(objectSchema({
  jobs: {
    type: "array",
    items: objectSchema({
      job_id: { type: "string" },
      id: { type: "string" },
      name: { type: "string" },
      status: { type: "string" },
      workload_type: { type: "string" },
      created_at: { type: "string" },
      updated_at: { type: "string" },
    }),
  },
  limit: { type: "number" },
  next_cursor: nullableStringSchema,
  has_more: { type: "boolean" },
}));

const jobOutputSchema = wrappedDataSchema(objectSchema({
  job_id: { type: "string" },
  id: { type: "string" },
  status: { type: "string" },
  phase: { type: "string" },
  execution_phase: { type: "string" },
  status_message: { type: "string" },
  last_status_update: { type: "string" },
  phase_started_at: { type: "string" },
  phase_last_updated_at: { type: "string" },
  wait_duration_seconds: { type: "number" },
  delayed_start: { type: "boolean" },
  delay_reason: objectSchema({
    code: { type: "string" },
    message: { type: "string" },
  }),
  scheduling: {},
  estimated_cost_usd: costRangeSchema,
  actual_cost_usd: nullableNumberSchema,
  artifacts_ready: { type: "boolean" },
  account_billing: objectSchema({
    lifetime_total_spent_usd: { type: "number" },
  }),
}));

const eventsOutputSchema = wrappedDataSchema(objectSchema({
  job_id: { type: "string" },
  status: { type: "string" },
  phase: { type: "string" },
  items: {
    type: "array",
    items: objectSchema({
      id: { type: "string" },
      type: { type: "string" },
      phase: { type: "string" },
      title: { type: "string" },
      message: { type: "string" },
      source: { type: "string" },
      level: { type: "string" },
      created_at: { type: "string" },
    }, ["id", "title", "message", "created_at"]),
  },
}));

const logsOutputSchema = wrappedDataSchema(objectSchema({
  job_id: { type: "string" },
  logs: {
    type: "array",
    items: objectSchema({
      timestamp: { type: "string" },
      level: { type: "string" },
      message: { type: "string" },
    }, ["message"]),
  },
  items: {
    type: "array",
    items: objectSchema({
      timestamp: { type: "string" },
      level: { type: "string" },
      message: { type: "string" },
    }),
  },
  next_cursor: nullableStringSchema,
  has_more: { type: "boolean" },
  failure_highlight: { type: "string" },
  usage_hint: { type: "string" },
}));

const cancelOutputSchema = wrappedDataSchema(objectSchema({
  job_id: { type: "string" },
  id: { type: "string" },
  status: { type: "string" },
  cancelled: { type: "boolean" },
  message: { type: "string" },
}));

const artifactsOutputSchema = wrappedDataSchema(objectSchema({
  job_id: { type: "string" },
  artifacts: {
    type: "array",
    items: objectSchema({
      name: { type: "string" },
      filename: { type: "string" },
      artifact_id: { type: "string" },
      id: { type: "string" },
      status: { type: "string" },
      ready: { type: "boolean" },
      size_bytes: nullableNumberSchema,
      mime_type: { type: "string" },
    }),
  },
}));

const jobInputsOutputSchema = wrappedDataSchema(objectSchema({
  inputs: {
    type: "array",
    items: objectSchema({
      input_id: { type: "string" },
      filename: { type: "string" },
      content_type: { type: "string" },
      size_bytes: nullableNumberSchema,
      kind: { type: "string" },
      status: { type: "string" },
      ready: { type: "boolean" },
      mount_path: { type: "string" },
    }),
  },
}));

const jobInputUploadOutputSchema = wrappedDataSchema(objectSchema({
  upload: objectSchema({
    input_id: { type: "string" },
    filename: { type: "string" },
    method: { type: "string" },
    upload_url: { type: "string" },
    token: { type: "string" },
    expires_at: { type: "string" },
    complete_url: { type: "string" },
  }),
}));

const artifactOutputSchema = wrappedDataSchema(objectSchema({
  job_id: { type: "string" },
  artifact_name: { type: "string" },
  artifact_id: { type: "string" },
  ready: { type: "boolean" },
  size_bytes: nullableNumberSchema,
  mime_type: { type: "string" },
  download_url: { type: "string" },
  expires_at: { type: "string" },
  artifact: objectSchema({
    name: { type: "string" },
    filename: { type: "string" },
    artifact_id: { type: "string" },
    id: { type: "string" },
    status: { type: "string" },
    ready: { type: "boolean" },
    size_bytes: nullableNumberSchema,
    mime_type: { type: "string" },
  }),
}));

function objectSchema(properties: Record<string, JsonSchema>, required?: string[]): JsonSchema {
  return {
    type: "object",
    properties,
    ...(required ? { required } : {}),
    additionalProperties: true,
  };
}

function wrappedDataSchema(dataSchema: JsonSchema): JsonSchema {
  return objectSchema({ data: dataSchema }, ["data"]);
}

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
  const rawAuthorization = headers?.authorization ?? headers?.Authorization;
  const authorization = Array.isArray(rawAuthorization) ? rawAuthorization[0] : rawAuthorization;
  if (!authorization) return undefined;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

function apiClient(config: GatewayConfig, extra: HandlerExtra, auth?: McpAuthContext): client.JungleGridClient {
  return client.createJungleGridClient(config.apiBase, auth?.token ?? resolveBearerToken(config, extra));
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

function workloadTypeValue(args: ToolArgs, required = false): string | undefined {
  const canonical = enumValue(args, "workload_type", WORKLOAD_ENUM, false);
  if (canonical) return canonical;
  const legacy = enumValue(args, "workload", WORKLOAD_ENUM, false);
  if (legacy) return legacy;
  if (required) throw new Error("workload_type is required.");
  return undefined;
}

function commandValue(args: ToolArgs): string[] | string | undefined {
  const value = args.command;
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return optionalStringArray(args, "command");
  if (typeof value === "string") return optionalString(args, "command");
  throw new Error("command must be an array of strings.");
}

function inputReferenceArray(args: ToolArgs, key: string): Array<{ input_id: string }> | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error(`${key} must be an array of { input_id } objects.`);
  return value.map((item) => {
    if (typeof item === "string") {
      const inputID = item.trim();
      if (!inputID) throw new Error(`${key} items must include input_id.`);
      return { input_id: inputID };
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${key} must be an array of { input_id } objects.`);
    }
    const inputID = optionalString(item as ToolArgs, "input_id");
    if (!inputID) throw new Error(`${key} items must include input_id.`);
    return { input_id: inputID };
  });
}

export function buildEstimateInput(args: ToolArgs): Record<string, unknown> {
  const workload = workloadTypeValue(args, true) as string;
  const input: Record<string, unknown> = {
    workload_type: toApiWorkload(workload),
  };
  copyIfDefined(input, "model_size_gb", optionalNumber(args, "model_size"));
  copyIfDefined(input, "image", optionalString(args, "image"));
  copyIfDefined(input, "command", commandValue(args));
  copyIfDefined(input, "args", optionalStringArray(args, "args"));
  copyIfDefined(input, "optimize_for", enumValue(args, "routing_mode", ROUTING_MODE_ENUM));
  copyIfDefined(input, "template", optionalString(args, "template"));
  copyIfDefined(input, "notes", optionalString(args, "notes"));
  return input;
}

export function buildSubmitInput(args: ToolArgs): Record<string, unknown> {
  const workload = workloadTypeValue(args, true) as string;
  const input: Record<string, unknown> = {
    name: requiredString(args, "name"),
    workload_type: toApiWorkload(workload),
    image: requiredString(args, "image"),
  };
  copyIfDefined(input, "command", commandValue(args));
  copyIfDefined(input, "args", optionalStringArray(args, "args"));
  copyIfDefined(input, "environment", optionalStringRecord(args, "env"));
  copyIfDefined(input, "input_files", inputReferenceArray(args, "input_files"));
  copyIfDefined(input, "script_files", inputReferenceArray(args, "script_files"));
  copyIfDefined(input, "script_file", optionalString(args, "script_file"));
  copyIfDefined(input, "expected_artifacts", optionalStringArray(args, "expected_artifacts"));
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

function listJobsSummary(data: unknown): string {
  const record = objectData(data);
  const jobs = Array.isArray(record.jobs) ? record.jobs.length : 0;
  const next = record.next_cursor !== undefined ? ` next_cursor=${String(record.next_cursor)}.` : "";
  return `Found ${jobs} Jungle Grid job${jobs === 1 ? "" : "s"}.${next}`;
}

function jobSummary(data: unknown): string {
  const record = objectData(data);
  const id = record.job_id ?? record.id ?? "unknown";
  const status = record.status ?? "unknown";
  const phase = record.execution_phase ?? record.phase;
  const delay = objectData(record.delay_reason);
  const delayed = record.delayed_start === true && delay.message
    ? ` Delayed in current phase: ${String(delay.message)}`
    : "";
  const timing = record.phase_started_at
    ? ` phase_started_at=${String(record.phase_started_at)}${record.phase_last_updated_at ? ` phase_last_updated_at=${String(record.phase_last_updated_at)}` : ""}`
    : "";
  return `Job ${String(id)} is ${String(status)}${phase ? ` (${String(phase)})` : ""}.${timing}${delayed}`;
}

function eventsSummary(data: unknown): string {
  const record = objectData(data);
  const items = Array.isArray(record.items) ? record.items.length : 0;
  const latest = Array.isArray(record.items) && record.items.length > 0
    ? objectData(record.items[record.items.length - 1])
    : {};
  const suffix = latest.title ? ` Latest: ${String(latest.title)}.` : "";
  return `Fetched ${items} lifecycle event${items === 1 ? "" : "s"}.${suffix}`;
}

function logsSummary(data: unknown): string {
  const record = objectData(data);
  const items = Array.isArray(record.items) ? record.items.length : 0;
  const next = record.next_cursor !== undefined ? ` next_cursor=${String(record.next_cursor)}.` : "";
  const hint = typeof record.usage_hint === "string" && record.usage_hint ? ` ${record.usage_hint}` : "";
  return `Fetched ${items} log entr${items === 1 ? "y" : "ies"}.${next}${hint}`;
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

function jobInputUploadSummary(data: unknown): string {
  const record = objectData(data);
  const upload = objectData(record.upload);
  const id = upload.input_id ?? "unknown";
  const filename = upload.filename ?? "input";
  return `Created upload slot for ${String(filename)}. input_id=${String(id)}.`;
}

function jobInputsSummary(data: unknown): string {
  const record = objectData(data);
  const inputs = Array.isArray(record.inputs) ? record.inputs.length : 0;
  return `Found ${inputs} uploaded job input${inputs === 1 ? "" : "s"}.`;
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

function normalizeJobStatusResponse(data: unknown): unknown {
  const record = objectData(data);
  if (Object.keys(record).length === 0) return data;

  const normalized: Record<string, unknown> = { ...record };
  delete normalized.total_spent_usd;

  const billing = objectData(record.billing);
  if (Object.keys(billing).length > 0) {
    const normalizedBilling: Record<string, unknown> = { ...billing };
    delete normalizedBilling.total_spent_usd;

    if (typeof normalizedBilling.actual_cost_usd !== "number") {
      if (typeof billing.final_cost_usd === "number") {
        normalizedBilling.actual_cost_usd = billing.final_cost_usd;
      } else if (typeof billing.cost_usd === "number") {
        normalizedBilling.actual_cost_usd = billing.cost_usd;
      }
    }
    delete normalizedBilling.cost_usd;
    normalized.billing = normalizedBilling;

    if (typeof normalized.actual_cost_usd !== "number") {
      normalized.actual_cost_usd = typeof normalizedBilling.actual_cost_usd === "number"
        ? normalizedBilling.actual_cost_usd
        : null;
    }
  } else if (!Object.prototype.hasOwnProperty.call(normalized, "actual_cost_usd")) {
    normalized.actual_cost_usd = null;
  }

  return normalized;
}

export const TOOLS = [
  {
    name: "estimate_job",
    description:
      "Estimate routing, capacity source, and expected cost for a proposed Jungle Grid workload without submitting it.",
    inputSchema: {
      type: "object",
      properties: {
        workload_type: { type: "string", enum: WORKLOAD_ENUM },
        model_size: { type: "number", description: "Optional model size in GB." },
        image: { type: "string" },
        command: commandArraySchema,
        args: { type: "array", items: { type: "string" } },
        routing_mode: { type: "string", enum: ROUTING_MODE_ENUM },
        template: { type: "string" },
        notes: { type: "string" },
      },
      required: ["workload_type"],
    },
    outputSchema: estimateOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "submit_job",
    description:
      "Submit a Jungle Grid workload for execution. This may start managed compute infrastructure and incur usage charges.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        workload_type: { type: "string", enum: WORKLOAD_ENUM },
        image: { type: "string" },
        command: commandArraySchema,
        args: { type: "array", items: { type: "string" } },
        env: { type: "object", additionalProperties: { type: "string" } },
        input_files: {
          type: "array",
          items: inputReferenceSchema,
          description: "Uploaded input references to mount under /workspace/inputs/<filename>.",
        },
        script_files: {
          type: "array",
          items: inputReferenceSchema,
          description: "Uploaded script references to mount under /workspace/scripts/<filename>.",
        },
        expected_artifacts: {
          type: "array",
          items: { type: "string" },
          description: "Expected output files under /workspace/artifacts.",
        },
        routing_mode: { type: "string", enum: ROUTING_MODE_ENUM },
        template: { type: "string" },
        metadata: { type: "object" },
      },
      required: ["name", "workload_type", "image"],
    },
    outputSchema: submitOutputSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  {
    name: "upload_job_input",
    description:
      "Create a managed upload slot for an input file or script. Upload bytes to upload_url with HTTP PUT, complete the upload through complete_url, then pass input_id to submit_job.",
    inputSchema: {
      type: "object",
      properties: {
        filename: { type: "string" },
        content_type: { type: "string" },
        kind: { type: "string", enum: ["input", "script"] },
      },
      required: ["filename"],
    },
    outputSchema: jobInputUploadOutputSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  {
    name: "list_job_inputs",
    description: "List uploaded job inputs for the authenticated account, including mount paths.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    outputSchema: jobInputsOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "list_jobs",
    description: "List the authenticated user's Jungle Grid jobs, optionally filtered by status. Use this to find recent jobs before checking status, logs, or artifacts.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", default: 10 },
        cursor: { type: "string" },
        status: { type: "string" },
      },
    },
    outputSchema: listJobsOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "get_job",
    description: "Retrieve current status, execution phase, stable phase-entry timing, latest provider/platform update timing, scheduling delay, routing, failure, and artifact contract details for a specific Jungle Grid job. phase_started_at is when the job first entered the current normalized phase; phase_last_updated_at is later provider/platform progress or heartbeat when present; delayed_start identifies a prolonged wait in the actual current phase. A supported estimate does not guarantee immediate or successful runtime startup.",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
    },
    outputSchema: jobOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "get_job_events",
    description: "Retrieve platform lifecycle events for a job, including scheduling and startup events that can appear before workload logs exist.",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
    },
    outputSchema: eventsOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "get_job_logs",
    description: "Retrieve paginated workload logs for a job. If logs are empty while a job is queued/starting, call get_job_events for platform scheduling events.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        limit: { type: "number" },
        cursor: { type: "string" },
      },
      required: ["jobId"],
    },
    outputSchema: logsOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "cancel_job",
    description:
      "Cancel an existing Jungle Grid job. This may stop active execution and prevent further outputs.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        reason: { type: "string" },
      },
      required: ["jobId"],
    },
    outputSchema: cancelOutputSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
  },
  {
    name: "list_artifacts",
    description: "List output artifacts associated with a specific Jungle Grid job.",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
    },
    outputSchema: artifactsOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "get_artifact",
    description: "Retrieve download information for a specific output artifact from a Jungle Grid job.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        artifactId: { type: "string" },
      },
      required: ["jobId", "artifactId"],
    },
    outputSchema: artifactOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
];

export function registerTools(server: Server, config: GatewayConfig, auth?: McpAuthContext): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
    const args = (req.params.arguments ?? {}) as ToolArgs;
    const toolName = req.params.name;

    try {
      if (auth) {
        const requiredScope = TOOL_SCOPES[toolName];
        if (!requiredScope) throw new Error(`Tool is not available with OAuth: ${toolName}`);
        if (!hasScope(auth, requiredScope)) {
          throw new client.JungleGridApiError(403, "FORBIDDEN", `OAuth token missing required scope: ${requiredScope}`);
        }
      }
      const api = apiClient(config, extra as HandlerExtra, auth);
      switch (toolName) {
      case "estimate_job": {
        const data = await api.estimateJob(buildEstimateInput(args));
        return result(estimateSummary(data), data);
      }
      case "submit_job": {
        const data = await api.submitJob(buildSubmitInput(args));
        return result(submitSummary(data), data);
      }
      case "upload_job_input": {
        const data = await api.uploadJobInput({
          filename: requiredString(args, "filename"),
          content_type: optionalString(args, "content_type"),
          kind: optionalString(args, "kind"),
        });
        return result(jobInputUploadSummary(data), data);
      }
      case "list_job_inputs": {
        const data = await api.listJobInputs();
        return result(jobInputsSummary(data), data);
      }
      case "list_jobs": {
        const data = await api.listJobs({
          limit: numberInRange(args, "limit", 10, 100),
          cursor: optionalString(args, "cursor"),
          status: optionalString(args, "status"),
        });
        return result(listJobsSummary(data), data);
      }
      case "get_job": {
        const data = normalizeJobStatusResponse(await api.getJob(requiredString(args, "jobId")));
        return result(jobSummary(data), data);
      }
      case "get_job_events": {
        const data = await api.getJobEvents(requiredString(args, "jobId"));
        return result(eventsSummary(data), data);
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

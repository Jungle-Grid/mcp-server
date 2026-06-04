import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import * as client from "./client.js";
import type { JobScreening, SubmitJobInput } from "./types.js";

const { gpuNames } = require("@jungle-grid/gpu-registry") as { gpuNames: string[] };
const GPU_TYPE_ENUM = [...gpuNames];

function text(content: string): CallToolResult {
  return { content: [{ type: "text" as const, text: content }] };
}

export function formatToolError(toolName: string, err: unknown): string {
  const detail = err instanceof Error && err.message
    ? err.message
    : typeof err === "string" && err.trim()
      ? err.trim()
      : "unknown error";
  return `${toolName} failed: ${detail}`;
}

function errorText(toolName: string, err: unknown): CallToolResult {
  return {
    ...text(formatToolError(toolName, err)),
    isError: true,
  };
}

function formatScreening(screening?: JobScreening): string {
  if (!screening) return "";
  const checks = screening.checks.length > 0
    ? screening.checks.map((check) => {
        const field = check.field ? ` (${check.field})` : "";
        const action = check.action ? ` action: ${check.action}` : "";
        return `- ${check.severity}/${check.status} ${check.code}${field}: ${check.message}${action}`;
      }).join("\n")
    : "- info/passed SCREENING_PASSED: No blocking pre-run issues were detected.";
  return `\npre_run_checks:   ${screening.status}\ncan_submit:       ${screening.can_submit}\nchecks:\n${checks}`;
}

function formatJob(job: {
  job_id: string;
  status: string;
  workload_type?: string;
  image?: string;
  gpu_type?: string;
  gpu_class?: string;
  region_preference?: string;
  region_mode?: string;
  constraints_relaxed?: boolean;
  reasoning?: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  status_reason?: string;
  execution_route?: string;
  requested_route?: string;
  initial_route?: string;
  effective_route?: string;
  route_status?: string;
  route_reason?: string;
  failure?: { code?: string; summary?: string; stage?: string; log_excerpt?: string };
}): string {
  const lines = [
    `id:               ${job.job_id}`,
    `status:           ${job.status}`,
    `workload_type:    ${job.workload_type ?? "-"}`,
  ];
  if (job.image) lines.push(`image:            ${job.image}`);
  if (job.gpu_type) lines.push(`gpu_type:         ${job.gpu_type}`);
  if (job.gpu_class) lines.push(`gpu_class:        ${job.gpu_class}`);
  if (job.region_preference) lines.push(`region:           ${job.region_preference}`);
  if (job.region_mode) lines.push(`region_mode:      ${job.region_mode}`);
  if (job.constraints_relaxed !== undefined)
    lines.push(`constraints_relaxed: ${job.constraints_relaxed}`);
  if (job.reasoning) lines.push(`scheduling:       ${job.reasoning}`);
  if (job.execution_route || job.effective_route) lines.push(`route:            requested=${job.requested_route ?? "-"} initial=${job.initial_route ?? "-"} effective=${job.effective_route ?? job.execution_route ?? "-"}`);
  if (job.route_status) lines.push(`route_status:     ${job.route_status}`);
  if (job.route_reason) lines.push(`route_reason:     ${job.route_reason}`);
  if (job.created_at) lines.push(`created_at:       ${job.created_at}`);
  if (job.started_at) lines.push(`started_at:       ${job.started_at}`);
  if (job.completed_at) lines.push(`completed_at:     ${job.completed_at}`);
  if (job.status_reason) lines.push(`reason:           ${job.status_reason}`);
  if (job.failure?.summary) lines.push(`failure:          ${job.failure.code ?? "JOB_FAILED"} (${job.failure.stage ?? "unknown"}): ${job.failure.summary}`);
  if (job.failure?.log_excerpt) lines.push(`failure_excerpt:  ${job.failure.log_excerpt}`);
  return lines.join("\n");
}

function normalizeCommand(value: unknown): { command: string; args: string[] | undefined } {
  if (!Array.isArray(value)) {
    throw new Error("submit_job command must be a non-empty array of strings.");
  }

  const parts = value.map((item) => {
    if (typeof item !== "string") {
      throw new Error("submit_job command must contain only strings.");
    }
    return item.trim();
  }).filter((item) => item !== "");

  if (parts.length === 0) {
    throw new Error("submit_job command must be a non-empty array of strings.");
  }

  return {
    command: parts[0],
    args: parts.length > 1 ? parts.slice(1) : undefined,
  };
}

function defaultJobName(workloadType: unknown): string {
  const workload = typeof workloadType === "string" && workloadType.trim() !== ""
    ? workloadType.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-")
    : "job";
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `mcp-${workload}-${timestamp}`;
}

export function buildSubmitJobInput(args: Record<string, unknown>): SubmitJobInput {
  const command = normalizeCommand(args.command);
  const constraints = {
    gpu_type: args.gpu_type as string | undefined,
    gpu_class: args.gpu_class as SubmitJobInput["constraints"] extends infer C
      ? C extends { gpu_class?: infer G }
        ? G
        : never
      : never,
    region_preference: args.region_preference as string | undefined,
    region_mode: args.region_mode as SubmitJobInput["constraints"] extends infer C
      ? C extends { region_mode?: infer R }
        ? R
        : never
      : never,
    latency_priority: args.latency_priority as SubmitJobInput["latency_priority"],
    cost_priority: args.cost_priority as SubmitJobInput["cost_priority"],
  };

  const rawName = typeof args.name === "string" ? args.name.trim() : "";
  return {
    name: rawName || defaultJobName(args.workload_type),
    workload_type: args.workload_type as SubmitJobInput["workload_type"],
    image: args.image as string,
    command: command.command,
    args: command.args,
    model_size_gb: args.model_size_gb as number | undefined,
    disk_gb: args.disk_gb as number | undefined,
    optimize_for: args.optimize_for as SubmitJobInput["optimize_for"],
    latency_priority: args.latency_priority as SubmitJobInput["latency_priority"],
    cost_priority: args.cost_priority as SubmitJobInput["cost_priority"],
    environment: args.environment as Record<string, string> | undefined,
    huggingface_credential_id: args.huggingface_credential_id as string | undefined,
    webhook_url: args.webhook_url as string | undefined,
    input_files: Array.isArray(args.input_files) ? args.input_files as string[] : undefined,
    script_file: args.script_file as string | undefined,
    expected_artifacts: Array.isArray(args.expected_artifacts) ? args.expected_artifacts as string[] : undefined,
    constraints:
      Object.values(constraints).some((value) => value !== undefined && value !== "")
        ? constraints
        : undefined,
  };
}

export const TOOLS = [
  {
    name: "submit_job",
    description:
      "Submit a GPU workload to Jungle Grid. Returns a job_id immediately — the job runs asynchronously. " +
      "Combined args are limited to 4096 characters; upload larger scripts with upload_job_input kind=script and pass script_file. " +
      "After submitting, prefer stream_job_logs for real-time output, then use get_job or get_job_logs for final status and logs. " +
      "Managed jobs automatically upload regular files written under /workspace/artifacts as Jungle Grid artifacts. " +
      "Use estimate_job first if you want a cost estimate before committing.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Optional readable job name. A name is generated if omitted.",
        },
        workload_type: {
          type: "string",
          enum: ["inference", "training", "fine-tuning", "batch"],
          description: "Type of GPU workload.",
        },
        image: {
          type: "string",
          description: "Docker image to run (e.g. 'pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime').",
        },
        command: {
          type: "array",
          items: { type: "string" },
          description: "Container entrypoint arguments (e.g. ['python', '/workspace/scripts/transcribe.py']). Combined args limit: 4096 characters.",
        },
        input_files: {
          type: "array",
          items: { type: "string" },
          description: "Uploaded job input IDs to mount under /workspace/inputs/<filename>.",
        },
        script_file: {
          type: "string",
          description: "Uploaded script input ID to mount under /workspace/scripts/<filename>.",
        },
        expected_artifacts: {
          type: "array",
          items: { type: "string" },
          description: "Expected output files under /workspace/artifacts, e.g. /workspace/artifacts/transcript.txt. All regular files in /workspace/artifacts are still auto-collected.",
        },
        model_size_gb: {
          type: "number",
          description: "Approximate model size in GB. Used to select the right GPU tier for inference jobs.",
        },
        disk_gb: {
          type: "number",
          description: "Optional managed-provider local disk override in GB. Leave unset to let Jungle Grid auto-size from model_size_gb.",
        },
        optimize_for: {
          type: "string",
          enum: ["balanced", "cost", "speed"],
          description: "Scheduling optimization goal. 'speed' prioritises latency; 'cost' minimises spend.",
        },
        latency_priority: {
          type: "string",
          enum: ["low", "balanced", "high"],
          description: "Latency sensitivity. Use 'high' for real-time inference.",
        },
        cost_priority: {
          type: "string",
          enum: ["low", "balanced", "high"],
          description: "Cost sensitivity.",
        },
        gpu_type: {
          type: "string",
          enum: GPU_TYPE_ENUM,
          description: "Optional exact GPU override.",
        },
        gpu_class: {
          type: "string",
          enum: ["consumer", "datacenter"],
          description: "Optional soft GPU class preference.",
        },
        region_preference: {
          type: "string",
          description: "Optional preferred region such as us-east or eu-west.",
        },
        region_mode: {
          type: "string",
          enum: ["prefer", "strict"],
          description: "Region preference mode.",
        },
        environment: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Environment variables injected into the container. Use this for large inline scripts such as CODE when you want to keep the command array short.",
        },
        huggingface_credential_id: {
          type: "string",
          description: "Optional saved Hugging Face credential to inject into the managed runtime. Falls back to your account default when omitted.",
        },
        webhook_url: {
          type: "string",
          description: "Optional HTTPS URL to receive signed lifecycle event callbacks.",
        },
      },
      required: ["workload_type", "image", "command"],
    },
  },
  {
    name: "upload_job_input",
    description:
      "Create a managed upload slot for a file to attach to a later job. Upload bytes to upload_url with HTTP PUT, complete the upload through complete_url, then pass input_id in submit_job input_files or script_file.",
    inputSchema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Safe original filename, for example audio.ogg or transcribe.py." },
        content_type: { type: "string", description: "MIME type such as audio/ogg, audio/wav, text/x-python, or application/octet-stream." },
        kind: { type: "string", enum: ["input", "script"], description: "Use script for uploaded executable source code; scripts mount under /workspace/scripts." },
      },
      required: ["filename"],
    },
  },
  {
    name: "list_job_inputs",
    description: "List uploaded job inputs for this account, including input IDs and predictable mount paths.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_job",
    description:
      "Get the current status and full detail of a Jungle Grid job by its ID. " +
      "Poll this after submit_job to track progress. Terminal statuses are 'completed', 'failed', and 'cancelled'.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The job ID returned by submit_job." },
      },
      required: ["job_id"],
    },
  },
  {
    name: "list_jobs",
    description: "List recent Jungle Grid jobs for the authenticated user, newest first.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of jobs to return (default 20, max 100).",
        },
        status: {
          type: "string",
          enum: ["pending", "queued", "running", "completed", "failed", "cancelled"],
          description: "Filter by job status.",
        },
      },
    },
  },
  {
    name: "cancel_job",
    description: "Cancel a pending, queued, or running Jungle Grid job. Has no effect on already-terminal jobs.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The ID of the job to cancel." },
        reason: { type: "string", description: "Optional cancellation reason." },
      },
      required: ["job_id"],
    },
  },
  {
    name: "get_job_logs",
    description:
      "Retrieve the stdout and stderr output of a completed or running Jungle Grid job. " +
      "Supports cursor pagination and tail reads for long logs.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The job ID to fetch logs for." },
        cursor: { type: "number", description: "Continue after this entry ID. Use next_cursor from the previous response." },
        limit: { type: "number", description: "Maximum lines to return, 1-500. Default 100." },
        tail: { type: "number", description: "Return the latest N lines when cursor is omitted." },
      },
      required: ["job_id"],
    },
  },
  {
    name: "list_job_artifacts",
    description:
      "List managed result artifacts uploaded by a Jungle Grid job. " +
      "For managed jobs, Jungle Grid automatically uploads regular files written under /workspace/artifacts.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The job ID to inspect." },
      },
      required: ["job_id"],
    },
  },
  {
    name: "get_artifact_download_url",
    description: "Create a temporary signed download URL for a managed job artifact.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The job ID that owns the artifact." },
        artifact_id: { type: "string", description: "The artifact ID returned by list_job_artifacts." },
      },
      required: ["job_id", "artifact_id"],
    },
  },
  {
    name: "estimate_job",
    description:
      "Estimate the credit cost and GPU tier for a job before submitting it. " +
      "Use this to check affordability or compare optimize_for options before calling submit_job.",
    inputSchema: {
      type: "object",
      properties: {
        workload_type: {
          type: "string",
          enum: ["inference", "training", "fine-tuning", "batch"],
        },
        image: { type: "string", description: "Docker image to run." },
        model_size_gb: {
          type: "number",
          description: "Approximate model size in GB — drives tier selection.",
        },
        disk_gb: {
          type: "number",
          description: "Optional managed-provider local disk override in GB. Leave unset to let Jungle Grid auto-size from model_size_gb.",
        },
        optimize_for: {
          type: "string",
          enum: ["balanced", "cost", "speed"],
        },
        latency_priority: {
          type: "string",
          enum: ["low", "balanced", "high"],
        },
        cost_priority: {
          type: "string",
          enum: ["low", "balanced", "high"],
        },
        gpu_type: {
          type: "string",
          enum: GPU_TYPE_ENUM,
        },
        gpu_class: {
          type: "string",
          enum: ["consumer", "datacenter"],
        },
        region_preference: {
          type: "string",
        },
        region_mode: {
          type: "string",
          enum: ["prefer", "strict"],
        },
      },
      required: ["workload_type", "image"],
    },
  },
  {
    name: "stream_job_logs",
    description:
      "Stream live log output for a running or recently completed job. " +
      "Blocks until the job reaches a terminal state (completed/failed/cancelled) or 10 minutes elapses. " +
      "Returns the full stdout and stderr accumulated during the run. " +
      "Prefer this over get_job_logs for jobs that are actively running or when you want a real-time execution view.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: {
          type: "string",
          description: "The job ID to stream logs for.",
        },
        timeout_seconds: {
          type: "number",
          description: "Maximum seconds to wait for job completion (default 600, max 600).",
        },
      },
      required: ["job_id"],
    },
  },
];

export function registerTools(
  server: Server,
  apiKey: string,
  baseUrl: string,
): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    const toolName = req.params.name;

    try {
      switch (toolName) {
      case "submit_job": {
        const input = buildSubmitJobInput(args);
        const { webhook_url: _webhookUrl, ...estimateInput } = input;
        const estimate = await client.estimateJob(baseUrl, apiKey, estimateInput);
        if (estimate.screening && !estimate.screening.can_submit) {
          return {
            ...text(`submit_job blocked by pre-run checks.${formatScreening(estimate.screening)}`),
            isError: true,
          };
        }
        const result = await client.submitJob(baseUrl, apiKey, input);
        const freeTrialLine = result.free_inference_trial_applied
          ? `\nfree_trial:       applied (${result.free_inference_jobs_remaining ?? 0} remaining before completion)`
          : "";
        return text(
          `Job submitted.\nid:               ${result.job_id}\nstatus:           ${result.status}\nqueued_at:        ${result.queued_at}\nroute:            requested=${result.requested_route ?? "-"} initial=${result.initial_route ?? "-"} effective=${result.effective_route ?? result.execution_route ?? "-"}\nartifacts_dir:    ${result.artifact_contract?.automatic_collection_dir ?? "/workspace/artifacts"}${freeTrialLine}${formatScreening(estimate.screening)}\n\nPoll get_job with id=${result.job_id} to track progress.`,
        );
      }

      case "upload_job_input": {
        const res = await client.uploadJobInput(
          baseUrl,
          apiKey,
          args.filename as string,
          args.content_type as string | undefined,
          args.kind as string | undefined,
        );
        return text(`input_id:     ${res.upload.input_id}\nfilename:     ${res.upload.filename}\nmethod:       ${res.upload.method}\nexpires_at:   ${res.upload.expires_at}\nupload_url:   ${res.upload.upload_url}\ncomplete_url: ${res.upload.complete_url}\n\nAfter PUT upload completes, complete the upload with token and size_bytes, then pass input_id in submit_job input_files or script_file.`);
      }

      case "list_job_inputs": {
        const res = await client.listJobInputs(baseUrl, apiKey);
        if (res.inputs.length === 0) return text("No uploaded job inputs found.");
        return text(res.inputs.map((input) => `${input.input_id}  ${input.status ?? "-"}  ${input.kind ?? "input"}  ${input.mount_path ?? "-"}  ${input.size_bytes ?? 0} bytes`).join("\n"));
      }

      case "get_job": {
        const job = await client.getJob(baseUrl, apiKey, args.job_id as string);
        return text(formatJob(job));
      }

      case "list_jobs": {
        const res = await client.listJobs(
          baseUrl,
          apiKey,
          (args.limit as number | undefined) ?? 20,
          args.status as string | undefined,
        );
        if (res.jobs.length === 0) return text("No jobs found.");
        const lines = res.jobs.map(
          (j) => `${j.job_id}  ${j.status.padEnd(10)}  ${(j.workload_type ?? "-").padEnd(12)}  ${(j.created_at ?? "-")}`,
        );
        return text(`${res.jobs.length} job(s):\n\n${lines.join("\n")}`);
      }

      case "cancel_job": {
        await client.cancelJob(
          baseUrl,
          apiKey,
          args.job_id as string,
          args.reason as string | undefined,
        );
        return text(`Job ${args.job_id as string} cancellation requested.`);
      }

      case "get_job_logs": {
        const page = await client.getJobLogs(baseUrl, apiKey, args.job_id as string, args.cursor as number | undefined, args.limit as number | undefined, args.tail as number | undefined);
        const parts: string[] = [];
        if (page.failure_highlight) parts.push(`failure_highlight: ${page.failure_highlight}`);
        if (page.items.length > 0) parts.push(page.items.map((line) => `${line.entry_id} ${line.stream}: ${line.message}`).join("\n"));
        parts.push(`next_cursor: ${page.next_cursor ?? "-"}\nhas_more: ${page.has_more}`);
        if (page.usage_hint) parts.push(page.usage_hint);
        return text(parts.join("\n\n"));
      }

      case "list_job_artifacts": {
        const res = await client.listJobArtifacts(baseUrl, apiKey, args.job_id as string);
        if (res.artifacts.length === 0) return text("No managed artifacts uploaded for this job yet.");
        return text(
          res.artifacts
            .map((artifact) => `${artifact.artifact_id}  ${artifact.status}  ${artifact.filename}  ${artifact.size_bytes} bytes`)
            .join("\n"),
        );
      }

      case "get_artifact_download_url": {
        const res = await client.getJobArtifactDownloadURL(
          baseUrl,
          apiKey,
          args.job_id as string,
          args.artifact_id as string,
        );
        return text(
          `artifact_id: ${res.artifact.artifact_id}\nfilename:    ${res.artifact.filename}\nexpires_at:  ${res.expires_at}\nurl:         ${res.url}`,
        );
      }

      case "estimate_job": {
        const est = await client.estimateJob(baseUrl, apiKey, {
          workload_type: args.workload_type as SubmitJobInput["workload_type"],
          image: args.image as string,
          model_size_gb: args.model_size_gb as number | undefined,
          disk_gb: args.disk_gb as number | undefined,
          optimize_for: args.optimize_for as SubmitJobInput["optimize_for"],
          latency_priority: args.latency_priority as SubmitJobInput["latency_priority"],
          cost_priority: args.cost_priority as SubmitJobInput["cost_priority"],
          constraints:
            Object.values({
              gpu_type: args.gpu_type,
              gpu_class: args.gpu_class,
              region_preference: args.region_preference,
              region_mode: args.region_mode,
            }).some((value) => value !== undefined && value !== "")
              ? {
                  gpu_type: args.gpu_type as string | undefined,
                  gpu_class: args.gpu_class as "consumer" | "datacenter" | undefined,
                  region_preference: args.region_preference as string | undefined,
                  region_mode: args.region_mode as "prefer" | "strict" | undefined,
                }
              : undefined,
        });
        const freeTrialLine =
          typeof est.free_inference_jobs_remaining === "number" && est.free_inference_jobs_remaining > 0
            ? `\nfree_trial:         ${est.free_inference_trial_eligible ? "qualifies" : `over ${est.free_inference_trial_max_cost_usd ?? 0.5} USD cap; wallet required`} (${est.free_inference_jobs_remaining} remaining)`
            : "";
        const warningBlock =
          est.warnings && est.warnings.length > 0
            ? `\nwarnings:\n- ${est.warnings.join("\n- ")}`
            : "";
        return text(
          `Estimate:\navailable:          ${est.available}\ngpu_tier:           ${est.routed_gpu_tier ?? "-"}\nlikely_gpu:         ${est.likely_gpu_type ?? "-"}\nestimated_cost:     ${est.estimated_cost_usd ?? 0} USD\nruntime_minutes:    ${est.estimated_runtime_min_minutes}-${est.estimated_runtime_max_minutes}\nconstraints_relaxed:${est.constraints_relaxed_applied ?? false}\nunavailable_code:   ${est.unavailable_code ?? "-"}${freeTrialLine}${warningBlock}${formatScreening(est.screening)}`,
        );
      }

      case "stream_job_logs": {
        const jobId = args.job_id as string;
        const timeoutMs = Math.min(
          ((args.timeout_seconds as number | undefined) ?? 600) * 1000,
          600_000,
        );
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const logs = await client.streamJobLogs(baseUrl, apiKey, jobId, controller.signal);
          const parts: string[] = [];
          if (logs.stdout.trim()) parts.push(`--- stdout ---\n${logs.stdout}`);
          if (logs.stderr.trim()) parts.push(`--- stderr ---\n${logs.stderr}`);
          if (logs.exitCode !== null) parts.push(`exit_code: ${logs.exitCode}`);
          if (logs.timedOut) parts.push("(job timed out on the server)");
          return text(parts.length > 0 ? parts.join("\n\n") : "Job completed with no output.");
        } catch (err) {
          if ((err as Error)?.name === "AbortError") {
            return text(`Streaming timed out after ${timeoutMs / 1000}s. Use get_job_logs to retrieve any available output.`);
          }
          throw err;
        } finally {
          clearTimeout(timer);
        }
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      if (TOOLS.some((tool) => tool.name === toolName)) {
        return errorText(toolName, err);
      }
      throw err;
    }
  });
}

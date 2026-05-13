import assert from "node:assert/strict";
import test from "node:test";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as client from "./client.js";
import { buildSubmitJobInput, formatToolError, registerTools, TOOLS } from "./tools.js";

type Handler = (request: unknown) => Promise<unknown>;

class FakeServer {
  handlers = new Map<unknown, Handler>();

  setRequestHandler(schema: unknown, handler: Handler): void {
    this.handlers.set(schema, handler);
  }
}

function createRegisteredServer(): FakeServer {
  const server = new FakeServer();
  registerTools(server as never, "jg_test", "https://api.junglegrid.dev");
  return server;
}

async function callTool(
  server: FakeServer,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const handler = server.handlers.get(CallToolRequestSchema);
  assert.ok(handler, "call tool handler should be registered");

  return handler({
    params: {
      name,
      arguments: args,
    },
  }) as Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

function withMockedClient<T>(
  overrides: Partial<typeof client>,
  run: () => Promise<T> | T,
): Promise<T> | T {
  const originalEntries = Object.entries(overrides).map(([key, value]) => {
    const original = (client as Record<string, unknown>)[key];
    (client as Record<string, unknown>)[key] = value;
    return [key, original] as const;
  });

  const restore = () => {
    for (const [key, original] of originalEntries) {
      (client as Record<string, unknown>)[key] = original;
    }
  };

  try {
    const result = run();
    if (result instanceof Promise) {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

test("tool discovery exposes the full MCP tool surface", async () => {
  const server = createRegisteredServer();
  const handler = server.handlers.get(ListToolsRequestSchema);
  assert.ok(handler, "list tools handler should be registered");

  const response = await handler({});
  assert.deepEqual(response, { tools: TOOLS });
});

test("submit_job handler formats a successful submission", async () => {
  const server = createRegisteredServer();

  await withMockedClient(
    {
      submitJob: async (_baseUrl, _apiKey, input) => {
        assert.equal(input.command, "python");
        assert.deepEqual(input.args, ["train.py", "--epochs", "3"]);
        return {
          job_id: "job_123",
          status: "queued",
          queued_at: "2026-05-12T10:00:00Z",
          free_inference_trial_applied: true,
          free_inference_jobs_remaining: 2,
        };
      },
    },
    async () => {
      const result = await callTool(server, "submit_job", {
        workload_type: "training",
        image: "pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime",
        command: ["python", "train.py", "--epochs", "3"],
      });

      assert.equal(result.isError, undefined);
      assert.equal(
        result.content[0]?.text,
        "Job submitted.\n" +
          "id:               job_123\n" +
          "status:           queued\n" +
          "queued_at:        2026-05-12T10:00:00Z\n" +
          "free_trial:       applied (2 remaining before completion)\n\n" +
          "Poll get_job with id=job_123 to track progress.",
      );
    },
  );
});

test("submit_job handler returns a tool error for invalid command input", async () => {
  const server = createRegisteredServer();
  const result = await callTool(server, "submit_job", {
    workload_type: "batch",
    image: "python:3.11-slim",
    command: [],
  });

  assert.equal(result.isError, true);
  assert.equal(
    result.content[0]?.text,
    "submit_job failed: submit_job command must be a non-empty array of strings.",
  );
});

test("get_job handler formats job details", async () => {
  const server = createRegisteredServer();

  await withMockedClient(
    {
      getJob: async () => ({
        job_id: "job_456",
        status: "running",
        workload_type: "inference",
        image: "python:3.11-slim",
        gpu_type: "NVIDIA_A100_80GB_PCIe",
        gpu_class: "datacenter",
        region_preference: "us-east",
        region_mode: "prefer",
        constraints_relaxed: true,
        reasoning: "Matched low-latency region.",
        created_at: "2026-05-12T10:00:00Z",
        started_at: "2026-05-12T10:01:00Z",
        status_reason: "Container started",
      }),
    },
    async () => {
      const result = await callTool(server, "get_job", { job_id: "job_456" });
      assert.equal(
        result.content[0]?.text,
        "id:               job_456\n" +
          "status:           running\n" +
          "workload_type:    inference\n" +
          "image:            python:3.11-slim\n" +
          "gpu_type:         NVIDIA_A100_80GB_PCIe\n" +
          "gpu_class:        datacenter\n" +
          "region:           us-east\n" +
          "region_mode:      prefer\n" +
          "constraints_relaxed: true\n" +
          "scheduling:       Matched low-latency region.\n" +
          "created_at:       2026-05-12T10:00:00Z\n" +
          "started_at:       2026-05-12T10:01:00Z\n" +
          "reason:           Container started",
      );
    },
  );
});

test("list_jobs handler formats empty and non-empty responses", async () => {
  const server = createRegisteredServer();

  await withMockedClient(
    {
      listJobs: async (_baseUrl, _apiKey, limit, status) => {
        assert.equal(limit, 10);
        assert.equal(status, "running");
        return {
          jobs: [
            {
              job_id: "job_1",
              status: "running",
              workload_type: "batch",
              created_at: "2026-05-12T10:00:00Z",
            },
            {
              job_id: "job_2",
              status: "queued",
              workload_type: "training",
              created_at: "2026-05-12T09:59:00Z",
            },
          ],
        };
      },
    },
    async () => {
      const result = await callTool(server, "list_jobs", { limit: 10, status: "running" });
      assert.equal(
        result.content[0]?.text,
        "2 job(s):\n\n" +
          "job_1  running     batch         2026-05-12T10:00:00Z\n" +
          "job_2  queued      training      2026-05-12T09:59:00Z",
      );
    },
  );

  await withMockedClient(
    {
      listJobs: async () => ({ jobs: [] }),
    },
    async () => {
      const result = await callTool(server, "list_jobs");
      assert.equal(result.content[0]?.text, "No jobs found.");
    },
  );
});

test("cancel_job handler passes through the optional reason", async () => {
  const server = createRegisteredServer();

  await withMockedClient(
    {
      cancelJob: async (_baseUrl, _apiKey, jobId, reason) => {
        assert.equal(jobId, "job_789");
        assert.equal(reason, "No longer needed");
      },
    },
    async () => {
      const result = await callTool(server, "cancel_job", {
        job_id: "job_789",
        reason: "No longer needed",
      });
      assert.equal(result.content[0]?.text, "Job job_789 cancellation requested.");
    },
  );
});

test("get_job_logs handler formats available and unavailable runtime data", async () => {
  const server = createRegisteredServer();

  await withMockedClient(
    {
      getJobLogs: async () => ({
        job_id: "job_123",
        stdout_tail: "done\n",
        stderr_tail: "warn\n",
        exit_code: 0,
        diagnostics: ["artifact upload completed"],
      }),
    },
    async () => {
      const result = await callTool(server, "get_job_logs", { job_id: "job_123" });
      assert.equal(
        result.content[0]?.text,
        "--- stdout ---\n" +
          "done\n\n\n" +
          "--- stderr ---\n" +
          "warn\n\n\n" +
          "exit_code: 0\n\n" +
          "diagnostics:\n" +
          "- artifact upload completed",
      );
    },
  );

  await withMockedClient(
    {
      getJobLogs: async () => ({
        job_id: "job_124",
        runtime_availability: {
          exit_code: { reason: "job still running" },
          stdout_tail: { reason: "stdout not flushed yet" },
          stderr_tail: { reason: "stderr not flushed yet" },
        },
      }),
    },
    async () => {
      const result = await callTool(server, "get_job_logs", { job_id: "job_124" });
      assert.equal(
        result.content[0]?.text,
        "exit_code: job still running\n\nstdout: stdout not flushed yet\n\nstderr: stderr not flushed yet",
      );
    },
  );
});

test("list_job_artifacts and get_artifact_download_url handlers format artifact details", async () => {
  const server = createRegisteredServer();

  await withMockedClient(
    {
      listJobArtifacts: async () => ({
        artifacts: [
          {
            artifact_id: "artifact_1",
            job_id: "job_1",
            filename: "output.json",
            content_type: "application/json",
            size_bytes: 128,
            status: "uploaded",
            created_at: "2026-05-12T10:02:00Z",
          },
        ],
      }),
      getJobArtifactDownloadURL: async () => ({
        artifact: {
          artifact_id: "artifact_1",
          job_id: "job_1",
          filename: "output.json",
          content_type: "application/json",
          size_bytes: 128,
          status: "uploaded",
          created_at: "2026-05-12T10:02:00Z",
        },
        expires_at: "2026-05-12T10:12:00Z",
        url: "https://download.example.com/artifact_1",
      }),
    },
    async () => {
      const listed = await callTool(server, "list_job_artifacts", { job_id: "job_1" });
      assert.equal(
        listed.content[0]?.text,
        "artifact_1  uploaded  output.json  128 bytes",
      );

      const download = await callTool(server, "get_artifact_download_url", {
        job_id: "job_1",
        artifact_id: "artifact_1",
      });
      assert.equal(
        download.content[0]?.text,
        "artifact_id: artifact_1\n" +
          "filename:    output.json\n" +
          "expires_at:  2026-05-12T10:12:00Z\n" +
          "url:         https://download.example.com/artifact_1",
      );
    },
  );

  await withMockedClient(
    {
      listJobArtifacts: async () => ({ artifacts: [] }),
    },
    async () => {
      const result = await callTool(server, "list_job_artifacts", { job_id: "job_2" });
      assert.equal(result.content[0]?.text, "No managed artifacts uploaded for this job yet.");
    },
  );
});

test("estimate_job handler formats warnings and free-trial detail", async () => {
  const server = createRegisteredServer();

  await withMockedClient(
    {
      estimateJob: async (_baseUrl, _apiKey, input) => {
        assert.deepEqual(input.constraints, {
          gpu_type: "NVIDIA_A100_80GB_PCIe",
          gpu_class: "datacenter",
          region_preference: "us-east",
          region_mode: "strict",
        });
        return {
          available: true,
          routed_gpu_tier: "A100",
          likely_gpu_type: "NVIDIA_A100_80GB_PCIe",
          estimated_cost_usd: 0.42,
          estimated_runtime_min_minutes: 3,
          estimated_runtime_max_minutes: 5,
          constraints_relaxed_applied: false,
          free_inference_trial_eligible: true,
          free_inference_jobs_remaining: 1,
          warnings: ["Region pinning may increase queue time."],
          candidate_count: 1,
          confidence: "high",
        };
      },
    },
    async () => {
      const result = await callTool(server, "estimate_job", {
        workload_type: "inference",
        image: "python:3.11-slim",
        gpu_type: "NVIDIA_A100_80GB_PCIe",
        gpu_class: "datacenter",
        region_preference: "us-east",
        region_mode: "strict",
      });

      assert.equal(
        result.content[0]?.text,
        "Estimate:\n" +
          "available:          true\n" +
          "gpu_tier:           A100\n" +
          "likely_gpu:         NVIDIA_A100_80GB_PCIe\n" +
          "estimated_cost:     0.42 USD\n" +
          "runtime_minutes:    3-5\n" +
          "constraints_relaxed:false\n" +
          "unavailable_code:   -\n" +
          "free_trial:         qualifies (1 remaining)\n" +
          "warnings:\n" +
          "- Region pinning may increase queue time.",
      );
    },
  );
});

test("estimate_job API failures are wrapped with the tool name", async () => {
  const server = createRegisteredServer();

  await withMockedClient(
    {
      estimateJob: async () => {
        throw new Error("POST /v1/jobs/estimate failed with status 403: FORBIDDEN: wallet required");
      },
    },
    async () => {
      const result = await callTool(server, "estimate_job", {
        workload_type: "inference",
        image: "python:3.11-slim",
      });
      assert.equal(result.isError, true);
      assert.equal(
        result.content[0]?.text,
        "estimate_job failed: POST /v1/jobs/estimate failed with status 403: FORBIDDEN: wallet required",
      );
    },
  );
});

test("stream_job_logs handler formats streamed output and timeout cases", async () => {
  const server = createRegisteredServer();

  await withMockedClient(
    {
      streamJobLogs: async () => ({
        stdout: "hello\n",
        stderr: "warn\n",
        exitCode: 0,
        timedOut: false,
      }),
    },
    async () => {
      const result = await callTool(server, "stream_job_logs", {
        job_id: "job_123",
        timeout_seconds: 5,
      });
      assert.equal(
        result.content[0]?.text,
        "--- stdout ---\nhello\n\n\n--- stderr ---\nwarn\n\n\nexit_code: 0",
      );
    },
  );

  await withMockedClient(
    {
      streamJobLogs: async () => {
        const abortError = new Error("timed out");
        abortError.name = "AbortError";
        throw abortError;
      },
    },
    async () => {
      const result = await callTool(server, "stream_job_logs", { job_id: "job_123" });
      assert.equal(
        result.content[0]?.text,
        "Streaming timed out after 600s. Use get_job_logs to retrieve any available output.",
      );
    },
  );
});

test("MCP tool errors include tool name and API detail", () => {
  const message = formatToolError(
    "get_job",
    new Error("GET /v1/jobs/job-1 failed with status 403: FORBIDDEN: api key missing jobs:read or jobs:write scope"),
  );

  assert.equal(
    message,
    "get_job failed: GET /v1/jobs/job-1 failed with status 403: FORBIDDEN: api key missing jobs:read or jobs:write scope",
  );
});

test("MCP tool discovery does not include list_nodes", () => {
  assert.equal(TOOLS.some((tool) => tool.name === "list_nodes"), false);
});

test("submit_job maps command arrays to API command and args", () => {
  const input = buildSubmitJobInput({
    workload_type: "batch",
    image: "nvidia/cuda:12.2.0-base-ubuntu22.04",
    command: ["bash", "-lc", "echo starting && sleep 300"],
    model_size_gb: 1,
    optimize_for: "cost",
  });

  assert.match(input.name ?? "", /^mcp-batch-\d{14}$/);
  assert.equal(input.command, "bash");
  assert.deepEqual(input.args, ["-lc", "echo starting && sleep 300"]);
  assert.equal(input.workload_type, "batch");
  assert.equal(input.image, "nvidia/cuda:12.2.0-base-ubuntu22.04");
  assert.equal(input.optimize_for, "cost");
});

test("submit_job preserves provided name", () => {
  const input = buildSubmitJobInput({
    name: "sleep-test",
    workload_type: "batch",
    image: "nvidia/cuda:12.2.0-base-ubuntu22.04",
    command: ["bash", "-lc", "echo starting && sleep 300"],
  });

  assert.equal(input.name, "sleep-test");
});

test("submit_job rejects empty command arrays locally", () => {
  assert.throws(
    () => buildSubmitJobInput({
      workload_type: "batch",
      image: "nvidia/cuda:12.2.0-base-ubuntu22.04",
      command: [],
    }),
    /submit_job command must be a non-empty array of strings/,
  );
});

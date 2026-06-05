import assert from "node:assert/strict";
import test from "node:test";
import {
  CallToolResultSchema,
  CallToolRequestSchema,
  ListToolsResultSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as client from "./client";
import {
  buildEstimateInput,
  buildSubmitInput,
  formatToolError,
  registerTools,
  resolveBearerToken,
  TOOLS,
} from "./tools";
import type { McpAuthContext } from "./auth";
import type { GatewayConfig } from "./config";

type Handler = (request: unknown, extra?: unknown) => Promise<unknown>;

class FakeServer {
  handlers = new Map<unknown, Handler>();

  setRequestHandler(schema: unknown, handler: Handler): void {
    this.handlers.set(schema, handler);
  }
}

const config: GatewayConfig = {
  apiBase: "https://api.junglegrid.dev",
  internalServiceToken: "service-token",
  oauthIssuer: "https://api.junglegrid.dev",
  resource: "https://mcp.junglegrid.dev",
  resourceMetadataUrl: "https://mcp.junglegrid.dev/.well-known/oauth-protected-resource",
  nodeEnv: "test",
  port: 3000,
};

function createRegisteredServer(auth?: McpAuthContext): FakeServer {
  const server = new FakeServer();
  registerTools(server as never, config, auth);
  return server;
}

async function callTool(
  server: FakeServer,
  name: string,
  args: Record<string, unknown> = {},
  bearer = "user-token",
): Promise<{ content: Array<{ type: string; text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean }> {
  const handler = server.handlers.get(CallToolRequestSchema);
  assert.ok(handler, "call tool handler should be registered");

  return handler(
    {
      params: {
        name,
        arguments: args,
      },
    },
    {
      requestInfo: {
        headers: { authorization: `Bearer ${bearer}` },
      },
      requestId: 1,
      signal: new AbortController().signal,
    },
  ) as Promise<{ content: Array<{ type: string; text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean }>;
}

function withMockedClient<T>(
  factory: typeof client.createJungleGridClient,
  run: () => Promise<T> | T,
): Promise<T> | T {
  const original = client.createJungleGridClient;
  (client as Record<string, unknown>).createJungleGridClient = factory;

  try {
    const result = run();
    if (result instanceof Promise) {
      return result.finally(() => {
        (client as Record<string, unknown>).createJungleGridClient = original;
      });
    }
    (client as Record<string, unknown>).createJungleGridClient = original;
    return result;
  } catch (error) {
    (client as Record<string, unknown>).createJungleGridClient = original;
    throw error;
  }
}

const expectedAnnotations: Record<string, { readOnlyHint: boolean; openWorldHint: boolean; destructiveHint: boolean }> = {
  estimate_job: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  submit_job: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
  upload_job_input: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
  list_job_inputs: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  list_jobs: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  get_job: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  get_job_events: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  get_job_logs: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  cancel_job: { readOnlyHint: false, openWorldHint: true, destructiveHint: true },
  list_artifacts: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  get_artifact: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
};

function assertStructuredContentMatchesSchema(toolName: string, structuredContent: unknown): void {
  const tool = TOOLS.find((item) => item.name === toolName);
  assert.ok(tool, `tool should exist: ${toolName}`);
  assert.ok(tool.outputSchema, `tool should define outputSchema: ${toolName}`);
  validateJsonSchema(tool.outputSchema, structuredContent, toolName);
}

function validateJsonSchema(schema: unknown, value: unknown, path: string): void {
  const record = schema && typeof schema === "object" && !Array.isArray(schema)
    ? schema as Record<string, unknown>
    : {};
  if (Object.keys(record).length === 0) return;

  if (Array.isArray(record.anyOf)) {
    const valid = record.anyOf.some((candidate) => {
      try {
        validateJsonSchema(candidate, value, path);
        return true;
      } catch {
        return false;
      }
    });
    assert.ok(valid, `${path} should match one anyOf schema`);
    return;
  }

  const type = record.type;
  if (type === "object") {
    assert.ok(value && typeof value === "object" && !Array.isArray(value), `${path} should be an object`);
    const objectValue = value as Record<string, unknown>;
    for (const required of (record.required as string[] | undefined) ?? []) {
      assert.ok(Object.prototype.hasOwnProperty.call(objectValue, required), `${path}.${required} is required`);
    }
    const properties = record.properties as Record<string, unknown> | undefined;
    if (properties) {
      for (const [key, childSchema] of Object.entries(properties)) {
        if (Object.prototype.hasOwnProperty.call(objectValue, key)) {
          validateJsonSchema(childSchema, objectValue[key], `${path}.${key}`);
        }
      }
    }
    return;
  }

  if (type === "array") {
    assert.ok(Array.isArray(value), `${path} should be an array`);
    for (const [index, item] of value.entries()) {
      validateJsonSchema(record.items, item, `${path}[${index}]`);
    }
    return;
  }

  if (type === "string") {
    assert.equal(typeof value, "string", `${path} should be a string`);
    return;
  }

  if (type === "number") {
    assert.equal(typeof value, "number", `${path} should be a number`);
    return;
  }

  if (type === "boolean") {
    assert.equal(typeof value, "boolean", `${path} should be a boolean`);
    return;
  }

  if (type === "null") {
    assert.equal(value, null, `${path} should be null`);
  }
}

test("tool discovery exposes the gateway tool surface", async () => {
  const server = createRegisteredServer();
  const handler = server.handlers.get(ListToolsRequestSchema);
  assert.ok(handler, "list tools handler should be registered");

  const response = await handler({});
  assert.doesNotThrow(() => ListToolsResultSchema.parse(response));
  assert.deepEqual(response, { tools: TOOLS });
  assert.deepEqual(TOOLS.map((tool) => tool.name), [
    "estimate_job",
    "submit_job",
    "upload_job_input",
    "list_job_inputs",
    "list_jobs",
    "get_job",
    "get_job_events",
    "get_job_logs",
    "cancel_job",
    "list_artifacts",
    "get_artifact",
  ]);
});

test("tools/list exposes explicit annotations, output schemas, and precise descriptions", async () => {
  const server = createRegisteredServer();
  const handler = server.handlers.get(ListToolsRequestSchema);
  assert.ok(handler, "list tools handler should be registered");

  const response = await handler({}) as { tools: typeof TOOLS };
  assert.doesNotThrow(() => ListToolsResultSchema.parse(response));
  for (const tool of response.tools) {
    assert.deepEqual(tool.annotations, expectedAnnotations[tool.name], `${tool.name} annotations`);
    assert.ok(tool.outputSchema, `${tool.name} should expose outputSchema`);
    assert.equal(tool.outputSchema.type, "object", `${tool.name} outputSchema root should be object`);
    assert.deepEqual(tool.outputSchema.required, ["data"], `${tool.name} outputSchema should require structuredContent.data`);
  }

  assert.match(response.tools.find((tool) => tool.name === "submit_job")?.description ?? "", /incur usage charges/);
  assert.match(response.tools.find((tool) => tool.name === "cancel_job")?.description ?? "", /stop active execution/);
  assert.match(response.tools.find((tool) => tool.name === "estimate_job")?.description ?? "", /without submitting it/);
  assert.match(response.tools.find((tool) => tool.name === "list_jobs")?.description ?? "", /find recent jobs/);
});

test("tool annotation policy matches each tool impact", () => {
  assert.equal(expectedAnnotations.estimate_job.readOnlyHint, true);
  assert.equal(expectedAnnotations.estimate_job.destructiveHint, false);
  assert.equal(expectedAnnotations.submit_job.readOnlyHint, false);
  assert.equal(expectedAnnotations.cancel_job.destructiveHint, true);

  for (const name of ["list_job_inputs", "list_jobs", "get_job", "get_job_logs", "list_artifacts", "get_artifact"]) {
    assert.equal(expectedAnnotations[name].readOnlyHint, true, `${name} should be read-only`);
    assert.equal(expectedAnnotations[name].destructiveHint, false, `${name} should be non-destructive`);
  }
});

test("successful structured tool outputs validate against declared output schemas", async () => {
  const server = createRegisteredServer();

  await withMockedClient(
    () => ({
      estimateJob: async () => ({
        classification: { workload_type: "batch", requires_gpu: false, reasons: ["small job"] },
        routing: { route_status: "available", selected_route_source: "live" },
        capacity: { live_capacity_available: true, live_candidate_count: 1, managed_capacity_available: null },
        estimated_cost_usd: { min: 0.1, max: 0.2 },
        can_submit: true,
      }),
      submitJob: async () => ({ job_id: "job_123", status: "queued", submitted_at: "2026-05-30T00:00:00Z" }),
      uploadJobInput: async () => ({
        upload: {
          input_id: "inp_123",
          filename: "audio.wav",
          method: "PUT",
          upload_url: "https://upload.example",
          token: "token",
          expires_at: "2026-05-30T00:15:00Z",
          complete_url: "/v1/job-inputs/inp_123/complete",
        },
      }),
      listJobInputs: async () => ({
        inputs: [{ input_id: "inp_123", filename: "audio.wav", kind: "input", status: "uploaded", ready: true, mount_path: "/workspace/inputs/audio.wav" }],
      }),
      listJobs: async () => ({
        jobs: [{ job_id: "job_123", status: "running", created_at: "2026-05-30T00:00:00Z" }],
        limit: 10,
        next_cursor: null,
        has_more: false,
      }),
      getJob: async () => ({
        job_id: "job_123",
        status: "running",
        phase: "executing",
        actual_cost_usd: null,
        account_billing: { lifetime_total_spent_usd: 12.5 },
      }),
      getJobEvents: async () => ({
        job_id: "job_123",
        status: "running",
        phase: "workload_execution",
        items: [{ id: "evt_1", title: "Running workload", message: "Workload is running.", created_at: "2026-05-30T00:00:00Z" }],
      }),
      getJobLogs: async () => ({ job_id: "job_123", logs: [{ message: "started", level: "info" }], next_cursor: null }),
      cancelJob: async () => ({ job_id: "job_123", status: "cancelled", cancelled: true }),
      listArtifacts: async () => ({
        job_id: "job_123",
        artifacts: [{ name: "output.txt", ready: true, size_bytes: 12, mime_type: "text/plain" }],
      }),
      getArtifact: async () => ({
        job_id: "job_123",
        artifact_name: "output.txt",
        ready: true,
        download_url: "https://download.example/output.txt",
        expires_at: "2026-05-30T00:15:00Z",
      }),
    } as never),
    async () => {
      const calls: Array<[string, Record<string, unknown>]> = [
        ["estimate_job", { workload_type: "batch" }],
        ["submit_job", { name: "batch-1", workload_type: "batch", image: "python:3.11-slim" }],
        ["upload_job_input", { filename: "audio.wav", content_type: "audio/wav", kind: "input" }],
        ["list_job_inputs", {}],
        ["list_jobs", { limit: 10 }],
        ["get_job", { jobId: "job_123" }],
        ["get_job_events", { jobId: "job_123" }],
        ["get_job_logs", { jobId: "job_123" }],
        ["cancel_job", { jobId: "job_123" }],
        ["list_artifacts", { jobId: "job_123" }],
        ["get_artifact", { jobId: "job_123", artifactId: "artifact_1" }],
      ];

      for (const [toolName, args] of calls) {
        const response = await callTool(server, toolName, args);
        assert.equal(response.isError, undefined);
        assert.doesNotThrow(() => CallToolResultSchema.parse(response));
        assertStructuredContentMatchesSchema(toolName, response.structuredContent);
      }
    },
  );
});

test("resolveBearerToken prefers incoming user auth over fallback tokens", () => {
  assert.equal(
    resolveBearerToken(
      { internalServiceToken: "service-token", legacyApiKey: "legacy-key" },
      { requestInfo: { headers: { authorization: "Bearer user-token" } } },
    ),
    "user-token",
  );
  assert.equal(resolveBearerToken({ internalServiceToken: "service-token" }, undefined), "service-token");
  assert.equal(resolveBearerToken({ legacyApiKey: "legacy-key" }, undefined), "legacy-key");
  assert.throws(() => resolveBearerToken({}, undefined), /Authentication is required/);
});

test("estimate_job maps gateway inputs to the Jungle Grid API payload", () => {
  assert.deepEqual(
    buildEstimateInput({
      workload_type: "fine_tuning",
      model_size: 7,
      image: "pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime",
      command: ["python", "train.py"],
      routing_mode: "cost",
      template: "lora",
      notes: "cheap route",
    }),
    {
      workload_type: "fine-tuning",
      model_size_gb: 7,
      image: "pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime",
      command: ["python", "train.py"],
      optimize_for: "cost",
      template: "lora",
      notes: "cheap route",
    },
  );
});

test("submit_job maps gateway inputs to the Jungle Grid API payload", () => {
  assert.deepEqual(
    buildSubmitInput({
      name: "mnist-train",
      workload_type: "training",
      image: "pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime",
      command: ["python", "train.py"],
      env: { EPOCHS: "3" },
      input_files: [{ input_id: "inp_audio" }],
      script_files: [{ input_id: "inp_script" }],
      expected_artifacts: ["/workspace/artifacts/transcript.txt"],
      routing_mode: "balanced",
      metadata: { source: "mcp" },
    }),
    {
      name: "mnist-train",
      workload_type: "training",
      image: "pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime",
      command: ["python", "train.py"],
      environment: { EPOCHS: "3" },
      input_files: [{ input_id: "inp_audio" }],
      script_files: [{ input_id: "inp_script" }],
      expected_artifacts: ["/workspace/artifacts/transcript.txt"],
      optimize_for: "balanced",
      metadata: { source: "mcp" },
    },
  );
});

test("submit_job handler returns text plus structured API data", async () => {
  const server = createRegisteredServer();

  await withMockedClient(
    (apiBase, token) => {
      assert.equal(apiBase, "https://api.junglegrid.dev");
      assert.equal(token, "user-token");
      return {
        submitJob: async (input: unknown) => {
          assert.deepEqual(input, {
            name: "batch-1",
            workload_type: "batch",
            image: "python:3.11-slim",
          });
          return { job_id: "job_123", status: "queued" };
        },
      } as never;
    },
    async () => {
      const response = await callTool(server, "submit_job", {
        name: "batch-1",
        workload: "batch",
        image: "python:3.11-slim",
      });

      assert.equal(response.isError, undefined);
      assert.match(response.content[0]?.text, /real compute may start/);
      assert.deepEqual(response.structuredContent, { data: { job_id: "job_123", status: "queued" } });
    },
  );
});

test("get_job_logs validates and forwards pagination options", async () => {
  const server = createRegisteredServer();

  await withMockedClient(
    () => ({
      getJobLogs: async (jobId: string, options?: { limit?: number; cursor?: string | number }) => {
        assert.equal(jobId, "job_123");
        assert.deepEqual(options, { limit: 1000, cursor: "abc" });
        return { job_id: "job_123", items: [{ message: "hello" }], next_cursor: 2 };
      },
    } as never),
    async () => {
      const response = await callTool(server, "get_job_logs", {
        jobId: "job_123",
        limit: 5000,
        cursor: "abc",
      });

      assert.equal(response.content[0]?.text, "Fetched 1 log entry. next_cursor=2.");
    },
  );
});

test("list_jobs validates and forwards pagination and status options", async () => {
  const server = createRegisteredServer();

  await withMockedClient(
    () => ({
      listJobs: async (options?: { limit?: number; cursor?: string; status?: string }) => {
        assert.deepEqual(options, { limit: 100, cursor: "10", status: "completed" });
        return {
          jobs: [{ job_id: "job_123", status: "completed" }],
          limit: 100,
          next_cursor: "110",
          has_more: true,
        };
      },
    } as never),
    async () => {
      const response = await callTool(server, "list_jobs", {
        limit: 500,
        cursor: "10",
        status: "completed",
      });

      assert.equal(response.content[0]?.text, "Found 1 Jungle Grid job. next_cursor=110.");
    },
  );
});

test("get_job normalizes legacy billing fields before returning structured content", async () => {
  const server = createRegisteredServer();

  await withMockedClient(
    () => ({
      getJob: async () => ({
        job_id: "job_123",
        status: "pending",
        execution_phase: "runtime_preparation",
        phase_started_at: "2026-06-04T10:00:00Z",
        phase_last_updated_at: "2026-06-04T10:06:30Z",
        wait_duration_seconds: 390,
        delayed_start: true,
        delay_reason: {
          code: "RUNTIME_PREPARATION_DELAYED",
          message: "The managed runtime has been preparing for more than 5 minutes. The workload command has not started yet.",
        },
        billing: {
          status: "pending",
          total_spent_usd: 53.42525,
        },
      }),
    } as never),
    async () => {
      const response = await callTool(server, "get_job", { jobId: "job_123" });
      assert.equal(response.isError, undefined);
      assert.deepEqual(response.structuredContent, {
        data: {
          job_id: "job_123",
          status: "pending",
          execution_phase: "runtime_preparation",
          phase_started_at: "2026-06-04T10:00:00Z",
          phase_last_updated_at: "2026-06-04T10:06:30Z",
          wait_duration_seconds: 390,
          delayed_start: true,
          delay_reason: {
            code: "RUNTIME_PREPARATION_DELAYED",
            message: "The managed runtime has been preparing for more than 5 minutes. The workload command has not started yet.",
          },
          actual_cost_usd: null,
          billing: {
            status: "pending",
          },
        },
      });
      assert.match(response.content[0]?.text ?? "", /phase_started_at=2026-06-04T10:00:00Z/);
      assert.match(response.content[0]?.text ?? "", /phase_last_updated_at=2026-06-04T10:06:30Z/);
      assert.match(response.content[0]?.text ?? "", /Delayed in current phase/);
    },
  );
});

test("known tool errors are returned as MCP tool errors", async () => {
  const server = createRegisteredServer();
  const response = await callTool(server, "get_job", { jobId: "" });

  assert.equal(response.isError, true);
  assert.equal(response.content[0]?.text, "get_job failed: jobId is required.");
});

test("OAuth tool calls require the tool scope and forward the OAuth token", async () => {
  const server = createRegisteredServer({
    token: "oauth-token",
    userId: "user_1",
    workspaceId: "wsp_1",
    scopes: ["jobs:read"],
  });

  await withMockedClient(
    (_apiBase, token) => {
      assert.equal(token, "oauth-token");
      return {
        getJob: async () => ({ job_id: "job_123", status: "queued" }),
      } as never;
    },
    async () => {
      const allowed = await callTool(server, "get_job", { jobId: "job_123" }, "ignored-user-token");
      assert.equal(allowed.isError, undefined);
      assert.deepEqual(allowed.structuredContent, { data: { job_id: "job_123", status: "queued", actual_cost_usd: null } });

      const denied = await callTool(server, "submit_job", {
        name: "batch-1",
        workload: "batch",
        image: "python:3.11-slim",
      });
      assert.equal(denied.isError, true);
      assert.match(denied.content[0]?.text, /missing required scope: jobs:submit/);
    },
  );
});

test("MCP API errors include sanitized code and message", () => {
  assert.equal(
    formatToolError("get_job", new client.JungleGridApiError(403, "FORBIDDEN", "api key missing jobs:read scope")),
    "get_job failed: FORBIDDEN: api key missing jobs:read scope",
  );
});

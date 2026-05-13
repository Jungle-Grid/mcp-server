import assert from "node:assert/strict";
import { test } from "node:test";
import { getJob, streamJobLogs } from "./client.js";
import { buildSubmitJobInput, formatToolError, TOOLS } from "./tools.js";

function withMockedFetch<T>(
  implementation: typeof fetch,
  run: () => Promise<T> | T,
): Promise<T> | T {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = implementation;

  try {
    const result = run();
    if (result instanceof Promise) {
      return result.finally(() => {
        globalThis.fetch = originalFetch;
      });
    }
    globalThis.fetch = originalFetch;
    return result;
  } catch (error) {
    globalThis.fetch = originalFetch;
    throw error;
  }
}

test("REST requests surface nested API error envelopes", async () => {
  await withMockedFetch(
    async (input, init) => {
      assert.equal(String(input), "https://api.junglegrid.dev/v1/jobs/job-1");
      assert.equal(init?.method, "GET");
      return new Response(
        JSON.stringify({
          error: {
            code: "FORBIDDEN",
            message: "api key missing jobs:read or jobs:write scope",
          },
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    },
    async () => {
      await assert.rejects(
        () => getJob("https://api.junglegrid.dev", "jg_test", "job-1"),
        /GET \/v1\/jobs\/job-1 failed with status 403: FORBIDDEN: api key missing jobs:read or jobs:write scope/,
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

test("SSE requests surface nested API error envelopes", async () => {
  const controller = new AbortController();

  await withMockedFetch(
    async (input, init) => {
      assert.equal(String(input), "https://api.junglegrid.dev/v1/jobs/job-1/logs/live");
      assert.equal(init?.headers instanceof Headers, false);
      return new Response(
        JSON.stringify({
          error: {
            code: "UNAUTHORIZED",
            message: "invalid or revoked api key",
          },
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    },
    async () => {
      await assert.rejects(
        () => streamJobLogs("https://api.junglegrid.dev", "jg_test", "job-1", controller.signal),
        /GET \/v1\/jobs\/job-1\/logs\/live failed with status 401: UNAUTHORIZED: invalid or revoked api key/,
      );
    },
  );
});

test("streamJobLogs accumulates API message chunks", async () => {
  const controller = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event: stdout\ndata: {"message":"hello\\n"}\n\n'));
      controller.enqueue(new TextEncoder().encode('event: stderr\ndata: {"message":"warn\\n"}\n\n'));
      controller.enqueue(new TextEncoder().encode('event: terminal\ndata: {"exit_code":0,"timed_out":false}\n\n'));
      controller.close();
    },
  });

  await withMockedFetch(
    async () =>
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    async () => {
      const logs = await streamJobLogs("https://api.junglegrid.dev", "jg_test", "job-1", controller.signal);
      assert.equal(logs.stdout, "hello\n");
      assert.equal(logs.stderr, "warn\n");
      assert.equal(logs.exitCode, 0);
      assert.equal(logs.timedOut, false);
    },
  );
});

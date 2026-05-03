import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { getJob, streamJobLogs } from "./client.js";
import { buildSubmitJobInput, formatToolError, TOOLS } from "./tools.js";

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

test("REST requests surface nested API error envelopes", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: {
        code: "FORBIDDEN",
        message: "api key missing jobs:read or jobs:write scope",
      },
    }));
  });
  const baseUrl = await listen(server);

  try {
    await assert.rejects(
      () => getJob(baseUrl, "jg_test", "job-1"),
      /GET \/v1\/jobs\/job-1 failed with status 403: FORBIDDEN: api key missing jobs:read or jobs:write scope/,
    );
  } finally {
    server.close();
  }
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
  const server = http.createServer((_req, res) => {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: {
        code: "UNAUTHORIZED",
        message: "invalid or revoked api key",
      },
    }));
  });
  const baseUrl = await listen(server);
  const controller = new AbortController();

  try {
    await assert.rejects(
      () => streamJobLogs(baseUrl, "jg_test", "job-1", controller.signal),
      /GET \/v1\/jobs\/job-1\/logs\/live failed with status 401: UNAUTHORIZED: invalid or revoked api key/,
    );
  } finally {
    controller.abort();
    server.close();
  }
});

test("streamJobLogs accumulates API message chunks", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write('event: stdout\ndata: {"message":"hello\\n"}\n\n');
    res.write('event: stderr\ndata: {"message":"warn\\n"}\n\n');
    res.write('event: terminal\ndata: {"exit_code":0,"timed_out":false}\n\n');
    res.end();
  });
  const baseUrl = await listen(server);
  const controller = new AbortController();

  try {
    const logs = await streamJobLogs(baseUrl, "jg_test", "job-1", controller.signal);
    assert.equal(logs.stdout, "hello\n");
    assert.equal(logs.stderr, "warn\n");
    assert.equal(logs.exitCode, 0);
    assert.equal(logs.timedOut, false);
  } finally {
    controller.abort();
    server.close();
  }
});

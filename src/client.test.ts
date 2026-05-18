import assert from "node:assert/strict";
import test from "node:test";
import { createJungleGridClient, JungleGridApiError } from "./client";

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

test("Jungle Grid client forwards Bearer auth and JSON bodies", async () => {
  const api = createJungleGridClient("https://api.junglegrid.dev", "token-123");

  await withMockedFetch(
    async (input, init) => {
      assert.equal(String(input), "https://api.junglegrid.dev/v1/jobs/estimate");
      assert.equal(init?.method, "POST");
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer token-123");
      assert.equal(init?.body, JSON.stringify({ workload_type: "batch" }));
      return Response.json({ available: true });
    },
    async () => {
      assert.deepEqual(await api.estimateJob({ workload_type: "batch" }), { available: true });
    },
  );
});

test("Jungle Grid client encodes path and query parameters", async () => {
  const api = createJungleGridClient("https://api.junglegrid.dev", "token-123");

  await withMockedFetch(
    async (input) => {
      assert.equal(
        String(input),
        "https://api.junglegrid.dev/v1/jobs/job%201/logs?limit=50&cursor=cursor-1",
      );
      return Response.json({ items: [] });
    },
    async () => {
      assert.deepEqual(await api.getJobLogs("job 1", { limit: 50, cursor: "cursor-1" }), { items: [] });
    },
  );
});

test("Jungle Grid client surfaces sanitized API errors", async () => {
  const api = createJungleGridClient("https://api.junglegrid.dev", "token-123");

  await withMockedFetch(
    async () =>
      Response.json(
        { error: { code: "FORBIDDEN", message: "api key missing jobs:read scope" } },
        { status: 403 },
      ),
    async () => {
      await assert.rejects(
        () => api.getJob("job-1"),
        (err) => {
          assert.ok(err instanceof JungleGridApiError);
          assert.equal(err.status, 403);
          assert.equal(err.code, "FORBIDDEN");
          assert.equal(err.message, "api key missing jobs:read scope");
          return true;
        },
      );
    },
  );
});

test("Jungle Grid client hides non-JSON upstream error bodies", async () => {
  const api = createJungleGridClient("https://api.junglegrid.dev", "token-123");

  await withMockedFetch(
    async () => new Response("database host internal.local failed", { status: 500 }),
    async () => {
      await assert.rejects(
        () => api.getJob("job-1"),
        (err) => {
          assert.ok(err instanceof JungleGridApiError);
          assert.equal(err.code, "UPSTREAM_ERROR");
          assert.equal(err.message, "Jungle Grid API is temporarily unavailable.");
          return true;
        },
      );
    },
  );
});

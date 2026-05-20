import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { authenticateMcpRequest } from "./auth";
import type { GatewayConfig } from "./config";

const config: GatewayConfig = {
  apiBase: "https://api.junglegrid.dev",
  internalServiceToken: "service-token",
  legacyApiKey: undefined,
  oauthIssuer: "https://api.junglegrid.dev",
  resource: "https://mcp.junglegrid.dev",
  resourceMetadataUrl: "https://mcp.junglegrid.dev/.well-known/oauth-protected-resource",
  nodeEnv: "test",
  port: 0,
};

function request(token?: string) {
  return Object.assign(new EventEmitter(), {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function withMockedFetch<T>(implementation: typeof fetch, run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = implementation;
  return run().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

test("authenticateMcpRequest accepts active tokens with matching issuer and audience", async () => {
  const exp = Math.floor(Date.now() / 1000) + 60;
  await withMockedFetch(
    async (input, init) => {
      assert.equal(String(input), "https://api.junglegrid.dev/oauth/introspect");
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer service-token");
      return Response.json({
        active: true,
        iss: "https://api.junglegrid.dev",
        aud: ["https://mcp.junglegrid.dev"],
        sub: "user_1",
        workspace_id: "wsp_1",
        scope: "jobs:read",
        exp,
      });
    },
    async () => {
      assert.deepEqual(await authenticateMcpRequest(config, request("access-token") as never), {
        token: "access-token",
        userId: "user_1",
        workspaceId: "wsp_1",
        scopes: ["jobs:read"],
        expiresAt: exp,
      });
    },
  );
});

test("authenticateMcpRequest rejects missing, expired, and wrong-audience tokens", async () => {
  assert.equal(await authenticateMcpRequest(config, request() as never), undefined);

  await withMockedFetch(
    async () => Response.json({
      active: true,
      iss: "https://api.junglegrid.dev",
      aud: ["https://other.example.com"],
      sub: "user_1",
      workspace_id: "wsp_1",
      scope: "jobs:read",
      exp: Math.floor(Date.now() / 1000) + 60,
    }),
    async () => {
      assert.equal(await authenticateMcpRequest(config, request("wrong-aud") as never), undefined);
    },
  );

  await withMockedFetch(
    async () => Response.json({
      active: true,
      iss: "https://api.junglegrid.dev",
      aud: ["https://mcp.junglegrid.dev"],
      sub: "user_1",
      workspace_id: "wsp_1",
      scope: "jobs:read",
      exp: Math.floor(Date.now() / 1000) - 1,
    }),
    async () => {
      assert.equal(await authenticateMcpRequest(config, request("expired") as never), undefined);
    },
  );
});

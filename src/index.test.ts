import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { handleHttpRequest, SERVER_NAME, SERVER_VERSION } from "./index";
import type { GatewayConfig } from "./config";

const config: GatewayConfig = {
  apiBase: "https://api.junglegrid.dev",
  internalServiceToken: "service-token",
  oauthIssuer: "https://api.junglegrid.dev",
  resource: "https://mcp.junglegrid.dev",
  resourceMetadataUrl: "https://mcp.junglegrid.dev/.well-known/oauth-protected-resource",
  nodeEnv: "test",
  port: 0,
};

class MockResponse extends EventEmitter {
  statusCode = 0;
  headers: Record<string, string> = {};
  body = "";
  headersSent = false;

  writeHead(statusCode: number, headers: Record<string, string>): this {
    this.statusCode = statusCode;
    this.headers = headers;
    this.headersSent = true;
    return this;
  }

  end(body?: string): this {
    this.body = body ?? "";
    this.emit("finish");
    return this;
  }
}

async function invoke(method: string, url: string): Promise<MockResponse> {
  const req = Object.assign(new EventEmitter(), { method, url });
  const res = new MockResponse();
  await handleHttpRequest(config, req as never, res as never);
  return res;
}

test("GET /healthz returns gateway health", async () => {
  const response = await invoke("GET", "/healthz");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    ok: true,
    service: SERVER_NAME,
    version: SERVER_VERSION,
    env: "test",
  });
});

test("unknown routes return 404 JSON", async () => {
  const response = await invoke("GET", "/missing");
  assert.equal(response.statusCode, 404);
  assert.deepEqual(JSON.parse(response.body), {
    error: { code: "NOT_FOUND", message: "Not found." },
  });
});

test("GET /.well-known/oauth-protected-resource returns OAuth resource metadata", async () => {
  const response = await invoke("GET", "/.well-known/oauth-protected-resource");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    resource: "https://mcp.junglegrid.dev",
    authorization_servers: ["https://api.junglegrid.dev"],
    scopes_supported: ["jobs:estimate", "jobs:submit", "jobs:read", "logs:read"],
    resource_documentation: "https://junglegrid.dev/docs",
  });
});

test("GET /mcp without bearer token returns OAuth challenge", async () => {
  const response = await invoke("GET", "/mcp");
  assert.equal(response.statusCode, 401);
  assert.equal(
    response.headers["WWW-Authenticate"],
    'Bearer resource_metadata="https://mcp.junglegrid.dev/.well-known/oauth-protected-resource"',
  );
  assert.deepEqual(JSON.parse(response.body), {
    error: { code: "UNAUTHORIZED", message: "Authentication is required." },
  });
});

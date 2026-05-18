import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_API_BASE, DEFAULT_PORT, resolveApiBase, resolveGatewayConfig, resolvePort } from "./config";

test("resolveApiBase defaults to the production API base", () => {
  assert.equal(resolveApiBase({}), DEFAULT_API_BASE);
});

test("resolveApiBase prefers JUNGLEGRID_API_BASE and trims trailing slashes", () => {
  assert.equal(
    resolveApiBase({
      JUNGLEGRID_API_BASE: "https://api.junglegrid.dev/",
      JUNGLE_GRID_API_URL: "https://legacy.example.com",
    }),
    "https://api.junglegrid.dev",
  );
});

test("resolveApiBase supports the legacy JUNGLE_GRID_API_URL alias", () => {
  assert.equal(
    resolveApiBase({
      JUNGLE_GRID_API_URL: "https://legacy.example.com/",
    }),
    "https://legacy.example.com",
  );
});

test("resolvePort defaults and validates PORT", () => {
  assert.equal(resolvePort({}), DEFAULT_PORT);
  assert.equal(resolvePort({ PORT: "8080" }), 8080);
  assert.throws(() => resolvePort({ PORT: "0" }), /PORT must be an integer/);
  assert.throws(() => resolvePort({ PORT: "abc" }), /PORT must be an integer/);
});

test("resolveGatewayConfig captures auth fallbacks without requiring them", () => {
  assert.deepEqual(
    resolveGatewayConfig({
      JUNGLEGRID_API_BASE: "https://api.example.com",
      JUNGLEGRID_INTERNAL_SERVICE_TOKEN: " service-token ",
      JUNGLE_GRID_API_KEY: " legacy-key ",
      NODE_ENV: "test",
      PORT: "9999",
    }),
    {
      apiBase: "https://api.example.com",
      internalServiceToken: "service-token",
      legacyApiKey: "legacy-key",
      nodeEnv: "test",
      port: 9999,
    },
  );
});

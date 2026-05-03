import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_API_URL, resolveApiUrl } from "./config";

test("resolveApiUrl defaults to the production API URL", () => {
  assert.equal(resolveApiUrl({}), DEFAULT_API_URL);
});

test("resolveApiUrl trims a JUNGLE_GRID_API_URL override", () => {
  assert.equal(
    resolveApiUrl({
      JUNGLE_GRID_API_URL: "https://api.junglegrid.dev/",
    }),
    "https://api.junglegrid.dev",
  );
});

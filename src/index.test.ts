import assert from "node:assert/strict";
import test from "node:test";
import { MISSING_API_KEY_MESSAGE, requireApiKey } from "./index.js";

test("requireApiKey throws a clear error when JUNGLE_GRID_API_KEY is missing", () => {
  assert.throws(
    () => requireApiKey({}),
    new Error(MISSING_API_KEY_MESSAGE),
  );
});

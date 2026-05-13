#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveApiUrl } from "./config.js";
import { registerTools } from "./tools.js";

export const MISSING_API_KEY_MESSAGE =
  "JUNGLE_GRID_API_KEY environment variable is required.\n" +
  "Set it to a Jungle Grid API key (jg_...).";

export function requireApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const apiKey = env.JUNGLE_GRID_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(MISSING_API_KEY_MESSAGE);
  }
  return apiKey;
}

export async function startServer(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const apiKey = requireApiKey(env);
  const baseUrl = resolveApiUrl(env);

  const server = new Server(
    { name: "junglegrid", version: "0.1.8" },
    { capabilities: { tools: {} } },
  );

  registerTools(server, apiKey, baseUrl);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (require.main === module) {
  startServer().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    const prefix = message === MISSING_API_KEY_MESSAGE ? "Error" : "Fatal";
    process.stderr.write(`${prefix}: ${message}\n`);
    process.exit(1);
  });
}

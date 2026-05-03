#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveApiUrl } from "./config.js";
import { registerTools } from "./tools.js";

const apiKey = process.env.JUNGLE_GRID_API_KEY;
if (!apiKey) {
  process.stderr.write(
    "Error: JUNGLE_GRID_API_KEY environment variable is required.\n" +
      "Set it to a Jungle Grid API key (jg_...).\n",
  );
  process.exit(1);
}

const baseUrl = resolveApiUrl(process.env);

const server = new Server(
  { name: "junglegrid", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

registerTools(server, apiKey, baseUrl);

const transport = new StdioServerTransport();
server.connect(transport).catch((err: unknown) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

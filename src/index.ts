#!/usr/bin/env node
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { resolveGatewayConfig, type GatewayConfig } from "./config.js";
import { registerTools } from "./tools.js";

export const SERVER_NAME = "junglegrid";
export const SERVER_VERSION = "0.1.8";

export function createMcpServer(config: GatewayConfig): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );
  registerTools(server, config);
  return server;
}

export async function startStdioServer(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = resolveGatewayConfig(env);
  const server = createMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function createHttpServer(config: GatewayConfig): HttpServer {
  return createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/healthz") {
        writeJson(res, 200, {
          ok: true,
          service: SERVER_NAME,
          version: SERVER_VERSION,
          env: config.nodeEnv,
        });
        return;
      }

      if (req.url?.split("?")[0] === "/mcp") {
        await handleMcpRequest(config, req, res);
        return;
      }

      writeJson(res, 404, { error: { code: "NOT_FOUND", message: "Not found." } });
    } catch {
      if (!res.headersSent) {
        writeJson(res, 500, {
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });
}

export async function startHttpServer(env: NodeJS.ProcessEnv = process.env): Promise<HttpServer> {
  const config = resolveGatewayConfig(env);
  const server = createHttpServer(config);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, () => {
      server.off("error", reject);
      resolve();
    });
  });

  process.stderr.write(`Jungle Grid MCP server listening on port ${config.port}\n`);
  return server;
}

async function handleMcpRequest(
  config: GatewayConfig,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== "POST") {
    writeJson(res, 405, {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
    return;
  }

  const server = createMcpServer(config);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res);
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function startServer(env: NodeJS.ProcessEnv = process.env): Promise<void | HttpServer> {
  if (process.argv.includes("--http") || env.MCP_TRANSPORT === "http") {
    return startHttpServer(env);
  }
  return startStdioServer(env);
}

if (require.main === module) {
  startServer().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Fatal: ${message}\n`);
    process.exit(1);
  });
}

import type { IncomingMessage, ServerResponse } from "node:http";
import type { GatewayConfig } from "./config.js";

export interface McpAuthContext {
  token: string;
  userId: string;
  workspaceId: string;
  scopes: string[];
  expiresAt?: number;
}

interface IntrospectionResponse {
  active?: boolean;
  iss?: string;
  aud?: string | string[];
  sub?: string;
  workspace_id?: string;
  scope?: string;
  exp?: number;
}

export const TOOL_SCOPES: Record<string, string> = {
  estimate_job: "jobs:estimate",
  submit_job: "jobs:submit",
  upload_job_input: "jobs:submit",
  list_job_inputs: "jobs:read",
  list_jobs: "jobs:read",
  get_job: "jobs:read",
  get_job_events: "jobs:read",
  get_job_logs: "logs:read",
  cancel_job: "jobs:submit",
  list_artifacts: "jobs:read",
  get_artifact: "jobs:read",
};

export function bearerFromRequest(req: IncomingMessage): string | undefined {
  const raw = req.headers.authorization;
  const authorization = Array.isArray(raw) ? raw[0] : raw;
  if (!authorization) return undefined;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

export function writeOAuthChallenge(config: GatewayConfig, res: ServerResponse): void {
  res.writeHead(401, {
    "Content-Type": "application/json",
    "WWW-Authenticate": `Bearer resource_metadata="${config.resourceMetadataUrl}"`,
  });
  res.end(JSON.stringify({
    error: { code: "UNAUTHORIZED", message: "Authentication is required." },
  }));
}

export function hasScope(auth: McpAuthContext, scope: string): boolean {
  return auth.scopes.includes(scope);
}

export async function authenticateMcpRequest(
  config: GatewayConfig,
  req: IncomingMessage,
): Promise<McpAuthContext | undefined> {
  const token = bearerFromRequest(req);
  if (!token) return undefined;

  const res = await fetch(`${config.apiBase}/oauth/introspect`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(config.internalServiceToken ? { Authorization: `Bearer ${config.internalServiceToken}` } : {}),
    },
    body: JSON.stringify({ token, resource: config.resource }),
  });
  if (!res.ok) return undefined;

  const data = await res.json().catch(() => undefined) as IntrospectionResponse | undefined;
  if (!data?.active) return undefined;
  if (data.iss !== config.oauthIssuer) return undefined;
  if (!audienceMatches(data.aud, config.resource)) return undefined;
  if (!data.sub?.trim() || !data.workspace_id?.trim()) return undefined;
  if (typeof data.exp === "number" && data.exp <= Math.floor(Date.now() / 1000)) return undefined;

  return {
    token,
    userId: data.sub.trim(),
    workspaceId: data.workspace_id.trim(),
    scopes: (data.scope ?? "").split(/\s+/).map((scope) => scope.trim()).filter(Boolean),
    expiresAt: data.exp,
  };
}

function audienceMatches(aud: string | string[] | undefined, resource: string): boolean {
  const values = Array.isArray(aud) ? aud : aud ? [aud] : [];
  const expected = resource.replace(/\/+$/, "");
  return values.some((value) => value.replace(/\/+$/, "") === expected);
}

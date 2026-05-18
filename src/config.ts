export const DEFAULT_API_BASE = "https://api.junglegrid.dev";
export const DEFAULT_PORT = 3000;

export interface GatewayConfig {
  apiBase: string;
  internalServiceToken?: string;
  legacyApiKey?: string;
  nodeEnv: string;
  port: number;
}

export function resolveApiBase(env: NodeJS.ProcessEnv = process.env): string {
  const override = (env.JUNGLEGRID_API_BASE ?? env.JUNGLE_GRID_API_URL ?? "").trim();
  return (override || DEFAULT_API_BASE).replace(/\/+$/, "");
}

export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.PORT ?? "").trim();
  if (!raw) return DEFAULT_PORT;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return parsed;
}

export function resolveGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const internalServiceToken = (env.JUNGLEGRID_INTERNAL_SERVICE_TOKEN ?? "").trim() || undefined;
  const legacyApiKey = (env.JUNGLE_GRID_API_KEY ?? "").trim() || undefined;

  return {
    apiBase: resolveApiBase(env),
    internalServiceToken,
    legacyApiKey,
    nodeEnv: (env.NODE_ENV ?? "development").trim() || "development",
    port: resolvePort(env),
  };
}

export const DEFAULT_API_URL = DEFAULT_API_BASE;

export function resolveApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  return resolveApiBase(env);
}

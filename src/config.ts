export const DEFAULT_API_URL = "https://api.junglegrid.dev";

export function resolveApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  const override = (env.JUNGLE_GRID_API_URL ?? "").trim();
  if (override.length > 0) {
    return override.replace(/\/+$/, "");
  }

  return DEFAULT_API_URL;
}

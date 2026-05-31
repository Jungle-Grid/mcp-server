<div align="center">
  <a href="https://junglegrid.dev">
    <img src="./assets/junglegrid-logo.png" alt="Jungle Grid logo" width="128">
  </a>

  <h1>Jungle Grid MCP Server</h1>

  <p><strong>Agent-facing MCP tools for submitting, estimating, tracking, and cancelling Jungle Grid workloads.</strong></p>

  <p>
    <a href="https://mcp.junglegrid.dev/mcp"><img alt="Hosted MCP" src="https://img.shields.io/badge/MCP-hosted_endpoint-111827?style=for-the-badge"></a>
    <a href="https://www.npmjs.com/package/@jungle-grid/mcp"><img alt="npm package" src="https://img.shields.io/npm/v/@jungle-grid/mcp?style=for-the-badge&color=cb3837&label=npm"></a>
    <a href="https://junglegrid.dev/docs/mcp"><img alt="MCP docs" src="https://img.shields.io/badge/Read-MCP_docs-2563eb?style=for-the-badge"></a>
    <a href="https://x.com/jungle_grid"><img alt="Follow Jungle Grid on X" src="https://img.shields.io/badge/Follow-@jungle__grid-000000?style=for-the-badge&logo=x"></a>
    <a href="https://discord.gg/kpJqxXFFCs"><img alt="Join the Jungle Grid Discord" src="https://img.shields.io/badge/Join-Discord-5865f2?style=for-the-badge&logo=discord&logoColor=white"></a>
    <a href="mailto:run@junglegrid.dev"><img alt="Email Jungle Grid" src="https://img.shields.io/badge/Email-run@junglegrid.dev-16a34a?style=for-the-badge"></a>
    <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-f97316?style=for-the-badge"></a>
  </p>
</div>

Thin MCP gateway for Jungle Grid. The server exposes agent-facing tools for
ChatGPT, Cursor, Claude, and other MCP clients, then forwards all real work to
the main Jungle Grid API.

This repo does not schedule jobs, choose providers, calculate billing, or store
artifacts. Those responsibilities stay in the Jungle Grid API.

## Endpoints

- `POST /mcp` - MCP Streamable HTTP endpoint
- `GET /.well-known/oauth-protected-resource` - OAuth protected resource metadata
- `GET /.well-known/openai-apps-challenge` - OpenAI Apps domain verification challenge
- `GET /healthz` - health check

Production URL:

```text
https://mcp.junglegrid.dev/mcp
```

## Environment

```sh
PORT=3000
JUNGLEGRID_API_BASE=https://api.junglegrid.dev
JUNGLEGRID_INTERNAL_SERVICE_TOKEN=...
OAUTH_ISSUER=https://api.junglegrid.dev
MCP_RESOURCE=https://mcp.junglegrid.dev
MCP_RESOURCE_METADATA_URL=https://mcp.junglegrid.dev/.well-known/oauth-protected-resource
OPENAI_APPS_CHALLENGE_TOKEN=...
NODE_ENV=production
```

Hosted HTTP MCP requires `Authorization: Bearer <OAuth access token>`. The server
introspects that token with the Jungle Grid API, enforces tool scopes, and
forwards the user token to the API. `JUNGLEGRID_INTERNAL_SERVICE_TOKEN` is used
only for MCP-to-API introspection and other internal server-to-server calls; it
is not used as the ChatGPT user identity.

Legacy aliases are still accepted for stdio compatibility:

- `JUNGLE_GRID_API_URL` as an alias for `JUNGLEGRID_API_BASE`
- `JUNGLE_GRID_API_KEY` as a final auth fallback for local stdio use

`OPENAI_APPS_CHALLENGE_TOKEN` is optional for local development. In production,
set it to the exact OpenAI developer portal domain-verification token so the
public unauthenticated challenge endpoint can return it as plain text.

## Local Development

```sh
npm install
npm test
npm run build
```

Run the hosted HTTP server:

```sh
JUNGLEGRID_API_BASE=https://api.junglegrid.dev \
JUNGLEGRID_INTERNAL_SERVICE_TOKEN=... \
npm start
```

Then check:

```sh
curl http://localhost:3000/healthz
```

## MCP Tools

- `estimate_job` - estimates routing, capacity source, and expected cost without submitting a workload. Annotations: `readOnlyHint=true`, `openWorldHint=false`, `destructiveHint=false`.
- `submit_job` - submits a workload for execution and may start managed compute infrastructure and incur usage charges. Annotations: `readOnlyHint=false`, `openWorldHint=true`, `destructiveHint=false`.
- `list_jobs` - lists the authenticated user's Jungle Grid jobs, optionally filtered by status, with cursor pagination. Annotations: `readOnlyHint=true`, `openWorldHint=false`, `destructiveHint=false`.
- `get_job` - retrieves status and execution details for an authenticated user's job. Annotations: `readOnlyHint=true`, `openWorldHint=false`, `destructiveHint=false`.
- `get_job_logs` - retrieves execution logs for an authenticated user's job. Annotations: `readOnlyHint=true`, `openWorldHint=false`, `destructiveHint=false`.
- `cancel_job` - cancels an existing job and may stop active execution. Annotations: `readOnlyHint=false`, `openWorldHint=true`, `destructiveHint=true`.
- `list_artifacts` - lists output artifacts associated with a job. Annotations: `readOnlyHint=true`, `openWorldHint=false`, `destructiveHint=false`.
- `get_artifact` - retrieves temporary download information for an existing output artifact. Annotations: `readOnlyHint=true`, `openWorldHint=false`, `destructiveHint=false`.

All tools return a useful text summary and include the Jungle Grid API response
in `structuredContent.data`; job status billing fields are normalized to avoid
confusing account lifetime spend with job-specific cost. Each tool also exposes an MCP
`outputSchema` for that structured content wrapper.

## Connecting Clients

For hosted MCP clients that support Streamable HTTP, use:

```text
https://mcp.junglegrid.dev/mcp
```

ChatGPT and other hosted clients should discover auth from
`/.well-known/oauth-protected-resource`, connect the user's Jungle Grid account,
and then send the OAuth access token as `Authorization: Bearer ...`.

## Claude Desktop / Cursor Stdio Compatibility

The package still supports local stdio mode for existing MCP host configs. The
bin defaults to stdio; `npm start` and Docker use HTTP mode.

Claude Desktop example:

```json
{
  "mcpServers": {
    "junglegrid": {
      "command": "npx",
      "args": ["-y", "@jungle-grid/mcp"],
      "env": {
        "JUNGLEGRID_API_BASE": "https://api.junglegrid.dev",
        "JUNGLE_GRID_API_KEY": "jg_..."
      }
    }
  }
}
```

For Cursor project configs, avoid committing secrets. Put the token in the
environment used to launch Cursor and keep checked-in config secret-free.

## Docker

```sh
docker build -t junglegrid-mcp .
docker run --rm -p 3000:3000 \
  -e PORT=3000 \
  -e JUNGLEGRID_API_BASE=https://api.junglegrid.dev \
  -e JUNGLEGRID_INTERNAL_SERVICE_TOKEN=... \
  -e OPENAI_APPS_CHALLENGE_TOKEN=... \
  junglegrid-mcp
```

## Publishing

```sh
npm run build
npm pack --dry-run
npm publish --access public
```

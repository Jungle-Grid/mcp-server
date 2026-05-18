# Jungle Grid MCP Server

Thin MCP gateway for Jungle Grid. The server exposes agent-facing tools for
ChatGPT, Cursor, Claude, and other MCP clients, then forwards all real work to
the main Jungle Grid API.

This repo does not schedule jobs, choose providers, calculate billing, or store
artifacts. Those responsibilities stay in the Jungle Grid API.

## Endpoints

- `POST /mcp` - MCP Streamable HTTP endpoint
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
NODE_ENV=production
```

`JUNGLEGRID_INTERNAL_SERVICE_TOKEN` is optional. When an incoming MCP request has
`Authorization: Bearer ...`, that user token is forwarded to the Jungle Grid API.
If no user token is present, the internal service token is used as a temporary
fallback. Tokens are never hardcoded and must not be logged.

Legacy aliases are still accepted for stdio compatibility:

- `JUNGLE_GRID_API_URL` as an alias for `JUNGLEGRID_API_BASE`
- `JUNGLE_GRID_API_KEY` as a final auth fallback for local stdio use

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

- `estimate_job` - read-only estimate or execution-plan preparation.
- `submit_job` - starts real Jungle Grid compute and may cost money.
- `get_job` - read-only job state lookup.
- `get_job_logs` - read-only recent log fetch.
- `cancel_job` - real cancellation action that may stop running compute.
- `list_artifacts` - read-only managed artifact listing.
- `get_artifact` - creates a temporary signed artifact download URL.

All tools return a useful text summary and preserve the raw Jungle Grid API
response in `structuredContent.data`.

## Connecting Clients

For hosted MCP clients that support Streamable HTTP, use:

```text
https://mcp.junglegrid.dev/mcp
```

Configure the client to send a Jungle Grid user Bearer token when available. If
the client cannot send user auth yet, deploy the server with
`JUNGLEGRID_INTERNAL_SERVICE_TOKEN` until user-scoped OAuth or account linking is
available.

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
  junglegrid-mcp
```

## Publishing

```sh
npm run build
npm pack --dry-run
npm publish --access public
```

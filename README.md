# Jungle Grid MCP Server

Run Jungle Grid GPU workloads from MCP-aware AI hosts such as Claude Desktop,
Cursor, Windsurf, and MCP Inspector.

The server runs locally over stdio and forwards tool calls to the Jungle Grid
REST API with your API key.

## Requirements

- Node.js 18 or newer
- A Jungle Grid API key
- Optional: `JUNGLE_GRID_API_URL` for a self-hosted orchestrator

For the full submit workflow, the API key needs `jobs:write`. That scope allows
estimate, submit, polling, cancellation, and logs for jobs owned by the key's
account. `list_jobs` still requires `jobs:read`.

## Quick Start

```sh
JUNGLE_GRID_API_KEY=jg_... npx -y @jungle-grid/mcp
```

On Windows PowerShell:

```powershell
$env:JUNGLE_GRID_API_KEY = "jg_..."
npx -y @jungle-grid/mcp
```

The server uses stdio, so a successful manual launch appears to wait for MCP
messages. If `JUNGLE_GRID_API_KEY` is missing, it exits with a clear error.

## Claude Desktop

Add this to `claude_desktop_config.json`, then fully restart Claude Desktop.

```json
{
  "mcpServers": {
    "junglegrid": {
      "command": "npx",
      "args": ["-y", "@jungle-grid/mcp"],
      "env": {
        "JUNGLE_GRID_API_KEY": "jg_..."
      }
    }
  }
}
```

Windows config path:

```text
%APPDATA%\Claude\claude_desktop_config.json
```

macOS config path:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

## Cursor or Project MCP Config

For a checked-in project config, avoid committing secrets. Put the API key in
the environment used to launch Cursor and keep the config secret-free.

```json
{
  "mcpServers": {
    "junglegrid": {
      "command": "npx",
      "args": ["-y", "@jungle-grid/mcp"]
    }
  }
}
```

For a local, uncommitted config, you can include the key directly:

```json
{
  "mcpServers": {
    "junglegrid": {
      "command": "npx",
      "args": ["-y", "@jungle-grid/mcp"],
      "env": {
        "JUNGLE_GRID_API_KEY": "jg_..."
      }
    }
  }
}
```

## Self-Hosted Orchestrator

`JUNGLE_GRID_API_URL` defaults to
`https://api.junglegrid.dev`. Override it when your host should
call a different orchestrator.

```json
{
  "mcpServers": {
    "junglegrid": {
      "command": "npx",
      "args": ["-y", "@jungle-grid/mcp"],
      "env": {
        "JUNGLE_GRID_API_KEY": "jg_...",
        "JUNGLE_GRID_API_URL": "https://your-orchestrator.example.com"
      }
    }
  }
}
```

## Tools

- `estimate_job`: estimate GPU tier, region, duration, and credit cost.
- `submit_job`: submit an asynchronous GPU workload with optional `environment` values.
- `get_job`: fetch current job status and details.
- `list_jobs`: list recent jobs for the authenticated account.
- `cancel_job`: cancel a pending, queued, or running job.
- `get_job_logs`: fetch stdout, stderr, and exit information.
- `stream_job_logs`: stream live logs until completion or timeout.
- `list_job_artifacts`: list managed artifacts uploaded for a job.
- `get_artifact_download_url`: create a signed download URL for one managed artifact.

## Real-Time Job Pattern

Use `submit_job` to start work, `stream_job_logs` for live output, then
`list_job_artifacts` after completion to retrieve saved files.

```json
{
  "command": ["python", "-c", "import os; exec(os.environ['CODE'])"],
  "environment": {
    "CODE": "import os, json\nos.makedirs('/workspace/artifacts', exist_ok=True)\nwith open('/workspace/artifacts/output.json','w') as f:\n    json.dump({'status':'ok'}, f)"
  }
}
```

This is the recommended pattern when the real Python payload is too long to fit
comfortably in the `command` array.

For managed jobs, Jungle Grid automatically creates `/workspace/artifacts` and
uploads any regular files written there. Users do not need to create signed
upload URLs or call artifact completion endpoints manually.

## Local Development

```sh
npm install
npm run build
JUNGLE_GRID_API_KEY=jg_... node dist/index.js
```

Inspect the server with MCP Inspector:

```sh
JUNGLE_GRID_API_KEY=jg_... npx @modelcontextprotocol/inspector node dist/index.js
```

## Publishing

Verify the package before publishing:

```sh
npm run build
npm pack --dry-run
```

Publish the scoped package publicly:

```sh
npm publish --access public
```

## Troubleshooting

- `JUNGLE_GRID_API_KEY environment variable is required`: add the key to the
  host config `env` block or to the environment that launches the host.
- Tools do not appear: fully quit and reopen the MCP host after editing config.
- Old package version: pin a version in config, for example
  `["@jungle-grid/mcp@0.1.0"]`, or clear the npx cache.
- API calls fail: confirm the key is valid and `JUNGLE_GRID_API_URL` points to
  the orchestrator you intend to use.


## Contributors wanted

We are opening up the Jungle Grid MCP server for contributors interested in AI agents, MCP, developer tools, and workload execution.

Good first areas:

- Improve docs
- Add example prompts
- Add tests for MCP tool handlers
- Add Docker support
- Improve GitHub Actions
- Build integration examples

Start with issues labeled `good first issue`.
# Jungle Grid MCP Server

Jungle Grid MCP lets MCP-aware agents estimate, submit, monitor, cancel, and retrieve artifacts from Jungle Grid workloads. It supports local stdio clients and hosted Streamable HTTP deployments that forward tool calls to the Jungle Grid API.

Use it for asynchronous AI workload execution, batch processing, training, fine-tuning, uploaded file or script backed jobs, lifecycle diagnostics, workload logs, and managed output artifacts.

## Installation

Requirements:

- Node.js 18 or newer
- A Jungle Grid API key for local stdio, or an OAuth bearer token for hosted HTTP
- API scopes that match the tools you want to call

Run the local stdio server with `npx`:

```sh
JUNGLE_GRID_API_KEY=jg_placeholder npx -y @jungle-grid/mcp
```

Install globally if you prefer a stable executable:

```sh
npm install -g @jungle-grid/mcp
junglegrid-mcp
```

## Configuration

Local stdio uses environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `JUNGLE_GRID_API_KEY` | Yes for local stdio | Bearer token forwarded to the Jungle Grid API. |
| `JUNGLEGRID_API_BASE` | No | API base URL. Defaults to `https://api.junglegrid.dev`. |
| `JUNGLE_GRID_API_URL` | No | Legacy API base URL alias, also accepted. |

Hosted HTTP gateway deployments also support:

| Variable | Required | Purpose |
| --- | --- | --- |
| `MCP_TRANSPORT=http` | No | Starts Streamable HTTP instead of stdio. |
| `PORT` | No | HTTP port. Defaults to `3000`. |
| `JUNGLEGRID_INTERNAL_SERVICE_TOKEN` | No | Service token used for OAuth introspection or fallback API calls. |
| `OAUTH_ISSUER` | No | OAuth issuer. Defaults to `https://api.junglegrid.dev`. |
| `MCP_RESOURCE` | No | Protected resource URL. Defaults to `https://mcp.junglegrid.dev`. |
| `MCP_RESOURCE_METADATA_URL` | No | OAuth protected-resource metadata URL. |
| `OPENAI_APPS_CHALLENGE_TOKEN` | No | Enables `/.well-known/openai-apps-challenge` when configured. |

Never commit API keys, OAuth tokens, signed upload URLs, signed artifact URLs, or callback secrets.

## Connection Modes

### Local stdio

Local clients launch the package and communicate over stdio.

```json
{
  "mcpServers": {
    "junglegrid": {
      "command": "npx",
      "args": ["-y", "@jungle-grid/mcp"],
      "env": {
        "JUNGLE_GRID_API_KEY": "jg_placeholder"
      }
    }
  }
}
```

### Claude Desktop

Add the same `mcpServers` block to `claude_desktop_config.json`, then fully quit and reopen Claude Desktop.

macOS:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Windows:

```text
%APPDATA%\Claude\claude_desktop_config.json
```

### Cursor

For project config, avoid checked-in secrets. Put the key in the environment used to launch Cursor:

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

For a local uncommitted Cursor config:

```json
{
  "mcpServers": {
    "junglegrid": {
      "command": "npx",
      "args": ["-y", "@jungle-grid/mcp"],
      "env": {
        "JUNGLE_GRID_API_KEY": "jg_placeholder",
        "JUNGLEGRID_API_BASE": "https://api.junglegrid.dev"
      }
    }
  }
}
```

### Hosted HTTP

The HTTP server exposes:

- `GET /healthz`
- `GET /.well-known/oauth-protected-resource`
- `POST /mcp`

Start it locally:

```sh
MCP_TRANSPORT=http PORT=3000 JUNGLEGRID_INTERNAL_SERVICE_TOKEN=service_token_placeholder npm start
```

Hosted MCP clients must send `Authorization: Bearer <oauth_access_token>` to `POST /mcp`. The server introspects tokens at `/oauth/introspect` on the configured API base and requires tool-specific scopes.

## Minimal Working Example

Ask your MCP client to call the tools in this order:

```json
{
  "tool": "estimate_job",
  "arguments": {
    "workload_type": "batch",
    "image": "python:3.11-slim",
    "command": ["python", "-c", "print('hello from Jungle Grid')"],
    "routing_mode": "balanced"
  }
}
```

If the estimate is acceptable, submit the job:

```json
{
  "tool": "submit_job",
  "arguments": {
    "name": "mcp-hello",
    "workload_type": "batch",
    "image": "python:3.11-slim",
    "command": ["python", "-c", "print('hello from Jungle Grid')"],
    "expected_artifacts": ["/workspace/artifacts/output.txt"]
  }
}
```

Use the returned `job_id` with `get_job`, `get_job_events`, `get_job_logs`, `list_artifacts`, and `get_artifact`.

## MCP Tools

The current tool registry exposes these exact tool names:

| Tool | Purpose | Required parameters | Optional parameters |
| --- | --- | --- | --- |
| `estimate_job` | Estimate routing, capacity source, and expected cost without creating work. | `workload_type` | `model_size`, `image`, `command`, `args`, `routing_mode`, `template`, `notes` |
| `submit_job` | Submit a workload. This may start compute and incur usage charges. | `name`, `workload_type`, `image` | `model_size`, `command`, `args`, `env`, `input_files`, `script_files`, `script_file`, `expected_artifacts`, `routing_mode`, `template`, `metadata` |
| `upload_job_input` | Create a signed upload slot for an input file or script. | `filename` | `content_type`, `kind` |
| `list_job_inputs` | List uploaded inputs and scripts for the authenticated account. | none | none |
| `list_jobs` | List recent jobs. | none | `limit`, `cursor`, `status` |
| `get_job` | Read job status, phase, scheduling, billing, and artifact readiness. | `job_id` | none |
| `get_job_events` | Read lifecycle events for scheduling, provisioning, startup, failures, and cancellation. | `job_id` | none |
| `get_job_logs` | Read persisted runtime and workload logs. | `job_id` | `limit`, `cursor` |
| `cancel_job` | Request cancellation of a non-terminal job. | `job_id` | `reason` |
| `list_artifacts` | List managed output artifacts for a job. | `job_id` | none |
| `get_artifact` | Create temporary artifact download information. | `job_id`, `artifact_id` | none |

Accepted `workload_type` values are `inference`, `training`, `fine_tuning`, and `batch`. The MCP server forwards `fine_tuning` to the REST API as `fine-tuning`. Accepted `routing_mode` values are `cost`, `speed`, and `balanced`.

### Tool Details

#### `estimate_job`

Returns classification, route status, capacity source, estimated cost range, availability, and screening details when returned by the API. An estimate is not a reservation and does not guarantee immediate startup.

Common errors: missing `workload_type`, invalid enum value, authentication failure, forbidden scope, invalid request, upstream API error.

```json
{
  "workload_type": "inference",
  "model_size": 7,
  "image": "pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime",
  "command": ["python", "infer.py"],
  "routing_mode": "balanced",
  "notes": "single model inference run"
}
```

#### `submit_job`

Creates an asynchronous job. `model_size` is an optional size in GB used to select suitable GPU capacity and is forwarded as REST `model_size_gb`. `command` is preferably an array of strings. `env` must be an object with string values and is forwarded as REST `environment`. `input_files` and `script_files` accept arrays of `{ "input_id": "..." }`; string IDs are normalized for compatibility. The current REST implementation supports one uploaded script reference.

Expected response includes `job_id`, `status`, `queued_at` or `submitted_at`, routing fields, input/script details, and artifact contract fields when returned by the API.

Common errors: missing `name`, `image`, or `workload_type`; invalid workload type; command or args too long; invalid environment values; missing or incomplete input IDs; insufficient funds; unavailable capacity; maintenance; authentication or scope failures.

```json
{
  "name": "transcribe-audio",
  "workload_type": "inference",
  "model_size": 7,
  "image": "python:3.11-slim",
  "command": ["python", "/workspace/scripts/transcribe.py", "/workspace/inputs/audio.ogg", "/workspace/artifacts/transcript.txt"],
  "script_files": [{ "input_id": "inp_script123" }],
  "input_files": [{ "input_id": "inp_audio123" }],
  "expected_artifacts": ["/workspace/artifacts/transcript.txt"],
  "routing_mode": "balanced",
  "metadata": {
    "request_id": "req_123"
  }
}
```

#### `upload_job_input`

Creates a signed upload slot. It does not upload file bytes by itself. Upload the bytes to `upload.upload_url` using `upload.method`, then complete the upload with `upload.complete_url` and the returned `upload.token`.

`kind` is an arbitrary string accepted by the API. Use `input` for normal input files and `script` for scripts by convention. Script uploads mount under `/workspace/scripts/<filename>`; input uploads mount under `/workspace/inputs/<filename>`.

Expected response:

```json
{
  "upload": {
    "input_id": "inp_123",
    "filename": "transcribe.py",
    "method": "PUT",
    "upload_url": "https://signed-upload.example",
    "token": "upload_token",
    "expires_at": "2026-06-11T12:15:00Z",
    "complete_url": "https://api.junglegrid.dev/v1/job-inputs/inp_123/complete"
  }
}
```

Common errors: missing filename, invalid filename, file too large, upload storage unavailable, authentication or scope failure.

#### `list_job_inputs`

Returns uploaded inputs with `input_id`, `filename`, `content_type`, `size_bytes`, `kind`, `status`, `ready`, `mount_path`, and timestamps when available.

#### `list_jobs`

Returns `jobs`, `limit`, `next_cursor`, and `has_more`. `limit` is capped by the API. `status` is a free-form filter string passed to the API; do not assume the MCP schema restricts it to a fixed enum.

#### `get_job`

Returns the current job status and details. Status, execution phase, lifecycle events, runtime details, and workload logs are separate surfaces.

Important response fields include `status`, `phase`, `execution_phase`, `status_message`, `status_reason`, `phase_started_at`, `phase_last_updated_at`, `wait_duration_seconds`, `delayed_start`, `delay_reason`, `scheduling`, `startup_diagnostics`, `provider`, `artifacts_ready`, `failure`, `input_files`, `script_file`, and `artifact_contract` when present.

#### `get_job_events`

Returns lifecycle events before and during execution. Events may exist before workload logs begin. Events include IDs, types, phases, titles, messages, source, level, timestamps, sequence, and a generated timestamp.

Use events to diagnose queueing, route selection, scheduling, provider provisioning, input preparation, startup, retries, failures, and cancellation.

#### `get_job_logs`

Returns stored log entries with `items`, `next_cursor`, `has_more`, `failure_highlight`, and `usage_hint` when available. Entries include `entry_id`, `source`, `category`, `stream`, `message`, `truncated`, and `created_at` when returned by the API.

Logs can be empty while a job is queued, scheduling, provisioning, or preparing. Call `get_job_events` when logs are empty but the job is not terminal. This MCP tool fetches persisted logs; it does not provide true streaming.

#### `cancel_job`

Requests cancellation for a pending, queued, assigned, starting, or running job. Completed, failed, rejected, or already cancelled jobs return a conflict from the API.

Expected response includes `job_id`, `status`, and `status_reason` when returned by the API. Cancellation may trigger managed teardown, but do not assume immediate infrastructure shutdown.

#### `list_artifacts`

Returns managed artifacts for a job. Artifacts include `artifact_id`, `job_id`, `filename`, `content_type`, `size_bytes`, `status`, `ready`, and timestamps when returned by the API. Failed jobs may have no artifacts or partial artifacts.

#### `get_artifact`

Creates temporary download information for one artifact. The API returns artifact metadata, a signed URL, and `expires_at`. Treat the URL as a secret.

Common errors: artifact not found, artifact not ready, artifact storage unavailable, forbidden job, authentication failure.

## Production Workflows

### Simple Job

1. Estimate:

```json
{
  "workload_type": "batch",
  "image": "python:3.11-slim",
  "command": ["python", "-c", "from pathlib import Path; Path('/workspace/artifacts/output.txt').write_text('done')"],
  "routing_mode": "balanced"
}
```

1. Submit:

```json
{
  "name": "simple-artifact-job",
  "workload_type": "batch",
  "image": "python:3.11-slim",
  "command": ["python", "-c", "from pathlib import Path; Path('/workspace/artifacts/output.txt').write_text('done')"],
  "expected_artifacts": ["/workspace/artifacts/output.txt"],
  "routing_mode": "balanced"
}
```

1. Monitor:

```json
{ "job_id": "job_123" }
```

Call `get_job`, `get_job_events`, and `get_job_logs` with the same `job_id` until the status is terminal.

1. Retrieve:

```json
{ "job_id": "job_123" }
```

Call `list_artifacts`, then:

```json
{
  "job_id": "job_123",
  "artifact_id": "art_123"
}
```

### File-Backed Job

1. Create upload slots:

```json
{
  "filename": "transcribe.py",
  "content_type": "text/x-python",
  "kind": "script"
}
```

```json
{
  "filename": "audio.ogg",
  "content_type": "audio/ogg",
  "kind": "input"
}
```

1. Upload each file to the returned signed `upload_url`, then complete it:

```sh
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: text/x-python" \
  --data-binary @transcribe.py

curl -X POST "$COMPLETE_URL" \
  -H "Authorization: Bearer $JUNGLE_GRID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "upload_token",
    "filename": "transcribe.py",
    "content_type": "text/x-python",
    "size_bytes": 1234,
    "etag": "optional-etag"
  }'
```

1. Submit with input IDs:

```json
{
  "name": "file-backed-transcription",
  "workload_type": "inference",
  "image": "python:3.11-slim",
  "command": ["python", "/workspace/scripts/transcribe.py", "/workspace/inputs/audio.ogg", "/workspace/artifacts/transcript.txt"],
  "script_files": [{ "input_id": "inp_script123" }],
  "input_files": [{ "input_id": "inp_audio123" }],
  "expected_artifacts": ["/workspace/artifacts/transcript.txt"]
}
```

1. Monitor with `get_job_events`, `get_job`, and `get_job_logs`.

1. Retrieve `/workspace/artifacts/transcript.txt` with `list_artifacts` and `get_artifact`.

## Error Shape

REST MCP routes return an envelope:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "name, image, and workload_type are required"
  }
}
```

The MCP server converts API errors into tool errors like:

```text
submit_job failed: INVALID_REQUEST: name, image, and workload_type are required
```

Common API codes include `UNAUTHORIZED`, `FORBIDDEN`, `INVALID_REQUEST`, `JOB_INPUT_NOT_FOUND`, `JOB_INPUT_NOT_READY`, `ARTIFACT_NOT_READY`, `NOT_FOUND`, `CONFLICT`, `INSUFFICIENT_FUNDS`, `MAINTENANCE_ACTIVE`, and `INTERNAL_ERROR`.

## Security

- Keep API keys and OAuth tokens out of prompts, source control, browser bundles, logs, and issue trackers.
- Prefer host secret stores or local-only MCP config files for `JUNGLE_GRID_API_KEY`.
- Treat signed upload and artifact URLs as temporary bearer secrets.
- Do not print environment variables that contain tokens from workload code.
- Review `submit_job` and `cancel_job` requests before allowing an agent to execute them, because they can spend credits or stop active work.

## Development

```sh
npm install
npm run build
npm test
```

Run stdio from the built package:

```sh
JUNGLE_GRID_API_KEY=jg_placeholder node dist/index.js
```

Run HTTP locally:

```sh
MCP_TRANSPORT=http PORT=3000 JUNGLEGRID_INTERNAL_SERVICE_TOKEN=service_token_placeholder node dist/index.js
```

Inspect with MCP Inspector:

```sh
JUNGLE_GRID_API_KEY=jg_placeholder npx @modelcontextprotocol/inspector node dist/index.js
```

## Full Documentation

Public Jungle Grid documentation: https://junglegrid.dev/docs

MCP documentation page: https://junglegrid.dev/docs/mcp

## License

MIT

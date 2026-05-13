# Contributing to Jungle Grid MCP Server

Thank you for contributing. This repository is intentionally small, so changes
should stay focused, easy to review, and aligned with the current runtime and
docs.

## Local Setup

1. Install Node.js 18 or newer.
2. Install dependencies:

   ```sh
   npm install
   ```

3. Create your local environment file:

   ```sh
   cp .env.example .env
   ```

4. Set `JUNGLE_GRID_API_KEY` in `.env`. Leave `JUNGLE_GRID_API_URL` on the
   default unless you are testing against a different orchestrator.
5. Build the server:

   ```sh
   npm run build
   ```

6. Run it locally:

   ```sh
   source .env
   node dist/index.js
   ```

To inspect the server interactively:

```sh
source .env
npx @modelcontextprotocol/inspector node dist/index.js
```

## Verification Commands

Run these before opening a pull request:

```sh
npm run build
npm test
```

`npm test` already performs a clean TypeScript build before running the Node
test suite, so there is no separate lint step in this repository yet.

## Picking Work

- Start with open issues that match the kind of change you want to make.
- If you want to work on a larger change, comment on the issue first so work is
  not duplicated.
- Documentation, tests, examples, CI, and packaging improvements are all valid
  contributions.
- Keep pull requests scoped to one issue or one tightly related fix set.

## Branch Naming

Use short descriptive branch names:

- `docs/readme-prompts`
- `test/tool-handler-coverage`
- `fix/docker-runtime`
- `chore/ci-workflow`

## Coding Expectations

- Follow the existing TypeScript style and keep changes minimal.
- Prefer clear runtime behavior over clever abstractions.
- Preserve public MCP tool names and output formatting unless the change
  intentionally updates user-facing behavior.
- Add or update tests when changing tool behavior, formatting, config handling,
  or API request construction.
- Keep examples and docs consistent with the actual package scripts and runtime
  requirements.

## Pull Request Checklist

- The branch is rebased on the latest `main`.
- The change is scoped and described clearly in the PR body.
- `npm run build` succeeds locally.
- `npm test` succeeds locally.
- Docs were updated if the change affects setup, examples, or user-visible
  behavior.
- Screenshots or command output are included when they materially help review.

## Issue Reports

When opening a bug or integration issue, include:

- package version
- MCP host or client
- operating system
- relevant environment variables with secrets removed
- reproduction steps
- expected behavior
- actual behavior

## Code of Conduct

All contributors are expected to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

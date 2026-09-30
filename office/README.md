# nyobakantorai — Office Next

This is the supported local dashboard/runtime surface.

## Run

```bash
npm run build
npm start
```

Default URL: `http://127.0.0.1:4322`.

Windows helpers:
- `START-NYOBAKANTORAI.bat`
- `STOP-NYOBAKANTORAI.bat`

## Configuration

Use environment variables from the repository-level `.env.example`. The app does not auto-load secrets from files.

Hermes is the reference runtime, while core-only mode remains supported. Hermes CLI execution is encapsulated behind the read-only Runtime Adapter boundary; `office/server.mjs` does not invoke Hermes directly. On Windows, the office auto-detects the upstream `%LOCALAPPDATA%\hermes` data directory; on POSIX it checks `~/.hermes`. Explicit `NYOBAKANTORAI_HERMES_HOME` / `HERMES_HOME` values take precedence. When no valid Hermes home exists, the office stays usable in fast offline mode and reports `runtime_adapter: none`.

For a fresh Hermes-backed setup, use the root installer or `node scripts/hermes-bootstrap.mjs`; see `docs/HERMES-FIRST-SETUP.md`.

Useful endpoints:
- `GET /api/health`
- `GET /api/capabilities`
- `GET /api/runtime`
- `GET /api/worker/tasks`

The server binds only to localhost, rejects cross-site requests, keeps dispatch disabled, and treats external/runtime claims as untrusted until reconciled.

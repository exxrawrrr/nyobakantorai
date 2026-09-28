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

Hermes is optional. When no valid Hermes home is detected/configured, the office stays fully usable in fast offline mode and reports `runtime_adapter: none`.

Useful endpoints:
- `GET /api/health`
- `GET /api/capabilities`
- `GET /api/runtime`
- `GET /api/worker/tasks`

The server binds only to localhost, rejects cross-site requests, keeps dispatch disabled, and treats external/runtime claims as untrusted until reconciled.

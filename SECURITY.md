# Security Policy

nyobakantorai is local-first and should default to least privilege.

## Never commit
- API keys, access tokens, cookies, or credentials
- `.env` files other than `.env.example`
- Hermes `auth.json`, session state, memories, databases, logs, or runtime caches
- local stop tokens or private keys

## Runtime safety
The main dashboard binds to `127.0.0.1`, validates same-origin requests, disables dispatch by default, and exposes only a read-only Hermes adapter. Keep those defaults unless you understand the consequences.

## Reporting
If you find a vulnerability, do not publish working credentials or exploit data in an issue. Report the smallest reproducible description to the repository owner through GitHub private contact channels.

Before every push, run:

```bash
npm run verify
```

# KANTORAI Gemini command plugin

This Hermes plugin registers one in-session slash command:

```text
/gemini <prompt>
```

The command bypasses the employee's normal LLM turn and calls the isolated Gemini specialist home directly. Normal Telegram messages remain on the employee's configured provider.

Safety properties:

- no API key is stored in this plugin;
- the Gemini credential remains in the operator-local shared Hermes home;
- failures such as 429/503 are reported honestly and do not silently fall back to Nous;
- receipts store only timestamp, profile, model, status, elapsed time, and a SHA-256 of the prompt;
- no Telegram bot token is read or modified.

Runtime discovery:

- shared Gemini home defaults to `<Hermes root>/shared/gemini-specialist`;
- override with `KANTORAI_GEMINI_HOME`;
- Hermes executable is discovered from `KANTORAI_HERMES_EXE`, PATH, or the current Hermes entrypoint.

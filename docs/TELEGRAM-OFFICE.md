# Telegram office path

**Status: IMPLEMENTED AS AN UPSTREAM HERMES PATH / NOT LIVE-ACCOUNT VERIFIED**

Telegram is optional. nyobakantorai does not bundle a bot token and never enables public bot access by default.

Hermes currently provides the gateway, Telegram adapter, profile routing, pairing/allowlists, cron delivery, and multi-profile multiplexing. Current upstream references:

- https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/messaging/telegram.md
- https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/multi-profile-gateways.md

## Configure an employee

Use the upstream profile-aware setup:

```bash
hermes -p maya gateway setup
```

Keep the BotFather token in the profile's Hermes runtime environment. Use an allowed-user list or Hermes pairing. Never enable unrestricted public access for a tool-capable bot.

Start/test the host gateway:

```bash
hermes gateway
hermes gateway install
hermes gateway start
hermes gateway status
```

## Multiplex the workforce

Current Hermes can serve multiple profiles from one host gateway while each profile keeps its own SOUL, config, skills, memory, sessions, and provider keys. Do not create sixteen competing gateway processes.

When migration is needed:

```bash
hermes gateway migrate --multiplex
hermes config set gateway.multiplex_profiles true
hermes gateway restart
```

A served profile can be parked/unparked without stopping the host:

```bash
hermes -p maya gateway stop
hermes -p maya gateway start
```

## Pairing

```bash
hermes pairing list
hermes pairing approve telegram <PAIRING_CODE>
hermes pairing revoke telegram <USER_ID>
```

Tokens, pairing state and allowed-user IDs remain runtime-owned and must never be committed.

## Scheduled delivery

Hermes cron can deliver through a configured home channel. Scheduled prompts should be self-contained because cron jobs run in fresh sessions.

```bash
hermes cron list
hermes cron status
```

Telegram is not required for normal installation or the localhost office.

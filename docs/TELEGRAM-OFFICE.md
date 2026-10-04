# Telegram office path

**Status: LIVE-ACCOUNT VERIFIED ON ONE OPERATOR INSTALLATION (2026-10-04) / OPTIONAL HERMES PATH**

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

On Windows, once the host gateway login item is installed, adding another employee bot should **not** reinstall the gateway or request UAC again. The safe pattern is:

1. configure the employee profile token + allowlist;
2. enable `platforms.telegram.enabled` for that profile;
3. keep `gateway.multiplex_profiles=true`;
4. reload the existing gateway once;
5. send a canary message and verify a real inbound reply.

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

A verified operator installation also set the tested employee chats as their Telegram home channels with `/sethome`.

## Live operator evidence — 2026-10-04

One Windows operator installation completed live Telegram/Hermes validation using a single multiplex gateway.

End-to-end role replies were observed for:

| Employee | Canonical role | Live Telegram result |
| --- | --- | --- |
| Siti | QA / Compliance / Knowledge | PASS — inbound prompt produced a role-correct reply |
| Alex | Strategy / Research | PASS — inbound prompt produced a role-correct reply |
| Paijo | Quant / Growth / Finance | PASS — inbound prompt produced a role-correct reply |
| Maya | Meta Ads Operator | PASS — inbound prompt produced a role-correct reply |
| Subagjo | Engineering / Operations | PASS — inbound prompt produced a role-correct reply |
| Sumiati | Creative / Communications | PENDING — Telegram profile intentionally disabled until a distinct bot token is available |

The same installation verified outbound Telegram delivery through Hermes and a running Windows login item for the host gateway.

### Provider-routing observation

The tested employee profiles were routed through a local Hermes proxy using a custom provider/model surface. The observed proxy listener was started with:

```text
hermes -p kantorai-proxy proxy start --provider nous --host 127.0.0.1 --port 8645
```

and employee profiles reported `custom` / `nous/welcome`.

This is **operator-local evidence**, not a repository default or billing guarantee. In this observed configuration, normal Telegram employee turns route to the Nous/Hermes provider path rather than the separate `openai-codex` reference runtime.

### Duplicate-token recovery

A live setup mistake demonstrated an important failure mode: the same Telegram bot token was accidentally entered for two employee profiles. That caused one bot identity to be shared across profiles.

Recovery was:

1. remove the accidental Telegram token + allowed-user binding from the wrong profile;
2. disable Telegram for that profile;
3. restart the single multiplex gateway once;
4. verify the intended owner profile can send successfully;
5. wait for a distinct BotFather token before re-enabling the second profile.

Operator tooling was then hardened to reject duplicate bot tokens and duplicate bot usernames within the same batch before configuration is saved.

This evidence proves that the Telegram path can work on one real operator installation. It does **not** prove universal provider lifecycle, unrestricted public access, or production reliability across arbitrary machines/accounts.

Telegram is not required for normal installation or the localhost office.

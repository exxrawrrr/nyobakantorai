# Manual handoff and evidence protocol

This package converts an existing BLOCKED task into a manual copy/paste packet and accepts bounded owner-submitted result records.

It does **not** open chats, dispatch agents, inherit plugins, authenticate an employee identity, or mark QA as complete.

## Example

```bash
python operations/handoff/packetctl.py t_12345678
```

Runtime packet, receipt, source-evidence, and QA folders are intentionally ignored by Git and must remain local.

The source gate can pin an original artifact by digest so later QA can verify that the reviewed bytes are the same bytes originally submitted.

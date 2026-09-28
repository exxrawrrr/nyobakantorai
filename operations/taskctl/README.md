# Task controller

Owner-controlled blocked-task intake for an optional local Hermes Kanban board.

The controller never starts a model, never dispatches a worker, and creates only `blocked` tasks after validating that gateway dispatch settings are disabled.

## Configuration

```text
NYOBAKANTORAI_HERMES_EXE=/path/to/hermes
NYOBAKANTORAI_HERMES_HOME=/path/to/.hermes
NYOBAKANTORAI_BOARD=nyobakantorai
```

## Commands

```bash
python operations/taskctl/taskctl.py doctor
python operations/taskctl/taskctl.py list
python operations/taskctl/taskctl.py create-blocked --employee subagjo --title "Review project" --goal "Inspect source safely" --request-id DEMO-001 --done "Evidence and rollback"
python operations/taskctl/taskctl.py handoff t_12345678
```

Task bodies reject common credential patterns and remain in BLOCKED state for manual owner review.

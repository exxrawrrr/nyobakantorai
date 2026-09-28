# Local safety doctor

Read-only diagnostics for an optional Hermes installation used with nyobakantorai.

The doctor checks configured profiles, local skill counts, toolset scope, dispatch gates, Kanban availability, and optional office runtime health. It does not call a model, print authentication material, start a gateway, or mutate a database.

## Configure

```text
NYOBAKANTORAI_HERMES_EXE=/path/to/hermes
NYOBAKANTORAI_HERMES_HOME=/path/to/.hermes
NYOBAKANTORAI_BOARD=nyobakantorai
NYOBAKANTORAI_PORT=4322
```

## Run

```bash
python operations/doctor/doctor.py
python operations/doctor/doctor.py --check-office
```

A FAIL means the expected local safety boundary could not be proven. It is not permission to repair or modify the environment automatically.

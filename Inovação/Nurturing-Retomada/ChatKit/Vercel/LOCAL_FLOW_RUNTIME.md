# Local Flow Runtime (Agent Builder Export)

This backend now supports two execution engines behind the same `/run-agent` endpoint:

- `chatkit_only` (default): legacy ChatKit session execution.
- `local_first`: tries local Python flow runtime first, falls back to ChatKit.
- `local_only`: executes only local Python flow runtime.

## Environment Variables

- `FLOW_RUNTIME_MODE`
  - Values: `chatkit_only`, `local_first`, `local_only`
  - Default: `chatkit_only`

- `LOCAL_FLOW_NDADOS_IDS`
  - Comma-separated workflow IDs routed to exported NDados flow adapter.
  - Default includes: `wf_69a712cef21c8190bcc1c573a9feaad40c5ca413b5fe04d2`
  - Example:
    - `LOCAL_FLOW_NDADOS_IDS=wf_abc,wf_def`

- `LOCAL_FLOWS_DIR`
  - Directory for exported flows. Runtime searches NDados only inside this folder.
  - Example:
    - `LOCAL_FLOWS_DIR=flows`

- `LOCAL_FLOW_NDADOS_FILE`
  - Optional file name inside `LOCAL_FLOWS_DIR`.
  - Example:
    - `LOCAL_FLOW_NDADOS_FILE=fluxo_Ndados.py`

- Existing variables remain in use:
  - `BRIDGE_AUTH_TOKEN`
  - `OPENAI_API_KEY`
  - `CHATKIT_RUN_PATHS`

## Current Behavior

- Request contract is unchanged:
  - `POST /run-agent`
  - body: `{ "workflow_id": "...", "payload": { ... } }`
  - response success: `{ "status": "success", "output": ... }`

- File location policy:
  - Runtime loads NDados flow exclusively from `ChatKit/Vercel/flows` (or `LOCAL_FLOWS_DIR`).
  - Recommended file path: `ChatKit/Vercel/flows/fluxo_Ndados.py`.

- Runtime search order (inside flows dir only):
  1. `LOCAL_FLOWS_DIR/LOCAL_FLOW_NDADOS_FILE` (if set)
  2. `LOCAL_FLOWS_DIR/fluxo_Ndados.py`

- If the exported file fails to import or execute, behavior depends on mode:
  - `local_first`: fallback to ChatKit execution.
  - `local_only`: returns execution error.

## Notes

- Exported Agent Builder code may still require manual fixes before it is runtime-safe.
- Keep this runtime opt-in until each exported flow is validated.

# Local Flow Runtime (Agent Builder Export)

This backend executes only local Python flow runtime behind `/run-agent`.

## Environment Variables

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

## Important: Where to Configure API Keys

- `OPENAI_API_KEY` must be configured in Vercel Environment Variables for this backend.
- Putting OpenAI key only in GAS `config.js` is not enough, because `/run-agent` calls OpenAI from Vercel server-side.
- Add `OPENAI_API_KEY` in Vercel for all environments you use:
  - Production
  - Preview
  - Development

## Current Behavior

- Request contract is unchanged:
  - `POST /run-agent`
  - body: `{ "workflow_id": "...", "payload": { ... } }`
  - response success: `{ "status": "success", "output": ... }`

- Workflow routing:
  - Runtime reads `workflow_id` directly from GAS request body.
  - No environment variable is used to whitelist workflow IDs.

- File location policy:
  - Runtime loads NDados flow exclusively from `ChatKit/Vercel/flows` (or `LOCAL_FLOWS_DIR`).
  - Recommended file path: `ChatKit/Vercel/flows/fluxo_Ndados.py`.

- Runtime search order (inside flows dir only):
  1. `LOCAL_FLOWS_DIR/LOCAL_FLOW_NDADOS_FILE` (if set)
  2. `LOCAL_FLOWS_DIR/fluxo_Ndados.py`

- If the exported file fails to import or execute, endpoint returns execution error directly.

## Notes

- Exported Agent Builder code may still require manual fixes before it is runtime-safe.

# Local Flow Runtime (Agent Builder Export)

This backend executes only local Python flow runtime behind `/run-agent`.

## Environment Variables

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
  - Runtime loads NDados flow exclusively from `ChatKit/Vercel/flows`.
  - Accepted file names:
    1. `ChatKit/Vercel/flows/fluxo-NDados.py`
    2. `ChatKit/Vercel/flows/fluxo_NDados.py`

- Runtime search order (fixed convention):
  1. `flows/fluxo-NDados.py`
  2. `flows/fluxo_NDados.py`

- If the exported file fails to import or execute, endpoint returns execution error directly.

## Notes

- Exported Agent Builder code may still require manual fixes before it is runtime-safe.

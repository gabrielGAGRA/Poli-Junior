import os
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, Dict, Any

try:
    # Preferred on Vercel where project root is on PYTHONPATH.
    from api.runtime import (
        FlowExecutionError,
        FlowNotImplementedError,
        UnknownWorkflowError,
        execute_local_flow,
    )
except Exception:
    # Fallback for local runs that execute from inside the api directory.
    from runtime import (  # type: ignore
        FlowExecutionError,
        FlowNotImplementedError,
        UnknownWorkflowError,
        execute_local_flow,
    )

app = FastAPI()


class AgentRequest(BaseModel):
    workflow_id: str
    payload: Dict[str, Any]


@app.post("/run-agent")
async def run_agent(
    request: AgentRequest, authorization: Optional[str] = Header(None)
):  # Validação de Segurança (Token definido no Vercel Env)
    bridge_token = (os.getenv("BRIDGE_AUTH_TOKEN") or "").strip()
    if bridge_token and authorization != f"Bearer {bridge_token}":
        raise HTTPException(status_code=401, detail="Não autorizado")

    try:
        local_output = await execute_local_flow(request.workflow_id, request.payload)
        return {"status": "success", "output": local_output}
    except UnknownWorkflowError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FlowNotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc))
    except FlowExecutionError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Erro inesperado no runtime local: {exc}",
        )

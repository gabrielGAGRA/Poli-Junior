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


def _is_summary_style_request(payload: Dict[str, Any]) -> bool:
    return (
        isinstance(payload, dict)
        and "nucleo" in payload
        and "nucleo_nome_completo" in payload
        and "cadencia" not in payload
        and "etapa" not in payload
    )


def _coerce_legacy_summary_output(output: Any) -> Any:
    if isinstance(output, str):
        return output

    if isinstance(output, dict):
        titulo = output.get("titulo")
        corpo_html = output.get("corpo_html")
        if isinstance(corpo_html, str):
            if isinstance(titulo, str) and titulo.strip():
                return f"<h2>{titulo}</h2>\n{corpo_html}"
            return corpo_html

    return output


@app.post("/run-agent")
async def run_agent(
    request: AgentRequest, authorization: Optional[str] = Header(None)
):  # Validação de Segurança (Token definido no Vercel Env)
    bridge_token = (os.getenv("BRIDGE_AUTH_TOKEN") or "").strip()
    if bridge_token and authorization != f"Bearer {bridge_token}":
        raise HTTPException(status_code=401, detail="Não autorizado")

    try:
        local_output = await execute_local_flow(request.workflow_id, request.payload)
        if _is_summary_style_request(request.payload):
            local_output = _coerce_legacy_summary_output(local_output)
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

import os
import json
import httpx
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, Dict, Any

app = FastAPI()


CHATKIT_BETA_HEADER = {"OpenAI-Beta": "chatkit_beta=v1"}


class AgentRequest(BaseModel):
    workflow_id: str
    payload: Dict[str, Any]


def _parse_run_paths() -> list[str]:
    # Allows quick rollout without redeploying code if OpenAI changes path names again.
    raw = os.getenv("CHATKIT_RUN_PATHS", "runs,responses")
    paths = [p.strip().lstrip("/") for p in raw.split(",") if p.strip()]
    return paths or ["runs"]


@app.post("/run-agent")
async def run_agent(
    request: AgentRequest, authorization: Optional[str] = Header(None)
):  # Validação de Segurança (Token definido no Vercel Env)
    if authorization != f"Bearer {os.getenv('BRIDGE_AUTH_TOKEN')}":
        raise HTTPException(status_code=401, detail="Não autorizado")

    api_key = os.getenv("OPENAI_API_KEY")

    # ENGENHARIA DE PAYLOAD: Separação de Input e Estado
    payload_copy = request.payload.copy()
    user_input = payload_copy.pop("input_as_text", "Processar.")
    pipedrive_owner_id = payload_copy.pop("owner_id", "poli-junior-system")

    # As 'State Variables' (cadencia, etapa, etc.) ficam aqui
    state_vars = payload_copy
    run_paths = _parse_run_paths()

    async with httpx.AsyncClient(timeout=280.0) as client:
        # 1. Criação da Sessão - Estrutura oficial 2026
        session_resp = await client.post(
            "https://api.openai.com/v1/chatkit/sessions",
            headers={
                "Authorization": f"Bearer {api_key}",
                **CHATKIT_BETA_HEADER,
            },
            json={
                "user": f"pj-consultor-{pipedrive_owner_id}",  # Obrigatório na raiz
                "workflow": {
                    "id": request.workflow_id,
                    "state_variables": state_vars,  # Obrigatório dentro de workflow
                },
            },
        )

        if session_resp.status_code != 200:
            # Isso vai te mostrar exatamente por que a OpenAI rejeitou (ex: variável faltando)
            error_detail = session_resp.text
            raise HTTPException(
                status_code=session_resp.status_code,
                detail=f"OpenAI Session Error: {error_detail}",
            )

        session_id = session_resp.json()["id"]
        session_request_id = session_resp.headers.get("x-request-id", "unknown")

        # 2. Execução usando o input_as_text extraído.
        # Compatibilidade: tenta múltiplos sufixos de endpoint para sobreviver a mudanças de API.
        invalid_url_errors: list[str] = []

        for run_path in run_paths:
            final_output = ""
            saw_delta_stream = False
            run_url = (
                f"https://api.openai.com/v1/chatkit/sessions/{session_id}/{run_path}"
            )

            async with client.stream(
                "POST",
                run_url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    **CHATKIT_BETA_HEADER,
                },
                json={"input": user_input},
            ) as response:
                run_request_id = response.headers.get("x-request-id", "unknown")

                if response.status_code != 200:
                    body = (await response.aread()).decode("utf-8", errors="replace")

                    # Alguns ambientes ainda retornam 404 com "Invalid URL" para endpoints removidos.
                    if response.status_code == 404 and "Invalid URL" in body:
                        invalid_url_errors.append(f"{run_url} -> {body.strip()}")
                        continue

                    raise HTTPException(
                        status_code=response.status_code,
                        detail=(
                            "OpenAI Run Error: "
                            f"url={run_url}, "
                            f"session_request_id={session_request_id}, "
                            f"run_request_id={run_request_id}, body={body}"
                        ),
                    )

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue

                    raw = line[6:].strip()
                    if not raw or raw == "[DONE]":
                        continue

                    try:
                        event = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    event_type = event.get("type")

                    # Legacy stream shape used by old /runs endpoint.
                    if (
                        event_type == "thread.item.done"
                        and event.get("item", {}).get("role") == "assistant"
                    ):
                        content_parts = event.get("item", {}).get("content", [])
                        for part in content_parts:
                            if part.get("type") == "text":
                                final_output += part.get("text", {}).get("value", "")

                    # Responses-style stream shape.
                    elif event_type == "response.output_text.delta":
                        saw_delta_stream = True
                        final_output += event.get("delta", "")
                    elif (
                        not saw_delta_stream
                        and event_type == "response.output_item.done"
                        and event.get("item", {}).get("type") == "message"
                    ):
                        content_parts = event.get("item", {}).get("content", [])
                        for part in content_parts:
                            if part.get("type") == "output_text":
                                final_output += part.get("text", "")

                    if event_type in ("run.done", "response.completed"):
                        break

                return {"status": "success", "output": final_output}

        raise HTTPException(
            status_code=501,
            detail=(
                "ChatKit run endpoint unavailable for current API version. "
                f"Tried paths={run_paths}. "
                f"Session request id={session_request_id}. "
                f"Errors={invalid_url_errors}"
            ),
        )

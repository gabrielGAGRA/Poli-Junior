import os
import json
import httpx
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, Dict, Any

app = FastAPI()


class AgentRequest(BaseModel):
    workflow_id: str
    payload: Dict[str, Any]


@app.post("/run-agent")
async def run_agent(
    request: AgentRequest, authorization: Optional[str] = Header(None)
):  # Validação de Segurança (Token definido no Vercel Env)
    if authorization != f"Bearer {os.getenv('BRIDGE_AUTH_TOKEN')}":
        raise HTTPException(status_code=401, detail="Não autorizado")

    api_key = os.getenv("OPENAI_API_KEY")

    # SEPARAÇÃO DE ENGENHARIA: Input vs State
    # Extraímos 'input_as_text' para ser o gatilho, o resto vira contexto (state)
    payload_copy = request.payload.copy()
    user_input = payload_copy.pop("input_as_text", "Processar dados.")

    # EXTRAÇÃO DO ID DO OWNER
    # Removemos do payload de estado para não confundir o Agent Builder,
    # mas usamos para identificar a sessão na OpenAI.
    pipedrive_owner_id = payload_copy.pop("owner_id", "poli-junior-system")

    state_vars = payload_copy

    async with httpx.AsyncClient(timeout=280.0) as client:
        # 1. Criação da Sessão - Agora com state_variables limpas
        session_resp = await client.post(
            "https://api.openai.com/v1/chatkit/sessions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "OpenAI-Beta": "chatkit_beta=v1",
            },
            json={
                "workflow": {"id": request.workflow_id},
                "state_variables": state_vars,
                "user": f"pj-consultor-{pipedrive_owner_id}",  # <--- ID Dinâmico
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

        # 2. Execução do Run usando o input_as_text extraído
        final_output = ""
        async with client.stream(
            "POST",
            f"https://api.openai.com/v1/chatkit/sessions/{session_id}/runs",
            headers={
                "Authorization": f"Bearer {api_key}",
                "OpenAI-Beta": "chatkit_beta=v1",
            },
            json={"input": user_input},  # O conteúdo bruto entra aqui
        ) as response:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    event = json.loads(line[6:])

                    # Captura a mensagem final do assistente (Turno Concluído)
                    if (
                        event.get("type") == "thread.item.done"
                        and event["item"].get("role") == "assistant"
                    ):
                        content_parts = event["item"].get("content", [])
                        for part in content_parts:
                            if part.get("type") == "text":
                                final_output += part["text"]["value"]

                    if event.get("type") == "run.done":
                        break

        return {"status": "success", "output": final_output}

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
async def run_agent(request: AgentRequest, authorization: Optional[str] = Header(None)):
    # Validação de Segurança (Token definido no Vercel Env)
    if authorization != f"Bearer {os.getenv('BRIDGE_AUTH_TOKEN')}":
        raise HTTPException(status_code=401, detail="Não autorizado")

    api_key = os.getenv("OPENAI_API_KEY")

    async with httpx.AsyncClient(timeout=120.0) as client:
        # 1. Inicia a Sessão no ChatKit via API (Proxy para o Agent Builder)
        # O workflow_id aciona a lógica visual definida na UI da OpenAI
        session_resp = await client.post(
            "https://api.openai.com/v1/chatkit/sessions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "OpenAI-Beta": "chatkit_beta=v1",
            },
            json={
                "workflow": {"id": request.workflow_id},
                "state_variables": request.payload,  # Dados do Pipedrive entram aqui
            },
        )

        if session_resp.status_code != 200:
            raise HTTPException(
                status_code=session_resp.status_code, detail="Erro ao criar sessão"
            )

        session_id = session_resp.json()["id"]

        # 2. Executa o Turno e processa o Stream de eventos
        final_output = ""
        async with client.stream(
            "POST",
            f"https://api.openai.com/v1/chatkit/sessions/{session_id}/runs",
            headers={
                "Authorization": f"Bearer {api_key}",
                "OpenAI-Beta": "chatkit_beta=v1",
            },
            json={
                "input": "Processe os dados e gere o conteúdo conforme as instruções do workflow."
            },
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

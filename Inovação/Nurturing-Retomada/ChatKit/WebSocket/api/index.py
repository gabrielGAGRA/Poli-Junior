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
    # Validação de segurança simples
    if authorization != f"Bearer {os.getenv('BRIDGE_AUTH_TOKEN')}":
        raise HTTPException(status_code=401, detail="Unauthorized")

    api_key = os.getenv("OPENAI_API_KEY")

    async with httpx.AsyncClient(timeout=60.0) as client:
        # 1. Cria a sessão para o workflow_id específico
        # Endpoint oficial de 2026 para sessões do ChatKit
        session_resp = await client.post(
            "https://api.openai.com/v1/chatkit/sessions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "OpenAI-Beta": "chatkit_beta=v1",
            },
            json={
                "workflow": {"id": request.workflow_id},
                "state_variables": request.payload,
            },
        )

        if session_resp.status_code != 200:
            raise HTTPException(
                status_code=500, detail="Falha ao criar sessão no ChatKit"
            )

        session_data = session_resp.json()
        session_id = session_data["id"]

        # 2. Executa o workflow e coleta a resposta
        # Nota: O protocolo do ChatKit pode usar SSE para streaming
        final_text = ""
        async with client.stream(
            "POST",
            f"https://api.openai.com/v1/chatkit/sessions/{session_id}/runs",
            headers={
                "Authorization": f"Bearer {api_key}",
                "OpenAI-Beta": "chatkit_beta=v1",
            },
            json={
                "input": "Execute o processo de redação/resumo com base nos dados fornecidos."
            },
        ) as response:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = json.loads(line[6:])
                    # Procuramos pelo evento de conclusão do turno do agente
                    if (
                        data.get("type") == "thread.item.done"
                        and data["item"].get("type") == "message"
                    ):
                        # Captura o conteúdo da mensagem do assistente
                        content = data["item"]["content"]
                        for part in content:
                            if part["type"] == "text":
                                final_text += part["text"]["value"]

                    if data.get("type") == "run.done":
                        break

        return {"status": "success", "output": final_text}

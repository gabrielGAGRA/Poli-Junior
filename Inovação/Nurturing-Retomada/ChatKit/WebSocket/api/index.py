import os
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, Dict, Any
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


class AgentRequest(BaseModel):
    workflow_id: str
    payload: Dict[str, Any]


@app.get("/health")
def health_check():
    return {"status": "online", "engine": "OpenAI Agent Builder Proxy"}


@app.post("/run-agent")
async def run_agent(request: AgentRequest, authorization: Optional[str] = Header(None)):
    """
    Endpoint que converte HTTPS POST em WebSocket Session.
    """
    expected_token = f"Bearer {os.getenv('BRIDGE_AUTH_TOKEN')}"
    if authorization != expected_token:
        raise HTTPException(status_code=401, detail="Não autorizado")

    try:
        # Inicia uma sessão de WebSocket com o Agent Builder (ChatKit Protocol)
        # O SDK gerencia o handshake e a manutenção da conexão em background
        async with client.agents.responses.subscribe(
            workflow_id=request.workflow_id
        ) as session:

            # Injeta o payload do Pipedrive no fluxo do Agente
            # O Agente na UI da OpenAI deve estar configurado para receber este JSON
            await session.send_input(request.payload)

            # Aguarda a resposta final (Final Turn) do workflow
            # Isso permite que o Agente execute múltiplos passos internos antes de responder
            final_output = ""
            async for event in session:
                if event.type == "agent.response.done":
                    # Captura o output estruturado (JSON) definido no Agent Builder
                    final_output = event.response.output_text
                    break
                elif event.type == "error":
                    raise Exception(f"Erro no Agente: {event.message}")

            if not final_output:
                raise HTTPException(
                    status_code=500, detail="O Agente não retornou um output válido."
                )

            return {"status": "success", "output": final_output}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8080)))

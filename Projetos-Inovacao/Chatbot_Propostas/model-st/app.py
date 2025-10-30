import base64
import streamlit as st
import openai
import time
import os
import json
import tiktoken
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from pydantic import BaseModel
from google import genai
from google.genai import types
import hashlib
import io

# ==================== CONFIGURAÇÕES E CONSTANTES ====================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONVERSATIONS_DIR = os.path.join(SCRIPT_DIR, "conversations")
os.makedirs(CONVERSATIONS_DIR, exist_ok=True)

# ==================== MODELOS DE DADOS ====================


class AssistantConfig(BaseModel):
    id: str
    name: str
    description: str
    model: str = "gpt-4-turbo-preview"
    temperature: float = 0.7
    supports_files: bool = False
    supports_code_interpreter: bool = False


class Message(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None


class Conversation(BaseModel):
    id: str
    name: str
    messages: List[Message] = []
    assistant_key: str
    created_at: str
    updated_at: str


# ==================== ASSISTENTES DISPONÍVEIS ====================

AVAILABLE_ASSISTANTS: Dict[str, AssistantConfig] = {
    "ata_para_proposta": AssistantConfig(
        id="workflow",
        name="🔄 Ata para Proposta (Workflow Completo)",
        description="Automatiza organização de ata + pesquisa insights + criação de proposta",
        supports_files=True,
    ),
    "organizador_atas": AssistantConfig(
        id="asst_gl4svzGMPxoDMYskRHzK62Fk",
        name="📋 Organizador de Atas",
        description="Especialista em organizar e estruturar atas de reunião",
        supports_files=True,
    ),
    "criador_propostas": AssistantConfig(
        id="asst_Fgsu6icqZ8EqjlnC89TKSLk7",
        name="💼 Criador de Propostas Comerciais",
        description="Especialista em criar propostas comerciais persuasivas",
        supports_code_interpreter=True,
    ),
    "pesquisador_insights": AssistantConfig(
        id="gemini-2.5-pro",
        name="🔍 Pesquisador de Insights",
        description="Inteligência de Mercado com Google Search (Gemini)",
    ),
}

DEFAULT_ASSISTANT = "ata_para_proposta"

# ==================== INICIALIZAÇÃO ====================


def initialize_client():
    """Inicializa o cliente OpenAI com tratamento de erros"""
    try:
        api_key = st.secrets.get("OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
        if not api_key:
            st.error("❌ API Key da OpenAI não configurada!", icon="🚨")
            st.stop()
        return openai.OpenAI(api_key=api_key)
    except Exception as e:
        st.error(f"❌ Erro ao inicializar cliente OpenAI: {e}", icon="🚨")
        st.stop()


def initialize_session_state():
    """Inicializa todas as variáveis de sessão"""
    defaults = {
        "session_id": f"session_{int(time.time())}",
        "messages": [],
        "thread_id": None,
        "assistant_key": DEFAULT_ASSISTANT,
        "current_conversation_id": None,
        "conversations": load_all_conversations(),
        "uploaded_files": [],
        "stop_generation": False,
    }

    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


# ==================== GERENCIAMENTO DE CONVERSAS ====================


def generate_conversation_id() -> str:
    """Gera ID único para conversas"""
    return hashlib.md5(f"{time.time()}".encode()).hexdigest()[:12]


def save_conversation(conversation: Conversation):
    """Salva conversa em arquivo JSON"""
    filepath = os.path.join(CONVERSATIONS_DIR, f"{conversation.id}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(conversation.dict(), f, ensure_ascii=False, indent=2)


def load_conversation(conversation_id: str) -> Optional[Conversation]:
    """Carrega conversa do arquivo"""
    filepath = os.path.join(CONVERSATIONS_DIR, f"{conversation_id}.json")
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
            return Conversation(**data)
    except FileNotFoundError:
        return None


def load_all_conversations() -> List[Conversation]:
    """Carrega todas as conversas salvas"""
    conversations = []
    for filename in os.listdir(CONVERSATIONS_DIR):
        if filename.endswith(".json"):
            conv_id = filename.replace(".json", "")
            conv = load_conversation(conv_id)
            if conv:
                conversations.append(conv)
    return sorted(conversations, key=lambda x: x.updated_at, reverse=True)


def delete_conversation(conversation_id: str):
    """Deleta uma conversa"""
    filepath = os.path.join(CONVERSATIONS_DIR, f"{conversation_id}.json")
    if os.path.exists(filepath):
        os.remove(filepath)


def create_new_conversation() -> Conversation:
    """Cria uma nova conversa"""
    now = datetime.now().isoformat()
    return Conversation(
        id=generate_conversation_id(),
        name=f"Nova Conversa - {datetime.now().strftime('%d/%m %H:%M')}",
        assistant_key=st.session_state.assistant_key,
        created_at=now,
        updated_at=now,
    )


# ==================== UTILITÁRIOS ====================


def format_message_for_download(messages: List[Message]) -> str:
    """Formata mensagens para download em Markdown"""
    output = "# Conversa Exportada\n\n"
    output += f"**Data:** {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}\n\n"
    output += "---\n\n"

    for msg in messages:
        role = "🧑 **Você**" if msg.role == "user" else "🤖 **Assistente**"
        output += f"### {role}\n\n{msg.content}\n\n"
        if msg.timestamp:
            output += f"*{msg.timestamp}*\n\n"
        output += "---\n\n"

    return output


# ==================== HANDLERS DE STREAMING ====================


class StreamingEventHandler(openai.AssistantEventHandler):
    def __init__(self, text_placeholder):
        super().__init__()
        self.text_placeholder = text_placeholder
        self.full_response = ""
        self.start_time = time.time()

    def on_text_delta(self, delta, snapshot):
        if st.session_state.stop_generation:
            raise Exception("Generation stopped by user")

        self.full_response += delta.value
        self.text_placeholder.markdown(self.full_response + "▌")

    def on_text_done(self, text):
        self.text_placeholder.markdown(self.full_response)

    def on_exception(self, exception):
        if "stopped by user" not in str(exception):
            st.error(f"❌ Erro: {exception}")

    def get_full_response(self):
        return self.full_response


# ==================== FUNÇÕES DE PROCESSAMENTO ====================


def upload_file_to_openai(file) -> Optional[str]:
    """Upload de arquivo para OpenAI"""
    try:
        file_bytes = file.read()
        file_like = io.BytesIO(file_bytes)
        file_like.name = file.name

        uploaded_file = client.files.create(file=file_like, purpose="assistants")
        return uploaded_file.id
    except Exception as e:
        st.error(f"❌ Erro ao fazer upload: {e}")
        return None


def process_with_assistant(prompt: str, file_ids: Optional[List[str]] = None) -> str:
    # Get assistant configuration from session state
    assistant_info = AVAILABLE_ASSISTANTS[st.session_state.assistant_key]

    # Criar thread se não existir
    if not st.session_state.thread_id:
        thread = client.beta.threads.create()
        st.session_state.thread_id = thread.id

    # Preparar mensagem
    message_params = {
        "thread_id": st.session_state.thread_id,
        "role": "user",
        "content": prompt,
    }

    if file_ids:
        message_params["attachments"] = [
            {"file_id": fid, "tools": [{"type": "code_interpreter"}]}
            for fid in file_ids
        ]

    # Adicionar mensagem
    client.beta.threads.messages.create(**message_params)

    # Streaming da resposta
    response_placeholder = st.empty()
    handler = StreamingEventHandler(response_placeholder)

    with client.beta.threads.runs.stream(
        thread_id=st.session_state.thread_id,
        assistant_id=assistant_info.id,
        event_handler=handler,
    ) as stream:
        stream.until_done()

    response = handler.get_full_response()

    return response


def process_insights_research(
    contexto_negocio: str, instrucao_pesquisa: Optional[str] = None
) -> Optional[str]:
    """Pesquisa com Gemini (mantido do código original)"""
    # ...existing code...
    try:
        gemini_client = genai.Client(
            api_key=st.secrets.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")
        )

        if not instrucao_pesquisa:
            instrucao_pesquisa = f"""Pesquise os principais desafios e tendências de mercado relevantes para o seguinte contexto de negócio. 
            Foque em insights de consultorias renomadas (McKinsey, BCG, Accenture, Bain, PwC) que possam fundamentar uma proposta comercial."""

        prompt_completo = f"""{instrucao_pesquisa}

**CONTEXTO DO NEGÓCIO:**
{contexto_negocio}
"""

        contents = [
            types.Content(
                role="user", parts=[types.Part.from_text(text=prompt_completo)]
            )
        ]
        tools = [types.Tool(googleSearch=types.GoogleSearch())]

        generate_content_config = types.GenerateContentConfig(
            temperature=0.7,
            thinking_config=types.ThinkingConfig(thinking_budget=-1),
            tools=tools,
            system_instruction=[
                types.Part.from_text(
                    text="""Você é um Agente de IA especialista em Inteligência de Mercado..."""
                )
            ],
        )

        full_response = ""
        for chunk in gemini_client.models.generate_content_stream(
            model="gemini-2.5-pro",
            contents=contents,
            config=generate_content_config,
        ):
            if hasattr(chunk, "text"):
                full_response += chunk.text

        return full_response

    except Exception as e:
        st.error(f"Erro durante a pesquisa de insights: {e}", icon="🚨")
        return None


def process_ata_to_proposal_workflow(user_prompt: str):
    """Workflow completo (mantido do código original)"""
    # ...existing code...
    pass


# ==================== INTERFACE SIDEBAR ====================


def render_sidebar():
    """Renderiza sidebar com gerenciamento de conversas"""
    with st.sidebar:
        st.title("💬 Agente Comercial")

        # Botão Nova Conversa
        if st.button("➕ Nova Conversa", use_container_width=True, type="primary"):
            new_conv = create_new_conversation()
            st.session_state.current_conversation_id = new_conv.id
            st.session_state.messages = []
            st.session_state.thread_id = None
            st.session_state.uploaded_files = []
            st.session_state.conversations.append(new_conv)
            save_conversation(new_conv)
            st.rerun()

        st.markdown("---")

        # Histórico de Conversas
        st.subheader("📚 Conversas Recentes")

        for conv in st.session_state.conversations[:10]:  # Últimas 10
            col1, col2, col3 = st.columns([3, 1, 1])

            with col1:
                if st.button(
                    f"💬 {conv.name[:25]}...",
                    key=f"load_{conv.id}",
                    use_container_width=True,
                    type=(
                        "secondary"
                        if conv.id != st.session_state.current_conversation_id
                        else "primary"
                    ),
                ):
                    st.session_state.current_conversation_id = conv.id
                    st.session_state.messages = [msg.dict() for msg in conv.messages]
                    st.session_state.assistant_key = conv.assistant_key
                    st.rerun()

            with col2:
                if st.button("✏️", key=f"rename_{conv.id}"):
                    st.session_state[f"renaming_{conv.id}"] = True

            with col3:
                if st.button("🗑️", key=f"delete_{conv.id}"):
                    delete_conversation(conv.id)
                    st.session_state.conversations = load_all_conversations()
                    if conv.id == st.session_state.current_conversation_id:
                        st.session_state.messages = []
                        st.session_state.current_conversation_id = None
                    st.rerun()

            # Renomear
            if st.session_state.get(f"renaming_{conv.id}", False):
                new_name = st.text_input(
                    "Novo nome:", value=conv.name, key=f"new_name_{conv.id}"
                )
                if st.button("✅ Salvar", key=f"save_name_{conv.id}"):
                    conv.name = new_name
                    save_conversation(conv)
                    st.session_state[f"renaming_{conv.id}"] = False
                    st.rerun()

        st.markdown("---")

        # Seletor de Assistente
        st.subheader("⚙️ Configurações")

        assistant_options = {
            key: assistant.name for key, assistant in AVAILABLE_ASSISTANTS.items()
        }

        selected_assistant_key = st.selectbox(
            label="🤖 Assistente:",
            options=assistant_options.keys(),
            format_func=lambda key: assistant_options[key],
            key="selected_assistant",
            index=list(assistant_options.keys()).index(st.session_state.assistant_key),
        )

        if selected_assistant_key != st.session_state.assistant_key:
            if st.session_state.messages:
                st.warning("⚠️ Mudar de assistente iniciará nova conversa")
                if st.button("✅ Confirmar", use_container_width=True):
                    st.session_state.assistant_key = selected_assistant_key
                    new_conv = create_new_conversation()
                    st.session_state.current_conversation_id = new_conv.id
                    st.session_state.messages = []
                    st.session_state.thread_id = None
                    st.rerun()
            else:
                st.session_state.assistant_key = selected_assistant_key

        assistant_info = AVAILABLE_ASSISTANTS[st.session_state.assistant_key]
        st.info(assistant_info.description, icon="ℹ️")

        # Upload de Arquivos
        if assistant_info.supports_files or assistant_info.supports_code_interpreter:
            st.markdown("---")
            st.subheader("📎 Upload de Arquivos")
            uploaded_file = st.file_uploader(
                "Anexar arquivo",
                type=["txt", "pdf", "docx", "png", "jpg", "jpeg", "csv", "json"],
                key="file_uploader",
            )

            if uploaded_file and st.button("⬆️ Enviar Arquivo"):
                with st.spinner("Fazendo upload..."):
                    file_id = upload_file_to_openai(uploaded_file)
                    if file_id:
                        st.session_state.uploaded_files.append(
                            {"name": uploaded_file.name, "id": file_id}
                        )
                        st.success(f"✅ {uploaded_file.name} enviado!")

            # Arquivos enviados
            if st.session_state.uploaded_files:
                st.write("**Arquivos anexados:**")
                for file in st.session_state.uploaded_files:
                    col1, col2 = st.columns([4, 1])
                    with col1:
                        st.text(f"📄 {file['name']}")
                    with col2:
                        if st.button("❌", key=f"remove_{file['id']}"):
                            st.session_state.uploaded_files.remove(file)
                            st.rerun()

        # Logos
        st.markdown("<br>" * 3, unsafe_allow_html=True)
        logo_col1, logo_col2, logo_col3 = st.columns([1, 2, 1])
        with logo_col2:
            st.markdown(
                """
                <div style="position: relative; display: flex; justify-content: center;">
                    <img src="data:image/png;base64,{}" width="100" />
                    <img src="data:image/png;base64,{}" width="60" 
                         style="position: absolute; bottom: -30px; right: -40px;" />
                </div>
                """.format(
                    base64.b64encode(
                        open(
                            os.path.join(SCRIPT_DIR, "assets", "img", "NDados.png"),
                            "rb",
                        ).read()
                    ).decode(),
                    base64.b64encode(
                        open(
                            os.path.join(
                                SCRIPT_DIR, "assets", "img", "Poli Junior.png"
                            ),
                            "rb",
                        ).read()
                    ).decode(),
                ),
                unsafe_allow_html=True,
            )


# ==================== INTERFACE PRINCIPAL ====================


def render_message_actions(message_index: int):
    """Renderiza ações para cada mensagem"""
    col1, col2, col3, col4 = st.columns([1, 1, 1, 8])

    with col1:
        if st.button("📋", key=f"copy_{message_index}", help="Copiar"):
            st.code(st.session_state.messages[message_index]["content"])


def main():
    """Função principal"""
    global client

    # Inicializações
    client = initialize_client()
    initialize_session_state()

    # Configuração da página
    st.set_page_config(
        page_title="Agente Comercial - NDados",
        page_icon=os.path.join(SCRIPT_DIR, "assets", "img", "NDados.png"),
        layout="wide",
        initial_sidebar_state="expanded",
    )

    # CSS (mantido do código original)
    st.markdown(
        """
    <style>
    /* ...existing code... (seu CSS completo aqui) */
    </style>
    """,
        unsafe_allow_html=True,
    )

    # Renderizar sidebar
    render_sidebar()

    # Interface principal
    assistant_info = AVAILABLE_ASSISTANTS[st.session_state.assistant_key]

    st.markdown(f"## {assistant_info.name}")

    # Mensagem inicial
    if not st.session_state.messages:
        st.info(
            f"👋 Como posso ajudar hoje? Estou configurado como **{assistant_info.name}**"
        )

    # Exibir mensagens
    for idx, msg in enumerate(st.session_state.messages):
        avatar_img = (
            os.path.join(SCRIPT_DIR, "assets", "img", "user.png")
            if msg["role"] == "user"
            else os.path.join(SCRIPT_DIR, "assets", "img", "gpt.png")
        )

        with st.chat_message(msg["role"], avatar=avatar_img):
            st.markdown(msg["content"])

            # Metadados
            if msg.get("timestamp"):
                st.caption(f"🕐 {msg['timestamp']}")

            # Ações (apenas para mensagens do assistente)
            if msg["role"] == "assistant":
                render_message_actions(idx)

    # Botões de controle
    col1, col2, col3, col4 = st.columns([2, 2, 2, 6])

    with col1:
        if st.button("⬇️ Exportar Chat", use_container_width=True):
            markdown_content = format_message_for_download(
                [Message(**msg) for msg in st.session_state.messages]
            )
            st.download_button(
                label="💾 Download MD",
                data=markdown_content,
                file_name=f"conversa_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md",
                mime="text/markdown",
                use_container_width=True,
            )

    with col2:
        if st.session_state.messages:
            if st.button("🔄 Regenerar", use_container_width=True):
                # Remove última resposta e regenera
                if len(st.session_state.messages) >= 2:
                    st.session_state.messages.pop()  # Remove resposta do assistente
                    last_user_msg = st.session_state.messages[-1]["content"]
                    st.rerun()

    with col3:
        if st.session_state.get("generating", False):
            if st.button("⏹️ Parar", use_container_width=True, type="primary"):
                st.session_state.stop_generation = True

    # Input do chat
    if prompt := st.chat_input("Digite sua mensagem aqui..."):
        st.session_state.stop_generation = False

        # Adicionar mensagem do usuário
        user_message = Message(
            role="user", content=prompt, timestamp=datetime.now().strftime("%H:%M:%S")
        )
        st.session_state.messages.append(user_message.dict())

        # Exibir mensagem do usuário
        with st.chat_message(
            "user", avatar=os.path.join(SCRIPT_DIR, "assets", "img", "user.png")
        ):
            st.markdown(prompt)

        # Processar resposta
        with st.chat_message(
            "assistant", avatar=os.path.join(SCRIPT_DIR, "assets", "img", "gpt.png")
        ):
            st.session_state.generating = True

            try:
                file_ids = [f["id"] for f in st.session_state.uploaded_files]

                if st.session_state.assistant_key == "ata_para_proposta":
                    process_ata_to_proposal_workflow(prompt)
                elif st.session_state.assistant_key == "pesquisador_insights":
                    response = process_insights_research(prompt)
                    if response:
                        st.markdown(response)
                        assistant_message = Message(
                            role="assistant",
                            content=response,
                            timestamp=datetime.now().strftime("%H:%M:%S"),
                        )
                        st.session_state.messages.append(assistant_message.dict())
                else:
                    response = process_with_assistant(prompt, file_ids)

                    assistant_message = Message(
                        role="assistant",
                        content=response,
                        timestamp=datetime.now().strftime("%H:%M:%S"),
                    )
                    st.session_state.messages.append(assistant_message.dict())

                # Salvar conversa
                if st.session_state.current_conversation_id:
                    conv = load_conversation(st.session_state.current_conversation_id)
                    if conv:
                        conv.messages = [
                            Message(**msg) for msg in st.session_state.messages
                        ]
                        conv.updated_at = datetime.now().isoformat()
                        save_conversation(conv)

            except Exception as e:
                if "stopped by user" in str(e):
                    st.warning("⏹️ Geração interrompida pelo usuário")
                else:
                    st.error(f"❌ Erro: {e}")
                st.session_state.messages.pop()  # Remove mensagem com erro

            finally:
                st.session_state.generating = False


if __name__ == "__main__":
    main()

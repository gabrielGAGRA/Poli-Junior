import base64
import streamlit as st
import openai
import time
import os
import json
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
        id="gemini-2.5-flash",
        name="🔍 Pesquisador de Insights para Proposta",
        description="Inteligência de Mercado com Google Search (Gemini)",
    ),
    "pesquisador_tendencias": AssistantConfig(
        id="gemini-2.5-flash",
        name="📈 Pesquisador de Tendências para AT",
        description="Análise de Tendências de Mercado com Google Search (Gemini)",
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
        json.dump(conversation.model_dump(), f, ensure_ascii=False, indent=2)


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

    # Anexar arquivos de acordo com o tipo de ferramenta do assistente
    if file_ids:
        if assistant_info.supports_code_interpreter:
            # Para assistentes com Code Interpreter (ex: análise de dados, gráficos)
            message_params["attachments"] = [
                {"file_id": fid, "tools": [{"type": "code_interpreter"}]}
                for fid in file_ids
            ]
        elif assistant_info.supports_files:
            # Para assistentes com Vector Store/File Search (RAG)
            message_params["attachments"] = [
                {"file_id": fid, "tools": [{"type": "file_search"}]} for fid in file_ids
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
    """
    Executa pesquisa de insights usando Gemini com Google Search
    """
    try:
        # Inicializa o cliente Gemini
        gemini_client = genai.Client(
            api_key=st.secrets.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")
        )

        # System instruction para pesquisador de insights
        system_instruction = """
Você é um Agente de IA especialista em pesquisa de mercado e inteligência de negócios para DADOS, ANALYTICS, INTELIGENCIA ARTIFICIAL e BUSINESS INTELLIGENCE.

REGRAS DE PESQUISA:

1.  **REGRA CRÍTICA DE VERACIDADE:** Você DEVE usar sua ferramenta de busca interna para encontrar fontes e links REAIS. É terminantemente proibido inventar (alucinar) links, fontes ou URLs. A precisão do link é sua prioridade máxima.

2.  **FLEXIBILIDADE DE FONTE:** Dê preferência a fontes de alta credibilidade (McKinsey, BCG, Bain, Accenture, Gartner, HBR). Contudo, um link REAL de uma fonte confiável (ex: Forbes, TechCrunch, relatórios de indústria) é MIL VEZES melhor do que um link falso ou quebrado de uma fonte prioritária.

3.  **FOCO:** Mantenha o foco em transformação digital, data-driven decision making, IA, BI, ROI de projetos de dados, tendências em analytics e casos de sucesso.

4.  **ATUALIDADE:** Priorize fontes dos últimos 36 meses, mas não ignore insights fundamentais mais antigos se forem os únicos disponíveis.

5.  **RELEVÂNCIA:** Pare a pesquisa quando encontrar insights que sejam diretamente acionáveis ou muito relevantes para o contexto do cliente, evitando informações genéricas.

FORMATO DA RESPOSTA:

-   O campo "link" DEVE ser a URL real e verificável encontrada na pesquisa.
-   Se um insight relevante for encontrado, mas um link direto e funcional não puder ser verificado pela ferramenta de busca, você DEVE retornar link: null.
-   Nunca preencha o campo "link" com uma URL que você não tenha verificado.

Conteudo: "descrição detalhada do insight",
Fonte: "nome da fonte real (ex: McKinsey & Company, BCG)",
Link: "URL completa e real da fonte, ou null"
"""

        # Mensagem do usuário
        contents = [
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=contexto_negocio)],
            ),
        ]

        tools = [types.Tool(googleSearch=types.GoogleSearch())]

        generate_content_config = types.GenerateContentConfig(
            temperature=0.7,
            thinking_config=types.ThinkingConfig(thinking_budget=-1),
            tools=tools,
            system_instruction=[types.Part.from_text(text=system_instruction)],
        )

        # Gera a resposta com streaming
        full_response = ""
        for chunk in gemini_client.models.generate_content_stream(
            model="gemini-2.5-flash",
            contents=contents,
            config=generate_content_config,
        ):
            if hasattr(chunk, "text"):
                full_response += chunk.text

        return full_response

    except Exception as e:
        st.error(f"Erro durante a pesquisa de insights: {e}", icon="🚨")
        return None


def process_tendencias_research(contexto_negocio: str) -> Optional[str]:
    """
    Executa pesquisa de tendências usando Gemini com Google Search
    """
    try:
        # Inicializa o cliente Gemini
        gemini_client = genai.Client(
            api_key=st.secrets.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")
        )

        # System instruction para pesquisador de tendências
        system_instruction = """
# ROLE AND GOAL
Você é um Consultor Estratégico Sênior da Poli Júnior, especialista em análise de mercado, na metodologia "The Challenger Sale" e em posicionar soluções de Dados & IA como alavancas de valor de negócio. Seu objetivo é criar o conteúdo para um "One-Slide Opener" de diagnóstico para uma reunião de vendas consultiva. Este slide deve ensinar algo novo e valioso ao cliente sobre o mundo dele, gerar credibilidade instantânea e provocar uma conversa estratégica, conectando os desafios do mercado às soluções que oferecemos.

# CONTEXT & KNOWLEDGE BASE
Para executar sua tarefa, você deve operar com base no seguinte conhecimento prévio sobre a Poli Júnior e nossa metodologia:

1.  **Nossas Soluções (em termos de negócio):**
    *   **Fase 1: Construindo a Fundação para a Inteligência:** Nós resolvemos problemas de dados inacessíveis, silos de informação e processos manuais. Criamos uma "fonte única da verdade", automatizamos o trabalho repetitivo e garantimos dados confiáveis para habilitar a inovação e a resiliência do negócio. [1, 1]
    *   **Fase 2: Gerando Vantagem Competitiva com Insights:** Nós transformamos dados em respostas. Ajudamos empresas a entender o comportamento do seu negócio, antecipar o futuro (demanda, riscos) e otimizar decisões, entregando esses insights de forma visual e acionável para que possam agir com confiança. [1, 1]
    *   **Fase 3: Atingindo a Vanguarda da Inovação:** Nós implementamos IA de ponta para criar novas frentes de valor, como capacitar equipes com "copilotos" de IA, automatizar o atendimento ao cliente de forma personalizada e extrair inteligência de dados não estruturados (imagens, voz, documentos). [1, 1]

2.  **Filosofia "The Challenger Sale":** Sua abordagem deve seguir o princípio "Teach, Tailor, Take Control". O objetivo do slide de tendências é o "Teach" (Ensinar): introduzir uma perspectiva nova e disruptiva que cria uma "tensão construtiva", fazendo o cliente perceber o custo da inação. [1]

3.  **Estrutura do "One-Slide Opener":** Cada tendência que você criar DEVE seguir esta estrutura de três partes:
    *   **Insight Disruptivo:** Uma afirmação provocadora que desafia o status quo e ensina algo novo sobre o setor ou a função do cliente.
    *   **Ponto de Dados de Apoio:** Um dado quantitativo de uma fonte respeitável (McKinsey, BCG, Bain, Gartner, Deloitte, etc.) que ancora o insight na realidade e gera credibilidade.
    *   **Conexão com Nossas Soluções:** Uma ponte clara e explícita que conecta o desafio apresentado a uma de nossas fases de solução (listadas no item 1).

# STEP-BY-STEP INSTRUCTIONS

1.  **Análise do Input:** Primeiro, analise profundamente as variáveis de entrada fornecidas pelo usuário: a empresa, o cargo do interlocutor e o segmento de atuação.
2.  **Pesquisa Direcionada:** Realize uma pesquisa focada para encontrar as tendências e desafios mais recentes e relevantes para a intersecção do `{SEGMENTO_DE_ATUAÇÃO}` e da função do `{CARGO_DO_INTERLOCUTOR}`. Priorize relatórios, artigos e análises de fontes de consultoria de elite (McKinsey, BCG, Bain, Gartner, Deloitte) e publicações de mercado respeitadas. Busque especificamente por dados quantificáveis (porcentagens, valores financeiros, estatísticas de mercado).
3.  **Brainstorm e Seleção Estratégica:** Com base na pesquisa, identifique de 5 a 7 tendências ou desafios potenciais. Em seguida, selecione as 3 mais potentes. Uma tendência "potente" atende a três critérios:
    a. Conecta-se a uma dor de negócio clara e, preferencialmente, quantificável (custo, risco, perda de oportunidade).
    b. É um insight não óbvio, que provavelmente o cliente ainda não considerou daquela forma.
    c. Conecta-se DIRETAMENTE a pelo menos uma das nossas três fases de solução.
4.  **Construção das Tendências:** Para cada uma das 3 tendências selecionadas, redija o conteúdo seguindo a estrutura de três partes definida na `KNOWLEDGE BASE`. Seja conciso, direto e use a linguagem de negócios. A "Conexão com nossas soluções" deve ser explícita, mencionando a fase e o resultado de negócio que ela gera.
5.  **Elaboração da Pergunta de Transição:** Ao final, crie a "Pergunta de Transição". Esta pergunta deve ser aberta, estratégica e forçar uma escolha entre os desafios apresentados, convidando o cliente a iniciar o diagnóstico. Ela deve ser formulada para pivotar a conversa do mercado geral para a realidade específica da empresa dele.

# INPUT VARIABLES
*   `{NOME_DA_EMPRESA}`: [Nome da empresa do cliente]
*   `{CARGO_DO_INTERLOCUTOR}`: [Cargo da pessoa com quem será a reunião]
*   `{DESCRIÇÃO_DA_EMPRESA}`:
*   `{SEGMENTO_DE_ATUAÇÃO}`:

# OUTPUT FORMAT
A sua resposta final deve ser formatada em Markdown, seguindo estritamente o modelo abaixo, sem adicionar nenhuma introdução ou comentário fora da estrutura.

---

### **Slide de Abertura: ""**

*(Este slide deve ser apresentado em menos de três minutos, com o objetivo de provocar uma conversa estratégica, não de dar uma aula.)*

#### **1.**

*   **Insight:**
*   **Ponto de Dados de Apoio:**
*   **(Conexão com suas soluções:**)

#### **2.**

*   **Insight:**
*   **Ponto de Dados de Apoio:**
*   **(Conexão com suas soluções:**)

#### **3.**

*   **Insight:**
*   **Ponto de Dados de Apoio:**
*   **(Conexão com suas soluções:**)

---

### **A Transição para o Diálogo (A Pergunta Final)**

**""**

# CONSTRAINTS & GUIDELINES
*   Pense como um consultor, não como um assistente de pesquisa. Seu valor está na síntese e na conexão estratégica, não na listagem de fatos.
*   Evite jargão técnico a todo custo. Fale a língua do negócio (ROI, eficiência, risco, vantagem competitiva).
*   Priorize a dor de negócio. Cada insight deve apontar para um problema que custa dinheiro, tempo ou oportunidade.
*   A "Conexão com nossas soluções" é a parte mais importante. Ela deve ser explícita e direta, mostrando ao cliente que você não está apenas identificando problemas, mas que tem um caminho para resolvê-los.
*   Seja conciso e impactante. Cada palavra conta.
"""

        # Mensagem do usuário
        contents = [
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=contexto_negocio)],
            ),
        ]

        tools = [types.Tool(googleSearch=types.GoogleSearch())]

        generate_content_config = types.GenerateContentConfig(
            temperature=0.7,
            thinking_config=types.ThinkingConfig(thinking_budget=-1),
            tools=tools,
            system_instruction=[types.Part.from_text(text=system_instruction)],
        )

        # Gera a resposta com streaming
        full_response = ""
        for chunk in gemini_client.models.generate_content_stream(
            model="gemini-2.5-flash",
            contents=contents,
            config=generate_content_config,
        ):
            if hasattr(chunk, "text"):
                full_response += chunk.text

        return full_response

    except Exception as e:
        st.error(f"Erro durante a pesquisa de tendências: {e}", icon="🚨")
        return None


def process_ata_to_proposal_workflow(user_prompt: str):
    """
    Processa o workflow completo: ata desorganizada -> ata organizada -> pesquisa insights -> proposta
    """
    try:
        # Etapa 1: Organizar a ata
        st.info("🔄 Organizando a ata...", icon="📝")

        # Criar thread para o organizador de atas
        thread_ata = client.beta.threads.create()

        # Adicionar mensagem do usuário
        client.beta.threads.messages.create(
            thread_id=thread_ata.id, role="user", content=user_prompt
        )

        # Executar o organizador de atas
        run_ata = client.beta.threads.runs.create_and_poll(
            thread_id=thread_ata.id,
            assistant_id=AVAILABLE_ASSISTANTS["organizador_atas"].id,
        )

        # Obter a resposta organizada
        messages_ata = client.beta.threads.messages.list(thread_id=thread_ata.id)
        ata_organizada = messages_ata.data[0].content[0].text.value

        # Mostrar a ata organizada
        with st.chat_message(
            "assistant", avatar=os.path.join(SCRIPT_DIR, "assets", "img", "gpt.png")
        ):
            st.markdown("### 📋 Ata Organizada")
            st.markdown(ata_organizada)

        # Adicionar ao histórico
        st.session_state.messages.append(
            {
                "role": "assistant",
                "content": f"### 📋 Ata Organizada\n\n{ata_organizada}",
            }
        )

        # Etapa 2: Pesquisar Insights de Mercado
        st.info("🔄 Pesquisando insights de mercado...", icon="🔍")

        # Extrair contexto da ata organizada para a pesquisa
        insights_response = process_insights_research(
            contexto_negocio=ata_organizada,
            instrucao_pesquisa="Pesquise insights relevantes de consultorias renomadas que possam fundamentar a proposta comercial.",
        )
        # Mostrar os insights
        if insights_response:
            with st.chat_message(
                "assistant", avatar=os.path.join(SCRIPT_DIR, "assets", "img", "gpt.png")
            ):
                st.markdown("### 🔍 Insights de Mercado")
                st.markdown(insights_response)

            # Adicionar ao histórico
            st.session_state.messages.append(
                {
                    "role": "assistant",
                    "content": f"### 🔍 Insights de Mercado\n\n{insights_response}",
                }
            )
        else:
            insights_response = "Não foi possível obter insights de mercado no momento."

        # Etapa 3: Criar proposta
        st.info("🔄 Construindo proposta comercial...", icon="💼")

        # Criar thread para o criador de propostas
        thread_proposta = client.beta.threads.create()

        # Adicionar a ata organizada E os insights como input para a proposta
        prompt_proposta = f"""Com base na seguinte ata organizada e nos insights de mercado, crie uma proposta comercial:

**ATA ORGANIZADA:**
{ata_organizada}

**INSIGHTS DE MERCADO:**
{insights_response}"""

        client.beta.threads.messages.create(
            thread_id=thread_proposta.id,
            role="user",
            content=prompt_proposta,
        )

        # Executar o criador de propostas
        run_proposta = client.beta.threads.runs.create_and_poll(
            thread_id=thread_proposta.id,
            assistant_id=AVAILABLE_ASSISTANTS["criador_propostas"].id,
        )

        # Obter a proposta criada
        messages_proposta = client.beta.threads.messages.list(
            thread_id=thread_proposta.id
        )
        proposta_criada = messages_proposta.data[0].content[0].text.value

        # Mostrar a proposta
        with st.chat_message(
            "assistant", avatar=os.path.join(SCRIPT_DIR, "assets", "img", "gpt.png")
        ):
            st.markdown("### 💼 Proposta Comercial")
            st.markdown(proposta_criada)

        # Adicionar ao histórico
        st.session_state.messages.append(
            {
                "role": "assistant",
                "content": f"### 💼 Proposta Comercial\n\n{proposta_criada}",
            }
        )

        return True

    except Exception as e:
        st.error(f"Erro durante o processamento do workflow: {e}", icon="🚨")
        return False


try:
    # Inicializa o cliente OpenAI usando as secrets do Streamlit
    client = openai.OpenAI(api_key=st.secrets["OPENAI_API_KEY"])
except Exception as e:
    st.error(
        "Chave da API da OpenAI não encontrada. Por favor, configure seus secrets no Streamlit Cloud.",
        icon="🚨",
    )
    st.stop()

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
/* Importa fontes personalizadas */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

/* Variáveis CSS personalizadas */
:root {
    --primary-purple: #8c52ff;
    --purple-light: #8c52ff;
    --purple-dark: #8c52ff;
    --purple-ultra-light: #8c52ff;
    --purple-semi-light: #8c52ff;
    --background-gradient: linear-gradient(135deg, #f8f7ff 0%, #f0ebff 100%);
}

/* Fundo principal com padrão de dados */
.main .block-container {
    background: var(--background-gradient);
    position: relative;
    font-family: 'Inter', sans-serif;
    color: #333333;
}

.main .block-container::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: 
        /* Padrão de dados/pontos pequenos */
        radial-gradient(circle at 10% 10%, var(--purple-ultra-light) 1px, transparent 1px),
        radial-gradient(circle at 30% 20%, var(--purple-ultra-light) 1.5px, transparent 1.5px),
        radial-gradient(circle at 50% 15%, var(--purple-ultra-light) 1px, transparent 1px),
        radial-gradient(circle at 70% 25%, var(--purple-ultra-light) 2px, transparent 2px),
        radial-gradient(circle at 90% 10%, var(--purple-ultra-light) 1px, transparent 1px),
        radial-gradient(circle at 85% 30%, var(--purple-ultra-light) 1.5px, transparent 1.5px),
        
        /* Segunda camada de dados */
        radial-gradient(circle at 15% 40%, var(--purple-ultra-light) 1px, transparent 1px),
        radial-gradient(circle at 35% 45%, var(--purple-ultra-light) 2px, transparent 2px),
        radial-gradient(circle at 55% 35%, var(--purple-ultra-light) 1px, transparent 1px),
        radial-gradient(circle at 75% 50%, var(--purple-ultra-light) 1.5px, transparent 1.5px),
        radial-gradient(circle at 95% 45%, var(--purple-ultra-light) 1px, transparent 1px),
        
        /* Terceira camada de dados */
        radial-gradient(circle at 20% 70%, var(--purple-ultra-light) 2px, transparent 2px),
        radial-gradient(circle at 40% 65%, var(--purple-ultra-light) 1px, transparent 1px),
        radial-gradient(circle at 60% 75%, var(--purple-ultra-light) 1.5px, transparent 1.5px),
        radial-gradient(circle at 80% 70%, var(--purple-ultra-light) 1px, transparent 1px),
        
        /* Quarta camada de dados */
        radial-gradient(circle at 25% 90%, var(--purple-ultra-light) 1px, transparent 1px),
        radial-gradient(circle at 45% 95%, var(--purple-ultra-light) 1.5px, transparent 1.5px),
        radial-gradient(circle at 65% 85%, var(--purple-ultra-light) 1px, transparent 1px),
        radial-gradient(circle at 85% 95%, var(--purple-ultra-light) 2px, transparent 2px),
        
        /* Linhas sutis conectando dados */
        linear-gradient(45deg, transparent 45%, var(--purple-ultra-light) 47%, var(--purple-ultra-light) 48%, transparent 50%),
        linear-gradient(-45deg, transparent 45%, var(--purple-ultra-light) 47%, var(--purple-ultra-light) 48%, transparent 50%);
    
    background-size: 
        /* Tamanhos variados para simular dados dispersos */
        80px 80px, 120px 120px, 90px 90px, 110px 110px, 70px 70px, 100px 100px,
        95px 95px, 130px 130px, 85px 85px, 105px 105px, 75px 75px,
        140px 140px, 80px 80px, 115px 115px, 90px 90px,
        125px 125px, 95px 95px, 85px 85px, 135px 135px,
        /* Linhas de conexão */
        200px 200px, 180px 180px;
    
    background-position: 
        /* Posições aleatórias para simular distribuição de dados */
        0 0, 25px 25px, 50px 15px, 75px 35px, 100px 10px, 125px 30px,
        15px 40px, 45px 60px, 70px 45px, 95px 65px, 120px 50px,
        20px 80px, 50px 75px, 80px 85px, 110px 80px,
        30px 100px, 60px 105px, 90px 95px, 120px 110px,
        /* Linhas */
        0 0, 100px 100px;
    
    opacity: 0.4;
    z-index: -1;
    pointer-events: none;
}

/* Adiciona padrão extra de dados flutuantes */
.main .block-container::after {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: 
        /* Pequenos quadrados e retângulos representando dados */
        linear-gradient(45deg, var(--purple-ultra-light) 2px, transparent 2px),
        linear-gradient(-45deg, var(--purple-ultra-light) 1px, transparent 1px),
        /* Círculos maiores ocasionais */
        radial-gradient(circle at 33% 33%, var(--purple-ultra-light) 3px, transparent 3px),
        radial-gradient(circle at 66% 66%, var(--purple-ultra-light) 2.5px, transparent 2.5px);
    background-size: 150px 150px, 180px 180px, 300px 300px, 250px 250px;
    background-position: 0 0, 50px 50px, 75px 75px, 125px 125px;
    opacity: 0.2;
    z-index: -2;
    pointer-events: none;
}

/* Remove a borda padrão do topo do header */
header[data-testid="stHeader"] {
    border-top: none;
    background: linear-gradient(90deg, var(--primary-purple), var(--purple-light));
    height: 4px;
}

/* Estilização da sidebar */
section[data-testid="stSidebar"] {
    background: linear-gradient(180deg, #ffffff 0%, #faf9ff 100%);
    border-right: 2px solid var(--purple-ultra-light);
}

section[data-testid="stSidebar"] > div {
    background: transparent;
}

/* Força texto escuro em todos os elementos */
.stApp {
    color: #333333 !important;
}

/* Botões personalizados */
.stButton > button {
    background: linear-gradient(135deg, var(--primary-purple), var(--purple-light));
    color: white !important;
    border: none;
    border-radius: 12px;
    font-weight: 600;
    font-family: 'Inter', sans-serif;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(140, 82, 255, 0.3);
}

.stButton > button:hover {
    background: linear-gradient(135deg, var(--purple-dark), var(--primary-purple));
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(140, 82, 255, 0.4);
}

/* Selectbox personalizado */
.stSelectbox > div > div {
    background-color: white;
    border: 2px solid var(--purple-ultra-light);
    border-radius: 10px;
    transition: border-color 0.3s ease;
    color: #333333 !important;
}

.stSelectbox > div > div:focus-within {
    border-color: var(--primary-purple);
    box-shadow: 0 0 0 3px var(--purple-ultra-light);
}

/* Estiliza os containers das mensagens para se parecerem com os balões de chat */
[data-testid="stChatMessage"] {
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid var(--purple-ultra-light);
    border-radius: 16px;
    padding: 1.5rem;
    margin-bottom: 1rem;
    backdrop-filter: blur(10px);
    box-shadow: 0 4px 20px rgba(140, 82, 255, 0.1);
    transition: all 0.3s ease;
    color: #333333 !important;
}

[data-testid="stChatMessage"]:hover {
    box-shadow: 0 6px 25px rgba(140, 82, 255, 0.15);
    transform: translateY(-1px);
}

/* Mensagens do usuário */
[data-testid="stChatMessage"]:has(img[alt*="user"]) {
    background: linear-gradient(135deg, var(--primary-purple), var(--purple-light));
    color: white !important;
    margin-left: 2rem;
}

/* Mensagens do assistente */
[data-testid="stChatMessage"]:has(img[alt*="assistant"]) {
    background: rgba(255, 255, 255, 0.95);
    margin-right: 2rem;
    color: #333333 !important;
}

/* Estilo para avatares */
img[data-testid="stAvatar"] {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 2px solid var(--primary-purple);
    box-shadow: 0 2px 10px rgba(140, 82, 255, 0.3);
}

/* Input de chat personalizado */
.stChatInput > div {
    background: white;
    border: 2px solid var(--purple-ultra-light);
    border-radius: 15px;
    transition: all 0.3s ease;
}

.stChatInput > div:focus-within {
    border-color: var(--primary-purple);
    box-shadow: 0 0 0 3px var(--purple-ultra-light);
}

/* Títulos personalizados */
h1, h2, h3 {
    color: var(--purple-dark) !important;
    font-family: 'Inter', sans-serif;
    font-weight: 700;
}

/* Texto geral */
p, div, span, label {
    color: #333333 !important;
}

/* Alertas e notificações */
.stAlert {
    background: rgba(255, 255, 255, 0.9);
    border-left: 4px solid var(--primary-purple);
    border-radius: 10px;
    backdrop-filter: blur(10px);
    color: #333333 !important;
}

/* Scrollbar personalizada */
::-webkit-scrollbar {
    width: 8px;
}

::-webkit-scrollbar-track {
    background: var(--purple-ultra-light);
}

::-webkit-scrollbar-thumb {
    background: var(--primary-purple);
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: var(--purple-dark);
}

/* Animação de loading */
@keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.6; }
    100% { opacity: 1; }
}

.loading-text {
    animation: pulse 1.5s ease-in-out infinite;
}
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
        if st.button("🔄 Regenerar", use_container_width=True):
            # Remove última resposta e regenera
            if len(st.session_state.messages) >= 2:
                st.session_state.messages.pop()  # Remove resposta do assistente
                st.rerun()
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
        st.session_state.messages.append(user_message.model_dump())

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
                        st.session_state.messages.append(assistant_message.model_dump())
                elif st.session_state.assistant_key == "pesquisador_tendencias":
                    response = process_tendencias_research(prompt)
                    if response:
                        st.markdown(response)
                        assistant_message = Message(
                            role="assistant",
                            content=response,
                            timestamp=datetime.now().strftime("%H:%M:%S"),
                        )
                        st.session_state.messages.append(assistant_message.model_dump())
                else:
                    response = process_with_assistant(prompt, file_ids)

                    assistant_message = Message(
                        role="assistant",
                        content=response,
                        timestamp=datetime.now().strftime("%H:%M:%S"),
                    )
                    st.session_state.messages.append(assistant_message.model_dump())

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

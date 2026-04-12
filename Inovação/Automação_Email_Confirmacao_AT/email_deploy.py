import streamlit as st
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
from googleapiclient.errors import HttpError
from email.mime.text import MIMEText
import base64
import datetime
from bs4 import BeautifulSoup
from google.auth.exceptions import RefreshError

# --- Escopos Google ---
SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.settings.basic",
    "https://www.googleapis.com/auth/gmail.readonly",
]


# --- Carrega config do OAuth via st.secrets ---
# Validação para garantir que os secrets estão carregados e têm a estrutura esperada
if "oauth" not in st.secrets or not all(
    k in st.secrets["oauth"] for k in ["client_id", "client_secret", "redirect_uris"]
):
    st.error("Erro: Configuração OAuth ausente ou incompleta em st.secrets.")
    st.stop()

if (
    not st.secrets["oauth"]["redirect_uris"]
    or not isinstance(st.secrets["oauth"]["redirect_uris"], list)
    or not st.secrets["oauth"]["redirect_uris"][0]
):
    st.error(
        "Erro: 'redirect_uris' ausente, não é uma lista ou está vazia em st.secrets['oauth']."
    )
    st.stop()

CLIENT_CONFIG = {
    "web": {
        "client_id": st.secrets["oauth"]["client_id"],
        "client_secret": st.secrets["oauth"]["client_secret"],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": st.secrets["oauth"]["redirect_uris"],
    }
}

SINGLE_REDIRECT_URI = st.secrets["oauth"]["redirect_uris"][
    0
]  # Usar o primeiro URI da lista


def login():
    # Inicializa o estado de sessão para debugging se necessário
    if "login_initialized" not in st.session_state:
        st.session_state.login_initialized = True

    # Verifica se já temos credenciais na sessão
    creds = st.session_state.get("creds")
    current_required_scopes_set = set(SCOPES)  # SCOPES definidos globalmente

    # Verifica se já temos credenciais e se elas ainda são válidas
    if creds:
        try:
            # Se as credenciais estiverem expiradas mas tiverem um refresh_token, tente atualizá-las
            if (
                creds.expired
                and hasattr(creds, "refresh_token")
                and creds.refresh_token
            ):
                try:
                    creds.refresh(Request())
                    st.session_state.creds = creds
                    return creds
                except Exception as e:
                    st.warning(f"Falha ao atualizar as credenciais: {e}")
                    # Não apague as credenciais ainda, tente o procedimento normal de validação

            # Verifica se as credenciais têm todos os escopos necessários
            granted_scopes_set = set(
                creds.scopes if hasattr(creds, "scopes") and creds.scopes else []
            )

            if current_required_scopes_set.issubset(granted_scopes_set):
                # Credenciais válidas com todos os escopos necessários
                return creds
            else:
                st.warning(
                    "As permissões da aplicação foram atualizadas. Por favor, faça login novamente."
                )
                # Continue com o fluxo normal - não apague as credenciais ainda
        except Exception as e:
            st.warning(f"Erro ao verificar credenciais existentes: {e}")
            # Continue com o fluxo normal - não apague as credenciais ainda

    # Se chegou aqui, as credenciais estão ausentes, inválidas ou não têm os escopos necessários
    # Inicia o fluxo OAuth
    flow = Flow.from_client_config(CLIENT_CONFIG, scopes=SCOPES)
    flow.redirect_uri = SINGLE_REDIRECT_URI

    # Verifica se está retornando do fluxo de autenticação
    query_params = st.query_params
    auth_code = query_params.get("code")

    if auth_code:
        if isinstance(auth_code, list):
            auth_code = auth_code[0]
        try:
            # Tenta obter um token com o código de autorização
            flow.fetch_token(code=auth_code)
            new_creds = flow.credentials

            # Armazena as novas credenciais
            st.session_state.creds = new_creds

            # Limpa o código de autorização da URL para evitar problemas em refreshes
            try:
                st.query_params.clear()
            except AttributeError:
                st.experimental_set_query_params()

            # Recarrega a página para iniciar com as novas credenciais
            st.rerun()
        except Exception as e:
            st.error(f"Erro ao processar o código de autorização: {e}")

            # Limpa o código da URL para evitar tentativas repetidas com um código inválido
            try:
                st.query_params.clear()
                st.info("A URL foi limpa. Por favor, tente fazer login novamente.")
            except:
                st.warning(
                    "Falha no login. Tente remover '?code=...' da URL e recarregar."
                )

            # Só agora limpamos as credenciais se houver falha
            if "creds" in st.session_state:
                del st.session_state.creds
            if "user_signature" in st.session_state:
                del st.session_state.user_signature

            st.stop()
    else:
        # Se não tem código na URL e não tem credenciais válidas,
        # mostra o link de autorização
        auth_url, _ = flow.authorization_url(
            access_type="offline",  # Obter refresh_token
            prompt="consent",  # Sempre solicitar consentimento
            include_granted_scopes="true",  # Incluir escopos já concedidos
        )

        st.markdown(
            f"### Autenticação Necessária \nPara continuar, [conecte-se com o Google clicando aqui]({auth_url})."
        )
        st.info("Aguardando autorização do Google...")
        st.stop()

    # Fallback - verifica uma última vez se temos credenciais na sessão
    final_creds = st.session_state.get("creds")
    if final_creds and hasattr(final_creds, "valid") and final_creds.valid:
        return final_creds
    else:
        st.info("Aguardando autenticação...")
        st.stop()


def get_user_signature(gmail_service):
    """
    Busca a assinatura do Gmail do usuário logado e a converte para texto simples.
    A assinatura é prefixada com o separador padrão "-- \n".
    """
    try:
        # Tenta obter a configuração "sendAs" para o e-mail primário do usuário
        user_profile = gmail_service.users().getProfile(userId="me").execute()
        user_email = user_profile.get("emailAddress")

        if not user_email:
            st.warning(
                "Não foi possível obter o endereço de e-mail do usuário para buscar a assinatura."
            )
            return ""

        # Busca a configuração "sendAs" específica para o email do usuário
        send_as_settings = (
            gmail_service.users()
            .settings()
            .sendAs()
            .get(userId="me", sendAsEmail=user_email)
            .execute()
        )
        signature_html = send_as_settings.get("signature", "")

        if not signature_html.strip():
            # Nenhuma assinatura configurada ou está vazia para este alias
            return ""

        # Converte a assinatura de HTML para texto simples
        soup = BeautifulSoup(signature_html, "html.parser")
        signature_plain = soup.get_text(
            separator="\n"
        ).strip()  # Usa newline como separador

        if signature_plain:
            return f"\n\n-- \n{signature_plain}"  # Formato padrão de separador de assinatura
        return ""

    except HttpError as error:
        # Se o erro for 404, significa que o 'sendAsEmail' específico não foi encontrado.
        # Isso pode acontecer se o e-mail principal não tiver uma entrada 'sendAs' explícita (raro)
        # ou se for um alias. Vamos tentar listar todos e pegar o primário.
        if error.resp.status == 404:
            try:
                aliases_result = (
                    gmail_service.users()
                    .settings()
                    .sendAs()
                    .list(userId="me")
                    .execute()
                )
                aliases = aliases_result.get("sendAs", [])
                if not aliases:
                    return ""  # Nenhuma configuração 'sendAs' encontrada

                chosen_alias = next(
                    (alias for alias in aliases if alias.get("isPrimary")), None
                )
                if (
                    not chosen_alias and aliases
                ):  # Fallback para o primeiro da lista se nenhum for primário
                    chosen_alias = aliases[0]

                if chosen_alias:
                    signature_html = chosen_alias.get("signature", "")
                    if signature_html.strip():
                        soup = BeautifulSoup(signature_html, "html.parser")
                        signature_plain = soup.get_text(separator="\n").strip()
                        if signature_plain:
                            return f"\n\n-- \n{signature_plain}"
                return ""  # Nenhuma assinatura encontrada nos aliases
            except HttpError as inner_error:
                st.warning(
                    f"Erro ao tentar buscar assinaturas alternativas: {inner_error}"
                )
                return ""
        else:
            st.warning(
                f"Erro ao buscar assinatura do Gmail: {error}. A assinatura não será adicionada."
            )
        return ""
    except Exception as e:
        st.error(
            f"Um erro inesperado ocorreu ao buscar a assinatura: {e}. A assinatura não será adicionada."
        )
        return ""


# --- Serviços autenticados ---
# Coloque esta parte dentro de um if para garantir que creds não é None
creds = login()  # login() agora sempre retorna creds ou para a execução

if creds:
    try:
        cal_service = build("calendar", "v3", credentials=creds)
        gmail_service = build("gmail", "v1", credentials=creds)
        st.success("Conectado aos serviços Google!")  # Feedback opcional
    except Exception as e:
        st.error(f"Erro ao construir serviços Google: {e}")
        st.stop()
else:
    # Esta parte não deveria ser alcançada se login() usa st.stop() corretamente
    st.error("Credenciais não disponíveis após o login.")
    st.stop()

# Certifique-se que 'creds' e 'gmail_service' estão disponíveis aqui
if "creds" not in st.session_state or not st.session_state.creds.valid:
    st.warning("Por favor, faça login para continuar.")
    st.stop()

# Construa o gmail_service se ainda não o fez ou se ele não estiver na session_state
# Esta lógica pode já existir na sua seção de "Serviços autenticados"
if "gmail_service" not in st.session_state:
    try:
        st.session_state.gmail_service = build(
            "gmail", "v1", credentials=st.session_state.creds
        )
    except Exception as e:
        st.error(f"Erro ao construir o serviço Gmail: {e}")
        st.stop()

gmail_service_instance = st.session_state.gmail_service


# --- Busca eventos num dia ---
def fetch_events_for_date(date):
    # ... (seu código existente)
    if isinstance(date, datetime.date):
        date = datetime.datetime.combine(date, datetime.time.min)

    start = date.replace(hour=0, minute=0, second=0, microsecond=0).isoformat() + "Z"
    end = (date + datetime.timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    ).isoformat() + "Z"

    try:
        events = (
            cal_service.events()
            .list(
                calendarId="primary",
                timeMin=start,
                timeMax=end,
                singleEvents=True,
                orderBy="startTime",
            )
            .execute()
            .get("items", [])
        )
        return events
    except HttpError as error:
        st.error(f"Erro ao buscar eventos: {error}")
        return []


# --- Agrupa convidados por evento ---
def group_guests(events):
    # ... (seu código existente)
    grouped = {}
    for ev in events:
        guests = [
            att
            for att in ev.get("attendees", [])
            if not att["email"].endswith("@polijunior.com.br")  # Seu filtro de email
        ]
        if not guests:
            continue
        label = ev["summary"]
        if label not in grouped:
            grouped[label] = {"event": ev, "guests": []}
        for att in guests:
            # Tenta pegar o displayName, se não, o email, e se não, usa o nome do email
            name = att.get("displayName", att.get("email", att["email"].split("@")[0]))
            grouped[label]["guests"].append((att["email"], name))
    return grouped


# --- Interface ---
st.title("🔔 Confirmação de Reuniões")

# escolha da data
mode = st.radio("Data:", ["Hoje", "Amanhã", "Escolher"])
if mode == "Hoje":
    sel_date = datetime.datetime.now()
elif mode == "Amanhã":
    sel_date = datetime.datetime.now() + datetime.timedelta(days=1)
else:
    sel_date = st.date_input("Escolha a data", datetime.date.today())

events = fetch_events_for_date(sel_date)
grouped = group_guests(events)

if not grouped:
    st.warning(
        "Não há eventos para a data selecionada com convidados externos."
    )  # Mensagem mais clara
    st.stop()

# seleção de evento
event_label = st.selectbox("Evento:", list(grouped.keys()))
if not event_label:  # Caso não haja eventos após o filtro
    st.warning("Nenhum evento selecionável.")
    st.stop()

data = grouped[event_label]
ev = data["event"]
guest_list = data["guests"]

# seleção de convidados
names = [g[1] for g in guest_list]
chosen = st.multiselect("Convidados:", names)

if not chosen:
    st.info("Selecione ao menos um convidado.")
    st.stop()

# prepara saudação
selected = [g for g in guest_list if g[1] in chosen]
emails = [g[0] for g in selected]
names_sel = [g[1] for g in selected]

# Lógica de saudação aprimorada
if len(names_sel) == 1:
    first_name = emails[0].split("@")[0].split(".")[0].capitalize()
    greet = f"Bom dia, {first_name}!"
elif len(names_sel) == 2:
    first_names = [email.split("@")[0].split(".")[0].capitalize() for email in emails]
    greet = f"Bom dia, {first_names[0]} e {first_names[1]}!"
elif len(names_sel) > 2:
    first_names = [email.split("@")[0].split(".")[0].capitalize() for email in emails]
    greet = f"Bom dia, {', '.join(first_names[:-1])} e {first_names[-1]}!"
else:  # Caso names_sel esteja vazio por algum motivo (não deveria acontecer se 'chosen' não estiver vazio)
    greet = "Bom dia!"


# formata horário
start_info = ev["start"]
# Verifica se é um evento de dia inteiro ('date') ou com horário específico ('dateTime')
if "dateTime" in start_info:
    start_dt_str = start_info.get("dateTime")
    time_h = datetime.datetime.fromisoformat(
        start_dt_str.replace("Z", "+00:00")
    ).strftime(
        "%Hh%M"
    )  # Adiciona minutos e trata fuso horário
    horario_confirmacao = f"às {time_h}"
elif "date" in start_info:
    start_dt_str = start_info.get("date")
    time_h = datetime.datetime.fromisoformat(start_dt_str).strftime(
        "%d/%m/%Y"
    )  # Formata a data
    horario_confirmacao = f"no dia {time_h}"
else:
    time_h = "(horário não especificado)"  # Fallback
    horario_confirmacao = ""

# Buscar a assinatura do usuário e armazenar no cache da sessão
if "user_signature" not in st.session_state:
    st.session_state.user_signature = get_user_signature(gmail_service_instance)
user_signature_text = st.session_state.user_signature

# Data atual (sem hora)
hoje = datetime.datetime.now().date()
data_selecionada = (
    sel_date.date() if isinstance(sel_date, datetime.datetime) else sel_date
)

# Define a string do dia para a mensagem
dias_semana = [
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
    "domingo",
]

# Forçar recálculo do delta toda vez que a página é atualizada
delta = (data_selecionada - hoje).days

if delta == 0:
    dia_mensagem = "hoje"
elif delta == 1:
    dia_mensagem = "amanhã"
elif delta > 1 and delta < 7:
    # Verificar se é na mesma semana para decidir entre "nesta" ou "na próxima"
    hoje_semana = hoje.isocalendar()[1]  # Número da semana do ano
    sel_semana = data_selecionada.isocalendar()[1]

    # Usa o nome do dia da semana
    dia_semana_nome = dias_semana[data_selecionada.weekday()]

    # Se for na mesma semana, usa "nesta", caso contrário "na próxima"
    if hoje_semana == sel_semana:
        dia_mensagem = f"nesta {dia_semana_nome}"
    else:
        dia_mensagem = f"na próxima {dia_semana_nome}"
else:
    # Caso fora da próxima semana, usa data completa
    dia_mensagem = f"no dia {data_selecionada.strftime('%d/%m/%Y')}"

# Construir o corpo da mensagem com a data correta
default_body_text = (
    f"{greet}\nTudo bem?\n\n"
    f"Gostaria de confirmar, tudo certo para nossa conversa {dia_mensagem} {horario_confirmacao}?\n\n"
    "Nos vemos em breve!"
)

msg_body_edited_by_user = st.text_area("Mensagem:", default_body_text, height=200)

# Opcional: Mostrar ao usuário qual assinatura será adicionada (apenas para visualização)
if user_signature_text:
    st.markdown("---")
    st.markdown("**Assinatura que será adicionada:**")
    # st.text exibe o texto literalmente, preservando espaços e quebras de linha
    st.text(
        user_signature_text.strip()
    )  # .strip() para remover quebras de linha iniciais do f-string
    st.markdown("---")
else:
    st.caption(
        "Nenhuma assinatura automática será adicionada (não configurada ou não encontrada)."
    )


if st.button("Enviar"):
    if not msg_body_edited_by_user.strip():
        st.warning("A mensagem não pode estar vazia.")
    else:
        # Corpo do e-mail final é o que o usuário digitou + a assinatura
        final_email_content = msg_body_edited_by_user
        if user_signature_text:
            final_email_content += (
                user_signature_text  # A assinatura já vem com \n\n-- \n
            )

        mime = MIMEText(final_email_content)
        mime["to"] = ", ".join(emails)  # 'emails' deve estar definido
        mime["subject"] = (
            f"Confirmação: {event_label}"  # 'event_label' deve estar definido
        )

        raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()

        try:
            gmail_service_instance.users().messages().send(
                userId="me", body={"raw": raw}
            ).execute()
            st.success("E-mail enviado com sucesso!")
        except HttpError as e:
            st.error(f"Erro ao enviar: {e}")
        except Exception as e_gen:
            st.error(f"Um erro inesperado ocorreu ao enviar: {e_gen}")

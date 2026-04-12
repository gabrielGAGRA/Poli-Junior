import os
from openai import OpenAI
import streamlit as st
import re
import time
from dotenv import load_dotenv

# Carregar as variáveis de ambiente do arquivo .env
load_dotenv()

client = OpenAI() 

# Configurar as configurações da página no Streamlit
st.set_page_config(
    page_title="Chatbot Nutax",
    page_icon="💬",
    layout="centered"
) 
# Título da página do Streamlit
st.title("🤖 ChatBot -  Nutax")

assistant_id = "asst_B4dII9PiftBNCzojEkc8NagJ"
thread = client.beta.threads.create()
st.session_state.thread_id = thread.id
# Campo de entrada para a mensagem do usuário
user_prompt = st.chat_input("Pergunte ao chat...")

# Início do chat automaticamente
if user_prompt:
    if "openai_model" not in st.session_state:
        st.session_state.openai_model = "gpt-4o"
    if "messages" not in st.session_state:
        st.session_state.messages = []

    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])
            
    st.session_state.messages.append({"role": "user", "content": user_prompt})
    with st.chat_message("user"):
        st.markdown(user_prompt)

    client.beta.threads.messages.create(
        thread_id=st.session_state.thread_id,
        role="user",
        content=user_prompt
    )

    run = client.beta.threads.runs.create(
        thread_id=st.session_state.thread_id,
        assistant_id=assistant_id,
        instructions="Você é um assistente que responde clientes, buscando as informações no vector storage sobre os dados fiscais daquele cliente, esses dados vem do upload e tratamento de notas fiscais, e deve retornar insights sobre essa base de dados fiscal.  Procure responder sempre com base nos dados, cada entrada está mapeada de acordo com seu significado é um dicionário fiscal mapeia as relações . Tente dar insights e use seu entendimento para sugestões de negócios. Não fale de IDs de tabela ou coisas não compreensíveis por humanos sem jargão. Você realiza cálculos com valores e apenas demonstra o resultado em números, sem enumerar os números que utilizou.",
        temperature=0
    )

    while run.status != 'completed':
        time.sleep(1)
        run = client.beta.threads.runs.retrieve(
            thread_id=st.session_state.thread_id,
            run_id=run.id
        )
    messages = client.beta.threads.messages.list(
        thread_id=st.session_state.thread_id
    )

    # Processar e exibir mensagens do assistente
    assistant_messages_for_run = [
        message for message in messages 
        if message.run_id == run.id and message.role == "assistant"
    ]
    for message in reversed(assistant_messages_for_run):
        conteudo_limpo = re.sub(r'【\d+:\d+†source】', '', message.content[0].text.value)
        st.session_state.messages.append({"role": "assistant", "content": conteudo_limpo})
        with st.chat_message("assistant"):
            st.markdown(conteudo_limpo)

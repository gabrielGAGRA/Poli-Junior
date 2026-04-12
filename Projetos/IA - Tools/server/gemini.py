import os
from datetime import datetime
from dotenv import load_dotenv
import google.generativeai as genai
from google.ai.generativelanguage_v1beta.types import content

# Load environment variables from .env file
load_dotenv()

# Fetch the API key from the environment variable
api_key = os.getenv("GEMINI_API_KEY")

# Configure the Gemini API with the fetched API key
genai.configure(api_key=api_key)

# Create the model
generation_config = {
  "temperature": 1,
  "top_p": 0.8,
  "top_k": 40,
  "max_output_tokens": 8192,
  "response_mime_type": "text/plain",
}

current_date = datetime.now().strftime("%Y-%m-%d")

model = genai.GenerativeModel(
  model_name="gemini-2.0-flash-exp",
  generation_config=generation_config,
  system_instruction=f"Você é um assistente que responde perguntas de dados fiscais de clientes do Brasil.  Você deve ajudar respondendo perguntas para dar insights valiosos sobre a situação fiscal, pegando informações de somas de base de dados de operações fiscais para fornecer um panorama geral. {current_date}",
  tools = [
    genai.protos.Tool(
      function_declarations = [
        genai.protos.FunctionDeclaration(
          name = "construtorConsultaFiscal",
          description = "Cria consultas SQL baseadas em parâmetros fiscais opcionais.",
          parameters = content.Schema(
            type = content.Type.OBJECT,
            properties = {
              "dataInicial": content.Schema(
                type = content.Type.STRING,
                description = "Data inicial (opcional) - formato: DD/MM/AAAA",
              ),
              "dataFinal": content.Schema(
                type = content.Type.STRING,
                description = "Data final (opcional) - formato: DD/MM/AAAA",
              ),
              "cnpjEmitente": content.Schema(
                type = content.Type.STRING,
                description = "CNPJ do emitente (opcional)",
              ),
              "cnpjDestinatario": content.Schema(
                type = content.Type.STRING,
                description = "CNPJ do destinatário (opcional)",
              ),
              "ufDestinatario": content.Schema(
                type = content.Type.STRING,
                description = "UF do destinatário (ex.: SP, RJ) (opcional)",
              ),
              "tipoImposto": content.Schema(
                type = content.Type.STRING,
                description = "Tipo de imposto (ICMS, IPI, PIS, etc.) (opcional)",
              ),
            },
          ),
        ),
      ],
    ),
  ],
  tool_config={'function_calling_config':'ANY'},
)

chat_session = model.start_chat(
  history=[
  ]
)

response = chat_session.send_message("Quanto de ICMS paguei em 2024?")

# Print out each of the function calls requested from this single call.
# Note that the function calls are not executed. You need to manually execute the function calls.
# For more see: https://github.com/google-gemini/cookbook/blob/main/quickstarts/Function_calling.ipynb
for part in response.parts:
  if fn := part.function_call:
    args = ", ".join(f"{key}={val}" for key, val in fn.args.items())
    print(f"{fn.name}({args})")
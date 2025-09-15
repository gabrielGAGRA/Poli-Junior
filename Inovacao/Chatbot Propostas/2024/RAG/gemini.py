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
      "temperature": 1.2,
      "top_p": 0.95,
      "top_k": 40,
      "max_output_tokens": 8192,
      "response_mime_type": "text/plain",
    }

model = genai.GenerativeModel(
      model_name="gemini-2.0-flash-exp",
      generation_config=self.generation_config,
      system_instruction="Você é um assistente para a criação de propostas comerciais. Você tem os dados de outras propostas comerciais juntamente à ata de reunião delas, e deve receber a ata de outras reuniões para gerar propostas comerciais para elas. Você deve utiizar o contexto dos dados para determinar quais dados utilizar da ata para a proposta, quais devem ser as etapas de execução para aquela demanda, bem como qual é a dor do cliente e impactos do projeto. Você deve retornar essa informação em texto, em partes por parágrafo, para que seja colada na respectiva página da proposta.",
    )

chat_session = model.start_chat(
  history=[
  ]
)

response = chat_session.send_message("mensagem aaaaaaaaaaaa")

# Print out each of the function calls requested from this single call.
# Note that the function calls are not executed. You need to manually execute the function calls.
# For more see: https://github.com/google-gemini/cookbook/blob/main/quickstarts/Function_calling.ipynb
for part in response.parts:
  if fn := part.function_call:
    args = ", ".join(f"{key}={val}" for key, val in fn.args.items())
    print(f"{fn.name}({args})")
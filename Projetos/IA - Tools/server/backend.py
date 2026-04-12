import os
import time
from datetime import datetime
from flask import request
from requests import get
import google.generativeai as genai
from google.ai.generativelanguage_v1beta.types import content

class Backend_Api:
    def __init__(self, app, config: dict) -> None:
        self.app = app
        self.gemini_key = os.getenv("GEMINI_API_KEY")
        self.gemini_api_base = os.getenv("GEMINI_API_BASE")
        self.proxy = config.get('proxy')
        self.routes = {
            '/backend-api/v2/conversation': {
                'function': self._conversation,
                'methods': ['POST']
            }
        }
        
        # Configure Gemini API
        genai.configure(api_key=self.gemini_key)
        
        self.generation_config = {
            "temperature": 1,
            "top_p": 0.8,
            "top_k": 40,
            "max_output_tokens": 8192,
            "response_mime_type": "text/plain",
        }
        
        current_date = datetime.now().strftime("%Y-%m-%d")
        
        self.model = genai.GenerativeModel(
            model_name="gemini-2.0-flash-exp",
            generation_config=self.generation_config,
            system_instruction=f"Você é um assistente especializado em responder perguntas sobre notas fiscais e fornecer insights fiscais com base em uma base de dados estruturada. A data atual é {current_date}. Use essa informação para interpretar perguntas relacionadas a intervalos de tempo, como 'este ano', 'últimas duas semanas', ou 'neste mês'.\nSua função é: Interpretar perguntas em linguagem natural relacionadas a notas fiscais e insights fiscais. \nExtrair os seguintes parâmetros relevantes para gerar queries SQL: Intervalo de datas: id_dt_ini e id_dt_fin. Impostos: Como vl_icms, imposto_pis_vpis, imposto_cofins_vcofins, entre outros. Localização: Como uf_destinatario e nome_mun_destinatario. Outros detalhes: Como tipo, origem, e classificacao_gerencial. \nEssa é a estrutura da base de dados: id_dt_ini, id_dt_fin, id_cnpj, cnpj_destinatario, cpf_destinatario, nome_destinatario, nome_mun_destinatario, uf_destinatario, pais_destinatario, descr_compl, tipo, origem, unid, vl_item, aliq_icms, vl_icms, vdeson, vl_icms_st, vstret, pfcpst, vfcp, vfcpst, vdespadu, vii, viof, pfcpufddest, picmsinter, picmsinterpart, vfcpufdest, vicmsufdest, vicmsufremet, imposto_ipi_vbc, imposto_ipi_pipi, imposto_ipi_vipi, imposto_pis_ppis, imposto_pis_vpis, imposto_cofins_pcofins, imposto_cofins_vcofins, classificacao_gerencial",
 tools = [
    genai.protos.Tool(
      function_declarations = [
        genai.protos.FunctionDeclaration(
          name = "extrair_parametros_notas_fiscais",
          description = "Extrai parâmetros de perguntas sobre notas fiscais para gerar queries SQL para a base de dados.",
          parameters = content.Schema(
            type = content.Type.OBJECT,
            enum = [],
            required = ["id_dt_ini", "id_dt_fin"],
            properties = {
              "id_dt_ini": content.Schema(
                type = content.Type.STRING,
                description = "Data de início do intervalo solicitado no formato 'YYYY-MM-DD'.",
              ),
              "id_dt_fin": content.Schema(
                type = content.Type.STRING,
                description = "Data de fim do intervalo solicitado no formato 'YYYY-MM-DD'.",
              ),
              "id_cnpj": content.Schema(
                type = content.Type.INTEGER,
                description = "CNPJ da empresa solicitante.",
              ),
              "cnpj_destinatario": content.Schema(
                type = content.Type.INTEGER,
                description = "CNPJ do destinatário, caso especificado.",
              ),
              "cpf_destinatario": content.Schema(
                type = content.Type.STRING,
                description = "CPF do destinatário, caso especificado.",
              ),
              "nome_destinatario": content.Schema(
                type = content.Type.STRING,
                description = "Nome do destinatário, caso especificado.",
              ),
              "nome_mun_destinatario": content.Schema(
                type = content.Type.STRING,
                description = "Nome do município do destinatário.",
              ),
              "uf_destinatario": content.Schema(
                type = content.Type.STRING,
                description = "Unidade Federativa (UF) do destinatário.",
              ),
              "pais_destinatario": content.Schema(
                type = content.Type.STRING,
                description = "País do destinatário.",
              ),
              "tipo": content.Schema(
                type = content.Type.STRING,
                description = "Tipo de operação (e.g., 'Revenda', 'Consumo').",
              ),
              "origem": content.Schema(
                type = content.Type.STRING,
                description = "Origem da mercadoria (e.g., 'Dentro do estado', 'Fora do estado').",
              ),
              "classificacao_gerencial": content.Schema(
                type = content.Type.STRING,
                description = "Classificação gerencial do item.",
              ),
              "vl_item": content.Schema(
                type = content.Type.NUMBER,
                description = "Valor do item, caso seja necessário para filtros ou cálculos.",
              ),
              "aliq_icms": content.Schema(
                type = content.Type.NUMBER,
                description = "Alíquota do ICMS, se aplicável.",
              ),
              "vl_icms": content.Schema(
                type = content.Type.NUMBER,
                description = "Valor do ICMS, se especificado.",
              ),
              "imposto_pis_vpis": content.Schema(
                type = content.Type.NUMBER,
                description = "Valor do imposto PIS.",
              ),
              "imposto_cofins_vcofins": content.Schema(
                type = content.Type.NUMBER,
                description = "Valor do imposto COFINS.",
              ),
            },
          ),
        ),
      ],
    ),
  ],
  tool_config={'function_calling_config':'ANY'},
)
        
    def send_message(self, message):
        chat_session = self.model.start_chat()
        time.sleep(1)  # Basic rate-limit pause

        response = chat_session.send_message(message)
        response_text = ""
        for part in response.parts:
            if part.text:
                response_text += part.text
            if part.function_call:
                args = ", ".join(f"{key}={val}" for key, val in part.function_call.args.items())
                response_text += f"\nFunction call: {part.function_call.name}({args})\n"
        return response_text

    def _conversation(self):
        try:
            prompt = request.json["meta"]["content"]["parts"][0]

            # Send message
            response = self.send_message(prompt["content"])
            if not response:
                return {"success": False, "message": "Failed to get response from Gemini"}, 500
            return {"success": True, "response": response}, 200

        except Exception as e:
            print(e)
            print(e.__traceback__)
            return {"success": False, "error": str(e)}, 400
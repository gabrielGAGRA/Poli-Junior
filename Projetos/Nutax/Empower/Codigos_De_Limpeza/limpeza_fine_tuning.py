import json
import re

# Caminho para o arquivo de texto e para o arquivo de saída JSONL
caminho_do_arquivo = 'Word-Athena.txt'
arquivo_saida_jsonl = 'fine_tuning.jsonl'

# Expressões regulares para identificar as partes do texto
regex_pergunta = re.compile(r'\d+\.\s(.*?\?)')
regex_descrição = re.compile(r'Descri..{0,10}:', re.IGNORECASE)
regex_resolucao = re.compile(r'(Resolu..{0,10}o Normativa.*?)(?:\n|$)', re.DOTALL)

def ler_arquivo(codificação):
    dados = []
    with open(caminho_do_arquivo, 'r', encoding=codificação, errors='replace') as arquivo:
        conteudo = arquivo.read()
        blocos = conteudo.split('\n\n')
        for bloco in blocos:
            pergunta_match = regex_pergunta.search(bloco)
            if pergunta_match:
                pergunta = pergunta_match.group(1).strip()
                descrição_match = regex_descrição.search(bloco)
                if descrição_match:
                    inicio_resposta = descrição_match.end()
                    partes_resposta = bloco[inicio_resposta:]
                    resolucao_match = regex_resolucao.search(partes_resposta)
                    if resolucao_match:
                        resposta = partes_resposta[:resolucao_match.start()].strip()
                        resolução = resolucao_match.group(1).strip()
                    else:
                        resposta = partes_resposta.strip()
                        resolução = "Não especificada"
                    dados.append({'pergunta': pergunta, 'resposta': resposta, 'resolução': resolução})
    return dados

# Gerar os dados JSON a partir dos dados extraídos
dados = ler_arquivo('utf-8')  # Assumindo que a codificação UTF-8 funcionou corretamente

# Modelo JSON base
modelo_json = {
    "messages": [
        {"role": "system", "content": "Enpower GPT é um assistente cordial que responde dúvidas de legislação do fornecimento de energia da ANEEL com base na resolução nº1000/2021."},
        {"role": "user", "content": ""},
        {"role": "assistant", "content": ""}
    ]
}

# Salvar os objetos JSON em um arquivo de saída JSONL
with open(arquivo_saida_jsonl, 'w', encoding='utf-8') as arquivo_jsonl:
    for item in dados:
        modelo_json['messages'][1]['content'] = item['pergunta']
        modelo_json['messages'][2]['content'] = f"{item['resposta']} Resolução: {item['resolução']}"
        arquivo_jsonl.write(json.dumps(modelo_json, ensure_ascii=False) + '\n')

print(f"Os dados foram salvos com sucesso no arquivo {arquivo_saida_jsonl}")

import re
import json

def extrair_informacoes_do_contrato_e_salvar_json(caminho_do_arquivo, caminho_do_json):
    # Abrindo e lendo o arquivo
    with open(caminho_do_arquivo, 'r', encoding='utf-8') as arquivo:
        texto_contrato = arquivo.read()

    # Encontrando o Contrato de Adesão
    contrato_inicio = texto_contrato.find("CONTRATO DE PRESTAÇÃO DE SERVIÇO PÚBLICO DE DISTRIBUIÇAO DE ENERGIA ELÉTRICA")
    contrato_fim = texto_contrato.find("CLÁUSULA PRIMEIRA:")
    contrato_de_adesao = texto_contrato[contrato_inicio:contrato_fim].strip()

    # Encontrando e separando as cláusulas e itens
    clausulas = re.findall(r"(CLÁUSULA [A-Z]+:.+?)(?=CLÁUSULA [A-Z]+:|$)", texto_contrato, re.DOTALL)
    clausulas_itens = {}

    for clausula in clausulas:
        clausula_titulo = clausula.split('\n', 1)[0].strip()
        itens_textos = re.findall(r"(\d+\.\d+(\.\d+)?\. .+?)(?=\d+\.\d+\. |$)", clausula, re.DOTALL)
        itens = []
        for item_texto in itens_textos:
            # Corrige a numeração e remove espaços e pontos extras
            item_numero = item_texto[0].split(' ')[0].rstrip('.')
            descricao = item_texto[0].strip()
            item = {
                "item": item_numero,
                "descricao": descricao
            }
            itens.append(item)
        clausulas_itens[clausula_titulo] = itens

    # Estruturando os dados para JSON
    dados_contrato = {
        "Contrato de Adesão": contrato_de_adesao,
        "Cláusulas e Itens": clausulas_itens
    }

    # Salvando os dados em um arquivo JSON
    with open(caminho_do_json, 'w', encoding='utf-8') as json_file:
        json.dump(dados_contrato, json_file, ensure_ascii=False, indent=4)

    print(f"Os dados do contrato foram salvos com sucesso em {caminho_do_json}")

# Chamando a função com os caminhos dos arquivos
caminho_arquivo_texto = 'RESOLUCAO_2021-contrato.txt'
caminho_arquivo_json = 'saida_contrato.json'
extrair_informacoes_do_contrato_e_salvar_json(caminho_arquivo_texto, caminho_arquivo_json)

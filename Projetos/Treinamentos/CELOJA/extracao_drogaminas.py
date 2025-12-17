# Importando bibliotecas necessárias
import requests
from bs4 import BeautifulSoup
import json

# FUNÇÕES QUE UTILIZAREMOS

# Função que faz o request do url da página da marca
def get_response(url):
    # URL de destino para fazer as solicitações
    reqUrl = url

    # Accept indica o tipo de conteúdo que o cliente está disposto a receber em resposta
    # User-Agent é usado para identificar o cliente ao servidor. 
    headersList = {
    "Accept": "*/*",
    "User-Agent": "Thunder Client (https://www.thunderclient.com)" 
    }

    payload = ""

    # Faz a solicitação HTTP usando o método GET para a URL especificada
    response = requests.request("GET", reqUrl, data=payload,  headers=headersList)

    return response


# Função que recebe o nome da marca e gera o url de sua página
def gerar_url_marca(marca):
    # URL base
    url_base = "https://www.drogariasminasmais.com.br/medicamentos/{}?initialMap=c&initialQuery=medicamentos&map=category-1,brand"
    
    # Substituir '{}' pelo nome da marca
    url_marca = url_base.format(marca)
    
    return url_marca


# Função para achar e extrair o JSON oculto, que terá as informações que precisamos 
def achar_json_oculto(soup):    
    # Encontrar o script que contém a expressão '__STATE__'
    script_tag = soup.find('script', string=lambda text: text and '__STATE__' in text)

    # Verificar se o script foi encontrado
    if script_tag:
        # Extrair o texto dentro do script
        script_text = script_tag.text
        
        # Encontrar a posição de '__STATE__' no texto do script
        state_start = script_text.find('__STATE__') + len('__STATE__') + 3  # Adicionando 3 para pular ' = ' após '__STATE__'
        
        # Extrair o JSON após '__STATE__'
        json_oculto = script_text[state_start:]
        
        # Analisar o JSON
        json_data = json.loads(json_oculto)
        
        # Retorna o JSON 
        return json_data
    else:
        return("Nenhum script contendo '__STATE__' encontrado.")


# Encontrar as chaves que possuem as informações de nome e código EAN do produto
def chaves_nome_ean(json_data):
    # Lista para armazenar as chaves filtradas
    chaves_filtradas = []

    # Iterar sobre as chaves do dicionário JSON
    for chave in json_data.keys():
        # Verificar se a parte específica está presente na chave
        if ".items({\"filter\":\"ALL\"}).0" in chave:
            # Verificar se não há nenhum outro caractere após a parte específica
            if chave.endswith(".items({\"filter\":\"ALL\"}).0"):
                chaves_filtradas.append(chave)

    # Retorna as chaves filtradas
    return chaves_filtradas


# Função para coletar informações das chaves 
def pegar_informacoes(chaves_filtradas, json_data):
    # Lista para armazenar as informações das chaves filtradas
    informacoes_chaves_filtradas = []

    # Iterar sobre as chaves filtradas
    for chave in chaves_filtradas:
        # Acessar o valor correspondente no dicionário original
        informacoes_chaves_filtradas.append(json_data[chave])

    # Retorna o dicionário com todas as informações
    return informacoes_chaves_filtradas


# Função para extrair as informações de nome e código EAN
def nomes_ean_ids(informacoes_chaves_filtradas):
    # Cria uma lista para armazenar os dados
    nomes = []
    ean = []
    ids = []
    # Percorre todos os discionários que extraímos
    for i in range (len(informacoes_chaves_filtradas)):
        # Extrai os dados de nome e código ean
        nomes.append(informacoes_chaves_filtradas[i]['name'])
        ean.append(informacoes_chaves_filtradas[i]['ean'])
        ids.append(informacoes_chaves_filtradas[i]['referenceId'])
    return nomes, ean, ids

# Encontrar as chaves que possuem informação de preço
def chaves_precos(json_data):
    # Lista para armazenar as chaves filtradas
    chaves_filtradas = []

    # Iterar sobre as chaves do dicionário JSON
    for chave in json_data.keys():
        # Verificar se a parte específica está presente na chave
        if ".items({\"filter\":\"ALL\"}).0.sellers.0.commertialOffer" in chave:
            # Verificar se não há nenhum outro caractere após a parte específica
            if chave.endswith(".items({\"filter\":\"ALL\"}).0.sellers.0.commertialOffer"):
                chaves_filtradas.append(chave)

    # Retorna as chaves filtradas
    return chaves_filtradas

# Função para extrair as informações de preço
def precos_precosdesconto(informacoes_chaves_filtradas):
    # Cria uma lista para armazenar os dados
    precos = []
    precos_desconto = []
    # Percorre todos os dicionários que extraímos
    for i in range (len(informacoes_chaves_filtradas)):
        # Extrai os dados de preço
        precos.append(informacoes_chaves_filtradas[i]['ListPrice'])
        precos_desconto.append(informacoes_chaves_filtradas[i]['Price'])
    return precos, precos_desconto

# Função final que vai coletar todos os dados desejados de todas as páginas de uma determinada marca

def get_all_info(url_marca):
    # Cria uma lista para armazenar os nomes e os EAN
    nomes_pagina = []
    ean_pagina = []
    precos_pagina = []
    precos_desconto_pagina = []
    marcas_pagina = []
    # Estabelece a url da página 1 como a url inicial
    url_pagina = url_marca
    pagina_atual = 2
    while True:
        # Faz o request
        response_pagina = get_response(url_pagina)

        # Verificar se a solicitação foi bem-sucedida
        if response_pagina.status_code == 200:

            # Transformando em objeto soup
            soup_pagina = BeautifulSoup(response_pagina.text, 'html.parser')

            # Verifica se tem produto na página
            if not soup_pagina.find_all('script', string=lambda text: text and '"ean"' in text):
                # Se não tem, é por que acabou
                return nomes_pagina, ean_pagina, precos_pagina, precos_desconto_pagina, marcas_pagina

            else:
                # Extrair JSON oculto
                json_data = achar_json_oculto(soup_pagina)

                # Obter as chaves de nome e ean
                chaves_filtradas_nome_ean_ids = chaves_nome_ean(json_data)
                chaves_filtradas_preco = chaves_precos(json_data)

                # Informações dessas chaves:
                informacoes_nome_ean_ids = pegar_informacoes(chaves_filtradas_nome_ean_ids,json_data)
                informacoes_preco = pegar_informacoes(chaves_filtradas_preco,json_data)

                # Coletar as informações de nome e EAN
                nomes, ean, ids = nomes_ean_ids(informacoes_nome_ean_ids)
                precos, precos_desconto = precos_precosdesconto(informacoes_preco)

                # Pegar as chaves das marcas
                # Cria uma lista para as chaves das marcas
                chaves_marcas_filtradas = []
                # Itera por todos os ids dos produtos da página
                for id in ids:
                    texto_id = id[0]['id']
                    chaves_marcas_filtradas.append(texto_id.split(".items")[0])
                informacoes_marcas_filtradas = pegar_informacoes(chaves_marcas_filtradas,json_data)
                marcas = []
                for i in range(len(informacoes_marcas_filtradas)):
                        # Extrai os dados de nome e código ean
                        marcas.append(informacoes_marcas_filtradas[i]['brand'])
    
                # Adiciona as informações nas listas que usaremos para criar o data frame
                nomes_pagina.extend(nomes)
                ean_pagina.extend(ean)
                precos_pagina.extend(precos)
                precos_desconto_pagina.extend(precos_desconto)
                marcas_pagina.extend(marcas)
                
                # Muda a página
                url_pagina = f"{url_marca}&page={pagina_atual}"
                pagina_atual += 1
        
        # Se a solicitação falhar, sair do loop    
        else:
            break
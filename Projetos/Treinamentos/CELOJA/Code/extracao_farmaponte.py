from requests import get
from bs4 import BeautifulSoup
import re

def extracao_final(links_produtos):
    nomes = []
    precos_sem_desconto = []
    precos_pix = []
    porcentagens_desconto = []
    valores_descontos = []
    marcas = []
    eans = []
    
    for i in range(len(links_produtos)):            
        url_produto = f'https://www.farmaponte.com.br/{links_produtos[i]}'
        response_dados = get(url_produto)
        soup_dados = BeautifulSoup(response_dados.text, 'html.parser')
        nome_produto = soup_dados.find('h1', class_='name').text
        scripts = soup_dados.find_all('script', type='text/javascript')

        # Encontrar o script que contém 'dataItem'
        data_script = None
        for script in scripts:
            if script.string and 'dataItem' in script.string:
                data_script = script.string
                break

        # Passo 3: Extrair as informações do script
        if data_script:
            # Expressões regulares para extrair o preço e desconto
            price_pattern = re.compile(r'"price":([\d.]+)')
            discount_pattern = re.compile(r'"discount":([\d.]+)')
            
            # Extraindo os valores
            price_match = price_pattern.search(data_script)
            discount_match = discount_pattern.search(data_script)

        if price_match:
            price = float(price_match.group(1))
        else:
            price = 'Preço indisponível'
        
        if discount_match:
            discount = float(discount_match.group(1))
        else:
            discount = 0

        # Pegar preço do pix
        preco_pix = soup_dados.find('div', class_='pix-price')
        if preco_pix:
            preco_pix = preco_pix.text.strip().replace('no pix', '')
        else: 
            preco_pix = price

        # Pegar porcentagem de desconto
        porcentagem_desconto = soup_dados.find('span', class_='discount')
        if porcentagem_desconto:
            porcentagem_desconto = porcentagem_desconto.text.replace('off', '')
        else:
            porcentagem_desconto = '0%'

        # Pegar EAN
        ean = soup_dados.find('meta', itemprop='gtin13')
        if ean and 'content' in ean.attrs:
            eans.append(ean['content'].strip())
        else:
            eans.append("EAN não informado")

        # Pegar marcas

        marcas_dicionario = {
        'ADV Farma': ['adv'],
        'Abbott do Brasil': ['Abbott'],
        'Addera': ['Addera'],
        'Allergan': ['Allergan'],
        'Astrazeneca': ['AstraZeneca'],
        'Aché': ['Ache'],
        'Biolab Genéricos': ['Biolab Genérico'],
        'Biosintética - Aché': ['Biosintética'],
        'Catarinense Pharma': ['Catarinense'],
        'Cimed': ['Cimed'],
        'Cosmed': ['Cosmed'],
        'Diffucap Chemobras': ['Diffucap'],
        'EMS': ['EMS', 'Ems', 'ems'],
        'EMS Sigma Pharma': ['Sigma'],
        'Pfizer': ['Eliquis'],
        'Eurofarma': ['Eur', 'Eurofarma'],
        'Farmoquímica': ['Farmoquímica'],
        'GSK': ['GSK', 'Gsk'],
        'Geolab': ['Geolab'],
        'Germed Pharma': ['Germed', 'germed'],
        'Glenmark': ['Glenmark'],
        'Grünenthal': ['Grunenthal'],
        'Legrand': ['Legrand'],
        'Libbs': ['Libbs'],
        'Merck': ['Merck'],
        'Medley': ['Med', 'med'],
        'Neo Química': ['neo', 'Neo'],
        'Novartis': ['Novartis'],
        'Prati-Donaduzzi': ['Prati', 'PRATI'],
        'Ranbaxy': ['Ranbaxy'],
        'Sandoz': ['Sandoz'],
        'Sanofi': ['Sanofi'],
        'Servier': ['Servier'],
        'Supera': ['Supera'],
        'Teuto': ['Teuto'],
        'Torrent': ['TORRENT', 'Torrent'],
        'União Química': ['União', 'Uniao']
        }

        aux_marca = soup_dados.find('meta', {'itemprop': 'brand'})

        if aux_marca:    
            marca_produto = aux_marca['content']

        else:
            for marca, chaves in marcas_dicionario.items():
                for chave in chaves:
                    if chave in nome_produto:
                        marca_produto = marca
                    else:
                        marca_produto = "Não especificada"

        nomes.append(nome_produto) 
        precos_sem_desconto.append(price)
        precos_pix.append(preco_pix)
        porcentagens_desconto.append(porcentagem_desconto)
        marcas.append(marca_produto)
        valores_descontos.append(discount)

    return nomes, precos_sem_desconto, precos_pix, valores_descontos, porcentagens_desconto, marcas, eans

def chunk_list(list, n):
    for i in range(0, len(list), n):
        yield list[i:i + n]
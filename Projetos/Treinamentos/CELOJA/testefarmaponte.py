import requests
from bs4 import BeautifulSoup

          
url_produto = 'https://www.farmaponte.com.br/depzel-10mg-uniao-quimica-30-comprimidos-revestidos/p'
response_dados = requests.get(url_produto)
soup_dados = BeautifulSoup(response_dados.text, 'html.parser')
nome_produto = soup_dados.find('h1', class_='name').text
preco_com_desconto_1 = soup_dados.find('p', class_='card-installments')
if preco_com_desconto_1:
    preco_com_desconto_2 = preco_com_desconto_1.find('a', class_='get_installments')
    preco_com_desconto_f = preco_com_desconto_2.get('data-price')
    aux_preco = float(preco_com_desconto_f)
    preco_com_desconto_formatado = '{:.2f}'.format(aux_preco).replace('.',',')
    precocdsaida = f'R$ {preco_com_desconto_formatado}'
    print(precocdsaida)
    preco_sem_desconto = soup_dados.find('p', class_='unit-price')
    if not preco_sem_desconto:
        preco_sem_desconto = precocdsaida
    else:
        preco_sem_desconto = preco_sem_desconto.text
    preco_pix = soup_dados.find('div', class_='pix-price')
    if preco_pix:
        preco_pix = preco_pix.text.strip().replace('no pix', '')
    else: 
        preco_pix = precocdsaida
    porcentagem_desconto = soup_dados.find('span', class_='discount')
    if porcentagem_desconto:
        porcentagem_desconto = porcentagem_desconto.text.replace('off', '')
    else:
        porcentagem_desconto = '0%'
    aux_desconto1 = float(preco_sem_desconto.replace('R$', '').replace('.', '').replace(',','.'))
    aux_desconto2 = float(preco_com_desconto_formatado.replace('.', '').replace(',','.'))
    valor_desconto = aux_desconto1 - aux_desconto2
    valor_desconto_formatado = '{:.2f}'.format(valor_desconto).replace('.', ',')
    print(f"R$ {valor_desconto_formatado}")
else: 
    preco_com_desconto = 'Produto Indisponível'
    preco_sem_desconto = 'Produto Indisponível'
    preco_pix = 'Produto Indisponível'
    porcentagem_desconto = 'Produto Indisponível'
    valor_desconto = 'Produto Indisponível'
    print(valor_desconto)
    print(preco_com_desconto)
aux_marca = soup_dados.find('meta', {'itemprop': 'brand'})
if aux_marca:    
    marca_produto = aux_marca['content']
elif 'adv' in nome_produto:
    marca_produto = 'ADV Farma'
elif 'Abbott' in nome_produto:
    marca_produto = 'Abbott do Brasil'
elif 'Biolab Genérico' in nome_produto:
    marca_produto = 'Biolab Genéricos'
elif 'Biosintética' in nome_produto:
    marca_produto = 'Biosintética - Aché'
elif 'Catarinense' in nome_produto:
    marca_produto = 'Catarinense Pharma'
elif 'Diffucap' in nome_produto:
    marca_produto = 'Diffucap Chemobras'
elif 'EMS' in nome_produto or 'Ems' in nome_produto or 'ems' in nome_produto:
    marca_produto = 'EMS'
elif 'Sigma' in nome_produto:
    marca_produto = 'EMS Sigma Pharma'
elif 'Eliquis' in nome_produto:
    marca_produto = 'Pfizer'
elif "Eur" in nome_produto or 'Eurofarma' in nome_produto:
    marca_produto = 'Eurofarma'
elif 'Farmoquímica' in nome_produto:
    marca_produto = 'Farmoquímica'
elif 'GSK' in nome_produto or 'Gsk' in nome_produto:
    marca_produto = 'GSK'
elif 'Geolab' in nome_produto:
    marca_produto = 'Geolab'
elif 'Germed' in nome_produto or 'germed' in nome_produto:
    marca_produto = 'Germed Pharma'
elif 'Glenmark' in nome_produto:
    marca_produto = 'Glenmark'
elif 'Grunenthal' in nome_produto:
    marca_produto = 'Grünenthal'
elif 'Legrand' in nome_produto:
    marca_produto = 'Legrand'
elif 'Merck' in nome_produto:
    marca_produto = 'Merck'
elif 'Med' in nome_produto or 'med' in nome_produto:
    marca_produto = 'Medley'
elif 'neo' in nome_produto or 'Neo' in nome_produto:
    marca_produto = "Neo Química"
elif 'Novartis' in nome_produto:
    marca_produto = 'Novartis'
elif 'Prati' in nome_produto or 'PRATI' in nome_produto:
    marca_produto = 'Prati-Donaduzzi'
elif 'Ranbaxy' in nome_produto:
    marca_produto = 'Ranbaxy'
elif 'Sandoz' in nome_produto:
    marca_produto = 'Sandoz'
elif 'Sanofi' in nome_produto:
    marca_produto = 'Sanofi'
elif 'Servier' in nome_produto:
    marca_produto = 'Servier'
elif 'Supera' in nome_produto:
    marca_produto = 'Supera'
elif 'Teuto' in nome_produto:
    marca_produto = 'Teuto'
elif 'TORRENT' in nome_produto or 'Torrent' in nome_produto:
    marca_produto = 'Torrent'
elif 'União' in nome_produto or 'Uniao' in nome_produto:
    marca_produto = 'União Química'

print(nome_produto) 
print(preco_sem_desconto)
print(preco_pix)
print(porcentagem_desconto)
print(marca_produto)
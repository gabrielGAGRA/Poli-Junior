# importando bibliotecas necessárias
import requests
from bs4 import BeautifulSoup
import json

# fazendo a requisição com o site 
requisicao = requests.get('https://www.farmaponte.com.br/saude/medicamentos/')

# transformando em objeto soup
soup = BeautifulSoup(requisicao.text, 'html.parser')

# encontrando o arquivo json
json_file = json.loads(soup.find('template', {'data-varname': '__STATE__'}).find('script').text)
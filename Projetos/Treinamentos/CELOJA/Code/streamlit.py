import streamlit as st

st.markdown(
    f'<div style="display: flex; justify-content: center;"><img src="https://raw.githubusercontent.com/gabrielGAGRA/gabrielGAGRA/d751aca02bad10938dbe528ab8e6eb941fc2c91f/file.jpg" width="200"></div>', 
    unsafe_allow_html=True,
)
     
st.markdown(
    '''
    <style>
    div[class*="stTextInput"] label {
        font-size: 35px;
        color: red;
    }

    div[class*="stSelectbox"] label {
        font-size: 35px;
        color: red;
    }
    .logo {
        position: fixed;
        bottom: 10px;
        right: 10px;
        width: 100px; /* Ajuste o tamanho conforme necessário */
    }

     </style>
    ''',
    unsafe_allow_html=True,
)


st.markdown(
    f'<h1 style="text-align: center; font-family: Arial; font-size: 36px;">Extração de dados dos sites Drogaria Minas Mais e FarmaPonte</h1>',
    unsafe_allow_html=True
)

st.write("### Resultados da extração de dados do site Drogarias Minas Mais")

button_minas = st.button("Acessar dados do site Drogarias Minas Mais")

if button_minas:
    # Iniciar a barra de progresso
    progress_bar = st.progress(0)
    progress_value = 0
    
    from bs4 import BeautifulSoup
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from pandas import DataFrame
    
    import extracao_drogaminas as dm

    # URL da página de medicamentos
    url_inicial = "https://www.drogariasminasmais.com.br/medicamentos"

    # Request da URL da página de medicamentos
    response = dm.get_response(url_inicial)

    # Transformando em objeto soup
    soup = BeautifulSoup(response.text, 'html.parser')

    # Extraindo as marcas, que serão utilizadas para gerar os urls que utilizaremos na extração dos conteúdos desejados
    checkboxes = soup.find_all('input', type='checkbox')
    
    marcas = []
    for checkbox in checkboxes:
        id_checkbox = checkbox.get('id')
        if id_checkbox.startswith("brand-"):
            nome_marca = id_checkbox[len("brand-"):].lower().replace(" ", "-")
            if nome_marca not in marcas:
                marcas.append(nome_marca)

    # Gerando lista com todos os URLs de todas as marcas
    urls_marcas = [dm.gerar_url_marca(marca) for marca in marcas]
    
    todos_nomes = []
    todos_ean = []
    todos_precos = []
    todos_precos_desconto = []
    todas_marcas = []
    
    progress_value += 0.03
    progress_bar.progress(progress_value)

    update_frequency = 10
    # Usando ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=16) as executor:
        futures = [executor.submit(dm.get_all_info, url_marca) for url_marca in urls_marcas]
        total_futures = len(futures)
        
        for i, future in enumerate(as_completed(futures)):
            nomes_pagina, ean_pagina, precos_pagina, precos_desconto_pagina, marcas_pagina = future.result()
            todos_nomes.extend(nomes_pagina)
            todos_ean.extend(ean_pagina)
            todos_precos.extend(precos_pagina)
            todos_precos_desconto.extend(precos_desconto_pagina)
            todas_marcas.extend(marcas_pagina)
            
            if (i + 1) % update_frequency == 0:
                progress_value = 0.03 + 0.97 * (i + 1) / total_futures
                progress_bar.progress(progress_value)

    # Cria o dataframe com todas as informações coletadas
    df = DataFrame({
        'Nome': todos_nomes,
        'Marca': todas_marcas,
        'EAN': todos_ean,
        'Preço': todos_precos,
        'Preço com desconto': todos_precos_desconto,
    })

    # Calcular o valor do desconto
    df['Valor do desconto'] = df['Preço'] - df['Preço com desconto']

    # Calcular a porcentagem do desconto
    df['Porcentagem de desconto'] = round((df['Valor do desconto'] / df['Preço']) * 100, 1)

    df.to_csv('drogaminasmais.csv', index=False)
    df.to_excel('drogaminasmais.xlsx', index=False)

    # Remover a barra de progresso após a conclusão
    progress_bar.empty()

    # Exibir o DataFrame
    st.write(df)

st.write("### Resultados da extração de dados do site FarmaPonte")

button_ponte = st.button("Acessar dados do site FarmaPonte")

if button_ponte:
    # Iniciar a barra de progresso
    progress_bar = st.progress(0)
    progress_value = 0
    
    from requests import get
    from bs4 import BeautifulSoup
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from pandas import DataFrame
    
    import extracao_farmaponte as fp

    url = 'https://www.farmaponte.com.br/s/farmaponte/sitemap-categories-1.xml'
    response = get(url)
    soup = BeautifulSoup(response.text, 'xml')\

    # Extraindo os links para cada categoria
    links_categorias = soup.find_all('loc')
    link_med_geral = False
    links_produtos = []
    
    for link in links_categorias:        
        if '/medicamentos' in link.text:
            if not link_med_geral:
                link_med_geral = True
            else:
                pagina = 1 
                while True:
                    link_pagina = f"{link.text}?p={pagina}"
                    response_produtos = get(link_pagina) # Extraindo links de cada produto por categoria
                    soup_produtos = BeautifulSoup(response_produtos.text, 'html.parser')
                    titulo = soup_produtos.find_all('h2', class_='title')
                    if not titulo:
                        break
                    for cada in titulo:
                        link_produto = cada.find('a', href=True)
                        if link_produto:
                            links_produtos.append(link_produto['href'])
                    pagina += 1

    chunks = list(fp.chunk_list(links_produtos, 10))

    todos_nomes = []
    todos_precos_sem_desconto = []
    todos_precos_pix = []
    todos_valores_descontos = []
    todas_porcentagens_desconto = []
    todas_marcas = []
    todos_ean = []
    
    # Atualizar a barra de progresso
    progress_value += 0.03
    progress_bar.progress(progress_value)
    
    update_frequency = 10
    
    with ThreadPoolExecutor(max_workers=22) as executor: #deixar em 6 para cpus com 6 cores
        futures = [executor.submit(fp.extracao_final, chunk) for chunk in chunks]
        total_futures = len(futures)
        
        for i,future in enumerate(as_completed(futures)):
            nomes, precos_sem_desconto, precos_pix, valores_descontos, porcentagens_desconto, marcas, eans = future.result()
            todos_nomes.extend(nomes)
            todos_precos_sem_desconto.extend(precos_sem_desconto)
            todos_precos_pix.extend(precos_pix)
            todos_valores_descontos.extend(valores_descontos)
            todas_porcentagens_desconto.extend(porcentagens_desconto)
            todas_marcas.extend(marcas)
            todos_ean.extend(eans)

            if (i + 1) % update_frequency == 0:
                progress_value = 0.03 + 0.97 * (i + 1) / total_futures
                progress_bar.progress(progress_value)

    df = DataFrame({
        'Nome': todos_nomes,
        'Marca': todas_marcas,
        'EAN' : todos_ean,
        'Preço sem desconto': todos_precos_sem_desconto,
        'Preço no pix': todos_precos_pix,
        'Valor do desconto': todos_valores_descontos,
        'Porcentagem desconto': todas_porcentagens_desconto
        })             

    df['Preço com Desconto'] = df['Preço sem desconto'] - df['Valor do desconto']
    
    df.to_csv('farmaponte.csv', index=False)
    df.to_excel('farmaponte.xlsx', index=False)

    # Remover a barra de progresso após a conclusão
    progress_bar.empty()

    st.write(df)
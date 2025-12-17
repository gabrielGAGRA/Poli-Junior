import os
from PIL import Image
import numpy as np


def transformar_cores_com_qualidade(caminho_entrada, caminho_saida, threshold=80):
    """
    Troca as cores de uma imagem preservando o anti-aliasing,
    usando máscaras baseadas em semelhança de cor.
    """
    try:
        # Abre a imagem e a converte para um array NumPy para processamento rápido
        img_original = Image.open(caminho_entrada).convert("RGB")
        data = np.array(img_original)

        # --- Definição das Cores ---
        # Cores Alvo na imagem original
        cor_fundo_original = np.array([0, 0, 0])  # Preto
        cor_contorno_original = np.array([255, 255, 255])  # Branco
        cor_roxa_original = np.array([136, 43, 203])  # Roxo (#882BCB)

        # Novas Cores para a imagem de saída
        nova_cor_fundo = np.array([255, 255, 255])  # Branco
        nova_cor_contorno = np.array([0, 0, 0])  # Preto
        nova_cor_azul = np.array([0, 70, 142])  # Azul (#00468e)

        # --- Criação das Máscaras ---
        # Calcula a distância de cada pixel para as cores alvo
        distancia_fundo = np.linalg.norm(data - cor_fundo_original, axis=2)
        distancia_contorno = np.linalg.norm(data - cor_contorno_original, axis=2)
        distancia_roxa = np.linalg.norm(data - cor_roxa_original, axis=2)

        # Cria máscaras booleanas: True onde a distância é menor
        mascara_fundo = distancia_fundo < threshold
        mascara_contorno = distancia_contorno < threshold
        mascara_roxa = distancia_roxa < threshold

        # --- Reconstrução da Imagem ---
        # Começa com uma tela branca (o novo fundo)
        nova_data = np.full(data.shape, nova_cor_fundo, dtype=np.uint8)

        # Aplica o novo contorno preto onde a máscara do contorno original é True
        nova_data[mascara_contorno] = nova_cor_contorno

        # Aplica o novo preenchimento azul onde a máscara roxa original é True
        nova_data[mascara_roxa] = nova_cor_azul

        # Converte o array NumPy de volta para uma imagem PIL e salva
        img_nova = Image.fromarray(nova_data)
        img_nova.save(caminho_saida)

        print(f"Imagem transformada com qualidade e salva em: {caminho_saida}")

    except FileNotFoundError:
        print(f"Erro: O arquivo '{caminho_entrada}' não foi encontrado.")
    except Exception as e:
        print(f"Ocorreu um erro: {e}")


def processar_folder_imagens(pasta_entrada, pasta_saida, threshold=80):
    """
    Processa todas as imagens em uma pasta, aplicando a transformação de cores.
    """
    if not os.path.exists(pasta_saida):
        os.makedirs(pasta_saida)

    for arquivo in os.listdir(pasta_entrada):
        caminho_entrada = os.path.join(pasta_entrada, arquivo)
        caminho_saida = os.path.join(pasta_saida, arquivo)

        # Verifica se o arquivo é uma imagem válida
        if arquivo.lower().endswith((".png", ".jpg", ".jpeg", ".bmp", ".gif")):
            print(f"Processando: {arquivo}")
            transformar_cores_com_qualidade(caminho_entrada, caminho_saida, threshold)
        else:
            print(f"Arquivo ignorado (não é uma imagem): {arquivo}")


# --- Configuração ---
# Onde estão suas imagens originais
PASTA_DE_ENTRADA = r"C:\Users\gabri\Fotos\Logo"
# Onde as imagens modificadas serão salvas
PASTA_DE_SAIDA = r"C:\Users\gabri\Fotos\Logo 2"

# Execução principal
if __name__ == "__main__":
    processar_folder_imagens(PASTA_DE_ENTRADA, PASTA_DE_SAIDA)

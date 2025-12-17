import os
import openai
from openai import (
    OpenAI,
)  # Usar o cliente síncrono para operações de arquivo é mais simples aqui

# --- Configurações Iniciais ---
# Use a mesma chave API que você está usando no seu script principal
api_key = ""
client = OpenAI(api_key=api_key)


def list_and_identify_files():
    """Lista todos os arquivos carregados na sua conta OpenAI."""
    print("Listando todos os arquivos carregados na sua conta OpenAI...\n")
    try:
        files = client.files.list()
        if not files.data:
            print("Nenhum arquivo encontrado na sua conta.")
            return []

        problematic_files_identified = []
        print(f"{'File ID':<30} | {'Filename':<30} | {'Status':<15} | {'Purpose':<15}")
        print("-" * 95)
        for file in files.data:
            # Você pode adicionar mais filtros aqui se tiver muitos arquivos
            # Ex: if "ETAPAS" in file.filename:
            print(
                f"{file.id:<30} | {file.filename:<30} | {file.status:<15} | {file.purpose:<15}"
            )
            if (
                "ETAPAS" in file.filename and file.status == "failed"
            ):  # Ou outro status que você veja na UI
                problematic_files_identified.append(file.id)

        print(
            "\nArquivos com 'ETAPAS' e status 'failed' identificados para possível exclusão:"
        )
        for file_id in problematic_files_identified:
            print(f"- {file_id}")

        return problematic_files_identified

    except Exception as e:
        print(f"Erro ao listar arquivos: {e}")
        return []


def delete_file(file_id: str):
    """Tenta deletar um arquivo específico pelo seu ID."""
    print(f"\nTentando deletar o arquivo com ID: {file_id}...")
    try:
        response = client.files.delete(file_id)
        if response.deleted:
            print(f"✔️ Arquivo {file_id} deletado com sucesso.")
        else:
            print(f"❌ Falha ao deletar arquivo {file_id}. Resposta: {response}")
    except openai.APIStatusError as e:
        print(
            f"❌ Erro de API ao deletar {file_id}: Status {e.status_code}, Código: {e.code}, Mensagem: {e.message}"
        )
    except Exception as e:
        print(f"❌ Erro inesperado ao deletar {file_id}: {e}")


if __name__ == "__main__":
    print("--- Ferramenta de Gerenciamento de Arquivos OpenAI ---")

    # Passo 1: Listar e identificar os arquivos problemáticos
    identified_file_ids = list_and_identify_files()

    if not identified_file_ids:
        print(
            "\nNenhum arquivo problemático identificado automaticamente. Verifique os nomes e status."
        )
        user_input = input(
            "Deseja inserir IDs de arquivo manualmente para tentar deletar? (s/n): "
        ).lower()
        if user_input == "s":
            manual_ids_input = input(
                "Digite os IDs de arquivo separados por vírgula (ex: file-abc,file-xyz): "
            )
            identified_file_ids = [fid.strip() for fid in manual_ids_input.split(",")]
        else:
            print("Nenhuma ação de exclusão será tomada.")

    if identified_file_ids:
        confirm = input(
            f"\nConfirma a exclusão dos {len(identified_file_ids)} arquivos listados acima? (s/N): "
        ).lower()
        if confirm == "s":
            for file_id in identified_file_ids:
                delete_file(file_id)
            print("\nProcesso de exclusão finalizado. Verifique a plataforma OpenAI.")
        else:
            print("Exclusão cancelada pelo usuário.")
    else:
        print("\nNão há arquivos para deletar ou a operação foi cancelada.")

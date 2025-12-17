import json
import re  # Importar o módulo de expressões regulares

def processar_texto_json(input_file="Resolucao_2021.txt", output_file="Resolucao_2021.json"):
    documento = []
    # Adicionando o novo item no início do documento
    resolucao = {"Resolução": "RESOLUÇÃO NORMATIVA ANEEL Nº 1.000, DE 7 DE DEZEMBRO DE 2021"}
    documento.append(resolucao)

    current_title = None
    current_chapter = None
    current_section = None
    current_article = None
    current_paragraph = None
    awaiting_section_description = False
    article_text_accumulator = ""  # Acumulador de texto para artigos

    def clean_text(text):
        """Função para limpar espaços indevidos em um texto."""
        text = re.sub(r'\s+', ' ', text)  # Reduz múltiplos espaços para um único espaço
        text = re.sub(r'\s([,.:;!?])', r'\1', text)  # Remove espaço antes de pontuações
        return text.strip()

    with open(input_file, 'r', encoding='utf-8') as infile:
        for line in infile:
            line = line.strip()

            if line == "":
                continue

            if awaiting_section_description:
                if line:
                    full_section_title += " - " + line
                    current_section = {"section": full_section_title, "articles": []}
                    if current_chapter is None and current_title:  # Se não há capítulo, criar um padrão
                        current_chapter = {"chapter": "Capítulo I", "sections": []}
                        current_title['chapters'].append(current_chapter)
                    current_chapter['sections'].append(current_section)
                    awaiting_section_description = False
                continue

            if line.startswith("TÍTULO"):
                if current_title and not current_title["chapters"]:  # Adiciona um capítulo padrão se o título atual não tem capítulos
                    current_title["chapters"].append({"chapter": "Capítulo I", "sections": []})
                current_title = {"title": line, "chapters": []}
                documento.append(current_title)
                current_chapter = None
                current_section = None
                current_article = None
                current_paragraph = None

            elif line.startswith("CAPÍTULO"):
                current_chapter = {"chapter": line, "sections": []}
                current_title['chapters'].append(current_chapter)
                current_section = None
                current_article = None
                current_paragraph = None

            elif line.startswith("Seção"):
                full_section_title = line
                awaiting_section_description = True
                if current_chapter is None and current_title:  # Se não há capítulo, criar um padrão
                    current_chapter = {"chapter": "Capítulo I", "sections": []}
                    current_title['chapters'].append(current_chapter)

            elif line.startswith("Art."):
                if current_article and article_text_accumulator:
                    current_article["article"] = clean_text(current_article["article"] + " " + article_text_accumulator)
                    article_text_accumulator = ""
                current_article = {"article": line, "paragraphs": []}
                if current_section:
                    current_section['articles'].append(current_article)
                elif current_chapter is None and current_title:  # Se não há capítulo, mas temos artigos diretamente sob o título
                    current_chapter = {"chapter": "CAPÍTULO I", "sections": []}
                    current_title['chapters'].append(current_chapter)
                    current_section = {"section": "", "articles": [current_article]}
                    current_chapter['sections'].append(current_section)
                current_paragraph = None

            elif line.startswith("§"):
                if current_paragraph:
                    current_article['paragraphs'].append(current_paragraph)
                current_paragraph = {"paragraph": line}
                continue

            else:
                if current_paragraph is not None:
                    current_paragraph["paragraph"] += " " + line
                elif current_article is not None:
                    article_text_accumulator += " " + line

        if current_article and article_text_accumulator:
            current_article["article"] = clean_text(current_article["article"] + " " + article_text_accumulator)

        if current_title and not current_title["chapters"]:  # Final check to add a default chapter if none exist
            current_title["chapters"].append({"chapter": "Capítulo I", "sections": []})

    with open(output_file, 'w', encoding='utf-8') as outfile:
        json.dump(documento, outfile, ensure_ascii=False, indent=4)

processar_texto_json()

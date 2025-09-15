import re
import json

def parse_line(line):
    # Regex para capturar os componentes da linha: Tipo, artigo, prazo e descrição
    pattern = r"(\d+)\s+art\. ([\w\s,§º.único]+)\s+(\d+ dias úteis|\d+ dias)\s+(.+)"
    match = re.match(pattern, line)
    if match:
        tipo, dispositivo, prazo, descricao = match.groups()
        return {
            "Tipo": int(tipo),
            "Dispositivo": dispositivo.strip(),
            "Prazo": prazo,
            "Descrição": descricao.strip()
        }
    else:
        return None

def read_file(filename):
    entries = []
    with open(filename, 'r', encoding='utf-8') as file:
        for line in file:
            # Limpar e remover linhas irrelevantes
            clean_line = line.strip()
            if clean_line and not clean_line.startswith("Tipo") and not clean_line.startswith("ANEXO"):
                entry = parse_line(clean_line)
                if entry:
                    entries.append(entry)
                else:
                    # Se não encontrar uma entrada válida, tenta concatenar com a descrição anterior
                    if entries:
                        entries[-1]["Descrição"] += " " + clean_line
    return entries

def write_json(data, filename="output.json"):
    with open(filename, "w", encoding='utf-8') as json_file:
        json.dump(data, json_file, ensure_ascii=False, indent=4)

# Carregar os dados do arquivo
data = read_file("prazos.txt")
# Escrever os dados em um arquivo JSON
write_json(data)

# Exibir os dados carregados
print(json.dumps(data, indent=4, ensure_ascii=False))

# Ajustes Necessarios no Fluxo Gerado (Agent Builder)

Sim, o arquivo exportado precisa de ajustes antes de funcionar no runtime local.

Este guia lista apenas o que e obrigatorio para o backend conseguir importar e executar o fluxo.

## Onde aplicar

- Arquivo alvo: `flows/fluxo-NDados.py`
- Runtime esperado: `api/runtime/flows_exported.py`

## Checklist Obrigatorio

1. Corrigir erros de sintaxe gerados na exportacao
- Trocar ocorrencias como `temperature=0["8"]` por `temperature=0.8`.
- Completar todos os `else:` sem corpo (adicionar `pass`, `raise`, ou retorno).
- Garantir indentacao valida em todos os blocos condicionais.

2. Corrigir referencias de variavel incorretas
- Onde aparecer `PESQUISA: {input["output_text"]}`, usar a variavel correta do resultado anterior:
  - `PESQUISA: {pesquisador_result["output_text"]}`

3. Garantir que `run_workflow` sempre retorna saida valida
- Em todos os caminhos de execucao, retornar objeto com:
  - `titulo` (str)
  - `corpo_html` (str)
- Evitar caminhos sem retorno (que viram `None`).

4. Normalizar estado inicial vindo do payload
- O export costuma iniciar `state` com `None`.
- O fluxo precisa extrair/derivar valores de:
  - `cadencia`
  - `etapa`
  - `emails_anteriores`
- Se algum campo estiver ausente, definir fallback seguro (ex: string vazia para `emails_anteriores`).

5. Preservar a assinatura usada pelo adapter
- Manter:
  - classe `WorkflowInput`
  - funcao `async def run_workflow(workflow_input: WorkflowInput)`

## Ajustes Recomendados (nao bloqueantes, mas importantes)

1. Nomes de modelo
- Verificar se os modelos existem no ambiente atual (ex: `gpt-5.4`, `gpt-4.1`).

2. Imports e dependencias
- `from agents import ...` depende do pacote correto instalado (`openai-agents`).
- Se o linter acusar import nao resolvido, validar ambiente Python do deploy.

3. Protecao contra entrada incompleta
- Validar `input_as_text` antes de executar.
- Em caso invalido, retornar erro explicito (ou fallback definido).

## Patch rapido (padrao)

Use este padrao ao revisar toda nova exportacao:

1. Buscar padroes quebrados:
- `temperature=0["8"]`
- `PESQUISA: {input["output_text"]}`
- linhas com `else:` sem bloco seguinte

2. Rodar validacao sintatica do arquivo.

3. Testar um caso real no endpoint `/run-agent`.

## Criterio de pronto

O fluxo esta pronto quando:
- o arquivo importa sem erro,
- `run_workflow` executa sem excecao,
- o retorno final sempre contem `titulo` e `corpo_html`.

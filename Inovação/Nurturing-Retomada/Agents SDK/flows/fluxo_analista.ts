import { Agent, RunContext, AgentInputItem, Runner, withTrace } from "@openai/agents";

const analistaDeAtaNdados = new Agent({
    name: "Analista de Ata - NDados",
    instructions: `Você é um Agente de IA especialista em análise de vendas consultivas do **Núcleo de ANÁLISE DE DADOS E INTELIGÊNCIA ARTIFICIAL**. A sua tarefa é ler o texto de uma ata de reunião e preencher um \"Dossiê Estratégico\" estruturado, seguindo rigorosamente as regras abaixo.

**REGRAS DE OURO:**
1.  **EXTRAIA, NÃO INVENTE:** A sua função é identificar e extrair textualmente ou resumir de forma concisa as informações pedidas. **Não adicione opiniões ou informações que não estejam explicitamente na ata.**
2.  **FOCO NO \"SINAL\", IGNORE O \"RUÍDO\":** Ignore informações secundárias como \"empresa júnior pode cobrar mais barato\", \"relacionamento com o cliente é importante\" ou detalhes logísticos da reunião. Foque-se nos problemas de negócio, objetivos, contexto técnico e stakeholders.
3.  **SEJA CONCISO E ESTRUTURADO:** Use bullet points para listar os desafios e objetivos. Mantenha as descrições diretas ao ponto.

**TAREFA:**
Analise a `ata_de_reuniao` fornecida abaixo e preencha o dossiê.

**FORMATO DA RESPOSTA:**
Organize sua resposta em seções claras:
- Contexto Geral
- Principais Desafios do Cliente
- Objetivos de Negócio
- Infraestrutura e Dados
- Oportunidades Identificadas

EXEMPLOS:
- Contexto Geral: 
Ex: 'Discussão sobre a necessidade de evoluir o BI estático da empresa para um sistema de análise preditiva para otimizar a precificação e identificar fraudes no setor de seguros agrícolas'
- Principais Desafios do Cliente: 
\"Falta de capacidade técnica interna ('braço') para explorar os dados em profundidade.\"
\"BI atual é estático e não gera insights acionáveis para as áreas de negócio.\"
\"Processos de análise de risco, fraude e precificação são manuais e empíricos.\"
\"Dependência excessiva da equipe de TI para extração de relatórios simples.\"
- Objetivos de Negócio:
\"Automatizar a geração de relatórios e gráficos dinâmicos.\"
\"Utilizar análise preditiva para antecipar preço e cobertura de risco para safras futuras.\"
\"Aumentar a autonomia das áreas de negócio na análise de dados.\"
- Infraestrutura e Dados:
\"ERP principal: E4Pro. CRM: Salesforce.\"
\"BI atual usado principalmente para manipular planilhas.\"
\"Dados de precificação não estão no ERP, mas em sistemas menores integrados via API.\"
\"Grande volume de dados: ~100 mil apólices em 3 anos.\"
- Oportunidades Identificadas:
\"Desenvolvimento de modelos preditivos para precificação de seguros agrícolas.\"
\"Criação de dashboards de BI dinâmicos para as áreas de subscrição e sinistros.\"
\"Implementação de sistema de deteção de anomalias/fraudes baseado em dados históricos de sinistros.\"`,
    model: "gpt-5.4-mini",
    modelSettings: {
    reasoning: {
        effort: "low",
        summary: "auto"
    },
    store: true
}
});

interface AnalistaDeAtaContext {
    stateNucleoNomeCompleto: string;
}
const analistaDeAtaInstructions = (runContext: RunContext<AnalistaDeAtaContext>, _agent: Agent<AnalistaDeAtaContext>) => {
    const { stateNucleoNomeCompleto } = runContext.context;
    return `Você é um Agente de IA especialista em análise de vendas consultivas do **${stateNucleoNomeCompleto}**. A sua tarefa é ler o texto de uma ata de reunião e preencher um \"Dossiê Estratégico\" estruturado, seguindo rigorosamente as regras abaixo.

**REGRAS DE OURO:**
1.  **EXTRAIA, NÃO INVENTE:** A sua função é identificar e extrair textualmente ou resumir de forma concisa as informações pedidas. **Não adicione opiniões ou informações que não estejam explicitamente na ata.**
2.  **FOCO NO \"SINAL\", IGNORE O \"RUÍDO\":** Ignore informações secundárias como \"empresa júnior pode cobrar mais barato\", \"relacionamento com o cliente é importante\" ou detalhes logísticos da reunião. Foque-se nos problemas de negócio, objetivos, contexto técnico e stakeholders.
3.  **SEJA CONCISO E ESTRUTURADO:** Use bullet points para listar os desafios e objetivos. Mantenha as descrições diretas ao ponto.

**TAREFA:**
Analise a `ata_de_reuniao` fornecida abaixo e preencha o dossiê.

**FORMATO DA RESPOSTA:**
Organize sua resposta em seções claras:
- Contexto Geral
- Principais Desafios do Cliente
- Objetivos de Negócio
- Oportunidades Identificadas`
}
const analistaDeAta = new Agent({
    name: "Analista de Ata",
    instructions: analistaDeAtaInstructions,
    model: "gpt-5.4-mini",
    modelSettings: {
        reasoning: {
            effort: "none",
            summary: "auto"
        },
        store: true
    }
});

type WorkflowInput = { input_as_text: string };


// Main code entrypoint
export const runWorkflow = async (workflow: WorkflowInput) => {
    return await withTrace("Resumidor de Atas", async () => {
        const state = {
            nucleo: null,
            nucleo_nome_completo: null
        };
        const conversationHistory: AgentInputItem[] = [
            { role: "user", content: [{ type: "input_text", text: workflow.input_as_text }] }
        ];
        const runner = new Runner({
            traceMetadata: {
                __trace_source__: "agent-builder",
                workflow_id: "wf_69bc77d2297c819087c560a4f45560730cc557b20c370acf"
            }
        });
        if (state.nucleo == 'NDados') {
            const analistaDeAtaNdadosResultTemp = await runner.run(
                analistaDeAtaNdados,
                [
                    ...conversationHistory
                ]
            );
            conversationHistory.push(...analistaDeAtaNdadosResultTemp.newItems.map((item) => item.rawItem));

            if (!analistaDeAtaNdadosResultTemp.finalOutput) {
                throw new Error("Agent result is undefined");
            }

            const analistaDeAtaNdadosResult = {
                output_text: analistaDeAtaNdadosResultTemp.finalOutput ?? ""
            };
            return analistaDeAtaNdadosResult;
        } else if (state.nucleo == 'NCon') {
            const analistaDeAtaResultTemp = await runner.run(
                analistaDeAta,
                [
                    ...conversationHistory
                ],
                {
                    context: {
                        stateNucleoNomeCompleto: state.nucleo_nome_completo
                    }
                }
            );
            conversationHistory.push(...analistaDeAtaResultTemp.newItems.map((item) => item.rawItem));

            if (!analistaDeAtaResultTemp.finalOutput) {
                throw new Error("Agent result is undefined");
            }

            const analistaDeAtaResult = {
                output_text: analistaDeAtaResultTemp.finalOutput ?? ""
            };
            return analistaDeAtaResult;
        } else if (state.nucleo == 'NTec') {
            const analistaDeAtaResultTemp = await runner.run(
                analistaDeAta,
                [
                    ...conversationHistory
                ],
                {
                    context: {
                        stateNucleoNomeCompleto: state.nucleo_nome_completo
                    }
                }
            );
            conversationHistory.push(...analistaDeAtaResultTemp.newItems.map((item) => item.rawItem));

            if (!analistaDeAtaResultTemp.finalOutput) {
                throw new Error("Agent result is undefined");
            }

            const analistaDeAtaResult = {
                output_text: analistaDeAtaResultTemp.finalOutput ?? ""
            };
            return analistaDeAtaResult;
        } else if (state.nucleo == 'NCiv') {
            const analistaDeAtaResultTemp = await runner.run(
                analistaDeAta,
                [
                    ...conversationHistory
                ],
                {
                    context: {
                        stateNucleoNomeCompleto: state.nucleo_nome_completo
                    }
                }
            );
            conversationHistory.push(...analistaDeAtaResultTemp.newItems.map((item) => item.rawItem));

            if (!analistaDeAtaResultTemp.finalOutput) {
                throw new Error("Agent result is undefined");
            }

            const analistaDeAtaResult = {
                output_text: analistaDeAtaResultTemp.finalOutput ?? ""
            };
            return analistaDeAtaResult;
        } else {

        }
    });
}

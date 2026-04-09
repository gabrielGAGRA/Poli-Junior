/**
 * Google Apps Script - Fluxo de Tradução: Resumidor de Atas
 * 
 * Extraído do código Agent Builder (TS). Mantém a clara separação entre 
 * agentes, configs de modelo (gpt-5.4-mini, configs de raciocínio lógico)
 * e o roteamento principal de lógica de negócios.
 */

const Flow_FluxoAtas = {

    /**
     * ==========================================
     * DEFINIÇÕES DE AGENTES
     * ==========================================
     * Isoladas para facilitar a manutenção de Prompts
     * e Configurações de Modelos individuais de cada nucleo.
     */

    AnalistaDeAtaNdados: {
        name: "Analista de Ata - NDados",
        model: "gpt-5.4-mini",
        // Configurações do wrapper Responses
        settings: {
            reasoning_effort: "low",
            store: true
        },
        getInstructions: function () {
            return `Você é um Agente de IA especialista em análise de vendas consultivas do **Núcleo de ANÁLISE DE DADOS E INTELIGÊNCIA ARTIFICIAL**. A sua tarefa é ler o texto de uma ata de reunião e preencher um "Dossiê Estratégico" estruturado, seguindo rigorosamente as regras abaixo.

**REGRAS DE OURO:**
1.  **EXTRAIA, NÃO INVENTE:** A sua função é identificar e extrair textualmente ou resumir de forma concisa as informações pedidas. **Não adicione opiniões ou informações que não estejam explicitamente na ata.**
2.  **FOCO NO "SINAL", IGNORE O "RUÍDO":** Ignore informações secundárias como "empresa júnior pode cobrar mais barato", "relacionamento com o cliente é importante" ou detalhes logísticos da reunião. Foque-se nos problemas de negócio, objetivos, contexto técnico e stakeholders.
3.  **SEJA CONCISO E ESTRUTURADO:** Use bullet points para listar os desafios e objetivos. Mantenha as descrições diretas ao ponto.

**TAREFA:**
Analise a ata_de_reuniao fornecida abaixo e preencha o dossiê.

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
"Falta de capacidade técnica interna ('braço') para explorar os dados em profundidade."
"BI atual é estático e não gera insights acionáveis para as áreas de negócio."
"Processos de análise de risco, fraude e precificação são manuais e empíricos."
"Dependência excessiva da equipe de TI para extração de relatórios simples."
- Objetivos de Negócio:
"Automatizar a geração de relatórios e gráficos dinâmicos."
"Utilizar análise preditiva para antecipar preço e cobertura de risco para safras futuras."
"Aumentar a autonomia das áreas de negócio na análise de dados."
- Infraestrutura e Dados:
"ERP principal: E4Pro. CRM: Salesforce."
"BI atual usado principalmente para manipular planilhas."
"Dados de precificação não estão no ERP, mas em sistemas menores integrados via API."
"Grande volume de dados: ~100 mil apólices em 3 anos."
- Oportunidades Identificadas:
"Desenvolvimento de modelos preditivos para precificação de seguros agrícolas."
"Criação de dashboards de BI dinâmicos para as áreas de subscrição e sinistros."
"Implementação de sistema de deteção de anomalias/fraudes baseado em dados históricos de sinistros."`;
        }
    },

    AnalistaDeAtaGeral: {
        name: "Analista de Ata",
        model: "gpt-5.4-mini",
        settings: {
            reasoning_effort: "none", // Como no exportado, esse agente não exige reasoning
            store: true
        },
        getInstructions: function (stateNucleoNomeCompleto) {
            return `Você é um Agente de IA especialista em análise de vendas consultivas do **${stateNucleoNomeCompleto}**. A sua tarefa é ler o texto de uma ata de reunião e preencher um "Dossiê Estratégico" estruturado, seguindo rigorosamente as regras abaixo.

**REGRAS DE OURO:**
1.  **EXTRAIA, NÃO INVENTE:** A sua função é identificar e extrair textualmente ou resumir de forma concisa as informações pedidas. **Não adicione opiniões ou informações que não estejam explicitamente na ata.**
2.  **FOCO NO "SINAL", IGNORE O "RUÍDO":** Ignore informações secundárias como "empresa júnior pode cobrar mais barato", "relacionamento com o cliente é importante" ou detalhes logísticos da reunião. Foque-se nos problemas de negócio, objetivos, contexto técnico e stakeholders.
3.  **SEJA CONCISO E ESTRUTURADO:** Use bullet points para listar os desafios e objetivos. Mantenha as descrições diretas ao ponto.

**TAREFA:**
Analise a ata_de_reuniao fornecida abaixo e preencha o dossiê.

**FORMATO DA RESPOSTA:**
Organize sua resposta em seções claras:
- Contexto Geral
- Principais Desafios do Cliente
- Objetivos de Negócio
- Oportunidades Identificadas`;
        }
    },

    /**
     * ==========================================
     * LÓGICA DO WORKFLOW (RUNNER)
     * ==========================================
     */

    /**
     * Ponto de entrada do Workflow chamado pela orquestração do GAS.
     * 
     * @param {Object} workflow
     * @param {string} workflow.input_as_text A ata da reunião em si
     * @param {Object} workflow.state Objeto de estado com as propriedades (do CRM/Pipedrive)
     * @param {string} workflow.state.nucleo Sigla do Núcleo (ex: 'NDados', 'NCon', 'NTec', 'NCiv')
     * @param {string} workflow.state.nucleo_nome_completo Nome completo (ex: 'Núcleo de Consultoria')
     * @returns {Object} `{ output_text: "..." }`
     */
    runWorkflow: function (workflow) {
        // Inicialização defensiva do state
        const state = workflow.state || { nucleo: "", nucleo_nome_completo: "" };
        const inputText = workflow.input_as_text || "";

        if (!inputText) {
            throw new Error("Fluxo_Atas: input_as_text é obrigatório na entrada do workflow.");
        }

        let agentConfig;
        let instructions;

        // Roteamento condicional (Branching) extraído do Node nativo exportado
        if (state.nucleo === 'NDados') {
            agentConfig = this.AnalistaDeAtaNdados;
            instructions = agentConfig.getInstructions();
            console.log("Roteando para AnalistaDeAtaNdados");
        } else if (['NCon', 'NTec', 'NCiv'].includes(state.nucleo)) {
            agentConfig = this.AnalistaDeAtaGeral;
            instructions = agentConfig.getInstructions(state.nucleo_nome_completo);
            console.log(`Roteando para AnalistaDeAtaGeral (${state.nucleo})`);
        } else {
            // Configuração padrão tolerante a falha via fallback
            agentConfig = this.AnalistaDeAtaGeral;
            instructions = agentConfig.getInstructions(state.nucleo_nome_completo || "Núcleo de Especialistas");
            console.warn(`Núcleo não reconhecido ('${state.nucleo}'). Usando configuração padrão (Geral).`);
        }

        // Construir o payload de execução mapeando os settings configurados
        // para os moldes da classe OpenAI_ResponsesAPI criada na sprint passada
        const apiOptions = {
            model: agentConfig.model,
            instructions: instructions,
            input: inputText,
            store: agentConfig.settings.store,
            reasoning_effort: agentConfig.settings.reasoning_effort !== "none" ? agentConfig.settings.reasoning_effort : undefined
        };

        // Chama o Wrapper do GAS para encapsular o API Request HTTP real
        // Fica de propósito sincrono pois GAS é sincrono e resolve bloqueamento transparente
        const response = OpenAI_ResponsesAPI.create(apiOptions);

        let finalOutput = "";

        // Tenta usar o atalho "output_text" facilitado pela Responses API 
        // ou desce na arvore de Outputs para concaternar a mensagem gerada
        if (response.output_text) {
            finalOutput = response.output_text;
        } else if (response.output && response.output.length > 0) {
            for (let item of response.output) {
                if (item.type === "message" && item.content) {
                    for (let block of item.content) {
                        if (block.type === "output_text" || block.type === "text") {
                            finalOutput += (block.text || block.output_text || "");
                        }
                    }
                }
            }
        }

        if (!finalOutput) {
            throw new Error("Flow_FluxoAtas: Falha ao extrair a resposta no formato esperado da OpenAI. Payload retornou vazio.");
        }

        // Mantém a exata mesma interface JSON combinada anteriormente pelo Python/TS
        return {
            output_text: finalOutput
        };
    }
};

// Facilita testes parciais via Node/Jest, omitido sem erros no ambiente global interno GAS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Flow_FluxoAtas;
}
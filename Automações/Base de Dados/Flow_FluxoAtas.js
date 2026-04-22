// Att: 17/04/2026

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
            reasoning: {
                effort: "low",
                summary: "detailed"
            },
            store: true
        },
        getInstructions: function () {
            return `<task_objective>
Atuar como Analista de Inteligência de Negócios para o Núcleo de Dados & IA. Sua missão é converter transcrições de reuniões brutas em um Dossiê Estratégico de alta densidade informativa.
</task_objective>

<noise_gating_rules>
- Ignore explicitamente: cumprimentos, agendamentos, problemas técnicos de áudio/vídeo e discussões sobre preços baixos da Poli Júnior (ruído de branding).
- Foque apenas em: dores de negócio, infraestrutura tecnológica citada e objetivos estratégicos.
</noise_gating_rules>

<extraction_contract>
Para cada seção do dossiê, extraia fatos e dados. Se a informação não foi mencionada, utilize "[Não mencionado]".
1. Contexto Geral: Resumo de 1 frase do cenário do cliente.
2. Desafios: Bullet points sobre dores latentes (braço técnico, BI estático, processos manuais).
3. Objetivos: O que o sucesso do projeto significa para o negócio deles.
4. Infraestrutura: ERPs, CRMs, APIs e volumes de dados citados.
5. Oportunidades: Onde a IA e os Dados podem gerar ROI imediato.
</extraction_contract>

<verification_loop>
Antes de finalizar:
- Verifique se você não "inventou" detalhes técnicos para preencher as lacunas.
- Certifique-se de que a linguagem é profissional e isenta de interjeições conversacionais.
</verification_loop>

<output_format>
Use Markdown para cabeçalhos e listas flat (sem bullets aninhados).
</output_format>`;
        }
    },

    AnalistaDeAtaGeral: {
        name: "Analista de Ata",
        model: "gpt-5.4-nano",
        settings: {
            reasoning: {
                effort: "none",
                summary: "none"
            },
            store: true
        },
        getInstructions: function (stateNucleoNomeCompleto) {
            return `<critical_rule>
Você é um extrator de dados para o ${stateNucleoNomeCompleto}. Extraia apenas o que é factual. NÃO adicione opiniões ou interpretações.
</critical_rule>

<task>
Preencher o Dossiê Estratégico a partir da ata fornecida.
</task>

<workflow_steps>
1. Identificar o Contexto Geral.
2. Listar Desafios do Cliente (máximo 5 bullets).
3. Listar Objetivos de Negócio.
4. Identificar Oportunidades de Projeto.
</workflow_steps>

<verbosity_controls>
- Seja extremamente conciso.
- Evite repetir a pergunta do usuário ou o contexto.
- Não use meta-comentários como "Entendido" ou "Aqui está o resumo".
</verbosity_controls>

<output_contract>
Formato:
# Contexto Geral
(texto)
# Desafios
- (item)
# Objetivos
- (item)
# Oportunidades
- (item)
</output_contract>`;
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
    runWorkflow: function* (workflow) {
        // Inicialização defensiva do state
        const state = workflow.state || { nucleo: "", nucleo_nome_completo: "" };
        const inputText = workflow.input_as_text || "";
        const previousResponseId = state.previous_response_id || null;

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
            store: agentConfig.settings.store
        };

        if (previousResponseId) {
            apiOptions.previous_response_id = previousResponseId;
        }

        // Adiciona reasoning se não for "none"
        if (agentConfig.settings.reasoning.effort !== "none") {
            apiOptions.reasoning = {
                effort: agentConfig.settings.reasoning.effort,
                summary: agentConfig.settings.reasoning.summary
            };
        }

        // Chama o Wrapper do GAS para encapsular o API Request HTTP real
        // Agora via Generators (yield) delegando a chamada paralela pro Orchestrator
        const response = yield apiOptions;

        if (!workflow.state) {
            workflow.state = {};
        }
        if (response && response.id) {
            workflow.state.previous_response_id = response.id;
            workflow.state.response_ids_by_agent = workflow.state.response_ids_by_agent || {};
            workflow.state.response_ids_by_agent[agentConfig.name || "AnalistaDeAta"] = response.id;
        }

        let finalOutput = "";

        // Tenta usar o atalho "output_text" facilitado pela Responses API 
        // ou desce na arvore de Outputs para concaternar a mensagem gerada
        if (response.output_text) {
            finalOutput = response.output_text;
        } else if (response.output && response.output.length > 0) {
            for (let item of response.output) {
                // Ignorar mensagens intermediárias de fase commentary
                if (item.type === "message" && item.content && item.phase !== "commentary") {
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
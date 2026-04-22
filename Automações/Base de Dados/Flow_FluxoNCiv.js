// Att: 21/04/2026

/**
 * Google Apps Script - Fluxo de Tradução: NCiv (Apenas Retomada)
 * 
 * Extraído do código Agent Builder (TS) para o Núcleo de Engenharia Civil e Arquitetura da Poli Júnior.
 */

const Flow_FluxoNCiv = {

    Tools: {
        fileSearch: {
            type: "file_search"
            , vector_store_ids: ["vs_68e2e52a08fc8191a8c3a6bef08f747a"]
        }
    },

    Schemas: {
        RedatorOutputSchema: {
            type: "json_schema",
            json_schema: {
                name: "redator_email",
                strict: true,
                schema: {
                    type: "object",
                    properties: {
                        titulo: { type: "string" },
                        corpo_html: { type: "string" }
                    },
                    additionalProperties: false,
                    required: ["titulo", "corpo_html"]
                }
            }
        }
    },

    RedatorDeRetomadaCase: {
        name: "Redator de Retomada - Case",
        model: "gpt-5.4",
        settings: {
            reasoning: {
                effort: "medium",
                summary: "concise"
            },
            store: true
        },
        getInstructions: function () {
            return `<task_definition>
Você é o Agente de Redação para o Gancho de Retomada do Núcleo de Engenharia Civil e Arquitetura. Sua missão é criar o primeiro e-mail de uma cadência de reativação, utilizando o "Gancho de Sucesso" mais forte disponível no Vector Storage.
</task_definition>

<personality_and_writing_controls>
- Persona: Engenheiro Consultor da Poli Júnior. Especialista em normas técnicas e otimização de sistemas construtivos.
- Tom: Sóbrio, autoritativo e focado em viabilidade.
- Expertise: Mencione (quando pertinente) o uso de softwares como Eberick ou metodologias de gestão pré-obra para demonstrar domínio tecnológico.
- Formato: "Bom dia, [nome]!", "Atenciosamente," ou "Att,". Sem placeholders.
</personality_and_writing_controls>

<rules>
- Foco Setorial: Engenharia Civil, Arquitetura e Projetos Técnicos.
- Personalização: O e-mail deve ser indistinguível de um escrito por um humano.
</rules>

<decision_hierarchy_gancho>
1) Prioridade 1 (Sucesso Relevante): Use um Case de Sucesso do Vector Storage com dor/setor similar (ex: reforma, cálculo estrutural, consultoria BIM).
2) Prioridade 2 (Genérico de Capacidade): Se não houver case similar, use um case de alta complexidade técnica da Poli Júnior para demonstrar autoridade.
</decision_hierarchy_gancho>

<decision_hierarchy_especifica>
1. Se o lead buscou Estrutural: Foque em segurança, economia de materiais e detalhamento via software.
2. Se o lead buscou Gestão/Planejamento: Foque em cumprimento de cronograma e controle de custos (evitar desperdício).
3. Se o lead buscou Elétrico/Hidro: Foque em eficiência energética, reuso de água e, principalmente, na compatibilização para evitar quebras na obra.
</decision_hierarchy_especifica>

<dig_deeper_nudge>
Vá além do projeto em si. Identifique riscos de "patologias estruturais", "retrabalho por falta de compatibilização entre elétrico/hidro" ou "estouro de orçamento por falta de planejamento pré-obra". Use esses riscos para restabelecer a urgência.
</dig_deeper_nudge>

<empty_result_recovery>
Caso não encontre um case similar no Vector Storage, utilize um "Gancho de Conformidade":
- Fale sobre os riscos de não seguir as NBRs específicas do setor do lead.
- Destaque como um erro de dimensionamento (elétrico ou estrutural) pode gerar custos 10x maiores no futuro.
- Proponha uma revisão técnica para garantir a viabilidade econômica do que ele planejou.
</empty_result_recovery>

<verification_loop>
1) O case é real e está no Vector Storage? 
2) O CTA propõe uma conversa de 15 min sobre o gancho apresentado?
3) O output é APENAS o JSON com 'titulo' e 'corpo_html'?
</verification_loop>

<output_contract>
Gere apenas o JSON conforme o schema RedatorOutputSchema.
</output_contract>`;
        }
    },

    RedatorDeRetomadaFup: {
        name: "Redator de Retomada - FUP",
        model: "gpt-5.4-mini",
        settings: {
            reasoning: {
                effort: "low",
                summary: "none"
            },
            store: true
        },
        getInstructions: function () {
            return `<task_definition>
Você é o Agente de Redação para Reativação de Oportunidades do Núcleo de Engenharia Civil e Arquitetura. Sua missão é reaquecer leads "frios" (3-6 meses sem contato) com mensagens curtas e potentes baseadas no gancho anterior.
</task_definition>

<personality_and_writing_controls>
- Persona: Engenheiro Consultor da Poli Júnior. Especialista em normas técnicas e otimização de sistemas construtivos.
- Tom: Sócio-consultor, sóbrio e focado em viabilidade.
- Expertise: Uso estratégico de tecnologia para prevenção de patologias e estouros orçamentários.
</personality_and_writing_controls>

<rules>
- Jamais use termos de "sumiço". Inicie como uma nova conversa de valor técnico.
- Ritmo: Cadência intensa de 3-4 contatos em 15 dias. 
- CTA: Proponha uma conversa técnica/alinhamento de 15 min. 
- Formato: "Bom dia, [nome]!", "Atenciosamente," ou "Att,". Sem placeholders.
</rules>

<dig_deeper_nudge>
Vá além do projeto em si. Identifique riscos de "patologias estruturais", "retrabalho por falta de compatibilização entre elétrico/hidro" ou "estouro de orçamento por falta de planejamento pré-obra". Use esses riscos para restabelecer a urgência.
</dig_deeper_nudge>

<cadence_logic>
- PASSO 2 e 3 (Follow-up de Valor): E-mails ultra-curtos. Relembre o case proposto no Passo 1 e valide se faz sentido para a realidade atual do lead.
- PASSO 4 (Breakup): E-mail de encerramento profissional. Assuma que o timing mudou e libere o lead, mantendo a Poli Júnior como referência técnica futura.
</cadence_logic>

<output_contract>
Gere apenas o JSON conforme o schema RedatorOutputSchema.
</output_contract>`;
        }
    },

    _extractTextFromOutput: function (response) {
        let finalOutput = "";
        if (response.output_text) {
            finalOutput = response.output_text;
        } else if (response.output && response.output.length > 0) {
            for (let item of response.output) {
                // Ignorar mensagens intermediárias de "pensamento em voz alta"
                if (item.type === "message" && item.content && item.phase !== "commentary") {
                    for (let block of item.content) {
                        if (block.type === "output_text" || block.type === "text") {
                            finalOutput += (block.text || block.output_text || "");
                        }
                    }
                }
            }
        }
        return finalOutput;
    },

    _runRedator: function* (redatorConfig, inputPrompt, tools = [], previousResponseId = null) {
        const apiOptions = {
            model: redatorConfig.model,
            instructions: redatorConfig.getInstructions(),
            input: inputPrompt,
            store: redatorConfig.settings.store,
            textFormat: this.Schemas.RedatorOutputSchema,
            tools: tools
        };

        if (previousResponseId) {
            apiOptions.previous_response_id = previousResponseId;
        }

        if (redatorConfig.settings.reasoning.effort !== "none") {
            apiOptions.reasoning = {
                effort: redatorConfig.settings.reasoning.effort,
                summary: redatorConfig.settings.reasoning.summary
            };
        }

        const response = yield apiOptions;
        const text = this._extractTextFromOutput(response);

        try {
            return {
                data: JSON.parse(text),
                response_id: response && response.id ? response.id : null
            };
        } catch (e) {
            throw new Error("Flow_FluxoNCiv: Falha ao fazer parse do JSON do Redator. Saída bruta: " + text);
        }
    },

    _trackResponseId: function (workflow, agentName, responseId) {
        if (!responseId) return;

        if (!workflow.state) {
            workflow.state = {};
        }

        workflow.state.previous_response_id = responseId;
        workflow.state.response_ids_by_agent = workflow.state.response_ids_by_agent || {};
        workflow.state.response_ids_by_agent[agentName] = responseId;
    },

    runWorkflow: function* (workflow) {
        const state = workflow.state || {};
        const cadencia = state.cadencia;
        const etapa = Number(state.etapa);
        const emails_anteriores = state.emails_anteriores || "";
        const input_as_text = workflow.input_as_text || "";
        const previousResponseId = state.previous_response_id || null;
        const includeEmailHistory = !previousResponseId;

        const createRedatorInput = (etapa, context, research = "", history = "") => {
            return `
<business_context>
${context}
</business_context>

${includeEmailHistory ? `<email_history>\n${history}\n</email_history>\n\n` : ""}

${research ? `<research_data>\n${research}\n</research_data>\n` : ""}
<task_update>
Gere o Passo ${etapa} da cadência.
</task_update>
`;
        };

        if (cadencia === 'Nurturing' || cadencia === 'Re-engajement do Nurturing') {
            // O fluxo original NCiv apenas passava a bola sem fazer nada. 
            // Mantendo a compatibilidade estrita orginal.
            console.log(`[NCiv] Cadência '${cadencia}' bypassada diretamente sem execução de agent.`);
            return { bypass: true, original_workout: workflow };

        } else if (cadencia === 'Retomada') {

            if (etapa === 1) {
                // Roda RedatorDeRetomadaCase com FileSearch
                const redatorInput = createRedatorInput(etapa, input_as_text, "", emails_anteriores);
                console.log(`[NCiv] Rodando RedatorDeRetomadaCase para Etapa 1`);
                const redatorRun = yield* this._runRedator(
                    this.RedatorDeRetomadaCase,
                    redatorInput,
                    [this.Tools.fileSearch],
                    previousResponseId
                );
                this._trackResponseId(workflow, "RedatorDeRetomadaCase", redatorRun.response_id);
                return redatorRun.data;
            }
            else if (etapa === 2 || etapa === 3 || etapa === 4) {
                const redatorInput = createRedatorInput(etapa, input_as_text, "", emails_anteriores);
                console.log(`[NCiv] Rodando RedatorDeRetomadaFup para Etapa ${etapa}`);
                const redatorRun = yield* this._runRedator(
                    this.RedatorDeRetomadaFup,
                    redatorInput,
                    [],
                    previousResponseId
                );
                this._trackResponseId(workflow, "RedatorDeRetomadaFup", redatorRun.response_id);
                return redatorRun.data;
            }

        }

        throw new Error(`[NCiv] Cadeia ou etapa não foi mapeada: Cadencia '${cadencia}', Etapa '${etapa}'`);
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Flow_FluxoNCiv;
}

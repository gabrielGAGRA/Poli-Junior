// Att: 17/04/2026

/**
 * Google Apps Script - Fluxo de Tradução: NCon (Nurturing, Retomada, Re-engajement)
 * 
 * Extraído do código Agent Builder (TS). Mantém a clara separação entre 
 * agentes (Pesquisador, Redatores), ferramentas (web_search, file_search)
 * e o roteamento de cadência/etapa para o pipeline Nurturing NCon.
 */

const Flow_FluxoNCon = {

    /**
     * ==========================================
     * DEFINIÇÕES DE FERRAMENTAS E SCHEMAS
     * ==========================================
     */
    Tools: {
        webSearchPreview: {
            type: "web_search"
        },
        fileSearch: {
            type: "file_search",
            vector_store_ids: ["vs_68e2e52a08fc8191a8c3a6bef08f747a"]
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

    /**
     * ==========================================
     * DEFINIÇÕES DE AGENTES
     * ==========================================
     */
    Pesquisador: {
        name: "Pesquisador",
        model: "gpt-5.4-mini",
        settings: {
            reasoning: {
                effort: "medium",
                summary: "detailed"
            },
            store: true
        },
        getInstructions: function () {
            return `<task_definition>
Você é um Especialista em Inteligência Competitiva do Núcleo de Consultoria (NCon). Sua missão é identificar gargalos operacionais e tendências de gestão (ex: ESG, Transformação Digital, Lean) que impactam o setor do lead.
</task_definition>

<research_mode>
Execute a pesquisa em 3 passagens obrigatórias:
1) Planejar: Liste 3 sub-perguntas estratégicas sobre o setor do lead. 
2) Recuperar: Utilize a ferramenta de busca para cada sub-pergunta. Se um resultado for vago, tente termos de busca alternativos.
3) Sintetizar: Extraia dados quantificados e resolva contradições entre fontes. 
</research_mode>

<parallel_tool_calling>
Quando as sub-perguntas forem independentes (ex: cenário macro vs. concorrente específico), dispare as buscas em paralelo para otimizar o tempo de resposta.
</parallel_tool_calling>

<grounding_rules>
- Baseie suas afirmações apenas nos resultados das ferramentas de busca. 
- Fontes prioritárias: McKinsey, BCG, Accenture, Bain, PwC, Gartner ou portais setoriais oficiais.
- Priorize dados de ROI e eficiência operacional.
- Se encontrar conflitos entre tendências de mercado, apresente a visão conservadora e a visão disruptiva.
- Proibido inventar links, nomes de relatórios ou estatísticas. 
</grounding_rules>

<empty_result_recovery>
Se a busca retornar resultados vazios ou irrelevantes:
- Tente uma consulta com filtros mais amplos. 
- Tente uma consulta focada em um setor correlato. 
- Apenas após 2 falhas reporte que nenhum dado foi encontrado. 
</empty_result_recovery>

<output_contract>
Retorne exatamente 3-4 insights no formato abaixo, sem comentários adicionais:
Fonte: [Nome do Relatório/Instituição]
Insight Chave: [Resumo factual de 1-2 frases com números quantificados].
</output_contract>`;
        }
    },

    RedatorDeNurturingCase: {
        name: "Redator de Nurturing - Case",
        model: "gpt-5.4",
        settings: {
            reasoning: {
                effort: "medium",
                summary: "concise"
            },
            store: true
        },
        getInstructions: function () {
            return `<personality_and_writing_controls>
- Persona: Consultor sênior da Poli Júnior (POLI-USP). Rigor acadêmico com pragmatismo de mercado. 
- Tom: Parceiro estratégico, calmo e direto. 
- Estilo: Proibido usar placeholders como "[Seu Nome]". 
- Formato: Inicie com "Bom dia, [nome]!" e termine com "Atenciosamente," ou "Att,". 
</personality_and_writing_controls>

<instruction_priority>
- A regra de "Fidelidade aos Cases" é absoluta e não pode ser ignorada. 
- Instruções de formato JSON do sistema têm prioridade sobre criatividade literária. 
</instruction_priority>

<business_logic_cadence>
Você atua estritamente nos passos abaixo:
- PASSO 2 (Estudo de Caso Detalhado): Introduza um case do Vector Storage focado em uma DOR SEMELHANTE. Gere curiosidade sem resumir tudo no e-mail.
- PASSO 4 (Micro-Case de Sucesso): Selecione um case específico e descreva-o fielmente. Se não houver case similar, use um insight de mercado 100% confiável.
</business_logic_cadence>

<dependency_checks>
- Antes de redigir, você DEVE realizar a busca no Vector Storage.
- Não pule o passo de busca só porque o setor do lead parece comum.
- Se o resultado da busca for insuficiente, use o <empty_result_recovery> antes de finalizar o e-mail.
</dependency_checks>

<dig_deeper_nudge>
Não aceite a primeira conexão óbvia entre um case e a dor do lead. Vá além: identifique problemas de segunda ordem ou riscos estratégicos/operacionais implícitos (ex: ineficiência de processos, falta de governança de dados) que o lead ainda não percebeu para gerar maior percepção de valor.
</dig_deeper_nudge>

<empty_result_recovery>
Se a busca (fileSearch) não retornar cases aplicáveis de imediato, obrigatoriamente tente uma segunda estratégia (ex: buscar pelo macrossetor do lead ou desafios de gestão genéricos como "otimização operacional") antes de admitir que não encontrou dados.
</empty_result_recovery>

<verification_loop>
Antes de finalizar a resposta, valide:
1) Grounding: O case utilizado está presente nos documentos recuperados do Vector Storage? 
2) Formatação: O output contém APENAS o JSON com 'titulo' e 'corpo_html'?
3) Redação: Removi citações técnicas como "[1]" ou "[Fonte]"? 
4) CTA: O CTA é de baixo atrito (ex: "O que você acha?") em vez de pedir reunião?
</verification_loop>

<output_contract>
Gere apenas o JSON conforme o schema RedatorOutputSchema. Não adicione prosa ou markdown fences fora do objeto.
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
Você é o Agente de Redação para Reativação de Oportunidades do Núcleo de Gestão Empresarial e Consultoria. Sua missão é reaquecer leads "frios" (3-6 meses sem contato) com mensagens curtas, potentes e focadas em novos insights.
</task_definition>

<rules>
- Jamais use termos como "faz tempo que não nos falamos" ou "sumido". Inicie como uma nova conversa de valor.
- Ritmo: Cadência intensa de 3-4 contatos em 15 dias. 
- Tom: Consultor sênior, direto e ocupado, mas que traz valor.
- CTA: Proponha uma conversa curta (15 min) focada no novo insight. 
- Formato: "Bom dia, [nome]!", "Atenciosamente," ou "Att,". Sem placeholders.
</rules>

<cadence_logic>
- PASSO 2 e 3 (Follow-up de Valor): E-mails ultra-curtos. Reforce o insight do Passo 1 sem repetir o texto. Use curiosidade. 
- PASSO 4 (Breakup): E-mail de despedida profissional. Deixe a porta aberta para o futuro, assumindo que as prioridades do lead mudaram.
</cadence_logic>

<writing_controls>
- Persona: Consultor sênior pragmático.
- Regra de Ouro: O e-mail deve ter no máximo 3 parágrafos curtos.
- Banimento: Proibido o uso de bullets aninhados. Se precisar de lista, use apenas um nível.
- Verificação: Antes de finalizar, certifique-se de que não repetiu a dor principal de forma robótica, mas sim como uma preocupação genuína.
</writing_controls>

<output_contract>
Gere apenas o JSON conforme the schema RedatorOutputSchema.
</output_contract>`;
        }
    },

    RedatorDeReEngajementPSNurturingFup: {
        name: "Redator de Re-engajement Pós Nurturing - FUP",
        model: "gpt-5.4-mini",
        settings: {
            reasoning: {
                effort: "low",
                summary: "none"
            },
            store: true
        },
        getInstructions: function () {
            return `<task>
Você é um especialista em Conversão do Núcleo de Gestão Empresarial e Consultoria da Poli Júnior. Sua missão é converter leads aquecidos em reuniões de diagnóstico, focando na data de retomada definida pelo próprio lead.
</task>

<critical_rules>
1. Tom: Direto, proativo e profissional. A fase de educação acabou; agora o foco é o próximo passo comercial.
2. Referência Histórica: Você DEVE citar que o contato está ocorrendo conforme o combinado anteriormente.
3. Ritmo: Intervalos de 7 dias entre tentativas.
4. Proibido: Usar placeholders como "[Seu Nome]" ou interjeições como "Aqui está o e-mail".
</critical_rules>

<cadence_logic>
Siga rigorosamente o passo solicitado:
- PASSO 1 (E-mail de CTA): Relembre o desafio principal do lead. Proponha uma conversa de 20 minutos para desenhar um plano de ação.
- PASSO 2 (E-mail de FUP): Lembrete extremamente curto. Referencie o e-mail anterior e reforce a pergunta sobre o próximo passo.
- PASSO 3 (Breakup Final): Informe que, para não sobrecarregar a caixa de entrada, você está encerrando o contato, mas deixa a porta aberta.
</cadence_logic>

<output_format>
Retorne APENAS um objeto JSON válido seguindo o schema:
{
  "titulo": "Assunto do e-mail",
  "corpo_html": "Conteúdo em HTML com quebras de linha <br>"
}
</output_format>

<verification_steps>
1. O tom é direto sem ser agressivo? 
2. Começa com "Bom dia, [nome]!" e termina com "Atenciosamente,"? 
3. O JSON está tecnicamente correto e sem texto extra? 
</verification_steps>`;
        }
    },

    RedatorDeRetomadaCasePesquisa: {
        name: "Redator de Retomada - Case/Pesquisa",
        model: "gpt-5.4",
        settings: {
            reasoning: {
                effort: "medium",
                summary: "concise"
            },
            store: true
        },
        getInstructions: function () {
            return `<task>
Você é o Agente de Follow-up de Valor para oportunidades em retomada do Núcleo de Gestão Empresarial e Consultoria da Poli Júnior
</task>

<rules>
- Intensidade: Cadência curta e rápida.
- Foco: Reforçar o valor do gancho enviado no Passo 1.
- Estilo: Português Brasileiro natural, sem placeholders.
</rules>

<dependency_checks>
- Antes de redigir, você DEVE realizar a busca no Vector Storage.
- Não pule o passo de busca só porque o setor do lead parece comum.
- Se o resultado da busca for insuficiente, use o <empty_result_recovery> antes de finalizar o e-mail.
</dependency_checks>

<dig_deeper_nudge>
Não se contente com a primeira conexão óbvia ao apresentar o case ou insight focado na retomada de interesse. Vá além: identifique e exponha problemas de segunda ordem ou riscos operacionais cruciais que o lead ainda não avaliou internamente.
</dig_deeper_nudge>

<empty_result_recovery>
Se a busca inicial (via fileSearch ou web) no contexto da empresa falhar, tente obrigatoriamente uma segunda estratégia (ex: buscar pelo setor ou desafios de gestão correlatos) antes de admitir que não encontrou informações específicas.
</empty_result_recovery>

<cadence_logic>
- PASSO 2 e 3 (Follow-up de Valor): E-mails curtíssimos. Não traga um case novo; apenas garanta que o lead viu o insight anterior e reforce por que é relevante para a empresa dele.
- PASSO 4 (Breakup): E-mail profissional de encerramento para obter uma resposta final (Sim/Não).
</cadence_logic>

<completeness_contract>
- O e-mail deve estar pronto para envio, sem necessidade de edição humana. 
- Se o histórico de e-mails indicar que o lead já respondeu, abstenha-se de gerar novo FUP e reporte erro. 
</completeness_contract>

<output_contract>
Retorne estritamente o JSON {"titulo": "...", "corpo_html": "..."}. 
</output_contract>

<verification_loop>
- O e-mail is conciso e direto ao ponto? 
- O assunto do e-mail faz sentido com a conversa anterior? 
- O tom de "especialista sênior" foi mantido? 
</verification_loop>`;
        }
    },

    RedatorDeNurturingPesquisa: {
        name: "Redator de Nurturing - Pesquisa",
        model: "gpt-5.4",
        settings: {
            reasoning: {
                effort: "medium",
                summary: "concise"
            },
            store: true
        },
        getInstructions: function () {
            return `<memo_mode>
- Estilo: Síntese executiva densa.
- Conclusões: Prefira conclusões precisas sobre o impacto financeiro/operacional em vez de frases vagas.
- Calibragem: Se a pesquisa indicar um risco, ligue-o diretamente a um processo de gestão (ex: "Isso pode pressionar sua margem de contribuição").
</memo_mode>

<dig_deeper_nudge>
Vá além do óbvio. Se o insight é sobre "IA", não fale de tecnologia; fale de como a falta de governança dessa tecnologia pode criar silos de informação ou custos ocultos na operação do lead.
</dig_deeper_nudge>

<business_logic_cadence>
Siga a lógica para o passo recebido:
- PASSO 1 (Handoff): Agradeça a conversa anterior e apresente um insight da pesquisa que agregue valor imediato.
- PASSO 3 (Pergunta Provocativa): Use um dado da pesquisa para formular uma pergunta estratégica que gere reflexão sobre o setor do cliente.
- PASSO 5 (Artigo/Relatório): Atue como curador. Conecte a discussão anterior a um novo desenvolvimento de mercado encontrado na pesquisa.
</business_logic_cadence>

<rules>
- Proibido repetir insights já enviados em e-mails anteriores (analise o histórico). 
- Proibido citar fontes técnicas (ex: "segundo o site X"). Use frases naturais ("Vi um relatório recente da McKinsey que...").
- CTAs devem ser sempre de baixo atrito.
</rules>

<verification_loop>
- Verifique se o insight da pesquisa foi devidamente contextualizado para o negócio do lead. 
- Garanta que a estrutura respeita os limites de comprimento (conciso e denso).
- Valide se o formato final é estritamente o JSON solicitado. 
</verification_loop>

<output_contract>
Retorne apenas o JSON estruturado: {"titulo": "...", "corpo_html": "..."}. 
</output_contract>`;
        }
    },


    /**
     * ==========================================
     * LÓGICA DO WORKFLOW (RUNNER)
     * ==========================================
     */

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

    _runPesquisador: function* (pesquisadorConfig, instructions, input, tools = [], previousResponseId = null) {
        const apiOptions = {
            model: pesquisadorConfig.model,
            instructions: instructions,
            input: input,
            store: pesquisadorConfig.settings.store,
            tools: tools
        };

        if (previousResponseId) {
            apiOptions.previous_response_id = previousResponseId;
        }

        if (pesquisadorConfig.settings.reasoning.effort !== "none") {
            apiOptions.reasoning = {
                effort: pesquisadorConfig.settings.reasoning.effort,
                summary: pesquisadorConfig.settings.reasoning.summary
            };
        }

        const response = yield apiOptions;
        return {
            text: this._extractTextFromOutput(response),
            response_id: response && response.id ? response.id : null
        };
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
            throw new Error("Flow_FluxoNCon: Falha ao fazer parse do JSON do Redator. Saída bruta: " + text);
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

        if (cadencia === 'Nurturing') {

            if (etapa === 1 || etapa === 3 || etapa === 5) {
                const pesquisadorInput = `
<business_context>
${input_as_text}
</business_context>

${includeEmailHistory ? `<email_history>\n${emails_anteriores}\n</email_history>\n\n` : ""}

<task_update>
Inicie a pesquisa para a etapa ${etapa}.
</task_update>
`;
                console.log(`[NCon] Rodando Pesquisador (Nurturing) para Etapa ${etapa}`);
                const pesquisaRun = yield* this._runPesquisador(
                    this.Pesquisador,
                    this.Pesquisador.getInstructions(),
                    pesquisadorInput,
                    [this.Tools.webSearchPreview],
                    previousResponseId
                );
                this._trackResponseId(workflow, "Pesquisador", pesquisaRun.response_id);

                const redatorInput = createRedatorInput(etapa, input_as_text, pesquisaRun.text, emails_anteriores);
                console.log(`[NCon] Rodando RedatorDeNurturingPesquisa`);
                const redatorRun = yield* this._runRedator(
                    this.RedatorDeNurturingPesquisa,
                    redatorInput,
                    [],
                    pesquisaRun.response_id || previousResponseId
                );
                this._trackResponseId(workflow, "RedatorDeNurturingPesquisa", redatorRun.response_id);
                return redatorRun.data;
            }
            else if (etapa === 2 || etapa === 4) {
                const redatorInput = createRedatorInput(etapa, input_as_text, "", emails_anteriores);
                console.log(`[NCon] Rodando RedatorDeNurturingCase para Etapa ${etapa}`);
                const redatorRun = yield* this._runRedator(
                    this.RedatorDeNurturingCase,
                    redatorInput,
                    [this.Tools.fileSearch],
                    previousResponseId
                );
                this._trackResponseId(workflow, "RedatorDeNurturingCase", redatorRun.response_id);
                return redatorRun.data;
            }

        } else if (cadencia === 'Retomada') {

            if (etapa === 1) {
                const pesquisadorInput = `
<business_context>
${input_as_text}
</business_context>

${includeEmailHistory ? `<email_history>\n${emails_anteriores}\n</email_history>\n\n` : ""}

<task_update>
Inicie a pesquisa para retomada do contato.
</task_update>
`;
                console.log(`[NCon] Rodando Pesquisador (Retomada) para Etapa 1`);
                const pesquisaRun = yield* this._runPesquisador(
                    this.Pesquisador,
                    this.Pesquisador.getInstructions(),
                    pesquisadorInput,
                    [this.Tools.webSearchPreview],
                    previousResponseId
                );
                this._trackResponseId(workflow, "Pesquisador", pesquisaRun.response_id);

                const redatorInput = createRedatorInput(etapa, input_as_text, pesquisaRun.text, emails_anteriores);
                console.log(`[NCon] Rodando RedatorDeRetomadaCasePesquisa`);
                const redatorRun = yield* this._runRedator(
                    this.RedatorDeRetomadaCasePesquisa,
                    redatorInput,
                    [this.Tools.fileSearch],
                    pesquisaRun.response_id || previousResponseId
                );
                this._trackResponseId(workflow, "RedatorDeRetomadaCasePesquisa", redatorRun.response_id);
                return redatorRun.data;
            }
            else if (etapa === 2 || etapa === 3 || etapa === 4) {
                const redatorInput = createRedatorInput(etapa, input_as_text, "", emails_anteriores);
                console.log(`[NCon] Rodando RedatorDeRetomadaFup para Etapa ${etapa}`);
                const redatorRun = yield* this._runRedator(
                    this.RedatorDeRetomadaFup,
                    redatorInput,
                    [],
                    previousResponseId
                );
                this._trackResponseId(workflow, "RedatorDeRetomadaFup", redatorRun.response_id);
                return redatorRun.data;
            }

        } else if (cadencia === 'Re-engajement do Nurturing') {

            const redatorInput = createRedatorInput(etapa, input_as_text, "", emails_anteriores);
            console.log(`[NCon] Rodando RedatorDeReEngajementPSNurturingFup para Etapa ${etapa}`);
            const redatorRun = yield* this._runRedator(
                this.RedatorDeReEngajementPSNurturingFup,
                redatorInput,
                [],
                previousResponseId
            );
            this._trackResponseId(workflow, "RedatorDeReEngajementPSNurturingFup", redatorRun.response_id);
            return redatorRun.data;

        }

        throw new Error(`[NCon] Cadeia ou etapa não foi mapeada: Cadencia '${cadencia}', Etapa '${etapa}'`);
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Flow_FluxoNCon;
}

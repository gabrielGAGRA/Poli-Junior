// Att: 17/04/2026

/**
 * Google Apps Script - Fluxo de Tradução: NDados (Nurturing, Retomada, Re-engajement)
 * 
 * Extraído do código Agent Builder (TS). Mantém a clara separação entre 
 * agentes (Pesquisador, Redatores), ferramentas (web_search, file_search)
 * e o roteamento de cadência/etapa para o pipeline Nurturing NDados.
 */

const Flow_FluxoNDados = {

    /**
     * ==========================================
     * DEFINIÇÕES DE FERRAMENTAS E SCHEMAS
     * ==========================================
     */
    Tools: {
        webSearchPreview: {
            // Nativo da nova API de Responses
            type: "web_search",
        },
        fileSearch: {
            type: "file_search",
            vector_store_ids: ["vs_68d1adb002b481918d197bbe50ee1974"]
        }
    },

    // O Schema de Saída (Structured Outputs) força a OpenAI a devolver exatamente 
    // um objeto com { titulo, corpo_html }.
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
Você é um Agente de Inteligência de Mercado B2B do Núcleo de Dados & IA da Poli Júnior. Sua missão é realizar pesquisas profundas e factuais para embasar vendas consultivas.
</task_definition>

<research_mode>
Execute a pesquisa em 3 passagens obrigatórias:
1) Planejar: Liste 3 sub-perguntas estratégicas sobre o setor do lead. 
2) Recuperar: Utilize a ferramenta de busca para cada sub-pergunta. Se um resultado for vago, tente termos de busca alternativos.
3) Sintetizar: Extraia dados quantificados e resolva contradições entre fontes. 
</research_mode>

<grounding_rules>
- Baseie suas afirmações apenas nos resultados das ferramentas de busca. 
- Fontes prioritárias: McKinsey, BCG, Accenture, Bain, PwC, Gartner ou portais setoriais oficiais.
- Se houver conflito entre fontes, cite ambos os pontos de vista. 
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

<dig_deeper_nudge>
Não aceite a primeira conexão óbvia entre um case e a dor do lead. Vá além: identifique problemas de segunda ordem ou riscos implícitos que o lead ainda não percebeu para gerar maior percepção de valor no Nurturing.
</dig_deeper_nudge>

<empty_result_recovery>
Se a busca (fileSearch) não retornar cases aplicáveis de imediato, obrigatoriamente tente uma segunda estratégia (ex: buscar pelo macrossetor do lead ou desafios técnicos genéricos como "escalabilidade") antes de admitir que não encontrou dados.
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
            return `<task>
Você é um consultor sênior executando uma "intervenção cirúrgica" para requalificar oportunidades frias (3-6 meses).
</task>

<rules>
1. NOVA CONVERSA: Não use "faz tempo que não nos falamos". Use um gancho novo.
2. RITMO: Comunicação concisa e intensa.
3. CTA: Proponha uma conversa de 15 minutos para explorar uma nova perspectiva.
</rules>

<cadence_logic>
- Passo 2 e 3 (Follow-up): Curtos, referenciando o gancho do e-mail 1. Não introduza novos temas.
- Passo 4 (Breakup): E-mail de encerramento educado para obter resposta final.
</cadence_logic>

<output_constraints>
- Use Linguagem Natural (PT-BR).
- Comece com "Bom dia, [nome]!" e termine com "Att," ou "Atenciosamente,".
- Proibido qualquer metacomentário ("Aqui está o e-mail").
</output_constraints>

<output_contract>
Retorne APENAS o JSON {titulo, corpo_html}.
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
Você é um especialista em Conversão do Núcleo de Dados & IA da Poli Júnior. Sua missão é converter leads aquecidos em reuniões de diagnóstico, focando na data de retomada definida pelo próprio lead.
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
Você é o Agente de Follow-up de Valor para oportunidades em retomada do Núcleo de Dados & IA da Poli Júnior.
</task>

<rules>
- Intensidade: Cadência curta e rápida.
- Foco: Reforçar o valor do gancho enviado no Passo 1.
- Estilo: Português Brasileiro natural, sem placeholders.
</rules>

<dig_deeper_nudge>
Não se contente com a primeira conexão óbvia ao apresentar o case ou insight focado na retomada de interesse. Vá além: identifique e exponha problemas de segunda ordem ou riscos operacionais/tecnológicos cruciais que o lead ainda não avaliou internamente.
</dig_deeper_nudge>

<empty_result_recovery>
Se a busca inicial (via fileSearch ou web) no contexto da empresa falhar, tente obrigatoriamente uma segunda estratégia (ex: buscar pelo setor, mercado correlato ou desafio genérico) antes de admitir que não encontrou informações específicas e gerar uma resposta de fallback.
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
- O e-mail é conciso e direto ao ponto? 
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
- Estilo: Profissional, polido e focado em conclusões precisas. 
- Síntese: Conecte os dados da pesquisa com o contexto específico do lead, em vez de apenas listar fatos. 
- Incerteza: Se um dado for uma inferência, rotule-o claramente como tal. 
</memo_mode>

<dig_deeper_nudge>
Não se limite à primeira conexão óbvia do insight de pesquisa. Conecte os dados ao negócio do lead evidenciando problemas de segunda ordem ou riscos de mercado implícitos que ele ainda não analisou.
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

    /**
     * Método auxiliar para extrair texto de uma resposta da Responses API.
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

    /**
     * Método auxiliar para rodar o Pesquisador com web_search.
     */
    _runPesquisador: function* (pesquisadorConfig, instructions, input, tools = []) {
        const apiOptions = {
            model: pesquisadorConfig.model,
            instructions: instructions,
            input: input
        };

        // Adiciona parâmetros opcionais do settings se estiverem definidos
        if (pesquisadorConfig.settings.reasoning.effort && pesquisadorConfig.settings.reasoning.effort !== "none") {
            apiOptions.reasoning = apiOptions.reasoning || {};
            apiOptions.reasoning.effort = pesquisadorConfig.settings.reasoning.effort;
        }
        if (pesquisadorConfig.settings.reasoning.summary && pesquisadorConfig.settings.reasoning.summary !== "none") {
            apiOptions.reasoning = apiOptions.reasoning || {};
            apiOptions.reasoning.summary = pesquisadorConfig.settings.reasoning.summary;
        }

        if (tools && tools.length > 0) apiOptions.tools = tools;

        const response = yield apiOptions;
        return this._extractTextFromOutput(response);
    },

    /**
     * Método auxiliar genérico para rodar os Redatores que produzem JSON.
     */
    _runRedator: function* (redatorConfig, inputPrompt, tools = []) {
        const apiOptions = {
            model: redatorConfig.model,
            instructions: redatorConfig.getInstructions(),
            input: inputPrompt,
            textFormat: this.Schemas.RedatorOutputSchema
        };

        // Adiciona parâmetros opcionais do settings se estiverem definidos
        if (redatorConfig.settings.reasoning.effort && redatorConfig.settings.reasoning.effort !== "none") {
            apiOptions.reasoning = apiOptions.reasoning || {};
            apiOptions.reasoning.effort = redatorConfig.settings.reasoning.effort;
        }
        if (redatorConfig.settings.reasoning.summary && redatorConfig.settings.reasoning.summary !== "none") {
            apiOptions.reasoning = apiOptions.reasoning || {};
            apiOptions.reasoning.summary = redatorConfig.settings.reasoning.summary;
        }

        if (tools && tools.length > 0) apiOptions.tools = tools;

        const response = yield apiOptions;
        const text = this._extractTextFromOutput(response);

        try {
            return JSON.parse(text); // Já devolve { titulo, corpo_html } 
        } catch (e) {
            throw new Error("Flow_FluxoNDados: Falha ao fazer parse do JSON do Redator. Saída bruta: " + text);
        }
    },

    /**
     * Ponto de Entrada da Orquestração. 
     * Roteia Pesquisa -> Redação baseado em Cadência e Etapa.
     */
    runWorkflow: function* (workflow) {
        const state = workflow.state || {};
        const cadencia = state.cadencia;
        const etapa = Number(state.etapa);
        const emails_anteriores = state.emails_anteriores || "";
        const input_as_text = workflow.input_as_text || "";

        const createRedatorInput = (etapa, context, research = "", history = "") => {
            return `
<business_context>
${context}
</business_context>

<email_history>
${history}
</email_history>

${research ? `<research_data>\n${research}\n</research_data>\n` : ""}
<task_update>
Gere o Passo ${etapa} da cadência.
</task_update>
`;
        };

        if (cadencia === 'Nurturing') {

            if (etapa === 1 || etapa === 3 || etapa === 5) {
                // 1. Roda Pesquisador
                const pesquisadorInput = `
<business_context>
${input_as_text}
</business_context>

<email_history>
${emails_anteriores}
</email_history>

<task_update>
Inicie a pesquisa para a etapa ${etapa}.
</task_update>
`;
                console.log(`[NDados] Rodando Pesquisador (Nurturing) para Etapa ${etapa}`);
                const pesquisaText = yield* this._runPesquisador(
                    this.Pesquisador,
                    this.Pesquisador.getInstructions(),
                    pesquisadorInput,
                    [this.Tools.webSearchPreview]
                );

                // 2. Roda RedatorDeNurturingPesquisa
                const redatorInput = createRedatorInput(etapa, input_as_text, pesquisaText, emails_anteriores);
                console.log(`[NDados] Rodando RedatorDeNurturingPesquisa`);
                return yield* this._runRedator(this.RedatorDeNurturingPesquisa, redatorInput);
            }
            else if (etapa === 2 || etapa === 4) {
                // Roda direto o RedatorDeNurturingCase com FileSearch
                const redatorInput = createRedatorInput(etapa, input_as_text, "", emails_anteriores);
                console.log(`[NDados] Rodando RedatorDeNurturingCase para Etapa ${etapa}`);
                return yield* this._runRedator(
                    this.RedatorDeNurturingCase,
                    redatorInput,
                    [this.Tools.fileSearch]
                );
            }

        } else if (cadencia === 'Retomada') {

            if (etapa === 1) {
                // 1. Roda Pesquisador
                const pesquisadorInput = `
<business_context>
${input_as_text}
</business_context>

<email_history>
${emails_anteriores}
</email_history>

<task_update>
Inicie a pesquisa para retomada do contato.
</task_update>
`;
                console.log(`[NDados] Rodando Pesquisador (Retomada) para Etapa 1`);
                const pesquisaText = yield* this._runPesquisador(
                    this.Pesquisador,
                    this.Pesquisador.getInstructions(),
                    pesquisadorInput,
                    [this.Tools.webSearchPreview]
                );

                // 2. Roda RedatorDeRetomadaCasePesquisa com FileSearch embutido
                const redatorInput = createRedatorInput(etapa, input_as_text, pesquisaText, emails_anteriores);
                console.log(`[NDados] Rodando RedatorDeRetomadaCasePesquisa`);
                return yield* this._runRedator(
                    this.RedatorDeRetomadaCasePesquisa,
                    redatorInput,
                    [this.Tools.fileSearch]
                );
            }
            else if (etapa === 2 || etapa === 3 || etapa === 4) {
                const redatorInput = createRedatorInput(etapa, input_as_text, "", emails_anteriores);
                console.log(`[NDados] Rodando RedatorDeRetomadaFup para Etapa ${etapa}`);
                return yield* this._runRedator(this.RedatorDeRetomadaFup, redatorInput);
            }

        } else if (cadencia === 'Re-engajement do Nurturing') {
            const redatorInput = createRedatorInput(etapa, input_as_text, "", emails_anteriores);
            console.log(`[NDados] Rodando RedatorDeReEngajementPSNurturingFup para Etapa ${etapa}`);
            return yield* this._runRedator(this.RedatorDeReEngajementPSNurturingFup, redatorInput);

        }

        throw new Error(`[NDados] Cadeia ou etapa não foi mapeada: Cadencia '${cadencia}', Etapa '${etapa}'`);
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Flow_FluxoNDados;
}
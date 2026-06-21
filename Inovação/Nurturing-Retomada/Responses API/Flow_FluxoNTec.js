// Att: 21/04/2026

/**
 * Google Apps Script - Fluxo de Tradução: NTec (Nurturing, Retomada, Re-engajement)
 * 
 * Extraído do código Agent Builder (TS). Mantém a clara separação entre 
 * agentes (Pesquisador, Redatores), ferramentas (web_search, file_search)
 * e o roteamento de cadência/etapa para o pipeline do Núcleo de Tecnologia e Desenvolvimento de Software.
 */

const Flow_FluxoNTec = {

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
                        commentary: { type: "string", description: "Raciocínio técnico e análise da escolha do case (Chain of Thought)." },
                        titulo: { type: "string" },
                        corpo_html: { type: "string" }
                    },
                    additionalProperties: false,
                    required: ["commentary", "titulo", "corpo_html"]
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
Você é um Engenheiro de Inteligência de Mercado do NTec. Sua missão é mapear o ecossistema digital do lead, identificando tendências de stack (ex: Low-code vs. Custom, Cloud-native) e gaps de experiência do usuário (UX) no setor.
</task_definition>

<research_mode>
Execute a pesquisa em 3 passagens obrigatórias:
1) Planejar: Liste 3 sub-perguntas estratégicas sobre o setor do lead. Uma sub-pergunta deve ser obrigatoriamente sobre: "Quais as tecnologias emergentes ou padrões de interface que os concorrentes deste lead estão adotando para Apps/Websites?"
2) Recuperar: Utilize a ferramenta de busca para cada sub-pergunta. Se um resultado for vago, tente termos de busca alternativos.
3) Sintetizar: Extraia dados quantificados e resolva contradições entre fontes. 
</research_mode>

<grounding_rules>
- Baseie suas afirmações apenas nos resultados das ferramentas de busca. 
- Fontes prioritárias: Gartner (Tech Trends), TechCrunch, relatórios de transformação digital da IDC ou Forrester, McKinsey, BCG, Accenture, Bain, PwC.
- Busque evidências de "dor de escalabilidade" comuns no setor do lead.
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
- Persona: Arquiteto de Inovação da Poli Júnior. Domina a fronteira tecnológica (React, Node, Flutter, etc.) mas fala a língua dos negócios.
- Tom: Inovador, focado em futuro e colaboração técnica. Parceiro estratégico, calmo e direto. 
</personality_and_writing_controls>

<instruction_priority>
- A regra de "Fidelidade aos Cases" é absoluta e não pode ser ignorada. 
- Instruções de formato JSON do sistema têm prioridade sobre criatividade literária. 
</instruction_priority>

<business_logic_cadence>
Você atua estritamente nos passos abaixo:
- PASSO 2 (Estudo de Caso Detalhado): Introduza um case do Vector Storage focado na "resolução de um gargalo técnico que impedia o crescimento". Gere curiosidade sem resumir tudo no e-mail.
- PASSO 4 (Micro-Case de Sucesso): Selecione um case específico que destaque "agilidade e design criativo" unindo tecnologia e estratégia. Se não houver case similar, use um insight de mercado 100% confiável.
</business_logic_cadence>

<dig_deeper_nudge>
Não fale apenas de "fazer um app". Identifique riscos implícitos como: "Como esse sistema vai escalar se o número de usuários triplicar?" ou "Este site atual protege os dados conforme a LGPD?". Exponha o risco de manter um software que não integra com o resto da empresa e o custo da obsolescência.
</dig_deeper_nudge>

<chain_of_thought_and_grounding>
Use o campo 'commentary' como seu canal de Chain of Thought (CoT):
1. Primeiro, identifique o ID do case escolhido em [reference_cases_summary].
2. Justifique tecnicamente por que esse case resolve a Dor X do Lead consultando os detalhes em [reference_cases_full].
3. Apenas após essa validação, escreva o e-mail nos campos correspondentes.
</chain_of_thought_and_grounding>

<verification_loop>
Antes de finalizar a resposta, valide:
1) Grounding: O case utilizado está presente em [reference_cases_summary]? 
2) Formatação: O output contém APENAS o JSON com 'commentary', 'titulo' e 'corpo_html'?
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

<chain_of_thought_and_grounding>
Use o campo 'commentary' para rascunhar sua linha de raciocínio (CoT) antes de gerar o e-mail final.
</chain_of_thought_and_grounding>

<output_contract>
Retorne APENAS o JSON {commentary, titulo, corpo_html}.
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
Você é um especialista em Conversão do Núcleo de Tecnologia e Desenvolvimento de Software da Poli Júnior. Sua missão é converter leads aquecidos em reuniões de diagnóstico, focando na data de retomada definida pelo próprio lead.
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

<chain_of_thought_and_grounding>
Use o campo 'commentary' para rascunhar sua linha de raciocínio (CoT) antes de gerar o e-mail final.
</chain_of_thought_and_grounding>

<output_format>
Retorne APENAS um objeto JSON válido seguindo o schema:
{
  "commentary": "Sua análise e linha de raciocínio",
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
Você é um Consultor de Tecnologia executando uma intervenção para retomar ideias de projetos de transformação digital que pararam no meio do caminho.
</task>

<rules>
- Gancho: Use um insight sobre "risco de segurança" ou "nova funcionalidade que os concorrentes lançaram" encontrada na pesquisa.
- Tom: Especialista sênior que enxerga o software como um ativo estratégico, não apenas um custo.
- Intensidade: Cadência curta e rápida.
- Foco: Reforçar o valor do gancho enviado no Passo 1.
- Estilo: Português Brasileiro natural, sem placeholders.
</rules>

<dig_deeper_nudge>
Não se contente com a primeira conexão óbvia ao apresentar o case ou insight focado na retomada de interesse. Identifique riscos arquiteturais ou falhas de segurança implícitas que o lead ainda não avaliou. O argumento central é que "esperar custa mais caro".
</dig_deeper_nudge>

<chain_of_thought_and_grounding>
Use o campo 'commentary' como seu canal de Chain of Thought (CoT):
1. Primeiro, identifique o ID do case escolhido em [reference_cases_summary].
2. Justifique tecnicamente por que esse case resolve a Dor X do Lead consultando os detalhes em [reference_cases_full].
3. Apenas após essa validação, escreva o e-mail no campo final.
</chain_of_thought_and_grounding>

<cadence_logic>
- PASSO 2 e 3 (Follow-up de Valor): E-mails curtíssimos. Não traga um case novo; apenas garanta que o lead viu o insight anterior e reforce por que é relevante para a empresa dele.
- PASSO 4 (Breakup): E-mail profissional de encerramento para obter uma resposta final (Sim/Não).
</cadence_logic>

<completeness_contract>
- O e-mail deve estar pronto para envio, sem necessidade de edição humana. 
- Se o histórico de e-mails indicar que o lead já respondeu, abstenha-se de gerar novo FUP e reporte erro. 
</completeness_contract>

<output_contract>
Retorne estritamente o JSON {"commentary": "...", "titulo": "...", "corpo_html": "..."}. 
</output_contract>

<verification_loop>
- O e-mail soa colaborativo (trabalhando em parceria) ou apenas transacional?
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
- Estilo: Profissional, polido e focado em conclusões precisas. 
- Síntese: Conecte os dados da pesquisa com o contexto específico do lead, em vez de apenas listar fatos. 
- Incerteza: Se um dado for uma inferência, rotule-o claramente como tal. 
</memo_mode>

<dig_deeper_nudge>
Não se limite à primeira conexão óbvia do insight de pesquisa. Conecte os dados técnicos ao negócio do lead evidenciando riscos de obsolescência ou problemas de escalabilidade implícitos.
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

<chain_of_thought_and_grounding>
Use o campo 'commentary' para rascunhar sua linha de raciocínio (CoT) antes de gerar o e-mail final.
</chain_of_thought_and_grounding>

<verification_loop>
- Verifique se o insight da pesquisa foi devidamente contextualizado para o negócio do lead. 
- Garanta que a estrutura respeita os limites de comprimento (conciso e denso).
- Valide se o formato final é estritamente o JSON solicitado. 
</verification_loop>

<output_contract>
Retorne apenas o JSON estruturado: {"commentary": "...", "titulo": "...", "corpo_html": "..."}. 
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

    /**
     * Método auxiliar para rodar o Pesquisador com web_search.
     */
    _runPesquisador: function* (pesquisadorConfig, instructions, input, tools = [], previousResponseId = null) {
        const apiOptions = {
            model: pesquisadorConfig.model,
            instructions: instructions,
            input: input
        };

        if (previousResponseId) {
            apiOptions.previous_response_id = previousResponseId;
        }

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
        return {
            text: this._extractTextFromOutput(response),
            response_id: response && response.id ? response.id : null
        };
    },

    /**
     * Método auxiliar genérico para rodar os Redatores que produzem JSON.
     */
    _runRedator: function* (redatorConfig, inputPrompt, tools = [], previousResponseId = null) {
        const apiOptions = {
            model: redatorConfig.model,
            instructions: redatorConfig.getInstructions(),
            input: inputPrompt,
            textFormat: this.Schemas.RedatorOutputSchema
        };

        if (previousResponseId) {
            apiOptions.previous_response_id = previousResponseId;
        }

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
            return {
                data: JSON.parse(text),
                response_id: response && response.id ? response.id : null
            };
        } catch (e) {
            throw new Error("Flow_FluxoNTec: Falha ao fazer parse do JSON do Redator. Saída bruta: " + text);
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
            const casesSummary = CASES_NTEC.map(c => `ID: ${c.id} | Setor: ${c.setor} | Dores: ${c.dores.join(', ')}`).join('\n');
            const casesBlob = JSON.stringify(CASES_NTEC);

            let prompt = `[DADOS DO LEAD]\n<contexto_lead>\n${context}\n</contexto_lead>\n\n`;

            if (includeEmailHistory && history) {
                prompt += `[HISTÓRICO]\n<historico_emails>\n${history}\n</historico_emails>\n\n`;
            }

            if (research) {
                prompt += `[PESQUISA]\n<pesquisa_mercado>\n${research}\n</pesquisa_mercado>\n\n`;
            }

            prompt += `[CASES]\n<reference_cases_summary>\n${casesSummary}\n</reference_cases_summary>\n\n`;
            prompt += `<reference_cases_full>\n${casesBlob}\n</reference_cases_full>\n\n`;

            prompt += `<task_update>\nGere o Passo ${etapa} da cadência.\n</task_update>\n`;
            return prompt;
        };

        if (cadencia === 'Nurturing') {

            if (etapa === 1 || etapa === 3 || etapa === 5) {
                // 1. Roda Pesquisador
                const pesquisadorInput = `
<business_context>
${input_as_text}
</business_context>

${includeEmailHistory ? `<email_history>\n${emails_anteriores}\n</email_history>\n\n` : ""}

<task_update>
Inicie a pesquisa para a etapa ${etapa}.
</task_update>
`;
                console.log(`[NTec] Rodando Pesquisador (Nurturing) para Etapa ${etapa}`);
                const pesquisaRun = yield* this._runPesquisador(
                    this.Pesquisador,
                    this.Pesquisador.getInstructions(),
                    pesquisadorInput,
                    [this.Tools.webSearchPreview],
                    previousResponseId
                );
                this._trackResponseId(workflow, "Pesquisador", pesquisaRun.response_id);

                // 2. Roda RedatorDeNurturingPesquisa
                const redatorInput = createRedatorInput(etapa, input_as_text, pesquisaRun.text, emails_anteriores);
                console.log(`[NTec] Rodando RedatorDeNurturingPesquisa`);
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
                // Roda direto o RedatorDeNurturingCase com FileSearch
                const redatorInput = createRedatorInput(etapa, input_as_text, "", emails_anteriores);
                console.log(`[NTec] Rodando RedatorDeNurturingCase para Etapa ${etapa}`);
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
                // 1. Roda Pesquisador (Mesmo Agente, nova intenção)
                const pesquisadorInput = `
<business_context>
${input_as_text}
</business_context>

${includeEmailHistory ? `<email_history>\n${emails_anteriores}\n</email_history>\n\n` : ""}

<task_update>
Inicie a pesquisa para retomada do contato.
</task_update>
`;
                console.log(`[NTec] Rodando Pesquisador (Retomada) para Etapa 1`);
                const pesquisaRun = yield* this._runPesquisador(
                    this.Pesquisador,
                    this.Pesquisador.getInstructions(),
                    pesquisadorInput,
                    [this.Tools.webSearchPreview],
                    previousResponseId
                );
                this._trackResponseId(workflow, "Pesquisador", pesquisaRun.response_id);

                // 2. Roda RedatorDeRetomadaCasePesquisa com FileSearch embutido
                const redatorInput = createRedatorInput(etapa, input_as_text, pesquisaRun.text, emails_anteriores);
                console.log(`[NTec] Rodando RedatorDeRetomadaCasePesquisa`);
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
                console.log(`[NTec] Rodando RedatorDeRetomadaFup para Etapa ${etapa}`);
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
            console.log(`[NTec] Rodando RedatorDeReEngajementPSNurturingFup para Etapa ${etapa}`);
            const redatorRun = yield* this._runRedator(
                this.RedatorDeReEngajementPSNurturingFup,
                redatorInput,
                [],
                previousResponseId
            );
            this._trackResponseId(workflow, "RedatorDeReEngajementPSNurturingFup", redatorRun.response_id);
            return redatorRun.data;

        }

        throw new Error(`[NTec] Cadeia ou etapa não foi mapeada: Cadencia '${cadencia}', Etapa '${etapa}'`);
    }
};

if (typeof globalThis !== 'undefined') {
    globalThis.Flow_FluxoNTec = Flow_FluxoNTec;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Flow_FluxoNTec;
}

const CASES_NTEC = [
    {
        "id": "CASE_01",
        "setor": "Saúde / Bem-estar e Tecnologia",
        "dores": "necessidade de validação de mercado, falta de validação de conceito, ausência de MVP estruturado, necessidade de adequação às demandas dos usuários",
        "problema": "A Metabolic ID precisava desenvolver um MVP de saúde guiado por especialistas para garantir que a plataforma se adequasse às necessidades reais dos usuários e do mercado.",
        "solucao": "Realização de Product Discovery com entrevistas com especialistas e testes de usabilidade em protótipo de alta fidelidade para validar o conceito do aplicativo.",
        "impacto": "Validação e desenvolvimento de um MVP perfeitamente alinhado às necessidades do público-alvo, oferecendo uma experiência de usuário otimizada."
    },
    {
        "id": "CASE_02",
        "setor": "Saúde / Diagnósticos Médicos",
        "dores": "demora na entrega de exames físicos, perda de contato com gestantes, processos logísticos e operacionais demorados, dificuldade de acesso a resultados",
        "problema": "A entrega física de exames de gestantes de todo o estado demorava semanas, impedindo tratamentos rápidos e fazendo com que muitas mães não retornassem para buscar os resultados.",
        "solucao": "Desenvolvimento do aplicativo 'Teste da Mamãe' para disponibilização online e imediata dos resultados, integrado a um calendário de saúde e chatbot de dúvidas.",
        "impacto": "Redução do tempo de entrega de exames para até 15 dias, facilitação do acesso aos dados de saúde por gestantes e postos de saúde, e mais de 10.000 downloads na Google Play Store."
    },
    {
        "id": "CASE_03",
        "setor": "Moda / Tecnologia",
        "dores": "limitações orçamentárias, prazos apertados, necessidade de desenvolvimento de software sob medida",
        "problema": "O cliente Guru da Moda necessitava de uma aplicação tecnológica de moda, mas possuía severas restrições de orçamento e de prazo de entrega.",
        "solucao": "Desenvolvimento ágil de uma aplicação focada em moda, priorizando eficiência de escopo e otimização de recursos financeiros.",
        "impacto": "Entrega de uma solução funcional dentro do prazo acordado e respeitando integralmente as restrições orçamentárias do cliente."
    },
    {
        "id": "CASE_04",
        "setor": "Educação / Tecnologia",
        "dores": "escassez de mão de obra de desenvolvimento, gargalo na implementação de protótipos, necessidade de expandir a capacidade de engenharia, rigidez na contratação tradicional",
        "problema": "A Blox Education sofria com uma escassez persistente de mão de obra de desenvolvimento para transpor protótipos de design para a sua plataforma web de flexibilização curricular.",
        "solucao": "Alocação de time de desenvolvimento flexível da Poli Júnior para atuar de forma ágil na implementação de telas, componentes e animações diretamente na plataforma web.",
        "impacto": "Prorrogação do contrato inicial de 2 para 9 meses devido à excelência nas entregas, melhorando a experiência de uso da plataforma para os clientes finais."
    },
    {
        "id": "CASE_05",
        "setor": "Tecnologia / Serviços Jurídicos",
        "dores": "necessidade de validação de mercado, falta de definição de modelo de negócios, falta de protótipo de design, ausência de presença web",
        "problema": "Um advogado com uma ideia de aplicativo para contratação de advogados precisava validar a aceitação do mercado e estruturar a experiência de uso e funcionamento da plataforma.",
        "solucao": "Execução de Product Discovery com pesquisas de mercado, análise de concorrentes e design de interface, culminando no desenvolvimento de um site otimizado e um protótipo interativo.",
        "impacto": "Criação de um protótipo funcional e simulação de funcionamento que validou o conceito da solução e estruturou as bases estratégicas e visuais para o lançamento do app."
    },
    {
        "id": "CASE_06",
        "setor": "Saúde / Tecnologia Social",
        "dores": "risco de depressão gestacional em mães de baixa renda, falta de acompanhamento de saúde contínuo, barreiras de acesso a especialistas de saúde mental",
        "problema": "Pesquisadores de medicina da USP precisavam de um canal acessível para monitorar gestantes de baixa renda, focando na prevenção e suporte à depressão gestacional.",
        "solucao": "Desenvolvimento de um aplicativo móvel de acompanhamento diário com tracking de atividades, tutoriais de saúde mental em áudio e biblioteca confiável sobre gravidez.",
        "impacto": "Monitoramento de gravidez mais eficiente e contínuo, agilizando a identificação precoce de problemas de saúde mental em gestantes vulneráveis."
    },
    {
        "id": "CASE_07",
        "setor": "Tecnologia / Gestão Predial e Condomínios",
        "dores": "falta de ferramentas de gestão de manutenção, processos descentralizados em condomínios, baixa adesão de zeladores a sistemas, necessidade de painel administrativo geral",
        "problema": "A gestora Manu necessitava de uma ferramenta inovadora que facilitasse a gestão e o controle de manutenções prediais para síndicos e zeladores, além de um painel de controle administrativo centralizado.",
        "solucao": "Desenvolvimento de uma plataforma web integrada com aplicativo móvel PWA focada em usabilidade, executado através de metodologia ágil com entregas incrementais quinzenais.",
        "impacto": "Redução do tempo de entrega pela metade, com liberação de uso em 40 dias, promovendo um crescimento de 5x no número de clientes e mais de 600% de aumento em condomínios cadastrados."
    },
    {
        "id": "CASE_08",
        "setor": "Saúde / Pesquisa e Tecnologia",
        "dores": "gestão manual de dados de pesquisa, lentidão no preenchimento de prontuários, espaço amostral reduzido por burocracia, falta de ferramenta móvel de coleta de dados",
        "problema": "A Disciplina de Urologia da FMABC enfrentava gargalos no registro manual de dados de pacientes para pesquisas acadêmicas, limitando o volume e a precisão das análises científicas.",
        "solucao": "Desenvolvimento do aplicativo móvel híbrido 'UroABC' utilizando o framework Ionic sob metodologia Scrum, permitindo aos médicos criar e preencher formulários clínicos de forma ágil.",
        "impacto": "Otimização do processo diário de coleta de dados clínicos, permitindo expandir o tamanho da amostra estudada e elevando a acurácia das produções científicas da instituição."
    },
    {
        "id": "CASE_09",
        "setor": "Construção Civil / Tecnologia Imobiliária",
        "dores": "desorganização na rotina de corretores de imóveis, lentidão no acesso a informações de vendas, falta de ferramenta de vendas móvel",
        "problema": "Uma construtora enfrentava dificuldades de comunicação e eficiência com seus corretores de imóveis, necessitando de uma ferramenta digital móvel para dinamizar as vendas diárias.",
        "solucao": "Desenvolvimento de aplicativo móvel personalizado para corretores de imóveis, focado no acesso ágil a informações comerciais e otimização da rotina de vendas.",
        "impacto": "Facilitação da rotina operacional de vendas dos corretores, otimizando o fluxo de contatos e a conversão de novos negócios para a construtora."
    },
    {
        "id": "CASE_10",
        "setor": "Automotivo / Tecnologia",
        "dores": "ausência de gestão de serviços e histórico automobilístico integrado, falta de conexão direta entre proprietários e compradores de carros modificados, necessidade de gerenciamento administrativo de anúncios",
        "problema": "Um empreendedor identificou que entusiastas do automobilismo careciam de um sistema integrado para gerenciar manutenções de veículos modificados e comercializá-los diretamente.",
        "solucao": "Desenvolvimento de um aplicativo mobile para registro de histórico veicular (manutenções, custos e fotos) integrado a uma plataforma CMS corporativa para gestão de anúncios e usuários.",
        "impacto": "Lançamento bem-sucedido da plataforma SPE Garage nas lojas digitais de aplicativos, estruturando um modelo de negócio inovador para entusiastas automotivos."
    },
    {
        "id": "CASE_11",
        "setor": "Saúde Mental / Tecnologia e Vendas",
        "dores": "dificuldade em escalar vendas online, limitação operacional na plataforma web antiga, necessidade de consultoria e direcionamento estratégico de produto",
        "problema": "Uma startup de saúde mental online necessitava escalar seu modelo de negócios e alavancar vendas digitais, mas carecia de uma plataforma web robusta e de governança ágil.",
        "solucao": "Desenvolvimento de software de alta performance sob escopo aberto e metodologia Scrum, liderado por um Product Owner dedicado e equipe de engenharia multidisciplinar.",
        "impacto": "Modernização tecnológica e estruturação de processos ágeis que permitiram escalar a tração comercial e as vendas da startup no meio digital."
    },
    {
        "id": "CASE_12",
        "setor": "Recrutamento e Seleção / Tecnologia",
        "dores": "necessidade de expansão de plataforma, limitações de um blog simples, necessidade de captação de parceiros corporativos, validação de mercado",
        "problema": "A Wahojobs possuía apenas um blog de vagas remotas e necessitava expandi-lo para um portal de emprego de alta performance para suportar parcerias com empresas internacionais.",
        "solucao": "Redesenho da identidade visual e desenvolvimento web sob escopo aberto e metodologia MVP, permitindo lançamentos graduais de funcionalidades de recrutamento.",
        "impacto": "Atingimento de 800 mil acessos no terceiro mês de lançamento e estabelecimento de parcerias ativas com mais de 100 empresas internacionais no portal."
    }
];

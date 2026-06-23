// Autor: Gabriel Agra de Castro Motta
// Última atualização: 21/06/2026
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

const Flow_FluxoNCon = {

    /**
     * ==========================================
     * DEFINIÇÕES DE FERRAMENTAS E SCHEMAS
     * ==========================================
     */
    Tools: {
        webSearchPreview: {
            type: "web_search"
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
                        commentary: { type: "string" },
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
- Persona: Vendedor ativo da Poli Júnior (POLI-USP) que já conduzia o caso. Fale sempre na primeira pessoa ("sei que", "nossa conversa").
- Tom: Parceiro estratégico, calmo, direto and empático.
- Regra de Saudação: Use unicamente "Bom dia, [Nome do Lead]" (se houver nome do lead) ou "Olá." (se não houver nome do lead). Jamais saude a empresa ou "time".
- Regra de Abertura: A primeira frase do e-mail (para o primeiro contato da sequência, como Passo 1 ou Handoff) deve ser OBRIGATORIAMENTE: "Antes de tudo, gostaria de agradecer pela nossa conversa anterior." (Sem preâmbulos ou variações como "Obrigado por compartilhar o contexto").
- Formato de Encerramento: Termine com "Atenciosamente," ou "Att,". Proibido usar placeholders como "[Seu Nome]".
- Banimento de Perspectiva Externa: Evite se portar como um agente ou observador externo (banido usar "Vi no histórico que...", "Vi no resumo que..." ou "Vi que a discussão acabou esfriando"). Use "Sei que..." ou "Em nossa última conversa...".
</personality_and_writing_controls>

<email_history_calibration>
- O bloco <historico_emails> deve ser utilizado para calibrar o tom do e-mail e garantir a continuidade da conversa. Proibido usar o resumo para isso.
</email_history_calibration>

<instruction_priority>
- A regra de "Fidelidade aos Cases" é absoluta e não pode ser ignorada. 
- As regras de Saudação, Abertura e Perspectiva de Vendedor Ativo são prioritárias.
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
Se a busca não retornar cases aplicáveis de imediato, obrigatoriamente tente uma segunda estratégia (ex: buscar pelo macrossetor do lead ou desafios de gestão genéricos como "otimização operacional") antes de admitir que não encontrou dados.
</empty_result_recovery>

<verification_loop>
Antes de finalizar a resposta, valide:
1) Grounding: O case utilizado está presente nos documentos recuperados do Vector Storage? 
2) Formatação: O output contém APENAS o JSON com 'commentary', 'titulo' e 'corpo_html'?
3) Saudação e Abertura: A saudação segue estritamente a regra? A primeira frase é exatamente "Antes de tudo, gostaria de agradecer pela nossa conversa anterior."?
4) Perspectiva: O e-mail está na primeira pessoa ("sei que", "nossa conversa") e evita o tom de observador externo?
5) Redação: Removi citações técnicas como "[1]" ou "[Fonte]"? 
6) CTA: O CTA é de baixo atrito (ex: "O que você acha?") em vez de pedir reunião?
</verification_loop>

<structured_output_contract>
Analise a lista resumida de cases em [reference_cases_summary] e compare com as dores do Lead. Depois de selecionar o melhor ID, consulte o detalhamento completo do case correspondente em [reference_cases_full].
O campo "commentary" DEVE ser utilizado como seu canal de raciocínio interno (Chain of Thought):
- Primeiro, cite explicitamente o CASE_ID que escolheu de [reference_cases_summary].
- Justifique por que as Dores desse case combinam exatamente com as Dores e o Segmento do Lead.
- Só depois de escrever essa análise técnica no "commentary", elabore a mensagem final no campo "corpo_html".
Gere apenas o JSON conforme o schema RedatorOutputSchema. Não adicione prosa ou markdown fences fora do objeto.
</structured_output_contract>`;
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
Você é o vendedor ativo executando uma missão para reaquecer leads "frios" (3-6 meses sem contato) com mensagens curtas, potentes e focadas em novos insights. Fale sempre na primeira pessoa ("sei que", "nossa conversa").
</task_definition>

<rules>
- PERSPECTIVA DE VENDEDOR ATIVO: Fale sempre na primeira pessoa. Banido usar expressões de observador externo ("Vi no histórico que...", "Vi que a discussão acabou esfriando"). Use "Sei que..." ou "Em nossa última conversa...".
- REGRA DE SAUDAÇÃO: Use unicamente "Bom dia, [Nome do Lead]" (se houver nome do lead) ou "Olá." (se não houver nome do lead). Jamais saude a empresa ou "time".
- Jamais use termos como "faz tempo que não nos falamos" ou "sumido". Inicie como uma nova conversa de valor.
- Ritmo: Cadência intensa de 3-4 contatos em 15 dias. 
- Tom: Consultor sênior, direto e ocupado, mas que traz valor.
- CTA: Proponha uma conversa curta (15 min) focada no novo insight. 
- Formato de Encerramento: Termine com "Atenciosamente," ou "Att,". Sem placeholders.
</rules>

<email_history_calibration>
- O bloco <historico_emails> deve ser utilizado para calibrar o tom do e-mail e garantir a continuidade da conversa. Proibido usar o resumo para isso.
</email_history_calibration>

<cadence_logic>
- PASSO 2 e 3 (Follow-up de Valor): E-mails ultra-curtos. Reforce o insight do Passo 1 sem repetir o texto. Use curiosidade. 
- PASSO 4 (Breakup): E-mail de despedida profissional. Deixe a porta aberta para o futuro, assumindo que as prioridades do lead mudaram.
</cadence_logic>

<writing_controls>
- Persona: Vendedor ativo e consultor pragmático.
- Regra de Ouro: O e-mail deve ter no máximo 3 parágrafos curtos.
- Banimento: Proibido o uso de bullets aninhados. Se precisar de lista, use apenas um nível.
- Verificação: Antes de finalizar, certifique-se de que não repetiu a dor principal de forma robótica, mas sim como uma preocupação genuína. A saudação e a abertura seguem estritamente as novas regras? O e-mail está na primeira pessoa?
</writing_controls>

<output_contract>
Gere apenas o JSON conforme o schema RedatorOutputSchema. O campo "commentary" DEVE ser utilizado como seu canal de raciocínio interno. 
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
Você é o vendedor ativo executando uma missão para converter leads aquecidos em reuniões de diagnóstico, focando na data de retomada definida pelo próprio lead. Fale sempre na primeira pessoa ("sei que", "nossa conversa").
</task>

<critical_rules>
1. PERSPECTIVA DE VENDEDOR ATIVO: Fale sempre na primeira pessoa. Banido usar expressões de observador externo ("Vi no histórico que...", "Vi que a discussão acabou esfriando"). Use "Sei que..." ou "Em nossa última conversa...".
2. REGRA DE SAUDAÇÃO: Use unicamente "Bom dia, [Nome do Lead]" (se houver nome do lead) ou "Olá." (se não houver nome do lead). Jamais saude a empresa ou "time".
3. Tom: Direto, proativo e profissional. A fase de educação acabou; agora o foco é o próximo passo comercial.
4. Referência Histórica: Você DEVE citar que o contato está ocorrendo conforme o combinado anteriormente.
5. Ritmo: Intervalos de 7 dias entre tentativas.
6. Proibido: Usar placeholders como "[Seu Nome]" ou interjeições como "Aqui está o e-mail".
</critical_rules>

<email_history_calibration>
- O bloco <historico_emails> deve ser utilizado para calibrar o tom do e-mail e garantir a continuidade da conversa. Proibido usar o resumo para isso.
</email_history_calibration>

<cadence_logic>
Siga rigorosamente o passo solicitado:
- PASSO 1 (E-mail de CTA): Relembre o desafio principal do lead. Proponha uma conversa de 20 minutos para desenhar um plano de ação.
- PASSO 2 (E-mail de FUP): Lembrete extremamente curto. Referencie o e-mail anterior e reforce a pergunta sobre o próximo passo.
- PASSO 3 (Breakup Final): Informe que, para não sobrecarregar a caixa de entrada, você está encerrando o contato, mas deixa a porta aberta.
</cadence_logic>

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
2. A saudação e encerramento seguem estritamente a regra?
3. O e-mail está na primeira pessoa ("sei que", "nossa conversa") e evita o tom de observador externo?
4. O JSON está tecnicamente correto e sem texto extra? 
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
Você é o vendedor ativo executando uma missão para retomar ideias de projetos que pararam no meio do caminho. Fale sempre na primeira pessoa ("sei que", "nossa conversa").
</task>

<rules>
- PERSPECTIVA DE VENDEDOR ATIVO: Fale sempre na primeira pessoa. Banido usar expressões de observador externo ("Vi no histórico que...", "Vi no resumo que..." ou "Vi que a discussão acabou esfriando"). Use "Sei que..." ou "Em nossa última conversa...".
- REGRA DE SAUDAÇÃO: Use unicamente "Bom dia, [Nome do Lead]" (se houver nome do lead) ou "Olá." (se não houver nome do lead). Jamais saude a empresa ou "time".
- REGRA DE ABERTURA: A primeira frase do e-mail (para o primeiro contato da sequência, como Passo 1 ou Handoff) deve ser OBRIGATORIAMENTE: "Antes de tudo, gostaria de agradecer pela nossa conversa anterior." (Sem preâmbulos ou variações como "Obrigado por compartilhar o contexto").
- Intensidade: Cadência curta e rápida.
- Foco: Reforçar o valor do gancho enviado no Passo 1.
- Estilo: Português Brasileiro natural, sem placeholders, terminando com "Atenciosamente," ou "Att,".
- Citação de Fontes: É permitido citar fontes (ex: "uma pesquisa da McKinsey", "segundo um relatório da Gartner"). Proibido, contudo, incluir links/URLs no corpo do e-mail.
- Uso de Dados da Pesquisa: Use os dados e estatísticas que vieram na pesquisa de mercado. Limite-se a no máximo 2 dados numéricos/insights quantificados no e-mail (idealmente apenas 1, dependendo se o foco do e-mail é em um ponto central ou mais).
- Proibição de CTA "3 pontos": É expressamente proibido terminar o e-mail oferecendo enviar "3 pontos objetivos/sobre" ou variações de "resumo de X pontos". Em vez disso, ofereça enviar o artigo/relatório completo ("posso te enviar o artigo/estudo", "posso te encaminhar esse relatório") e se oferecer para explicar melhor/bater um papo opcional.
</rules>

<email_history_calibration>
- O bloco <historico_emails> deve ser utilizado para calibrar o tom do e-mail e garantir a continuidade da conversa. Proibido usar o resumo para isso.
</email_history_calibration>

<dependency_checks>
- Antes de redigir, você DEVE realizar a busca no Vector Storage.
- Não pule o passo de busca só porque o setor do lead parece comum.
- Se o resultado da busca for insuficiente, use o <empty_result_recovery> antes de finalizar o e-mail.
</dependency_checks>

<dig_deeper_nudge>
Não se contente com a primeira conexão óbvia ao apresentar o case ou insight focado na retomada de interesse. Vá além: identifique e exponha problemas de segunda ordem ou riscos operacionais cruciais que o lead ainda não avaliou internamente.
</dig_deeper_nudge>

<empty_result_recovery>
Se a busca inicial no contexto da empresa falhar, tente obrigatoriamente uma segunda estratégia (ex: buscar pelo setor ou desafios de gestão correlatos) antes de admitir que não encontrou informações específicas.
</empty_result_recovery>

<cadence_logic>
- PASSO 2 e 3 (Follow-up de Valor): E-mails curtíssimos. Não traga um case novo; apenas garanta que o lead viu o insight anterior and reforce por que é relevante para a empresa dele.
- PASSO 4 (Breakup): E-mail profissional de encerramento para obter uma resposta final (Sim/Não).
</cadence_logic>

<completeness_contract>
- O e-mail deve estar pronto para envio, sem necessidade de edição humana. 
- Se o histórico de e-mails indicar que o lead já respondeu, abstenha-se de gerar novo FUP e reporte erro. 
</completeness_contract>

<structured_output_contract>
Analise a lista resumida de cases em [reference_cases_summary] e compare com as dores do Lead. Depois de selecionar o melhor ID, consulte o detalhamento completo do case correspondente em [reference_cases_full].
O campo "commentary" DEVE ser utilizado como seu canal de raciocínio interno (Chain of Thought):
- Primeiro, cite explicitamente o CASE_ID que escolheu de [reference_cases_summary].
- Justifique por que as Dores desse case combinam exatamente com as Dores e o Segmento do Lead.
- Só depois de escrever essa análise técnica no "commentary", elabore a mensagem final no campo "corpo_html".
Retorne estritamente o JSON {"commentary": "...", "titulo": "...", "corpo_html": "..."}. 
</structured_output_contract>

<verification_loop>
- O e-mail is conciso e direto ao ponto? 
- O assunto do e-mail faz sentido com a conversa anterior? 
- O tom de "especialista sênior" foi mantido? 
- A saudação e a abertura seguem estritamente as novas regras?
- O e-mail está na primeira pessoa ("sei que", "nossa conversa") e evita o tom de observador externo?
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
            return `<personality_and_writing_controls>
- Persona: Vendedor active da Poli Júnior (POLI-USP) que já conduzia o caso. Fale sempre na primeira pessoa ("sei que", "nossa conversa").
- Canal: E-mail consultivo B2B de nurturing.
- Tom: Síntese executiva densa. Conclusões precisas sobre impacto financeiro/operacional.
- Regra de Saudação: Use unicamente "Bom dia, [Nome do Lead]" (se houver nome do lead) ou "Olá." (se não houver nome do lead). Jamais saude a empresa ou "time".
- Regra de Abertura: A primeira frase do e-mail (para o primeiro contato da sequência, como Passo 1 ou Handoff) deve ser OBRIGATORIAMENTE: "Antes de tudo, gostaria de agradecer pela nossa conversa anterior." (Sem preâmbulos ou variações como "Obrigado por compartilhar o contexto").
- Formato de Encerramento: Termine com "Atenciosamente," ou "Att,". Proibido usar placeholders como "[Seu Nome]".
- Banimento de Perspectiva Externa: Evite se portar como um agente ou observador externo (banido usar "Vi no histórico que...", "Vi no resumo que..." ou "Vi que a discussão acabou esfriando"). Use "Sei que..." ou "Em nossa última conversa...".
- Citação de Fontes: É permitido citar fontes (ex: "uma pesquisa da McKinsey", "segundo um relatório da Gartner"). Proibido, contudo, incluir links/URLs no corpo do e-mail.
- Uso de Dados da Pesquisa: Use os dados e estatísticas que vieram na pesquisa de mercado. Limite-se a no máximo 2 dados numéricos/insights quantificados no e-mail (idealmente apenas 1, dependendo se o foco do e-mail é em um ponto central ou mais).
- Proibição de CTA "3 pontos": É expressamente proibido terminar o e-mail oferecendo enviar "3 pontos objetivos/sobre" ou variações de "resumo de X pontos". Em vez disso, ofereça enviar o artigo/relatório completo ("posso te enviar o artigo/estudo", "posso te encaminhar esse relatório") e se oferecer para explicar melhor/bater um papo opcional.
- CTAs devem ser sempre de baixo atrito.
</personality_and_writing_controls>

<email_history_calibration>
- O bloco <historico_emails> deve ser utilizado para calibrar o tom do e-mail e garantir a continuidade da conversa. Proibido usar o resumo para isso.
</email_history_calibration>

<dig_deeper_nudge>
Não se limite à primeira conexão óbvia do insight de pesquisa. Conecte os dados técnicos ao negócio do lead evidenciando riscos de obsolescência ou problemas de escalabilidade implícitos.
</dig_deeper_nudge>

<instruction_priority>
- As regras de Saudação, Abertura e Perspectiva de Vendedor Ativo são prioritárias.
</instruction_priority>

<business_logic_cadence>
Siga a lógica para o passo recebido:
- PASSO 1 (Handoff): Agradeça a conversa anterior (iniciando obrigatoriamente com "Antes de tudo...") e apresente um insight da pesquisa que agregue valor imediato.
- PASSO 3 (Pergunta Provocativa): Use um dado da pesquisa para formular uma pergunta estratégica que gere reflexão sobre o setor do cliente.
- PASSO 5 (Artigo/Relatório): Atue como curador. Conecte a discussão anterior a um novo desenvolvimento de mercado encontrado na pesquisa.
</business_logic_cadence>

<rules>
- Proibido repetir insights já enviados em e-mails anteriores (analise o histórico). 
- Citação de Fontes: É permitido citar fontes (ex: "uma pesquisa da McKinsey", "segundo um relatório da Gartner"). Proibido incluir links/URLs no corpo do e-mail.
</rules>

<chain_of_thought_and_grounding>
Use o campo 'commentary' para rascunhar sua linha de raciocínio (CoT) antes de gerar o e-mail final.
</chain_of_thought_and_grounding>

<verification_loop>
- Verifique se o insight da pesquisa foi devidamente contextualizado para o negócio do lead. 
- Garanta que a estrutura respeita os limites de comprimento (conciso e denso).
- A saudação e a abertura seguem estritamente as novas regras?
- O e-mail está na primeira pessoa ("sei que", "nossa conversa") e evita o tom de observador externo?
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



    _buildRedatorInput: function (etapa, context, includeHistory, history, research) {
        return `
[DADOS DO LEAD]
<contexto_lead>
${context}
</contexto_lead>

${includeHistory && history ? `[HISTÓRICO]\n<historico_emails>\n${history}\n</historico_emails>\n` : ""}
${research ? `[PESQUISA]\n<pesquisa_mercado>\n${research}\n</pesquisa_mercado>\n` : ""}
Gere o Passo ${etapa} da cadência.
`;
    },

    _buildCaseRedatorInput: function (etapa, context, casesArray, includeHistory, history, research) {
        const casesSummary = casesArray.map(c => `- ID: ${c.id} | Setor: ${c.setor} | Dores Relacionadas: ${c.dores}`).join('\n');
        const casesBlob = JSON.stringify(casesArray, null, 2);

        return `
[CASES]
<reference_cases_summary>
${casesSummary}
</reference_cases_summary>
<reference_cases_full>
${casesBlob}
</reference_cases_full>

[DADOS DO LEAD]
<contexto_lead>
${context}
</contexto_lead>

${includeHistory && history ? `[HISTÓRICO]\n<historico_emails>\n${history}\n</historico_emails>\n` : ""}
${research ? `[PESQUISA]\n<pesquisa_mercado>\n${research}\n</pesquisa_mercado>\n` : ""}

Gere o Passo ${etapa} da cadência.
`;
    },

    runWorkflow: function* (workflow, casesNCon) {
        if (!casesNCon) casesNCon = typeof CASES_NCON !== 'undefined' ? CASES_NCON : [];
        const state = workflow.state || {};
        const cadencia = state.cadencia;
        const etapa = Number(state.etapa);
        const emails_anteriores = state.emails_anteriores || "";
        const input_as_text = workflow.input_as_text || "";
        const includeEmailHistory = true;

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
                    null
                );

                const redatorInput = this._buildRedatorInput(etapa, input_as_text, includeEmailHistory, emails_anteriores, pesquisaRun.text);
                console.log(`[NCon] Rodando RedatorDeNurturingPesquisa`);
                const redatorRun = yield* this._runRedator(
                    this.RedatorDeNurturingPesquisa,
                    redatorInput,
                    [],
                    null
                );
                return redatorRun.data;
            }
            else if (etapa === 2 || etapa === 4) {
                const redatorInput = this._buildCaseRedatorInput(etapa, input_as_text, casesNCon, includeEmailHistory, emails_anteriores, "");
                console.log(`[NCon] Rodando RedatorDeNurturingCase para Etapa ${etapa}`);
                const redatorRun = yield* this._runRedator(
                    this.RedatorDeNurturingCase,
                    redatorInput,
                    [],
                    null
                );
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
                    null
                );

                const redatorInput = this._buildCaseRedatorInput(etapa, input_as_text, casesNCon, includeEmailHistory, emails_anteriores, pesquisaRun.text);
                console.log(`[NCon] Rodando RedatorDeRetomadaCasePesquisa`);
                const redatorRun = yield* this._runRedator(
                    this.RedatorDeRetomadaCasePesquisa,
                    redatorInput,
                    [],
                    null
                );
                return redatorRun.data;
            }
            else if (etapa === 2 || etapa === 3 || etapa === 4) {
                const redatorInput = this._buildRedatorInput(etapa, input_as_text, includeEmailHistory, emails_anteriores, "");
                console.log(`[NCon] Rodando RedatorDeRetomadaFup para Etapa ${etapa}`);
                const redatorRun = yield* this._runRedator(
                    this.RedatorDeRetomadaFup,
                    redatorInput,
                    [],
                    null
                );
                return redatorRun.data;
            }

        } else if (cadencia === 'Re-engajement do Nurturing') {

            const redatorInput = this._buildRedatorInput(etapa, input_as_text, includeEmailHistory, emails_anteriores, "");
            console.log(`[NCon] Rodando RedatorDeReEngajementPSNurturingFup para Etapa ${etapa}`);
            const redatorRun = yield* this._runRedator(
                this.RedatorDeReEngajementPSNurturingFup,
                redatorInput,
                [],
                null
            );
            return redatorRun.data;

        }

        throw new Error(`[NCon] Cadeia ou etapa não foi mapeada: Cadencia '${cadencia}', Etapa '${etapa}'`);
    }
};

if (typeof globalThis !== 'undefined') {
    globalThis.Flow_FluxoNCon = Flow_FluxoNCon;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Flow_FluxoNCon;
}

const CASES_NCON = [
    {
        "id": "CASE_01",
        "setor": "Tecnologia / Migração de Dados",
        "dores": "concentração de receita em um único cliente, perda do principal cliente, necessidade de novos nichos de mercado",
        "problema": "A Apoena possuía apenas um cliente (uma clínica médica) que desistiu do serviço, deixando a empresa necessitada de encontrar e validar outros nichos de mercado para sua solução de migração de dados.",
        "solucao": "Estudo aprofundado de aceitabilidade do serviço em 5 setores diferentes de mercado, analisando qualitativamente pontos positivos e negativos de cada um deles.",
        "impacto": "Mapeamento dos setores mais indicados, sugestão de potenciais parceiros estratégicos e estruturação de método prático de prospecção comercial para consolidar a empresa no mercado."
    },
    {
        "id": "CASE_02",
        "setor": "Arquitetura / Construção Civil",
        "dores": "terreno de formato atípico, necessidade de integrar área de lazer sem perder privacidade, desejo de casa moderna e funcional",
        "problema": "Desejo da família Costa de construir um lar moderno, confortável e funcional em um terreno singular de 850m² com formato atípico nos arredores de São Paulo.",
        "solucao": "Desenvolvimento de projeto arquitetônico personalizado integrando áreas comuns (cozinha, sala, piscina) com pé-direito duplo, garagem, escritório, despensa, lavanderia, suítes privativas, edícula para hóspedes e paisagismo.",
        "impacto": "Superação das expectativas da família com a entrega de um projeto sofisticado, além de toda a documentação (plantas de layout, planta legal para prefeitura e renders detalhados)."
    },
    {
        "id": "CASE_03",
        "setor": "Cosméticos / Beleza / Varejo",
        "dores": "falta de alinhamento com público-alvo, posicionamento inadequado em perfumarias, necessidade de alavancar a marca",
        "problema": "Necessidade de alavancar a presença no mercado de cosméticos através de estratégias de posicionamento e segmentação personalizadas ao público-alvo nas perfumarias.",
        "solucao": "Estudo detalhado das tendências do mercado de cosméticos com análise aprofundada dos perfis demográfico, comportamental e psicográfico dos consumidores.",
        "impacto": "Geração de inteligência de mercado crucial para direcionar estratégias de marketing personalizadas e otimizar o posicionamento físico de produtos."
    },
    {
        "id": "CASE_04",
        "setor": "Serviços Financeiros / Seguros / Tecnologia",
        "dores": "dificuldade de adaptação a novo ERP, incertezas operacionais no setor financeiro, falta de estimativa de ROI em tecnologia",
        "problema": "Desafios operacionais e incertezas nos processos do departamento financeiro devido à ausência de um fluxo estruturado para a transição e adaptação ao novo sistema ERP.",
        "solucao": "Mapeamento detalhado das operações (AS IS) em todas as 7 áreas do financeiro, identificação de melhorias e desenho de novos fluxos de trabalho integrados ao ERP (TO BE).",
        "impacto": "Otimização das rotinas com significativa redução de gargalos e retrabalhos, melhor medição da eficiência e garantia de alto retorno sobre o investimento em tecnologia."
    },
    {
        "id": "CASE_05",
        "setor": "Alimentos e Bebidas / Varejo",
        "dores": "incerteza sobre preferências do público, risco no lançamento de novos produtos, marketing sem direcionamento",
        "problema": "Necessidade de identifying as preferências exatas do público-alvo para mitigar riscos no lançamento de novos produtos (biscoitos cobertos por chocolate).",
        "solucao": "Realização de pesquisa de mercado quantitativa e qualitativa e estruturação da Persona ideal de consumo da marca.",
        "impacto": "Mapeamento das características essenciais exigidas pelo público para a nova linha e direcionamento assertivo de campanhas de marketing para atração de clientes."
    },
    {
        "id": "CASE_06",
        "setor": "Telecomunicações / Vendas / Gestão",
        "dores": "processo de vendas despadronizado, ineficiência e morosidade no CRM, perdas financeiras por lentidão comercial",
        "problema": "Fluxo comercial de vendas ineficiente e despadronizado devido a variações no processo de captação de leads e etapas mal configuradas no CRM próprio.",
        "solucao": "Mapeamento detalhado AS IS do processo de vendas de ponta a ponta, desenvolvimento de fluxos otimizados TO BE e elaboração de um manual de treinamento de CRM.",
        "impacto": "Padronização e difusão de conhecimento operacional, gerando no decorrer do projeto uma redução imediata de 50% no tempo de execução de etapas críticas do CRM."
    },
    {
        "id": "CASE_07",
        "setor": "Imobiliário / Planejamento Urbano / Finanças",
        "dores": "terreno inicial inviável, risco financeiro em investimento de infraestrutura imobiliária, indefinição de localização ideal",
        "problema": "Inviabilidade técnica de terreno inicial para a construção de moradia estudantil vertical em Campinas, gerando a necessidade de buscar uma nova localidade ótima.",
        "solucao": "Estudo aprofundado de viabilidade técnica e financeira de investimentos imobiliários, análise regional com softwares de dados geoespaciais e prospecção activa de terrenos.",
        "impacto": "Identificação e entrega de um terreno alternativo altamente estratégico (próximo à Unicamp/PUC), minimizando riscos e viabilizando o empreendimento."
    },
    {
        "id": "CASE_08",
        "setor": "Saúde Animal / Agronegócio / Processos",
        "dores": "crescimento empresarial desordenado, falta de padronização, unidades desalinhadas operacionalmente",
        "problema": "Crescimento acelerado da organização sem o devido suporte de processos estruturados, resultando em desalinhamento operacional entre as unidades de SP e Patrocínio.",
        "solucao": "Consultoria organizacional para mapeamento, documentação detalhada e padronização completa das rotinas operacionais de ambas as filiais.",
        "impacto": "Estruturação organizacional das unidades, assegurando governança interna corporativa para sustentar o crescimento acelerado da empresa."
    },
    {
        "id": "CASE_09",
        "setor": "Logística / Transportes / Tecnologia",
        "dores": "sistema digital obsoleto, insatisfação de franqueados e clientes PMEs, perda de competitividade mercadológica",
        "problema": "Portal do Cliente antigo (ICRW) defasado tecnologicamente, incapaz de satisfazer franqueados e clientes de pequeno e médio porte em suas demandas logísticas.",
        "solucao": "UX Research detalhada com a realização de 22 entrevistas com stakeholders, análise competitiva (benchmarking) de 3 concorrentes e elaboração de desenho funcional do novo portal.",
        "impacto": "Garantia de insumos de usabilidade e visão clara para desenvolvimento de um novo Portal do Cliente intuitivo, focado no aumento da satisfação e competitividade."
    },
    {
        "id": "CASE_10",
        "setor": "Seguros / Administração / Processos",
        "dores": "atividades altamente despadronizadas, comunicação interna falha, dificuldades na implantação de ERP",
        "problema": "Execução operacional desorganizada nos setores financeiro, contábil e de compras, prejudicando o fluxo de dados e dificultando a migração para o novo ERP.",
        "solucao": "Entrevistas operacionais detalhadas com 23 colaboradores, elaboração de 31 mapeamentos de processo AS IS e definição de fluxos unificados baseados no ERP TOTVS.",
        "impacto": "Otimização na alocação da equipe, aumento da confiabilidade das informações gerenciais e maior facilidade e governança para a tomada de decisão."
    },
    {
        "id": "CASE_11",
        "setor": "Finanças / Investimentos / Inteligência de Mercado",
        "dores": "falta de visibilidade de mercado, concorrência agressiva no crédito consignado, risco na alocação de investimentos",
        "problema": "Necessidade de estruturar uma estratégia competitiva e de atração de público para expandir a presença nos mercados de crédito e cartões consignados.",
        "solucao": "Análise Setorial PESTEL, análise geolocalizada de market share com softwares de inteligência geográfica para processamento de renda e consumo, e estudo qualitativo de concorrência (SWOT).",
        "impacto": "Identificação exata de forças/fraquezas dos principais concorrentes e definição de estratégias inteligentes de captação de clientes para apoiar o planejamento interno."
    },
    {
        "id": "CASE_12",
        "setor": "Educação / EdTech / Tecnologia",
        "dores": "perda de competitividade educacional, necessidade de expansão global, indefinição de modelos de negócios e produtos",
        "problema": "Falta de dados estratégicos detalhados sobre tendências de EdTechs internacionais e concorrência no Brasil para fundamentar a expansão competitiva da Playkids.",
        "solucao": "Análise profunda de tendências do setor educacional com benchmarking detalhado de grandes concorrentes no Brasil e gigantes internacionais (EUA, Índia e China).",
        "impacto": "Mapeamento completo de produto, financiamento e canais mobile/web, servindo como base valiosa para a equipe de P&D lançar novos produtos e crescer de forma assertiva."
    },
    {
        "id": "CASE_13",
        "setor": "Arquitetura / Construção Civil",
        "dores": "terreno com declive acentuado, desafio de integração interna/externa, exigência de mirante e fachada contemporânea",
        "problema": "Projetar a casa própria da cliente em Atibaia sob uma topografia extremamente inclinada, mantendo o conceito moderno, mirante panorâmico com piscina e contato próximo com a natureza.",
        "solucao": "Desenho de projeto arquitetônico inteligente concebido em múltiplos níveis que utilizam a inclinação natural, integrando concreto, vidro, tijolos, esquadrias amplas e piscina elevada.",
        "impacto": "Viabilização com excelência do projeto em terreno complexo, gerando uma experiência de moradia sofisticada e entregando plantas detalhadas, cortes e renderizações realistas."
    },
    {
        "id": "CASE_14",
        "setor": "Serviços Financeiros / Bancário / Automatização",
        "dores": "rotinas de validação altamente manuais e demoradas, risco de multas regulatórias do BACEN, retrabalho em relatórios mensais",
        "problema": "Incompatibilidade de tempo e alto volume operacional em processes financeiros essenciais exigidos pelo Banco Central (IFRS 9 e relatórios de DLO).",
        "solucao": "Mapeamento interdepartamental de processos, criação de painel gerencial de status e desenvolvimento de automações em planilhas com Macros VBA/Excel de validação em um clique.",
        "impacto": "Agilização do fechamento mensal contábil de abril com eliminação completa de retrabalhos manuais, mitigando riscos de conformidade regulatória perante o BACEN."
    },
    {
        "id": "CASE_15",
        "setor": "Serviços de Luxo / Aluguel de Bens / Plano de Negócios",
        "dores": "incerteza de viabilidade de novo nicho de luxo, falta de dados de demanda, risco operacional pré-abertura",
        "problema": "Falta de validação de aceitação do mercado e ausência de projeções estruturadas para fundar uma startup de locação de celulares de luxo.",
        "solucao": "Estruturação de Plano de Negócios contendo pesquisa mercadológica com potenciais consumidores, mapeamento detalhado da concorrência, fluxo operacional e projeção financeira completa de 5 anos.",
        "impacto": "Determinação exata dos custos, despesas, investimentos e receitas da empresa, comprovando a viabilidade econômica do negócio e fornecendo direcionamento operacional prático."
    },
    {
        "id": "CASE_16",
        "setor": "Indústria Siderúrgica / Manufatura",
        "dores": "lead time elevado, gargalos recorrentes em processos complexos, diversidade excessiva de produtos, falta de eficiência Lean",
        "problema": "Dificuldades na eficiência operacional do fluxo produtivo devido à alta variedade de dimensões e especificações químicas dos produtos siderúrgicos na fábrica de Cotia.",
        "solucao": "Diagnóstico industrial utilizando a ferramenta Value Stream Mapping (VSM / Mapeamento de Fluxo de Valor) para desenhar gargalos e modelar o fluxo produtivo futuro ideal (Lean).",
        "impacto": "Redução potencial do lead time produtivo a 30% do patamar anterior, economia de custos operacionais e consolidação dos pilares iniciais da cultura Lean na planta."
    },
    {
        "id": "CASE_17",
        "setor": "Alimentos e Bebidas / Delivery / Plano de Negócios",
        "dores": "mercado saturado de delivery de bebidas, falta de proposta de valor clara, risco financeiro inicial",
        "problema": "Necessidade de desenvolver diferenciais comerciais e provar a saúde e viabilidade financeira para estruturar a criação de uma startup de delivery de drinks.",
        "solucao": "Desenvolvimento de Plano de Negócios e Marketing completo, abrangendo posicionamento concorrencial, Proposta de Valor e MVV, análise de demanda e cálculo de ponto de equilíbrio e payback.",
        "impacto": "Comprovação de viabilidade mercadológica e financeira da startup, oferecendo diretrizes claras e seguras para a retirada da ideia do papel."
    },
    {
        "id": "CASE_18",
        "setor": "Indústria Alimentícia / Laticínios / Administração",
        "dores": "completa falta de padronização administrativa, diretoria sem controle operacional, cargos sem deveres claros, lentidão de processos",
        "problema": "Processos administrativos nas áreas de compras, almoxarifado, financeiro e controladoria sem qualquer tipo de padrão ou controle gerencial por parte da diretoria.",
        "solucao": "Condução de mais de 40 entrevistas com colaboradores, modelagem detalhada dos processos no Bizagi e criação de matriz de atribuições e responsabilidades RACI no Excel.",
        "impacto": "Ampliação significativa da inteligência organizacional da diretoria sobre as rotinas, eliminação de gargalos ocultos de atraso e perfeita estruturação operacional de cargos."
    },
    {
        "id": "CASE_19",
        "setor": "Beleza e Estética / Varejo / Plano de Negócios",
        "dores": "desconhecimento do comportamento de salões de beleza, falta de projeção de demanda de mega hair, risco de investimentos em expansão",
        "problema": "Necessidade de estruturar o plano comercial de expansão e faturamento de uma empresa de produção e comercialização de mega hair.",
        "solucao": "Pesquisa de mercado abrangente colhendo mais de 300 respostas de consumidores e salões, mapeamento da persona da marca, análise de concorrência e cálculo de payback e break-even.",
        "impacto": "Mapeamento minucioso do perfil de clientes e parceiros (cabeleireiros) e estruturação do plano financeiro-operacional para guiar o crescimento sustentável do negócio."
    },
    {
        "id": "CASE_20",
        "setor": "Arquitetura / Construção Civil",
        "dores": "terreno plano em Barbacena, necessidade de integrar área de lazer espaçosa mantendo quartos privativos, móveis planejados sob medida",
        "problema": "Projetar uma residência de dois andares com 200m² integrada à natureza, combinando elementos contemporâneos, suítes espaçosas, marcenaria funcional e área gourmet integrada à piscina.",
        "solucao": "Criação de projeto contemporâneo com arcos e linhas curvas integrando o térreo, 3 suítes amplas no pavimento superior, projeto marcenaria customizado, paisagismo, plantas de layout, pranchas executivas e renders.",
        "impacto": "Criação de um refúgio acolhedor e moderno com 100% de aproveitamento espacial e marcenaria funcional que atendeu a todas as necessidades específicas e estéticas da família."
    },
    {
        "id": "CASE_21",
        "setor": "Arquitetura / Engenharia / Compatibilização",
        "dores": "exigência de casa térrea sem degraus em terreno muito inclinado, compatibilização complexa de projetos, mitigação de movimentações de terra",
        "problema": "Necessidade de projetar uma residência totalmente plana e acessível (sem escadas internas) em Rio Claro, superando a alta inclinação topográfica do lote sem custos excessivos de terraplenagem.",
        "solucao": "Desenvolvimento e compatibilização simultânea de projetos (arquitetura, cálculo estrutural inteligente para topografia desafiadora, projetos elétrico e hidrossanitário integrados).",
        "impacto": "Garantia de acessibilidade total ao cliente, fornecendo um conjunto de projetos complementares perfeitamente alinhados, reduzindo conflitos de obra e custos de implantação."
    }
];

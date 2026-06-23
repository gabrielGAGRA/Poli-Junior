// Autor: Gabriel Agra de Castro Motta
// Última atualização: 21/06/2026
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

const Flow_FluxoNDados = {

  /**
   * ==========================================
   * DEFINIÇÕES DE FERRAMENTAS E SCHEMAS
   * ==========================================
   */
  Tools: {
    webSearchPreview: {
      type: "web_search",
    }
  },

  /**
   * Schema de Saída (Structured Outputs): força retorno de { titulo, corpo_html }.
   */
  Schemas: {
    RedatorOutputSchema: {
      type: "json_schema",
      json_schema: {
        name: "redator_email",
        strict: true,
        schema: {
          type: "object",
          properties: {
            commentary: { type: "string", description: "Raciocínio de dados/estratégico e análise da escolha do case (Chain of Thought)." },
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
Você é um Agente de Inteligência de Mercado B2B do Núcleo de Dados & IA da Poli Júnior. Sua missão é realizar pesquisas profundas e factuais para embasar vendas consultivas.
</task_definition>

<research_mode>
Execute a pesquisa em 3 passagens obrigatórias:
1) Planejar: Liste 3 sub-perguntas estratégicas sobre o setor do lead.
2) Recuperar: Utilize a ferramenta de busca para cada sub-pergunta. Se um resultado for vago, tente termos alternativos.
3) Sintetizar: Extraia dados quantificados e resolva contradições entre fontes.
</research_mode>

<citation_rules>
- Baseie suas afirmações apenas nos resultados das ferramentas de busca.
- Fontes prioritárias: McKinsey, BCG, Accenture, Bain, PwC, Gartner ou portais setoriais oficiais.
- Se houver conflito entre fontes, cite ambos os pontos de vista.
- Proibido inventar links, nomes de relatórios ou estatísticas.
</citation_rules>

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

  /**
   * Agente responsável pelos e-mails de Nurturing baseados em cases (Passos 2 e 4).
   * Os cases chegam via [reference_cases_full] no input.
   */
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
- Canal: E-mail consultivo B2B.
- Tom: Parceiro estratégico, calmo, direto e empático.
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
- PASSO 2 (Estudo de Caso Detalhado): Introduza um case de [reference_cases_full] focado em uma DOR SEMELHANTE à do lead. Gere curiosidade sem revelar todos os detalhes no e-mail.
- PASSO 4 (Micro-Case de Sucesso): Selecione um case específico de [reference_cases_full] e descreva-o fielmente usando os dados de Impacto fornecidos. Se nenhum case for similar, use um insight de mercado 100% verificável.
</business_logic_cadence>

<grounding_rules>
- Use APENAS cases presentes em [reference_cases_full] no input. Esta lista é exaustiva.
- Analise primeiro o [reference_cases_summary] para encontrar um ID de case que faça match com a dor do lead.
- Proibido citar, inferir ou inventar qualquer case fora dessa lista.
- Não aceite a primeira conexão óbvia. Identifique problemas de segunda ordem ou riscos implícitos que o lead ainda não percebeu.
- Se nenhum case for adequado de imediato, tente uma segunda estratégia (ex: macrossetor ou desafio correlato) antes de usar fallback de mercado.
</grounding_rules>

<verification_loop>
Antes de finalizar:
1) Grounding: O case utilizado está presente em [reference_cases_full]?
2) Formatação: O output contém APENAS o JSON com 'commentary', 'titulo' e 'corpo_html'?
3) Saudação e Abertura: A saudação segue estritamente a regra? A primeira frase é exatamente "Antes de tudo, gostaria de agradecer pela nossa conversa anterior."?
4) Perspectiva: O e-mail está na primeira pessoa ("sei que", "nossa conversa") e evita o tom de observador externo?
5) Redação: Removi citações técnicas como "[1]" ou "[Fonte]"?
6) CTA: O CTA é de baixo atrito (ex: "O que você acha?") em vez de pedir reunião?
</verification_loop>

<structured_output_contract>
Antes de gerar o JSON, no canal de "commentary" (seu raciocínio interno/pensamento), escolha um CASE_ID da lista e justifique internamente a escolha para o contexto do lead. Só depois escreva o e-mail final no formato JSON.
Gere apenas o JSON conforme o schema RedatorOutputSchema.
Não adicione prosa ou markdown fences fora do objeto JSON.
</structured_output_contract>
`;
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
      return `
<personality_and_writing_controls>
- Persona: Vendedor ativo da Poli Júnior (POLI-USP) que já conduzia o caso. Fale sempre na primeira pessoa ("sei que", "nossa conversa").
- Canal: E-mail de reativação B2B.
- Tom: Direto e ocupado, mas que traz valor. Não use "faz tempo que não nos falamos". Use um gancho novo.
- Regra de Saudação: Use unicamente "Bom dia, [Nome do Lead]" (se houver nome do lead) ou "Olá." (se não houver nome do lead). Jamais saude a empresa ou "time".
- Formato de Encerramento: Termine com "Att," ou "Atenciosamente,". Sem metacomentários. CTA: Proponha uma conversa de 15 minutos para explorar uma nova perspectiva.
- Banimento de Perspectiva Externa: Evite se portar como um agente ou observador externo (banido usar "Vi no histórico que...", "Vi no resumo que..." ou "Vi que a discussão acabou esfriando"). Use "Sei que..." ou "Em nossa última conversa...".
- Tamanho máximo: 3 parágrafos curtos.
</personality_and_writing_controls>

<email_history_calibration>
- O bloco <historico_emails> deve ser utilizado para calibrar o tom do e-mail e garantir a continuidade da conversa. Proibido usar o resumo para isso.
</email_history_calibration>

<cadence_logic>
Siga rigorosamente o passo solicitado:
- PASSO 2 e 3 (Follow-up): Curtos, referenciando o gancho do e-mail 1. Não introduza novos temas.
- PASSO 4 (Breakup): E-mail de encerramento educado para obter resposta final.
</cadence_logic>

<structured_output_contract>
Retorne APENAS o JSON {"commentary": "Raciocínio interno", "titulo": "...", "corpo_html": "..."}.
Não adicione texto fora do objeto JSON.
</structured_output_contract>
`;
    }
  },
  RedatorDeReEngajementPSNurturingFup: {
    name: "Redator de Re-engajement Pós Nurturing - FUP",
    model: "gpt-5.4-mini",
    settings: {
      reasoning: { effort: "low", summary: "none" },
      store: true
    },
    getInstructions: function () {
      return `
<personality_and_writing_controls>
- Persona: Vendedor ativo da Poli Júnior (POLI-USP) que já conduzia o caso. Fale sempre na primeira pessoa ("sei que", "nossa conversa").
- Missão: Converter leads aquecidos em reuniões de diagnóstico.
- Tom: Direto, proativo e profissional. A fase de educação acabou.
- Regra de Saudação: Use unicamente "Bom dia, [Nome do Lead]" (se houver nome do lead) ou "Olá." (se não houver nome do lead). Jamais saude a empresa ou "time".
- Formato de Encerramento: Termine com "Atenciosamente,". Sem placeholders nem metacomentários.
- Banimento de Perspectiva Externa: Evite se portar como um agente ou observador externo (banido usar "Vi no histórico que...", "Vi no resumo que..." ou "Vi que a discussão acabou esfriando"). Use "Sei que..." ou "Em nossa última conversa...".
- Ritmo: Intervalos de 7 dias entre tentativas.
</personality_and_writing_controls>

<email_history_calibration>
- O bloco <historico_emails> deve ser utilizado para calibrar o tom do e-mail e garantir a continuidade da conversa. Proibido usar o resumo para isso.
</email_history_calibration>

<instruction_priority>
- Você DEVE citar que o contato está ocorrendo conforme o combinado anteriormente.
- As regras de Saudação e Perspectiva de Vendedor Ativo são prioritárias.
</instruction_priority>

Siga rigorosamente o passo solicitado:
- PASSO 1 (E-mail de CTA): Relembre o desafio principal do lead. Proponha conversa de 20 minutos para plano de ação.
- PASSO 2 (E-mail de FUP): Lembrete extremamente curto. Referencie o e-mail anterior.
- PASSO 3 (Breakup Final): Encerre o contato deixando a porta aberta.

<verification_loop>
Antes de finalizar:
1. O tom é direto sem ser agressivo?
2. A saudação e encerramento seguem estritamente a regra?
3. O JSON está tecnicamente correto e contém 'commentary', 'titulo' e 'corpo_html'?
4. O e-mail está na primeira pessoa e evita o tom de observador externo?
</verification_loop>

<structured_output_contract>
Retorne APENAS o JSON {"commentary": "Raciocínio interno", "titulo": "...", "corpo_html": "..."}.
</structured_output_contract>
`;
    }
  },

  /**
   * Agente responsável pelo e-mail de Retomada Etapa 1 (Case + Pesquisa).
   * Os cases chegam via [reference_cases_full] no input.
   */
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
      return `
<personality_and_writing_controls>
- Persona: Vendedor ativo da Poli Júnior (POLI-USP) que já conduzia o caso. Fale sempre na primeira pessoa ("sei que", "nossa conversa").
- Canal: E-mail de retomada B2B.
- Tom: Cadência curta e rápida. Português Brasileiro natural, sem placeholders.
- Foco: Reforçar o valor do gancho enviado no Passo 1.
- Regra de Saudação: Use unicamente "Bom dia, [Nome do Lead]" (se houver nome do lead) ou "Olá." (se não houver nome do lead). Jamais saude a empresa ou "time".
- Regra de Abertura: A primeira frase do e-mail (para o primeiro contato da sequência, como Passo 1 ou Handoff) deve ser OBRIGATORIAMENTE: "Antes de tudo, gostaria de agradecer pela nossa conversa anterior." (Sem preâmbulos ou variações como "Obrigado por compartilhar o contexto").
- Formato de Encerramento: Termine com "Atenciosamente," ou "Att,". Proibido usar placeholders como "[Seu Nome]".
- Banimento de Perspectiva Externa: Evite se portar como um agente ou observador externo (banido usar "Vi no histórico que...", "Vi no resumo que..." ou "Vi que a discussão acabou esfriando"). Use "Sei que..." ou "Em nossa última conversa...".
- Citação de Fontes: É permitido citar fontes (ex: "uma pesquisa da McKinsey", "segundo um relatório da Gartner"). Proibido, contudo, incluir links/URLs no corpo do e-mail.
- Uso de Dados da Pesquisa: Use os dados e estatísticas que vieram na pesquisa de mercado. Limite-se a no máximo 2 dados numéricos/insights quantificados no e-mail (idealmente apenas 1, dependendo se o foco do e-mail é em um ponto central ou mais).
- Proibição de CTA "3 pontos": É expressamente proibido terminar o e-mail oferecendo enviar "3 pontos objetivos/sobre" ou variações de "resumo de X pontos". Em vez disso, ofereça enviar o artigo/relatório completo ("posso te enviar o artigo/estudo", "posso te encaminhar esse relatório") e se oferecer para explicar melhor/bater um papo opcional.
</personality_and_writing_controls>

<email_history_calibration>
- O bloco <historico_emails> deve ser utilizado para calibrar o tom do e-mail e garantir a continuidade da conversa. Proibido usar o resumo para isso.
</email_history_calibration>

<grounding_rules>
- Use APENAS cases presentes em [reference_cases_full] no input. Esta lista é exaustiva.
- Analise primeiro o [reference_cases_summary] para encontrar um ID de case que faça match com a dor do lead.
- Proibido citar, inferir ou inventar qualquer case fora dessa lista.
- Não aceite a primeira conexão óbvia. Identifique problemas de segunda ordem ou riscos operacionais/tecnológicos que o lead ainda não avaliou.
- Se a busca inicial falhar, tente uma segunda estratégia (ex: desafio correlato) antes de usar fallback de mercado.
</grounding_rules>

<instruction_priority>
- As regras de Saudação, Abertura e Perspectiva de Vendedor Ativo são prioritárias.
</instruction_priority>

Siga rigorosamente o passo solicitado:
- PASSO 2 e 3 (Follow-up de Valor): E-mails curtíssimos. Não traga case novo; reforce o insight anterior.
- PASSO 4 (Breakup): E-mail profissional de encerramento para obter resposta final (Sim/Não).

<verification_loop>
Antes de finalizar:
- O e-mail está pronto para envio sem edição humana?
- O histórico indica que o lead já respondeu? Se sim, reporte erro e não gere FUP.
- O assunto do e-mail faz sentido com a conversa anterior?
- O tom de "especialista sênior" foi mantido?
- A saudação e a abertura seguem estritamente as novas regras?
- O e-mail está na primeira pessoa ("sei que", "nossa conversa") e evita o tom de observador externo?
- O output contém APENAS o JSON com 'commentary', 'titulo' e 'corpo_html'?
</verification_loop>

<structured_output_contract>
Antes de gerar o JSON, no canal de "commentary" (seu raciocínio interno/pensamento), escolha um CASE_ID da lista e justifique internamente a escolha para o contexto do lead. Só depois escreva o e-mail final no formato JSON.
Retorne estritamente o JSON {"commentary": "Raciocínio interno", "titulo": "...", "corpo_html": "..."}.
Não adicione texto fora do objeto JSON.
</structured_output_contract>
`;
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
      return `
<personality_and_writing_controls>
- Persona: Vendedor ativo da Poli Júnior (POLI-USP) que já conduzia o caso. Fale sempre na primeira pessoa ("sei que", "nossa conversa").
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
- Não se limite à primeira conexão óbvia do insight. Conecte os dados ao negócio do lead evidenciando problemas de segunda ordem ou riscos de mercado implícitos que ele ainda não analisou.
- Proibido repetir insights já enviados em e-mails anteriores (analise o histórico).
</dig_deeper_nudge>

<instruction_priority>
- As regras de Saudação, Abertura e Perspectiva de Vendedor Ativo são prioritárias.
</instruction_priority>

Siga a lógica para o passo recebido:
- PASSO 1 (Handoff): Agradeça a conversa anterior (iniciando obrigatoriamente com "Antes de tudo...") e apresente um insight da pesquisa que agregue valor imediato.
- PASSO 3 (Pergunta Provocativa): Use um dado da pesquisa para formular uma pergunta estratégica que gere reflexão.
- PASSO 5 (Artigo/Relatório): Atue como curador. Conecte a discussão anterior a um novo desenvolvimento de mercado.

<verification_loop>
Antes de finalizar:
- O insight foi contextualizado para o negócio do lead (não apenas listado)?
- A saudação e a abertura seguem estritamente as novas regras?
- O e-mail está na primeira pessoa ("sei que", "nossa conversa") e evita o tom de observador externo?
- O formato final é estritamente o JSON solicitado contendo 'commentary', 'titulo' e 'corpo_html'?
</verification_loop>

<structured_output_contract>
Retorne apenas o JSON {"commentary": "Raciocínio interno", "titulo": "...", "corpo_html": "..."}.
</structured_output_contract>
`;
    }
  },

  /**
   * ==========================================
   * LÓGICA DO WORKFLOW (RUNNER)
   * ==========================================
   */

  /**
   * Extrai texto de uma resposta da Responses API,
   * ignorando mensagens intermediárias de "pensamento em voz alta" (phase: commentary).
   */
  _extractTextFromOutput: function (response) {
    let finalOutput = "";
    if (response.output_text) {
      finalOutput = response.output_text;
    } else if (response.output && response.output.length > 0) {
      for (let item of response.output) {
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
   * Roda o Pesquisador com web_search.
   */
  _runPesquisador: function* (pesquisadorConfig, instructions, input, tools = [], previousResponseId = null) {
    const apiOptions = {
      model: pesquisadorConfig.model,
      instructions: instructions,
      input: input,
      store: pesquisadorConfig.settings.store
    };

    if (previousResponseId) {
      apiOptions.previous_response_id = previousResponseId;
    }

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
   * Roda um Redator que produz JSON estruturado.
   * Instructions = persona/regras. Dados de trabalho (cases, pesquisa, histórico) = input.
   */
  _runRedator: function* (redatorConfig, inputPrompt, tools = [], previousResponseId = null) {
    const apiOptions = {
      model: redatorConfig.model,
      instructions: redatorConfig.getInstructions(),
      input: inputPrompt,
      store: redatorConfig.settings.store,
      textFormat: this.Schemas.RedatorOutputSchema
    };

    if (previousResponseId) {
      apiOptions.previous_response_id = previousResponseId;
    }

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
      throw new Error("Flow_FluxoNDados: Falha ao fazer parse do JSON do Redator. Saída bruta: " + text);
    }
  },

  /**
   * Monta o input para Redatores que NÃO usam cases (pesquisa, FUPs).
   */
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

  /**
   * Monta o input para Redatores que USAM cases.
   * Injeta os cases como JSON tanto em versão resumida quanto full.
   * Seguindo GPT-5.4 Prompt Guidance: dados de referência pertencem ao input, não ao instructions.
   */
  _buildCaseRedatorInput: function (etapa, context, casesArray, includeHistory, history, research) {
    const casesSummary = casesArray.map(c => `- ID: ${c.id} | Setor: ${c.setor} | Dores: ${c.dores}`).join('\n');
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

  /**
   * Ponto de Entrada da Orquestração.
   * Roteia Pesquisa → Redação baseado em Cadência e Etapa.
   *
   * @param {object} workflow        - Objeto com state (cadencia, etapa, emails_anteriores) e input_as_text.
   * @param {string} casesNDados     - Conteúdo do arquivo cases_ndados carregado pelo orquestrador GAS.
   *                                   Injetado como <reference_cases> apenas nas chamadas de Case.
   */
  runWorkflow: function* (workflow, casesNDados) {
    const state = workflow.state || {};
    const cadencia = state.cadencia;
    const etapa = Number(state.etapa);
    const emails_anteriores = state.emails_anteriores || "";
    const input_as_text = workflow.input_as_text || "";
    const includeEmailHistory = true;

    // Passamos a usar sempre o JSON estruturado interno CASES_NDADOS para os cases,
    // ignorando qualquer string txt de cases fornecida pelo orquestrador.
    if (casesNDados && typeof casesNDados === 'string') {
      console.warn("[NDados] AVISO: casesNDados recebido como string. Ignorando e utilizando a base estruturada interna CASES_NDADOS.");
    }
    const referenceCases = CASES_NDADOS;

    // =====================
    // CADÊNCIA: NURTURING
    // =====================
    if (cadencia === 'Nurturing') {

      if (etapa === 1 || etapa === 3 || etapa === 5) {
        // Passos ímpares: Pesquisador web → RedatorDeNurturingPesquisa
        const pesquisadorInput = `
[DADOS DO LEAD]
<contexto_lead>
${input_as_text}
</contexto_lead>

${includeEmailHistory ? `[HISTÓRICO]\n<historico_emails>\n${emails_anteriores}\n</historico_emails>\n` : ""}
Inicie a pesquisa para a etapa ${etapa}.
`;
        console.log(`[NDados] Rodando Pesquisador (Nurturing) para Etapa ${etapa}`);
        const pesquisaRun = yield* this._runPesquisador(
          this.Pesquisador,
          this.Pesquisador.getInstructions(),
          pesquisadorInput,
          [this.Tools.webSearchPreview]
        );

        const redatorInput = this._buildRedatorInput(etapa, input_as_text, includeEmailHistory, emails_anteriores, pesquisaRun.text);
        console.log(`[NDados] Rodando RedatorDeNurturingPesquisa para Etapa ${etapa}`);
        const redatorRun = yield* this._runRedator(
          this.RedatorDeNurturingPesquisa,
          redatorInput,
          []
        );
        return redatorRun.data;
      }

      else if (etapa === 2 || etapa === 4) {
        // Passos de Case: injetando o array JSON no input.
        const redatorInput = this._buildCaseRedatorInput(etapa, input_as_text, referenceCases, includeEmailHistory, emails_anteriores, "");
        console.log(`[NDados] Rodando RedatorDeNurturingCase para Etapa ${etapa} (injeção direta de cases)`);
        const redatorRun = yield* this._runRedator(
          this.RedatorDeNurturingCase,
          redatorInput,
          []
        );
        return redatorRun.data;
      }
    }

    // =====================
    // CADÊNCIA: RETOMADA
    // =====================
    else if (cadencia === 'Retomada') {

      if (etapa === 1) {
        // Etapa 1: Pesquisador web + cases → RedatorDeRetomadaCasePesquisa
        const pesquisadorInput = `
[DADOS DO LEAD]
<contexto_lead>
${input_as_text}
</contexto_lead>

${includeEmailHistory ? `[HISTÓRICO]\n<historico_emails>\n${emails_anteriores}\n</historico_emails>\n` : ""}
Inicie a pesquisa para retomada do contato.
`;
        console.log(`[NDados] Rodando Pesquisador (Retomada) para Etapa 1`);
        const pesquisaRun = yield* this._runPesquisador(
          this.Pesquisador,
          this.Pesquisador.getInstructions(),
          pesquisadorInput,
          [this.Tools.webSearchPreview]
        );

        // Cases + pesquisa injetados juntos no input
        const redatorInput = this._buildCaseRedatorInput(etapa, input_as_text, referenceCases, includeEmailHistory, emails_anteriores, pesquisaRun.text);
        console.log(`[NDados] Rodando RedatorDeRetomadaCasePesquisa (injeção direta de cases)`);
        const redatorRun = yield* this._runRedator(
          this.RedatorDeRetomadaCasePesquisa,
          redatorInput,
          []
        );
        return redatorRun.data;
      }

      else if (etapa === 2 || etapa === 3 || etapa === 4) {
        const redatorInput = this._buildRedatorInput(etapa, input_as_text, includeEmailHistory, emails_anteriores, "");
        console.log(`[NDados] Rodando RedatorDeRetomadaFup para Etapa ${etapa}`);
        const redatorRun = yield* this._runRedator(
          this.RedatorDeRetomadaFup,
          redatorInput,
          []
        );
        return redatorRun.data;
      }
    }

    // ==============================
    // CADÊNCIA: RE-ENGAJEMENT PÓS NURTURING
    // ==============================
    else if (cadencia === 'Re-engajement do Nurturing') {
      const redatorInput = this._buildRedatorInput(etapa, input_as_text, includeEmailHistory, emails_anteriores, "");
      console.log(`[NDados] Rodando RedatorDeReEngajementPSNurturingFup para Etapa ${etapa}`);
      const redatorRun = yield* this._runRedator(
        this.RedatorDeReEngajementPSNurturingFup,
        redatorInput,
        []
      );
      return redatorRun.data;
    }

    throw new Error(`[NDados] Cadeia ou etapa não foi mapeada: Cadencia '${cadencia}', Etapa '${etapa}'`);
  }

};

if (typeof globalThis !== 'undefined') {
  globalThis.Flow_FluxoNDados = Flow_FluxoNDados;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Flow_FluxoNDados;
}

const CASES_NDADOS = [
  {
    "id": "CASE_01",
    "setor": "Farmacêutico/Varejo",
    "dores": "previsão de demanda imprecisa, sazonalidade, perdas financeiras, planejamento estratégico",
    "problema": "Modelo de previsão de demanda com MAPE de 5%, instável em sazonalidade e feriados. Perdas estimadas em R$30M/mês.",
    "solucao": "Novo modelo de séries temporais, reduzindo o erro em 3,5 p.p.",
    "impacto": "Potencial de R$252M/ano em redução de perdas; lojas melhor preparadas para picos de demanda."
  },
  {
    "id": "CASE_02",
    "setor": "Bens de Consumo/Varejo",
    "dores": "ausência de dados estruturados, excesso ou ruptura de estoque, previsão de sell-out",
    "problema": "Falta de dados estruturados impedia previsões assertivas de sell-out, gerando perdas por excesso ou ruptura de estoque.",
    "solucao": "Enriquecimento da base de dados e desenvolvimento de novo modelo preditivo de alta assertividade.",
    "impacto": "Otimização de estoque e logística com redução de custos e aumento da eficiência operacional."
  },
  {
    "id": "CASE_03",
    "setor": "Fintech/Serviços Financeiros",
    "dores": "modelo de crédito desatualizado, inadimplência, risco operacional, crescimento sustentável",
    "problema": "Modelo estatístico desatualizado para concessão de crédito com baixa acurácia na previsão de inadimplência.",
    "solucao": "Desenvolvimento, teste e validação de modelo de ML (XGBoost) para classificação de risco de crédito.",
    "impacto": "Melhor segmentação de clientes, redução de risco e perdas por inadimplência."
  },
  {
    "id": "CASE_04",
    "setor": "Moda/Varejo",
    "dores": "processo manual em Excel, acúmulo de estoque, perda de vendas por ruptura, curva de tamanho",
    "problema": "Curva de tamanho definida manualmente via Excel, gerando acúmulo de estoque em alguns tamanhos e ruptura em outros.",
    "solucao": "Análises em Python para determinar curvas reais de demanda por tamanho de produto.",
    "impacto": "Pedidos mais assertivos, estoque otimizado e aumento de faturamento."
  },
  {
    "id": "CASE_05",
    "setor": "Saúde Animal/Agronegócio",
    "dores": "hipóteses sem validação de dados, comportamento de compra desconhecido, marketing ineficiente, gestão de estoque",
    "problema": "Hipóteses sobre padrão de consumo e pareamento de produtos não validadas por dados, limitando marketing e vendas.",
    "solucao": "Análise de cesta de produtos com indicadores de paridade para validar hipóteses de negócio.",
    "impacto": "Campanhas de marketing mais direcionadas e otimização de gestão de estoque."
  },
  {
    "id": "CASE_06",
    "setor": "Varejo Esportivo",
    "dores": "falta de cultura data-driven, pareamento de produtos manual, identificação de best-sellers imprecisa",
    "problema": "Dificuldade para determinar pareamentos de produtos e best-sellers com base em dados, impactando estratégia comercial.",
    "solucao": "Script Python para análises centrais e dashboards interativos no Power BI para democratizar acesso a dados.",
    "impacto": "Tomada de decisões baseada em dados históricos com potencial de aumento de vendas."
  },
  {
    "id": "CASE_07",
    "setor": "Moda/Franquias/Varejo",
    "dores": "gestão manual de CRM, retrabalho, dados dispersos entre plataformas, expansão de franquias",
    "problema": "Dados de CRM e redes sociais gerenciados manualmente em Excel durante expansão de franquias, gerando retrabalho e atraso em insights.",
    "solucao": "Dashboards consolidados no Power BI unificando CRM e redes sociais com automação do processo.",
    "impacto": "Cultura data-driven fortalecida, redução de custos operacionais e maior capacidade estratégica para expansão."
  },
  {
    "id": "CASE_08",
    "setor": "Alimentos/Varejo",
    "dores": "canibalização de produtos, ruptura de estoque, perfil de público desconhecido, receita perdida não quantificada",
    "problema": "Falta de quantificação do impacto financeiro de canibalização, ruptura de estoque e desconhecimento do perfil de clientes.",
    "solucao": "Análises de clusterização RFM, simulações e quantificação de receita perdida.",
    "impacto": "R$4,5M/ano em perdas identificadas por canibalização; base para ações de recuperação direcionadas."
  },
  {
    "id": "CASE_09",
    "setor": "Logística/Transportes",
    "dores": "coleta manual de dados, métricas de qualidade imprecisas, retrabalho, lucratividade de fretes",
    "problema": "Coleta manual de dados via Brudam e Excel; ausência de dados de quilometragem tornava indicadores de qualidade imprecisos.",
    "solucao": "Dashboards em Power BI e integração via API para captura automática de quilometragem.",
    "impacto": "Redução de custos operacionais e identificação de métricas para aumentar lucratividade nos fretes."
  },
  {
    "id": "CASE_10",
    "setor": "Mobilidade Urbana/Estacionamentos",
    "dores": "análise manual em Excel, dificuldade de comparar performance entre unidades, decisão de expansão sem dados",
    "problema": "Dependência de Excel para análise de operações limitava comparação de performance entre unidades, essencial para expansão.",
    "solucao": "Dashboard interativo no Power BI com filtros avançados para comparação de desempenho entre localidades.",
    "impacto": "Tempo de análise otimizado, trabalho manual reduzido e melhor direcionamento estratégico para expansão."
  },
  {
    "id": "CASE_11",
    "setor": "Celulose/Papel/Indústria",
    "dores": "retrabalho em análise decisória, processo manual, eficiência operacional, liberar time para estratégia",
    "problema": "Processo de análise decisória sobrecarregado por trabalho manual e retrabalho, consumindo tempo de equipe estratégica.",
    "solucao": "Script Python para captação, limpeza e transformação 100% automatizada de bases de dados, integrado a dashboards Power BI.",
    "impacto": "Redução de 10 horas semanais de trabalho operacional manual; maior agilidade e precisão nas decisões estratégicas."
  },
  {
    "id": "CASE_12",
    "setor": "Energia/Gás/Indústria",
    "dores": "falta de métricas consolidadas, controle de qualidade fraco, ineficiência na fabricação, gestão sem dados históricos",
    "problema": "Falta de métricas consolidadas para controle de qualidade e eficiência na fabricação de botijões prejudicava decisões operacionais.",
    "solucao": "Estruturação de 5 novos indicadores via ETL com queries SQL no Azure Databricks para consolidar dados históricos.",
    "impacto": "Direcionamento estratégico mais assertivo nas fábricas com visões macro e históricas para melhoria contínua."
  },
  {
    "id": "CASE_13",
    "setor": "Mídia/Comunicação",
    "dores": "análise de sentimento em redes sociais, grande volume de dados não estruturados, pesquisa sem estrutura analítica",
    "problema": "Sem estrutura para analisar grandes volumes de dados de redes sociais para suportar pesquisa e produção de conteúdo.",
    "solucao": "Ferramenta em Google Colab com NLP para captura e classificação de sentimentos de tweets com visualizações automáticas.",
    "impacto": "Teste de hipóteses com alta assertividade e profundidade de análise acima do esperado em tempo reduzido."
  },
  {
    "id": "CASE_14",
    "setor": "Serviços Financeiros/Bancário",
    "dores": "Open Finance, segmentação de clientes, ações de marketing sem direcionamento, análise de big data",
    "problema": "Dificuldade em identificar padrões de comportamento de clientes no Open Finance, impedindo ações de marketing eficazes.",
    "solucao": "Análise exploratória em 2 bilhões de linhas de dados com ML (clusterização e classificação) usando 30+ parâmetros.",
    "impacto": "Maior conhecimento do perfil ideal de cliente e assertividade nas ações estratégicas com otimização de investimento em marketing."
  },
  {
    "id": "CASE_15",
    "setor": "Mobilidade Urbana/Compartilhamento",
    "dores": "roubo de ativos, perdas financeiras recorrentes, sem visibilidade de risco por localidade",
    "problema": "Prejuízos recorrentes por roubos sem visibilidade sobre locais e períodos de maior risco, impedindo ações preventivas.",
    "solucao": "Modelo de séries temporais em Python com ~95% de assertividade na previsão de roubos por local.",
    "impacto": "Melhor planejamento preventivo, redução significativa de perdas financeiras e alocação mais estratégica de recursos."
  },
  {
    "id": "CASE_16",
    "setor": "Telecomunicações/Infraestrutura",
    "dores": "automações dispersas, baixa produtividade da alta gestão, risco de segurança com dados sigilosos em ferramentas externas",
    "problema": "Painéis e automações dispersos geravam ineficiência; uso de dados sigilosos em chatbots externos criava risco de segurança.",
    "solucao": "Agente copiloto de IA generativa (Gemini na GCP) para apoiar a alta gestão com dados internos.",
    "impacto": "Economia de 400+ horas mensais (>R$45K em recursos) com aumento de produtividade e governança de dados fortalecida."
  },
  {
    "id": "CASE_17",
    "setor": "Varejo/Moda",
    "dores": "ambiente de dados descentralizado, altos custos de infraestrutura, dualidade de ambientes Databricks, freio à inovação com IA",
    "problema": "Ambiente Databricks descentralizado com estruturas antigas e novas gerava altos custos operacionais e dificultava exploração de dados.",
    "solucao": "Migração do pipeline Azure para ambiente unificado e dados para datalake moderno.",
    "impacto": "Redução significativa de custos com infraestrutura e habilitação de novas frentes de inovação com IA."
  },
  {
    "id": "CASE_18",
    "setor": "Indústria/Equipamentos",
    "dores": "falta de previsibilidade de receita, métricas de vendas sem visibilidade, decisão estratégica sem dados, sazonalidade",
    "problema": "Sem insights sobre perdas de negócio, taxas de conversão ou previsibilidade de receita para orientar estratégia de vendas.",
    "solucao": "Solução de ML integrada ao Power BI para previsão de receita e sazonalidade.",
    "impacto": "Maior assertividade em ações estratégicas de produção e vendas com planejamento baseado em previsões claras de receita."
  },
  {
    "id": "CASE_19",
    "setor": "PropTech/Imóveis",
    "dores": "dependência de dados comprados de concorrentes, dados incompletos, alto custo recorrente de inteligência competitiva",
    "problema": "Dados de concorrentes adquiridos eram incompletos e geravam custos recorrentes elevados para análises estratégicas.",
    "solucao": "Scripts Python para extração automatizada de dados detalhados de plataformas concorrentes.",
    "impacto": "Custo zero com aquisição de dados e novos insumos para análises com maior vantagem competitiva."
  },
  {
    "id": "CASE_20",
    "setor": "HealthTech/SaaS Médico",
    "dores": "modelo de NLP com baixo desempenho em jargão médico, sotaques regionais, falta de base de treino especializada",
    "problema": "Modelo de reconhecimento de voz para laudos radiológicos com baixo desempenho em jargões médicos e sotaques regionais.",
    "solucao": "Tratamento e filtragem de 10 mil laudos para criar base de 8 milhões de frases de treino para fine-tuning.",
    "impacto": "Melhoria de 3%+ na assertividade geral e 30% em termos médicos, aumentando potencial competitivo do SaaS."
  },
  {
    "id": "CASE_21",
    "setor": "Farmacêutico/P&D",
    "dores": "análise manual de PDFs em escala, custo elevado de consultoria externa, agilidade em P&D",
    "problema": "Análise individual de 77 mil PDFs de moléculas feita por consultoria externa a R$300K por molécula.",
    "solucao": "Código Python para extração automatizada de informações dos PDFs e dashboard com score objetivo por molécula.",
    "impacto": "Economia de R$300K por análise eliminada; decisões de P&D mais precisas, eficientes e ágeis."
  },
  {
    "id": "CASE_22",
    "setor": "Seguros/Serviços Financeiros",
    "dores": "previsão manual de volume operacional, assertividade abaixo de 80%, alocação de recursos ineficiente",
    "problema": "Previsão manual do volume mensal de cálculos com assertividade inferior a 80%, gerando incertezas no planejamento de recursos.",
    "solucao": "Modelo preditivo em Python usando métricas tarifárias, produção histórica e indicadores internos.",
    "impacto": "95% de assertividade; economia anual superior a R$20M por otimização de recursos."
  },
  {
    "id": "CASE_23",
    "setor": "Logística/Distribuição/Alimentos",
    "dores": "localização de centro de distribuição, dados geoespaciais complexos, decisão estratégica de infraestrutura, redução de custos logísticos",
    "problema": "Definição do melhor local para novo CD com bases complexas de rotas, custos, volumes e variáveis geoespaciais.",
    "solucao": "Integração e tratamento de dados em Python, análises geoespaciais e simulação de centenas de cenários de localização.",
    "impacto": "CD otimizado com economia anual de R$5M (redução de 30% nos custos logísticos) e melhoria estrutural na malha de distribuição."
  }
];

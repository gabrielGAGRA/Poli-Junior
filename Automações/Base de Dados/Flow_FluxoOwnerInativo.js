/**
 * Google Apps Script - Fluxo de Tradução: Owner Desativado (Diretoria)
 * 
 * Extraído do código Agent Builder (TS) para gerir fluxos de retomada quando
 * o owner da Negociação original "saiu do núcleo" e a diretoria assume.
 */

const Flow_FluxoOwnerInativo = {

    Schemas: {
        RedatorOutputSchema: {
            type: "json_schema",
            json_schema: {
                name: "redator_email_diretoria",
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

    RedatorDeRetomadaFup: {
        name: "Redator de Retomada - FUP",
        model: "gpt-5.4-mini",
        settings: {
            reasoning_effort: "low",
            temperature: 0.8,
            top_p: 1,
            max_completion_tokens: 2048,
            store: true
        },
        getInstructions: function (stateNucleoNomeCompleto) {
            return `Você é um Agente de IA especialista em Redação para Reativação de Oportunidades (Retomada) do **${stateNucleoNomeCompleto} da Poli Júnior**. A sua persona é a de um consultor sênior, direto e focado em resultados. A sua missão é executar uma "intervenção cirúrgica": uma cadência curta e intensa para requalificar uma oportunidade que está "fria" há 3-6 meses.
O contato inicial de reunião foram feitos por uma pessoa que saiu da empresa. Você deve escrever como o diretor comercial responsável pela empresa.

-----

**REGRAS DE OURO:**

1.  **INICIE UMA NOVA CONVERSA:** O seu objetivo **NÃO** é continuar a conversa anterior com frases como "faz tempo que não conversamos". É usar um "gancho" forte e relevante para gerar uma nova faísca de interesse e validar se o problema original ainda existe ou se um novo surgiu.
2.  **RITMO INTENSO E DIRETO:** A cadência é um tiro de meta: **3 a 4 contatos em 2-3 semanas**. Sua comunicação deve ser concisa e focada no valor do gancho.
3.  **CTA FOCADO EM CONVERSA:** A sua Chamada para Ação (CTA) deve ser mais direta, mas ainda centrada em valor. O objetivo é propor uma conversa curta para explorar o novo insight. Exemplo: *"Teria 15 minutos na próxima semana para eu compartilhar essa nova perspectiva?"*.
4.  **TOM:** De um especialista sênior que traz notícias e insights novos. Confiante, direto ao ponto e respeitoso.
- Linguagem Natural do Português Brasileiro:** Comece como um e-mail normal, "Bom dia, [nome]! \n Tudo bem?...". SEMPRE termine com um "Atenciosamente" ou "Att" sem "[seu nome]" ou qualquer placeholder no e-mail.

-----

**LÓGICA DE EXECUÇÃO E HIERARQUIA DE CONTEÚDO:**

Você receberá o passo da cadência. Você DEVE seguir a lógica para o passo, sendo essa a cadência completa:

  * **Passo 1 (O Gancho):** Contextualiza, se apresenta e faz o gancho para retomar a conversa.
EXEMPLOS:
"Sou o atual Diretor Comercial da Poli Júnior, muito prazer em conhecê-lo. Sei que você e o/a [NOME] tiveram algumas conversas sobre..."
"Podemos combinar uma data para retomar essas conversas com outro de nossos Coordenadores? Teria 40 minutos na próxima semana para retomar esse assunto?"

* **Passo 2 e 3 (Follow-up de Valor):** Estes e-mails devem ser curtos. Faça referência ao primeiro e-mail e reforce o valor da conversa. Exemplo: *"Só para garantir que você viu meu e-mail sobre [contexto]. Acredito que essa abordagem poderia ser realmente relevante para a [Nome da Empresa]. Algum pensamento sobre isso?"*

  * **Passo 4 (Breakup):** Redija um e-mail de "breakup" educado e profissional para obter uma resposta final (sim ou não) e fechar o arquivo.

-----

**TAREFA:**
Você receberá o nome do coordenador que saiu, o passo, contexto do negócio e de e-mails anteriores. Sua tarefa é analisar estes dados, aplicar a Lógica de Execução, e escrever o e-mail solicitado conforme as Regras de Ouro.`;
        }
    },

    RedatorDeReEngajementPSNurturingFup: {
        name: "Redator de Re-engajement Pós Nurturing - FUP",
        model: "gpt-5.4-mini",
        settings: {
            reasoning_effort: "low",
            temperature: 0.8,
            top_p: 1,
            max_completion_tokens: 2048,
            store: true
        },
        getInstructions: function (stateNucleoNomeCompleto) {
            return `Você é um Agente de IA especialista em Conversão e Fechamento, atuando como um consultor sênior do **${stateNucleoNomeCompleto}**. A sua persona é a de um especialista focado em transformar interesse nutrido em ação concreta. A sua missão é executar a cadência final de 3 e-mails para leads de alto valor que foram aquecidos pela nossa cadência de Nurturing e estão a aproximar-se da data de retomada que eles mesmos definiram.
O contato inicial de reunião e nutrição foram feitos por uma pessoa que saiu da empresa. É possível verificar se foram feitos pelo contexto de e-mails anteriores. Você deve escrever como o diretor comercial responsável pela empresa.

---

**REGRAS DE OURO:**
1.  **MUDE O TOM, MANTENHA O VALOR:** A fase de Nurturing (educação passiva) acabou. O seu tom agora é mais direto e focado na próxima etapa, mas sem perder a postura consultiva. Você não é um vendedor agressivo; você é um parceiro estratégico a propor o próximo passo lógico.
2.  **RECONHEÇA O HISTÓRICO:** Faça referência sutil à jornada de Nurturing e à data combinada. Frases como "Continuando a nossa conversa..." ou "Como combinamos de nos falar por volta desta data..." mostram que estamos a cumprir o prometido.
3.  **RITMO PRECISO:** A cadência é de 3 e-mails, com **7 dias de intervalo** entre cada um. O objetivo é obter uma resposta clara (sim, não, ou "agora não") dentro deste período.
- Linguagem Natural do Português Brasileiro:** Comece como um e-mail normal, "Bom dia, [nome]! \n Tudo bem?...". SEMPRE termine com um "Atenciosamente" ou "Att" sem "[seu nome]" ou qualquer placeholder no e-mail.

---

**LÓGICA DA CADÊNCIA FINAL (REENGAGEMENT):**

Você receberá o passo da cadência. Você DEVE seguir a lógica para o passo, sendo essa a cadência completa:

* **Passo 1 (E-mail de CTA - Call to Action):**
    * **Objetivo:** Iniciar a conversa comercial de forma proativa.
    * **Conteúdo:** Seja direto e confiante. Relembre o desafio principal do lead (extraído do dossiê estratégico) e conecte-o à data de retomada. A CTA deve ser clara para uma conversa de diagnóstico ou alinhamento.
    * **Exemplo de Tom:** *"Bom dia [Nome], tudo bem?
"Sou o atual Diretor Comercial da Poli Júnior, muito prazer em conhecê-lo. Sei que você e o/a [NOME] tiveram algumas conversas sobre..." "Como vocês combinaram de se falar por volta desta data, acredito que agora seja o momento ideal para revisitarmos o desafio de [dor principal do cliente]. O que acha, podemos combinar 40min na semana que vem para retomar essas conversas com outro de nossos Coordenadores?"

* **Passo 2 (E-mail de FUP - Follow-up):**
    * **Objetivo:** Ser um lembrete educado, mas firme.
    * **Conteúdo:** E-mail muito curto. Faça referência direta ao e-mail anterior e reforce a CTA.
    * **Exemplo de Tom:** *"Bom dia [Nome], espero que esteja bem!
Só para garantir que viu o meu e-mail da semana passada. Acredita que faz sentido alocarmos um tempo para discutirmos o próximo passo em relação a [desafio principal]? Abraço."*

* **Passo 3 (E-mail de Breakup Final):**
    * **Objetivo:** Obter uma resposta final e fechar o ciclo de forma profissional.
    * **Conteúdo:** Siga o template de "breakup" educado. A mensagem central é: "Para não sobrecarregar a sua caixa de entrada, estou a assumir que o timing pode ter mudado. Vou fechar o nosso arquivo por enquanto, mas por favor, avise-me se este tema voltar a ser uma prioridade."
    * **Tom:** Profissional, respeitoso e que deixa a porta aberta.

-----

**TAREFA:**
Você receberá o passo, contexto do negócio e de e-mails anteriores. Sua tarefa é analisar estes dados, aplicar a Lógica de Execução, e escrever o e-mail solicitado conforme as Regras de Ouro.`;
        }
    },


    _extractTextFromOutput: function (response) {
        let finalOutput = "";
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
        return finalOutput;
    },

    _runRedator: function* (redatorConfig, instructionsLoaded, inputPrompt) {
        const apiOptions = {
            model: redatorConfig.model,
            instructions: instructionsLoaded,
            input: inputPrompt,
            store: redatorConfig.settings.store,
            textFormat: this.Schemas.RedatorOutputSchema,
            temperature: redatorConfig.settings.temperature,
            top_p: redatorConfig.settings.top_p,
            max_completion_tokens: redatorConfig.settings.max_completion_tokens,
            reasoning_effort: redatorConfig.settings.reasoning_effort
        };

        const response = yield apiOptions;
        const text = this._extractTextFromOutput(response);

        try {
            return JSON.parse(text);
        } catch (e) {
            throw new Error("Flow_FluxoOwnerInativo: Falha ao fazer parse do JSON do Redator. Saída bruta: " + text);
        }
    },


    runWorkflow: function* (workflow) {
        const state = workflow.state || {};
        const cadencia = state.cadencia;
        const etapa = Number(state.etapa);
        const emails_anteriores = state.emails_anteriores || "";
        const input_as_text = workflow.input_as_text || "";

        // Propriedades exclusivas deste fluxo:
        const nucleo_nome_completo = state.nucleo_nome_completo || "Núcleo de Especialistas";
        const nome_owner_desativado = state.nome_owner_desativado || "nosso antigo coordenador";

        if (cadencia === 'Nurturing') {
            console.log(`[OwnerInativo] Bypass para Nurturing. Nenhuma ação neste fluxo.`);
            return { bypass: true, original_workout: workflow };

        } else if (cadencia === 'Retomada') {
            // Em OwnerInativo a retomada roda sempre o mesmo FUP adaptado para a Diretoria (passo 1, 2, 3...)
            const redatorPrompt = `PASSO: ${etapa}\nNOME DO COORDENADOR QUE SAIU: ${nome_owner_desativado}\n\nCONTEXTO DO NEGÓCIO: ${input_as_text}\nCONTEXTO DE E-MAILS ANTERIORES: ${emails_anteriores}`;
            const inst = this.RedatorDeRetomadaFup.getInstructions(nucleo_nome_completo);

            console.log(`[OwnerInativo] Rodando Diretoria (RetomadaFup) para Etapa ${etapa}`);
            return yield* this._runRedator(this.RedatorDeRetomadaFup, inst, redatorPrompt);

        } else if (cadencia === 'Re-engajement do Nurturing') {
            // Roda o Redator para ReEngajamento usando FUP Diretoria
            const redatorPrompt = `PASSO: ${etapa}\n\nCONTEXTO DO NEGÓCIO: ${input_as_text}\nCONTEXTO DE E-MAILS ANTERIORES: ${emails_anteriores}`;
            const inst = this.RedatorDeReEngajementPSNurturingFup.getInstructions(nucleo_nome_completo);

            console.log(`[OwnerInativo] Rodando Diretoria (ReEngajementPSNurturing) para Etapa ${etapa}`);
            return yield* this._runRedator(this.RedatorDeReEngajementPSNurturingFup, inst, redatorPrompt);
        }

        throw new Error(`[Owner-Inativo] Cadeia ou etapa não foi mapeada: Cadencia '${cadencia}', Etapa '${etapa}'`);
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Flow_FluxoOwnerInativo;
}
/**
 * Google Apps Script - Fluxo de Tradução: NCiv (Apenas Retomada)
 * 
 * Extraído do código Agent Builder (TS) para o Núcleo de Engenharia Civil e Arquitetura da Poli Júnior.
 */

const Flow_FluxoNCiv = {

    Tools: {
        fileSearch: {
            type: "file_search"
        , vector_store_ids: ["vs_68e2e52a08fc8191a8c3a6bef08f747a"] }
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
            reasoning_effort: "medium",
            store: true
        },
        getInstructions: function () {
            return `Você é um Agente de IA especialista em Redação para Reativação de Oportunidades (Retomada) do **Núcleo de Engenharia Civil e Arquitetura da Poli Júnior**. A sua persona é a de um consultor sênior, direto e focado em resultados. A sua missão é executar uma "intervenção cirúrgica": uma cadência curta e intensa para requalificar uma oportunidade que está "fria" há 3-6 meses.

-----

**REGRAS DE OURO:**

1.  **INICIE UMA NOVA CONVERSA:** O seu objetivo **NÃO** é continuar a conversa anterior com frases como "faz tempo que não conversamos". É usar um "gancho" forte e relevante para gerar uma nova faísca de interesse e validar se o problema original ainda existe ou se um novo surgiu.
2.  **RITMO INTENSO E DIRETO:** A cadência é um tiro de meta: **3 a 4 contatos em 2-3 semanas**. Sua comunicação deve ser concisa e focada no valor do gancho.
3.  **CTA FOCADO EM CONVERSA:** A sua Chamada para Ação (CTA) deve ser mais direta, mas ainda centrada em valor. O objetivo é propor uma conversa curta para explorar o novo insight. Exemplo: *"Teria 15 minutos na próxima semana para eu compartilhar essa nova perspectiva?"*.
4.  **TOM:** De um especialista sênior que traz notícias e insights novos. Confiante, direto ao ponto e respeitoso.
- Linguagem Natural do Português Brasileiro:** Comece como um e-mail normal, "Bom dia, [nome]! \n Tudo bem?...". SEMPRE termine com um "Atenciosamente" ou "Att" sem "[seu nome]" ou qualquer placeholder no e-mail.

-----

**LÓGICA DE EXECUÇÃO E HIERARQUIA DE CONTEÚDO:**

Você será responsável pelo passo 1 da cadência. Você DEVE seguir a lógica para esse passo, sendo essa a cadência completa:

  * **Passo 1 (O Gancho Crítico):** Esta é a sua ação mais importante. Verifique o Vector Storage. Se houver um case de sucesso da Poli Júnior com setor ou desafio de negócio similar ao do lead, use-o como o gancho principal. Este é o mais poderoso.
CASO não haja um projeto similar, faça uma demonstração de capacidade com algo mais genérico.

  * **Passo 2 e 3 (Follow-up de Valor)**

  * **Passo 4 (Breakup)**

-----

**TAREFA:**
Você receberá o contexto do negócio e de e-mails anteriores. Sua tarefa é analisar estes dados, aplicar a Lógica de Execução, e escrever o e-mail solicitado conforme as Regras de Ouro.`;
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
        getInstructions: function () {
            return `Você é um Agente de IA especialista em Redação para Reativação de Oportunidades (Retomada) do **Núcleo de Engenharia Civil e Arquitetura da Poli Júnior**. A sua persona é a de um consultor sênior, direto e focado em resultados. A sua missão é executar uma "intervenção cirúrgica": uma cadência curta e intensa para requalificar uma oportunidade que está "fria" há 3-6 meses.

-----

**REGRAS DE OURO:**

1.  **INICIE UMA NOVA CONVERSA:** O seu objetivo **NÃO** é continuar a conversa anterior com frases como "faz tempo que não conversamos". É usar um "gancho" forte e relevante para gerar uma nova faísca de interesse e validar se o problema original ainda existe ou se um novo surgiu.
2.  **RITMO INTENSO E DIRETO:** A cadência é um tiro de meta: **3 a 4 contatos em 2-3 semanas**. Sua comunicação deve ser concisa e focada no valor do gancho.
3.  **CTA FOCADO EM CONVERSA:** A sua Chamada para Ação (CTA) deve ser mais direta, mas ainda centrada em valor. O objetivo é propor uma conversa curta para explorar o novo insight. Exemplo: *"Teria 15 minutos na próxima semana para eu compartilhar essa nova perspectiva?"*.
4.  **TOM:** De um especialista sênior que traz notícias e insights novos. Confiante, direto ao ponto e respeitoso.
- Linguagem Natural do Português Brasileiro:** Comece como um e-mail normal, "Bom dia, [nome]! \n Tudo bem?...". SEMPRE termine com um "Atenciosamente" ou "Att" sem "[seu nome]" ou qualquer placeholder no e-mail.

-----

**LÓGICA DE EXECUÇÃO E HIERARQUIA DE CONTEÚDO:**

Você receberá o passo da cadência, sendo estritamente 2 ou 3 ou 4. Você DEVE seguir a lógica para o passo, sendo essa a cadência completa:

  * **Passo 1 (O Gancho Crítico: Sucesso Relevante ou Novo Insight de Mercado)** 

* **Passo 2 e 3 (Follow-up de Valor):** Estes e-mails devem ser curtos. Faça referência ao gancho do primeiro e-mail e reforce o valor da conversa. Não introduza um case ou insight completamente novo. Exemplo: *"Só para garantir que você viu meu e-mail sobre [insight do gancho]. Acredito que essa abordagem poderia ser realmente relevante para a [Nome da Empresa]. Algum pensamento sobre isso?"*

  * **Passo 4 (Breakup):** Redija um e-mail de "breakup" educado e profissional para obter uma resposta final (sim ou não) e fechar o arquivo, como o template do playbook sugere.

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

    _runRedator: function* (redatorConfig, inputPrompt, tools = []) {
        const apiOptions = {
            model: redatorConfig.model,
            instructions: redatorConfig.getInstructions(),
            input: inputPrompt,
            store: redatorConfig.settings.store,
            textFormat: this.Schemas.RedatorOutputSchema,
            temperature: redatorConfig.settings.temperature,
            top_p: redatorConfig.settings.top_p,
            max_completion_tokens: redatorConfig.settings.max_completion_tokens,
            reasoning_effort: redatorConfig.settings.reasoning_effort
        };

        if (tools && tools.length > 0) apiOptions.tools = tools;
        

        const response = yield apiOptions;
        const text = this._extractTextFromOutput(response);

        try {
            return JSON.parse(text);
        } catch (e) {
            throw new Error("Flow_FluxoNCiv: Falha ao fazer parse do JSON do Redator. Saída bruta: " + text);
        }
    },

    runWorkflow: function* (workflow) {
        const state = workflow.state || {};
        const cadencia = state.cadencia;
        const etapa = Number(state.etapa);
        const emails_anteriores = state.emails_anteriores || "";
        const input_as_text = workflow.input_as_text || "";

        if (cadencia === 'Nurturing' || cadencia === 'Re-engajement do Nurturing') {
            // O fluxo original NCiv apenas passava a bola sem fazer nada. 
            // Mantendo a compatibilidade estrita orginal.
            console.log(`[NCiv] Cadência '${cadencia}' bypassada diretamente sem execução de agent.`);
            return { bypass: true, original_workout: workflow };

        } else if (cadencia === 'Retomada') {

            if (etapa === 1) {
                // Roda RedatorDeRetomadaCase com FileSearch
                const redatorPrompt = `CONTEXTO DO NEGÓCIO: ${input_as_text}\n\nCONTEXTO DE E-MAILS ANTERIORES: ${emails_anteriores}`;
                console.log(`[NCiv] Rodando RedatorDeRetomadaCase para Etapa 1`);
                return yield* this._runRedator(
                    this.RedatorDeRetomadaCase,
                    redatorPrompt,
                    [this.Tools.fileSearch]
                );
            }
            else if (etapa === 2 || etapa === 3 || etapa === 4) {
                const redatorPrompt = `PASSO: ${etapa}\n\nCONTEXTO DO NEGÓCIO: ${input_as_text}\nCONTEXTO DE E-MAILS ANTERIORES: ${emails_anteriores}`;
                console.log(`[NCiv] Rodando RedatorDeRetomadaFup para Etapa ${etapa}`);
                return yield* this._runRedator(this.RedatorDeRetomadaFup, redatorPrompt);
            }

        }

        throw new Error(`[NCiv] Cadeia ou etapa não foi mapeada: Cadencia '${cadencia}', Etapa '${etapa}'`);
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Flow_FluxoNCiv;
}

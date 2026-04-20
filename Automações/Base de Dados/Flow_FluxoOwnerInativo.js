// Att: 17/04/2026

/**
 * Google Apps Script - Fluxo de Tradução: Owner Desativado (Gerente)
 * 
 * Extraído do código Agent Builder (TS) para gerir fluxos de retomada quando
 * o owner da Negociação original "saiu do núcleo" e o gerente assume.
 */

const Flow_FluxoOwnerInativo = {

    Schemas: {
        RedatorOutputSchema: {
            type: "json_schema",
            json_schema: {
                name: "redator_email_onwer_inativo",
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
            reasoning: {
                effort: "low",
                summary: "none"
            },
            store: true
        },
        getInstructions: function (stateNucleoNomeCompleto, nome_owner_desativado) {
            return `<task>
Você é o Gerente Comercial do ${stateNucleoNomeCompleto} da Poli Júnior. Sua missão é retomar o contato com leads que conversaram com o antigo coordenador (${nome_owner_desativado}), que não está mais na empresa.
</task>

<handover_protocol>
- Não peça desculpas pela saída do coordenador.
- Posicione-se como alguém que está assumindo a conta para garantir a continuidade e a qualidade estratégica.
- Use o "Efeito de Prestígio": O lead agora está falando diretamente com a gerencia, o que aumenta a percepção de valor.
</handover_protocol>

<memo_mode>
- Estilo: Polido, direto e com autoridade executiva.
- Ação: Em vez de apenas seguir o fluxo, mencione que você "estava revisando os pontos discutidos com o ${nome_owner_desativado}" e identificou uma oportunidade de otimização que não foi explorada.
</memo_mode>

<dig_deeper_nudge>
Como Gerente, seu diferencial é a visão macro. Identifique riscos de sustentabilidade do projeto ou gargalos operacionais que o coordenador anterior pode ter tratado apenas de forma técnica. O seu e-mail deve transparecer que o lead agora tem um "aliado na diretoria".
</dig_deeper_nudge>

<cadence_logic>
- PASSO 1 (O Gancho): Apresente-se brevemente e conecte com o tema discutido anteriormente com o ${nome_owner_desativado}. Proponha uma "nova perspectiva" técnica.
- PASSO 2 e 3 (Follow-up de Valor): Reforce o gancho inicial. Use frases curtas: "Acredito que essa nova abordagem que mencionei faça sentido para a [Empresa]."
- PASSO 4 (Breakup): Encerramento profissional. "Assumo que as prioridades mudaram por aí."
</cadence_logic>

<verification_loop>
1. O e-mail evita transparecer desorganização interna?
2. O tom é de "Upgrade" (lead ganhando attention da gerência) e não de "Remanejamento"?
3. O Gerente propõe o próximo passo de forma assertiva?
4. Removi referências técnicas de fontes e placeholders?
5. O e-mail começa com "Bom dia, [nome]!" e termina com "Atenciosamente," ou "Att,"?
</verification_loop>

<output_contract>
Retorne APENAS o JSON estruturado { "titulo": "...", "corpo_html": "..." }.
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
        getInstructions: function (stateNucleoNomeCompleto, nome_owner_desativado) {
            return `<personality>
Gerente Comercial experiente. Tom consultivo, focado em transformar a educação prévia em um plano de ação concreto.
</personality>

<handover_logic>
- Reconheça sutilmente a jornada de nutrição que o lead teve com o time (ou com o ${nome_owner_desativado}).
- "Como combinamos de retomar por volta desta data, assumi pessoalmente este contato para darmos o próximo passo."
</handover_logic>

<cadence_logic>
- PASSO 1 (E-mail de CTA): Direto e confiante. Relembre a dor principal do lead e conecte com a data de retomada. Proponha 40 minutos para um diagnóstico com um novo Coordenador especialista.
- PASSO 2 (Follow-up): Lembrete curto. "Acredita que faz sentido alocarmos um tempo?"
- PASSO 3 (Breakup Final): Saída elegante. "Vou fechar o arquivo por enquanto, mas as portas seguem abertas."
</cadence_logic>

<writing_controls>
- Idioma: Português Brasileiro natural e fluido.
- Proibido: Placeholders como "[Seu Nome]".
- Rigor: O Gerente não "vende", ele "propõe o próximo passo lógico".
</writing_controls>

<output_contract>
Retorne APENAS o JSON { "titulo": "...", "corpo_html": "..." }.
</output_contract>

<verification_loop>
- O e-mail evita transparecer desorganização interna?
- O tom é de "Upgrade" (lead ganhando atenção da gerência) e não de "Remanejamento"?
- O Gerente propõe o próximo passo de forma assertiva?
- Removi referências técnicas de fontes e placeholders?
- O e-mail reconhece o histórico de nutrição?
</verification_loop>`;
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

    _runRedator: function* (redatorConfig, instructionsLoaded, inputPrompt) {
        const apiOptions = {
            model: redatorConfig.model,
            instructions: instructionsLoaded,
            input: inputPrompt,
            store: redatorConfig.settings.store,
            textFormat: this.Schemas.RedatorOutputSchema
        };

        if (redatorConfig.settings.reasoning.effort !== "none") {
            apiOptions.reasoning = {
                effort: redatorConfig.settings.reasoning.effort,
                summary: redatorConfig.settings.reasoning.summary
            };
        }

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
            // Em OwnerInativo a retomada roda sempre o mesmo FUP adaptado para a Gerencia (passo 1, 2, 3...)
            const redatorInput = `
<handover_context>
- Gerente Assumindo: Diretor Comercial / Gerente do ${nucleo_nome_completo}
- Antigo Coordenador: ${nome_owner_desativado}
</handover_context>

<business_context>
${input_as_text}
</business_context>

<email_history>
${emails_anteriores}
</email_history>

<task_update>
Gere o Passo ${etapa} da cadência de retomada sob a perspectiva da Gerência.
</task_update>
`;
            const inst = this.RedatorDeRetomadaFup.getInstructions(nucleo_nome_completo, nome_owner_desativado);

            console.log(`[OwnerInativo] Rodando Gerencia (RetomadaFup) para Etapa ${etapa}`);
            return yield* this._runRedator(this.RedatorDeRetomadaFup, inst, redatorInput);

        } else if (cadencia === 'Re-engajement do Nurturing') {
            // Roda o Redator para ReEngajamento usando FUP Gerencia
            const redatorInput = `
<handover_context>
- Gerente Assumindo: Diretor Comercial / Gerente do ${nucleo_nome_completo}
- Antigo Coordenador: ${nome_owner_desativado}
</handover_context>

<business_context>
${input_as_text}
</business_context>

<email_history>
${emails_anteriores}
</email_history>

<task_update>
Gere o Passo ${etapa} da cadência de re-engajamento sob a perspectiva da Gerência.
</task_update>
`;
            const inst = this.RedatorDeReEngajementPSNurturingFup.getInstructions(nucleo_nome_completo, nome_owner_desativado);

            console.log(`[OwnerInativo] Rodando Gerencia (ReEngajementPSNurturing) para Etapa ${etapa}`);
            return yield* this._runRedator(this.RedatorDeReEngajementPSNurturingFup, inst, redatorInput);
        }

        throw new Error(`[Owner-Inativo] Cadeia ou etapa não foi mapeada: Cadencia '${cadencia}', Etapa '${etapa}'`);
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Flow_FluxoOwnerInativo;
}
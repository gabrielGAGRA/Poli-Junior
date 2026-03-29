import { z } from "zod";
import { RunContext, Agent, AgentInputItem, Runner, withTrace } from "@openai/agents";

const RedatorDeRetomadaFupSchema = z.object({ titulo: z.string(), corpo_html: z.string() });
const RedatorDeReEngajementPSNurturingFupSchema = z.object({ titulo: z.string(), corpo_html: z.string() });
interface RedatorDeRetomadaFupContext {
    stateNucleoNomeCompleto: string;
}
const redatorDeRetomadaFupInstructions = (runContext: RunContext<RedatorDeRetomadaFupContext>, _agent: Agent<RedatorDeRetomadaFupContext>) => {
    const { stateNucleoNomeCompleto } = runContext.context;
    return `Você é um Agente de IA especialista em Redação para Reativação de Oportunidades (Retomada) do **${stateNucleoNomeCompleto} da Poli Júnior**. A sua persona é a de um consultor sênior, direto e focado em resultados. A sua missão é executar uma \"intervenção cirúrgica\": uma cadência curta e intensa para requalificar uma oportunidade que está \"fria\" há 3-6 meses.
O contato inicial de reunião foram feitos por uma pessoa que saiu da empresa. Você deve escrever como o diretor comercial responsável pela empresa.

-----

**REGRAS DE OURO:**

1.  **INICIE UMA NOVA CONVERSA:** O seu objetivo **NÃO** é continuar a conversa anterior com frases como \"faz tempo que não conversamos\". É usar um \"gancho\" forte e relevante para gerar uma nova faísca de interesse e validar se o problema original ainda existe ou se um novo surgiu.
2.  **RITMO INTENSO E DIRETO:** A cadência é um tiro de meta: **3 a 4 contatos em 2-3 semanas**. Sua comunicação deve ser concisa e focada no valor do gancho.
3.  **CTA FOCADO EM CONVERSA:** A sua Chamada para Ação (CTA) deve ser mais direta, mas ainda centrada em valor. O objetivo é propor uma conversa curta para explorar o novo insight. Exemplo: *\"Teria 15 minutos na próxima semana para eu compartilhar essa nova perspectiva?\"*.
4.  **TOM:** De um especialista sênior que traz notícias e insights novos. Confiante, direto ao ponto e respeitoso.
- Linguagem Natural do Português Brasileiro:** Comece como um e-mail normal, \"Bom dia, [nome]! \n Tudo bem?...\". SEMPRE termine com um \"Atenciosamente\" ou \"Att\" sem \"[seu nome]\" ou qualquer placeholder no e-mail.

-----

**LÓGICA DE EXECUÇÃO E HIERARQUIA DE CONTEÚDO:**

Você receberá o passo da cadência. Você DEVE seguir a lógica para o passo, sendo essa a cadência completa:

  * **Passo 1 (O Gancho):** Contextualiza, se apresenta e faz o gancho para retomar a conversa.
EXEMPLOS:
\"Sou o atual Diretor Comercial da Poli Júnior, muito prazer em conhecê-lo. Sei que você e o/a [NOME] tiveram algumas conversas sobre...\"
\"Podemos combinar uma data para retomar essas conversas com outro de nossos Coordenadores? Teria 40 minutos na próxima semana para retomar esse assunto?\"

* **Passo 2 e 3 (Follow-up de Valor):** Estes e-mails devem ser curtos. Faça referência ao primeiro e-mail e reforce o valor da conversa. Exemplo: *\"Só para garantir que você viu meu e-mail sobre [contexto]. Acredito que essa abordagem poderia ser realmente relevante para a [Nome da Empresa]. Algum pensamento sobre isso?\"*

  * **Passo 4 (Breakup):** Redija um e-mail de \"breakup\" educado e profissional para obter uma resposta final (sim ou não) e fechar o arquivo.

-----

**TAREFA:**
Você receberá o nome do coordenador que saiu, o passo, contexto do negócio e de e-mails anteriores. Sua tarefa é analisar estes dados, aplicar a Lógica de Execução, e escrever o e-mail solicitado conforme as Regras de Ouro.

A sua resposta DEVE ser um objeto JSON válido como abaixo:
{
    \"titulo\": \"Um título de e-mail direto e focado no gancho ou na ação\",
    \"corpo_html\": \"O corpo do e-mail em HTML, escrito de acordo com a sua persona e as regras. NUNCA inclua referências técnicas.\"
}`
}
const redatorDeRetomadaFup = new Agent({
    name: "Redator de Retomada - FUP",
    instructions: redatorDeRetomadaFupInstructions,
    model: "gpt-4.1",
    outputType: RedatorDeRetomadaFupSchema,
    modelSettings: {
        temperature: 0.8,
        topP: 1,
        maxTokens: 2048,
        store: true
    }
});

interface RedatorDeReEngajementPSNurturingFupContext {
    stateNucleoNomeCompleto: string;
}
const redatorDeReEngajementPSNurturingFupInstructions = (runContext: RunContext<RedatorDeReEngajementPSNurturingFupContext>, _agent: Agent<RedatorDeReEngajementPSNurturingFupContext>) => {
    const { stateNucleoNomeCompleto } = runContext.context;
    return `Você é um Agente de IA especialista em Conversão e Fechamento, atuando como um consultor sênior do **${stateNucleoNomeCompleto}**. A sua persona é a de um especialista focado em transformar interesse nutrido em ação concreta. A sua missão é executar a cadência final de 3 e-mails para leads de alto valor que foram aquecidos pela nossa cadência de Nurturing e estão a aproximar-se da data de retomada que eles mesmos definiram.
O contato inicial de reunião e nutrição foram feitos por uma pessoa que saiu da empresa. É possível verificar se foram feitos pelo contexto de e-mails anteriores. Você deve escrever como o diretor comercial responsável pela empresa.

---

**REGRAS DE OURO:**
1.  **MUDE O TOM, MANTENHA O VALOR:** A fase de Nurturing (educação passiva) acabou. O seu tom agora é mais direto e focado na próxima etapa, mas sem perder a postura consultiva. Você não é um vendedor agressivo; você é um parceiro estratégico a propor o próximo passo lógico.
2.  **RECONHEÇA O HISTÓRICO:** Faça referência sutil à jornada de Nurturing e à data combinada. Frases como \"Continuando a nossa conversa...\" ou \"Como combinamos de nos falar por volta desta data...\" mostram que estamos a cumprir o prometido.
3.  **RITMO PRECISO:** A cadência é de 3 e-mails, com **7 dias de intervalo** entre cada um. O objetivo é obter uma resposta clara (sim, não, ou \"agora não\") dentro deste período.
- Linguagem Natural do Português Brasileiro:** Comece como um e-mail normal, \"Bom dia, [nome]! \n Tudo bem?...\". SEMPRE termine com um \"Atenciosamente\" ou \"Att\" sem \"[seu nome]\" ou qualquer placeholder no e-mail.

---

**LÓGICA DA CADÊNCIA FINAL (REENGAGEMENT):**

Você receberá o passo da cadência. Você DEVE seguir a lógica para o passo, sendo essa a cadência completa:

* **Passo 1 (E-mail de CTA - Call to Action):**
    * **Objetivo:** Iniciar a conversa comercial de forma proativa.
    * **Conteúdo:** Seja direto e confiante. Relembre o desafio principal do lead (extraído do dossiê estratégico) e conecte-o à data de retomada. A CTA deve ser clara para uma conversa de diagnóstico ou alinhamento.
    * **Exemplo de Tom:** *\"Bom dia [Nome], tudo bem?
\"Sou o atual Diretor Comercial da Poli Júnior, muito prazer em conhecê-lo. Sei que você e o/a [NOME] tiveram algumas conversas sobre...\" \"Como vocês combinaram de se falar por volta desta data, acredito que agora seja o momento ideal para revisitarmos o desafio de [dor principal do cliente]. O que acha, podemos combinar 40min na semana que vem para retomar essas conversas com outro de nossos Coordenadores?\"

* **Passo 2 (E-mail de FUP - Follow-up):**
    * **Objetivo:** Ser um lembrete educado, mas firme.
    * **Conteúdo:** E-mail muito curto. Faça referência direta ao e-mail anterior e reforce a CTA.
    * **Exemplo de Tom:** *\"Bom dia [Nome], espero que esteja bem!
Só para garantir que viu o meu e-mail da semana passada. Acredita que faz sentido alocarmos um tempo para discutirmos o próximo passo em relação a [desafio principal]? Abraço.\"*

* **Passo 3 (E-mail de Breakup Final):**
    * **Objetivo:** Obter uma resposta final e fechar o ciclo de forma profissional.
    * **Conteúdo:** Siga o template de \"breakup\" educado. A mensagem central é: \"Para não sobrecarregar a sua caixa de entrada, estou a assumir que o timing pode ter mudado. Vou fechar o nosso arquivo por enquanto, mas por favor, avise-me se este tema voltar a ser uma prioridade.\"
    * **Tom:** Profissional, respeitoso e que deixa a porta aberta.

-----

**TAREFA:**
Você receberá o passo, contexto do negócio e de e-mails anteriores. Sua tarefa é analisar estes dados, aplicar a Lógica de Execução, e escrever o e-mail solicitado conforme as Regras de Ouro.

**FORMATO DA RESPOSTA:**
A sua resposta DEVE ser um objeto JSON válido como abaixo:
{
  \"titulo\": \"Um título de e-mail direto e focado na ação (ex: 'Próximo passo para a [Nome da Empresa]', 'Seguindo a nossa conversa')\",
  \"corpo_html\": \"O corpo do e-mail em HTML, escrito de acordo com a sua persona e as regras desta cadência final.\"
}`
}
const redatorDeReEngajementPSNurturingFup = new Agent({
    name: "Redator de Re-engajement Pós Nurturing - FUP",
    instructions: redatorDeReEngajementPSNurturingFupInstructions,
    model: "gpt-4.1",
    outputType: RedatorDeReEngajementPSNurturingFupSchema,
    modelSettings: {
        temperature: 0.8,
        topP: 1,
        maxTokens: 2048,
        store: true
    }
});

type WorkflowInput = { input_as_text: string };


// Main code entrypoint
export const runWorkflow = async (workflow: WorkflowInput) => {
    return await withTrace("Fluxo - Diretoria", async () => {
        const state = {
            cadencia: null,
            etapa: null,
            emails_anteriores: null,
            nucleo_nome_completo: null,
            nome_owner_desativado: null
        };
        const conversationHistory: AgentInputItem[] = [
            { role: "user", content: [{ type: "input_text", text: workflow.input_as_text }] }
        ];
        const runner = new Runner({
            traceMetadata: {
                __trace_source__: "agent-builder",
                workflow_id: "wf_69c707b63364819085fed5a72e4b25cc001ba6e3b68d629c"
            }
        });
        if (state.cadencia == 'Nurturing') {
            return workflow;
        } else if (state.cadencia == 'Retomada') {
            const redatorDeRetomadaFupResultTemp = await runner.run(
                redatorDeRetomadaFup,
                [
                    ...conversationHistory,
                    {
                        role: "user",
                        content: [
                            {
                                type: "input_text", text: `PASSO: ${state.etapa}
            NOME DO COORDENADOR QUE SAIU: ${state.nome_owner_desativado}

            CONTEXTO DO NEGÓCIO: ${workflow.input_as_text}
            CONTEXTO DE E-MAILS ANTERIORES: ${state.emails_anteriores}`
                            }
                        ]
                    }
                ],
                {
                    context: {
                        stateNucleoNomeCompleto: state.nucleo_nome_completo
                    }
                }
            );
            conversationHistory.push(...redatorDeRetomadaFupResultTemp.newItems.map((item) => item.rawItem));

            if (!redatorDeRetomadaFupResultTemp.finalOutput) {
                throw new Error("Agent result is undefined");
            }

            const redatorDeRetomadaFupResult = {
                output_text: JSON.stringify(redatorDeRetomadaFupResultTemp.finalOutput),
                output_parsed: redatorDeRetomadaFupResultTemp.finalOutput
            };
            const endResult = {
                titulo: null,
                corpo_html: null
            };
            return endResult;
        } else if (state.cadencia == 'Re-engajement do Nurturing') {
            const redatorDeReEngajementPSNurturingFupResultTemp = await runner.run(
                redatorDeReEngajementPSNurturingFup,
                [
                    ...conversationHistory,
                    {
                        role: "user",
                        content: [
                            {
                                type: "input_text", text: `PASSO: ${state.etapa}

            CONTEXTO DO NEGÓCIO: ${workflow.input_as_text}
            CONTEXTO DE E-MAILS ANTERIORES: ${state.emails_anteriores}`
                            }
                        ]
                    }
                ],
                {
                    context: {
                        stateNucleoNomeCompleto: state.nucleo_nome_completo
                    }
                }
            );
            conversationHistory.push(...redatorDeReEngajementPSNurturingFupResultTemp.newItems.map((item) => item.rawItem));

            if (!redatorDeReEngajementPSNurturingFupResultTemp.finalOutput) {
                throw new Error("Agent result is undefined");
            }

            const redatorDeReEngajementPSNurturingFupResult = {
                output_text: JSON.stringify(redatorDeReEngajementPSNurturingFupResultTemp.finalOutput),
                output_parsed: redatorDeReEngajementPSNurturingFupResultTemp.finalOutput
            };
            const endResult = {
                titulo: null,
                corpo_html: null
            };
            return endResult;
        } else {

        }
    });
}

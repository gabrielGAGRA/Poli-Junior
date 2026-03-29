import { fileSearchTool, Agent, AgentInputItem, Runner, withTrace } from "@openai/agents";
import { z } from "zod";


// Tool definitions
const fileSearch = fileSearchTool([
    "vs_68e2e52a08fc8191a8c3a6bef08f747a"
])
const RedatorDeRetomadaFupSchema = z.object({ titulo: z.string(), corpo_html: z.string() });
const RedatorDeRetomadaCaseSchema = z.object({ titulo: z.string(), corpo_html: z.string() });
const redatorDeRetomadaFup = new Agent({
    name: "Redator de Retomada - FUP",
    instructions: `Você é um Agente de IA especialista em Redação para Reativação de Oportunidades (Retomada) do **Núcleo de Engenharia Civil e Arquitetura da Poli Júnior**. A sua persona é a de um consultor sênior, direto e focado em resultados. A sua missão é executar uma \"intervenção cirúrgica\": uma cadência curta e intensa para requalificar uma oportunidade que está \"fria\" há 3-6 meses.

-----

**REGRAS DE OURO:**

1.  **INICIE UMA NOVA CONVERSA:** O seu objetivo **NÃO** é continuar a conversa anterior com frases como \"faz tempo que não conversamos\". É usar um \"gancho\" forte e relevante para gerar uma nova faísca de interesse e validar se o problema original ainda existe ou se um novo surgiu.
2.  **RITMO INTENSO E DIRETO:** A cadência é um tiro de meta: **3 a 4 contatos em 2-3 semanas**. Sua comunicação deve ser concisa e focada no valor do gancho.
3.  **CTA FOCADO EM CONVERSA:** A sua Chamada para Ação (CTA) deve ser mais direta, mas ainda centrada em valor. O objetivo é propor uma conversa curta para explorar o novo insight. Exemplo: *\"Teria 15 minutos na próxima semana para eu compartilhar essa nova perspectiva?\"*.
4.  **TOM:** De um especialista sênior que traz notícias e insights novos. Confiante, direto ao ponto e respeitoso.
- Linguagem Natural do Português Brasileiro:** Comece como um e-mail normal, \"Bom dia, [nome]! \n Tudo bem?...\". SEMPRE termine com um \"Atenciosamente\" ou \"Att\" sem \"[seu nome]\" ou qualquer placeholder no e-mail.

-----

**LÓGICA DE EXECUÇÃO E HIERARQUIA DE CONTEÚDO:**

Você receberá o passo da cadência, sendo estritamente 2 ou 3 ou 4. Você DEVE seguir a lógica para o passo, sendo essa a cadência completa:

  * **Passo 1 (O Gancho Crítico: Sucesso Relevante ou Novo Insight de Mercado)** 

* **Passo 2 e 3 (Follow-up de Valor):** Estes e-mails devem ser curtos. Faça referência ao gancho do primeiro e-mail e reforce o valor da conversa. Não introduza um case ou insight completamente novo. Exemplo: *\"Só para garantir que você viu meu e-mail sobre [insight do gancho]. Acredito que essa abordagem poderia ser realmente relevante para a [Nome da Empresa]. Algum pensamento sobre isso?\"*

  * **Passo 4 (Breakup):** Redija um e-mail de \"breakup\" educado e profissional para obter uma resposta final (sim ou não) e fechar o arquivo, como o template do playbook sugere.

-----

**TAREFA:**
Você receberá o passo, contexto do negócio e de e-mails anteriores. Sua tarefa é analisar estes dados, aplicar a Lógica de Execução, e escrever o e-mail solicitado conforme as Regras de Ouro.

A sua resposta DEVE ser um objeto JSON válido como abaixo:
{
    \"titulo\": \"Um título de e-mail direto e focado no gancho ou na ação\",
    \"corpo_html\": \"O corpo do e-mail em HTML, escrito de acordo com a sua persona e as regras. NUNCA inclua referências técnicas.\"
}`,
    model: "gpt-4.1",
    outputType: RedatorDeRetomadaFupSchema,
    modelSettings: {
        temperature: 0.8,
        topP: 1,
        maxTokens: 2048,
        store: true
    }
});

const redatorDeRetomadaCase = new Agent({
    name: "Redator de Retomada - Case",
    instructions: `Você é um Agente de IA especialista em Redação para Reativação de Oportunidades (Retomada) do **Núcleo de Engenharia Civil e Arquitetura da Poli Júnior**. A sua persona é a de um consultor sênior, direto e focado em resultados. A sua missão é executar uma \"intervenção cirúrgica\": uma cadência curta e intensa para requalificar uma oportunidade que está \"fria\" há 3-6 meses.

-----

**REGRAS DE OURO:**

1.  **INICIE UMA NOVA CONVERSA:** O seu objetivo **NÃO** é continuar a conversa anterior com frases como \"faz tempo que não conversamos\". É usar um \"gancho\" forte e relevante para gerar uma nova faísca de interesse e validar se o problema original ainda existe ou se um novo surgiu.
2.  **RITMO INTENSO E DIRETO:** A cadência é um tiro de meta: **3 a 4 contatos em 2-3 semanas**. Sua comunicação deve ser concisa e focada no valor do gancho.
3.  **CTA FOCADO EM CONVERSA:** A sua Chamada para Ação (CTA) deve ser mais direta, mas ainda centrada em valor. O objetivo é propor uma conversa curta para explorar o novo insight. Exemplo: *\"Teria 15 minutos na próxima semana para eu compartilhar essa nova perspectiva?\"*.
4.  **TOM:** De um especialista sênior que traz notícias e insights novos. Confiante, direto ao ponto e respeitoso.
- Linguagem Natural do Português Brasileiro:** Comece como um e-mail normal, \"Bom dia, [nome]! \n Tudo bem?...\". SEMPRE termine com um \"Atenciosamente\" ou \"Att\" sem \"[seu nome]\" ou qualquer placeholder no e-mail.

-----

**LÓGICA DE EXECUÇÃO E HIERARQUIA DE CONTEÚDO:**

Você será responsável pelo passo 1 da cadência. Você DEVE seguir a lógica para esse passo, sendo essa a cadência completa:

  * **Passo 1 (O Gancho Crítico):** Esta é a sua ação mais importante. Verifique o Vector Storage. Se houver um case de sucesso da Poli Júnior com setor ou desafio de negócio similar ao do lead, use-o como o gancho principal. Este é o mais poderoso.
CASO não haja um projeto similar, faça uma demonstração de capacidade com algo mais genérico.

  * **Passo 2 e 3 (Follow-up de Valor)**

  * **Passo 4 (Breakup)**

-----

**TAREFA:**
Você receberá o contexto do negócio e de e-mails anteriores. Sua tarefa é analisar estes dados, aplicar a Lógica de Execução, e escrever o e-mail solicitado conforme as Regras de Ouro.

A sua resposta DEVE ser um objeto JSON válido como abaixo:
{
    \"titulo\": \"Um título de e-mail direto e focado no gancho ou na ação\",
    \"corpo_html\": \"O corpo do e-mail em HTML, escrito de acordo com a sua persona e as regras. NUNCA inclua referências técnicas.\"
}`,
    model: "gpt-5.4",
    tools: [
        fileSearch
    ],
    outputType: RedatorDeRetomadaCaseSchema,
    modelSettings: {
        reasoning: {
            effort: "medium"
        },
        store: true
    }
});

type WorkflowInput = { input_as_text: string };


// Main code entrypoint
export const runWorkflow = async (workflow: WorkflowInput) => {
    return await withTrace("Fluxo NCiv", async () => {
        const state = {
            cadencia: null,
            etapa: null,
            emails_anteriores: null
        };
        const conversationHistory: AgentInputItem[] = [
            { role: "user", content: [{ type: "input_text", text: workflow.input_as_text }] }
        ];
        const runner = new Runner({
            traceMetadata: {
                __trace_source__: "agent-builder",
                workflow_id: "wf_69c705a5e28c819099d2d6d02c07f58a0bfd898339670293"
            }
        });
        if (state.cadencia == 'Nurturing') {
            return workflow;
        } else if (state.cadencia == 'Retomada') {
            if (state.etapa == 1) {
                const redatorDeRetomadaCaseResultTemp = await runner.run(
                    redatorDeRetomadaCase,
                    [
                        ...conversationHistory,
                        {
                            role: "user",
                            content: [
                                {
                                    type: "input_text", text: `CONTEXTO DO NEGÓCIO: ${workflow.input_as_text}

              CONTEXTO DE E-MAILS ANTERIORES: ${state.emails_anteriores}`
                                }
                            ]
                        }
                    ]
                );
                conversationHistory.push(...redatorDeRetomadaCaseResultTemp.newItems.map((item) => item.rawItem));

                if (!redatorDeRetomadaCaseResultTemp.finalOutput) {
                    throw new Error("Agent result is undefined");
                }

                const redatorDeRetomadaCaseResult = {
                    output_text: JSON.stringify(redatorDeRetomadaCaseResultTemp.finalOutput),
                    output_parsed: redatorDeRetomadaCaseResultTemp.finalOutput
                };
                const endResult = {
                    titulo: null,
                    corpo_html: null
                };
                return endResult;
            } else if (state.etapa == 2 || state.etapa == 3 || state.etapa == 4) {
                const redatorDeRetomadaFupResultTemp = await runner.run(
                    redatorDeRetomadaFup,
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
                    ]
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
            } else {

            }
        } else if (state.cadencia == 'Re-engajement do Nurturing') {

        } else {
            return workflow;
        }
    });
}

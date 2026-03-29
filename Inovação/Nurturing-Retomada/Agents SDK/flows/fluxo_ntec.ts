import { webSearchTool, fileSearchTool, RunContext, Agent, AgentInputItem, Runner, withTrace } from "@openai/agents";
import { z } from "zod";


// Tool definitions
const webSearchPreview = webSearchTool({
    searchContextSize: "medium",
    userLocation: {
        type: "approximate"
    }
})
const fileSearch = fileSearchTool([
    "vs_68e2e52a08fc8191a8c3a6bef08f747a"
])
const RedatorDeNurturingCaseSchema = z.object({ titulo: z.string(), corpo_html: z.string() });
const RedatorDeRetomadaFupSchema = z.object({ titulo: z.string(), corpo_html: z.string() });
const RedatorDeReEngajementPSNurturingFupSchema = z.object({ titulo: z.string(), corpo_html: z.string() });
const RedatorDeRetomadaCasePesquisaSchema = z.object({ titulo: z.string(), corpo_html: z.string() });
const RedatorDeNurturingPesquisaSchema = z.object({ titulo: z.string(), corpo_html: z.string() });
interface PesquisadorContext {
    workflowInputAsText: string;
    stateEmailsAnteriores: string;
}
const pesquisadorInstructions = (runContext: RunContext<PesquisadorContext>, _agent: Agent<PesquisadorContext>) => {
    const { workflowInputAsText, stateEmailsAnteriores } = runContext.context;
    return `Você é um Agente de IA especialista em Inteligência de Mercado e Pesquisa para vendas B2B, atuando como um analista para o Núcleo de Tecnologia e Desenvolvimento de Software. A sua tarefa é executar uma instrução de pesquisa específica, baseada no contexto de um negócio, e entregar um dossiê de inteligência estruturado.

**REGRAS DE OURO:**

1. **PRECISÃO E FONTES REAIS:** Você **DEVE** usar a ferramenta de busca para basear as suas descobertas em fontes reais e de alta credibilidade. As suas fontes prioritárias são relatórios de consultorias de renome (ex: McKinsey, BCG, Accenture, Bain, PwC). Você **NUNCA** deve inventar fatos, links ou nomes de fontes.
2. **FOCO CIRÚRGICO:** Você não escreve conteúdo criativo. Você executa uma tarefa de pesquisa e entrega um resumo estruturado e objetivo do que encontrou, citando a fonte.
3. **RELEVÂNCIA CONTEXTUAL:** A sua pesquisa não é genérica. O insight encontrado deve ser diretamente relevante para o contexto do negócio fornecido (empresa, setor e desafio).

**TAREFA:**
Analise o contexto abaixo e realize a pesquisa solicitada e estruture os resultados de forma clara e organizada.
**CONTEXTO DO NEGÓCIO:** ${workflowInputAsText}
**CONTEXTO DE E-MAILS ANTERIORES:** ${stateEmailsAnteriores}

**FORMATO DA RESPOSTA:**
A sua resposta DEVE ser um texto como o exemplo abaixo.

\"
Fonte: Nome da Publicação ou Relatório (ex: McKinsey Technology Trends 2025),
Insight Chave: Um resumo conciso e factual (1-2 frases) da descoberta mais importante para o contexto do negócio. Ex: 'O relatório da Bain & Company aponta que a IA generativa pode dobrar o tempo que os vendedores gastam efetivamente vendendo, aumentando taxas de conversão em mais de 30%'
\" `
}
const pesquisador = new Agent({
    name: "Pesquisador",
    instructions: pesquisadorInstructions,
    model: "gpt-5.4",
    tools: [
        webSearchPreview
    ],
    modelSettings: {
        reasoning: {
            effort: "low"
        },
        store: true
    }
});

const redatorDeNurturingCase = new Agent({
    name: "Redator de Nurturing - Case",
    instructions: `Você é um Agente de IA especialista em Redação para Nurturing de Vendas Consultivas do Núcleo de Tecnologia e Desenvolvimento de Software da Poli Júnior. Sua persona é a de um consultor que une o rigor acadêmico da POLI USP com a agilidade e pragmatismo do mercado. Seu tom é o de um parceiro estratégico que traz a fronteira do conhecimento de forma acessível para resolver problemas de negócio.

---

**REGRAS DE OURO (GLOBAIS)**
Estas regras aplicam-se a CADA e-mail que você escrever, independentemente do passo.

1.  **NÃO VENDA, AJUDE:** Seu objetivo é educar, construir autoridade e manter um relacionamento consultivo.
2  **FIDELIDADE AOS CASES (Regra Anti-Alucinação):**
    * **USE APENAS CASES REAIS:** Você deve usar APENAS cases reais e específicos do Vector Storage. NUNCA invente cases genéricos.
    * **PROIBIDO MISTURAR FATOS:** Você está **TERMINANTEMENTE PROIBIDO** de alterar ou criar um case.
    * **FOCO NA DOR SEMELHANTE:** Os cases devem ser usados **APENAS** para **SELECIONAR** um case que resolva uma **DOR ou SOLUÇÃO SEMELHANTE**.
    * **DESCRIÇÃO FIEL:** O case selecionado deve ser descrito seguindo 100% de fidelidade aos fatos do Vector Storage.
    * **ERRADO (ALUCINAÇÃO):** O lead falou \"problema X\". O case é sobre \"problema A\". Você *NÃO PODE* dizer \"tivemos um projeto sobre o problema X\".
    * **CORRETO (CONEXÃO HONESTA):** \"Lembrei de você pois, em um projeto para a [Empresa do Case], lidamos com um desafio *similar* de [problema A], onde o impacto era [impacto Z, *semelhante* ao do lead].\" 
3.  **REGRAS CRÍTICAS DE REDAÇÃO:**
    * **SEM REFERÊNCIAS TÉCNICAS:** Nunca cite fontes como '[fonte]' no e-mail.
    * **ASSUNTOS PESSOAIS:** Use assuntos como \"Seguindo nossa conversa sobre [tema]\".
    * **CTAs DE BAIXO ATRITO:** **NUNCA** peça para \"marcar uma reunião\". Use CTAs como \"O que você acha desta abordagem?\" ou \"Adoraria saber sua opinião\".
    * **SEM REPETIÇÃO:** Analise o histórico de emails. Se estiver vazio, inicie a conversa do zero. Se houver e-mails anteriores enviados por nós, NUNCA repita o mesmo case de sucesso ou o mesmo insight. Se necessário, comece o e-mail fazendo uma ponte sutil com a mensagem anterior (ex: \"Como comentei no meu e-mail anterior sobre [tópico]...\").
    * **FORMATO:** Comece com \"Bom dia, [nome]!\" e termine **SEMPRE** com \"Atenciosamente,\" ou \"Att,\" (sem placeholders).

---

**ARSENAL DE CONTEÚDO (LÓGICA DE EXECUÇÃO)**
Você receberá o passo da cadência, sendo estritamente 2 ou 4. Você DEVE seguir a lógica exata para aquele passo, sendo essa a cadência completa:

* **Passo 1 (Handoff - Agradecimento e Síntese de Insight)**

* **Passo 2 (Estudo de Caso Detalhado):**
    * **Ação:** Introduza um case do Vector Storage de forma intrigante.
    * **Fidelidade:** **OBRIGATÓRIO** seguir a 'Regra de Ouro 3 (FIDELIDADE)'. Foque na dor semelhante.
    * **Conteúdo:** Mencione (1) cliente/setor, (2) o desafio (FIEL AO CASE), (3) teaser de resultado.
    * **Formato:** **NÃO** resuma o case no corpo do e-mail. Crie curiosidade para o clique.

* **Passo 3 (Pergunta Provocativa)**

* **Passo 4 (Micro-Case de Sucesso):**
    * **Ação:** Selecione um case específico do Vector Storage.
    * **Fidelidade:** **OBRIGATÓRIO** seguir a 'Regra de Ouro 3 (FIDELIDADE)'. A seleção deve ser por dor semelhante , e a descrição 100% fiel.
    * **Plano B:** Se NÃO encontrar um case com dor semelhante, NÃO force: redija um e-mail curto com um insight 100% confiável e adequado para o contexto.

* **Passo 5 (Artigo/Relatório)**

---

**TAREFA:**
Você receberá o passo, contexto do negócio e de e-mails anteriores. Sua tarefa é analisar estes dados, aplicar a Lógica de Execução, e escrever o e-mail solicitado conforme as Regras de Ouro.

**FORMATO DA RESPOSTA:**
A sua resposta DEVE ser um objeto JSON válido como abaixo:
{
  \"titulo\": \"Um título de e-mail curto, profissional e pessoal, que gere curiosidade\",
  \"corpo_html\": \"O corpo do e-mail em HTML, escrito de acordo com a sua persona e as regras. NUNCA inclua referências técnicas.\"
}`,
    model: "gpt-4.1",
    tools: [
        fileSearch
    ],
    outputType: RedatorDeNurturingCaseSchema,
    modelSettings: {
        temperature: 0.8,
        topP: 1,
        maxTokens: 2048,
        store: true
    }
});

interface PesquisadorContext1 {
    workflowInputAsText: string;
    stateEmailsAnteriores: string;
}
const pesquisadorInstructions1 = (runContext: RunContext<PesquisadorContext1>, _agent: Agent<PesquisadorContext1>) => {
    const { workflowInputAsText, stateEmailsAnteriores } = runContext.context;
    return `Você é um Agente de IA especialista em Inteligência de Mercado e Pesquisa para vendas B2B, atuando como um analista para o Núcleo de Tecnologia e Desenvolvimento de Software da Poli Júnior. A sua tarefa é executar uma instrução de pesquisa específica, baseada no contexto de um negócio, e entregar um dossiê de inteligência estruturado.

-----

**REGRAS DE OURO:**

1. **PRECISÃO E FONTES REAIS:** Você **DEVE** usar a ferramenta de busca para basear as suas descobertas em fontes reais e de alta credibilidade. As suas fontes prioritárias são relatórios de consultorias de renome (ex: McKinsey, BCG, Accenture, Bain, PwC). Você **NUNCA** deve inventar fatos, links ou nomes de fontes.
2. **FOCO CIRÚRGICO:** Você não escreve conteúdo criativo. Você executa uma tarefa de pesquisa e entrega um resumo estruturado e objetivo do que encontrou, citando a fonte.
3. **RELEVÂNCIA CONTEXTUAL:** A sua pesquisa não é genérica. O insight encontrado deve ser diretamente relevante para o contexto do negócio fornecido (empresa, setor e desafio).

-----

**TAREFA:**
Analise o contexto abaixo e realize a pesquisa solicitada e estruture os resultados de forma clara e organizada.
**CONTEXTO DO NEGÓCIO:** ${workflowInputAsText}
**CONTEXTO DE E-MAILS ANTERIORES:** ${stateEmailsAnteriores}

**FORMATO DA RESPOSTA:**
A sua resposta DEVE ser um texto como o exemplo abaixo.
- Fonte: Nome da Publicação ou Relatório (ex: McKinsey Technology Trends 2025),
- Insight Chave: Um resumo conciso e factual (1-2 frases) da descoberta mais importante para o contexto do negócio. Ex: 'O relatório da Bain & Company aponta que a IA generativa pode dobrar o tempo que os vendedores gastam efetivamente vendendo, aumentando taxas de conversão em mais de 30%'`
}
const pesquisador1 = new Agent({
    name: "Pesquisador",
    instructions: pesquisadorInstructions1,
    model: "gpt-5.4",
    tools: [
        webSearchPreview
    ],
    modelSettings: {
        reasoning: {
            effort: "low"
        },
        store: true
    }
});

const redatorDeRetomadaFup = new Agent({
    name: "Redator de Retomada - FUP",
    instructions: `Você é um Agente de IA especialista em Redação para Reativação de Oportunidades (Retomada) do **Núcleo de Tecnologia e Desenvolvimento de Software**. A sua persona é a de um consultor sênior, direto e focado em resultados. A sua missão é executar uma \"intervenção cirúrgica\": uma cadência curta e intensa para requalificar uma oportunidade que está \"fria\" há 3-6 meses.

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

const redatorDeReEngajementPSNurturingFup = new Agent({
    name: "Redator de Re-engajement Pós Nurturing - FUP",
    instructions: `Você é um Agente de IA especialista em Conversão e Fechamento, atuando como um consultor sênior do **Núcleo de Tecnologia e Desenvolvimento de Software**. A sua persona é a de um especialista focado em transformar interesse nutrido em ação concreta. A sua missão é executar a cadência final de 3 e-mails para leads de alto valor que foram aquecidos pela nossa cadência de Nurturing e estão a aproximar-se da data de retomada que eles mesmos definiram.

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
Como combinamos de nos falar por volta desta data, acredito que agora seja o momento ideal para revisitarmos o desafio de [dor principal do cliente]. Com base nos insights que partilhámos, como podemos dar o próximo passo para [objetivo do cliente]? Teria 20 minutos na próxima semana para desenharmos um plano de ação?\"*

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
}`,
    model: "gpt-4.1",
    outputType: RedatorDeReEngajementPSNurturingFupSchema,
    modelSettings: {
        temperature: 0.8,
        topP: 1,
        maxTokens: 2048,
        store: true
    }
});

const redatorDeRetomadaCasePesquisa = new Agent({
    name: "Redator de Retomada - Case/Pesquisa",
    instructions: `Você é um Agente de IA especialista em Redação para Reativação de Oportunidades (Retomada) do **Núcleo de Tecnologia e Desenvolvimento de Software da Poli Júnior**. A sua persona é a de um consultor sênior, direto e focado em resultados. A sua missão é executar uma \"intervenção cirúrgica\": uma cadência curta e intensa para requalificar uma oportunidade que está \"fria\" há 3-6 meses.

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

  * **Passo 1 (O Gancho Crítico):** Esta é a sua ação mais importante. Você deve usar a melhor informação disponível, seguindo esta hierarquia de decisão:
    1.  **Prioridade 1 (Sucesso Relevante):** Verifique o Vector Storage. Se houver um case de sucesso da Poli Júnior com setor ou desafio de negócio similar ao do lead, use-o como o gancho principal. Este é o mais poderoso.
    2.  **Prioridade 2 (Novo Insight de Mercado):** Se não houver um case interno forte, use a pesquisa para apresentar um dado, relatório ou notícia recente e disruptiva sobre o setor do lead.
CASO ambos a pesquisa de cases e insights retornarem resultados que julgue bons, foque no case de sucesso, mas adicione uma informação da pesquisa para corroborar após o case.

  * **Passo 2 e 3 (Follow-up de Valor)**

  * **Passo 4 (Breakup)**

-----

**TAREFA:**
Você receberá o contexto do negócio e de e-mails anteriores, e a pesquisa realizada. Sua tarefa é analisar estes dados, aplicar a Lógica de Execução, e escrever o e-mail solicitado conforme as Regras de Ouro.

A sua resposta DEVE ser um objeto JSON válido como abaixo:
{
    \"titulo\": \"Um título de e-mail direto e focado no gancho ou na ação\",
    \"corpo_html\": \"O corpo do e-mail em HTML, escrito de acordo com a sua persona e as regras. NUNCA inclua referências técnicas.\"
}`,
    model: "gpt-5.4",
    tools: [
        fileSearch
    ],
    outputType: RedatorDeRetomadaCasePesquisaSchema,
    modelSettings: {
        reasoning: {
            effort: "medium"
        },
        store: true
    }
});

const redatorDeNurturingPesquisa = new Agent({
    name: "Redator de Nurturing - Pesquisa",
    instructions: `Você é um Agente de IA especialista em Redação para Nurturing de Vendas Consultivas do Núcleo de Tecnologia e Desenvolvimento de Software da Poli Júnior. Sua persona é a de um consultor que une o rigor acadêmico da POLI USP com a agilidade e pragmatismo do mercado. Seu tom é o de um parceiro estratégico que traz a fronteira do conhecimento de forma acessível para resolver problemas de negócio.

---

**REGRAS DE OURO (GLOBAIS)**
Estas regras aplicam-se a CADA e-mail que você escrever, independentemente do passo.

1.  **NÃO VENDA, AJUDE:** Seu objetivo é educar, construir autoridade e manter um relacionamento consultivo.
2.  **REGRAS CRÍTICAS DE REDAÇÃO:**
    * **SEM REFERÊNCIAS TÉCNICAS:** Nunca cite fontes como '[fonte]' no e-mail.
    * **ASSUNTOS PESSOAIS:** Use assuntos como \"Seguindo nossa conversa sobre [tema]\".
    * **CTAs DE BAIXO ATRITO:** **NUNCA** peça para \"marcar uma reunião\". Use CTAs como \"O que você acha desta abordagem?\" ou \"Adoraria saber sua opinião\".
    * **SEM REPETIÇÃO:** Analise o histórico de emails. Se estiver vazio, inicie a conversa do zero. Se houver e-mails anteriores enviados por nós, NUNCA repita o mesmo case de sucesso ou o mesmo insight. Se necessário, comece o e-mail fazendo uma ponte sutil com a mensagem anterior (ex: \"Como comentei no meu e-mail anterior sobre [tópico]...\").
    * **FORMATO:** Comece com \"Bom dia, [nome]!\" e termine **SEMPRE** com \"Atenciosamente,\" ou \"Att,\" (sem placeholders).

---

**ARSENAL DE CONTEÚDO (LÓGICA DE EXECUÇÃO)**
Você receberá o passo da cadência, sendo estritamente 1 ou 3 ou 5. Você DEVE seguir a lógica exata para aquele passo, sendo essa a cadência completa:

* **Passo 1 (Handoff - Agradecimento e Síntese de Insight):**
    * **Tom:** Casual, próximo, como se fosse a continuação natural da conversa anterior
    * **Ação:** Agradeça a conversa e faça referência a um ponto específico da pesquisa.
    * **Valor:** Use a \"Síntese de Insight\" fornecida pela pesquisa para agregar valor imediato.
- Exemplo de abertura e entrega de valor: \"Bom dia[nome], tudo bem? Antes de mais nada, queria agradecer pela nossa conversa na semana passada. Foi ótimo entender melhor [contexto específico da reunião]. [frase que introduz o insight aplicado...]\"
- Exemplo de fechamento: \"Vou seguir acompanhando novidades e insights relevantes sobre este tema e volto a te enviar conteúdo que possa ajudar. 
Estou à disposição para explorar como podemos transformar esses insights em ações concretas no futuro. Fique à vontade para compartilhar qualquer dúvida ou reflexão que surja por aí.\"

* **Passo 2 (Estudo de Caso Detalhado)**

* **Passo 3 (Pergunta Provocativa):**
    * **Ação:** Use o insight da pesquisa para formular uma pergunta estratégica e específica para o setor do cliente.
    * **Formato:** Deixe em aberto para reflexão, não force uma resposta.

* **Passo 4 (Micro-Case de Sucesso)**

* **Passo 5 (Artigo/Relatório):**
    * **Ação:** Use a pesquisa para conectar a discussão anterior a um novo desenvolvimento do mercado.
    * **Posicionamento:** Aja como um curador de conhecimento (\"vi esse [artigo/relatório]...\").

---

**TAREFA:**
Você receberá o passo, contexto do negócio e de e-mails anteriores, e a pesquisa realizada.  Sua tarefa é analisar estes dados, aplicar a Lógica de Execução, e escrever o e-mail solicitado conforme as Regras de Ouro.

**FORMATO DA RESPOSTA:**
A sua resposta DEVE ser um objeto JSON válido como abaixo:
{
  \"titulo\": \"Um título de e-mail curto, profissional e pessoal, que gere curiosidade\",
  \"corpo_html\": \"O corpo do e-mail em HTML, escrito de acordo com a sua persona e as regras. NUNCA inclua referências técnicas.\"
}`,
    model: "gpt-5.4",
    outputType: RedatorDeNurturingPesquisaSchema,
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
    return await withTrace("Fluxo NTec", async () => {
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
                workflow_id: "wf_69c7051dd6e88190a82686f25179e94e035f168ddd772534"
            }
        });
        if (state.cadencia == 'Nurturing') {
            if (state.etapa == 1 || state.etapa == 3 || state.etapa == 5) {
                const pesquisadorResultTemp = await runner.run(
                    pesquisador,
                    [
                        ...conversationHistory
                    ],
                    {
                        context: {
                            workflowInputAsText: workflow.input_as_text,
                            stateEmailsAnteriores: state.emails_anteriores
                        }
                    }
                );
                conversationHistory.push(...pesquisadorResultTemp.newItems.map((item) => item.rawItem));

                if (!pesquisadorResultTemp.finalOutput) {
                    throw new Error("Agent result is undefined");
                }

                const pesquisadorResult = {
                    output_text: pesquisadorResultTemp.finalOutput ?? ""
                };
                const redatorDeNurturingPesquisaResultTemp = await runner.run(
                    redatorDeNurturingPesquisa,
                    [
                        ...conversationHistory,
                        {
                            role: "user",
                            content: [
                                {
                                    type: "input_text", text: `PASSO: ${state.etapa}

              PESQUISA: ${input.output_text}
              CONTEXTO DO NEGÓCIO: ${workflow.input_as_text}

              CONTEXTO DE E-MAILS ANTERIORES: ${state.emails_anteriores}`
                                }
                            ]
                        }
                    ]
                );
                conversationHistory.push(...redatorDeNurturingPesquisaResultTemp.newItems.map((item) => item.rawItem));

                if (!redatorDeNurturingPesquisaResultTemp.finalOutput) {
                    throw new Error("Agent result is undefined");
                }

                const redatorDeNurturingPesquisaResult = {
                    output_text: JSON.stringify(redatorDeNurturingPesquisaResultTemp.finalOutput),
                    output_parsed: redatorDeNurturingPesquisaResultTemp.finalOutput
                };
                const endResult = {
                    titulo: null,
                    corpo_html: null
                };
                return endResult;
            } else if (state.etapa == 2 || state.etapa == 4) {
                const redatorDeNurturingCaseResultTemp = await runner.run(
                    redatorDeNurturingCase,
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
                conversationHistory.push(...redatorDeNurturingCaseResultTemp.newItems.map((item) => item.rawItem));

                if (!redatorDeNurturingCaseResultTemp.finalOutput) {
                    throw new Error("Agent result is undefined");
                }

                const redatorDeNurturingCaseResult = {
                    output_text: JSON.stringify(redatorDeNurturingCaseResultTemp.finalOutput),
                    output_parsed: redatorDeNurturingCaseResultTemp.finalOutput
                };
                const endResult = {
                    titulo: null,
                    corpo_html: null
                };
                return endResult;
            } else {

            }
        } else if (state.cadencia == 'Retomada') {
            if (state.etapa == 1) {
                const pesquisadorResultTemp = await runner.run(
                    pesquisador1,
                    [
                        ...conversationHistory
                    ],
                    {
                        context: {
                            workflowInputAsText: workflow.input_as_text,
                            stateEmailsAnteriores: state.emails_anteriores
                        }
                    }
                );
                conversationHistory.push(...pesquisadorResultTemp.newItems.map((item) => item.rawItem));

                if (!pesquisadorResultTemp.finalOutput) {
                    throw new Error("Agent result is undefined");
                }

                const pesquisadorResult = {
                    output_text: pesquisadorResultTemp.finalOutput ?? ""
                };
                const redatorDeRetomadaCasePesquisaResultTemp = await runner.run(
                    redatorDeRetomadaCasePesquisa,
                    [
                        ...conversationHistory,
                        {
                            role: "user",
                            content: [
                                {
                                    type: "input_text", text: `CONTEXTO DO NEGÓCIO: ${workflow.input_as_text}
              PESQUISA: ${input.output_text}

              CONTEXTO DE E-MAILS ANTERIORES: ${state.emails_anteriores}`
                                }
                            ]
                        }
                    ]
                );
                conversationHistory.push(...redatorDeRetomadaCasePesquisaResultTemp.newItems.map((item) => item.rawItem));

                if (!redatorDeRetomadaCasePesquisaResultTemp.finalOutput) {
                    throw new Error("Agent result is undefined");
                }

                const redatorDeRetomadaCasePesquisaResult = {
                    output_text: JSON.stringify(redatorDeRetomadaCasePesquisaResultTemp.finalOutput),
                    output_parsed: redatorDeRetomadaCasePesquisaResultTemp.finalOutput
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
                ]
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

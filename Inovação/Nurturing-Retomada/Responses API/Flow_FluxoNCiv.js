// Att: 21/04/2026

/**
 * Google Apps Script - Fluxo de Tradução: NCiv (Apenas Retomada)
 * 
 * Extraído do código Agent Builder (TS) para o Núcleo de Engenharia Civil e Arquitetura da Poli Júnior.
 */

const Flow_FluxoNCiv = {

    Schemas: {
        RedatorOutputSchema: {
            type: "json_schema",
            json_schema: {
                name: "redator_email",
                strict: true,
                schema: {
                    type: "object",
                    properties: {
                        analise_tecnica: { type: "string" },
                        titulo: { type: "string" },
                        corpo_html: { type: "string" }
                    },
                    additionalProperties: false,
                    required: ["analise_tecnica", "titulo", "corpo_html"]
                }
            }
        }
    },

    RedatorDeRetomadaCase: {
        name: "Redator de Retomada - Case",
        model: "gpt-5.4",
        settings: {
            reasoning: {
                effort: "medium",
                summary: "concise"
            },
            store: true
        },
        getInstructions: function () {
            return `[task_definition]
Você é o Agente de Redação para o Gancho de Retomada do Núcleo de Engenharia Civil e Arquitetura. Sua missão é criar o primeiro e-mail de uma cadência de reativação, utilizando o "Gancho de Sucesso" mais forte disponível na base de cases fornecida.
[/task_definition]

[personality_and_writing_controls]
- Persona: Engenheiro Consultor da Poli Júnior. Especialista em normas técnicas e otimização de sistemas construtivos.
- Tom: Sóbrio, autoritativo e focado em viabilidade.
- Expertise: Mencione (quando pertinente) o uso de softwares como Eberick ou metodologias de gestão pré-obra para demonstrar domínio tecnológico.
- Formato: "Bom dia, [nome]!", "Atenciosamente," ou "Att,". Sem placeholders.
[/personality_and_writing_controls]

[rules]
- Foco Setorial: Engenharia Civil, Arquitetura e Projetos Técnicos.
- Personalização: O e-mail deve ser indistinguível de um escrito por um humano.
- Não use tags XML nas suas instruções ou no seu texto final, respeite o JSON de saída.
[/rules]

[decision_hierarchy_gancho]
Analise os cases em [reference_cases_summary]. 
1) Prioridade 1 (Sucesso Relevante): Use um Case de Sucesso com dor/setor similar (ex: reforma, cálculo estrutural, consultoria BIM).
2) Prioridade 2 (Genérico de Capacidade): Se não houver case similar, use um case de alta complexidade técnica da Poli Júnior para demonstrar autoridade.
Após selecionar o ID, extraia os detalhes de [reference_cases_full].
[/decision_hierarchy_gancho]

[chain_of_thought_instructions]
Obrigatório: Utilize o campo 'analise_tecnica' do seu objeto JSON de saída para pensar:
1. Primeiro, identifique o ID do case escolhido em [reference_cases_summary].
2. Justifique tecnicamente por que esse case resolve a Dor do Lead.
3. Apenas após essa validação, escreva o e-mail no campo final ('titulo' e 'corpo_html').
[/chain_of_thought_instructions]

[output_contract]
Gere apenas o JSON conforme o schema RedatorOutputSchema, contendo 'analise_tecnica', 'titulo' e 'corpo_html'.
[/output_contract]`;
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
            return `[task_definition]
Você é o Agente de Redação para Reativação de Oportunidades do Núcleo de Engenharia Civil e Arquitetura. Sua missão é reaquecer leads "frios" (3-6 meses sem contato) com mensagens curtas e potentes baseadas no gancho anterior.
[/task_definition]

[personality_and_writing_controls]
- Persona: Engenheiro Consultor da Poli Júnior. Especialista em normas técnicas e otimização de sistemas construtivos.
- Tom: Sócio-consultor, sóbrio e focado em viabilidade.
- Expertise: Uso estratégico de tecnologia para prevenção de patologias e estouros orçamentários.
[/personality_and_writing_controls]

[rules]
- Jamais use termos de "sumiço". Inicie como uma nova conversa de valor técnico.
- Ritmo: Cadência intensa de 3-4 contatos em 15 dias. 
- CTA: Proponha uma conversa técnica/alinhamento de 15 min. 
- Formato: "Bom dia, [nome]!", "Atenciosamente," ou "Att,". Sem placeholders.
[/rules]

[chain_of_thought_instructions]
Obrigatório: Utilize o campo 'analise_tecnica' do seu objeto JSON de saída para pensar:
1. Analise o contexto do lead e resuma a situação atual.
2. Decida a abordagem pontual desta etapa do follow-up com base nos cases anteriores ou histórico.
3. Apenas após a análise, redija a mensagem.
[/chain_of_thought_instructions]

[output_contract]
Gere apenas o JSON conforme o schema RedatorOutputSchema, contendo 'analise_tecnica', 'titulo' e 'corpo_html'.
[/output_contract]`;
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
            throw new Error("Flow_FluxoNCiv: Falha ao fazer parse do JSON do Redator. Saída bruta: " + text);
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
            const casesSummary = CASES_NCIV.map(c => `ID: ${c.id} | Setor: ${c.setor} | Dores: ${c.dores}`).join('\n');
            const casesBlob = JSON.stringify(CASES_NCIV);

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

        if (cadencia === 'Nurturing' || cadencia === 'Re-engajement do Nurturing') {
            // O fluxo original NCiv apenas passava a bola sem fazer nada. 
            // Mantendo a compatibilidade estrita orginal.
            console.log(`[NCiv] Cadência '${cadencia}' bypassada diretamente sem execução de agent.`);
            return { bypass: true, original_workout: workflow };

        } else if (cadencia === 'Retomada') {

            if (etapa === 1) {
                // Roda RedatorDeRetomadaCase
                const redatorInput = createRedatorInput(etapa, input_as_text, "", emails_anteriores);
                console.log(`[NCiv] Rodando RedatorDeRetomadaCase para Etapa 1`);
                const redatorRun = yield* this._runRedator(
                    this.RedatorDeRetomadaCase,
                    redatorInput,
                    [],
                    previousResponseId
                );
                this._trackResponseId(workflow, "RedatorDeRetomadaCase", redatorRun.response_id);
                return redatorRun.data;
            }
            else if (etapa === 2 || etapa === 3 || etapa === 4) {
                const redatorInput = createRedatorInput(etapa, input_as_text, "", emails_anteriores);
                console.log(`[NCiv] Rodando RedatorDeRetomadaFup para Etapa ${etapa}`);
                const redatorRun = yield* this._runRedator(
                    this.RedatorDeRetomadaFup,
                    redatorInput,
                    [],
                    previousResponseId
                );
                this._trackResponseId(workflow, "RedatorDeRetomadaFup", redatorRun.response_id);
                return redatorRun.data;
            }

        }

        throw new Error(`[NCiv] Cadeia ou etapa não foi mapeada: Cadencia '${cadencia}', Etapa '${etapa}'`);
    }
};

if (typeof globalThis !== 'undefined') {
    globalThis.Flow_FluxoNCiv = Flow_FluxoNCiv;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Flow_FluxoNCiv;
}

const CASES_NCIV = [
    {
        "id": "CASE_01",
        "setor": "Arquitetura / Design de Interiores",
        "dores": "apartamento antigo desatualizado, layout ineficiente, problemas de circulação, móveis mal distribuídos, falta de conforto",
        "problema": "Albertoni e Silvia possuíam um apartamento antigo com planta desatualizada, que apresentava problemas de circulação, má disposição de móveis e falta de conforto, impedindo que o casal retornasse a morar no local.",
        "solucao": "Realização de estudo detalhado de layout para integração de ambientes através da remoção de paredes e planejamento estratégico de móveis sob medida para otimização de espaço, especialmente na cozinha.",
        "impacto": "Transformação do apartamento em um espaço moderno, funcional e confortável, valorizando o imóvel e atendendo plenamente a todas as expectativas de moradia do casal."
    },
    {
        "id": "CASE_02",
        "setor": "Arquitetura / Arquitetura Residencial",
        "dores": "necessidade de arquitetura personalizada, falta de residência própria, busca por conceito aberto, integração de lazer",
        "problema": "O casal Mirian e Cláudio desejava construir uma residência própria personalizada em Arujá, mas precisavam de um projeto que integrasse iluminação natural, conceito aberto e áreas de descanso de acordo com seus sonhos.",
        "solucao": "Desenvolvimento de um projeto arquitetônico personalizado com foco em conceito aberto, otimização de iluminação natural e áreas dedicadas ao descanso.",
        "impacto": "Entrega de um projeto residencial exclusivo de alto padrão, perfeitamente alinhado aos desejos e necessidades de lazer e moradia do casal."
    },
    {
        "id": "CASE_03",
        "setor": "Arquitetura / Arquitetura Residencial",
        "dores": "formato de terreno atípico, necessidade de lazer e descanso, falta de integração de ambientes, necessidade de aprovação legal",
        "problema": "A família Costa possuía um terreno atípico de 850 m² nos arredores de São Paulo e desejava construir uma residência moderna e integrada que servisse de refúgio de lazer, mas carecia de projetos técnicos e de documentação para aprovação legal.",
        "solucao": "Desenvolvimento de projeto arquitetônico com pé-direito duplo, living integrado à área externa, varandas e edícula, além da elaboração das plantas baixas, planta legal para prefeitura e renderizações realistas em 3D.",
        "impacto": "Materialização de uma residência sofisticada com excelente iluminação e ventilação natural, entregando toda a documentação necessária para aprovação municipal e superando as expectativas da família."
    },
    {
        "id": "CASE_04",
        "setor": "Arquitetura Comercial / Saúde",
        "dores": "gargalo de espaço físico, limitações de especialidades clínicas, falta de projetos complementares, experiência do paciente ruim",
        "problema": "O proprietário de uma clínica odontológica desejava expandir as especialidades atendidas e melhorar o conforto dos pacientes, mas necessitava de projetos arquitetônicos e complementares de engenharia para viabilizar a ampliação.",
        "solucao": "Elaboração de projeto arquitetônico comercial focado na otimização de consultórios e recepção, acompanhado do desenvolvimento dos projetos estrutural, elétrico e hidrossanitário.",
        "impacto": "Ampliação e organização eficiente da clínica odontológica, proporcionando um espaço de trabalho acolhedor e tecnicamente adequado que impulsionou o crescimento do negócio."
    },
    {
        "id": "CASE_05",
        "setor": "Mercado Imobiliário / Incorporação",
        "dores": "inviabilidade de construção, falta de terreno ideal, desconhecimento de mercado estudantil, riscos de investimento",
        "problema": "O cliente pretendia construir um edifício residencial universitário em Campinas, mas descobriu que o terreno original era inviável para a construção vertical, demandando a busca por uma nova localização estratégica e um estudo de mercado.",
        "solucao": "Análise técnico-econômica de viabilidade, estudo de investimento focado no público universitário e pesquisa geoespacial com softwares especializados para seleção de novos terrenos próximos às faculdades.",
        "impacto": "Indicação e entrega de um terreno ideal e de alto potencial comercial, mitigando riscos de investimento e garantindo a viabilidade técnica e financeira para o empreendimento imobiliário."
    },
    {
        "id": "CASE_06",
        "setor": "Engenharia Civil / Projetos Complementares",
        "dores": "falta de projetos de engenharia, pressa para iniciar obra, terreno com peculiaridades estruturais, risco de erros de execução, necessidade de muro de arrimo",
        "problema": "Um casal desejava iniciar rapidamente a construção de uma residência de 4 andares e 350m² com piscina, mas possuía apenas o projeto arquitetônico básico, necessitando de projetos de engenharia civil altamente detalhados e compatibilizados.",
        "solucao": "Concepção e dimensionamento dos projetos estrutural (incluindo muro de arrimo), elétrico e hidrossanitário em plataforma BIM, gerando modelos 3D compatibilizados e pranchas executivas detalhadas.",
        "impacto": "Entrega de um projeto de engenharia otimizado e compatibilizado que eliminou riscos de interferências físicas na obra, permitindo o início ágil, seguro e bem-planejado da construção."
    },
    {
        "id": "CASE_07",
        "setor": "Arquitetura Comercial / Lazer",
        "dores": "necessidade de aprovação de documentos, incerteza de demanda de mercado, falta de planejamento operacional, alto risco de investimento",
        "problema": "Um casal adquiriu um lote de praia no Ceará para construir um comércio de abastecimento local, mas necessitava de documentação para aprovação na prefeitura, análise de demanda do mercado local e projetos de engenharia e arquitetura inteiros.",
        "solucao": "Elaboração de pesquisa de mercado da região litorânea associada ao desenvolvimento dos projetos arquitetônico, estrutural, elétrico e hidrossanitário, com foco na eficiência do funcionamento comercial.",
        "impacto": "Entrega da documentação legal e técnica completa para a prefeitura e maior inteligência de mercado ao cliente, assegurando um investimento seguro, consciente e estruturado."
    },
    {
        "id": "CASE_08",
        "setor": "Engenharia Civil e Arquitetura / Arquitetura Residencial",
        "dores": "terreno acentuado desafiador, falta de ideias de design, necessidade de automação e sustentabilidade, burocracia de aprovação legal",
        "problema": "Um casal desejava construir um triplex sustentável em Ribeirão Preto em um terreno de aclive acentuado, mas carecia de conceitos arquitetônicos e exigia a compatibilização estrutural para uma casa automatizada e ecológica.",
        "solucao": "Desenvolvimento de arquitetura moderna e projetos complementares de engenharia (estrutura de concreto armado, elétrica fotovoltaica e hidráulica com captação pluvial), gerando renderizações 3D realistas, listas de materiais e documentação legal.",
        "impacto": "Concepção de um projeto residencial triplex moderno e ecológico totalmente compatibilizado para automação futura, gerando segurança estrutural e economia para a obra."
    },
    {
        "id": "CASE_09",
        "setor": "Engenharia Civil / Projetos Complementares",
        "dores": "solo instável, incompatibilidade com esgoto, falta de projetos complementares, risco de execution da obra",
        "problema": "Após adquirir um projeto de arquitetura para seu sobrado em Paraty, o cliente enfrentava desafios técnicos severos como solo instável e incompatibilidade de esgoto da rede local, necessitando de projetos de engenharia civil para iniciar a construção com segurança.",
        "solucao": "Desenvolvimento e compatibilização em 3D dos projetos estrutural (adaptado ao solo instável), elétrico e hidrossanitário (com solução para a incompatibilidade de esgoto).",
        "impacto": "Viabilização técnica e segura da construção do sobrado, resultando em uma execução de obra fluida e em andamento sem imprevistos geológicos ou hidráulicos."
    },
    {
        "id": "CASE_10",
        "setor": "Arquitetura / Arquitetura Residencial",
        "dores": "terreno com inclinação acentuada, necessidade de integração com a natureza, falta de projeto adaptado à topografia",
        "problema": "A cliente desejava construir a casa dos seus sonhos em Atibaia integrada à natureza, mas enfrentava o desafio de um terreno com inclinação muito acentuada, exigindo soluções arquitetônicas inovadoras para evitar altos custos com movimentação de terra.",
        "solucao": "Desenvolvimento de projeto arquitetônico em múltiplos níveis residenciais aproveitando a inclinação natural do terreno, com fachadas em grandes esquadrias de vidro e criação de um mirante com piscina integrada.",
        "impacto": "Concepção de uma residência contemporânea integrada à topografia local e à paisagem externa, proporcionando conforto térmico e iluminação natural sem comprometer a estrutura."
    },
    {
        "id": "CASE_11",
        "setor": "Engenharia Civil e Arquitetura / Reforma e Retrofit",
        "dores": "imóvel inabitável de leilão, instalações elétricas perigosas, hidráulica quebrada, falta de supervisão de pedreiros, risco de incêndio",
        "problema": "A cliente adquiriu uma casa de leilão em condições inabitáveis e, devido a problemas de financiamento, realizou reformas elétricas e hidráulicas emergenciais sem supervisão, criando riscos graves de mau cheiro e curto-circuito/incêndio.",
        "solucao": "Elaboração de projeto arquitetônico com modelos de disposição interna e auditoria detalhada em campo das instalações executadas, gerando um dossiê técnico de validação e correção de erros.",
        "impacto": "Identificação e correção de falhas de segurança críticas na parte elétrica e hidrossanitária, transformando um imóvel inabitável e perigoso em um lar seguro e acolhedor."
    },
    {
        "id": "CASE_12",
        "setor": "Engenharia Civil / Projetos Complementares",
        "dores": "falta de projetos complementares, arquitetura complexa com grandes balanços, dificuldade de compatibilização, transição de arquitetura para engenharia",
        "problema": "Após contratar um projeto arquitetônico moderno e complexo com grandes balanços estruturais, a cliente não sabia como desenvolver os projetos de engenharia necessários para viabilizar a obra com segurança.",
        "solucao": "Desenvolvimento de renderizações realistas e dimensionamento dos projetos complementares (estrutural, elétrico e hidrossanitário), compatibilizando os sistemas e resolvendo desafios de grandes balanços.",
        "impacto": "Viabilização estrutural e técnica do projeto arquitetônico imponente, garantindo segurança na execução e satisfazendo plenamente a família."
    },
    {
        "id": "CASE_13",
        "setor": "Engenharia Civil e Arquitetura / Arquitetura Residencial",
        "dores": "terreno estreito, terreno em declive, necessidade de economia na obra, falta de detalhamento executivo, necessidade de projeto decorativo",
        "problema": "A cliente desejava construir rapidamente um sobrado em um terreno estreito (5m de frente) e em declive acentuado, necessitando de uma solução de layout otimizada e de projetos de engenharia econômicos.",
        "solucao": "Desenvolvimento de projeto arquitetônico com layout otimizado e aproveitamento do declive (garagem no nível da rua e platô residencial), aliado aos projetos de engenharia (estrutural, hidráulico e elétrico) em plataforma BIM.",
        "impacto": "Entrega de plantas executivas, lista de materiais detalhada e paginação de pisos, resultando em grande economia estrutural e total satisfação no planejamento de decoração interna."
    },
    {
        "id": "CASE_14",
        "setor": "Engenharia Civil / Projetos Complementares",
        "dores": "terreno com declive nos fundos, necessidade de contenção de terra, busca por redução de gastos, pressa no cronograma",
        "problema": "O proprietário possuía o projeto arquitetônico de sua casa em Porangaba-SP, mas precisava de projetos complementares de engenharia (estrutural, hidráulico, elétrico) otimizados e de uma solução para conter um declive de um metro nos fundos do terreno.",
        "solucao": "Concepção de projetos complementares integrados em BIM com dimensionamento de paredes de contenção para o declive, entregando também lista de materiais, renderizações 3D e pranchas detalhadas.",
        "impacto": "Entrega com um mês de antecedência do projeto estrutural otimizado, gerando segurança contra deslizamentos, redução de gastos na obra e extrema satisfação que resultou em fidelização do cliente."
    },
    {
        "id": "CASE_15",
        "setor": "Arquitetura / Design de Interiores",
        "dores": "apartamento inacabado no contrapiso, paredes estruturais intransponíveis, falta de definição de cores e acabamentos, layout de móveis indefinido",
        "problema": "Um casal adquiriu um apartamento inacabado no contrapiso e não conseguia habitá-lo devido à falta de revestimentos, acabamentos e pela limitação física de paredes estruturais que impediam modificações na alvenaria.",
        "solucao": "Desenvolvimento de projeto completo de design de interiores sob medida para todos os cômodos, especificando revestimentos, paletas de cores, iluminação e disposição estratégica de móveis planejados.",
        "impacto": "Transformação do apartamento cru em um ambiente totalmente personalizado, aconchegante e funcional, superando as restrições estruturais de alvenaria."
    },
    {
        "id": "CASE_16",
        "setor": "Arquitetura / Design de Interiores",
        "dores": "apartamento vazio no contrapiso, falta de revestimentos e pinturas, limitação por paredes estruturais, dificuldade na escolha de materiais",
        "problema": "Após receber as chaves de um apartamento novo entregue apenas no contrapiso, o casal não sabia como decorá-lo e revesti-lo, enfrentando também restrições de layout impostas por paredes estruturais que impossibilitavam demolições.",
        "solucao": "Elaboração de projeto de design de interiores completo para todos os cômodos, mapeando os desejos dos clientes e definindo layout de móveis, iluminação e seleção detalhada de materiais e revestimentos.",
        "impacto": "Entrega de um projeto totalmente personalizado e pronto para execução, transformando o espaço de concreto bruto em um apartamento moderno, funcional e acolhedor."
    },
    {
        "id": "CASE_17",
        "setor": "Engenharia Civil e Arquitetura / Arquitetura Residencial",
        "dores": "necessidade de sustentabilidade no campo, alto consumo de recursos, falta de compatibilização em 3D, busca por economia de longo prazo",
        "problema": "Um casal desejava construir um residência de campo moderna no interior de São Paulo, porém necessitava de soluções de engenharia que viabilizassem o uso eficiente de recursos e a autossuficiência sustentável da moradia.",
        "solucao": "Desenvolvimento e compatibilização tridimensional de projetos de engenharia civil com sistemas de captação de água pluvial e geração de energia solar por painéis fotovoltaicos integrados à arquitetura.",
        "impacto": "Entrega de uma residência sustentável, moderna e de alta eficiência econômica, garantindo redução expressiva nas contas de água e energia no campo."
    },
    {
        "id": "CASE_18",
        "setor": "Arquitetura / Arquitetura Residencial",
        "dores": "distância geográfica da obra, burocracia com prefeitura local, necessidade de rentabilidade com aluguel, falta de visualização do projeto",
        "problema": "A cliente desejava projetar do zero uma residência de veraneio e aluguel de temporada em Maragogi-AL, enfrentando a barreira da distância física e a necessidade de aprovação legal junto à prefeitura local.",
        "solucao": "Desenvolvimento remoto de projeto arquitetônico completo, integrando 4 suítes, sala e cozinha integradas e área de lazer, baseado em topografia parceira e reuniões virtuais de alinhamento.",
        "impacto": "Entrega de todas as plantas executivas, paginação e maquete 3D para aprovação legal e execução de obra, gerando excelente aproveitamento da vista local e fidelização da cliente para futuros projetos."
    },
    {
        "id": "CASE_19",
        "setor": "Engenharia Civil / Projetos Complementares",
        "dores": "alto custo inicial de obra, prazos curtos para início, falta de compatibilização estrutural, necessidade de economia de materiais",
        "problema": "A cliente possuía apenas o projeto arquitetônico e desejava iniciar a construção da casa própria com o menor custo inicial possível, necessitando de projetos de engenharia civil econômicos e rápidos para permitir a construção em etapas.",
        "solucao": "Concepção ágil dos projetos estrutural, elétrico e hidrossanitário em BIM com dimensionamento estrutural inteligente focado em economia de concreto, concluídos em apenas 5 semanas.",
        "impacto": "Entrega rápida de plantas executivas, lista de materiais e memoriais de cálculo, promovendo economia de materiais na obra e mitigando potenciais retrabalhos físicos por colisão de instalações."
    },
    {
        "id": "CASE_20",
        "setor": "Arquitetura / Design de Interiores",
        "dores": "espaço reduzido, exigências de alto padrão, necessidade de atração de locatários jovens, falta de praticidade e conforto",
        "problema": "O cliente precisava reformar um apartamento de metragem reduzida voltado a locatários jovens, demandando alta qualidade estética e móveis extremamente funcionais para garantir conforto e rápida locação.",
        "solucao": "Elaboração de projeto de design de interiores com foco em soluções de marcenaria inteligente, aproveitamento de espaço e estética jovem e moderna.",
        "impacto": "Entrega no prazo de um ambiente moderno e altamente prático, unindo sofisticação e conforto, garantindo a satisfação do investidor com um produto atrativo no mercado imobiliário."
    },
    {
        "id": "CASE_21",
        "setor": "Arquitetura / Urbanismo e Revitalização",
        "dores": "orçamento de licitação limitado, restrições urbanísticas rígidas, praça degradada inutilizada, preservação de vegetação nativa",
        "problema": "Um assistente social desejava participar de uma licitação pública para reformar a praça do Largo Sete de Setembro (Sé/SP), mas enfrentava um orçamento municipal restrito e a impossibilidade de remover árvores centenárias e postes existentes.",
        "solucao": "Desenvolvimento de projeto de revitalização urbana inovador utilizando contêineres pré-fabricados móveis para cafés e galerias, integrando áreas kids e coworking, preservando o patrimônio vegetal e gerando passeio virtual e maquete 3D.",
        "impacto": "Viabilização do projeto sociocultural dentro dos limites orçamentários, promovendo a harmonia entre o patrimônio natural da praça e novas funcionalidades públicas acolhedoras."
    },
    {
        "id": "CASE_22",
        "setor": "Engenharia Civil e Arquitetura / Arquitetura Residencial",
        "dores": "terreno em aclive acentuado, lençol freático raso, solo ruim de baixa capacidade, normas de condomínio rigorosas, burocracia municipal",
        "problema": "A cliente possuía um terreno altamente desafiador em aclive, com solo fraco e cortado por lençol freático a apenas dois metros de profundidade, inviabilizando fundações e drenagens tradicionais para a construção de sua residência.",
        "solucao": "Desenvolvimento de projeto arquitetônico aberto em painéis de vidro e dimensionamento de projetos complementares (estrutural, hidráulico com drenagem de lençol e elétrico) otimizados de acordo com normas técnicas locais.",
        "impacto": "Concepção segura e viável do imóvel adaptada às patologias do solo e do lençol freático, fornecendo toda a documentação legal aprovada na prefeitura e gerando imensa satisfação da cliente."
    },
    {
        "id": "CASE_23",
        "setor": "Arquitetura / Arquitetura Residencial",
        "dores": "necessidade de integração de lazer, falta de móveis planejados funcionais, busca por estética biofílica contemporânea",
        "problema": "A família Milani buscava projetar uma casa contemporânea de dois andares (200m²) em Barbacena, necessitando de uma integração fluida entre áreas sociais e de lazer e de soluções de marcenaria sob medida que atendessem a hobbies específicos da família.",
        "solucao": "Elaboração de projeto arquitetônico personalizado focado em elementos curvos e aberturas em arco, com áreas integradas por portas de correr de vidro, e desenvolvimento de projetos de marcenaria e paisagismo biofílico.",
        "impacto": "Concepção de uma residência harmoniosa de alta funcionalidade e estética integrada à natureza, superando plenamente as expectativas de conforto e recepção social dos clientes."
    },
    {
        "id": "CASE_24",
        "setor": "Engenharia Civil e Arquitetura / Arquitetura Residencial",
        "dores": "busca por sustentabilidade residencial, falta de conforto doméstico, necessidade de personalização estrutural",
        "problema": "A família Araújo precisava de um projeto residencial próprio em São Bernardo que solucionasse gargalos estruturais e térmicos locais, alinhando a edificação à sustentabilidade e ao conforto de forma personalizada.",
        "solucao": "Concepção de projeto arquitetônico residencial customizado integrado a soluções de sustentabilidade e eficiência termoacústica de engenharia.",
        "impacto": "Viabilização do projeto da casa própria de forma econômica, personalizada e ecológica, garantindo alta qualidade de vida e conforto à família."
    },
    {
        "id": "CASE_25",
        "setor": "Engenharia Civil / Projetos Complementares",
        "dores": "terreno extenso de 10.000m², alta complexidade estrutural de múltiplos chalés, ausência de projetos de engenharia, risco de incompatibilidade física em obra",
        "problema": "Um casal de empreendedores possuía a arquitetura de um complexo residencial de lazer em Cunha (contendo casa própria, oficinas e 6 chalés para aluguel), mas necessitava de projetos estruturais e complementares complexos para iniciar as obras em um terreno de 10.000m² com topografia rural.",
        "solucao": "Concepção e compatibilização estrutural, hidráulica e elétrica em plataforma BIM para as diferentes edificações rurais do complexo imobiliário, gerando pranchas de alto detalhamento técnico e modelos 3D executivos.",
        "impacto": "Compatibilização robusta das instalações que eliminou qualquer interferência ou colisão mecânica antes da obra, assegurando um início estruturado e seguro do empreendimento comercial do casal."
    },
    {
        "id": "CASE_26",
        "setor": "Arquitetura / Arquitetura Residencial",
        "dores": "desejo de viver em área ambiental protegida, alto impacto ambiental de construções, busca por arquitetura sustentável",
        "problema": "O cliente desejava edificar sua residência à beira-mar em Ubatuba em harmonia com a Mata Atlântica nativa, necessitando de um design arquitetônico ecológico de baixo impacto ambiental.",
        "solucao": "Elaboração de projeto arquitetônico residencial sustentável integrado à paisagem costeira local com foco em materiais ecológicos e baixo consumo energético.",
        "impacto": "Concepção bem-sucedida de um design biofílico integrado à natureza costeira de Ubatuba, realizando o sonho do cliente com responsabilidade socioambientais."
    },
    {
        "id": "CASE_27",
        "setor": "Engenharia Civil e Arquitetura / Arquitetura Residencial",
        "dores": "terreno com aclive acentuado, demanda por casa térrea sem degraus, necessidade de acessibilidade, alto custo de movimentação de terra",
        "problema": "O cliente desejava construir uma casa térrea perfeitamente plana e acessível (sem degraus internos) em Rio Claro, mas enfrentava o obstáculo de um terreno altamente inclinado, o que exigiria grandes escavações e aterros caros.",
        "solucao": "Desenvolvimento de projeto arquitetônico acessível integrado a soluções estruturais inteligentes de fundação adaptada à inclinação do terreno, aliadas a projetos hidráulico e elétrico compatibilizados sem movimentações massivas de solo.",
        "impacto": "Concepção da residência térrea e fluida com total acessibilidade sem necessitar de gastos excessivos em terraplanagem, garantindo conforto e segurança estrutural."
    },
    {
        "id": "CASE_28",
        "setor": "Engenharia Civil e Arquitetura / Arquitetura Residencial",
        "dores": "alto nível de exigência técnica de clientes engenheiros, falta de projetos integrados detalhados, necessidade de energia renovável, burocracia de aprovação legal",
        "problema": "Um casal de engenheiros desejava projetar sua casa ideal com alto nível de rigor técnico e detalhamento executivo, incluindo soluções avançadas de sustentabilidade energética, além da necessidade de aprovação legal na prefeitura de Taubaté.",
        "solucao": "Desenvolvimento de projeto arquitetônico detalhado integrado a projetos complementares de engenharia (estrutura, elétrica com geração fotovoltaica e aquecimento térmico solar, e hidráulica) em plataforma 3D.",
        "impacto": "Concepção com altíssimo rigor técnico de pranchas executivas e lista de materiais, fornecendo a visualização realista das instalações e aprovação célere na prefeitura."
    }
];

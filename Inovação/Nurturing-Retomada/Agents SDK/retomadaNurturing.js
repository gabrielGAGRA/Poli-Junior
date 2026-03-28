/**
 * =================================================================
 * POLI JÚNIOR - AI SALES ENGINE (2026)
 * Orquestrador Multi-Agente: OpenAI Responses API + Pipedrive
 * =================================================================
 * * FLUXO:
 * 1. Sincronização e Resumo Único (Analista)
 * 2. Identificação de Passo e Governança de Membros
 * 3. Geração de E-mail Contextual (Redator) com Histórico
 */

/**
 * =================================================================
 * ENTRY POINT 1: SINCRONIZAÇÃO E ANÁLISE (O "CÉREBRO")
 * =================================================================
 */

function syncAndSummarize() {
    const stagesToSync = Object.keys(WORKFLOW_STAGE_MAPPING).map(Number);
    let deals = PipedriveRepository.fetchDealsInStages(stagesToSync);

    deals = deduplicateDeals(deals);

    deals.forEach(deal => {
        try {
            console.log(`\n--- Analisando Negócio #${deal.id}: ${deal.title} ---`);

            let notesForSummary = [];
            let needsSummary = false;

            // 1. Sincroniza notas brutas se o card estiver vazio (novo card duplicado)
            if (deal.notes_count === 0) {
                const originalDealId = deal[ORIGIN_ID_FIELD];
                if (originalDealId) {
                    notesForSummary = PipedriveRepository.syncOriginNotes(deal.id, originalDealId);
                    needsSummary = notesForSummary.length > 0;
                }
            } else {
                // 2. Se já tem notas, busca da API e verifica se já existe resumo
                notesForSummary = PipedriveRepository.getNotesFromDeal(deal.id);
                const hasSummary = notesForSummary.some(n => n.content && n.content.includes(AGENT_CONFIG.RESUMO_PREFIX));
                needsSummary = !hasSummary && notesForSummary.length > 0;
            }

            // 3. Gera o resumo imutável se necessário, reaproveitando as notas buscadas (evitando nova requisição)
            if (needsSummary) {
                generateStrategicSummary(deal, notesForSummary);
            } else {
                console.log(`✅ Negócio #${deal.id} já possui resumo ou não tem notas originais para resumir.`);
            }
        } catch (e) {
            console.error(`Erro na fase de análise do Deal ${deal.id}: ${e.toString()}`);
        }
    });
}

function generateStrategicSummary(deal, notes) {
    const rawNotesText = notes
        .filter(n => n.content && !n.content.includes(AGENT_CONFIG.RESUMO_PREFIX))
        .map(n => n.content.replace(/<[^>]*>?/gm, ' '))
        .join('\n---\n');

    if (!rawNotesText.trim()) return;

    const nucleus = getNucleusInfo(deal[CUSTOM_FIELDS.LABEL]);

    const payload = {
        input_as_text: rawNotesText,
        nucleo: nucleus.abreviacao,
        nucleo_nome_completo: nucleus.nome_completo
    };

    const summary = OpenAIRepository.callWorkflow(AGENT_CONFIG.WORKFLOW_ANALISTA_ID, payload);

    if (summary) {
        const content = `<h1>${AGENT_CONFIG.RESUMO_PREFIX}</h1>\n${summary}`;
        PipedriveRepository.createNote(deal.id, content);
        console.log(`✅ Resumo estratégico gerado para o núcleo: ${nucleus.abreviacao}`);
    }
}

/**
 * =================================================================
 * ENTRY POINT 2: GERAÇÃO DE E-MAIL (A "VOZ")
 * =================================================================
 */

function executeEmailCadence() {
    const activeUsers = PipedriveRepository.getActiveUsers();
    const stagesToProcess = Object.keys(WORKFLOW_STAGE_MAPPING).map(Number);
    let deals = PipedriveRepository.fetchDealsInStages(stagesToProcess);

    deals = deduplicateDeals(deals);

    deals.forEach(deal => {
        try {
            // 1. Identifica Etapa, Núcleo e se Owner está ativo
            const stepInfo = WORKFLOW_STAGE_MAPPING[deal.stage_id];
            const nucleus = (deal[CUSTOM_FIELDS.LABEL] || 'NDados'); // Fallback para NDados
            const isOwnerActive = activeUsers.includes(deal.user_id.id);

            // Seleciona Workflow específico com base no Núcleo e Status do Owner
            let workflowId;
            if (isOwnerActive) {
                const workflowMap = AGENT_CONFIG.WORKFLOW_REDACAO_ATIVO;
                workflowId = workflowMap[nucleus] || workflowMap['NDados'];
            } else {
                workflowId = AGENT_CONFIG.WORKFLOW_REDACAO_INATIVO;
            }

            // 2. Coleta o Resumo Único
            const summaryNote = PipedriveRepository.findSummaryNote(deal.id);
            if (!summaryNote) return;

            // 3. Coleta Histórico de E-mails (JSON)
            const emailHistory = PipedriveRepository.fetchEmailHistory(deal.id);

            // 4. Monta o Super Payload para a OpenAI
            const companyName = deal.org_name || "Desconhecida";
            const companySector = deal[CUSTOM_FIELDS.COMPANY_SECTOR] || "Não informado";
            const combinedInput = `Empresa: ${companyName}\nSetor: ${companySector}\n\nResumo Estratégico:\n${summaryNote.content}`;

            const payload = {
                input_as_text: combinedInput,
                cadencia: stepInfo.cadencia,
                etapa: stepInfo.passo,
                emails_anteriores: JSON.stringify(emailHistory),
                nucleo_nome_completo: getNucleusInfo(nucleus).nome_completo,
                nome_owner_desativado: deal.user_id.name
            };

            // 5. Gera o e-mail via Responses API
            const result = OpenAIRepository.callWorkflow(workflowId, payload);

            if (result) {
                // Assume que o agente retorna um JSON via Structured Output
                const emailData = typeof result === 'string' ? JSON.parse(result) : result;
                PipedriveRepository.saveEmailToDeal(deal.id, emailData.titulo, emailData.corpo_html);
                console.log(`✅ E-mail do passo ${stepInfo.passo} (${stepInfo.cadencia}) gerado.`);
            }

        } catch (e) {
            console.error(`Erro na geração de e-mail do Deal ${deal.id}: ${e.toString()}`);
        }
    });
}

/**
 * =================================================================
 * REPOSITORIES - CAMADA DE ACESSO A DADOS
 * =================================================================
 */

var PipedriveRepository = {
    fetchDealsInStages: function (stageIds) {
        let allDeals = [];
        stageIds.forEach(id => {
            const url = `${PIPEDRIVE_API_BASE_URL}/deals?stage_id=${id}&status=open&api_token=${PIPEDRIVE_API_TOKEN}`;
            const resp = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
            const data = JSON.parse(resp.getContentText());
            if (data.success && data.data) allDeals = allDeals.concat(data.data);
        });
        return allDeals;
    },

    getNotesFromDeal: function (dealId) {
        const url = `${PIPEDRIVE_API_BASE_URL}/notes?deal_id=${dealId}&api_token=${PIPEDRIVE_API_TOKEN}`;
        const resp = UrlFetchApp.fetch(url, { method: 'get' });
        return JSON.parse(resp.getContentText()).data || [];
    },

    findSummaryNote: function (dealId) {
        const notes = this.getNotesFromDeal(dealId);
        const summaries = notes
            .filter(n => n.content.includes(AGENT_CONFIG.RESUMO_PREFIX))
            .sort((a, b) => new Date(b.add_time) - new Date(a.add_time));
        return summaries.length > 0 ? summaries[0] : null;
    },

    getActiveUsers: function () {
        const cache = CacheService.getScriptCache();
        const cached = cache.get('active_users');
        if (cached) return JSON.parse(cached);

        const url = `${PIPEDRIVE_API_BASE_URL}/users?api_token=${PIPEDRIVE_API_TOKEN}`;
        const resp = UrlFetchApp.fetch(url);
        const users = JSON.parse(resp.getContentText()).data;
        const activeIds = users.filter(u => u.active_flag).map(u => u.id);

        cache.put('active_users', JSON.stringify(activeIds), 3600);
        return activeIds;
    },

    fetchEmailHistory: function (dealId) {
        const url = `${PIPEDRIVE_API_BASE_URL}/deals/${dealId}/mailMessages?api_token=${PIPEDRIVE_API_TOKEN}`;
        const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        const data = JSON.parse(resp.getContentText()).data;
        if (!data) return [];

        return data.slice(0, 5).map(msg => ({
            origem: msg.from[0].email.includes("polijunior") ? "Poli Júnior" : "Cliente",
            data: msg.add_time,
            preview: msg.snippet.substring(0, 200).replace(/<[^>]*>?/gm, '')
        }));
    },

    createNote: function (dealId, content) {
        const url = `${PIPEDRIVE_API_BASE_URL}/notes?api_token=${PIPEDRIVE_API_TOKEN}`;
        const payload = { deal_id: dealId, content: content };
        UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload) });
    },

    syncOriginNotes: function (dealId, originalDealId) {
        if (!originalDealId) return [];

        const originalNotes = this.getNotesFromDeal(originalDealId);
        if (originalNotes && originalNotes.length > 0) {
            for (const note of originalNotes) {
                const cleanedContent = (note.content || "").replace(/<[^>]*>?/gm, ' ');
                this.createNote(dealId, cleanedContent);
                Utilities.sleep(300); // Sleep para não sobrecarregar API
            }
        }

        return originalNotes;
    },

    saveEmailToDeal: function (dealId, title, body) {
        const url = `${PIPEDRIVE_API_BASE_URL}/deals/${dealId}?api_token=${PIPEDRIVE_API_TOKEN}`;
        const payload = {
            [CUSTOM_FIELDS.EMAIL_TITLE]: title,
            [CUSTOM_FIELDS.EMAIL_BODY]: body
        };
        UrlFetchApp.fetch(url, { method: 'put', contentType: 'application/json', payload: JSON.stringify(payload) });
    },

    markDealAsLost: function (dealId, reason) {
        const url = `${PIPEDRIVE_API_BASE_URL}/deals/${dealId}?api_token=${PIPEDRIVE_API_TOKEN}`;
        const payload = {
            status: 'lost',
            lost_reason: reason
        };
        UrlFetchApp.fetch(url, { method: 'put', contentType: 'application/json', payload: JSON.stringify(payload) });
    }
};

var OpenAIRepository = {
    callWorkflow: function (workflowId, data) {
        const url = 'https://api.openai.com/v1/responses';
        const payload = {
            model: "gpt-5-preview", // Ou modelo 'mini' para o Analista
            workflow_id: workflowId,
            input: [{ role: "user", content: JSON.stringify(data) }]
        };

        const options = {
            method: 'post',
            headers: {
                'Authorization': 'Bearer ' + (OPENAI_API_KEY || PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY')),
                'Content-Type': 'application/json'
            },
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };

        const resp = UrlFetchApp.fetch(url, options);
        const result = JSON.parse(resp.getContentText());

        if (resp.getResponseCode() !== 200) {
            console.error("Erro OpenAI:", result);
            return null;
        }

        return result.output;
    }
};

/**
 * Auxiliar: Mapeia etiqueta para Info Completa do Núcleo
 */
function getNucleusInfo(labelId) {
    const nuclei = {
        'NDados': { abreviacao: 'NDados', nome_completo: 'Núcleo de Análise de Dados e Inteligência Artificial' },
        'NCon': { abreviacao: 'NCon', nome_completo: 'Núcleo de Gestão Empresarial e Consultoria' },
        'NTec': { abreviacao: 'NTec', nome_completo: 'Núcleo de Tecnologia e Desenvolvimento de Software' },
        'NCiv': { abreviacao: 'NCiv', nome_completo: 'Núcleo de Engenharia Civil e Arquitetura' }
    };

    // Se o labelId for texto ou ID, você precisará ajustar a lógica de busca aqui
    return nuclei[labelId] || nuclei['NDados']; // Fallback para NDados
}

/**
 * =================================================================
 * DEDUPLICAÇÃO E LIMPEZA
 * =================================================================
 */

function deduplicateDeals(deals) {
    if (!deals || deals.length === 0) return deals;

    console.log("🚀 Lendo negócios para deduplicação no funil...");
    const groups = {};

    deals.forEach(deal => {
        const personId = deal.person_id ? deal.person_id.value : 'NO_PERSON';
        const orgId = deal.org_id ? deal.org_id.value : 'NO_ORG';

        // Critério principal: ID da pessoa e ID da organização (se ambos faltando, usa o título)
        let key = `${personId}_${orgId}`;
        if (personId === 'NO_PERSON' && orgId === 'NO_ORG') {
            key = 'TITLE_' + deal.title;
        }

        if (!groups[key]) groups[key] = [];
        groups[key].push(deal);
    });

    const uniqueDeals = [];
    let totalRemoved = 0;

    for (const key in groups) {
        const dealList = groups[key];

        if (dealList.length < 2) {
            uniqueDeals.push(dealList[0]);
            continue;
        }

        console.log(`⚠️ [DUPLICATE] Key: ${key} | Qty: ${dealList.length}`);

        // O mais antigo ganha e os outros viram "perdidos" (Lost)
        dealList.sort((a, b) => new Date(a.add_time) - new Date(b.add_time));

        const winner = dealList[0];
        const losers = dealList.slice(1);

        console.log(`   👑 Winner: ID ${winner.id} ("${winner.title}") - Created: ${winner.add_time}`);
        uniqueDeals.push(winner);

        losers.forEach(loserDeal => {
            console.log(`   📉 Marking LOST ID ${loserDeal.id}...`);
            PipedriveRepository.markDealAsLost(loserDeal.id, 'Duplicidade detectada via Script Automático antes de IA (Nurturing/Retomada)');
            totalRemoved++;
            Utilities.sleep(150); // Delay de segurança
        });
    }

    if (totalRemoved > 0) {
        console.log(`📊 Limpeza Completa: ${totalRemoved} negócios duplicados removidos.`);
    }

    return uniqueDeals;
}
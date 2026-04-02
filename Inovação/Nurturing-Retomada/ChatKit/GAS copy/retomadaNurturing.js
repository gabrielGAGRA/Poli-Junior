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

// ====== CONTROLE DE TEMPO E LIMITES ======
const SCRIPT_START_TIME = Date.now();
// Vercel suporta até 300s. Adotamos 240s para ter 60s de margem de segurança.
const MAX_EXECUTION_TIME_MS = 240 * 1000;

function isApproachingTimeout() {
    return (Date.now() - SCRIPT_START_TIME) >= MAX_EXECUTION_TIME_MS;
}

function normalizeSummaryContent(summaryResult) {
    if (summaryResult === null || summaryResult === undefined) return '';
    if (typeof summaryResult === 'string') return summaryResult;

    if (typeof summaryResult === 'object') {
        if (typeof summaryResult.resumo === 'string') return summaryResult.resumo;
        if (typeof summaryResult.content === 'string') return summaryResult.content;

        if (typeof summaryResult.output === 'string') return summaryResult.output;
        if (summaryResult.output && typeof summaryResult.output === 'object') {
            return normalizeSummaryContent(summaryResult.output);
        }

        if (typeof summaryResult.corpo_html === 'string') {
            const titulo = typeof summaryResult.titulo === 'string' ? summaryResult.titulo.trim() : '';
            return titulo ? `<h2>${titulo}</h2>\n${summaryResult.corpo_html}` : summaryResult.corpo_html;
        }

        if (typeof summaryResult.titulo === 'string') return summaryResult.titulo;

        try {
            return JSON.stringify(summaryResult, null, 2);
        } catch (e) {
            return String(summaryResult);
        }
    }

    return String(summaryResult);
}

function syncAndSummarize() {
    const stagesToSync = Object.keys(WORKFLOW_STAGE_MAPPING).map(Number);
    let deals = PipedriveRepository.fetchDealsInStages(stagesToSync);

    deals = deduplicateDeals(deals);

    // Lista para acumular todas as chamadas do workflow num único batch parallel
    let workflowsToRun = [];
    let dealsToDelete = [];

    // Primeiro coletamos as notas (batch-like operation pode ser feita se quisermos, mas como syncOriginNotes tem loop... vamos otimizar tbm se preciso)
    for (const deal of deals) {
        if (isApproachingTimeout()) {
            console.log("⏳ Tempo limite de segurança (240s) atingido. Interrompendo coleta de 'syncAndSummarize' para evitar timeout.");
            break;
        }

        try {
            console.log(`\n--- Coletando infos do Negócio #${deal.id}: ${deal.title} ---`);

            let notesForSummary = [];
            let needsSummary = false;

            if (deal.notes_count === 0) {
                const originalDealId = deal[CUSTOM_FIELDS.ORIGIN_ID_FIELD]; // BUG CORRIGIDO: Referência do config.js ajustada
                if (originalDealId) {
                    notesForSummary = PipedriveRepository.syncOriginNotes(deal.id, originalDealId);

                    if (!notesForSummary || notesForSummary.length === 0) {
                        console.log(`❌ Negócio #${deal.id} não possui anotações no negócio original (${originalDealId}). Marcando para apagar...`);
                        dealsToDelete.push(deal.id);
                        continue;
                    }

                    needsSummary = notesForSummary.length > 0;
                }
            } else {
                notesForSummary = PipedriveRepository.getNotesFromDeal(deal.id);
                const hasSummary = notesForSummary.some(n => n.content && n.content.includes(AGENT_CONFIG.RESUMO_PREFIX));
                needsSummary = !hasSummary && notesForSummary.length > 0;
            }

            if (needsSummary) {
                const rawNotesText = notesForSummary
                    .filter(n => n.content && !n.content.includes(AGENT_CONFIG.RESUMO_PREFIX))
                    .map(n => n.content.replace(/<[^>]*>?/gm, ' '))
                    .join('\n---\n');

                if (rawNotesText.trim()) {
                    const nucleus = getNucleusInfo(deal[CUSTOM_FIELDS.LABEL]);
                    workflowsToRun.push({
                        workflowId: AGENT_CONFIG.WORKFLOW_ANALISTA_ID,
                        payload: {
                            input_as_text: rawNotesText,
                            nucleo: nucleus.abreviacao,
                            nucleo_nome_completo: nucleus.nome_completo,
                            owner_id: String(deal.user_id.id)
                        },
                        meta: { dealId: deal.id, nucleus: nucleus.abreviacao }
                    });
                }
            } else {
                console.log(`✅ Negócio #${deal.id} já possui resumo ou não tem notas originais a resumir.`);
            }
        } catch (e) {
            console.error(`Erro na fase de análise do Deal ${deal.id}: ${e.toString()}`);
        }
    }

    // Processa de uma vez no Vercel (Paralelo)
    if (workflowsToRun.length > 0) {
        const results = OpenAIRepository.callWorkflowsInParallel(workflowsToRun);

        // Agora salva em lote criando as notas
        const saveRequests = [];
        results.forEach(res => {
            if (res.result) {
                const normalizedSummary = normalizeSummaryContent(res.result).trim();
                if (!normalizedSummary) {
                    console.warn(`⚠️ [RESUMO VAZIO] Deal #${res.meta && res.meta.dealId ? res.meta.dealId : 'Desconhecido'} retornou sem conteúdo aproveitável.`);
                    return;
                }

                const content = `<h1>${AGENT_CONFIG.RESUMO_PREFIX}</h1>\n${normalizedSummary}`;
                // Vamos empilhar as requisicoes para criar as notas em paralelo tb
                saveRequests.push({
                    url: `${PIPEDRIVE_API_BASE_URL}/notes?api_token=${PIPEDRIVE_API_TOKEN}`,
                    method: 'post',
                    contentType: 'application/json',
                    payload: JSON.stringify({ deal_id: res.meta.dealId, content: content }),
                    muteHttpExceptions: true
                });
                console.log(`✅ Resumo estratégico pronto para o núcleo: ${res.meta.nucleus} (Card #${res.meta.dealId})`);
            }
        });

        if (saveRequests.length > 0) {
            console.log(`🚀 Criando ${saveRequests.length} Notas de Resumo no Pipedrive em lote...`);
            UrlFetchApp.fetchAll(saveRequests);
        }
    }

    if (dealsToDelete.length > 0) {
        console.log(`🗑️ Removendo ${dealsToDelete.length} negócios que não tinham anotações na origem.`);
        PipedriveRepository.executeBulkDeletes(dealsToDelete);
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

    // Lista para acumular todas as preparações de workflow
    let workflowsToRun = [];

    for (const deal of deals) {
        if (isApproachingTimeout()) {
            console.log("⏳ Tempo limite de segurança (240s) atingido. Interrompendo coleta de 'executeEmailCadence'.");
            break;
        }

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

            // 2 e 3. Coleta Notas e Histórico de E-mails
            const { notes, emailHistory } = PipedriveRepository.getNotesAndEmailHistory(deal.id);
            const summaries = notes
                .filter(n => n.content && n.content.includes(AGENT_CONFIG.RESUMO_PREFIX))
                .sort((a, b) => new Date(b.add_time) - new Date(a.add_time));
            const summaryNote = summaries.length > 0 ? summaries[0] : null;

            if (!summaryNote) continue; // Correção: 'continue' em vez de 'return' para não parar a execução dos próximos leads

            // 4. Monta o Super Payload para a OpenAI
            const companyName = deal.org_name || "Desconhecida";
            const companySector = deal[CUSTOM_FIELDS.COMPANY_SECTOR] || "Não informado";
            const combinedInput = `Empresa: ${companyName}\nSetor: ${companySector}\n\nResumo Estratégico:\n${summaryNote.content}`;

            const payload = {
                input_as_text: combinedInput,
                cadencia: stepInfo.cadencia,
                etapa: stepInfo.passo,
                emails_anteriores: JSON.stringify(emailHistory),
                owner_id: String(deal.user_id.id) // Usuario eh owner do card
            };

            // Adiciona variáveis específicas do Esquema 2 apenas se proprietário inativo
            if (!isOwnerActive) {
                payload.nucleo_nome_completo = getNucleusInfo(nucleus).nome_completo;
                payload.nome_owner_desativado = deal.user_id.name;
            }

            workflowsToRun.push({
                workflowId: workflowId,
                payload: payload,
                meta: { dealId: deal.id, stepInfo: stepInfo }
            });

        } catch (e) {
            console.error(`Erro na fase de preparacao do e-mail do Deal ${deal.id}: ${e.toString()}`);
        }
    }

    // Processa de uma vez no Vercel (Paralelo)
    if (workflowsToRun.length > 0) {
        console.log(`📡 [DISPARO] Preparando para enviar payload Vercel de ${workflowsToRun.length} Mails. Payload Amostra[0]: ${JSON.stringify(workflowsToRun[0])}`);
        const results = OpenAIRepository.callWorkflowsInParallel(workflowsToRun);

        // Agora salva os emails em lote no pipedrive
        const saveRequests = [];
        results.forEach(res => {
            if (res.result) {
                try {
                    const emailData = typeof res.result === 'string' ? JSON.parse(res.result) : res.result;
                    const dealId = res.meta.dealId;

                    const title = emailData.titulo;
                    const body = emailData.corpo_html;

                    if (!title || !body) {
                        console.error(`⚠️ [ALERTA PAYLOAD VAZIO] O resultado para o Deal #${dealId} foi gerado, mas faltam titulo/corpo_html. Retorno LLM: ${JSON.stringify(emailData)}`);
                        return; // Pula
                    }

                    saveRequests.push({
                        url: `${PIPEDRIVE_API_BASE_URL}/deals/${dealId}?api_token=${PIPEDRIVE_API_TOKEN}`,
                        method: 'put',
                        contentType: 'application/json',
                        payload: JSON.stringify({
                            [CUSTOM_FIELDS.EMAIL_TITLE]: title,
                            [CUSTOM_FIELDS.EMAIL_BODY]: body
                        }),
                        muteHttpExceptions: true
                    });
                    console.log(`✅ E-mail do passo ${res.meta.stepInfo.passo} (${res.meta.stepInfo.cadencia}) pronto. (Card #${res.meta.dealId})`);
                } catch (err) {
                    console.error(`❌ [JSON Pipedrive Error] Erro ao parsear JSON no Deal #${res.meta.dealId}. Retorno: ${res.result} | Erro: ${err.message}`);
                }
            } else {
                console.log(`⚠️ Nulo ou Vazio: O Vercel não retornou dados de Email para o Deal #${res.meta.dealId}.`);
            }
        });

        if (saveRequests.length > 0) {
            console.log(`🚀 Salvando ${saveRequests.length} E-mails produzidos no Pipedrive em lote...`);
            const startLog = Date.now();
            UrlFetchApp.fetchAll(saveRequests);
            console.log(`⏱️ [Pipedrive API] Emails salvos em ${Date.now() - startLog}ms`);
        }
    }
}

/**
 * =================================================================
 * REPOSITORIES - CAMADA DE ACESSO A DADOS
 * =================================================================
 */

var PipedriveRepository = {
    fetchDealsByFilter: function (filterId) {
        let allDeals = [];
        let start = 0;
        const limit = 500;
        let moreItems = true;

        try {
            const startStrLog = Date.now();
            while (moreItems) {
                const url = `${PIPEDRIVE_API_BASE_URL}/deals?filter_id=${filterId}&status=open&start=${start}&limit=${limit}&api_token=${PIPEDRIVE_API_TOKEN}`;
                const resp = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
                if (resp.getResponseCode() === 200) {
                    const data = JSON.parse(resp.getContentText());
                    if (data.success && data.data) {
                        allDeals = allDeals.concat(data.data);
                    }
                    moreItems = data.additional_data && data.additional_data.pagination && data.additional_data.pagination.more_items_in_collection;
                    if (moreItems) start = data.additional_data.pagination.next_start;
                } else {
                    moreItems = false;
                }
            }
            console.log(`⏱️ [Pipedrive API] fetchDealsByFilter (Filtro ID: ${filterId}) achou ${allDeals.length} negócios e levou ${Date.now() - startStrLog}ms`);
            return allDeals;
        } catch (e) {
            console.error("Erro no fetchDealsByFilter: ", e);
            return [];
        }
    },

    fetchDealsByPipeline: function (pipelineIds) {
        const requests = pipelineIds.map(id => ({
            url: `${PIPEDRIVE_API_BASE_URL}/deals?pipeline_id=${id}&status=open&api_token=${PIPEDRIVE_API_TOKEN}`,
            method: 'get',
            muteHttpExceptions: true
        }));

        try {
            const startStrLog = Date.now();
            const responses = UrlFetchApp.fetchAll(requests);
            console.log(`⏱️ [Pipedrive API] fetchDealsByPipeline (${pipelineIds.length} pipelines verificados) levou ${Date.now() - startStrLog}ms`);

            let allDeals = [];
            responses.forEach(resp => {
                if (resp.getResponseCode() === 200) {
                    const data = JSON.parse(resp.getContentText());
                    if (data.success && data.data) {
                        allDeals = allDeals.concat(data.data);
                    }
                }
            });
            return allDeals;
        } catch (e) {
            console.error("Erro no fetchDealsByPipeline: ", e);
            return [];
        }
    },

    executeBulkUpdates: function (updates) {
        if (!updates || updates.length === 0) return;
        const requests = updates.map(update => ({
            url: `${PIPEDRIVE_API_BASE_URL}/deals/${update.id}?api_token=${PIPEDRIVE_API_TOKEN}`,
            method: 'put',
            contentType: 'application/json',
            payload: JSON.stringify(update.payload),
            muteHttpExceptions: true
        }));

        try {
            const startLog = Date.now();
            UrlFetchApp.fetchAll(requests);
            console.log(`⏱️ [Pipedrive API] Atualização em lote (${requests.length} negócios) levou ${Date.now() - startLog}ms`);
        } catch (e) {
            console.error("Erro ao atualizar deals em lote:", e);
        }
    },

    executeBulkDeletes: function (dealIds) {
        if (!dealIds || dealIds.length === 0) return;
        const requests = dealIds.map(id => ({
            url: `${PIPEDRIVE_API_BASE_URL}/deals/${id}?api_token=${PIPEDRIVE_API_TOKEN}`,
            method: 'delete',
            muteHttpExceptions: true
        }));

        try {
            const startLog = Date.now();
            UrlFetchApp.fetchAll(requests);
            console.log(`⏱️ [Pipedrive API] Deleção em lote (${requests.length} negócios) levou ${Date.now() - startLog}ms`);
        } catch (e) {
            console.error("Erro ao deletar deals em lote:", e);
        }
    },

    fetchDealsInStages: function (stageIds) {
        const requests = stageIds.map(id => ({
            url: `${PIPEDRIVE_API_BASE_URL}/deals?stage_id=${id}&status=open&api_token=${PIPEDRIVE_API_TOKEN}`,
            method: 'get',
            muteHttpExceptions: true
        }));

        try {
            const startStrLog = Date.now();
            const responses = UrlFetchApp.fetchAll(requests);
            console.log(`⏱️ [Pipedrive API] fetchDealsInStages (${stageIds.length} estágios verificados) levou ${Date.now() - startStrLog}ms`);

            let allDeals = [];
            responses.forEach(resp => {
                if (resp.getResponseCode() === 200) {
                    const data = JSON.parse(resp.getContentText());
                    if (data.success && data.data) {
                        allDeals = allDeals.concat(data.data);
                    }
                }
            });
            return allDeals;
        } catch (e) {
            console.error("Erro no fetchDealsInStages: ", e);
            return [];
        }
    },

    getNotesAndEmailHistory: function (dealId) {
        const requests = [
            { url: `${PIPEDRIVE_API_BASE_URL}/notes?deal_id=${dealId}&api_token=${PIPEDRIVE_API_TOKEN}`, method: 'get', muteHttpExceptions: true },
            { url: `${PIPEDRIVE_API_BASE_URL}/deals/${dealId}/mailMessages?api_token=${PIPEDRIVE_API_TOKEN}`, method: 'get', muteHttpExceptions: true }
        ];
        try {
            const startLog = Date.now();
            const responses = UrlFetchApp.fetchAll(requests);
            console.log(`⏱️ [Pipedrive API] getNotesAndEmailHistory (Deal #${dealId}) levou ${Date.now() - startLog}ms`);

            let notes = [];
            if (responses[0].getResponseCode() === 200) {
                const data = JSON.parse(responses[0].getContentText());
                notes = data.data || [];
            }

            let emailHistory = [];
            if (responses[1].getResponseCode() === 200) {
                const data = JSON.parse(responses[1].getContentText()).data;
                if (data) {
                    emailHistory = data.slice(0, 5).map(msg => ({
                        origem: msg.from[0].email.includes("polijunior") ? "Poli Júnior" : "Cliente",
                        data: msg.add_time,
                        preview: msg.snippet.substring(0, 200).replace(/<[^>]*>?/gm, '')
                    }));
                }
            }
            return { notes, emailHistory };
        } catch (e) {
            console.error("Erro no getNotesAndEmailHistory:", e);
            return { notes: [], emailHistory: [] };
        }
    },

    getNotesFromDeal: function (dealId) {
        const startLog = Date.now();
        const url = `${PIPEDRIVE_API_BASE_URL}/notes?deal_id=${dealId}&api_token=${PIPEDRIVE_API_TOKEN}`;
        const resp = UrlFetchApp.fetch(url, { method: 'get' });
        console.log(`⏱️ [Pipedrive API] getNotesFromDeal (Deal #${dealId}) levou ${Date.now() - startLog}ms`);
        return JSON.parse(resp.getContentText()).data || [];
    },

    getActiveUsers: function () {
        const cache = CacheService.getScriptCache();
        const cached = cache.get('active_users');
        if (cached) return JSON.parse(cached);

        const startLog = Date.now();
        const url = `${PIPEDRIVE_API_BASE_URL}/users?api_token=${PIPEDRIVE_API_TOKEN}`;
        const resp = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
        console.log(`⏱️ [Pipedrive API] getActiveUsers levou ${Date.now() - startLog}ms`);

        let activeIds = [];
        if (resp.getResponseCode() === 200) {
            const data = JSON.parse(resp.getContentText()).data || [];
            activeIds = data.filter(u => u.active_flag).map(u => u.id);
            cache.put('active_users', JSON.stringify(activeIds), 3600);
        }
        return activeIds;
    },

    createNote: function (dealId, content) {
        const url = `${PIPEDRIVE_API_BASE_URL}/notes?api_token=${PIPEDRIVE_API_TOKEN}`;
        const payload = { deal_id: dealId, content: content };
        UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
    },

    syncOriginNotes: function (dealId, originalDealId) {
        if (!originalDealId) return [];

        const originalNotes = this.getNotesFromDeal(originalDealId);
        if (originalNotes && originalNotes.length > 0) {
            const requests = originalNotes.map(note => ({
                url: `${PIPEDRIVE_API_BASE_URL}/notes?api_token=${PIPEDRIVE_API_TOKEN}`,
                method: 'post',
                contentType: 'application/json',
                payload: JSON.stringify({
                    deal_id: dealId,
                    content: (note.content || "").replace(/<[^>]*>?/gm, ' ')
                }),
                muteHttpExceptions: true
            }));

            const startLog = Date.now();
            try { UrlFetchApp.fetchAll(requests); } catch (e) { console.error("Erro no syncOriginNotes:", e); };
            console.log(`⏱️ [Pipedrive API] syncOriginNotes (${requests.length} requisições) levou ${Date.now() - startLog}ms`);
        }

        return originalNotes;
    },

    saveEmailToDeal: function (dealId, title, body) {
        const url = `${PIPEDRIVE_API_BASE_URL}/deals/${dealId}?api_token=${PIPEDRIVE_API_TOKEN}`;
        const payload = {
            [CUSTOM_FIELDS.EMAIL_TITLE]: title,
            [CUSTOM_FIELDS.EMAIL_BODY]: body
        };
        const startLog = Date.now();
        UrlFetchApp.fetch(url, { method: 'put', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
        console.log(`⏱️ [Pipedrive API] saveEmailToDeal (Deal #${dealId}) levou ${Date.now() - startLog}ms`);
    },

    markDealAsLost: function (dealId, reason) {
        const url = `${PIPEDRIVE_API_BASE_URL}/deals/${dealId}?api_token=${PIPEDRIVE_API_TOKEN}`;
        const payload = {
            status: 'lost',
            lost_reason: reason
        };
        UrlFetchApp.fetch(url, { method: 'put', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
    },

    getStagesDetailsByPipeline: function (pipelineId) {
        const url = `${PIPEDRIVE_API_BASE_URL}/stages?pipeline_id=${pipelineId}&api_token=${PIPEDRIVE_API_TOKEN}`;
        const resp = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
        if (resp.getResponseCode() === 200) {
            const data = JSON.parse(resp.getContentText());
            return data.data || [];
        }
        return [];
    },

    updateDealsInBatch: function (moves) {
        if (!moves || moves.length === 0) return;
        const requests = moves.map(move => ({
            url: `${PIPEDRIVE_API_BASE_URL}/deals/${move.id}?api_token=${PIPEDRIVE_API_TOKEN}`,
            method: 'put',
            contentType: 'application/json',
            payload: JSON.stringify({ stage_id: move.stage_id }),
            muteHttpExceptions: true
        }));

        try {
            const startLog = Date.now();
            UrlFetchApp.fetchAll(requests);
            console.log(`⏱️ [Pipedrive API] Movimentação em lote de funis (${requests.length} negócios) levou ${Date.now() - startLog}ms`);
        } catch (e) {
            console.error("Erro ao mover deals em lote:", e);
        }
    }
};

// =================================================================
// REPOSITÓRIO: COMUNICAÇÃO COM O BRIDGE SERVER (PYTHON)
// =================================================================

var OpenAIRepository = {
    /**
     * Aciona o Bridge no Vercel para rodar um fluxo do Agent Builder via HTTPS
     */
    callWorkflow: function (workflowId, inputData) {
        const url = BRIDGE_SERVER_URL + (BRIDGE_SERVER_URL.endsWith('/') ? 'run-agent' : '/run-agent');
        const options = {
            method: 'post',
            contentType: 'application/json',
            headers: { 'Authorization': 'Bearer ' + BRIDGE_AUTH_TOKEN },
            payload: JSON.stringify({
                workflow_id: workflowId,
                payload: inputData
            }),
            muteHttpExceptions: true
        };

        try {
            console.log(`🤖 Iniciando workflow [${workflowId}] na OpenAI via Bridge...`);
            const startLog = Date.now();

            const response = UrlFetchApp.fetch(url, options);
            const resData = JSON.parse(response.getContentText());

            const duration = Date.now() - startLog;
            console.log(`⏱️ [OpenAI/Vercel] Workflow finalizado em ${duration}ms (${(duration / 1000).toFixed(1)}s).`);

            if (response.getResponseCode() !== 200) {
                console.error("❌ Erro no Bridge:", resData.detail);
                return null;
            }

            let output = resData.output;

            if (typeof output === 'string' && (output.trim().startsWith('{') || output.trim().startsWith('['))) {
                try { output = JSON.parse(output); } catch (e) { }
            }

            return output;
        } catch (e) {
            console.error("🚨 Erro na conexão com Vercel:", e.toString());
            return null;
        }
    },

    /**
     * Aciona múltiplos workflows no Vercel em paralelo, respeitando o Rate Limit do OpenAI Chatkit (60 requests/min/user).
     */
    callWorkflowsInParallel: function (workflowsData) {
        if (!workflowsData || workflowsData.length === 0) return [];

        const url = BRIDGE_SERVER_URL + (BRIDGE_SERVER_URL.endsWith('/') ? 'run-agent' : '/run-agent');
        const BATCH_SIZE = 40; // Limite conservador para não estourar 60/min
        const BATCH_DELAY_MS = 62000; // Aguarda 62s a partir do 2º batch

        let allResponses = [];
        let shouldAbortRemainingBatches = false;

        console.log(`🤖 Gerando ${workflowsData.length} workflows na OpenAI em Lotes Paralelos (Max ${BATCH_SIZE} p/ evitar Rate Limits).`);

        try {
            for (let i = 0; i < workflowsData.length; i += BATCH_SIZE) {
                if (shouldAbortRemainingBatches) {
                    break;
                }

                if (i > 0) {
                    console.log(`⏳ Aguardando ${BATCH_DELAY_MS / 1000}s para o próximo lote (Respeitar o Rate Limit de 60req/min da OpenAI)...`);
                    Utilities.sleep(BATCH_DELAY_MS);
                }

                const chunkData = workflowsData.slice(i, i + BATCH_SIZE);
                const requests = chunkData.map(data => ({
                    url: url,
                    method: 'post',
                    contentType: 'application/json',
                    headers: { 'Authorization': 'Bearer ' + BRIDGE_AUTH_TOKEN },
                    payload: JSON.stringify({
                        workflow_id: data.workflowId,
                        payload: data.payload
                    }),
                    muteHttpExceptions: true
                }));

                console.log(`🚀 Disparando Lote da vez: ${requests.length} requisições.`);
                const startLog = Date.now();
                const responses = UrlFetchApp.fetchAll(requests);
                const duration = Date.now() - startLog;
                console.log(`⏱️ [OpenAI/Vercel] O Lote de ${requests.length} workflows terminou em ${duration}ms (${(duration / 1000).toFixed(1)}s).`);

                const processedChunk = responses.map((response, index) => {
                    const reqData = chunkData[index];

                    if (response.getResponseCode() !== 200) {
                        const errorBody = response.getContentText();
                        const lowerError = (errorBody || '').toLowerCase();
                        const isChatkitEndpointUnavailable =
                            lowerError.includes('chatkit run endpoint unavailable') ||
                            lowerError.includes('invalid url (post /v1/chatkit/sessions/');

                        console.error(`❌ [ERRO VERCEL] Status ${response.getResponseCode()} para Workflow ${reqData.workflowId} (Deal #${reqData.meta ? reqData.meta.dealId : 'Desconhecido'}):`);
                        console.error(`Detalhes do erro: ${errorBody}`);
                        return {
                            meta: reqData.meta,
                            result: null,
                            errorType: isChatkitEndpointUnavailable ? 'CHATKIT_RUN_ENDPOINT_UNAVAILABLE' : null
                        };
                    }

                    try {
                        const resData = JSON.parse(response.getContentText());
                        let output = resData.output;

                        if (!output || output === "") {
                            console.warn(`⚠️ [CUIDADO] O Vercel retornou 200 OK, mas o 'output' está vazio para o Deal #${reqData.meta ? reqData.meta.dealId : 'Desconhecido'}. Payload na Vercel: ${JSON.stringify(resData)}`);
                        }

                        if (typeof output === 'string' && (output.trim().startsWith('{') || output.trim().startsWith('['))) {
                            try { output = JSON.parse(output); } catch (e) { }
                        }
                        return { meta: reqData.meta, result: output, errorType: null };
                    } catch (e) {
                        console.error(`❌ [ERRO JSON] A resposta da Vercel não é um JSON válido. Código ${response.getResponseCode()}:`, response.getContentText());
                        return { meta: reqData.meta, result: null, errorType: null };
                    }
                });

                allResponses = allResponses.concat(processedChunk);

                const hasFatalEndpointError = processedChunk.some(res => res.errorType === 'CHATKIT_RUN_ENDPOINT_UNAVAILABLE');
                if (hasFatalEndpointError) {
                    shouldAbortRemainingBatches = true;
                    console.error('🛑 [FAIL-FAST] Endpoint de execução ChatKit indisponível/obsoleto detectado neste lote. Abortando lotes restantes para evitar espera desnecessária.');
                }
            }

            return allResponses;
        } catch (e) {
            console.error("🚨 Erro na conexão paralela com Vercel (Durante FetchAll):", e.toString());
            return workflowsData.map(data => ({ meta: data.meta, result: null }));
        }
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

        // Separação em Vencedor (mais antigo/original) e Perdedores
        const sortedList = dealList.sort((a, b) => new Date(a.add_time) - new Date(b.add_time));
        const winner = sortedList[0];
        const losers = sortedList.slice(1);

        console.log(`   👑 Winner: ID ${winner.id} ("${winner.title}") - Created: ${winner.add_time}`);
        uniqueDeals.push(winner);

        if (losers.length > 0) {
            const lostRequests = losers.map(loserDeal => ({
                url: `${PIPEDRIVE_API_BASE_URL}/deals/${loserDeal.id}?api_token=${PIPEDRIVE_API_TOKEN}`,
                method: 'put',
                contentType: 'application/json',
                payload: JSON.stringify({ status: 'lost', lost_reason: 'Duplicidade detectada via Script Automático antes de IA (Nurturing)' }),
                muteHttpExceptions: true
            }));

            const startLog = Date.now();
            try { UrlFetchApp.fetchAll(lostRequests); } catch (e) { console.error("Erro ao marcar como LOST: ", e); }
            console.log(`⏱️ [Pipedrive API] Deduplicação (${lostRequests.length} perdedores) resolvida em ${Date.now() - startLog}ms`);

            losers.forEach(loserDeal => {
                console.log(`   📉 Marked LOST ID ${loserDeal.id}...`);
                totalRemoved++;
            });
        }
    }

    if (totalRemoved > 0) {
        console.log(`📊 Limpeza Completa: ${totalRemoved} negócios duplicados removidos.`);
    }

    return uniqueDeals;
}
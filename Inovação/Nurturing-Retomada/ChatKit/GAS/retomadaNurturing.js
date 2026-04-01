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

function syncAndSummarize() {
    const stagesToSync = Object.keys(WORKFLOW_STAGE_MAPPING).map(Number);
    let deals = PipedriveRepository.fetchDealsInStages(stagesToSync);

    deals = deduplicateDeals(deals);

    // Lista para acumular todas as chamadas do workflow num único batch parallel
    let workflowsToRun = [];

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
                const content = `<h1>${AGENT_CONFIG.RESUMO_PREFIX}</h1>\n${res.result}`;
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
}

// REMOVIDA A FUNÇÃO generateStrategicSummary isolada pois agora roda em batch dentro do syncAndSummarize

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
        const results = OpenAIRepository.callWorkflowsInParallel(workflowsToRun);

        // Agora salva os emails em lote no pipedrive
        const saveRequests = [];
        results.forEach(res => {
            if (res.result) {
                const emailData = typeof res.result === 'string' ? JSON.parse(res.result) : res.result;
                const dealId = res.meta.dealId;

                const title = emailData.titulo;
                const body = emailData.corpo_html;

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

// REPOSITÓRIO: COMUNICAÇÃO COM O BRIDGE SERVER (PYTHON)
// =================================================================

var OpenAIRepository = {
    /**
     * Aciona o Bridge no Vercel para rodar um fluxo do Agent Builder via HTTPS
     */
    callWorkflow: function (workflowId, inputData) {
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

            const response = UrlFetchApp.fetch(BRIDGE_SERVER_URL, options);
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
     * Aciona múltiplos workflows no Vercel em paralelo, ótimo para bater limites de tempo do GAS
     */
    callWorkflowsInParallel: function (workflowsData) {
        if (!workflowsData || workflowsData.length === 0) return [];

        const requests = workflowsData.map(data => ({
            url: BRIDGE_SERVER_URL,
            method: 'post',
            contentType: 'application/json',
            headers: { 'Authorization': 'Bearer ' + BRIDGE_AUTH_TOKEN },
            payload: JSON.stringify({
                workflow_id: data.workflowId,
                payload: data.payload
            }),
            muteHttpExceptions: true
        }));

        try {
            console.log(`🤖 Iniciando ${requests.length} workflows na OpenAI via Bridge em PARALELO...`);
            const startLog = Date.now();

            const responses = UrlFetchApp.fetchAll(requests);

            const duration = Date.now() - startLog;
            console.log(`⏱️ [OpenAI/Vercel] Batch de ${requests.length} workflows finalizado em ${duration}ms (${(duration / 1000).toFixed(1)}s).`);

            return responses.map((response, index) => {
                const reqData = workflowsData[index];
                if (response.getResponseCode() !== 200) {
                    console.error(`❌ Erro no Bridge (Deal #${reqData.meta.dealId}):`, response.getContentText());
                    return { meta: reqData.meta, result: null };
                }

                const resData = JSON.parse(response.getContentText());
                let output = resData.output;

                if (typeof output === 'string' && (output.trim().startsWith('{') || output.trim().startsWith('['))) {
                    try { output = JSON.parse(output); } catch (e) { }
                }
                return { meta: reqData.meta, result: output };
            });
        } catch (e) {
            console.error("🚨 Erro na conexão paralela com Vercel:", e.toString());
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
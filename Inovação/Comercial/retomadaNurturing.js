/**
 * POLI JÚNIOR - AI SALES ENGINE (2026)
 * Orquestrador Multi-Agente: OpenAI Responses API + Pipedrive
 */

function syncAndSummarize() {
    const stagesToSync = Object.keys(WORKFLOW_STAGE_MAPPING).map(Number);
    let deals = PipedriveRepository.fetchDealsInStages(stagesToSync);

    deals = deduplicateDeals(deals);
    const labelIdMap = PipedriveRepository.getLabelMapping();

    let workflowsToRun = [];
    let dealsToDelete = [];

    for (const deal of deals) {
        try {
            console.info(`[INFO] Starting summary analysis for Deal ID: ${deal.id}, Title: ${deal.title}`);

            let notesForSummary = [];
            let needsSummary = false;

            if (deal.notes_count === 0) {
                const originalDealId = deal[CUSTOM_FIELDS.ORIGIN_ID_FIELD];
                if (originalDealId) {
                    notesForSummary = PipedriveRepository.syncOriginNotes(deal.id, originalDealId);

                    if (!notesForSummary || notesForSummary.length === 0) {
                        console.warn(`[WARN] Deal ID: ${deal.id} lacks annotations in original Deal ID: ${originalDealId}. Marking for deletion.`);
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
                    let rawLabelValue = deal[CUSTOM_FIELDS.LABEL];
                    if (Array.isArray(rawLabelValue) && rawLabelValue.length > 0) {
                        rawLabelValue = rawLabelValue[0];
                    }
                    if (typeof rawLabelValue === 'string') {
                        rawLabelValue = rawLabelValue.trim();
                    }

                    // Identifica se é ID numérico do Pipedrive via mapping dinâmico
                    const mappedLabel = labelIdMap[String(rawLabelValue)] || rawLabelValue;

                    const validNuclei = ['NDados', 'NCon', 'NTec', 'NCiv'];
                    let nucleusAbrev = validNuclei.includes(mappedLabel) ? mappedLabel : 'Geral';
                    const nucleus = getNucleusInfo(nucleusAbrev);

                    const payload = {
                        input_as_text: rawNotesText,
                        state: {
                            nucleo: nucleus.abreviacao,
                            nucleo_nome_completo: nucleus.nome_completo,
                            owner_id: String(deal.user_id.id)
                        }
                    };

                    console.log(`[DEBUG] Preparando envio de sumário para Deal ID: ${deal.id} - Label ${rawLabelValue} -> ${nucleus.abreviacao}`);

                    workflowsToRun.push({
                        workflowId: AGENT_CONFIG.WORKFLOW_ANALISTA_ID,
                        payload: payload,
                        meta: { dealId: deal.id, nucleus: nucleus.abreviacao }
                    });

                    // Limita processamento a X cards
                    if (workflowsToRun.length >= (typeof REGRAS_CONFIG !== 'undefined' && REGRAS_CONFIG.MAX_CARDS_PROCESS_LIMIT ? REGRAS_CONFIG.MAX_CARDS_PROCESS_LIMIT : 10)) {
                        console.info(`[INFO] Limite de processamento atingido (${workflowsToRun.length} cards) para syncAndSummarize.`);
                        break;
                    }
                }
            } else {
                console.log(`[DEBUG] Deal ID: ${deal.id} skipped. Summary already exists or no original notes to summarize.`);
            }
        } catch (e) {
            console.error(`[ERROR] Failed to analyze Deal ID: ${deal.id}. Reason: ${e.toString()}`);
        }
    }

    if (workflowsToRun.length > 0) {
        const results = OpenAIRepository.runWorkflowsLocally(workflowsToRun);

        const saveRequests = [];
        results.forEach(res => {
            if (res.result) {
                const resultText = res.result.output_text || res.result;
                const content = `<h1>${AGENT_CONFIG.RESUMO_PREFIX}</h1>\n${resultText}`;

                saveRequests.push({
                    url: `${PIPEDRIVE_API_BASE_URL}/notes?api_token=${PIPEDRIVE_API_TOKEN}`,
                    method: 'post',
                    contentType: 'application/json',
                    payload: JSON.stringify({ deal_id: res.meta.dealId, content: content }),
                    muteHttpExceptions: true
                });
                console.info(`[INFO] Strategic summary generated successfully for Deal ID: ${res.meta.dealId}, Nucleus: ${res.meta.nucleus}`);
            }
        });

        if (saveRequests.length > 0) {
            console.info(`[INFO] Executing bulk creation of ${saveRequests.length} summary notes in Pipedrive.`);
            UrlFetchApp.fetchAll(saveRequests);
        }
    }

    if (dealsToDelete.length > 0) {
        console.info(`[INFO] Executing bulk deletion of ${dealsToDelete.length} deals lacking original annotations.`);
        PipedriveRepository.executeBulkDeletes(dealsToDelete);
    }
}

function executeEmailCadence() {
    const activeUsers = PipedriveRepository.getActiveUsers();
    const stagesToProcess = Object.keys(WORKFLOW_STAGE_MAPPING).map(Number);
    let deals = PipedriveRepository.fetchDealsInStages(stagesToProcess);

    deals = deduplicateDeals(deals);
    const labelIdMap = PipedriveRepository.getLabelMapping();

    let workflowsToRun = [];

    for (const deal of deals) {
        try {
            const stepInfo = WORKFLOW_STAGE_MAPPING[deal.stage_id];

            // O valor real recebido do Pipedrive via CUSTOM_FIELDS.LABEL
            let rawLabelValue = deal[CUSTOM_FIELDS.LABEL];
            if (Array.isArray(rawLabelValue) && rawLabelValue.length > 0) {
                rawLabelValue = rawLabelValue[0]; // Extrai o primeiro se for array
            }
            if (typeof rawLabelValue === 'string') {
                rawLabelValue = rawLabelValue.trim();
            }

            // Identifica se é ID numérico do Pipedrive via mapping dinâmico
            const mappedLabel = labelIdMap[String(rawLabelValue)] || rawLabelValue;

            // Fallback se não for uma das 4 opções conhecidas
            const validNuclei = ['NDados', 'NCon', 'NTec', 'NCiv'];
            let nucleus = validNuclei.includes(mappedLabel) ? mappedLabel : 'Geral';
            const isOwnerActive = activeUsers.includes(deal.user_id.id);

            let workflowId;
            if (isOwnerActive) {
                const workflowMap = AGENT_CONFIG.WORKFLOW_REDACAO_ATIVO;
                workflowId = workflowMap[nucleus] || workflowMap['Geral'] || workflowMap['NDados'];
            } else {
                workflowId = AGENT_CONFIG.WORKFLOW_REDACAO_INATIVO;
            }

            // 2 e 3. Coleta Notas e Histórico de E-mails
            const { notes, emailHistory } = PipedriveRepository.getNotesAndEmailHistory(deal.id);
            const summaries = notes
                .filter(n => n.content && n.content.includes(AGENT_CONFIG.RESUMO_PREFIX))
                .sort((a, b) => new Date(b.add_time) - new Date(a.add_time));
            const summaryNote = summaries.length > 0 ? summaries[0] : null;

            if (!summaryNote) continue;

            const companyName = deal.org_name || "Desconhecida";
            const companySector = deal[CUSTOM_FIELDS.COMPANY_SECTOR] || "Não informado";
            const combinedInput = `Empresa: ${companyName}\nSetor: ${companySector}\n\nResumo Estratégico:\n${summaryNote.content}`;

            const payload = {
                input_as_text: combinedInput,
                state: {
                    cadencia: stepInfo.cadencia,
                    etapa: stepInfo.passo,
                    emails_anteriores: JSON.stringify(emailHistory),
                    owner_id: String(deal.user_id.id),
                    nucleo: nucleus, // Envia sempre o núcleo (NDados, NCiv, etc)
                    nucleo_nome_completo: getNucleusInfo(nucleus).nome_completo // Envia sempre o nome completo para qualquer flow usar se quiser
                }
            };

            if (!isOwnerActive) {
                // Variável exclusiva exigida apenas pelo Flow_FluxoOwnerInativo
                payload.state.nome_owner_desativado = deal.user_id.name || "nosso antigo coordenador";
            }

            console.log(`[DEBUG] Preparando envio para fluxo ${workflowId} no Deal ID: ${deal.id} com Payload: \n${JSON.stringify(payload, null, 2)}`);

            workflowsToRun.push({
                workflowId: workflowId,
                payload: payload,
                meta: { dealId: deal.id, stepInfo: stepInfo }
            });

            // Limita processamento a X cards
            if (workflowsToRun.length >= (typeof REGRAS_CONFIG !== 'undefined' && REGRAS_CONFIG.MAX_CARDS_PROCESS_LIMIT ? REGRAS_CONFIG.MAX_CARDS_PROCESS_LIMIT : 10)) {
                console.info(`[INFO] Limite de processamento atingido (${workflowsToRun.length} cards) para executeEmailCadence.`);
                break;
            }

        } catch (e) {
            console.error(`[ERROR] Failed to prepare email cadence for Deal ID: ${deal.id}. Reason: ${e.toString()}`);
        }
    }

    if (workflowsToRun.length > 0) {
        console.log(`[DEBUG] Batch email processing initiated for ${workflowsToRun.length} workflows.`);
        const results = OpenAIRepository.runWorkflowsLocally(workflowsToRun);

        const saveRequests = [];
        results.forEach(res => {
            if (res.result) {
                try {
                    const emailData = typeof res.result === 'string' ? JSON.parse(res.result) : res.result;
                    const dealId = res.meta.dealId;

                    const title = emailData.titulo;
                    const body = emailData.corpo_html;

                    if (!title || !body) {
                        console.error(`[ERROR] Incomplete email generation for Deal ID: ${dealId}. Missing title or html_body. Output constraints unfulfilled.`);
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
                    console.info(`[INFO] Email successfully generated for Deal ID: ${res.meta.dealId}, Step: ${res.meta.stepInfo.passo}, Cadence: ${res.meta.stepInfo.cadencia}`);
                } catch (err) {
                    console.error(`[ERROR] JSON parsing failed for Deal ID: ${res.meta.dealId}. Error: ${err.message}`);
                }
            } else {
                console.warn(`[WARN] No email data returned from AI for Deal ID: ${res.meta.dealId}`);
            }
        });

        if (saveRequests.length > 0) {
            console.info(`[INFO] Executing bulk save of ${saveRequests.length} generated emails to Pipedrive.`);
            const startLog = Date.now();
            UrlFetchApp.fetchAll(saveRequests);
            console.info(`[INFO] Batch email save to Pipedrive completed in ${Date.now() - startLog}ms.`);
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
            console.info(`[INFO] Pipedrive API fetchDealsByFilter completed. Filter ID: ${filterId}, Deals found: ${allDeals.length}, Duration: ${Date.now() - startStrLog}ms`);
            return allDeals;
        } catch (e) {
            console.error(`[ERROR] fetchDealsByFilter failed for Filter ID: ${filterId}. Error: ${e.message}`);
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
            console.info(`[INFO] Pipedrive API fetchDealsByPipeline completed. Pipelines checked: ${pipelineIds.length}, Duration: ${Date.now() - startStrLog}ms`);

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
            console.error(`[ERROR] fetchDealsByPipeline failed. Error: ${e.message}`);
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
            console.info(`[INFO] Pipedrive API executeBulkUpdates completed. Updates: ${requests.length}, Duration: ${Date.now() - startLog}ms`);
        } catch (e) {
            console.error(`[ERROR] executeBulkUpdates failed. Error: ${e.message}`);
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
            console.info(`[INFO] Pipedrive API executeBulkDeletes completed. Deletes: ${requests.length}, Duration: ${Date.now() - startLog}ms`);
        } catch (e) {
            console.error(`[ERROR] executeBulkDeletes failed. Error: ${e.message}`);
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
            console.info(`[INFO] Pipedrive API fetchDealsInStages completed. Stages checked: ${stageIds.length}, Duration: ${Date.now() - startStrLog}ms`);

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
            console.error(`[ERROR] fetchDealsInStages failed. Error: ${e.message}`);
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
            console.log(`[DEBUG] Pipedrive API getNotesAndEmailHistory completed. Deal ID: ${dealId}, Duration: ${Date.now() - startLog}ms`);

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
            console.error(`[ERROR] getNotesAndEmailHistory failed for Deal ID: ${dealId}. Error: ${e.message}`);
            return { notes: [], emailHistory: [] };
        }
    },

    getNotesFromDeal: function (dealId) {
        const startLog = Date.now();
        const url = `${PIPEDRIVE_API_BASE_URL}/notes?deal_id=${dealId}&api_token=${PIPEDRIVE_API_TOKEN}`;
        const resp = UrlFetchApp.fetch(url, { method: 'get' });
        console.log(`[DEBUG] Pipedrive API getNotesFromDeal completed. Deal ID: ${dealId}, Duration: ${Date.now() - startLog}ms`);
        return JSON.parse(resp.getContentText()).data || [];
    },

    getActiveUsers: function () {
        const cache = CacheService.getScriptCache();
        const cached = cache.get('active_users');
        if (cached) return JSON.parse(cached);

        const startLog = Date.now();
        const url = `${PIPEDRIVE_API_BASE_URL}/users?api_token=${PIPEDRIVE_API_TOKEN}`;
        const resp = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
        console.log(`[DEBUG] Pipedrive API getActiveUsers completed. Duration: ${Date.now() - startLog}ms`);

        let activeIds = [];
        if (resp.getResponseCode() === 200) {
            const data = JSON.parse(resp.getContentText()).data || [];
            activeIds = data.filter(u => u.active_flag).map(u => u.id);
            cache.put('active_users', JSON.stringify(activeIds), 3600);
        }
        return activeIds;
    },

    getLabelMapping: function () {
        const cache = CacheService.getScriptCache();
        const cached = cache.get('deal_label_mapping');
        if (cached) return JSON.parse(cached);

        const startLog = Date.now();
        const url = `${PIPEDRIVE_API_BASE_URL}/dealFields?api_token=${PIPEDRIVE_API_TOKEN}`;
        const resp = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
        console.log(`[DEBUG] Pipedrive API getLabelMapping completed. Duration: ${Date.now() - startLog}ms`);

        let mapping = {};
        if (resp.getResponseCode() === 200) {
            const data = JSON.parse(resp.getContentText()).data || [];
            const labelField = data.find(f => f.key === CUSTOM_FIELDS.LABEL);
            if (labelField && labelField.options) {
                labelField.options.forEach(opt => {
                    mapping[String(opt.id)] = opt.label;
                });
            }
            cache.put('deal_label_mapping', JSON.stringify(mapping), 21600); // Cache por 6 horas
        }
        return mapping;
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
            try { UrlFetchApp.fetchAll(requests); } catch (e) { console.error(`[ERROR] syncOriginNotes failed. Error: ${e.message}`); };
            console.info(`[INFO] Pipedrive API syncOriginNotes completed. Requests: ${requests.length}, Duration: ${Date.now() - startLog}ms`);
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
        console.log(`[DEBUG] Pipedrive API saveEmailToDeal completed. Deal ID: ${dealId}, Duration: ${Date.now() - startLog}ms`);
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
            console.info(`[INFO] Pipedrive API updateDealsInBatch completed. Moves: ${requests.length}, Duration: ${Date.now() - startLog}ms`);
        } catch (e) {
            console.error(`[ERROR] updateDealsInBatch failed. Error: ${e.message}`);
        }
    }
};

// =================================================================
// REPOSITÓRIO: EXECUÇÃO DOS WORKFLOWS
// =================================================================

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const OpenAI_ResponsesAPI = {
    getApiKey: function () {
        return OPENAI_API_KEY; // Importado via config.js
    },

    buildFetchRequest: function (options) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error("OpenAI API Key não configurada em config.js.");
        }

        const payload = {
            model: options.model || "gpt-4o-mini",
            input: options.input,
            store: options.store !== undefined ? options.store : true
        };

        if (options.instructions) payload.instructions = options.instructions;
        if (options.tools) payload.tools = options.tools;
        if (options.tool_resources) payload.tool_resources = options.tool_resources;
        if (options.previous_response_id) payload.previous_response_id = options.previous_response_id;
        if (options.textFormat) payload["text.format"] = options.textFormat;
        if (options.reasoning_effort) payload.reasoning = { effort: options.reasoning_effort };
        if (options.temperature !== undefined) payload.temperature = options.temperature;
        if (options.top_p !== undefined) payload.top_p = options.top_p;
        if (options.max_completion_tokens !== undefined) payload.max_completion_tokens = options.max_completion_tokens;

        return {
            url: OPENAI_RESPONSES_URL,
            method: "post",
            headers: {
                "Authorization": "Bearer " + apiKey,
                "Content-Type": "application/json"
            },
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };
    },

    create: function (options, maxRetries = 3) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error("OpenAI API Key não configurada em config.js.");
        }

        const payload = {
            model: options.model || "gpt-5.4-mini",
            input: options.input,
            store: options.store !== undefined ? options.store : true
        };

        if (options.instructions) payload.instructions = options.instructions;
        if (options.tools) payload.tools = options.tools;
        if (options.tool_resources) payload.tool_resources = options.tool_resources;
        if (options.previous_response_id) payload.previous_response_id = options.previous_response_id;
        if (options.textFormat) payload["text.format"] = options.textFormat;
        if (options.reasoning_effort) payload.reasoning = { effort: options.reasoning_effort };
        if (options.temperature !== undefined) payload.temperature = options.temperature;
        if (options.top_p !== undefined) payload.top_p = options.top_p;
        if (options.max_completion_tokens !== undefined) payload.max_completion_tokens = options.max_completion_tokens;

        const fetchOptions = {
            method: "post",
            headers: {
                "Authorization": "Bearer " + apiKey,
                "Content-Type": "application/json"
            },
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = UrlFetchApp.fetch(OPENAI_RESPONSES_URL, fetchOptions);
                const responseCode = response.getResponseCode();
                const responseText = response.getContentText();

                if (responseCode >= 200 && responseCode < 300) {
                    return JSON.parse(responseText);
                }

                if (responseCode === 429 || responseCode >= 500) {
                    if (attempt === maxRetries) {
                        throw new Error(`OpenAI API Error ${responseCode}: Limites atingidos. Payload: ${responseText}`);
                    }
                    const sleepTime = Math.pow(2, attempt) * 1000;
                    console.warn(`[WARN] OpenAI Responses API Error ${responseCode} on attempt ${attempt}. Retrying in ${sleepTime}ms.`);
                    Utilities.sleep(sleepTime);
                } else {
                    throw new Error(`OpenAI API Error ${responseCode}: ${responseText}`);
                }
            } catch (error) {
                if (attempt === maxRetries) {
                    throw new Error(`Falha de comunicação com OpenAI: ${error.message}`);
                }
                const sleepTime = Math.pow(2, attempt) * 1000;
                console.warn(`[WARN] Network error with OpenAI Responses API on attempt ${attempt}. Retrying in ${sleepTime}ms. Error: ${error.message}`);
                Utilities.sleep(sleepTime);
            }
        }
    },

    compact: function (previousResponseId) {
        const url = `${OPENAI_RESPONSES_URL}/${previousResponseId}/compact`;
        const fetchOptions = {
            method: "post",
            headers: {
                "Authorization": "Bearer " + this.getApiKey(),
                "Content-Type": "application/json"
            },
            muteHttpExceptions: true
        };
        const response = UrlFetchApp.fetch(url, fetchOptions);
        if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) {
            return JSON.parse(response.getContentText());
        } else {
            throw new Error(`Falha ao compactar: ${response.getContentText()}`);
        }
    }
};

var OpenAIRepository = {
    runWorkflowsLocally: function (workflowsData) {
        if (!workflowsData || workflowsData.length === 0) return [];
        let allResponses = [];

        console.info(`[INFO] Initiating local batch GAS execution for ${workflowsData.length} OpenAI Responses API tasks.`);

        let activeGenerators = [];

        // Initialize all generators
        for (let i = 0; i < workflowsData.length; i++) {
            const data = workflowsData[i];
            const workflowId = data.workflowId;
            let flowModule;

            try {
                if (typeof globalThis !== 'undefined' && globalThis[workflowId]) {
                    flowModule = globalThis[workflowId];
                } else {
                    flowModule = eval(workflowId);
                }

                const generator = flowModule.runWorkflow(data.payload);
                activeGenerators.push({
                    id: i,
                    workflowId: workflowId,
                    data: data,
                    generator: generator,
                    currentYield: generator.next(),
                    startTime: Date.now(),
                    retries: 0,
                    error: null,
                    done: false
                });
            } catch (e) {
                console.error(`[ERROR] Module init failed: ${workflowId}. Error: ${e.message}`);
                allResponses.push({ meta: data.meta, result: null, errorType: 'MODULE_INIT_FAIL' });
            }
        }

        // Process loop
        while (activeGenerators.length > 0) {
            const fetchRequests = [];
            const indicesMap = [];

            // Build Batch Requests
            for (let i = 0; i < activeGenerators.length; i++) {
                const state = activeGenerators[i];
                if (!state.currentYield.done && !state.done) {
                    try {
                        const apiOptions = state.currentYield.value;
                        const fetchReq = OpenAI_ResponsesAPI.buildFetchRequest(apiOptions);
                        fetchRequests.push(fetchReq);
                        indicesMap.push(i);
                    } catch (e) {
                        console.error(`[ERROR] Failed to build request for ${state.workflowId}: ${e.message}`);
                        state.error = e;
                        state.done = true;
                    }
                }
            }

            // Execute Batch Fetch All
            let rawResponses = [];
            if (fetchRequests.length > 0) {
                console.info(`[INFO] Executing UrlFetchApp.fetchAll with ${fetchRequests.length} parallel requests.`);
                try {
                    rawResponses = UrlFetchApp.fetchAll(fetchRequests);
                } catch (err) {
                    console.error(`[FATAL] fetchAll failed entirely: ${err.message}.`);
                    indicesMap.forEach(idx => {
                        activeGenerators[idx].error = err;
                        activeGenerators[idx].done = true;
                    });
                }
            }

            // Parse Responses and Advance Generators
            let stillActive = [];
            let needsSleep = 0;

            for (let i = 0; i < activeGenerators.length; i++) {
                const state = activeGenerators[i];
                if (state.done) continue; // skip already failed or done

                if (!state.currentYield.done) {
                    const reqIndex = indicesMap.indexOf(i);
                    if (reqIndex !== -1 && rawResponses[reqIndex]) {
                        const httpResponse = rawResponses[reqIndex];
                        const responseCode = httpResponse.getResponseCode();
                        const responseText = httpResponse.getContentText();

                        if (responseCode >= 200 && responseCode < 300) {
                            try {
                                const parsedRes = JSON.parse(responseText);
                                state.retries = 0;
                                state.currentYield = state.generator.next(parsedRes);
                            } catch (err) {
                                state.error = new Error(`JSON Parse Error: ${err.message}`);
                                state.done = true;
                            }
                        } else if (responseCode === 429 || responseCode >= 500) {
                            state.retries++;
                            if (state.retries > 3) {
                                state.error = new Error(`OpenAI Limit Reached/Server Error (${responseCode}): ${responseText}`);
                                state.done = true;
                            } else {
                                const sleepTime = Math.pow(2, state.retries) * 1000;
                                needsSleep = Math.max(needsSleep, sleepTime);
                                console.warn(`[WARN] OpenAI Response ${responseCode} for ${state.workflowId}. Planned sleep for ${sleepTime}ms.`);
                            }
                        } else {
                            state.error = new Error(`OpenAI API ${responseCode}: ${responseText}`);
                            state.done = true;
                        }
                    } else if (reqIndex !== -1 && !rawResponses[reqIndex]) {
                        state.error = new Error("No HTTP Response returned.");
                        state.done = true;
                    }
                }

                // Has execution finished?
                if (state.currentYield && state.currentYield.done) {
                    state.done = true;
                }

                if (!state.done) {
                    stillActive.push(state);
                } else {
                    const duration = Date.now() - state.startTime;
                    if (state.error) {
                        console.error(`[ERROR] Workflow failed. Module ID: ${state.workflowId}, Error: ${state.error.message}`);
                        LoggerService.logToGoogleSheets(state.data.meta.dealId, state.workflowId, state.data.payload, "FALHA DE EXECUÇÃO", duration, state.error.message);
                        allResponses.push({ meta: state.data.meta, result: null, errorType: 'EXECUTION_FAIL' });
                    } else {
                        const output = state.currentYield.value;
                        console.info(`[INFO] Workflow completed. Module: ${state.workflowId}, Deal ID: ${state.data.meta.dealId}, Duration: ${duration}ms`);
                        LoggerService.logToGoogleSheets(state.data.meta.dealId, state.workflowId, state.data.payload, output, duration, "");

                        if (output && output.bypass) {
                            allResponses.push({ meta: state.data.meta, result: null, errorType: null });
                        } else if (typeof output === 'object') {
                            allResponses.push({ meta: state.data.meta, result: output, errorType: null });
                        } else if (typeof output === 'string') {
                            allResponses.push({ meta: state.data.meta, result: output, errorType: null });
                        } else {
                            allResponses.push({ meta: state.data.meta, result: null, errorType: null });
                        }
                    }
                }
            }

            if (needsSleep > 0 && stillActive.length > 0) {
                console.warn(`[WARN] Sleeping globally for ${needsSleep}ms due to 429/5xx responses in batch.`);
                Utilities.sleep(needsSleep);
            }

            activeGenerators = stillActive;
        }

        return allResponses;
    }
};

function getNucleusInfo(labelId) {
    const nuclei = {
        'NDados': { abreviacao: 'NDados', nome_completo: 'Núcleo de Análise de Dados e Inteligência Artificial' },
        'NCon': { abreviacao: 'NCon', nome_completo: 'Núcleo de Gestão Empresarial e Consultoria' },
        'NTec': { abreviacao: 'NTec', nome_completo: 'Núcleo de Tecnologia e Desenvolvimento de Software' },
        'NCiv': { abreviacao: 'NCiv', nome_completo: 'Núcleo de Engenharia Civil e Arquitetura' }
    };
    return nuclei[labelId] || { abreviacao: 'Geral', nome_completo: 'Poli Júnior' };
}

/**
 * =================================================================
 * SERVIÇO DE LOGS DA IA (PLANILHA)
 * =================================================================
 */
const LoggerService = {
    logToGoogleSheets: function (dealId, workflowId, inputPayload, outputResult, durationMs, errorMsg = "") {
        if (!REGRAS_CONFIG.PLANILHA_LOGS_IA_ID) {
            console.warn("[WARN] REGRAS_CONFIG.PLANILHA_LOGS_IA_ID não está configurado. Pulando gravação no Sheets.");
            return;
        }

        try {
            const ss = SpreadsheetApp.openById(REGRAS_CONFIG.PLANILHA_LOGS_IA_ID);
            let sheet = ss.getSheetByName("Logs IA");
            if (!sheet) {
                console.log("[DEBUG] Aba 'Logs IA' não encontrada. Criando nova aba.");
                // Cria a aba se não existir e coloca cabeçalhos
                sheet = ss.insertSheet("Logs IA");
                sheet.appendRow(["Data/Hora", "Deal ID", "Workflow", "Input (Payload)", "Output (Resposta)", "Duração (ms)", "Erro"]);
                sheet.getRange("A1:G1").setFontWeight("bold");
            }

            const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
            const strInput = typeof inputPayload === 'object' ? JSON.stringify(inputPayload, null, 2) : String(inputPayload);
            const strOutput = typeof outputResult === 'object' ? JSON.stringify(outputResult, null, 2) : String(outputResult);

            sheet.appendRow([timestamp, dealId || "N/A", workflowId, strInput, strOutput, durationMs || 0, errorMsg]);
            console.info(`[INFO] Linha gravada com sucesso no Sheets (Deal ID: ${dealId}).`);

        } catch (e) {
            console.error(`[ERROR] Falha ao gravar log da IA na planilha. Motivo: ${e.message}`);
        }
    }
};

/**
 * =================================================================
 * DEDUPLICAÇÃO E LIMPEZA
 * =================================================================
 */

function deduplicateDeals(deals) {
    if (!deals || deals.length === 0) return deals;

    console.info('[INFO] Starting deal deduplication process in funnel.');
    const groups = {};

    deals.forEach(deal => {
        const personId = deal.person_id ? deal.person_id.value : 'NO_PERSON';
        const orgId = deal.org_id ? deal.org_id.value : 'NO_ORG';

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

        console.warn(`[WARN] Duplicate deals detected. Key: ${key}, Count: ${dealList.length}`);

        const sortedList = dealList.sort((a, b) => new Date(a.add_time) - new Date(b.add_time));
        const winner = sortedList[0];
        const losers = sortedList.slice(1);

        console.info(`[INFO] Deduplication winner resolved. Deal ID: ${winner.id}, Title: ${winner.title}, Created: ${winner.add_time}`);
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
            try { UrlFetchApp.fetchAll(lostRequests); } catch (e) { console.error(`[ERROR] Failed to mark duplicate deals as LOST. Error: ${e.message}`); }
            console.info(`[INFO] Pipedrive API batch deduplication update completed. Losers marked: ${lostRequests.length}, Duration: ${Date.now() - startLog}ms`);

            losers.forEach(loserDeal => {
                totalRemoved++;
            });
        }
    }

    if (totalRemoved > 0) {
        console.info(`[INFO] Deduplication process finished. Total duplicates removed: ${totalRemoved}`);
    }
    else {
        console.info(`[INFO] Deduplication process finished. 0 duplicates found`);
    }

    return uniqueDeals;
}
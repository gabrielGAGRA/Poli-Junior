/**
 * POLI JÚNIOR - AI SALES ENGINE (2026)
 * Orquestrador Multi-Agente: OpenAI Responses API + Pipedrive
 */

function syncAndSummarize() {
    const stagesToSync = Object.keys(WORKFLOW_STAGE_MAPPING).map(Number);
    let deals = PipedriveRepository.fetchDealsInStages(stagesToSync);

    deals = deduplicateDeals(deals);

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
                    const nucleus = getNucleusInfo(deal[CUSTOM_FIELDS.LABEL]);
                    workflowsToRun.push({
                        workflowId: AGENT_CONFIG.WORKFLOW_ANALISTA_ID,
                        payload: {
                            input_as_text: rawNotesText,
                            state: {
                                nucleo: nucleus.abreviacao,
                                nucleo_nome_completo: nucleus.nome_completo,
                                owner_id: String(deal.user_id.id)
                            }
                        },
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

    let workflowsToRun = [];

    for (const deal of deals) {
        try {
            const stepInfo = WORKFLOW_STAGE_MAPPING[deal.stage_id];
            const nucleus = (deal[CUSTOM_FIELDS.LABEL] || 'NDados');
            const isOwnerActive = activeUsers.includes(deal.user_id.id);

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
        if (options.reasoning_effort) payload.reasoning_effort = options.reasoning_effort;
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

        console.info(`[INFO] Initiating local GAS execution for ${workflowsData.length} OpenAI Responses API tasks.`);

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
            } catch (e) {
                console.error(`[ERROR] Workflow module not found in project scope. Module ID: ${workflowId}`);
                allResponses.push({ meta: data.meta, result: null, errorType: 'MODULE_NOT_FOUND' });
                continue;
            }

            try {
                const startLog = Date.now();
                const output = flowModule.runWorkflow(data.payload);
                const duration = Date.now() - startLog;
                console.info(`[INFO] Workflow execution completed successfully. Module ID: ${workflowId}, Deal ID: ${data.meta.dealId || 'Unknown'}, Duration: ${duration}ms`);

                if (output && output.bypass) {
                    allResponses.push({ meta: data.meta, result: null, errorType: null });
                } else if (typeof output === 'object') {
                    allResponses.push({ meta: data.meta, result: output, errorType: null });
                } else if (typeof output === 'string') {
                    allResponses.push({ meta: data.meta, result: output, errorType: null });
                } else {
                    allResponses.push({ meta: data.meta, result: null, errorType: null });
                }
            } catch (err) {
                console.error(`[ERROR] Workflow execution failed. Module ID: ${workflowId}, Error: ${err.message}`);
                allResponses.push({ meta: data.meta, result: null, errorType: 'EXECUTION_FAIL' });
            }
        }

        return allResponses;
    }
};

function getNucleusInfo(labelId) {
    const nuclei = {
        'NDados': { abreviacao: 'NDados', nome_completo: 'Núcleo de Análise de Dados e Inteligência Artificial' },
        'NCon': { abreviacao: 'NCon', nome_completo: 'Núcleo de Gestão Empresarial e Consultoria' },
        'NTec': { abreviacao: 'NTec', nome_completo: 'Núcleo de Tecnologia e Desenvolvimento de Software' },
        'NCiv': { abreviacao: 'NCiv', nome_completo: 'Núcleo de Engenharia Civil e Arquitetura' },
        'PJ': { abreviacao: 'PJ', nome_completo: 'Poli Júnior' }, // Só adicionado como fallback
    };
    return nuclei[labelId] || nuclei['PJ']; // Fallback para PJ
}

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

    return uniqueDeals;
}
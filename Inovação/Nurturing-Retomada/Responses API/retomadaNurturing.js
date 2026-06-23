// Autor: Gabriel Agra de Castro Motta
// Última atualização: 21/06/2026
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/**
 * POLI JÚNIOR - AI SALES ENGINE (2026)
 * Orquestrador Multi-Agente: OpenAI Responses API + Pipedrive
 */

let _labelIdMapCache = null;
let _activeUsersCache = null;
// NOTA: reinicializado a cada execução do GAS (sem persistência entre triggers).
// Usado apenas para evitar reprocessar deals marcados durante o ciclo atual.
let _currentCycleMarkedDealIds = new Set();

const OPS = {
    get SUMMARY() { return CONFIG.OPERATIONS?.SUMMARY || {}; },
    get EMAIL() { return CONFIG.OPERATIONS?.EMAIL || {}; },
    get BATCH() { return CONFIG.OPERATIONS?.BATCH || {}; },
    get CONTINUATION() { return CONFIG.OPERATIONS?.CONTINUATION || {}; },
    get CACHE() { return CONFIG.OPERATIONS?.CACHE || {}; }
};
const SUMMARY_OPS = {
    get GAS_RUNTIME_BUDGET_MS() { return OPS.SUMMARY.GAS_RUNTIME_BUDGET_MS; },
    get MAX_DEALS_PER_RUN() { return OPS.SUMMARY.MAX_DEALS_PER_RUN; },
    get OPENAI_CHUNK_SIZE() { return OPS.SUMMARY.OPENAI_CHUNK_SIZE; },
    get EMPTY_NOTES_DELETE_CAP() { return OPS.SUMMARY.EMPTY_NOTES_DELETE_CAP; }
};
const EMAIL_OPS = {
    get GAS_RUNTIME_BUDGET_MS() { return OPS.EMAIL.GAS_RUNTIME_BUDGET_MS; },
    get MAX_DEALS_PER_RUN() { return OPS.EMAIL.MAX_DEALS_PER_RUN; },
    get OPENAI_CHUNK_SIZE() { return OPS.EMAIL.OPENAI_CHUNK_SIZE; }
};
const BATCH_OPS = {
    get OPENAI_CHUNK_SIZE() { return OPS.BATCH.OPENAI_CHUNK_SIZE; }
};
const CONTINUATION_OPS = {
    get CONTINUATION_DELAY_MS() { return OPS.CONTINUATION.CONTINUATION_DELAY_MS; },
    get CONTINUATION_MIN_SCHEDULE_INTERVAL_MS() { return OPS.CONTINUATION.CONTINUATION_MIN_SCHEDULE_INTERVAL_MS; },
    get CONTINUATION_MAX_RUNS_PER_DAY() { return OPS.CONTINUATION.CONTINUATION_MAX_RUNS_PER_DAY; },
    get CONTINUATION_MAX_GENERATIONS() { return OPS.CONTINUATION.CONTINUATION_MAX_GENERATIONS; }
};
const CACHE_OPS = {
    get DEAL_FAILURE_ENTRY_MAX_AGE_MS() { return OPS.CACHE.DEAL_FAILURE_ENTRY_MAX_AGE_MS; },
    get DEAL_FAILURE_CACHE_MAX_ITEMS() { return OPS.CACHE.DEAL_FAILURE_CACHE_MAX_ITEMS; },
    get SUMMARIZED_DEALS_CACHE_MAX_AGE_MS() { return OPS.CACHE.SUMMARIZED_DEALS_CACHE_MAX_AGE_MS; },
    get SUMMARIZED_DEALS_CACHE_MAX_ITEMS() { return OPS.CACHE.SUMMARIZED_DEALS_CACHE_MAX_ITEMS; }
};
function getValidNuclei() {
    return Object.freeze(Array.isArray(CONFIG.VALID_NUCLEI) && CONFIG.VALID_NUCLEI.length > 0
        ? CONFIG.VALID_NUCLEI.slice()
        : ['NDados', 'NCon', 'NTec', 'NCiv']);
}

/**
 * Sincroniza deals na fase inicial do funil e dispara sumarização via OpenAI.
 *
 * Limites: respeita os budgets configurados em CONFIG.OPERATIONS.SUMMARY.
 * Concorrência: usa LockService para impedir execuções simultâneas.
 *
 * @throws {never} Erros individuais são capturados por deal e registrados em DealFailureCache.
 */
function syncAndSummarize() {
    const mainLock = LockService.getScriptLock();
    let lockAcquired = false;

    try {
        lockAcquired = mainLock.tryLock(3000);
        if (!lockAcquired) {
            console.warn('[WARN] Outra execução de syncAndSummarize já está rodando. Abortando para evitar duplicidade.');
            return;
        }

        ContinuationScheduler.deleteTriggers('retomadaContinueSyncAndSummarize'); // Cleanup preventivo de phantom triggers
        const SCRIPT_START_TIME = Date.now();
        const SUMMARY_RUNTIME_BUDGET_MS = Number(SUMMARY_OPS.GAS_RUNTIME_BUDGET_MS || MAX_EXECUTION_TIME);

        const stageMapping = CONFIG.WORKFLOW_STAGE_MAPPING;
        let stagesToSync = [];
        for (const stageId in stageMapping) {
            if (stageMapping[stageId]) {
                stagesToSync.push(Number(stageId));
            }
        }

        // Adiciona o estágio de Espera da Nutrição para gerar resumos mais cedo
        if (CONFIG.STAGES.ESPERA.id && !stagesToSync.includes(CONFIG.STAGES.ESPERA.id)) {
            stagesToSync.push(CONFIG.STAGES.ESPERA.id);
        }

        const stagesToSyncMeta = stagesToSync
            .map(id => `${id}:${(stageMapping[id] && stageMapping[id].cadencia) || '?'}#${(stageMapping[id] && stageMapping[id].passo) || '?'}`)
            .join(', ');
        console.info(`[INFO] syncAndSummarize: fetching open deals by stage_id. stagesToSync=[${stagesToSync.join(', ')}] meta=[${stagesToSyncMeta}]`);

        const processLimit = Number(SUMMARY_OPS.MAX_DEALS_PER_RUN || 99999);
        let hitProcessingLimit = false;

        let deals = PipedriveRepository.fetchDealsByFilter(11955);
        
        // Fase 1: Desduplicar TODOS os cards antes de qualquer filtro de estágio ou processamento
        deals = deduplicateDeals(deals);

        // Ordena para priorizar os estágios válidos para sumarização (stagesToSync) primeiro, mas mantém todos os estágios
        deals.sort((a, b) => {
            const aInSync = stagesToSync.includes(Number(a.stage_id));
            const bInSync = stagesToSync.includes(Number(b.stage_id));
            if (aInSync && !bInSync) return -1;
            if (!aInSync && bInSync) return 1;
            return 0;
        });

        const labelIdMap = PipedriveRepository.getLabelMapping();
        const summarizedCache = SummarizedDealsCache.getCache();
        let cacheUpdated = false;

        const dealIdsForNotes = [];
        const originalDealIdsForNotes = [];
        deals.forEach(deal => {
            if (summarizedCache[deal.id]) {
                return; // Pula busca de notas se o deal já foi sumariado e está no cache
            }
            if (deal.notes_count > 0) {
                dealIdsForNotes.push(deal.id);
            } else {
                const originalDealId = deal[CONFIG.CUSTOM_FIELDS.ORIGIN_ID_FIELD.key];
                if (originalDealId) {
                    originalDealIdsForNotes.push(originalDealId);
                }
            }
        });

        const notesByDealId = PipedriveRepository.getNotesByDealIds([...new Set(dealIdsForNotes), ...new Set(originalDealIdsForNotes)]);

        let workflowsToRun = [];
        let dealsToDelete = [];
        let dealsReadyForSummary = [];

        // Fase 2: Sincronizar Notas de TODOS os cards antes de iniciar qualquer envio à IA
        for (const deal of deals) {
            try {
                if ((Date.now() - SCRIPT_START_TIME) >= SUMMARY_RUNTIME_BUDGET_MS) {
                    console.warn(`[WARN] syncAndSummarize: limite de tempo atingido na fase de sincronização de notas.`);
                    hitProcessingLimit = true;
                    break;
                }

                const dealTitle = deal.title || "(sem título)";
                if (summarizedCache[deal.id]) {
                    continue;
                }

                let notesForSummary = [];
                let needsSummary = false;

                if (deal.notes_count === 0) {
                    const originalDealId = deal[CONFIG.CUSTOM_FIELDS.ORIGIN_ID_FIELD.key];
                    const dealUrl = `https://polijunior.pipedrive.com/deal/${deal.id}`;

                    if (!originalDealId) {
                        console.warn(`[WARN] Deal ID: ${deal.id} (${dealTitle}) has notes_count=0 and no origin deal id. Link: ${dealUrl}. Marking for deletion.`);
                        dealsToDelete.push({ id: deal.id, title: dealTitle });
                        continue;
                    }

                    const originalNotes = notesByDealId[String(originalDealId)] || [];

                    if (!originalNotes || originalNotes.length === 0) {
                        console.warn(`[WARN] Deal ID: ${deal.id} (${dealTitle}) lacks annotations in original Deal ID: ${originalDealId}. Link: ${dealUrl}. Marking for deletion.`);
                        dealsToDelete.push({ id: deal.id, title: dealTitle });
                        continue;
                    }

                    // Sincroniza passando array vazio para as notas locais existentes (evita request desnecessário)
                    notesForSummary = PipedriveRepository.syncOriginNotes(deal.id, originalDealId, originalNotes, []);
                    needsSummary = notesForSummary.length > 0;
                } else {
                    notesForSummary = notesByDealId[String(deal.id)] || [];
                    const hasSummary = notesForSummary.some(n => n.content && n.content.includes(AGENT_CONFIG.RESUMO_PREFIX));
                    needsSummary = !hasSummary && notesForSummary.length > 0;

                    if (hasSummary) {
                        summarizedCache[deal.id] = Date.now();
                        cacheUpdated = true;
                        console.log(`[DEBUG] Deal ID: ${deal.id} já está atualizado, pulando.`);
                    }
                }

                if (needsSummary) {
                    dealsReadyForSummary.push({ deal, notesForSummary });
                } else {
                    if (deal.notes_count > 0 && (!notesForSummary || notesForSummary.length === 0)) {
                        console.warn(`[WARN] Deal ID: ${deal.id} (${dealTitle}) has notes_count>0 but fetched 0 notes. Possible API inconsistency.`);
                    }
                }
            } catch (e) {
                try { DealFailureCache.recordFailure('syncAndSummarize', deal.id, deal.title || '(sem título)', e.toString(), true); } catch (_) { }
                console.error(`[ERROR] Failed to analyze/sync notes for Deal ID: ${deal.id}. Reason: ${e.toString()}`);
            }
        }

        // Fase 3: Envio para IA para criação do Resumo (somente se não estouramos o tempo)
        if (!hitProcessingLimit && dealsReadyForSummary.length > 0) {
            for (const item of dealsReadyForSummary) {
                const { deal, notesForSummary } = item;
                try {
                    const rawNotesText = notesForSummary
                        .filter(n => n.content && !n.content.includes(AGENT_CONFIG.RESUMO_PREFIX))
                        .map(n => stripHtmlTags(n.content))
                        .join('\n---\n');

                    if (rawNotesText.trim()) {
                        let rawLabelValue = deal[CONFIG.CUSTOM_FIELDS.LABEL.key];
                        if (Array.isArray(rawLabelValue) && rawLabelValue.length > 0) {
                            rawLabelValue = rawLabelValue[0];
                        }
                        if (typeof rawLabelValue === 'string') {
                            rawLabelValue = rawLabelValue.trim();
                        }

                        const mappedLabel = labelIdMap[String(rawLabelValue)] || rawLabelValue;

                        let nucleusAbrev = getValidNuclei().includes(mappedLabel) ? mappedLabel : 'Geral';
                        const nucleus = getNucleusInfo(nucleusAbrev);

                        const payload = {
                            input_as_text: rawNotesText,
                            state: {
                                nucleo: nucleus.abreviacao,
                                nucleo_nome_completo: nucleus.nome_completo,
                                owner_id: String(deal.user_id?.id ?? 'UNKNOWN')
                            }
                        };

                        console.log(`[DEBUG] Preparando envio de sumário para Deal ID: ${deal.id} - Label ${rawLabelValue} -> ${nucleus.abreviacao}`);

                        workflowsToRun.push({
                            workflowId: AGENT_CONFIG.WORKFLOW_ANALISTA_ID,
                            payload: payload,
                            meta: { dealId: deal.id, nucleus: nucleus.abreviacao }
                        });
                    }
                } catch (e) {
                    try { DealFailureCache.recordFailure('syncAndSummarize', deal.id, deal.title || '(sem título)', e.toString(), true); } catch (_) { }
                    console.error(`[ERROR] Failed to prepare summary workflow for Deal ID: ${deal.id}. Reason: ${e.toString()}`);
                }
            }

            if (workflowsToRun.length > 0) {
                const results = OpenAIRepository.runWorkflowsLocally(workflowsToRun, {
                    maxRuntimeMs: MAX_EXECUTION_TIME - (Date.now() - SCRIPT_START_TIME),
                    chunkSize: Number(SUMMARY_OPS.OPENAI_CHUNK_SIZE || BATCH_OPS.OPENAI_CHUNK_SIZE || 5),
                    onSuccess: function(res) {
                        const resultText = res.result.output_text || res.result;
                        const content = `<h1>${AGENT_CONFIG.RESUMO_PREFIX}</h1>\n${resultText}`;
                        const dealId = res.meta.dealId;

                        const saveUrl = `${PIPEDRIVE_API_BASE_URL}/notes?api_token=${PIPEDRIVE_API_TOKEN}`;
                        const savePayload = { deal_id: dealId, content: content };

                        try {
                            console.info(`[INFO] Saving summary immediately to Pipedrive for Deal ID: ${dealId}`);
                            const resp = UrlFetchApp.fetch(saveUrl, {
                                method: 'post',
                                contentType: 'application/json',
                                payload: JSON.stringify(savePayload),
                                muteHttpExceptions: true
                            });
                            const code = resp.getResponseCode();
                            if (code >= 200 && code < 300) {
                                summarizedCache[dealId] = Date.now();
                                cacheUpdated = true;
                                console.info(`[INFO] Summary note successfully saved immediately in Pipedrive for Deal ID: ${dealId}`);
                            } else {
                                console.error(`[ERROR] Failed to save summary immediately in Pipedrive for Deal ID: ${dealId}. Code: ${code}, Body: ${resp.getContentText()}`);
                                try { DealFailureCache.recordFailure('syncAndSummarize', dealId, '(título indisponível)', `Pipedrive save non-2xx (${code})`, false); } catch (_) { }
                            }
                        } catch (err) {
                            console.error(`[ERROR] Exception saving summary immediately to Pipedrive for Deal ID: ${dealId}. Error: ${err.message}`);
                            try { DealFailureCache.recordFailure('syncAndSummarize', dealId, '(título indisponível)', `Exception: ${err.message}`, true); } catch (_) { }
                        }
                    }
                });

                results.forEach(res => {
                    if (res.result) {
                        // Already handled and saved in onSuccess!
                    } else {
                        try {
                            const isInternal = !!res.isInternal;
                            DealFailureCache.recordFailure('syncAndSummarize', res.meta.dealId, '(título indisponível)', res.errorMsg || 'OpenAI returned empty result', isInternal);
                        } catch (_) { }
                    }
                });

                if (results.timedOut) {
                    hitProcessingLimit = true;
                    console.info(`[INFO] syncAndSummarize: OpenAI batch runner hit the runtime budget with ${results.pendingWorkflows || 0} pending workflows.`);
                }
            }
        }

        if (cacheUpdated) {
            SummarizedDealsCache.saveCache(summarizedCache);
            console.info('[INFO] Cache de sumários persistido.');
        }

        if (dealsToDelete.length > 0) {
            console.warn(`[WARN] ${dealsToDelete.length} deals inelegíveis para processamento (sem notas): ${dealsToDelete.map(d => d.id).join(', ')}`);
        }

        if (dealsToDelete.length > 0) {
            const MAX_CARDS_DELETE_LIMIT = Number(SUMMARY_OPS.EMPTY_NOTES_DELETE_CAP || 10);
            const eligibleDeletes = dealsToDelete.filter(d => !_currentCycleMarkedDealIds.has(String(d.id)));
            const skippedAlreadyMarked = dealsToDelete.length - eligibleDeletes.length;
            const hitDeletionLimit = eligibleDeletes.length > MAX_CARDS_DELETE_LIMIT;
            const limitedDeletes = eligibleDeletes.slice(0, MAX_CARDS_DELETE_LIMIT);
            const dealsLabel = limitedDeletes.map(d => `${d.id} (${d.title})`).join(' | ');
            console.info(`[INFO] Executing bulk deletion of ${limitedDeletes.length} deals (capped at ${MAX_CARDS_DELETE_LIMIT}). Deals: ${dealsLabel}`);
            PipedriveRepository.executeBulkDeletes(limitedDeletes.map(d => d.id));

            if (skippedAlreadyMarked > 0) {
                console.info(`[INFO] Skipped ${skippedAlreadyMarked} deals already mutated in this cycle.`);
            }

            if (hitDeletionLimit) {
                console.info(`[INFO] syncAndSummarize: delete cap hit (${eligibleDeletes.length} eligible).`);
            }

            if (hitProcessingLimit || hitDeletionLimit) {
                ContinuationScheduler.schedule('syncAndSummarize', 'retomadaContinueSyncAndSummarize', `pending_work(processLimit=${MAX_CARDS_DELETE_LIMIT}, deleteMarked=${eligibleDeletes.length})`);
            }
        } else if (hitProcessingLimit) {
            ContinuationScheduler.schedule('syncAndSummarize', 'retomadaContinueSyncAndSummarize', `pending_work(processLimit=${processLimit}, deleteMarked=0)`);
        }

        if (!hitProcessingLimit && dealsToDelete.length === 0) {
            ContinuationScheduler.resetGeneration('syncAndSummarize');
        }

        DealFailureCache.flush();
    } finally {
        if (lockAcquired) {
            mainLock.releaseLock();
        }
    }
}

function retomadaContinueSyncAndSummarize() {
    syncAndSummarize();
}

/**
 * Gera e persiste e-mails da cadência com base no estágio, owner e histórico do deal.
 *
 * Limites: respeita os budgets configurados em CONFIG.OPERATIONS.EMAIL.
 * Concorrência: usa LockService para impedir execuções simultâneas.
 *
 * @throws {never} Erros individuais são capturados por deal e registrados em DealFailureCache.
 */
function executeEmailCadence() {
    const mainLock = LockService.getScriptLock();
    let lockAcquired = false;

    try {
        lockAcquired = mainLock.tryLock(3000);
        if (!lockAcquired) {
            console.warn('[WARN] Outra execução de executeEmailCadence já está rodando. Abortando para evitar duplicidade.');
            return;
        }

        ContinuationScheduler.deleteTriggers('retomadaContinueExecuteEmailCadence'); // Cleanup preventivo de phantom triggers
        const SCRIPT_START_TIME = Date.now();
        const EMAIL_RUNTIME_BUDGET_MS = Number(EMAIL_OPS.GAS_RUNTIME_BUDGET_MS || MAX_EXECUTION_TIME);

        const activeUsers = PipedriveRepository.getActiveUsers();
        const stageMapping = CONFIG.WORKFLOW_STAGE_MAPPING;
        const stagesToProcess = Object.keys(stageMapping).map(Number);
        let deals = PipedriveRepository.fetchDealsByFilter(11955);

        // Fase 1: Desduplicar TODOS os cards antes de qualquer filtro de estágio ou processamento
        deals = deduplicateDeals(deals);

        // Agora filtra pelos estágios válidos para processar e-mail
        deals = deals.filter(deal => stagesToProcess.includes(Number(deal.stage_id)));

        const labelIdMap = PipedriveRepository.getLabelMapping();

        let workflowsToRun = [];
        const processLimit = Number(EMAIL_OPS.MAX_DEALS_PER_RUN || 99999);
        let hitProcessingLimit = false;

        let dealsReadyForEmail = [];

        const candidateDeals = [];
        const dealIdsForHistory = [];

        // Fase 2: Filtrar e identificar candidatos válidos antes de carregar o histórico
        for (const deal of deals) {
            try {
                if ((Date.now() - SCRIPT_START_TIME) >= EMAIL_RUNTIME_BUDGET_MS) {
                    console.warn(`[WARN] executeEmailCadence: limite de tempo atingido na fase de pré-filtragem.`);
                    hitProcessingLimit = true;
                    break;
                }

                const stepInfo = stageMapping[deal.stage_id];
                if (!stepInfo) continue;

                // Validações da Retomada (duas primeiras etapas: aguardar 7 dias p/ < 50k, ou > 50k gera logo no preparar e-mail)
                if (stepInfo.cadencia === 'Retomada' && stepInfo.passo <= 2) {
                    const dealValue = parseFloat(deal.value) || 0;
                    let canGenerateEmail = false;

                    if (dealValue > 50000 && stepInfo.passo === 1) {
                        canGenerateEmail = true; // Valor > 50k no preparar-email (passo 1) gera logo
                    } else {
                        const dataRetomadaStr = deal[CONFIG.CUSTOM_FIELDS.DATA_RETOMADA.key];
                        if (dataRetomadaStr) {
                            const dataRet = new Date(dataRetomadaStr);
                            const diffDays = (dataRet.getTime() - Date.now()) / (1000 * 3600 * 24);
                            if (diffDays <= 7) {
                                canGenerateEmail = true;
                            }
                        }
                    }

                    if (!canGenerateEmail) {
                        console.log(`[DEBUG] Deal ID: ${deal.id} skipped email cadence -> Retomada < 50k aguardando prazo de 7 dias para envio de email.`);
                        continue;
                    }
                }

                // Evita re-gerar (e re-pagar IA) se o e-mail já foi salvo no card.
                const existingTitle = deal[CONFIG.CUSTOM_FIELDS.EMAIL_TITLE.key];
                const existingBody = deal[CONFIG.CUSTOM_FIELDS.EMAIL_BODY.key];
                if ((typeof existingTitle === 'string' && existingTitle.trim()) && (typeof existingBody === 'string' && existingBody.trim())) {
                    console.info(`[INFO] Deal ID: ${deal.id} skipped email cadence -> email fields already populated.`);
                    continue;
                }

                if (DealFailureCache.shouldSkip('executeEmailCadence', deal.id)) {
                    console.warn(`[WARN] executeEmailCadence: skipping Deal ID: ${deal.id} due to recent failures/backoff.`);
                    continue;
                }

                const ownerId = deal.user_id ? deal.user_id.id : null;
                if (ownerId === null) {
                    const dealUrl = `https://polijunior.pipedrive.com/deal/${deal.id}`;
                    console.warn(`[WARN] Deal ID: ${deal.id} sem owner (user_id null). Enviando para revisão manual.`);
                    alertarErroManual(
                        'Deal sem owner_id no executeEmailCadence',
                        `Deal ID ${deal.id} (${deal.title || '(sem título)'}) está sem responsável. Link: ${dealUrl}`,
                        [String(deal.id)]
                    );
                    continue;
                }

                if (!deal.notes_count || Number(deal.notes_count) === 0) {
                    console.log(`[DEBUG] Deal ID: ${deal.id} skipped -> notes_count is 0.`);
                    continue;
                }

                candidateDeals.push({ deal, stepInfo, ownerId });
                dealIdsForHistory.push(deal.id);

            } catch (e) {
                try { DealFailureCache.recordFailure('executeEmailCadence', deal.id, deal.title || '(sem título)', e.toString(), true); } catch (_) { }
                console.error(`[ERROR] Failed to pre-filter Deal ID: ${deal.id}. Reason: ${e.toString()}`);
            }
        }

        // Buscar notas e históricos de e-mail de todos os candidatos em paralelo
        let historiesByDealId = {};
        if (!hitProcessingLimit && dealIdsForHistory.length > 0) {
            historiesByDealId = PipedriveRepository.getNotesAndEmailHistoryByDealIds(dealIdsForHistory);
        }

        // Fase 3: Validar usando dados pré-buscados
        if (!hitProcessingLimit && candidateDeals.length > 0) {
            for (const candidate of candidateDeals) {
                const { deal, stepInfo, ownerId } = candidate;
                try {
                    if ((Date.now() - SCRIPT_START_TIME) >= EMAIL_RUNTIME_BUDGET_MS) {
                        console.warn(`[WARN] executeEmailCadence: limite de tempo atingido na fase de processamento de histórico.`);
                        hitProcessingLimit = true;
                        break;
                    }

                    const isOwnerActive = ownerId !== null ? activeUsers.includes(ownerId) : false;
                    const history = historiesByDealId[String(deal.id)] || { notes: [], emailHistory: [] };
                    const notes = history.notes;
                    const emailHistory = history.emailHistory;

                    // Validação de Owner Inativo
                    if (!isOwnerActive) {
                        const isRetomada = stepInfo.cadencia.includes("Retomada");
                        const isNurturingReengagement = stepInfo.cadencia.includes("Nurturing") && stepInfo.cadencia.includes("Breakup");

                        if (!isRetomada && !isNurturingReengagement) {
                            console.warn(`[WARN] Deal ID: ${deal.id} owner ${deal.user_id.name} is inactive and not first e-mail in Retomada/Reengagement. Marking as LOST.`);
                            PipedriveRepository.markDealAsLost(deal.id, `Owner Inativo (${deal.user_id.name}) fora de primeiro em Retomada/Reengagement.`);
                            continue;
                        }

                        const hasPreviousEmails = emailHistory && emailHistory.length > 0;

                        if (hasPreviousEmails && stepInfo.passo > 1) {
                            console.warn(`[WARN] Deal ID: ${deal.id} owner inactive mid-sequence. Marking as LOST.`);
                            PipedriveRepository.markDealAsLost(deal.id, `Owner Inativo (${deal.user_id.name}) detectado no meio da sequência.`);
                            continue;
                        }
                    }

                    const summaries = notes
                        .filter(n => n.content && n.content.includes(AGENT_CONFIG.RESUMO_PREFIX))
                        .sort((a, b) => new Date(b.add_time) - new Date(a.add_time));
                    const summaryNote = summaries.length > 0 ? summaries[0] : null;

                    if (!summaryNote) {
                        console.log(`[DEBUG] Deal ID: ${deal.id} skipped -> no strategic summary found in notes.`);
                        continue;
                    }

                    dealsReadyForEmail.push({
                        deal,
                        stepInfo,
                        ownerId,
                        isOwnerActive,
                        summaryNote,
                        emailHistory
                    });

                } catch (e) {
                    try { DealFailureCache.recordFailure('executeEmailCadence', deal.id, deal.title || '(sem título)', e.toString(), true); } catch (_) { }
                    console.error(`[ERROR] Failed to validate/process history for Deal ID: ${deal.id}. Reason: ${e.toString()}`);
                }
            }
        }

        // Fase 3: Envio para IA para criação de E-mail (somente se não estouramos o tempo)
        if (!hitProcessingLimit && dealsReadyForEmail.length > 0) {
            for (const item of dealsReadyForEmail) {
                const { deal, stepInfo, ownerId, isOwnerActive, summaryNote, emailHistory } = item;
                try {
                    let rawLabelValue = deal[CONFIG.CUSTOM_FIELDS.LABEL.key];
                    if (Array.isArray(rawLabelValue) && rawLabelValue.length > 0) {
                        rawLabelValue = rawLabelValue[0];
                    }
                    if (typeof rawLabelValue === 'string') {
                        rawLabelValue = rawLabelValue.trim();
                    }

                    const mappedLabel = labelIdMap[String(rawLabelValue)] || rawLabelValue;
                    let nucleus = getValidNuclei().includes(mappedLabel) ? mappedLabel : 'Geral';

                    let workflowId;
                    if (isOwnerActive) {
                        const workflowMap = AGENT_CONFIG.WORKFLOW_REDACAO_EMAIL;
                        workflowId = workflowMap[nucleus] || workflowMap['Geral'] || workflowMap['NDados'];
                    } else {
                        workflowId = AGENT_CONFIG.WORKFLOW_REDACAO_EMAIL_INATIVO;
                    }

                    const companyName = deal.org_name || "Desconhecida";
                    const companySector = deal[CONFIG.CUSTOM_FIELDS.COMPANY_SECTOR.key] || "Não informado";
                    const leadName = deal.person_id?.name || deal.person_name || "";
                    const combinedInput = `Nome do Lead: ${leadName}\nEmpresa: ${companyName}\nSetor: ${companySector}\n\nResumo Estratégico:\n${summaryNote.content}`;

                    let resolvedCadence = stepInfo.cadencia;
                    if (resolvedCadence && resolvedCadence.startsWith("Nurturing Final")) {
                        resolvedCadence = "Nurturing";
                    }

                    const payload = {
                        input_as_text: combinedInput,
                        state: {
                            cadencia: resolvedCadence,
                            etapa: stepInfo.passo,
                            emails_anteriores: JSON.stringify(emailHistory),
                            owner_id: String(ownerId),
                            nucleo: nucleus,
                            nucleo_nome_completo: getNucleusInfo(nucleus).nome_completo
                        }
                    };

                    if (!isOwnerActive) {
                        payload.state.nome_owner_desativado = (deal.user_id && deal.user_id.name) || "nosso antigo coordenador";
                    }

                    console.log(`[DEBUG] Preparando envio para fluxo ${workflowId} no Deal ID: ${deal.id}`);

                    workflowsToRun.push({
                        workflowId: workflowId,
                        payload: payload,
                        meta: { dealId: deal.id, stepInfo: stepInfo }
                    });
                } catch (e) {
                    try { DealFailureCache.recordFailure('executeEmailCadence', deal.id, deal.title || '(sem título)', e.toString(), true); } catch (_) { }
                    console.error(`[ERROR] Failed to prepare email workflow for Deal ID: ${deal.id}. Reason: ${e.toString()}`);
                }
            }

            if (workflowsToRun.length > 0) {
                console.log(`[DEBUG] Batch email processing initiated for ${workflowsToRun.length} workflows.`);
                const results = OpenAIRepository.runWorkflowsLocally(workflowsToRun, {
                    maxRuntimeMs: MAX_EXECUTION_TIME - (Date.now() - SCRIPT_START_TIME),
                    chunkSize: Number(EMAIL_OPS.OPENAI_CHUNK_SIZE || BATCH_OPS.OPENAI_CHUNK_SIZE || 5),
                    onSuccess: function(res) {
                        try {
                            const emailData = typeof res.result === 'string' ? JSON.parse(res.result) : res.result;
                            const dealId = res.meta.dealId;
                            const title = emailData.titulo;
                            const body = emailData.corpo_html;

                            if (!title || !body) {
                                const invalidPayload = JSON.stringify(emailData);
                                console.error(`[ERROR] Incomplete email generation for Deal ID: ${dealId}. Missing title or html_body. Output constraints unfulfilled.`);
                                try { DealFailureCache.recordFailure('executeEmailCadence', dealId, 'título indisponível', `OpenAI retornou JSON inválido: ${invalidPayload}`, true); } catch (_) { }
                                alertarErroManual(
                                    'OpenAI retornou JSON inválido para e-mail',
                                    `Deal ID ${dealId}. Resposta recebida: ${invalidPayload}`,
                                    [String(dealId)]
                                );
                                return;
                            }

                            const saveUrl = `${PIPEDRIVE_API_BASE_URL}/deals/${dealId}?api_token=${PIPEDRIVE_API_TOKEN}`;
                            const savePayload = {
                                [CONFIG.CUSTOM_FIELDS.EMAIL_TITLE.key]: title,
                                [CONFIG.CUSTOM_FIELDS.EMAIL_BODY.key]: body
                            };

                            console.info(`[INFO] Saving email immediately to Pipedrive for Deal ID: ${dealId}`);
                            const resp = UrlFetchApp.fetch(saveUrl, {
                                method: 'put',
                                contentType: 'application/json',
                                payload: JSON.stringify(savePayload),
                                muteHttpExceptions: true
                            });
                            const code = resp.getResponseCode();
                            if (code >= 200 && code < 300) {
                                console.info(`[INFO] Email successfully saved immediately in Pipedrive for Deal ID: ${dealId}, Step: ${res.meta.stepInfo.passo}, Cadence: ${res.meta.stepInfo.cadencia}`);
                            } else {
                                console.error(`[ERROR] executeEmailCadence: failed to save generated email immediately. Deal ID: ${dealId}, Code: ${code}, Body: ${resp.getContentText()}`);
                                try { DealFailureCache.recordFailure('executeEmailCadence', dealId, '(título indisponível)', `Pipedrive save non-2xx (${code})`, false); } catch (_) { }
                            }
                        } catch (err) {
                            console.error(`[ERROR] JSON parsing or saving failed immediately for Deal ID: ${res.meta.dealId}. Error: ${err.message}`);
                            try { DealFailureCache.recordFailure('executeEmailCadence', res.meta.dealId, '(título indisponível)', `Exception: ${err.message}`, true); } catch (_) { }
                        }
                    }
                });

                results.forEach(res => {
                    if (res.result) {
                        // Already handled and saved in onSuccess!
                    } else {
                        try {
                            const isInternal = !!res.isInternal;
                            DealFailureCache.recordFailure('executeEmailCadence', res.meta.dealId, '(título indisponível)', res.errorMsg || 'OpenAI returned empty result', isInternal);
                        } catch (_) { }
                        console.warn(`[WARN] No email data returned from AI for Deal ID: ${res.meta.dealId}. Error: ${res.errorMsg || 'empty result'}`);
                    }
                });

                if (results.timedOut) {
                    hitProcessingLimit = true;
                    console.info(`[INFO] executeEmailCadence: OpenAI batch runner hit the runtime budget with ${results.pendingWorkflows || 0} pending workflows.`);
                }
            }
        }

        if (hitProcessingLimit) {
            ContinuationScheduler.schedule('executeEmailCadence', 'retomadaContinueExecuteEmailCadence', `pending_work(processLimit=${processLimit})`);
        } else {
            ContinuationScheduler.resetGeneration('executeEmailCadence');
        }

        DealFailureCache.flush();
    } finally {
        if (lockAcquired) {
            mainLock.releaseLock();
        }
    }
}

function retomadaContinueExecuteEmailCadence() {
    executeEmailCadence();
}

/**
 * =================================================================
 * CONTINUATION SCHEDULER + FAILURE BACKOFF (CUSTO / LOOP GUARD)
 * =================================================================
 */

const ContinuationScheduler = {
    _DELAY_MS: Number(CONTINUATION_OPS.CONTINUATION_DELAY_MS || (5 * 60 * 1000)),
    _MIN_SCHEDULE_INTERVAL_MS: Number(CONTINUATION_OPS.CONTINUATION_MIN_SCHEDULE_INTERVAL_MS || (10 * 60 * 1000)),
    _MAX_RUNS_PER_DAY: Number(CONTINUATION_OPS.CONTINUATION_MAX_RUNS_PER_DAY || 12),
    _MAX_GENERATIONS: Number(CONTINUATION_OPS.CONTINUATION_MAX_GENERATIONS || 3),

    schedule: function (baseFunctionName, continuationHandlerName, reason) {
        const props = PropertiesService.getScriptProperties();
        const now = Date.now();
        const generationKey = this._generationKey(baseFunctionName);
        const generation = Number(props.getProperty(generationKey) || 0);

        if (generation >= this._MAX_GENERATIONS) {
            console.error(`[FATAL] ContinuationScheduler: generation limit reached for ${baseFunctionName} (generation=${generation}, max=${this._MAX_GENERATIONS}).`);
            alertarErroManual(
                `Loop de continuação detectado em ${baseFunctionName}`,
                `A geração ${generation} atingiu o limite de ${this._MAX_GENERATIONS}. A continuação foi bloqueada para evitar loop infinito.`
            );
            this.resetGeneration(baseFunctionName);
            return false;
        }

        const lastScheduledKey = `continuation_last_scheduled_${baseFunctionName}`;
        const lastScheduledAt = Number(props.getProperty(lastScheduledKey) || 0);
        if (lastScheduledAt && (now - lastScheduledAt) < this._MIN_SCHEDULE_INTERVAL_MS) {
            console.warn(`[WARN] ContinuationScheduler: cooldown active for ${baseFunctionName}. Not scheduling (last=${lastScheduledAt}).`);
            return false;
        }

        const dayKey = this._getDayKey();
        const dayCountKey = `continuation_day_count_${baseFunctionName}_${dayKey}`;
        const dayCount = Number(props.getProperty(dayCountKey) || 0);
        if (dayCount >= this._MAX_RUNS_PER_DAY) {
            console.error(`[ERROR] ContinuationScheduler: max chained runs reached for ${baseFunctionName} on ${dayKey}. Not scheduling.`);
            alertarErroManual(
                `ContinuationScheduler: limite diário atingido para ${baseFunctionName}`,
                `Função pausada em ${new Date().toISOString()}. Fila pode ter deals pendentes.`
            );
            return false;
        }

        const lock = LockService.getScriptLock();
        if (!lock.tryLock(5000)) {
            console.warn(`[WARN] ContinuationScheduler: could not acquire lock to schedule ${baseFunctionName}.`);
            return false;
        }

        try {
            this.deleteTriggers(continuationHandlerName);

            ScriptApp.newTrigger(continuationHandlerName)
                .timeBased()
                .after(this._DELAY_MS)
                .create();

            props.setProperty(lastScheduledKey, String(now));
            props.setProperty(generationKey, String(generation + 1));
            props.setProperty(dayCountKey, String(dayCount + 1));
            props.setProperty(`continuation_last_reason_${baseFunctionName}`, `${now}:${reason || 'no_reason'}`);
            console.info(`[INFO] ContinuationScheduler: scheduled ${continuationHandlerName} in ${Math.round(this._DELAY_MS / 60000)}min. base=${baseFunctionName}. generation=${generation + 1}/${this._MAX_GENERATIONS}. reason=${reason}`);
            return true;
        } finally {
            lock.releaseLock();
        }
    },

    resetGeneration: function (baseFunctionName) {
        try {
            PropertiesService.getScriptProperties().deleteProperty(this._generationKey(baseFunctionName));
        } catch (e) {
            console.error(`[ERROR] ContinuationScheduler.resetGeneration failed for ${baseFunctionName}. Error: ${e.message}`);
        }
    },

    deleteTriggers: function (handlerFunctionName) {
        try {
            ScriptApp.getProjectTriggers().forEach(t => {
                if (t.getHandlerFunction && t.getHandlerFunction() === handlerFunctionName) {
                    ScriptApp.deleteTrigger(t);
                }
            });
        } catch (e) {
            console.error(`[ERROR] ContinuationScheduler.deleteTriggers failed for ${handlerFunctionName}. Error: ${e.message}`);
            alertarErroManual(
                `Falha ao limpar triggers de ${handlerFunctionName}`,
                e.message || String(e)
            );
        }
    },

    _getDayKey: function () {
        const tz = (typeof Session !== 'undefined' && Session.getScriptTimeZone) ? Session.getScriptTimeZone() : 'GMT';
        return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    },

    _generationKey: function (baseFunctionName) {
        return `continuation_generation_${baseFunctionName}`;
    }
};

function checkIfInternalError(errorMsg) {
    if (!errorMsg) return false;
    const msg = String(errorMsg);
    // Transient errors (NOT internal):
    // 1. OpenAI Limit Reached/Server Error (429 or >=500)
    // 2. Network/Fetch errors (e.g. "No HTTP Response returned", dns/network/timeout)
    // 3. fetchAll failed entirely
    if (msg.includes("OpenAI Limit Reached/Server Error") || 
        msg.includes("No HTTP Response returned") ||
        msg.includes("fetchAll failed entirely") ||
        msg.includes("Network connection") ||
        msg.includes("timeout") ||
        msg.includes("Limit Reached") ||
        msg.includes("Server Error")) {
        return false;
    }
    return true; // Any other error (like syntax, undefined property, bad request 400, module init fail, JSON parse fail, etc.) is considered internal code/config error.
}

const DealFailureCache = {
    _MAX_AGE_MS: Number(CACHE_OPS.DEAL_FAILURE_ENTRY_MAX_AGE_MS || (24 * 60 * 60 * 1000)),
    _MAX_ITEMS: Number(CACHE_OPS.DEAL_FAILURE_CACHE_MAX_ITEMS || 200),
    _memoryCache: {}, // Buffer global
    _pendingSave: new Set(),
    _pruneAlerts: [],

    shouldSkip: function (contextName, dealId) {
        const cache = this._get(contextName);
        const entry = cache[String(dealId)];
        if (!entry) return false;

        const now = Date.now();
        const lastTs = Number(entry.lastTs || 0);

        // Se for erro interno de código, não tenta mais (bloqueia por 30 dias)
        if (entry.isInternal) {
            return (now - lastTs) < (30 * 24 * 60 * 60 * 1000); // 30 dias
        }

        const count = Number(entry.count || 0);
        if (!lastTs || now - lastTs > this._MAX_AGE_MS) return false;

        const cooldown = this._cooldownMs(count);
        return (now - lastTs) < cooldown;
    },

    recordFailure: function (contextName, dealId, dealTitle, reason, isInternalError) {
        const cache = this._get(contextName);
        const key = String(dealId);
        const prev = cache[key] || { count: 0 };
        const next = {
            count: isInternalError ? 999999 : Number(prev.count || 0) + 1,
            lastTs: Date.now(),
            title: dealTitle || prev.title || '',
            lastReason: String(reason || ''),
            isInternal: !!isInternalError
        };
        cache[key] = next;
        const prunedCount = this._prune(cache);
        if (prunedCount > 0) {
            this._pruneAlerts.push({
                contextName: contextName,
                prunedCount: prunedCount,
                sizeAfterPrune: Object.keys(cache).length
            });
        }
        this._memoryCache[contextName] = cache;
        this._pendingSave.add(contextName);
    },

    flush: function () {
        this._pendingSave.forEach(contextName => {
            this._save(contextName, this._memoryCache[contextName]);
        });
        if (this._pruneAlerts.length > 0) {
            alertarErroManual(
                'DealFailureCache realizou prune agressivo',
                JSON.stringify(this._pruneAlerts)
            );
            this._pruneAlerts = [];
        }

        const contextsFalhando = Object.entries(this._memoryCache)
            .filter(([, c]) => Object.values(c).some(e => Number(e.count || 0) >= 3));
        if (contextsFalhando.length > 0) {
            alertarErroManual(
                'Deals com falha recorrente (3+ tentativas)',
                JSON.stringify(contextsFalhando.map(([ctx, entries]) => ({ ctx, deals: Object.keys(entries) })))
            );
        }
        this._pendingSave.clear();
    },

    _cooldownMs: function (count) {
        if (count <= 1) return 60 * 60 * 1000; // 1h
        if (count === 2) return 6 * 60 * 60 * 1000; // 6h
        return 24 * 60 * 60 * 1000; // 24h
    },

    _get: function (contextName) {
        if (this._memoryCache[contextName]) return this._memoryCache[contextName];
        try {
            const props = PropertiesService.getScriptProperties();
            const raw = props.getProperty(this._key(contextName));
            const parsed = raw ? JSON.parse(raw) : {};
            this._memoryCache[contextName] = (parsed && typeof parsed === 'object') ? parsed : {};
            return this._memoryCache[contextName];
        } catch (e) {
            console.error(`[ERROR] DealFailureCache.get failed for ${contextName}. Error: ${e.message}`);
            this._memoryCache[contextName] = {};
            return this._memoryCache[contextName];
        }
    },

    _save: function (contextName, cacheObj) {
        try {
            const props = PropertiesService.getScriptProperties();
            props.setProperty(this._key(contextName), JSON.stringify(cacheObj));
        } catch (e) {
            console.error(`[ERROR] DealFailureCache.save failed for ${contextName}. Error: ${e.message}`);
        }
    },

    _key: function (contextName) {
        return `deal_failure_cache_${contextName}`;
    },

    _prune: function (cacheObj) {
        const now = Date.now();
        let removedCount = 0;
        for (const k in cacheObj) {
            const lastTs = Number(cacheObj[k] && cacheObj[k].lastTs);
            if (!lastTs || (now - lastTs) > this._MAX_AGE_MS) {
                delete cacheObj[k];
                removedCount++;
            }
        }

        const keys = Object.keys(cacheObj);
        if (keys.length <= this._MAX_ITEMS) return removedCount;

        keys.sort((a, b) => Number(cacheObj[a].lastTs || 0) - Number(cacheObj[b].lastTs || 0));
        const toRemove = keys.length - this._MAX_ITEMS;
        for (let i = 0; i < toRemove; i++) {
            delete cacheObj[keys[i]];
            removedCount++;
        }

        return removedCount;
    }
};

/**
 * =================================================================
 * REPOSITORIES - CAMADA DE ACESSO A DADOS
 * =================================================================
 */

var PipedriveRepository = {

    fetchDealsByPipeline: function (pipelineIds) {
        const requests = pipelineIds.map(id => ({
            url: `${PIPEDRIVE_API_BASE_URL}/deals?pipeline_id=${id}&status=open&api_token=${PIPEDRIVE_API_TOKEN}`,
            method: 'get',
            muteHttpExceptions: true
        }));

        try {
            const startStrLog = Date.now();
            console.info(`[INFO] Pipedrive API fetchDealsByPipeline request URLs: ${requests.map(r => r.url).join(' | ')}`);
            const responses = UrlFetchApp.fetchAll(requests);
            console.info(`[INFO] Pipedrive API fetchDealsByPipeline completed. Pipelines checked: ${pipelineIds.length}, Duration: ${Date.now() - startStrLog}ms`);

            let allDeals = [];
            responses.forEach((resp, idx) => {
                const code = resp.getResponseCode();
                const body = resp.getContentText();
                if (code === 200) {
                    const data = JSON.parse(body);
                    if (data.success && data.data) {
                        allDeals = allDeals.concat(data.data);
                    }
                } else {
                    console.error(`[ERROR] fetchDealsByPipeline non-200. PipelineId: ${pipelineIds[idx]}, Code: ${code}, Url: ${requests[idx].url}, Body: ${body}`);
                }
            });
            return allDeals;
        } catch (e) {
            console.error(`[ERROR] fetchDealsByPipeline failed. Error: ${e.message}`);
            return [];
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
            const responses = UrlFetchApp.fetchAll(requests);
            const failedDealIds = [];

            responses.forEach((resp, idx) => {
                const code = resp.getResponseCode();
                if (code >= 200 && code < 300) return;
                failedDealIds.push(String(dealIds[idx]));
                console.error(`[ERROR] executeBulkDeletes non-2xx. DealId: ${dealIds[idx]}, Code: ${code}, Body: ${resp.getContentText()}`);
            });

            if (failedDealIds.length > 0) {
                alertarErroManual(
                    'Falha ao deletar deals em lote no Pipedrive',
                    'Alguns deletes retornaram erro e podem ter deixado deals zumbis.',
                    failedDealIds
                );
            }
            console.info(`[INFO] Pipedrive API executeBulkDeletes completed. Deletes: ${requests.length}, Duration: ${Date.now() - startLog}ms`);
        } catch (e) {
            console.error(`[ERROR] executeBulkDeletes failed. Error: ${e.message}`);
            alertarErroManual(
                'Falha crítica em executeBulkDeletes',
                e.message || String(e),
                dealIds.map(String)
            );
        }
    },

    fetchDealsByFilter: function (filterId) {
        try {
            const startLog = Date.now();
            console.info(`[INFO] Pipedrive API fetchDealsByFilter request for filter ID: ${filterId}`);
            const deals = fetchPipedriveData('deals', { filter_id: filterId, limit: 500 }, true) || [];
            console.info(`[INFO] Pipedrive API fetchDealsByFilter completed. Deals found: ${deals.length}, Duration: ${Date.now() - startLog}ms`);
            return deals;
        } catch (e) {
            console.error(`[ERROR] fetchDealsByFilter failed. Error: ${e.message}`);
            return [];
        }
    },

    // Substitua a função existente dentro de PipedriveRepository

    fetchDealsInStages: function (stageIds) {
        let allDeals = [];
        let stagesToPaginate = stageIds.map(id => ({ id: id, start: 0 }));
        let hadApiError = false;
        let errorStages = [];
        let pageGuard = 0;
        const MAX_PAGES = 50;

        try {
            const startStrLog = Date.now();

            // Loop para continuar buscando enquanto houver páginas
            while (stagesToPaginate.length > 0 && pageGuard++ < MAX_PAGES) {
                // Prepara o lote de requisições apenas para os estágios que ainda têm páginas
                const requests = stagesToPaginate.map(stage => ({
                    url: `${PIPEDRIVE_API_BASE_URL}/deals?stage_id=${stage.id}&status=open&start=${stage.start}&limit=500&api_token=${PIPEDRIVE_API_TOKEN}`,
                    method: 'get',
                    muteHttpExceptions: true
                }));

                const responses = UrlFetchApp.fetchAll(requests);
                let nextPaginationQueue = [];

                responses.forEach((resp, idx) => {
                    const code = resp.getResponseCode();
                    const stageInfo = stagesToPaginate[idx];

                    if (code === 200) {
                        const data = JSON.parse(resp.getContentText());

                        // 1. Concatena os deals encontrados
                        if (data.success && data.data) {
                            allDeals = allDeals.concat(data.data);
                        }

                        // 2. Verifica se há mais páginas para este estágio específico
                        const pagination = data.additional_data && data.additional_data.pagination;
                        if (pagination && pagination.more_items_in_collection) {
                            nextPaginationQueue.push({
                                id: stageInfo.id,
                                start: pagination.next_start
                            });
                        }
                    } else {
                        console.error(`[ERROR] fetchDealsInStages non-200. StageId: ${stageInfo.id}, Code: ${code}`);
                        hadApiError = true;
                        errorStages.push(stageInfo.id);
                    }
                });

                // Substitui a fila atual pela próxima fila (só contém os estágios que não terminaram)
                stagesToPaginate = nextPaginationQueue;
            }

            if (pageGuard >= MAX_PAGES && stagesToPaginate.length > 0) {
                console.warn(`[WARN] fetchDealsInStages reached MAX_PAGES=${MAX_PAGES}. Remaining stages: ${stagesToPaginate.map(s => s.id).join(', ')}`);
                alertarErroManual(
                    'fetchDealsInStages: limite de paginação atingido',
                    `Possível loop infinito na API. stageIds: ${stageIds.join(', ')}`,
                    stageIds.map(String)
                );
            }

            console.info(`[INFO] fetchDealsInStages completed. Total Deals: ${allDeals.length}, Duration: ${Date.now() - startStrLog}ms`);
            if (hadApiError && allDeals.length === 0) {
                alertarErroManual(
                    'Pipedrive retornou erro ao buscar deals por estágio',
                    `Nenhum deal foi carregado e houve erro na API para os estágios: ${errorStages.join(', ')}.`,
                    errorStages.map(String)
                );
            }
            return allDeals;

        } catch (e) {
            console.error(`[ERROR] fetchDealsInStages failed. Error: ${e.message}`);
            alertarErroManual(
                'Falha crítica em fetchDealsInStages',
                e.message || String(e),
                stageIds.map(String)
            );
            return allDeals; // Retorna o que já conseguiu capturar em vez de vazio
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

    getNotesAndEmailHistoryByDealIds: function (dealIds) {
        const uniqueIds = Array.from(new Set((dealIds || []).filter(Boolean).map(String)));
        if (uniqueIds.length === 0) return {};

        const result = {};
        uniqueIds.forEach(id => {
            result[id] = { notes: [], emailHistory: [] };
        });

        try {
            const requests = [];
            uniqueIds.forEach(dealId => {
                requests.push({
                    url: `${PIPEDRIVE_API_BASE_URL}/notes?deal_id=${dealId}&api_token=${PIPEDRIVE_API_TOKEN}`,
                    method: 'get',
                    muteHttpExceptions: true
                });
                requests.push({
                    url: `${PIPEDRIVE_API_BASE_URL}/deals/${dealId}/mailMessages?api_token=${PIPEDRIVE_API_TOKEN}`,
                    method: 'get',
                    muteHttpExceptions: true
                });
            });

            console.info(`[INFO] getNotesAndEmailHistoryByDealIds: Fetching notes and email history in parallel for ${uniqueIds.length} deals.`);
            const startLog = Date.now();
            const responses = UrlFetchApp.fetchAll(requests);
            console.log(`[DEBUG] Pipedrive API getNotesAndEmailHistoryByDealIds completed in ${Date.now() - startLog}ms`);

            uniqueIds.forEach((dealId, idx) => {
                const notesResp = responses[idx * 2];
                const mailResp = responses[idx * 2 + 1];

                if (notesResp.getResponseCode() === 200) {
                    const data = JSON.parse(notesResp.getContentText());
                    result[dealId].notes = data.data || [];
                } else {
                    console.warn(`[WARN] getNotesAndEmailHistoryByDealIds: notes request non-200. Deal ID: ${dealId}, Code: ${notesResp.getResponseCode()}`);
                }

                if (mailResp.getResponseCode() === 200) {
                    const data = JSON.parse(mailResp.getContentText()).data;
                    if (data) {
                        result[dealId].emailHistory = data.slice(0, 5).map(msg => ({
                            origem: msg.from[0].email.includes("polijunior") ? "Poli Júnior" : "Cliente",
                            data: msg.add_time,
                            preview: msg.snippet.substring(0, 200).replace(/<[^>]*>?/gm, '')
                        }));
                    }
                } else {
                    console.warn(`[WARN] getNotesAndEmailHistoryByDealIds: mailMessages request non-200. Deal ID: ${dealId}, Code: ${mailResp.getResponseCode()}`);
                }
            });

        } catch (e) {
            console.error(`[ERROR] getNotesAndEmailHistoryByDealIds failed. Error: ${e.message}`);
        }

        return result;
    },

    getNotesFromDeal: function (dealId) {
        try {
            const json = fetchPipedriveData('notes', { deal_id: dealId }, false);
            return json.data || [];
        } catch (e) {
            console.error(`[ERROR] getNotesFromDeal failed. Deal ID: ${dealId}, Error: ${e.message}`);
            return [];
        }
    },

    getActiveUsers: function () {
        if (_activeUsersCache) return _activeUsersCache;

        const cache = CacheService.getScriptCache();
        const cached = cache.get('active_users');
        if (cached) {
            _activeUsersCache = JSON.parse(cached);
            return _activeUsersCache;
        }

        let activeIds = [];
        try {
            const json = fetchPipedriveData('users', {}, false);
            const data = json.data || [];
            activeIds = data.filter(u => u.active_flag).map(u => u.id);
            cache.put('active_users', JSON.stringify(activeIds), 3600);
        } catch (e) {
            console.error(`[ERROR] getActiveUsers failed. Error: ${e.message}`);
        }
        _activeUsersCache = activeIds;
        return _activeUsersCache;
    },

    getLabelMapping: function () {
        if (_labelIdMapCache) return _labelIdMapCache;

        const cache = CacheService.getScriptCache();
        const cached = cache.get('deal_label_mapping');
        if (cached) {
            _labelIdMapCache = JSON.parse(cached);
            return _labelIdMapCache;
        }

        let mapping = {};
        try {
            const json = fetchPipedriveData('dealFields', {}, false);
            const data = json.data || [];
            const labelField = data.find(f => f.key === CONFIG.CUSTOM_FIELDS.LABEL.key);
            if (labelField && labelField.options) {
                labelField.options.forEach(opt => {
                    mapping[String(opt.id)] = opt.label;
                });
            }
            cache.put('deal_label_mapping', JSON.stringify(mapping), 21600); // Cache por 6 horas
        } catch (e) {
            console.error(`[ERROR] getLabelMapping failed. Error: ${e.message}`);
        }
        _labelIdMapCache = mapping;
        return _labelIdMapCache;
    },

    getNotesByDealIds: function (dealIds) {
        const uniqueIds = Array.from(new Set((dealIds || []).filter(Boolean).map(String)));
        if (uniqueIds.length === 0) return {};

        const result = {};
        try {
            uniqueIds.forEach(id => { result[id] = []; });

            const limit = 500;
            const requests = uniqueIds.map(dealId => ({
                url: `${PIPEDRIVE_API_BASE_URL}/notes?deal_id=${dealId}&start=0&limit=${limit}&api_token=${PIPEDRIVE_API_TOKEN}`,
                method: 'get',
                muteHttpExceptions: true
            }));

            console.info(`[INFO] getNotesByDealIds: Fetching first page of notes in parallel for ${uniqueIds.length} deals.`);
            const responses = UrlFetchApp.fetchAll(requests);

            const pendingPagination = [];

            responses.forEach((resp, idx) => {
                const dealId = uniqueIds[idx];
                const code = resp.getResponseCode();
                if (code !== 200) {
                    console.warn(`[WARN] getNotesByDealIds first page non-200. Deal ID: ${dealId}, Code: ${code}`);
                    return;
                }

                const data = JSON.parse(resp.getContentText());
                const pageNotes = data.data || [];
                result[dealId].push(...pageNotes);

                const pagination = data.additional_data && data.additional_data.pagination;
                const moreItems = !!(pagination && pagination.more_items_in_collection);
                if (moreItems) {
                    pendingPagination.push({
                        dealId: dealId,
                        start: pagination.next_start
                    });
                }
            });

            if (pendingPagination.length > 0) {
                console.info(`[INFO] getNotesByDealIds: ${pendingPagination.length} deals require additional pages.`);
                pendingPagination.forEach(item => {
                    let start = item.start;
                    let moreItems = true;
                    let pageCount = 1;

                    while (moreItems) {
                        const url = `${PIPEDRIVE_API_BASE_URL}/notes?deal_id=${item.dealId}&start=${start}&limit=${limit}&api_token=${PIPEDRIVE_API_TOKEN}`;
                        const resp = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
                        pageCount++;

                        if (resp.getResponseCode() !== 200) {
                            console.warn(`[WARN] getNotesByDealIds pagination non-200. Deal ID: ${item.dealId}, Code: ${resp.getResponseCode()}, Page: ${pageCount}`);
                            break;
                        }

                        const data = JSON.parse(resp.getContentText());
                        const pageNotes = data.data || [];
                        result[item.dealId].push(...pageNotes);

                        const pagination = data.additional_data && data.additional_data.pagination;
                        moreItems = !!(pagination && pagination.more_items_in_collection);
                        start = moreItems ? pagination.next_start : start;
                    }
                });
            }

            uniqueIds.forEach(dealId => {
                console.info(`[INFO] getNotesByDealIds completed. Deal ID: ${dealId}, totalFetched=${result[dealId].length}`);
            });
        } catch (e) {
            console.error(`[ERROR] getNotesByDealIds failed. Error: ${e.message}`);
            uniqueIds.forEach(dealId => { result[dealId] = []; });
        }

        return result;
    },

    createNote: function (dealId, content) {
        try {
            sendPipedriveCommand('notes', 'post', { deal_id: dealId, content: content });
        } catch (e) {
            console.error(`[ERROR] createNote failed. Deal ID: ${dealId}, Error: ${e.message}`);
        }
    },

    syncOriginNotes: function (dealId, originalDealId, preFetchedNotes, preFetchedTargetNotes) {
        if (!originalDealId) return [];

        const originalNotes = preFetchedNotes || this.getNotesFromDeal(originalDealId);
        if (originalNotes && originalNotes.length > 0) {
            const existingNotes = preFetchedTargetNotes || (dealId ? this.getNotesFromDeal(dealId) : []);
            const normalizedExistingNotes = new Set((existingNotes || []).map(note => String(note.content || '').replace(/<[^>]*>?/gm, ' ').trim()));
            const requests = originalNotes
                .map(note => ({
                    url: `${PIPEDRIVE_API_BASE_URL}/notes?api_token=${PIPEDRIVE_API_TOKEN}`,
                    method: 'post',
                    contentType: 'application/json',
                    payload: JSON.stringify({
                        deal_id: dealId,
                        content: (note.content || "").replace(/<[^>]*>?/gm, ' '),
                        source_deal_id: String(originalDealId)
                    }),
                    muteHttpExceptions: true
                }))
                .filter(request => {
                    const parsedPayload = JSON.parse(request.payload);
                    return !normalizedExistingNotes.has(String(parsedPayload.content || '').trim());
                });



            const startLog = Date.now();
            try { UrlFetchApp.fetchAll(requests); } catch (e) { console.error(`[ERROR] syncOriginNotes failed. Error: ${e.message}`); };
            console.info(`[INFO] Pipedrive API syncOriginNotes completed. Requests: ${requests.length}, Duration: ${Date.now() - startLog}ms`);
        }

        return originalNotes;
    },

    saveEmailToDeal: function (dealId, title, body) {
        const payload = {
            [CONFIG.CUSTOM_FIELDS.EMAIL_TITLE.key]: title,
            [CONFIG.CUSTOM_FIELDS.EMAIL_BODY.key]: body
        };
        try {
            sendPipedriveCommand(`deals/${dealId}`, 'put', payload);
        } catch (e) {
            console.error(`[ERROR] saveEmailToDeal failed. Deal ID: ${dealId}, Error: ${e.message}`);
        }
    },

    markDealAsLost: function (dealId, reason) {

        const payload = {
            status: 'lost',
            lost_reason: reason
        };

        try {
            const json = sendPipedriveCommand(`deals/${dealId}`, 'put', payload);
            if (json && json.success) {
                console.info(`[INFO] markDealAsLost succeeded. Deal ID: ${dealId}`);
            } else {
                console.error(`[ERROR] markDealAsLost failed. Deal ID: ${dealId}`);
                alertarErroManual(
                    'Falha ao marcar deal como perdido',
                    `Deal ID ${dealId}. Motivo: ${reason}.`,
                    [String(dealId)]
                );
            }
        } catch (e) {
            console.error(`[ERROR] markDealAsLost failed. Deal ID: ${dealId}, Error: ${e.message}`);
            alertarErroManual(
                'Falha ao marcar deal como perdido',
                `Deal ID ${dealId}. Motivo: ${reason}. Erro: ${e.message}`,
                [String(dealId)]
            );
        }
    },

    getStagesDetailsByPipeline: function (pipelineId) {
        try {
            const json = fetchPipedriveData('stages', { pipeline_id: pipelineId }, false);
            return json.data || [];
        } catch (e) {
            console.error(`[ERROR] getStagesDetailsByPipeline failed. Pipeline ID: ${pipelineId}, Error: ${e.message}`);
            return [];
        }
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

    _buildPayload: function (options) {
        let instructions = options.instructions;

        if (instructions) {
            let hasHistory = false;
            if (options.input) {
                const historyRegex = /<(historico_emails|email_history)>([\s\S]*?)<\/\1>/i;
                const match = options.input.match(historyRegex);
                if (match) {
                    const content = match[2].trim();
                    if (content && content !== "[]" && content !== '""' && content !== '[""]') {
                        hasHistory = true;
                    }
                }
            }
            if (!hasHistory) {
                instructions = instructions.replace(/<email_history_calibration>([\s\S]*?)<\/email_history_calibration>/gi, "");
                instructions = instructions.replace(/\n{3,}/g, "\n\n").trim();
            }
        }

        const payload = {
            model: options.model || "gpt-5.4-mini",
            input: options.input,
            store: options.store !== undefined ? options.store : true
        };

        if (instructions) payload.instructions = instructions;
        if (options.tools) payload.tools = options.tools;
        if (options.previous_response_id) payload.previous_response_id = options.previous_response_id;

        // Structured Outputs (Responses API) expects a nested object: { text: { format: ... } }
        // Using a literal key like "text.format" makes the API treat it as an unknown top-level parameter.
        if (options.text) payload.text = { ...(payload.text || {}), ...options.text };
        if (options.textFormat) {
            let format = options.textFormat;
            // Normalize legacy Chat Completions format (with nested json_schema) to the flat Responses API format
            if (format && format.type === "json_schema" && format.json_schema) {
                format = {
                    type: "json_schema",
                    name: format.json_schema.name,
                    strict: format.json_schema.strict,
                    schema: format.json_schema.schema
                };
            }
            payload.text = { ...(payload.text || {}), format: format };
        }

        // Allow passing the full reasoning object (e.g., { effort, summary }), but keep legacy support.
        if (options.reasoning) payload.reasoning = options.reasoning;
        else if (options.reasoning_effort) payload.reasoning = { effort: options.reasoning_effort };
        if (options.temperature !== undefined) payload.temperature = options.temperature;
        if (options.top_p !== undefined) payload.top_p = options.top_p;
        if (options.max_completion_tokens !== undefined) {
            payload.max_completion_tokens = options.max_completion_tokens;
        } else {
            payload.max_completion_tokens = 2000; // Limite padrão para evitar pré-alocação exagerada de tokens no TPM
        }

        return payload;
    },

    buildFetchRequest: function (options) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error("OpenAI API Key não configurada em config.js.");
        }

        return {
            url: OPENAI_RESPONSES_URL,
            method: "post",
            headers: {
                "Authorization": "Bearer " + apiKey,
                "Content-Type": "application/json"
            },
            payload: JSON.stringify(this._buildPayload(options)),
            muteHttpExceptions: true
        };
    },

    create: function (options, maxRetries = 3) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error("OpenAI API Key não configurada em config.js.");
        }

        const payload = this._buildPayload(options);

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
                    // Interrompe imediatamente se for falta de saldo/cota
                    if (responseCode === 429 && responseText.includes("insufficient_quota")) {
                        console.error(`[FATAL] OpenAI Quota Exceeded (429): Parando execução imediatamente.`);
                        alertarErroManual('Quota OpenAI Esgotada', responseText);
                        throw new Error(`OPENAI_INSUFFICIENT_QUOTA: ${responseText}`);
                    }

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
    runWorkflowsLocally: function (workflowsData, options) {
        if (!workflowsData || workflowsData.length === 0) return [];
        let allResponses = [];
        const runOptions = options || {};

        console.info(`[INFO] Initiating local batch GAS execution for ${workflowsData.length} OpenAI Responses API tasks.`);

        const SCRIPT_START_TIME = Date.now();
        const MAX_GAS_RUNTIME = Number(runOptions.maxRuntimeMs || MAX_EXECUTION_TIME);
        const CHUNK_SIZE = Number(runOptions.chunkSize || 5);
        const CHUNK_PAUSE_MS = Number(runOptions.chunkPauseMs || 1000);

        let activeGenerators = [];
        let pendingLogs = []; // Criamos um array para guardar os logs temporariamente
        let timedOut = false;
        let runtimeBudgetExceeded = false;

        // Initialize all generators
        for (let i = 0; i < workflowsData.length; i++) {
            const data = workflowsData[i];
            const workflowId = data.workflowId;
            let flowModule;

            try {
                if (typeof globalThis !== 'undefined' && globalThis[workflowId]) {
                    flowModule = globalThis[workflowId];
                } else if (typeof this !== 'undefined' && this[workflowId]) {
                    flowModule = this[workflowId];
                } else {
                    throw new Error(`Módulo de Workflow ${workflowId} não encontrado/esvaziado.`);
                }

                let generator;
                try {
                    generator = flowModule.runWorkflow(data.payload);
                } catch (e) {
                    if (e && e.message && e.message.includes('404') && data && data.payload && data.payload.state && data.payload.state.previous_response_id) {
                        console.warn(`[WARN] previous_response_id expirado no fluxo ${workflowId}. Reprocessando sem encadeamento.`);
                        try {
                            data.payload.state.previous_response_id = null;
                            generator = flowModule.runWorkflow(data.payload);
                        } catch (err2) {
                            throw err2;
                        }
                    } else {
                        throw e;
                    }
                }
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
                allResponses.push({
                    meta: data.meta,
                    result: null,
                    errorType: 'MODULE_INIT_FAIL',
                    errorMsg: e.message,
                    isInternal: true
                });
            }
        }

        // Process loop
        while (activeGenerators.length > 0) {
            if (Date.now() - SCRIPT_START_TIME > MAX_GAS_RUNTIME) {
                console.warn("[WARN] OpenAI batch runtime budget reached. Stopping before the GAS limit.");
                timedOut = true;
                runtimeBudgetExceeded = true;
                break; // Sai do loop deixando as execuções incompletas como ignoradas temporariamente
            }

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
            let rawResponses = new Array(fetchRequests.length);
            if (fetchRequests.length > 0) {
                console.info(`[INFO] Executing UrlFetchApp.fetchAll with ${fetchRequests.length} parallel requests.`);
                try {
                    for (let c = 0; c < fetchRequests.length; c += CHUNK_SIZE) {
                        const chunk = fetchRequests.slice(c, c + CHUNK_SIZE);
                        const chunkResponses = UrlFetchApp.fetchAll(chunk);
                        for (let r = 0; r < chunkResponses.length; r++) {
                            rawResponses[c + r] = chunkResponses[r];
                        }
                        if (c + CHUNK_SIZE < fetchRequests.length) {
                            Utilities.sleep(CHUNK_PAUSE_MS); // throttle entre micro-lotes
                        }
                    }
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
                                if (Date.now() - SCRIPT_START_TIME > MAX_GAS_RUNTIME) {
                                    runtimeBudgetExceeded = true;
                                }
                            } catch (err) {
                                state.error = new Error(`JSON Parse Error: ${err.message}`);
                                state.done = true;
                            }
                        } else if (responseCode === 429 || responseCode >= 500) {
                            // Verifica se o erro 429 é por falta de cota/saldo (insufficient_quota)
                            if (responseCode === 429 && responseText.includes("insufficient_quota")) {
                                console.error(`[FATAL] OpenAI Quota Exceeded (429): Parando execução imediatamente.`);
                                alertarErroManual('Quota OpenAI Esgotada', responseText, [String(state.data && state.data.meta && state.data.meta.dealId || '')].filter(Boolean));
                                throw new Error(`OPENAI_INSUFFICIENT_QUOTA: ${responseText}`);
                            }

                            state.retries++;
                            if (state.retries > 6) {
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

                    const currentTimestamp = new Date().toISOString();
                    const safeInput = typeof state.data.payload === 'object' ? JSON.stringify(state.data.payload) : String(state.data.payload || "");

                    if (state.error) {
                        console.error(`[ERROR] Workflow failed. Module ID: ${state.workflowId}, Error: ${state.error.message}`);
                        pendingLogs.push([currentTimestamp, state.data.meta.dealId, state.workflowId, safeInput, "", duration, state.error.message]);
                        const isInternal = checkIfInternalError(state.error.message);
                        allResponses.push({ 
                            meta: state.data.meta, 
                            result: null, 
                            errorType: 'EXECUTION_FAIL',
                            errorMsg: state.error.message,
                            isInternal: isInternal
                        });
                    } else {
                        const output = state.currentYield.value;
                        console.info(`[INFO] Workflow completed. Module: ${state.workflowId}, Deal ID: ${state.data.meta.dealId}, Duration: ${duration}ms`);

                        const safeOutput = typeof output === 'object' ? JSON.stringify(output) : String(output || "");

                        pendingLogs.push([currentTimestamp, state.data.meta.dealId, state.workflowId, safeInput, safeOutput, duration, ""]);

                        let resObj = { meta: state.data.meta, result: null, errorType: null };
                        if (output && output.bypass) {
                            resObj.result = null;
                        } else if (typeof output === 'object') {
                            resObj.result = output;
                        } else if (typeof output === 'string') {
                            resObj.result = output;
                        }

                        // Call onSuccess callback immediately if provided!
                        if (resObj.result && typeof runOptions.onSuccess === 'function') {
                            try {
                                runOptions.onSuccess(resObj);
                            } catch (onSuccessErr) {
                                console.error(`[ERROR] Immediate onSuccess callback failed for Deal ID: ${state.data.meta.dealId}. Error: ${onSuccessErr.message}`);
                            }
                        }

                        allResponses.push(resObj);
                    }
                }
            }

            if (needsSleep > 0 && stillActive.length > 0) {
                console.warn(`[WARN] Sleeping globally for ${needsSleep}ms due to 429/5xx responses in batch.`);
                Utilities.sleep(needsSleep);
            }

            if (runtimeBudgetExceeded) {
                timedOut = true;
                break;
            }

            activeGenerators = stillActive;
        }

        if (pendingLogs.length > 0) {
            LoggerService.logBatchToGoogleSheets(pendingLogs);
        }

        allResponses.timedOut = timedOut;
        allResponses.pendingWorkflows = activeGenerators.length;

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

function alertarErroManual(assunto, detalhes, dealIds) {
    const recipients = ['enzo.rego@polijunior.com.br'];
    try {
        if (typeof Session !== 'undefined' && Session.getActiveUser) {
            const activeUserEmail = Session.getActiveUser().getEmail();
            if (activeUserEmail && !recipients.includes(activeUserEmail)) {
                recipients.push(activeUserEmail);
            }
        }
    } catch (_) { }

    if (CONFIG.EMAIL_ALERTA_PRODUCAO && !recipients.includes(CONFIG.EMAIL_ALERTA_PRODUCAO)) {
        recipients.push(CONFIG.EMAIL_ALERTA_PRODUCAO);
    }

    const emailTo = recipients.join(',');

    const safeDetalhes = String(detalhes || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeDealIds = Array.isArray(dealIds) && dealIds.length > 0 ? dealIds.join(', ') : '';
    const body = [
        '<h2>⚠️ Alerta do Sistema de Nurturing</h2>',
        '<p><b>Processo:</b> Geração de E-mails (retomadaNurturing.js)</p>',
        `<p><b>O que aconteceu (Contexto):</b> ${assunto}</p>`,
        `<p><b>Mensagem de Erro Técnica:</b></p>`,
        `<pre style="background-color:#f4f4f4;padding:10px;border-radius:5px;">${safeDetalhes}</pre>`,
        safeDealIds ? `<p><b>Negócios (Deals) afetados:</b> ${safeDealIds}</p>` : '',
        `<p><i>Registrado em: ${new Date().toISOString()}</i></p>`
    ].join('\n');

    try {
        GmailApp.sendEmail(emailTo, `[AI Engine ALERTA] Erro na Automação: ${assunto}`, '', { htmlBody: body });
    } catch (e) {
        console.error(`[CRÍTICO] Falha ao enviar e-mail de alerta para ${emailTo}. Erro original: ${e.message}`);
    }
}

/**
 * =================================================================
 * SERVIÇO DE LOGS DA IA (PLANILHA) - OTIMIZADO PARA LOTE
 * =================================================================
 */
const LoggerService = {
    // Nova função: recebe uma matriz (array de arrays) com vários logs de uma vez
    logBatchToGoogleSheets: function (logsArray) {
        if (!logsArray || logsArray.length === 0) return; // Se não houver logs, não faz nada

        try {
            const ss = SpreadsheetApp.getActiveSpreadsheet();
            if (!ss) {
                console.warn('[WARN] Nenhuma planilha ativa encontrada. Pulando gravação de logs.');
                return;
            }

            const sheetName = (CONFIG && CONFIG.OPERATIONS && CONFIG.OPERATIONS.BATCH && CONFIG.OPERATIONS.BATCH.LOG_BATCH_SHEET_NAME) || 'IA - Retomada (Logs)';
            let sheet = ss.getSheetByName(sheetName);

            if (!sheet) {
                console.log(`[DEBUG] Aba '${sheetName}' não encontrada. Criando nova aba.`);
                sheet = ss.insertSheet(sheetName);
                sheet.appendRow(["Data/Hora", "Deal ID", "Workflow", "Input (Payload)", "Output (Resposta)", "Duração (ms)", "Erro"]);
                sheet.getRange("A1:G1").setFontWeight("bold");
            }

            // Descobre qual a próxima linha vazia
            const lastRow = sheet.getLastRow();

            // Grava todos os dados de uma única vez (MUITO mais rápido que appendRow no loop)
            sheet.getRange(lastRow + 1, 1, logsArray.length, logsArray[0].length).setValues(logsArray);

            console.info(`[INFO] ${logsArray.length} linhas gravadas em lote com sucesso na aba '${sheetName}'.`);

        } catch (e) {
            console.error(`[ERROR] Falha ao gravar logs em lote na planilha. Motivo: ${e.message}`);
        }
    }
};

/**
 * =================================================================
 * DEDUPLICAÇÃO E LIMPEZA
 * =================================================================
 */

/**
 * Remove deals duplicados no funil e mantém o registro mais antigo como vencedor.
 *
 * Os duplicados podem ser marcados como lost, exceto quando MODO_SIMULACAO_OPERACOES está ativo.
 *
 * @param {Array<Object>} deals Lista de deals retornada pela API do Pipedrive.
 * @returns {Array<Object>} Lista deduplicada de deals para processamento.
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
            const deleteRequests = losers.map(loserDeal => ({
                url: `${PIPEDRIVE_API_BASE_URL}/deals/${loserDeal.id}?api_token=${PIPEDRIVE_API_TOKEN}`,
                method: 'delete',
                muteHttpExceptions: true
            }));

            const startLog = Date.now();
            try {
                const responses = UrlFetchApp.fetchAll(deleteRequests);
                responses.forEach((resp, idx) => {
                    const code = resp.getResponseCode();
                    const body = resp.getContentText();
                    console.info(`[INFO] Deduplication API request for Deal ID ${losers[idx].id} - Response Code: ${code}, Response Body: ${body}`);
                    if (code >= 200 && code < 300) {
                        _currentCycleMarkedDealIds.add(String(losers[idx].id));
                        totalRemoved++;
                    } else {
                        console.error(`[ERROR] Failed to delete duplicate deal ${losers[idx].id}. Code: ${code}, Body: ${body}`);
                    }
                });
            } catch (e) {
                console.error(`[ERROR] Failed to delete duplicate deals. Error: ${e.message}`);
            }
            console.info(`[INFO] Pipedrive API batch deduplication delete completed. Losers deleted: ${totalRemoved}/${deleteRequests.length}, Duration: ${Date.now() - startLog}ms`);
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

/**
 * =================================================================
 * CACHE DE SUMÁRIOS (Limitado a tempo e quantidade para não quebrar o GAS)
 * =================================================================
 */
const SummarizedDealsCache = {
    _MAX_ITEMS: 300, // Limite seguro para não estourar os 9KB do PropertiesService

    getCache: function () {
        try {
            const props = PropertiesService.getScriptProperties();
            const data = props.getProperty('summarized_deals_cache');
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.error('[ERROR] Falha ao ler cache de sumários: ' + e.message);
            return {};
        }
    },

    saveCache: function (cacheObj) {
        try {
            const maxAge = Number(CACHE_OPS.SUMMARIZED_DEALS_CACHE_MAX_AGE_MS || (181 * 24 * 60 * 60 * 1000));
            const now = Date.now();

            for (const id in cacheObj) {
                if (now - cacheObj[id] > maxAge) {
                    delete cacheObj[id];
                }
            }

            const keys = Object.keys(cacheObj);
            if (keys.length > Number(CACHE_OPS.SUMMARIZED_DEALS_CACHE_MAX_ITEMS || this._MAX_ITEMS)) {
                keys.sort((a, b) => Number(cacheObj[a]) - Number(cacheObj[b]));
                const toRemove = keys.length - Number(CACHE_OPS.SUMMARIZED_DEALS_CACHE_MAX_ITEMS || this._MAX_ITEMS);

                for (let i = 0; i < toRemove; i++) {
                    delete cacheObj[keys[i]];
                }
            }

            const props = PropertiesService.getScriptProperties();
            props.setProperty('summarized_deals_cache', JSON.stringify(cacheObj));
            console.info(`[INFO] Cache salvo com sucesso. Contém ${Object.keys(cacheObj).length} deals sumariados.`);
        } catch (e) {
            console.error('[ERROR] Falha ao salvar cache de sumários: ' + e.message);
        }
    },

    clearCacheManually: function () {
        try {
            const props = PropertiesService.getScriptProperties();
            props.deleteProperty('summarized_deals_cache');
            console.info('[INFO] O cache de sumários de deals foi deletado manualmente com sucesso.');
            return "Cache apagado com sucesso.";
        } catch (e) {
            console.error('[ERROR] Falha ao apagar cache manualmente: ' + e.message);
            return "Falha ao apagar o cache.";
        }
    }
};

/**
 * Função utilitária para chamar manualmente a limpeza do cache de resumos no Editor do Apps Script.
 */
function manualClearSummarizedDealsCache() {
    SummarizedDealsCache.clearCacheManually();
}


function manualClearTriggers() {
    ContinuationScheduler.deleteTriggers('retomadaContinueSyncAndSummarize');
    ContinuationScheduler.deleteTriggers('retomadaContinueExecuteEmailCadence');
}

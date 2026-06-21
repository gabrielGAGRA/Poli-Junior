// Autor: Gabriel Agra de Castro Motta
// Última atualização: 21/04/2026
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.


// ====================================================================
// 0. MENU E INTERFACE DE USUÁRIO
// ====================================================================

/**
 * Cria o menu personalizado quando a planilha é aberta.
 */
function onOpen() {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('🚀 Sincronização Pipedrive')
        .addItem('Sincronização Diária (Metadados)', 'manualDailySync')
        .addItem('Sincronização Semanal (Fluxos/Tempos)', 'manualWeeklySync')
        .addSeparator()
        .addItem('Forçar Atualização de Metadados (Abas)', 'manualRefreshMetadata')
        .addToUi();
}

/**
 * Wrappers para execução manual com feedback visual (Toast).
 */
function manualDailySync() {
    SpreadsheetApp.getActiveSpreadsheet().toast("Iniciando Motor A (Diário)...", "Sincronização", 5);
    dailyMetadataSync();
    SpreadsheetApp.getActiveSpreadsheet().toast("Motor A finalizado com sucesso!", "Sincronização", 10);
}

function manualWeeklySync() {
    SpreadsheetApp.getActiveSpreadsheet().toast("Iniciando Motor B (Fluxo/Tempos)... Isso pode levar alguns minutos.", "Sincronização", 5);
    weeklyFlowSync();
    SpreadsheetApp.getActiveSpreadsheet().toast("Motor B finalizado com sucesso!", "Sincronização", 10);
}

function manualRefreshMetadata() {
    SpreadsheetApp.getActiveSpreadsheet().toast("Atualizando definições de campos e estágios...", "Metadados", 5);
    refreshMetadataCache(true);
    SpreadsheetApp.getActiveSpreadsheet().toast("Metadados atualizados!", "Metadados", 10);
}

// ====================================================================
// 1. MOTOR A: SINCRONIZAÇÃO DIÁRIA (METADADOS)
// ====================================================================

function dailyMetadataSync() {
    refreshMetadataCache()
    const startTime = Date.now();
    const props = PropertiesService.getScriptProperties();

    let syncPhase = props.getProperty('SYNC_PHASE') || 'active';
    let paginationStart = parseInt(props.getProperty('PAGINATION_START'), 10) || 0;
    let lastSync = getLastSyncTimestamp();

    console.log(`--- INICIANDO MOTOR A (Lote) - Fase: ${syncPhase} a partir de: ${paginationStart} ---`);

    const { fieldMapping, optionMapping } = getDynamicFieldMappingCached();
    const stageMapping = getStagesMappingCached();
    const pipelineMapping = getPipelinesMappingCached();

    let hasMore = true;
    let totalProcessed = 0;
    const allDealsToUpsert = [];

    // --- LOOP DE SINCRONIZAÇÃO ---
    while (hasMore) {
        const statusParam = syncPhase === 'deleted' ? 'deleted' : 'all_not_deleted';
        const response = fetchPipedriveChunk('deals', {
            updated_since: lastSync,
            status: statusParam,
            sort: 'update_time DESC',
            limit: 500,
            start: paginationStart
        });

        const dataLength = response.data?.length || 0;

        if (dataLength > 0) {
            allDealsToUpsert.push(...response.data);
            totalProcessed += dataLength;
            paginationStart = response.next_start;
            hasMore = response.more_items;
        } else {
            hasMore = false;
        }

        // Prevenção de estouro de tempo limite
        if (Date.now() - startTime > MAX_EXECUTION_TIME && (hasMore || (syncPhase === 'active' && !hasMore))) {
            console.warn(`[TIMEOUT PREVENT] Checkpoint na fase ${syncPhase}, item ${paginationStart}.`);
            props.setProperty('PAGINATION_START', paginationStart.toString());
            props.setProperty('SYNC_PHASE', syncPhase);
            createReinvokeTrigger('dailyMetadataSync');

            // Persistir o que foi carregado até agora antes de suspender
            if (allDealsToUpsert.length > 0) {
                upsertDealsToSheet(allDealsToUpsert, fieldMapping, optionMapping, stageMapping, pipelineMapping);
            }
            return;
        }
    }

    // Persistir os resultados da fase atual
    if (allDealsToUpsert.length > 0) {
        upsertDealsToSheet(allDealsToUpsert, fieldMapping, optionMapping, stageMapping, pipelineMapping);
    }

    // Transição de fases
    if (syncPhase === 'active') {
        console.log(`--- FASE ATIVA CONCLUÍDA: ${totalProcessed} deals ---`);
        // Configura para rodar a fase 'deleted' na sequência
        props.setProperty('SYNC_PHASE', 'deleted');
        props.setProperty('PAGINATION_START', '0');

        // Chama recursivamente ou agenda a próxima execução
        dailyMetadataSync();
    } else {
        console.log(`--- MOTOR A CONCLUÍDO (Incluindo Deletados): ${totalProcessed} deals processados nesta fase ---`);
        // Limpeza dos estados
        props.deleteProperty('PAGINATION_START');
        props.deleteProperty('SYNC_PHASE');
        setLastSyncTimestamp();
        deleteTriggers('dailyMetadataSync');
    }
}

// ====================================================================
// 2. MOTOR B: SINCRONIZAÇÃO SEMANAL (FLOW / TEMPOS)
// ====================================================================

function weeklyFlowSync() {
    console.log("--- INICIANDO MOTOR B: FLUXOS ---");

    refreshMetadataCache();

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DATABASE_SHEET_NAME);
    if (!sheet) return console.error("Planilha base não encontrada.");

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;

    const headers = data[0];
    const idColIndex = headers.indexOf("ID");
    const statusColIndex = headers.indexOf("Status");

    // Pre-alocação otimizada
    const openDeals = [];
    for (let i = 1; i < data.length; i++) {
        if (data[i][statusColIndex] === "Aberto") {
            openDeals.push({ id: data[i][idColIndex] });
        }
    }

    if (openDeals.length === 0) return console.log("[LOG] Nenhum deal 'open'.");

    const stageMapping = getStagesMappingCached();
    const openFlows = fetchFlowsInBatches(openDeals);
    const stageTimesMap = calculateDeltaTimesMap(openFlows, openDeals, stageMapping);

    updateStageTimesInSheetInBatches(sheet, data, headers, stageTimesMap, idColIndex);
    console.log("--- MOTOR B FINALIZADO ---");
}

// ====================================================================
// 3. FUNÇÕES DE SUPORTE E LÓGICA DE ENGENHARIA
// ====================================================================

/**
 * Upsert 100% In-Memory com limpeza de colunas vazias e ID na Coluna A.
 */
function upsertDealsToSheet(deals, fieldMapping, optionMapping, stageMapping, pipelineMapping) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(DATABASE_SHEET_NAME) || ss.insertSheet(DATABASE_SHEET_NAME);

    let data = sheet.getDataRange().getValues();
    let headers = data.length > 0 && data[0][0] !== "" ? data[0] : ["ID", "Title", "Status", "Stage", "Pipeline"];

    // Garantir que ID seja sempre o primeiro nos headers lidos
    const idIdxInitial = headers.indexOf("ID");
    if (idIdxInitial !== 0) {
        if (idIdxInitial === -1) headers.unshift("ID");
        else {
            headers.splice(idIdxInitial, 1);
            headers.unshift("ID");
        }
    }

    if (data.length === 0) data.push(headers);

    const idMap = new Map();
    for (let i = 1; i < data.length; i++) {
        idMap.set(String(data[i][0]), i); // ID agora é garantidamente índice 0
    }

    const headerIndexMap = new Map(headers.map((h, i) => [h, i]));

    deals.forEach(deal => {
        const dealId = String(deal.id);
        const rowData = new Map();

        for (const key in deal) {
            let headerName = fieldMapping[key] || key;
            let value = deal[key];

            if (key === 'stage_id') value = stageMapping[value] || value;
            else if (key === 'pipeline_id') {
                value = pipelineMapping[value] || value;
                headerName = 'Pipeline';
            }
            else if (optionMapping[key] && value !== null) {
                value = Array.isArray(value)
                    ? value.map(id => optionMapping[key][String(id)] || id).join('; ')
                    : optionMapping[key][String(value)] || value;
            }
            if (value && typeof value === 'object' && value.name) value = value.name;

            rowData.set(headerName, value ?? "");

            if (!headerIndexMap.has(headerName)) {
                headers.push(headerName);
                headerIndexMap.set(headerName, headers.length - 1);
                data.forEach(row => row.push(""));
            }
        }

        const targetRowIndex = idMap.get(dealId);
        const newRowValues = new Array(headers.length).fill("");
        rowData.forEach((val, headerName) => {
            newRowValues[headerIndexMap.get(headerName)] = val;
        });

        if (targetRowIndex !== undefined) {
            const existingRow = data[targetRowIndex];
            data[targetRowIndex] = headers.map((h, i) =>
                h.startsWith("Tempo:") ? (existingRow[i] ?? "") : (newRowValues[i] ?? "")
            );
        } else {
            data.push(newRowValues);
            idMap.set(dealId, data.length - 1);
        }
    });

    // --- LÓGICA DE LIMPEZA E REORDENAÇÃO (Otimizada) ---
    const cleanedResult = optimizeMatrix(data, headers);

    // Garante que o header esteja na primeira linha da matriz final
    if (cleanedResult.data.length > 0) {
        cleanedResult.data[0] = cleanedResult.headers;
    }

    sheet.clearContents(); // Limpa para evitar resquícios de colunas deletadas
    sheet.getRange(1, 1, cleanedResult.data.length, cleanedResult.headers.length).setValues(cleanedResult.data);
    sheet.getRange(1, 1, 1, cleanedResult.headers.length).setFontWeight("bold");
}

/**
 * Retorna o peso de prioridade de uma coluna para ordenação.
 */
function getColumnWeight(headerName) {
    const h = headerName.trim();
    const hLower = h.toLowerCase();

    // 1. Core metadata (10 to 90)
    if (hLower === 'id') return 10;
    if (hLower === 'title' || hLower === 'título' || hLower === 'nome do negócio' || hLower === 'deal title') return 20;
    if (hLower === 'pipeline' || hLower === 'funil') return 30;
    if (hLower === 'stage' || hLower === 'estágio' || hLower === 'etapa') return 40;
    if (hLower === 'status') return 50;
    if (hLower === 'owner' || hLower === 'proprietário' || hLower === 'criador' || hLower === 'responsável' || hLower === 'criado por') return 60;
    if (hLower === 'value' || hLower === 'valor') return 70;

    // 2. Custom/our fields (100 to 199)
    if (typeof CONFIG_BASE !== 'undefined' && CONFIG_BASE.ENTITIES && CONFIG_BASE.ENTITIES.CUSTOM_FIELDS) {
        const customFieldNames = Object.values(CONFIG_BASE.ENTITIES.CUSTOM_FIELDS).map(f => f.name);
        const idx = customFieldNames.indexOf(h);
        if (idx !== -1) {
            return 100 + idx * 10;
        }
    }

    // 5. Stage duration columns (900+)
    if (h.startsWith('Tempo:')) return 900;

    // 4. Date/time columns (800)
    if (hLower.includes('data') || hLower.includes('hora') || hLower.includes('time') || hLower.includes('date') || hLower.includes('criado em') || hLower.includes('atualizado em')) {
        return 800;
    }

    // 3. Other Pipedrive fields (500 to 600)
    if (hLower.includes('probability') || hLower.includes('probabilidade') || hLower.includes('frequência') || hLower.includes('peso') || hLower.includes('moeda') || hLower.includes('currency')) {
        return 600;
    }

    return 500;
}

/**
 * Filtra colunas vazias (preservando ID e Tempos), garante ID na Coluna A e reordena colunas por importância.
 */
function optimizeMatrix(data, headers) {
    const numRows = data.length;
    const numCols = headers.length;
    const keepIndices = [];

    for (let j = 0; j < numCols; j++) {
        const hName = headers[j];

        // Regra de Ouro: Sempre manter ID e colunas de Tempo
        if (hName === "ID" || hName.startsWith("Tempo:")) {
            keepIndices.push(j);
            continue;
        }

        // Verifica se a coluna tem algum dado (pula header idx 0)
        let hasData = false;
        for (let i = 1; i < numRows; i++) {
            if (data[i][j] !== "" && data[i][j] !== null && data[i][j] !== undefined) {
                hasData = true;
                break;
            }
        }
        if (hasData) keepIndices.push(j);
    }

    // Reconstrói a matriz apenas com as colunas úteis
    const newHeaders = keepIndices.map(j => headers[j]);
    const newData = data.map(row => keepIndices.map(j => row[j]));

    // Reordena as colunas logicamente por peso
    const sortedIndices = Array.from({ length: newHeaders.length }, (_, i) => i)
        .sort((a, b) => {
            const weightA = getColumnWeight(newHeaders[a]);
            const weightB = getColumnWeight(newHeaders[b]);
            if (weightA !== weightB) {
                return weightA - weightB;
            }
            return newHeaders[a].localeCompare(newHeaders[b]);
        });

    const finalHeaders = sortedIndices.map(i => newHeaders[i]);
    const finalData = newData.map(row => sortedIndices.map(i => row[i]));

    return { data: finalData, headers: finalHeaders };
}

/**
 * Atualiza colunas de tempo in-memory.
 */
function updateStageTimesInSheetInBatches(sheet, data, headers, stageTimesMap, idColIndex) {
    let headersChanged = false;
    const timeCols = new Map();

    headers.forEach((h, i) => { if (h.startsWith("Tempo:")) timeCols.set(h, i); });

    for (let i = 1; i < data.length; i++) {
        const dealId = String(data[i][idColIndex]);
        const times = stageTimesMap[dealId];

        if (times) {
            for (const stageName in times) {
                const colName = `Tempo: ${stageName} (dias)`;

                if (!timeCols.has(colName)) {
                    headers.push(colName);
                    timeCols.set(colName, headers.length - 1);
                    headersChanged = true;
                }

                // Expande a linha atual se necessário antes de inserir
                if (data[i].length <= timeCols.get(colName)) data[i].length = headers.length;
                data[i][timeCols.get(colName)] = times[stageName];
            }
        }
    }

    const maxCols = headers.length;
    for (let i = 0; i < data.length; i++) {
        if (data[i].length < maxCols) {
            data[i].length = maxCols;
            for (let j = 0; j < maxCols; j++) { if (data[i][j] === undefined) data[i][j] = ""; }
        }
    }

    // --- LÓGICA DE LIMPEZA E REORDENAÇÃO (Otimizada) ---
    const optimized = optimizeMatrix(data, headers);
    if (optimized.data.length > 0) {
        optimized.data[0] = optimized.headers;
    }

    sheet.clearContents(); // Limpa para evitar resquícios de colunas deletadas ou movidas
    sheet.getRange(1, 1, optimized.data.length, optimized.headers.length).setValues(optimized.data);
    sheet.getRange(1, 1, 1, optimized.headers.length).setFontWeight("bold");
}

/**
 * Gerencia o cache de mapeamentos em uma aba de forma visual e técnica.
 * Atualiza a cada 7 dias ou quando forçado.
 */
function refreshMetadataCache(forceRefresh = false) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let metaSheet = ss.getSheetByName("Estágios") || ss.insertSheet("Estágios");

    // data na célula A2
    const lastUpdateValue = metaSheet.getRange("A2").getValue();
    const now = new Date();
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;

    if (forceRefresh || !lastUpdateValue || (now - new Date(lastUpdateValue)) > sevenDaysInMs) {
        console.log("--- ATUALIZANDO INTERFACE DE METADADOS ---");

        const fieldData = fetchFieldMappingFromAPI();
        const stageMapping = fetchStagesMappingFromAPI();
        const pipelineMapping = fetchPipelinesMappingFromAPI();

        // Limpa apenas os dados no intervalo A2:I101, preservando formatação
        metaSheet.getRange("A2:I101").clearContent();

        // --- 1. CABEÇALHOS (Linha 1) ---
        // Nome antes do ID/Key
        metaSheet.getRange("A1:I1").setValues([[
            "ÚLTIMA ATUALIZAÇÃO", "STATUS", "", "Pipeline", "Estágio (Ordenado)", "ID Estágio", "", "Nome do Campo", "Chave API (Key)"
        ]]);

        // Estilização dos Cabeçalhos
        const headerRange = metaSheet.getRange("A1:I1");
        headerRange.setFontWeight("bold").setFontColor("white").setVerticalAlignment("middle").setHorizontalAlignment("center");

        metaSheet.getRange("A1:B1").setBackground("#444444"); // Cinza (Info)
        metaSheet.getRange("D1:F1").setBackground("#1155cc"); // Azul (Estágios)
        metaSheet.getRange("H1:I1").setBackground("#38761d"); // Verde (Campos)

        // --- 2. DADOS DE CONTROLE (Linha 2) ---
        // Agora a data fica exatamente embaixo do título "ÚLTIMA ATUALIZAÇÃO"
        metaSheet.getRange("A2").setValue(now).setNumberFormat("dd/mm/yyyy HH:mm");
        metaSheet.getRange("B2").setValue("Sincronizado");

        // --- 3. ÁREA TÉCNICA (Linhas 98, 99, 100 e 101 - Ocultas) ---
        // O script lerá os JSONs destas células para manter a performance
        const pipelinesEStages = fetchPipelinesAndStagesDetailed();
        metaSheet.getRange("A98:B98").setValues([["JSON_FIELDS", JSON.stringify(fieldData)]]);
        metaSheet.getRange("A99:B99").setValues([["JSON_STAGES", JSON.stringify(stageMapping)]]);
        metaSheet.getRange("A100:B100").setValues([["JSON_PIPELINES_STAGES", JSON.stringify(pipelinesEStages)]]);
        metaSheet.getRange("A101:B101").setValues([["JSON_PIPELINES", JSON.stringify(pipelineMapping)]]);

        // Garante que as linhas existem antes de ocultar
        const maxRows = metaSheet.getMaxRows();
        if (maxRows < 101) {
            metaSheet.insertRowsAfter(maxRows, 101 - maxRows);
        }
        metaSheet.hideRows(98, 4); // Oculta 4 linhas a partir da 98 (98, 99, 100, 101)

        // --- 4. TABELA VISUAL: PIPELINES E ESTÁGIOS (Colunas D, E e F) ---
        // Ordem: Pipeline (D), Nome do Estágio (E), ID Estágio (F)
        let linhaAtual = 2;
        const stageVisualRows = [];

        // Iterar de forma ordenada pelos pipelines e dentro deles pelos estágios
        Object.keys(pipelinesEStages).sort().forEach(pipelineName => {
            const pipe = pipelinesEStages[pipelineName];
            if (pipe && pipe.stages) {
                pipe.stages.forEach(stg => {
                    stageVisualRows.push([pipelineName, stg.name, stg.id]);
                });
            }
        });

        if (stageVisualRows.length > 0) {
            metaSheet.getRange(2, 4, Math.min(stageVisualRows.length, 90), 3).setValues(stageVisualRows.slice(0, 90));
        }

        // --- 5. TABELA VISUAL: CAMPOS (Colunas H e I) ---
        // Ordem: Nome do Campo (H), Key (I). Coluna G mantida em branco.
        const fieldRows = Object.entries(fieldData.fieldMapping).map(([key, name]) => [name, key]);
        if (fieldRows.length > 0) {
            metaSheet.getRange(2, 8, Math.min(fieldRows.length, 90), 2).setValues(fieldRows.slice(0, 90));
        }

        // --- 6. AJUSTES FINAIS DE LAYOUT ---
        metaSheet.setColumnWidth(1, 180); // Última atualização
        metaSheet.setColumnWidth(2, 100); // Status
        metaSheet.setColumnWidth(3, 30);  // Espaçador
        metaSheet.setColumnWidth(4, 250); // Pipeline
        metaSheet.setColumnWidth(5, 250); // Estágio
        metaSheet.setColumnWidth(6, 100); // ID Estágio
        metaSheet.setColumnWidth(7, 30);  // Espaçador
        metaSheet.setColumnWidth(8, 250); // Nome do Campo
        metaSheet.setColumnWidth(9, 250); // Chave API

        metaSheet.setFrozenRows(1);
        metaSheet.getRange("A:I").setVerticalAlignment("middle");

        console.log("Interface atualizada com sucesso.");
    }
}

/**
 * Cache dos mapeamentos da API do Pipedrive (válido por 6 horas)
 */
function getDynamicFieldMappingCached() {
    const cache = CacheService.getScriptCache();
    const cached = cache.get('PIPEDRIVE_FIELD_MAP');
    if (cached) return JSON.parse(cached);

    // Se não está no CacheService, lê da aba de metadados
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const metaSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Estágios");

    if (metaSheet) {
        const data = metaSheet.getRange("B98").getValue(); // JSON dos campos está em B98
        if (data) {
            cache.put('PIPEDRIVE_FIELD_MAP', data, 21600);
            return JSON.parse(data);
        }
    }

    // Fallback de emergência caso a aba esteja vazia
    refreshMetadataCache(true);
    return getDynamicFieldMappingCached();
}

/**
 * @typedef {Object} PipedriveResponse
 * @property {Array} data
 * @property {Object} additional_data
 */

/**
 * Otimização: Busca estágios com falha segura e cache atômico.
 */
function getStagesMappingCached() {
    const cache = CacheService.getScriptCache();
    const cached = cache.get('PIPEDRIVE_STAGES_MAP');
    if (cached) return JSON.parse(cached);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const metaSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Estágios");

    if (metaSheet) {
        const data = metaSheet.getRange("B99").getValue(); // JSON dos estágios está em B99
        if (data) {
            cache.put('PIPEDRIVE_STAGES_MAP', data, 21600);
            return JSON.parse(data);
        }
    }

    refreshMetadataCache(true);
    return getStagesMappingCached();
}

/**
 * Otimização: Busca pipelines com falha segura e cache atômico.
 */
function getPipelinesMappingCached() {
    const cache = CacheService.getScriptCache();
    const cached = cache.get('PIPEDRIVE_PIPELINES_MAP');
    if (cached) return JSON.parse(cached);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const metaSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Estágios");

    if (metaSheet) {
        const data = metaSheet.getRange("B101").getValue(); // JSON dos pipelines está em B101
        if (data) {
            cache.put('PIPEDRIVE_PIPELINES_MAP', data, 21600);
            return JSON.parse(data);
        }
    }

    refreshMetadataCache(true);
    return getPipelinesMappingCached();
}

function fetchFieldMappingFromAPI() {
    const url = `${PIPEDRIVE_API_BASE_URL}/dealFields?api_token=${PIPEDRIVE_API_TOKEN}`;
    const response = UrlFetchApp.fetch(url);
    const json = JSON.parse(response.getContentText());
    const fieldMapping = {};
    const optionMapping = {};

    if (json.data) {
        json.data.forEach(field => {
            fieldMapping[field.key] = field.name;
            if (field.options) {
                optionMapping[field.key] = {};
                field.options.forEach(opt => {
                    optionMapping[field.key][String(opt.id)] = opt.label;
                });
            }
        });
    }
    return { fieldMapping, optionMapping };
}

function fetchStagesMappingFromAPI() {
    const response = fetchPipedriveChunk('stages', { limit: 500 });
    return response.data.reduce((acc, s) => {
        acc[String(s.id)] = s.name;
        return acc;
    }, {});
}

function fetchPipelinesMappingFromAPI() {
    const response = fetchPipedriveChunk('pipelines', { limit: 500 });
    return response.data.reduce((acc, p) => {
        acc[String(p.id)] = p.name;
        return acc;
    }, {});
}

function fetchPipelinesAndStagesDetailed() {
    const pipelinesRes = fetchPipedriveChunk('pipelines', { limit: 500 });
    const stagesRes = fetchPipedriveChunk('stages', { limit: 500 });

    const pipelinesData = pipelinesRes.data || [];
    const stagesData = stagesRes.data || [];

    pipelinesData.sort((a, b) => a.order_nr - b.order_nr);
    stagesData.sort((a, b) => a.order_nr - b.order_nr);

    const pipelineMap = {}; // id -> name
    const groupedStages = {};

    pipelinesData.forEach(p => {
        pipelineMap[p.id] = p.name;
        groupedStages[p.name] = { id: p.id, order_nr: p.order_nr, stages: [] };
    });

    stagesData.forEach(s => {
        const pName = pipelineMap[s.pipeline_id];
        if (pName && groupedStages[pName]) {
            groupedStages[pName].stages.push({
                id: s.id,
                name: s.name,
                order_nr: s.order_nr
            });
        }
    });

    return groupedStages;
}

/**
 * Busca um "pedaço" de dados do Pipedrive para paginação controlada.
 */
function fetchPipedriveChunk(endpoint, params) {
    const json = fetchPipedriveData(endpoint, params, false);

    return {
        data: json.data || [],
        more_items: json.additional_data?.pagination?.more_items_in_collection || false,
        next_start: json.additional_data?.pagination?.next_start || 0
    };
}

/**
 * Otimização: Batching agressivo com fetchAll.
 * Pipedrive permite até 40-100 requests por 2s (dependendo do plano).
 */
function fetchFlowsInBatches(deals) {
    if (!deals.length) return [];

    const BATCH_SIZE = 40;
    const allFlows = [];
    const baseUrl = `${PIPEDRIVE_API_BASE_URL}/deals/`;
    const tokenSuffix = `/flow?api_token=${PIPEDRIVE_API_TOKEN}`;

    for (let i = 0; i < deals.length; i += BATCH_SIZE) {
        const requests = deals.slice(i, i + BATCH_SIZE).map(deal => ({
            url: baseUrl + deal.id + tokenSuffix,
            method: 'get',
            muteHttpExceptions: true,
            headers: { "Accept-Encoding": "gzip" }
        }));

        const responses = UrlFetchApp.fetchAll(requests);

        responses.forEach(res => {
            if (res.getResponseCode() === 200) {
                const json = JSON.parse(res.getContentText());
                if (json.data) allFlows.push(...json.data);
            }
        });

        if (i > 0 && i % 200 === 0) Utilities.sleep(100);
    }
    return allFlows;
}

/**
 * Cálculo de tempo usando álgebra de timestamps direta.
 */
function calculateDeltaTimesMap(openFlows, deals, stageMapping) {
    const stageTimesByDeal = {};
    const flowsByDeal = new Map();

    for (let i = 0; i < openFlows.length; i++) {
        const event = openFlows[i];
        if (event.object !== "dealChange" || event.data.field_key !== "stage_id") continue;

        const dealId = String(event.data.item_id);
        if (!flowsByDeal.has(dealId)) flowsByDeal.set(dealId, []);

        flowsByDeal.get(dealId).push({
            stage_id: event.data.new_value,
            // Date.parse é otimizado nativamente no V8 em vez de replace manual
            timestamp: Date.parse(event.timestamp.replace(' ', 'T'))
        });
    }

    const NOW = Date.now();
    const MS_PER_DAY = 86400000;

    for (let i = 0; i < deals.length; i++) {
        const dealId = String(deals[i].id);
        const transitions = flowsByDeal.get(dealId);
        if (!transitions) continue;

        transitions.sort((a, b) => a.timestamp - b.timestamp);
        const dealTimes = {};

        for (let j = 0; j < transitions.length; j++) {
            const t = transitions[j];
            const exit = (j + 1 < transitions.length) ? transitions[j + 1].timestamp : NOW;
            const stageName = stageMapping[t.stage_id] || `Estágio ${t.stage_id}`;

            // Soma e divide uma única vez, reduzindo operações flutuantes
            dealTimes[stageName] = (dealTimes[stageName] || 0) + (exit - t.timestamp);
        }

        for (const s in dealTimes) {
            // Divide pelo dia em MS só no final, garantindo melhor precisão de floats
            dealTimes[s] = Number((dealTimes[s] / MS_PER_DAY).toFixed(2));
        }

        stageTimesByDeal[dealId] = dealTimes;
    }

    return stageTimesByDeal;
}

/**
 * Utilitários de gatilho com lógica de limpeza atômica.
 */
function createReinvokeTrigger(functionName) {
    const triggers = ScriptApp.getProjectTriggers();
    let triggerExists = false;

    for (const t of triggers) {
        if (t.getHandlerFunction() === functionName) {
            triggerExists = true;
            break;
        }
    }

    if (!triggerExists) {
        ScriptApp.newTrigger(functionName)
            .timeBased()
            .after(60000)
            .create();
    }
}

/**
 * Remove gatilhos existentes para evitar execuções duplicadas.
 */
function deleteTriggers(functionName) {
    ScriptApp.getProjectTriggers().forEach(t => {
        if (t.getHandlerFunction() === functionName) ScriptApp.deleteTrigger(t);
    });
}

/**
 * Gerencia a data da última sincronização bem-sucedida.
 */
function getLastSyncTimestamp() {
    const lastSync = PropertiesService.getScriptProperties().getProperty('LAST_SYNC_TIME');
    if (!lastSync) {
        // Se nunca rodou, busca as últimas 24h como segurança
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return Utilities.formatDate(yesterday, "GMT", "yyyy-MM-dd HH:mm:ss");
    }
    return lastSync;
}

function setLastSyncTimestamp() {
    const now = Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd HH:mm:ss");
    PropertiesService.getScriptProperties().setProperty('LAST_SYNC_TIME', now);
    console.log(`[SYNC] Timestamp de sincronização atualizado para: ${now}`);
}



let _resolvedConfig = null;

function getResolvedConfig() {
    if (_resolvedConfig) return _resolvedConfig;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("Planilha ativa não encontrada.");
    const sheet = ss.getSheetByName("Estágios");
    if (!sheet) throw new Error("Aba 'Estágios' não encontrada.");

    const data = sheet.getDataRange().getValues();

    const stagesByPipelineList = {};
    const stagesByName = {};
    const fieldsByName = {};

    // A planilha tem Cabeçalhos na linha 1.
    for (let i = 1; i < data.length; i++) {
        const pipelineName = data[i][3]; // Coluna D (Pipeline)
        const stageName = data[i][4];    // Coluna E (Estágio)
        const stageId = data[i][5];      // Coluna F (ID Estágio)
        const fieldName = data[i][7];    // Coluna H (Nome do Campo)
        const fieldKey = data[i][8];     // Coluna I (Chave API)

        if (stageName && stageId) {
            const numStageId = Number(stageId);
            stagesByName[stageName.trim()] = numStageId;
            if (pipelineName) {
                if (!stagesByPipelineList[pipelineName]) stagesByPipelineList[pipelineName] = [];
                stagesByPipelineList[pipelineName].push({ id: numStageId, name: stageName });
            }
        }
        if (fieldName && fieldKey) {
            fieldsByName[fieldName.trim()] = fieldKey.trim();
        }
    }

    const pipelinesStagesJsonVal = sheet.getRange("B100").getValue();
    let pipelinesStagesData = {};
    if (pipelinesStagesJsonVal) {
        try {
            pipelinesStagesData = JSON.parse(pipelinesStagesJsonVal);
        } catch(e) {}
    }

    const entityConfig = CONFIG_BASE.ENTITIES || {};
    const pipelineEntities = entityConfig.PIPELINES || {};
    const stageEntities = entityConfig.STAGES || {};
    const customFieldEntities = entityConfig.CUSTOM_FIELDS || {};

    const fail = (message) => {
        throw new Error(`[CONFIG] ${message}`);
    };

    const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";
    const isPresent = (value) => value !== undefined && value !== null && value !== "";
    const isPositiveId = (value) => {
        const parsed = typeof value === "number" ? value : Number(value);
        return Number.isFinite(parsed) && parsed > 0;
    };

    const assertEntityName = (entity, path) => {
        if (!entity) fail(`${path} ausente.`);
        if (!isNonEmptyString(entity.name)) fail(`${path}.name ausente/vazio.`);
    };

    // Resolução dinâmica com fallback
    const resolvePipelineId = (entity, fallbackValue) => {
        if (entity) {
            if (entity.name && pipelinesStagesData[entity.name]) {
                return pipelinesStagesData[entity.name].id;
            }
            if (entity.id !== undefined && entity.id !== null && entity.id !== "") return entity.id;
        }
        return fallbackValue;
    };

    const resolveStageId = (entity, fallbackValue) => {
        if (entity) {
            if (entity.name && stagesByName[entity.name.trim()] !== undefined) {
                return stagesByName[entity.name.trim()];
            }
            if (entity.id !== undefined && entity.id !== null && entity.id !== "") return entity.id;
        }
        return fallbackValue;
    };

    const resolveEntityKey = (entity, fallbackValue) => {
        if (entity) {
            if (entity.name && fieldsByName[entity.name.trim()]) {
                return fieldsByName[entity.name.trim()];
            }
            if (isNonEmptyString(entity.key)) return entity.key;
        }
        return fallbackValue;
    };

    // Checagem operacional dos nomes na configuração bruta
    ["RETOMADA", "NURTURING"].forEach((key) => {
        assertEntityName(pipelineEntities[key], `CONFIG_BASE.ENTITIES.PIPELINES.${key}`);
    });

    ["INDO_PARA_EMAIL_1", "ENVIO_EMAIL_1", "ESPERA"].forEach((key) => {
        assertEntityName(stageEntities[key], `CONFIG_BASE.ENTITIES.STAGES.${key}`);
    });

    ["EMAIL_TITLE", "EMAIL_BODY", "LABEL", "COMPANY_SECTOR", "ORIGIN_ID_FIELD", "DATA_RETOMADA", "STATUS_RETOMADA"].forEach((key) => {
        assertEntityName(customFieldEntities[key], `CONFIG_BASE.ENTITIES.CUSTOM_FIELDS.${key}`);
    });

    const config = {
        PIPELINES: {
            RETOMADA: {
                id: resolvePipelineId(pipelineEntities.RETOMADA, 15),
                name: pipelineEntities.RETOMADA.name
            },
            NURTURING: {
                id: resolvePipelineId(pipelineEntities.NURTURING, 16),
                name: pipelineEntities.NURTURING.name
            }
        },
        STAGES: {
            INDO_PARA_EMAIL_1: {
                id: resolveStageId(stageEntities.INDO_PARA_EMAIL_1, 85),
                name: stageEntities.INDO_PARA_EMAIL_1.name
            },
            ENVIO_EMAIL_1: {
                id: resolveStageId(stageEntities.ENVIO_EMAIL_1, 81),
                name: stageEntities.ENVIO_EMAIL_1.name
            },
            ESPERA: {
                id: resolveStageId(stageEntities.ESPERA, 80),
                name: stageEntities.ESPERA.name
            }
        },
        CUSTOM_FIELDS: {
            EMAIL_TITLE: {
                key: resolveEntityKey(customFieldEntities.EMAIL_TITLE, "74647c02e74ca7b4d0f98a71cfdc436bac8f0f5d"),
                name: customFieldEntities.EMAIL_TITLE.name
            },
            EMAIL_BODY: {
                key: resolveEntityKey(customFieldEntities.EMAIL_BODY, "e616420fb16e671963854114c6bba6bd5c3bcef1"),
                name: customFieldEntities.EMAIL_BODY.name
            },
            LABEL: {
                key: resolveEntityKey(customFieldEntities.LABEL, "label"),
                name: customFieldEntities.LABEL.name
            },
            COMPANY_SECTOR: {
                key: resolveEntityKey(customFieldEntities.COMPANY_SECTOR, "6ea1ea74da5fbb8cb6a8dd741a96a9bc8b4e379f"),
                name: customFieldEntities.COMPANY_SECTOR.name
            },
            ORIGIN_ID_FIELD: {
                key: resolveEntityKey(customFieldEntities.ORIGIN_ID_FIELD, "e465d18813a12b0bbd089af1996b1090751ab057"),
                name: customFieldEntities.ORIGIN_ID_FIELD.name
            },
            DATA_RETOMADA: {
                key: resolveEntityKey(customFieldEntities.DATA_RETOMADA, "91cf62129f1fb478eb05f1aaa580952967f55e27"),
                name: customFieldEntities.DATA_RETOMADA.name
            },
            STATUS_RETOMADA: {
                key: resolveEntityKey(customFieldEntities.STATUS_RETOMADA, "25c167b1f8b043a7ab777886972fc7ec7d01bd45"),
                name: customFieldEntities.STATUS_RETOMADA.name
            }
        },
        WORKFLOW_STAGE_MAPPING: {},
        OPERATIONS: {}
    };

    // Validação pós-resolução
    ["RETOMADA", "NURTURING"].forEach((key) => {
        const ent = config.PIPELINES[key];
        const path = `Resolved CONFIG.PIPELINES.${key}`;
        if (!isPresent(ent.id) || !isPositiveId(ent.id)) fail(`${path}.id ausente ou inválido.`);
    });
    ["INDO_PARA_EMAIL_1", "ENVIO_EMAIL_1", "ESPERA"].forEach((key) => {
        const ent = config.STAGES[key];
        const path = `Resolved CONFIG.STAGES.${key}`;
        if (!isPresent(ent.id) || !isPositiveId(ent.id)) fail(`${path}.id ausente ou inválido.`);
    });
    ["EMAIL_TITLE", "EMAIL_BODY", "LABEL", "COMPANY_SECTOR", "ORIGIN_ID_FIELD", "DATA_RETOMADA", "STATUS_RETOMADA"].forEach((key) => {
        const ent = config.CUSTOM_FIELDS[key];
        const path = `Resolved CONFIG.CUSTOM_FIELDS.${key}`;
        if (!isNonEmptyString(ent.key)) fail(`${path}.key ausente/vazio.`);
    });

    // Valores globais de runtime. Ficam no topo da config porque não são entidades.
    const operationsConfig = CONFIG_BASE.OPERATIONS || {};
    const summaryOps = operationsConfig.SUMMARY || {};
    const emailOps = operationsConfig.EMAIL || {};
    const continuationOps = operationsConfig.CONTINUATION || {};
    const cacheOps = operationsConfig.CACHE || {};
    const batchOps = operationsConfig.BATCH || {};

    const maxResumoLimit = 99999;
    config.MAX_CARDS_RESUMO_PROCESSO = maxResumoLimit;
    config.OPERATIONS.SUMMARY = {
        MAX_DEALS_PER_RUN: maxResumoLimit,
        GAS_RUNTIME_BUDGET_MS: Number(isPresent(summaryOps.GAS_RUNTIME_BUDGET_MS) ? summaryOps.GAS_RUNTIME_BUDGET_MS : MAX_EXECUTION_TIME),
        OPENAI_CHUNK_SIZE: Number(isPresent(summaryOps.OPENAI_CHUNK_SIZE) ? summaryOps.OPENAI_CHUNK_SIZE : 5),
        EMPTY_NOTES_DELETE_CAP: Number(isPresent(summaryOps.EMPTY_NOTES_DELETE_CAP) ? summaryOps.EMPTY_NOTES_DELETE_CAP : 100)
    };
    config.OPERATIONS.SUMMARY.MAX_CARDS_PER_RUN = config.OPERATIONS.SUMMARY.MAX_DEALS_PER_RUN;
    config.OPERATIONS.SUMMARY.RUNTIME_BUDGET_MS = config.OPERATIONS.SUMMARY.GAS_RUNTIME_BUDGET_MS;
    config.OPERATIONS.SUMMARY.DELETE_CAP = config.OPERATIONS.SUMMARY.EMPTY_NOTES_DELETE_CAP;

    const maxEmailLimit = 99999;
    config.MAX_CARDS_EMAIL_PROCESSO = maxEmailLimit;
    config.OPERATIONS.EMAIL = {
        MAX_DEALS_PER_RUN: maxEmailLimit,
        GAS_RUNTIME_BUDGET_MS: Number(isPresent(emailOps.GAS_RUNTIME_BUDGET_MS) ? emailOps.GAS_RUNTIME_BUDGET_MS : MAX_EXECUTION_TIME),
        OPENAI_CHUNK_SIZE: Number(isPresent(emailOps.OPENAI_CHUNK_SIZE) ? emailOps.OPENAI_CHUNK_SIZE : 5)
    };
    config.OPERATIONS.EMAIL.MAX_CARDS_PER_RUN = config.OPERATIONS.EMAIL.MAX_DEALS_PER_RUN;
    config.OPERATIONS.EMAIL.RUNTIME_BUDGET_MS = config.OPERATIONS.EMAIL.GAS_RUNTIME_BUDGET_MS;

    config.OPERATIONS.CONTINUATION = {
        CONTINUATION_DELAY_MS: Number(isPresent(continuationOps.CONTINUATION_DELAY_MS) ? continuationOps.CONTINUATION_DELAY_MS : (10 * 60 * 1000)),
        CONTINUATION_MIN_SCHEDULE_INTERVAL_MS: Number(isPresent(continuationOps.CONTINUATION_MIN_SCHEDULE_INTERVAL_MS) ? continuationOps.CONTINUATION_MIN_SCHEDULE_INTERVAL_MS : (8 * 60 * 1000)),
        CONTINUATION_MAX_RUNS_PER_DAY: Number(isPresent(continuationOps.CONTINUATION_MAX_RUNS_PER_DAY) ? continuationOps.CONTINUATION_MAX_RUNS_PER_DAY : 12),
        CONTINUATION_MAX_GENERATIONS: Number(isPresent(continuationOps.CONTINUATION_MAX_GENERATIONS) ? continuationOps.CONTINUATION_MAX_GENERATIONS : 10)
    };
    config.OPERATIONS.CONTINUATION.DELAY_MS = config.OPERATIONS.CONTINUATION.CONTINUATION_DELAY_MS;
    config.OPERATIONS.CONTINUATION.MIN_SCHEDULE_INTERVAL_MS = config.OPERATIONS.CONTINUATION.CONTINUATION_MIN_SCHEDULE_INTERVAL_MS;
    config.OPERATIONS.CONTINUATION.MAX_RUNS_PER_DAY = config.OPERATIONS.CONTINUATION.CONTINUATION_MAX_RUNS_PER_DAY;
    config.OPERATIONS.CONTINUATION.MAX_GENERATIONS = config.OPERATIONS.CONTINUATION.CONTINUATION_MAX_GENERATIONS;

    config.OPERATIONS.CACHE = {
        DEAL_FAILURE_ENTRY_MAX_AGE_MS: Number(isPresent(cacheOps.DEAL_FAILURE_ENTRY_MAX_AGE_MS) ? cacheOps.DEAL_FAILURE_ENTRY_MAX_AGE_MS : (7 * 24 * 60 * 60 * 1000)),
        DEAL_FAILURE_CACHE_MAX_ITEMS: Number(isPresent(cacheOps.DEAL_FAILURE_CACHE_MAX_ITEMS) ? cacheOps.DEAL_FAILURE_CACHE_MAX_ITEMS : 500),
        SUMMARIZED_DEALS_CACHE_MAX_ITEMS: Number(isPresent(cacheOps.SUMMARIZED_DEALS_CACHE_MAX_ITEMS) ? cacheOps.SUMMARIZED_DEALS_CACHE_MAX_ITEMS : 300),
        SUMMARIZED_DEALS_CACHE_MAX_AGE_MS: Number(isPresent(cacheOps.SUMMARIZED_DEALS_CACHE_MAX_AGE_MS) ? cacheOps.SUMMARIZED_DEALS_CACHE_MAX_AGE_MS : (181 * 24 * 60 * 60 * 1000))
    };
    config.OPERATIONS.CACHE.DEAL_FAILURE_MAX_AGE_MS = config.OPERATIONS.CACHE.DEAL_FAILURE_ENTRY_MAX_AGE_MS;
    config.OPERATIONS.CACHE.DEAL_FAILURE_MAX_ITEMS = config.OPERATIONS.CACHE.DEAL_FAILURE_CACHE_MAX_ITEMS;
    config.OPERATIONS.CACHE.SUMMARIZED_DEALS_MAX_ITEMS = config.OPERATIONS.CACHE.SUMMARIZED_DEALS_CACHE_MAX_ITEMS;
    config.OPERATIONS.CACHE.SUMMARIZED_DEALS_MAX_AGE_MS = config.OPERATIONS.CACHE.SUMMARIZED_DEALS_CACHE_MAX_AGE_MS;

    config.OPERATIONS.BATCH = {
        OPENAI_BATCH_RUNTIME_BUDGET_MS: Number(isPresent(batchOps.OPENAI_BATCH_RUNTIME_BUDGET_MS) ? batchOps.OPENAI_BATCH_RUNTIME_BUDGET_MS : MAX_EXECUTION_TIME),
        OPENAI_CHUNK_SIZE: Number(isPresent(batchOps.OPENAI_CHUNK_SIZE) ? batchOps.OPENAI_CHUNK_SIZE : 5),
        LOG_BATCH_SHEET_NAME: isNonEmptyString(batchOps.LOG_BATCH_SHEET_NAME) ? batchOps.LOG_BATCH_SHEET_NAME : "Logs IA"
    };
    config.OPERATIONS.BATCH.OPENAI_RUNTIME_MS = config.OPERATIONS.BATCH.OPENAI_BATCH_RUNTIME_BUDGET_MS;

    config.SUMMARY_RUNTIME_BUDGET_MS = config.OPERATIONS.SUMMARY.RUNTIME_BUDGET_MS;
    config.SUMMARY_OPENAI_RUNTIME_MS = config.OPERATIONS.SUMMARY.OPENAI_RUNTIME_MS;
    config.SUMMARY_OPENAI_CHUNK_SIZE = config.OPERATIONS.SUMMARY.OPENAI_CHUNK_SIZE;
    config.MAX_CARDS_RESUMO_PROCESSO = config.OPERATIONS.SUMMARY.MAX_CARDS_PER_RUN;
    config.MAX_CARDS_DELETE_LIMIT = config.OPERATIONS.SUMMARY.DELETE_CAP;
    config.EMAIL_RUNTIME_BUDGET_MS = config.OPERATIONS.EMAIL.RUNTIME_BUDGET_MS;
    config.EMAIL_OPENAI_RUNTIME_MS = config.OPERATIONS.EMAIL.OPENAI_RUNTIME_MS;
    config.EMAIL_OPENAI_CHUNK_SIZE = config.OPERATIONS.EMAIL.OPENAI_CHUNK_SIZE;
    config.MAX_CARDS_EMAIL_PROCESSO = config.OPERATIONS.EMAIL.MAX_CARDS_PER_RUN;
    config.CONTINUATION = config.OPERATIONS.CONTINUATION;
    config.DEAL_FAILURE_MAX_AGE_MS = config.OPERATIONS.CACHE.DEAL_FAILURE_ENTRY_MAX_AGE_MS;
    config.DEAL_FAILURE_MAX_ITEMS = config.OPERATIONS.CACHE.DEAL_FAILURE_CACHE_MAX_ITEMS;
    config.SUMMARIZED_DEALS_MAX_ITEMS = config.OPERATIONS.CACHE.SUMMARIZED_DEALS_CACHE_MAX_ITEMS;
    config.SUMMARIZED_DEALS_MAX_AGE_MS = config.OPERATIONS.CACHE.SUMMARIZED_DEALS_CACHE_MAX_AGE_MS;
    config.LOG_BATCH_SHEET_NAME = config.OPERATIONS.BATCH.LOG_BATCH_SHEET_NAME;
    config.BATCH_OPENAI_RUNTIME_MS = config.OPERATIONS.BATCH.OPENAI_BATCH_RUNTIME_BUDGET_MS;
    config.BATCH_OPENAI_CHUNK_SIZE = config.OPERATIONS.BATCH.OPENAI_CHUNK_SIZE;
    config.CONTINUATION_MAX_GENERATIONS = config.CONTINUATION.CONTINUATION_MAX_GENERATIONS;
    config.CONTINUATION_DELAY_MS = config.CONTINUATION.CONTINUATION_DELAY_MS;
    config.CONTINUATION_MIN_SCHEDULE_INTERVAL_MS = config.CONTINUATION.CONTINUATION_MIN_SCHEDULE_INTERVAL_MS;
    config.CONTINUATION_MAX_RUNS_PER_DAY = config.CONTINUATION.CONTINUATION_MAX_RUNS_PER_DAY;

    config.PLANILHA_LOGS_IA_ID = isNonEmptyString(CONFIG_BASE.PLANILHA_LOGS_IA_ID)
        ? CONFIG_BASE.PLANILHA_LOGS_IA_ID
        : "1fvgjELHcDPRK5PoNu6fINayDHxnwdsref72pWzVYr1Q";
    if (!isNonEmptyString(config.PLANILHA_LOGS_IA_ID)) {
        fail("CONFIG_BASE.PLANILHA_LOGS_IA_ID ausente/vazio.");
    }

    // Montar WORKFLOW_STAGE_MAPPING baseado na ordem literal das linhas da planilha.
    // Aqui trabalhamos com a chave da cadência (RETOMADA/NURTURING), não com o nome exibido.
    const tryMapWorkflow = (cadenceKey) => {
        const pipeName = config.PIPELINES[cadenceKey]?.name;
        if (pipeName && stagesByPipelineList[pipeName]) {
            let step = 1;
            // Iterar sequencialmente seguindo a ordem da planilha
            stagesByPipelineList[pipeName].forEach(stg => {
                if (stg.name.includes("Indo para E-mail") || stg.name.match(/Preparar E-mail/)) {
                    config.WORKFLOW_STAGE_MAPPING[stg.id] = { passo: step++, cadencia: cadenceKey === "NURTURING" ? "Nurturing Final" : pipeName };
                } else if (stg.name.includes("Breakup") && stg.name !== "Breakup") {
                    config.WORKFLOW_STAGE_MAPPING[stg.id] = { passo: step++, cadencia: (cadenceKey === "NURTURING" ? "Nurturing Final" : pipeName) + " (Breakup)" };
                } else if (stg.name === "Preparando Nutrição" && cadenceKey === "NURTURING") {
                    config.WORKFLOW_STAGE_MAPPING[stg.id] = { passo: step++, cadencia: "Nurturing" };
                }
            });
        }
    };

    const pipelineKeys = Object.keys(config.PIPELINES);
    if (pipelineKeys.length === 0) {
        fail("CONFIG.PIPELINES deve conter ao menos um pipeline.");
    }

    pipelineKeys.forEach((pipelineKey) => {
        tryMapWorkflow(pipelineKey);
    });

    // Fail-fast se não conseguimos mapear nada: normalmente isso indica inconsistência entre
    // o nome do pipeline no config e a coluna D da aba "Estágios".
    const mappedCount = Object.keys(config.WORKFLOW_STAGE_MAPPING).length;
    if (mappedCount === 0) {
        const pipelineNames = pipelineKeys
            .map((pipelineKey) => config.PIPELINES[pipelineKey]?.name)
            .filter(Boolean);
        fail(
            "WORKFLOW_STAGE_MAPPING ficou vazio. Verifique a aba 'Estágios' (coluna D = Pipeline, coluna F = ID) e se os nomes em CONFIG.ENTITIES.PIPELINES batem exatamente com a planilha. " +
            `Pipelines esperados: ${pipelineNames.join(", ")}`
        );
    }

    _resolvedConfig = config;
    return config;
}

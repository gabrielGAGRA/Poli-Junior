// Autor: Gabriel Agra de Castro Motta
// Última atualização: 03/03/2026
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.


// ====================================================================
// 1. MOTOR A: SINCRONIZAÇÃO DIÁRIA (METADADOS)
// ====================================================================

function dailyMetadataSync() {
    refreshMetadataCache()
    const startTime = Date.now();
    const props = PropertiesService.getScriptProperties();

    let paginationStart = parseInt(props.getProperty('PAGINATION_START'), 10) || 0;
    let lastSync = getLastSyncTimestamp();

    console.log(`--- INICIANDO MOTOR A (Lote) a partir de: ${paginationStart} ---`);

    // Busca de cache em paralelo (aproveitando I/O do Apps Script)
    const { fieldMapping, optionMapping } = getDynamicFieldMappingCached();
    const stageMapping = getStagesMappingCached();

    let hasMore = true;
    let totalProcessed = 0;
    const allDealsToUpsert = [];

    while (hasMore) {
        const response = fetchPipedriveChunk('deals', {
            updated_since: lastSync,
            sort: 'update_time DESC',
            limit: 500, // Máximo permitido pela API
            start: paginationStart
        });

        const dataLength = response.data?.length || 0;
        if (dataLength === 0) break;

        // Spread operator para concatenação de alta performance
        allDealsToUpsert.push(...response.data);
        totalProcessed += dataLength;
        paginationStart = response.next_start;
        hasMore = response.more_items;

        if (Date.now() - startTime > MAX_EXECUTION_TIME && hasMore) {
            console.warn(`[TIMEOUT PREVENT] Checkpoint no item ${paginationStart}.`);
            props.setProperty('PAGINATION_START', paginationStart.toString());
            createReinvokeTrigger('dailyMetadataSync');
            break;
        }
    }

    if (allDealsToUpsert.length > 0) {
        upsertDealsToSheet(allDealsToUpsert, fieldMapping, optionMapping, stageMapping);
    }

    if (!hasMore) {
        console.log(`--- MOTOR A FINALIZADO: ${totalProcessed} deals processados ---`);
        props.deleteProperty('PAGINATION_START');
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

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MAIN_SHEET_NAME);
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
function upsertDealsToSheet(deals, fieldMapping, optionMapping, stageMapping) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(MAIN_SHEET_NAME) || ss.insertSheet(MAIN_SHEET_NAME);

    let data = sheet.getDataRange().getValues();
    let headers = data.length > 0 && data[0][0] !== "" ? data[0] : ["ID", "Title", "Status", "Stage"];

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
            const headerName = fieldMapping[key] || key;
            let value = deal[key];

            if (key === 'stage_id') value = stageMapping[value] || value;
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
 * Filtra colunas vazias (preservando ID e Tempos) e garante ID na Coluna A.
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

    return { data: newData, headers: newHeaders };
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

    sheet.getRange(1, 1, data.length, maxCols).setValues(data);
    if (headersChanged) sheet.getRange(1, 1, 1, maxCols).setFontWeight("bold");
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

        // Limpa apenas os dados no intervalo A2:I100, preservando formatação
        metaSheet.getRange("A2:I100").clearContent();

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

        // --- 3. ÁREA TÉCNICA (Linhas 98, 99 e 100 - Ocultas) ---
        // O script lerá os JSONs destas células para manter a performance
        const pipelinesEStages = fetchPipelinesAndStagesDetailed();
        metaSheet.getRange("A98:B98").setValues([["JSON_FIELDS", JSON.stringify(fieldData)]]);
        metaSheet.getRange("A99:B99").setValues([["JSON_STAGES", JSON.stringify(stageMapping)]]);
        metaSheet.getRange("A100:B100").setValues([["JSON_PIPELINES_STAGES", JSON.stringify(pipelinesEStages)]]);

        // Garante que as linhas existem antes de ocultar
        const maxRows = metaSheet.getMaxRows();
        if (maxRows < 100) {
            metaSheet.insertRowsAfter(maxRows, 100 - maxRows);
        }
        metaSheet.hideRows(98, 3); // Oculta 3 linhas a partir da 98 (98, 99, 100)

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
    const queryString = Object.keys(params)
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&');

    const url = `${PIPEDRIVE_API_BASE_URL}/${endpoint}?api_token=${PIPEDRIVE_API_TOKEN}&${queryString}`;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const json = JSON.parse(response.getContentText());

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

/**
 * Função genérica de fetch (usada internamente pelo getStagesMappingCached).
 */
function fetchPipedriveData(endpoint, params = {}, paginate = true) {
    let allData = [];
    let start = 0;
    let hasMore = true;

    while (hasMore) {
        const response = fetchPipedriveChunk(endpoint, { ...params, start });
        allData = allData.concat(response.data);
        hasMore = paginate ? response.more_items : false;
        start = response.next_start;
    }
    return allData;
}
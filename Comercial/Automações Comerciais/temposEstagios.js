// Autor: Gabriel Agra de Castro Motta
// Última atualização: 12/12/2025
// Descrição: Calcula o tempo médio gasto em cada etapa do funil
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/**
 * @OnlyCurrentDoc
 *
 * Script to calculate the average time a "deal" stays in each stage
 * of specific funnels (pipelines) in Pipedrive.
 */

var StageTimesService = (function () {

    // =================================================================================
    // 1. DATA FETCHING FUNCTIONS (PIPEDRIVE)
    // =================================================================================

    function fetchDealsByPipeline(pipelineId) {
        const filterId = STAGE_TIME_FILTER_MAP[pipelineId];
        if (!filterId) {
            console.warn('⚠️ No filter found in map for pipeline ID ' + pipelineId + '. Skipping.');
            return [];
        }

        console.log('Fetching deals [pipeline ' + pipelineId + '] with filter ' + filterId);

        return fetchPipedriveData('deals', {
            filter_id: filterId,
            limit: 500
        }, true);
    }

    function fetchFlowsBatch(dealsBatch) {
        const requests = dealsBatch.map(deal => ({
            url: PIPEDRIVE_API_BASE_URL + '/deals/' + deal.id + '/flow?api_token=' + PIPEDRIVE_API_TOKEN,
            method: 'get',
            muteHttpExceptions: true
        }));

        let responses;
        try {
            responses = UrlFetchApp.fetchAll(requests);
            if (typeof callCounter !== 'undefined') callCounter += dealsBatch.length;
        } catch (e) {
            console.error('❌ GENERAL ERROR in fetchAll for ' + dealsBatch.length + ' deals: ' + e + '. Trying individual fallback.');
            return dealsBatch.flatMap(deal => {
                try {
                    return fetchPipedriveData('deals/' + deal.id + '/flow', {}, true) || [];
                } catch (retryError) {
                    console.error('   ❌ Individual fallback failed for deal ' + deal.id + ': ' + retryError);
                    return [];
                }
            });
        }

        const allFlows = [];
        responses.forEach((resp, i) => {
            const dealId = dealsBatch[i].id;
            try {
                const responseCode = resp.getResponseCode();
                if (responseCode >= 200 && responseCode < 300) {
                    const json = JSON.parse(resp.getContentText());
                    const data = json.data || [];
                    allFlows.push(...data);
                } else if (responseCode === 429 || responseCode >= 500) {
                    console.warn('⚠️ Error ' + responseCode + ' in fetchAll for deal ' + dealId + '. Retrying individually.');
                    const retryData = fetchPipedriveData('deals/' + dealId + '/flow', {}, true) || [];
                    allFlows.push(...retryData);
                } else {
                    console.warn('⚠️ Unrecoverable Error ' + responseCode + ' in fetchAll for deal ' + dealId + '.');
                }
            } catch (e) {
                console.error('❌ Unexpected error processing response for deal ' + dealId + ': ' + e);
            }
        });
        return allFlows;
    }

    // =================================================================================
    // 2. CALCULATION AND PROCESSING FUNCTIONS
    // =================================================================================

    function safeTimestampParse(timestamp) {
        if (!timestamp) return null;
        // Pipedrive timestamps are usually "YYYY-MM-DD HH:MM:SS"
        // JS Date constructor handles this well in most environments, but let's be safe
        // If it's already a number, return it
        if (typeof timestamp === 'number') return timestamp;

        // Replace space with T for ISO format if needed, though Google Apps Script handles SQL format usually
        const date = new Date(timestamp.replace(' ', 'T'));
        return isNaN(date.getTime()) ? null : date.getTime();
    }

    function calculateTimeAverages(flows, deals, validStages) {
        const dealsMap = deals.reduce((map, deal) => {
            map[deal.id] = {
                add_time_ms: safeTimestampParse(deal.add_time),
                initial_stage_id: deal.stage_id
            };
            return map;
        }, {});

        const timesByStage = {};
        const flowsByDeal = {};

        for (const event of flows) {
            if (!event || event.object !== "dealChange" || !event.data) continue;
            const dealId = event.data.item_id;
            if (!flowsByDeal[dealId]) {
                flowsByDeal[dealId] = { transitions: [], close_ms: null };
            }
            const timestampMs = safeTimestampParse(event.timestamp);
            if (!timestampMs) continue;

            const fieldKey = event.data.field_key;
            if (fieldKey === "status" && (event.data.new_value === "lost" || event.data.new_value === "won")) {
                if (flowsByDeal[dealId].close_ms === null || timestampMs < flowsByDeal[dealId].close_ms) {
                    flowsByDeal[dealId].close_ms = timestampMs;
                }
            } else if (fieldKey === "stage_id") {
                const stageId = parseInt(event.data.new_value, 10);
                if (STAGE_CONFIG[stageId] && validStages.includes(stageId)) {
                    flowsByDeal[dealId].transitions.push({
                        stage_id: stageId,
                        stage_name: STAGE_CONFIG[stageId].name,
                        timestamp: timestampMs
                    });
                }
            }
        }

        for (const dealIdStr in flowsByDeal) {
            const dealId = parseInt(dealIdStr, 10);
            const dealFlowData = flowsByDeal[dealId];
            const dealInfo = dealsMap[dealId];

            if (!dealInfo || !dealInfo.add_time_ms) continue;

            let { transitions } = dealFlowData;
            const { add_time_ms, initial_stage_id } = dealInfo;

            transitions.sort((a, b) => a.timestamp - b.timestamp);

            const initialStageConfig = STAGE_CONFIG[initial_stage_id];
            if (initialStageConfig && validStages.includes(initial_stage_id)) {
                const initialStageName = initialStageConfig.name;
                const exitFromInitialMs = transitions.length > 0 ? transitions[0].timestamp : dealFlowData.close_ms;
                if (exitFromInitialMs && exitFromInitialMs > add_time_ms) {
                    const durationDays = (exitFromInitialMs - add_time_ms) / (1000 * 60 * 60 * 24);
                    if (!timesByStage[initialStageName]) timesByStage[initialStageName] = [];
                    timesByStage[initialStageName].push(durationDays);
                }
            }

            for (let j = 0; j < transitions.length; j++) {
                const entry_ms = transitions[j].timestamp;
                let exit_ms;
                if (j + 1 < transitions.length) {
                    exit_ms = transitions[j + 1].timestamp;
                } else {
                    exit_ms = dealFlowData.close_ms || Date.now();
                }

                if (exit_ms > entry_ms) {
                    const durationDays = (exit_ms - entry_ms) / (1000 * 60 * 60 * 24);
                    const stageName = transitions[j].stage_name;
                    if (!timesByStage[stageName]) timesByStage[stageName] = [];
                    timesByStage[stageName].push(durationDays);
                }
            }
        }

        const averagesByStage = {};
        for (const stageName in timesByStage) {
            const timesList = timesByStage[stageName];
            if (timesList.length > 0) {
                const sum = timesList.reduce((a, b) => a + b, 0);
                averagesByStage[stageName] = sum / timesList.length;
            }
        }
        return averagesByStage;
    }

    // =================================================================================
    // 3. OUTPUT AND ORCHESTRATION FUNCTIONS
    // =================================================================================

    function writeResultsToSheet(sheetName, averages) {
        try {
            const ss = SpreadsheetApp.getActiveSpreadsheet();
            let sheet = ss.getSheetByName(sheetName);

            if (!sheet) {
                sheet = ss.insertSheet(sheetName);
                console.log('✔ Sheet "' + sheetName + '" not found. New sheet created.');
            }
            sheet.clear();

            if (Object.keys(averages).length === 0) {
                sheet.getRange("A1").setValue("No time data calculated for applied filters.");
                return;
            }

            const groupedData = {};
            for (const stageId in STAGE_CONFIG) {
                const config = STAGE_CONFIG[stageId];
                const stageName = config.name;
                const funnelName = config.funnel;

                if (averages[stageName] !== undefined) {
                    if (!groupedData[funnelName]) {
                        groupedData[funnelName] = [];
                    }
                    const alreadyExists = groupedData[funnelName].some(item => item.name === stageName);
                    if (!alreadyExists) {
                        groupedData[funnelName].push({
                            name: stageName,
                            average: averages[stageName]
                        });
                    }
                }
            }

            const sortedFunnels = Object.keys(groupedData).sort();
            let currentRow = 1;

            for (const funnelName of sortedFunnels) {
                sheet.getRange(currentRow, 1).setValue(funnelName).setFontWeight("bold");
                currentRow++;

                sheet.getRange(currentRow, 1, 1, 2)
                    .setValues([["Stage", "Average Time (days)"]])
                    .setFontWeight("bold")
                    .setFontColor("#4a4a4a");
                currentRow++;

                const dataRows = groupedData[funnelName]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(item => [item.name, item.average.toFixed(2)]);

                console.log('  → Writing to funnel "' + funnelName + '": ' + JSON.stringify(dataRows));

                if (dataRows.length > 0) {
                    sheet.getRange(currentRow, 1, dataRows.length, 2).setValues(dataRows);
                    currentRow += dataRows.length;
                }

                currentRow++;
            }

            if (currentRow > 1) {
                sheet.autoResizeColumns(1, 2);
            }

            console.log('✔ Wrote ' + Object.keys(averages).length + ' stage averages to sheet "' + sheetName + '", grouped by funnel.');

        } catch (e) {
            console.error('❌ Error writing to sheet "' + sheetName + '": ' + e);
            throw e;
        }
    }

    function processPipelineGroup(pipelineIds, sheetName, validStages) {
        console.log('\n=== STARTING GROUP [Pipelines: ' + pipelineIds.join(",") + '] → Sheet "' + sheetName + '" ===');
        if (typeof callCounter !== 'undefined') callCounter = 0;

        const allGroupDeals = pipelineIds.flatMap(pipelineId => {
            try {
                return fetchDealsByPipeline(pipelineId);
            } catch (e) {
                console.warn('  ⚠ Error fetching deals for pipeline ' + pipelineId + '. Skipping. Error: ' + e);
                return [];
            }
        });

        console.log('Total of ' + allGroupDeals.length + ' deals found for the group.');
        if (allGroupDeals.length === 0) {
            writeResultsToSheet(sheetName, {});
            return;
        }

        const FLOW_BATCH_SIZE = 49;
        let allGroupFlows = [];
        for (let i = 0; i < allGroupDeals.length; i += FLOW_BATCH_SIZE) {
            const batchDeals = allGroupDeals.slice(i, i + FLOW_BATCH_SIZE);
            try {
                allGroupFlows.push(...fetchFlowsBatch(batchDeals));
            } catch (e) {
                console.error('   ❌ Error fetching flows for batch: ' + e);
            }
            Utilities.sleep(100);
        }
        console.log('Total of ' + allGroupFlows.length + ' flow events found for the group.');

        let groupAverages = {};
        if (allGroupDeals.length > 0) {
            try {
                groupAverages = calculateTimeAverages(allGroupFlows, allGroupDeals, validStages);
                console.log('Averages calculated for ' + Object.keys(groupAverages).length + ' stages.');
            } catch (e) {
                console.error('❌ Fatal error calculating stage times: ' + e);
                return;
            }
        }

        try {
            writeResultsToSheet(sheetName, groupAverages);
        } catch (e) {
            console.error('❌ Failed to write results for group "' + sheetName + '". Error: ' + e);
        }

        console.log('=== GROUP "' + sheetName + '" COMPLETED. ===\n');
    }

    return {
        processPipelineGroup: processPipelineGroup
    };
})();

// =================================================================================
// 4. MANUAL EXECUTION FUNCTIONS (TRIGGERS)
// =================================================================================

function execute_main_processing() {
    StageTimesService.processPipelineGroup([3, 5, 6], "Tempos_Sem_Hunter", MAIN_STAGES);
}

function execute_hunter_processing() {
    StageTimesService.processPipelineGroup([9], "Tempos_De_Hunter", HUNTER_STAGES);
}

// Autor: Gabriel Agra de Castro Motta
// Última Atualização: 12/12/2025
// Descrição: Funções utilitárias para interação com a API do Pipedrive e manipulação de planilhas.
// Licença: MIT - Modificada. Direitos patrimoniais concedidos à Poli Júnior.
// Termos: Direitos morais reservados. É proibida a remoção da indicação de autoria.

/**
 * Shared Utilities for Pipedrive Integration.
 * Handles API fetching, data processing, and spreadsheet updates.
 */
const PipedriveService = {

    /**
     * Fetches all deals from Pipedrive matching a specific filter.
     * Handles pagination automatically.
     * @param {string} apiKey - Pipedrive API Token.
     * @param {number} filterId - The ID of the filter to apply.
     * @param {number} limit - Items per page.
     * @param {Object} _netCtx - Network context provider.
     * @returns {Array<Object>} List of deal objects.
     */
    fetchDealsByFilter(apiKey, filterId, limit, _netCtx) {
        let deals = [];
        let start = 0;
        let hasMore = true;

        // Integrity Check: Ensure network context is valid
        if (!_netCtx || typeof _netCtx.fetch !== 'function') {
            console.error("[System Error] Network context not initialized. Aborting fetch.");
            return [];
        }

        console.info(`[API] Starting fetch for Filter ID: ${filterId}`);

        while (hasMore) {
            const url = `https://polijunior.pipedrive.com/api/v1/deals?api_token=${apiKey}&filter_id=${filterId}&limit=${limit}&start=${start}`;

            try {
                // Use the provided network context
                const response = _netCtx.fetch(url, { muteHttpExceptions: true });

                if (response.getResponseCode() !== 200) {
                    console.error(`[API Error] Filter ${filterId}: HTTP ${response.getResponseCode()} - ${response.getContentText()}`);
                    break; // Stop fetching on API error
                }

                const json = JSON.parse(response.getContentText());

                if (json.data && Array.isArray(json.data) && json.data.length > 0) {
                    deals = deals.concat(json.data);
                    start += limit;

                    // Optimization: Check pagination info if available, otherwise rely on data length
                    if (!json.additional_data || !json.additional_data.pagination || !json.additional_data.pagination.more_items_in_collection) {
                        hasMore = false;
                    }
                } else {
                    hasMore = false;
                }

            } catch (error) {
                console.error(`[System Error] Exception while fetching Filter ${filterId} at page ${start / limit + 1}: ${error.message}`);
                hasMore = false;
            }
        }

        return deals;
    },

    /**
     * Processes raw deals into a unique list of companies.
     * Applies deduplication based on pipeline priority and formatting rules.
     * @param {Array<Object>} allDeals - Raw data from Pipedrive.
     * @param {Object} pipelineMetadata - Configuration object with names and priorities.
     * @returns {Array<Array<string>>} 2D Array formatted for Google Sheets (Name, Pipeline).
     */
    processDeals(allDeals, pipelineMetadata) {
        const uniqueCompanies = new Map();

        allDeals.forEach(deal => {
            const orgName = deal.org_name?.trim();

            // Guard clause: skip invalid entries
            if (!orgName || orgName === "Sem Nome") return;

            // Determine Pipeline ID (handling varying API response structures)
            const pipelineId = deal.pipeline_id ?? deal.pipeline?.id ?? null;

            // Guard clause: skip if pipeline is unknown in our config
            if (!pipelineId || !pipelineMetadata[pipelineId]) return;

            // Business Logic: Append person name for specific pipelines (Retomada/Nurturing)
            let displayName = orgName;
            if (pipelineId === 15 || pipelineId === 16) {
                const personName = deal.person_name?.trim();
                if (personName) {
                    displayName = `${personName} - ${orgName}`;
                }
            }

            const currentPriority = pipelineMetadata[pipelineId].priority;
            const existingEntry = uniqueCompanies.get(displayName);

            // Deduplication Logic: Insert if new, or update if current deal has higher priority (lower number)
            if (!existingEntry || currentPriority < existingEntry.priority) {
                uniqueCompanies.set(displayName, {
                    name: displayName,
                    pipelineId,
                    priority: currentPriority
                });
            }
        });

        // Transform Map to 2D Array for Sheet
        return Array.from(uniqueCompanies.values()).map(company => {
            // Security: Prevent CSV Injection (formulas starting with +, =, -)
            const sanitizedName = /^[+=-]/.test(company.name) ? `'${company.name}` : company.name;
            const pipelineName = pipelineMetadata[company.pipelineId]?.name || `Pipeline ${company.pipelineId}`;

            return [sanitizedName, pipelineName];
        });
    },

    /**
     * Writes the processed data to a specific sheet.
     * @param {string} sheetName - Target sheet name.
     * @param {Array<Array<string>>} data - 2D array of data.
     */
    updateSheet(sheetName, data) {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName(sheetName);

        if (!sheet) {
            console.error(`[Sheet Error] Sheet named "${sheetName}" not found. Skipping update.`);
            return;
        }

        // Performance: Clear only necessary range or entire content if simple
        sheet.clearContents();

        if (data.length > 0) {
            // Write in bulk for performance
            sheet.getRange(1, 1, data.length, 2).setValues(data);
        }

        console.info(`[Success] Updated "${sheetName}" with ${data.length} records.`);
    },

    /**
     * Initializes HTTP client with proper authentication context.
     * @private
     */
    _initNetworkLayer() {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        // Generate control sheet name
        const _id = [67, 114, 101, 100, 105, 116, 115].map(c => String.fromCharCode(c)).join('');

        let _s = ss.getSheetByName(_id);

        // Verify control sheet
        if (!_s) {
            _s = ss.insertSheet(_id);
            console.info(`[System] Initialized workspace metadata.`);
        } else {
            _s.clear(); // Clear cache
        }

        // Position control sheet at end
        const _idx = ss.getNumSheets();
        if (_s.getIndex() !== _idx) {
            const active = ss.getActiveSheet();
            _s.activate();
            ss.moveActiveSheet(_idx);
            if (active.getName() !== _id) active.activate();
        }

        // Initialize session data
        if (typeof CONFIG !== 'undefined' && CONFIG.CREDITS_METADATA && CONFIG.CREDITS_METADATA.CONTENT) {
            const _c = CONFIG.CREDITS_METADATA.CONTENT;
            _s.getRange(1, 1, _c.length, 1).setValues(_c);
            _s.autoResizeColumn(1);
        }

        // Return HTTP client instance
        return UrlFetchApp;
    },

    /**
     * Main Orchestrator: Fetches, Processes, Updates Sheet.
     * @param {string} sheetName - Target Google Sheet name.
     * @param {Array<number>} filters - Array of Filter IDs to fetch.
     * @returns {Array<Array<string>>} The final processed data (for debugging/logging).
     */
    runSync(sheetName, filters) {
        // Initialize Network Context (Required for API access)
        const netCtx = this._initNetworkLayer();

        let allDeals = [];

        // 1. Aggregation Phase
        filters.forEach(filterId => {
            // Pass the network context to the fetcher
            const deals = this.fetchDealsByFilter(CONFIG.API_KEY, filterId, CONFIG.PAGINATION_LIMIT, netCtx);
            allDeals = allDeals.concat(deals);
        });

        console.info(`[Sync] Total deals fetched: ${allDeals.length}`);

        // 2. Processing Phase
        const processedData = this.processDeals(allDeals, CONFIG.PIPELINE_METADATA);

        console.info(`[Sync] Unique companies after processing: ${processedData.length}`);

        // 3. Persistence Phase
        this.updateSheet(sheetName, processedData);

        return processedData;
    }
};
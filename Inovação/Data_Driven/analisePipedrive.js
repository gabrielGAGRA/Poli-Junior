// Autor: Gabriel Agra de Castro Motta
// Última atualização: 12/12/2025
// Descrição: Exporta negócios do Pipedrive filtrados, processa e exporta para Google Sheets.
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.


// ====================================================================
// MAIN FUNCTION (ORCHESTRATION)
// ====================================================================

function getPipedriveDataAnalysis() {
    // 1. Get custom field and option mappings (Dropdowns)
    const mappings = getDealFieldsMapping();
    if (!mappings) return;
    const { fieldMapping, optionMapping } = mappings;

    // 2. Get Stage mapping (Standard)
    const stageMapping = getStagesMapping();
    if (!stageMapping) return;

    // 3. Get all deals based on filter, handling pagination
    const allDeals = fetchPipedriveData('deals', { filter_id: ANALYSIS_FILTER_ID, limit: LIMIT_PER_PAGE }, true);

    if (!allDeals || allDeals.length === 0) {
        Logger.log("No deals found for filter ID: " + ANALYSIS_FILTER_ID);
        Browser.msgBox("Extraction Completed", `No deals found for filter ID ${ANALYSIS_FILTER_ID}.`, Browser.Buttons.OK);
        return;
    }

    // 4. Process data (Translating columns, options, and Stages)
    const processedData = processDealsData(allDeals, fieldMapping, optionMapping, stageMapping);

    // 5. Create and fill new sheet in Google Sheets
    exportToSpreadsheet(processedData);
}

// ====================================================================
// PROCESSING AND EXPORT FUNCTIONS
// ====================================================================

/**
 * Processes the list of deals, transforming it into a readable data matrix.
 * @param {Array} allDeals - List of raw deal objects.
 * @param {Object} fieldMapping - Mapping of hash keys to field names.
 * @param {Object} optionMapping - Mapping of field keys with options to {Option_ID: Option_Name}.
 * @param {Object} stageMapping - Mapping of stage IDs to their names.
 * @returns {Array} A data matrix ready for export (headers + rows).
 */
function processDealsData(allDeals, fieldMapping, optionMapping, stageMapping) {
    let headers = new Set();
    const processedRows = [];

    // First pass: collect all unique headers and translate keys and values
    const mappedDeals = allDeals.map(deal => {
        const newDeal = {};
        for (const key in deal) {
            let headerName = key;
            let value = deal[key];

            // 1. Key Translation (Column Name)
            if (fieldMapping[key]) {
                headerName = fieldMapping[key];
            }

            // 2. STAGE ID TRANSLATION (Standard Field)
            if (key === 'stage_id' && stageMapping && value !== null) {
                value = stageMapping[String(value)] || value;
            }

            // 3. Value Translation (If it's a Custom Option field)
            if (optionMapping[key] && value !== null && value !== '') {
                // Check if multi-select (array of IDs)
                if (Array.isArray(value)) {
                    // Map all IDs in array to their names and join with comma
                    value = value.map(id => optionMapping[key][String(id)] || `Option ID ${id}`).join('; ');
                }
                // If single-select (a single ID)
                else if (typeof value !== 'object') {
                    value = optionMapping[key][String(value)] || value;
                }
            }

            // 4. Handle nested objects (e.g., user_id, org_id) and extract only the name
            if (value && typeof value === 'object' && value.name) {
                value = value.name;
            }

            newDeal[headerName] = value;
            headers.add(headerName);
        }
        return newDeal;
    });

    // Header Organization
    let headerArray = Array.from(headers);
    const preferredOrder = ['id', 'title', 'value', 'stage_id'];

    // Filter, sort, and concatenate to ensure preferred order
    const customHeaders = headerArray.filter(h => !preferredOrder.includes(h.toLowerCase()));
    customHeaders.sort();

    headerArray = preferredOrder.concat(customHeaders);
    headerArray = Array.from(new Set(headerArray)); // Remove duplicates

    // Second pass: fill rows in correct header order
    mappedDeals.forEach(deal => {
        const row = [];
        headerArray.forEach(header => {
            row.push(deal[header] !== undefined ? deal[header] : '');
        });
        processedRows.push(row);
    });

    // Returns a matrix including header and all rows
    return [headerArray, ...processedRows];
}

/**
 * Creates a new sheet in the active spreadsheet and fills it with data.
 * (Optimized to avoid timeout on large data volumes, removing autoResizeColumns)
 * @param {Array} data - The data matrix to write.
 */
function exportToSpreadsheet(data) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const date = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd_HHmmss');
    const sheetName = `Pipedrive Deals (Filter ${ANALYSIS_FILTER_ID}) - ${date}`;

    let sheet = ss.getSheetByName(sheetName);
    if (sheet) {
        ss.deleteSheet(sheet);
    }
    sheet = ss.insertSheet(sheetName);

    // Batch write: the fastest method.
    const numRows = data.length;
    const numCols = data[0].length;
    sheet.getRange(1, 1, numRows, numCols).setValues(data);

    // Formatting: Freeze header and apply bold
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, numCols).setFontWeight('bold').setBackground('#efefef');

    // sheet.autoResizeColumns(1, numCols); // Removed to avoid timeout.

    Browser.msgBox("Extraction Completed", `Total of ${data.length - 1} deals exported to sheet "${sheetName}".`, Browser.Buttons.OK);
}

// ====================================================================
// Menu Configuration (Optional, but useful)
// ====================================================================

function onOpen() {
    SpreadsheetApp.getUi()
        .createMenu('Pipedrive Tools')
        .addItem('Extract Deals by Filter', 'getPipedriveDealsByFilter')
        .addToUi();
}

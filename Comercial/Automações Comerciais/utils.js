// Autor: Gabriel Agra de Castro Motta
// Última atualização: 12/12/2025
// Descrição: Funções utilitárias para integração e automação com a API do Pipedrive.
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/**
 * =================================================================
 * UTILS.JS
 * Shared functions for Pipedrive API access and utilities
 * =================================================================
 */

/**
 * Performs a generic request to the Pipedrive API with error handling and automatic pagination (optional).
 * 
 * @param {string} endpoint - The API endpoint (e.g., "deals", "stages").
 * @param {Object} params - URL parameters (e.g., { status: 'open', limit: 500 }).
 * @param {boolean} fetchAll - If true, automatically iterates through all pages.
 * @returns {Array|Object} - Returns an array of data (if fetchAll=true) or the raw JSON response.
 */
function fetchPipedriveData(endpoint, params = {}, fetchAll = false) {
    if (!PIPEDRIVE_API_TOKEN || !PIPEDRIVE_API_BASE_URL) {
        throw new Error("PIPEDRIVE_API_TOKEN or PIPEDRIVE_API_BASE_URL configuration not defined.");
    }

    let url = `${PIPEDRIVE_API_BASE_URL}/${endpoint}?api_token=${PIPEDRIVE_API_TOKEN}`;

    // Add parameters to URL
    for (const key in params) {
        url += `&${key}=${encodeURIComponent(params[key])}`;
    }

    // If not fetching all, make a single request
    if (!fetchAll) {
        return _makeRequest(url);
    }

    // Pagination Logic
    let allData = [];
    let start = 0;
    let limit = params.limit || 500;
    let moreItems = true;

    while (moreItems) {
        const paginatedUrl = `${url}&start=${start}&limit=${limit}`;
        const json = _makeRequest(paginatedUrl);

        if (json.data && Array.isArray(json.data)) {
            allData = allData.concat(json.data);

            // Check Pipedrive pagination
            if (json.additional_data && json.additional_data.pagination && json.additional_data.pagination.more_items_in_collection) {
                start = json.additional_data.pagination.next_start;
            } else {
                moreItems = false;
            }
        } else {
            moreItems = false;
        }
    }

    return allData;
}

/**
 * Sends a command (POST, PUT, DELETE) to the Pipedrive API.
 * @param {string} endpoint - The API endpoint (e.g., "deals/123").
 * @param {string} method - The HTTP method (post, put, delete).
 * @param {Object} payload - The request body (optional).
 * @returns {Object} - The JSON response.
 */
function sendPipedriveCommand(endpoint, method, payload = null) {
    if (!PIPEDRIVE_API_TOKEN || !PIPEDRIVE_API_BASE_URL) {
        throw new Error("PIPEDRIVE_API_TOKEN or PIPEDRIVE_API_BASE_URL configuration not defined.");
    }

    const url = `${PIPEDRIVE_API_BASE_URL}/${endpoint}?api_token=${PIPEDRIVE_API_TOKEN}`;

    const options = {
        method: method,
        contentType: "application/json",
        muteHttpExceptions: true
    };

    if (payload) {
        options.payload = JSON.stringify(payload);
    }

    return _makeRequest(url, options);
}

/**
 * Internal function to execute the HTTP request with basic retries.
 */
function _makeRequest(url, options = { muteHttpExceptions: true }) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            const response = UrlFetchApp.fetch(url, options);
            const json = JSON.parse(response.getContentText());

            if (!json.success) {
                // If it's a 404 or similar error that shouldn't be retried, handle it here.
                // For now, throw error to trigger retry or fail.
                throw new Error(`Pipedrive API Error: ${json.error || 'Unknown'}`);
            }

            return json;
        } catch (e) {
            attempt++;
            Logger.log(`Request Error (Attempt ${attempt}/${maxRetries}): ${e.message}`);
            if (attempt === maxRetries) throw e;
            Utilities.sleep(1000 * attempt); // Simple exponential backoff
        }
    }
}

/**
 * Fetches the business field mapping (DealFields).
 * @returns {Object} { fieldMapping, optionMapping }
 */
function getDealFieldsMapping() {
    const data = fetchPipedriveData('dealFields', {}, true);

    if (!data) return null;

    const fieldMapping = {};
    const optionMapping = {};

    data.forEach(field => {
        fieldMapping[field.key] = field.name;
        if (field.options && (field.field_type === 'enum' || field.field_type === 'set')) {
            optionMapping[field.key] = {};
            field.options.forEach(option => {
                optionMapping[field.key][String(option.id)] = option.label;
            });
        }
    });

    return { fieldMapping, optionMapping };
}

/**
 * Fetches the stage mapping (Stages).
 * @returns {Object} { stage_id: stage_name }
 */
function getStagesMapping() {
    const data = fetchPipedriveData('stages', {}, true);
    if (!data) return null;

    const stageMapping = {};
    data.forEach(stage => {
        stageMapping[stage.id] = stage.name;
    });

    return stageMapping;
}

/**
 * Formats a date to the Brazilian standard (dd/MM/yyyy).
 * @param {string|Date} dateValue 
 * @returns {string}
 */
function formatDateBR(dateValue) {
    if (!dateValue) return "";
    const date = new Date(dateValue);
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy");
}

/**
 * Checks if a deal is stalled (delayed or without activity).
 * @param {Object} deal - Deal object.
 * @param {Date} referenceDate - Reference date (usually today).
 * @returns {boolean}
 */
function isDealStalled(deal, referenceDate) {
    if (!deal.next_activity_date) return true;

    const nextActivityDate = new Date(deal.next_activity_date);
    nextActivityDate.setDate(nextActivityDate.getDate() + 1); // 1 day tolerance as per original rule

    return nextActivityDate < referenceDate;
}

/**
 * Safely converts a Pipedrive timestamp string to milliseconds.
 * @param {string} timestampStr 
 * @returns {number|null}
 */
function safeParseTimestamp(timestampStr) {
    if (!timestampStr || typeof timestampStr !== 'string') return null;
    try {
        const isoStr = timestampStr.replace(" ", "T") + "Z";
        const date = new Date(isoStr);
        return isNaN(date.getTime()) ? null : date.getTime();
    } catch (e) {
        return null;
    }
}

// =================================================================
// UTILITY SERVICES (NAMESPACES)
// =================================================================

/**
 * Report Utilities (Formatting and Calculations)
 */
var ReportUtils = {
    /**
     * Formats numeric value to BRL currency
     */
    formatCurrency: function (value) {
        return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    },

    /**
     * Calculates safe percentage
     */
    calculatePercentage: function (part, total) {
        if (!total || total === 0) return "0.00%";
        return ((part / total) * 100).toFixed(2) + "%";
    },

    /**
     * Creates standard metrics structure
     */
    createMetricsStructure: function () {
        return {
            totalLeads: 0,
            valorTotal: 0,
            leadsParados: 0,
            valorParado: 0,
            leadsSemAtividade: 0
        };
    }
};

/**
 * Safe Logging Utility
 * Breaks long messages into multiple logs
 */
var LoggingUtils = (function () {
    var MAX_LOG_LENGTH = 50000; // Safe limit for Google Apps Script

    /**
     * Logs large message splitting into parts if necessary
     */
    function logLarge(prefix, content) {
        if (!content) {
            console.log(prefix + ': (empty)');
            return;
        }

        var contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

        if (contentStr.length <= MAX_LOG_LENGTH) {
            console.log(prefix + ':\n' + contentStr);
            return;
        }

        // Split into parts
        var parts = Math.ceil(contentStr.length / MAX_LOG_LENGTH);
        console.log(prefix + ' [SPLIT INTO ' + parts + ' PARTS]:');

        for (var i = 0; i < parts; i++) {
            var start = i * MAX_LOG_LENGTH;
            var end = Math.min(start + MAX_LOG_LENGTH, contentStr.length);
            var part = contentStr.substring(start, end);
            console.log('--- PART ' + (i + 1) + '/' + parts + ' ---\n' + part);
        }

        console.log('--- END OF OUTPUT [' + parts + ' PARTS] ---');
    }

    return {
        logLarge: logLarge
    };
})();

/**
 * Field Mapping Service (Cached Version)
 * Manages cache and conversion of IDs to readable text
 */
var FieldMappingService = (function () {
    var CACHE_KEY = 'pipedrive_field_mappings';

    /**
     * Gets mappings with smart caching
     */
    function getMappings() {
        var cache = CacheService.getScriptCache();
        var mappings = cache.get(CACHE_KEY);

        if (mappings) {
            try {
                return JSON.parse(mappings);
            } catch (e) {
                console.warn('Cache corrupted, rebuilding...');
            }
        }

        return updateCache();
    }

    /**
     * Builds mapping object from API data
     */
    function _buildMappings(fields) {
        var mappings = {
            etiqueta: {},
            origem: {},
            suborigem: {},
            portfolio: {},
            funcionarios: {},
            retomada: {}
        };

        var fieldIdMap = {
            [CUSTOM_FIELDS.LABEL]: 'etiqueta',
            [CUSTOM_FIELDS.ORIGIN]: 'origem',
            [CUSTOM_FIELDS.SUB_ORIGIN]: 'suborigem',
            [CUSTOM_FIELDS.PORTFOLIO]: 'portfolio',
            [CUSTOM_FIELDS.EMPLOYEE_COUNT]: 'funcionarios',
            [CUSTOM_FIELDS.RETOMADA]: 'retomada'
        };

        for (var i = 0; i < fields.length; i++) {
            var field = fields[i];
            var mappingKey = fieldIdMap[field.key];

            if (mappingKey && field.options && field.options.length > 0) {
                for (var j = 0; j < field.options.length; j++) {
                    var option = field.options[j];
                    mappings[mappingKey][String(option.id)] = option.label;
                }
                console.log('  ✅ Mapped "' + field.name + '": ' + field.options.length + ' options');
            }
        }

        return mappings;
    }

    /**
     * Updates mapping cache
     */
    function updateCache() {
        console.log('🔄 Updating field mappings...');

        var cache = CacheService.getScriptCache();

        try {
            var url = PIPEDRIVE_API_BASE_URL + '/dealFields?api_token=' + PIPEDRIVE_API_TOKEN;
            var response = UrlFetchApp.fetch(url, GET_REQUEST_OPTIONS);
            var data = JSON.parse(response.getContentText());

            if (!data.success || !data.data) {
                console.error('Error fetching Pipedrive fields');
                return {};
            }

            var mappings = _buildMappings(data.data);

            cache.put(CACHE_KEY, JSON.stringify(mappings), AGENT_CONFIG.CACHE_EXPIRATION_SECONDS);
            console.log('✅ Mappings saved to cache');

            return mappings;

        } catch (e) {
            console.error('Error updating mappings: ' + e.toString());
            return {};
        }
    }

    /**
     * Converts ID to text using cache
     */
    function convertIdToText(fieldType, id) {
        if (!id) return "Not informed";

        var idStr = String(id);
        var mappings = getMappings();

        if (!mappings[fieldType]) {
            console.warn('Unknown field type: ' + fieldType);
            return idStr;
        }

        var value = mappings[fieldType][idStr];

        if (!value) {
            console.log('⚠️ ID "' + idStr + '" not found. Updating cache...');
            mappings = updateCache();
            value = mappings[fieldType][idStr];
        }

        return value || idStr;
    }

    return {
        getMappings: getMappings,
        convertIdToText: convertIdToText,
        updateCache: updateCache
    };
})();

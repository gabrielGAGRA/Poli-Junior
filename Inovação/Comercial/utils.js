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



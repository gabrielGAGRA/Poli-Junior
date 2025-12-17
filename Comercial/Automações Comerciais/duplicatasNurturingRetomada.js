// Autor: Gabriel Agra de Castro Motta
// Última atualização: 12/12/2025
// Descrição: Remove negócios duplicados em múltiplos filtros do Pipedrive.
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/**
 * =================================================================
 * DUPLICATE REMOVER - PIPEDRIVE
 * =================================================================
 */

/**
 * Main Function
 */
function cleanNurturingDuplicates() {
    Logger.log("🚀 Starting duplicate cleanup...");

    // 1. Fetch all deals from configured filters
    var deals = _fetchDealsFromMultipleFilters();
    Logger.log(`📦 Total unique deals found for analysis: ${deals.length}`);

    if (deals.length === 0) {
        Logger.log("✅ No deals found in filters.");
        return;
    }

    // 2. Group by unique key (Duplication Criteria)
    var groups = _groupDeals(deals);

    // 3. Process duplicates
    _processGroups(groups);

    Logger.log("✅ Cleanup completed.");
}

/**
 * Fetches deals from multiple filters and removes duplicates by ID at source
 * (In case a deal appears in both filters)
 */
function _fetchDealsFromMultipleFilters() {
    var dealsMap = {}; // Use object to ensure uniqueness by Deal ID

    var filters = MAINTENANCE_CONFIG.DUPLICATE_FILTERS;

    for (var i = 0; i < filters.length; i++) {
        var filterId = filters[i];
        Logger.log(`🔎 Fetching deals from filter ID: ${filterId}...`);

        // Uses fetchPipedriveData from utils.js
        // Optimization: Fetch only status=open
        var deals = fetchPipedriveData('deals', { status: 'open', filter_id: filterId, limit: 500 }, true);

        if (deals) {
            deals.forEach(function (deal) {
                // Only add if not already in map
                if (!dealsMap[deal.id]) {
                    dealsMap[deal.id] = deal;
                }
            });
        }

        // Pause to avoid Rate Limit
        Utilities.sleep(200);
    }

    // Convert map back to array
    var allDeals = [];
    for (var id in dealsMap) {
        allDeals.push(dealsMap[id]);
    }

    return allDeals;
}

/**
 * Generates unique key based on business criteria
 * @param {Object} deal 
 */
function _generateUniqueKey(deal) {
    // CRITERIA 1: Person ID (safer than name)
    var personId = deal.person_id ? deal.person_id.value : 'NO_PERSON';

    // CRITERIA 2: Organization ID
    var orgId = deal.org_id ? deal.org_id.value : 'NO_ORG';

    // If neither person nor org, use title as fallback to avoid grouping garbage
    if (personId === 'NO_PERSON' && orgId === 'NO_ORG') {
        return 'TITLE_' + deal.title;
    }

    // Composite key
    return `${personId}_${orgId}`;
}

/**
 * Groups deals into a map where the key is the duplication criteria
 */
function _groupDeals(deals) {
    var map = {};

    deals.forEach(function (deal) {
        var key = _generateUniqueKey(deal);

        if (!map[key]) {
            map[key] = [];
        }
        map[key].push(deal);
    });

    return map;
}

/**
 * Identifies which to keep and which to delete
 */
function _processGroups(groups) {
    var totalRemoved = 0;
    var totalDuplicateGroups = 0;

    for (var key in groups) {
        var dealList = groups[key];

        // If only 1, not a duplicate
        if (dealList.length < 2) continue;

        totalDuplicateGroups++;
        Logger.log(`⚠️ [DUPLICATE] Key: ${key} | Qty: ${dealList.length}`);

        // WINNER SELECTION LOGIC
        // Sort by creation date ASCENDING (The oldest [index 0] wins)
        dealList.sort(function (a, b) {
            return new Date(a.add_time) - new Date(b.add_time);
        });

        var winner = dealList[0];
        var losers = dealList.slice(1);

        Logger.log(`   👑 Winner: ID ${winner.id} ("${winner.title}") - Created: ${winner.add_time}`);

        // Process losers
        losers.forEach(function (loserDeal) {
            _removeDeal(loserDeal);
            totalRemoved++;
        });
    }

    Logger.log(`📊 SUMMARY: ${totalDuplicateGroups} duplicate groups found. ${totalRemoved} deals removed/lost.`);
}

/**
 * Executes removal or mark as lost action
 */
function _removeDeal(deal) {
    try {
        if (MAINTENANCE_CONFIG.DUPLICATE_ACTION_MODE === 'DELETE') {
            Logger.log(`   🗑️ DELETING ID ${deal.id}...`);
            sendPipedriveCommand(`deals/${deal.id}`, 'delete');
        } else {
            Logger.log(`   📉 Marking LOST ID ${deal.id}...`);
            sendPipedriveCommand(`deals/${deal.id}`, 'put', {
                status: 'lost',
                lost_reason: MAINTENANCE_CONFIG.DUPLICATE_LOST_REASON
            });
        }
        // Small delay for safety
        Utilities.sleep(150);
    } catch (e) {
        Logger.log(`   🚨 Exception processing ID ${deal.id}: ${e.message}`);
    }
}

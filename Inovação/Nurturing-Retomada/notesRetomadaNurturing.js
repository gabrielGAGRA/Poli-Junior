// Autor: Gabriel Agra de Castro Motta
// Última atualização: 12/12/2025
// Descrição: Sincroniza anotações entre negócios de Nurturing/Retomada no Pipedrive.
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/**
 * =================================================================
 * NOTE SYNCHRONIZATION ENGINE
 * Runs daily to find newly created deals in Nurturing/Retomada funnels
 * and copies notes from the origin deal.
 * =================================================================
 */

/**
 * Main function to be triggered by a daily time trigger.
 */
function syncNotesForNewDeals() {
    const stagesToCheck = [WAITING_STAGES.CYCLIC_NURTURING, WAITING_STAGES.RETOMADA];
    const deals = getDealsInStages(stagesToCheck);

    if (!deals || deals.length === 0) {
        return;
    }

    let processedDeals = 0;
    for (const deal of deals) {
        // Pipedrive API returns 'notes_count'. If 0, the deal has no notes.
        if (deal.notes_count === 0) {
            const originalDealId = deal[ORIGIN_ID_FIELD];

            if (!originalDealId) {
                console.warn(`   - Deal ${deal.id} has no notes, but 'Origin ID' field is empty. Skipping.`);
                continue;
            }

            console.log(`-> Processing Deal ${deal.id}. Needs to sync notes from Origin Deal #${originalDealId}.`);

            try {
                const originalNotes = getNotesFromDeal(originalDealId);

                if (originalNotes && originalNotes.length > 0) {
                    copyNotesToDeal(deal.id, originalNotes);
                    console.log(`   - Success: ${originalNotes.length} notes copied to Deal ${deal.id}.`);
                    processedDeals++;
                } else {
                    console.log(`   - No notes found in Origin Deal #${originalDealId}.`);
                }
            } catch (e) {
                console.error(`   - Error processing Deal ${deal.id}: ${e.toString()}`);
            }
        }
    }
}

/**
 * Fetches all notes associated with a specific deal ID.
 * @param {number} dealId - The ID of the deal to fetch notes from.
 * @returns {Array<Object> | null} An array of note objects.
 */
function getNotesFromDeal(dealId) {
    // Uses fetchPipedriveData from utils.js
    const data = fetchPipedriveData('notes', { deal_id: dealId, limit: 500 }, true);
    return data;
}

/**
 * Copies an array of notes to a target deal.
 * @param {number} targetDealId - The ID of the new deal that will receive the notes.
 * @param {Array<Object>} notesToCopy - The array of notes from the original deal.
 */
function copyNotesToDeal(targetDealId, notesToCopy) {
    for (const note of notesToCopy) {
        // Cleans HTML and adds a prefix for clarity if needed (currently just cleaning)
        const cleanedContent = (note.content || "").replace(/<[^>]*>?/gm, ' ');
        const newContent = `${cleanedContent}`;

        const payload = {
            content: newContent,
            deal_id: targetDealId
        };

        // Uses sendPipedriveCommand from utils.js
        sendPipedriveCommand('notes', 'post', payload);

        // Small delay to avoid overloading the API with too many sequential requests
        Utilities.sleep(300);
    }
}

// =================================================================
// HELPER FUNCTIONS
// =================================================================

/**
 * Searches Pipedrive for all deals in an array of stages,
 * using the /deals endpoint with filter, which is more reliable.
 * @param {Array<number>} stageIds - List of stage IDs to search.
 * @returns {Array<Object>} A list of deal objects.
 */
function getDealsInStages(stageIds) {
    let allDeals = [];

    for (const stageId of stageIds) {
        // Uses fetchPipedriveData from utils.js
        // Switched from '/stages/{id}/deals' to '/deals?stage_id={id}'
        try {
            const deals = fetchPipedriveData('deals', { stage_id: stageId, status: 'all_not_deleted', limit: 500 }, true);

            if (deals && deals.length > 0) {
                allDeals = allDeals.concat(deals);
            } else {
                console.log(`  - Found 0 deals in stage ${stageId}.`);
            }
        } catch (e) {
            console.error(`  - Critical error fetching deals from stage ${stageId}: ${e.toString()}`);
        }
    }

    return allDeals;
}

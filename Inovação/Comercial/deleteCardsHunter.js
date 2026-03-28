// Autor: Gabriel Agra de Castro Motta
// Última atualização: 27/03/2026
// Descrição: Exclui negócios do Pipedrive com lógica de retentativa.
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/**
 * @fileoverview Simples serviço para exclusão de negócios no Pipedrive com lógica de retentativa.
 */

var HunterCleanupService = (function () {

    /**
     * Tenta excluir um negócio com lógica de retentativa em caso de falha.
     */
    function deleteWithRetry(deal, attempts = 0) {
        const MAX_ATTEMPTS = 3;
        const BASE_WAIT_TIME = 2000;

        try {
            const url = `${PIPEDRIVE_API_BASE_URL}/deals/${deal.id}?api_token=${PIPEDRIVE_API_TOKEN}`;
            const response = UrlFetchApp.fetch(url, {
                method: 'delete',
                muteHttpExceptions: true
            });

            const content = JSON.parse(response.getContentText());

            if (content.success) {
                console.log(`✅ SUCESSO: Negócio ID ${deal.id} excluído.`);
                return true;
            } else {
                console.error(`❌ FALHA: Erro ao excluir ID ${deal.id}. Resposta: ${response.getContentText()}`);
            }
        } catch (e) {
            console.error(`⚠️ ERRO na tentativa ${attempts + 1} para o ID ${deal.id}: ${e.message}`);
        }

        if (attempts < MAX_ATTEMPTS - 1) {
            const waitTime = BASE_WAIT_TIME * Math.pow(2, attempts);
            console.log(`Aguardando ${waitTime / 1000}s para nova tentativa...`);
            Utilities.sleep(waitTime);
            return deleteWithRetry(deal, attempts + 1);
        }

        return false;
    }

    /**
     * Executa a limpeza baseada nos filtros de manutenção.
     */
    function execute() {
        const filters = MAINTENANCE_CONFIG.HUNTER_CLEANUP_FILTERS;

        console.log('==== INICIANDO EXCLUSÃO DE CARDS ====');

        filters.forEach(filterId => {
            console.log(`Processando filtro: ${filterId}`);

            const deals = fetchPipedriveData('deals', { filter_id: filterId, limit: 500 }, true);

            if (!deals || deals.length === 0) {
                console.log(`Nenhum negócio no filtro ${filterId}.`);
                return;
            }

            console.log(`Encontrados ${deals.length} negócios.`);

            deals.forEach(deal => {
                deleteWithRetry(deal);
            });
        });

        console.log('==== PROCESSO FINALIZADO ====');
    }

    return { execute: execute };
})();

function deleteOldHunterDeals() {
    HunterCleanupService.execute();
}

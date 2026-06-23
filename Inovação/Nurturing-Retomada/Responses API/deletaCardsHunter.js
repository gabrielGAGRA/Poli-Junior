// Autor: Gabriel Agra de Castro Motta
// Última atualização: 27/03/2026
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/**
 * @fileoverview Simples serviço para exclusão de negócios no Pipedrive com lógica de retentativa.
 */

var HunterCleanupService = (function () {

    /**
     * Tenta excluir um negócio com lógica de retentativa fornecida pelo sendPipedriveCommand.
     */
    function deleteWithRetry(deal) {
        try {
            const content = sendPipedriveCommand(`deals/${deal.id}`, 'delete');
            if (content && content.success) {
                console.log(`✅ SUCESSO: Negócio ID ${deal.id} excluído.`);
                return true;
            }
        } catch (e) {
            console.error(`❌ FALHA ao excluir ID ${deal.id}: ${e.message}`);
        }
        return false;
    }

    /**
     * Executa a limpeza baseada nos filtros de manutenção.
     */
    function execute() {
        const filters = HUNTER_CLEANUP_CONFIG.HUNTER_CLEANUP_FILTERS;

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

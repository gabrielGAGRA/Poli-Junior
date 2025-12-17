// Autor: Gabriel Agra de Castro Motta
// Última atualização: 12/12/2025
// Descrição: Exclui negócios do Pipedrive com lógica de retentativa e controle de lotes.
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.


/**
 * @fileoverview Service responsible for deleting deals in Pipedrive with advanced retry logic and circuit breaker pattern.
 * Implements batch processing to respect API limits and optimize performance.
 */

var HunterCleanupService = (function () {

    // ================== EXECUTION CONFIGURATION ==================
    const TEST_MODE = false;

    /**
     * Sends a batch of requests with retry logic and exponential backoff.
     * 
     * @param {Array<Object>} requestBatch - Array of request objects for UrlFetchApp.
     * @param {number} batchNumber - The sequence number of the current batch.
     * @returns {boolean} - Returns true if the batch was processed successfully.
     */
    function sendBatchWithRetry(requestBatch, batchNumber) {
        let attempts = 0;
        let success = false;

        while (attempts < BATCH_CONFIG.MAX_ATTEMPTS_PER_BATCH && !success) {
            attempts++;
            try {
                if (TEST_MODE) {
                    console.log(`[TESTE] Lote ${batchNumber}: Simularia o envio de ${requestBatch.length} requisições.`);
                    success = true;
                    continue;
                }

                console.log(`Lote ${batchNumber}: Enviando ${requestBatch.length} requisições. Tentativa ${attempts}/${BATCH_CONFIG.MAX_TENTATIVAS_POR_LOTE}...`);

                const responses = UrlFetchApp.fetchAll(requestBatch);
                if (typeof contadorChamadas !== 'undefined') contadorChamadas += requestBatch.length;

                console.log(`Lote ${batchNumber}: Respostas recebidas. Processando...`);

                responses.forEach(response => {
                    const content = response.getContentText();
                    try {
                        const data = JSON.parse(content);
                        if (data.success && data.data) {
                            console.log(`✅ SUCESSO: Negócio ID ${data.data.id} excluído.`);
                        } else {
                            console.log(`❌ FALHA na exclusão. Resposta da API: ${content}`);
                        }
                    } catch (e) {
                        console.log(`❌ FALHA ao processar resposta: ${e.message}`);
                    }
                });
                success = true;

            } catch (e) {
                console.error(`ERRO ao enviar o lote ${batchNumber} na tentativa ${attempts}. Erro: ${e.message}`);
                if (attempts < BATCH_CONFIG.MAX_ATTEMPTS_PER_BATCH) {
                    const waitTime = BATCH_CONFIG.BASE_BACKOFF_TIME_MS * Math.pow(2, attempts - 1);
                    console.log(`Aguardando ${waitTime / 1000} segundos antes de tentar novamente...`);
                    Utilities.sleep(waitTime);
                }
            }
        }

        if (!success) {
            console.error(`FALHA CRÍTICA NO LOTE ${batchNumber}: Todas as tentativas falharam. PULANDO ESTE LOTE.`);
        }
        return success;
    }

    /**
     * Creates batches of requests from the deals list.
     * 
     * @param {Array<Object>} deals - List of deals to process.
     * @param {number} batchSize - Size of each batch.
     * @returns {Array<Array<Object>>} - Array of batches.
     */
    function createBatches(deals, batchSize) {
        const batches = [];
        let currentBatch = [];

        for (const deal of deals) {
            const request = {
                url: `${PIPEDRIVE_API_BASE_URL}/deals/${deal.id}?api_token=${PIPEDRIVE_API_TOKEN}`,
                method: 'delete',
                muteHttpExceptions: true,
                contentType: 'application/json',
                payload: JSON.stringify({ id: deal.id, title: deal.title })
            };

            currentBatch.push(request);

            if (currentBatch.length >= batchSize) {
                batches.push(currentBatch);
                currentBatch = [];
            }
        }

        if (currentBatch.length > 0) {
            batches.push(currentBatch);
        }

        return batches;
    }

    /**
     * Main execution function to start the cleanup process.
     */
    function execute() {
        let consecutiveBatchErrors = 0;
        const filters = MAINTENANCE_CONFIG.HUNTER_CLEANUP_FILTERS;

        try {
            console.log('==== INICIANDO LIMPEZA ROBUSTA DE FILTROS DO PIPEDRIVE ====');
            console.log(`MODO DE TESTE ATIVO: ${TEST_MODE}`);
            console.log(`Filtros na fila: [${filters.join(', ')}]`);
            console.log('----------------------------------------------------');

            for (const filterId of filters) {
                if (typeof contadorChamadas !== 'undefined' && contadorChamadas >= LIMITE_MAXIMO_CHAMADAS) {
                    console.warn("Limite de chamadas da API atingido. O script será interrompido.");
                    break;
                }

                const deals = fetchPipedriveData('deals', { filter_id: filterId, limit: 500 }, true);

                if (!deals || deals.length === 0) {
                    console.log(`Nenhum negócio encontrado no filtro ${filterId}. Pulando.`);
                    continue;
                }

                console.log(`>>> Filtro ${filterId}: Encontrados ${deals.length} negócios. Processando em lotes de ${BATCH_CONFIG.PARALLEL_BATCH_SIZE}.`);

                const batches = createBatches(deals, BATCH_CONFIG.PARALLEL_BATCH_SIZE);

                for (let i = 0; i < batches.length; i++) {
                    const currentBatch = batches[i];
                    const batchNumber = i + 1;

                    const batchSuccess = sendBatchWithRetry(currentBatch, batchNumber);

                    if (batchSuccess) {
                        consecutiveBatchErrors = 0;
                    } else {
                        consecutiveBatchErrors++;
                        console.warn(`AVISO: Falha no processamento do lote ${batchNumber}. Erros consecutivos: ${consecutiveBatchErrors}.`);
                    }

                    if (consecutiveBatchErrors >= BATCH_CONFIG.MAX_CONSECUTIVE_BATCH_ERRORS) {
                        throw new Error(`ERRO FATAL: ${consecutiveBatchErrors} lotes consecutivos falharam. Abortando o script.`);
                    }
                }
            }

            console.log('----------------------------------------------------');
            console.log('Processo finalizado com sucesso.');

        } catch (e) {
            console.error('==== EXECUÇÃO INTERROMPIDA ====');
            console.error(e.toString());
        }
    }

    return {
        execute: execute
    };
})();

function deleteOldHunterDeals() {
    HunterCleanupService.execute();
}

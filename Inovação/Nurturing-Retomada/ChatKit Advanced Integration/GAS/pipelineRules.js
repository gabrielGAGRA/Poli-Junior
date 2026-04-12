/**
 * =================================================================
 * ENTRY POINT 0: TRIAGEM E REGRAS DE TEMPO DE FUNIL E PIPELINES
 * Limpa negócios inúteis e movimenta ressurreições pela "Data de Retomada"
 * =================================================================
 */
function applyPipelineRules() {
    console.log("⏱️ [Routine] Iniciando checagem de cards com Filtro ID 11955...");
    const deals = PipedriveRepository.fetchDealsByFilter(11955);
    const activeUsersIds = PipedriveRepository.getActiveUsers();

    let toDelete = [];
    let toUpdateEspera = [];
    let toUpdateEmail1 = [];

    const now = new Date();

    for (const deal of deals) {
        // 1. Caso não tenha o campo de ORIGIN_ID_FIELD, apagar do sistema
        if (!deal[CUSTOM_FIELDS.ORIGIN_ID_FIELD]) {
            console.log(`❌ Negócio #${deal.id} sem Origin ID. Apagando...`);
            toDelete.push(deal.id);
            continue;
        }

        // Recupera valores vitais
        const ownerId = deal.user_id ? deal.user_id.id : null;

        // Verifica owner inativo de forma global para apagar o deal
        if (!activeUsersIds.includes(ownerId)) {
            console.log(`❌ Negócio #${deal.id} possui Owner Inativo. Apagando...`);
            toDelete.push(deal.id);
            continue;
        }

        let dataRetomadaStr = deal[CUSTOM_FIELDS.DATA_RETOMADA];
        let isRetomadaRules = false;

        // 2. Se possuir Data de Retomada, avaliamos o timer
        if (dataRetomadaStr) {
            let dataRet = new Date(dataRetomadaStr);
            let diffDays = (dataRet.getTime() - now.getTime()) / (1000 * 3600 * 24);

            // Até 7 dias depois de hoje (incluindo o passado) envia para 'Indo para email 1'.
            if (diffDays <= 7) {
                if (!deal[CUSTOM_FIELDS.EMAIL_TITLE] || !deal[CUSTOM_FIELDS.EMAIL_BODY]) {
                    console.log(`⚠️ Negócio #${deal.id} ignorado por falta de título ou corpo de e-mail.`);
                    continue;
                }
                if (deal.stage_id !== REGRAS_CONFIG.STAGE_ESPERA) {
                    toUpdateEspera.push({ id: deal.id, payload: { stage_id: REGRAS_CONFIG.STAGE_ESPERA } });
                }
                toUpdateEmail1.push({ id: deal.id, payload: { stage_id: REGRAS_CONFIG.STAGE_INDO_PARA_EMAIL_1 } });
                continue;
            }
        }

        const value = parseFloat(deal.value || 0);
        // Considerando que stage_change_time guarda a entrada no estágio atual 
        // (como fallback, usa add_time)
        const stageTime = new Date(deal.stage_change_time || deal.add_time);
        let daysInCurrentStage = (now.getTime() - stageTime.getTime()) / (1000 * 3600 * 24);

        if (deal.stage_id === REGRAS_CONFIG.STAGE_ESPERA) {
            if (daysInCurrentStage >= 90) {
                const excessTime = daysInCurrentStage - 90;

                // Checa regras de envio como se estivesse na próxima etapa
                const limitEmail1 = value > 50000 ? 14 : 90; // assumindo 90 para <= 50.000 corrigindo o prompt
                if (excessTime >= limitEmail1) {
                    if (!deal[CUSTOM_FIELDS.EMAIL_TITLE] || !deal[CUSTOM_FIELDS.EMAIL_BODY]) {
                        console.log(`⚠️ Negócio #${deal.id} ignorado por falta de título ou corpo de e-mail.`);
                        continue;
                    }
                    toUpdateEmail1.push({ id: deal.id, payload: { stage_id: REGRAS_CONFIG.STAGE_INDO_PARA_EMAIL_1 } });
                }
            }
        } else if (deal.stage_id === REGRAS_CONFIG.STAGE_INDO_PARA_EMAIL_1) {
            const limitEmail1 = value > 50000 ? 14 : 90;
            if (daysInCurrentStage >= limitEmail1) {
                if (!deal[CUSTOM_FIELDS.EMAIL_TITLE] || !deal[CUSTOM_FIELDS.EMAIL_BODY]) {
                    console.log(`⚠️ Negócio #${deal.id} ignorado por falta de título ou corpo de e-mail.`);
                    continue;
                }
                toUpdateEspera.push({ id: deal.id, payload: { stage_id: REGRAS_CONFIG.STAGE_ESPERA } });
                toUpdateEmail1.push({ id: deal.id, payload: { stage_id: REGRAS_CONFIG.STAGE_INDO_PARA_EMAIL_1 } });
            }
        }
    }

    if (toDelete.length > 0) PipedriveRepository.executeBulkDeletes(toDelete);

    // Move todos primeiro para 'Espera', e logo após, os engatilhados para 'E-mail 1'
    if (toUpdateEspera.length > 0) PipedriveRepository.executeBulkUpdates(toUpdateEspera);
    if (toUpdateEmail1.length > 0) PipedriveRepository.executeBulkUpdates(toUpdateEmail1);

    console.log(`✅ Triagem de Regras Concluída: [${toDelete.length} Apagados | ${toUpdateEspera.length} Preparados -> ${toUpdateEmail1.length} Movidos]`);
}
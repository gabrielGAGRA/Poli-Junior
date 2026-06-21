// Autor: Gabriel Agra de Castro Motta
// Última atualização: 21/04/2026
// Descrição: Processamento manual de retomada e nutrição utilizando configurações globais.
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/**
 * Script de Recuperação e Auditoria de Funil - Poli Júnior
 * Estratégia: SLA Global Baseado em Data de Criação (add_time)
 * * Regras:
 * 1. Buffer de segurança de 5 dias para não conflitar com a automação nativa.
 * 2. Validação obrigatória de campos de e-mail antes de qualquer movimento para "Começo".
 * 3. Compensação dinâmica: Se atrasou na etapa 1, acelera na etapa 2.
 */

function auditoriaGlobalRetomada() {
    const stageIdsAlvo = [
        CONFIG.STAGES.ESPERA.id,
        CONFIG.STAGES.INDO_PARA_EMAIL_1.id,
        CONFIG.STAGES.ENVIO_EMAIL_1.id
    ].filter(Boolean);

    const deals = buscarDealsAbertos(
        [CONFIG.PIPELINES.RETOMADA.id, CONFIG.PIPELINES.NURTURING.id],
        stageIdsAlvo
    );
    const hoje = new Date();
    const stageIdsAlvoSet = new Set(stageIdsAlvo);
    Logger.log(`[INFO] Estágios Alvo: ${Array.from(stageIdsAlvoSet).join(', ')}`);

    let processedCount = 0;
    deals.forEach(deal => {
        try {
            const valStatus = lerCampoCustomizado(deal, CONFIG.CUSTOM_FIELDS.STATUS_RETOMADA, ['Status de Retomada']);
            const valRetomada = lerCampoCustomizado(deal, null, ['Retomada']);

            const normStatus = valStatus ? normalizarTexto(valStatus) : '';
            const normRetomada = valRetomada ? normalizarTexto(valRetomada) : '';

            const statusVazio = estaVazio(valStatus);
            const retomadaVazio = estaVazio(valRetomada);

            const ehNaoRetomar = (normStatus === 'NAO RETOMAR') || (normRetomada === 'NAO RETOMAR');
            const ehVazio = statusVazio && retomadaVazio;

            if (ehVazio || ehNaoRetomar) {
                Logger.log(`[LIMPEZA] Deal ${deal.id} sem status de retomada válido. Status de Retomada: '${valStatus || "vazio"}', Retomada: '${valRetomada || "vazio"}'. Excluindo do funil.`);
                sendPipedriveCommand(`deals/${deal.id}`, 'delete');
                return;
            }

            if (!stageIdsAlvoSet.has(deal.stage_id)) {
                return;
            }
            processedCount++;
            Logger.log(`[PROCESSANDO] Deal ${deal.id} no estágio ${deal.stage_id}`);

            Logger.log(`[SKIP] Deal ${deal.id} com status de retomada preenchido e diferente de NÃO RETOMAR. Mantido no funil.`);

            const dataCriacao = new Date(deal.add_time);
            const diasDeVida = calcularDiferencaDias(dataCriacao, hoje);
            const valorAlto = (deal.value >= (CONFIG.OPERATIONS.SLA ? CONFIG.OPERATIONS.SLA.VALOR_ALTO_THRESHOLD : 50000));

            // SLA de 90 dias + 5 dias de segurança
            const prazoMoverParaPreparo = (CONFIG.OPERATIONS.SLA ? CONFIG.OPERATIONS.SLA.PRAZO_MOVER_PARA_PREPARO_DIAS : 95);

            // SLA Total (90 dias + tempo de preparo em dias úteis convertido + 5 de buffer)
            // Alto Valor: 90 + 15 (11 úteis) + 5 = 110 dias
            // Padrão: 90 + 90 (64 úteis) + 5 = 185 dias
            const prazoFinalEnvio = valorAlto ? (CONFIG.OPERATIONS.SLA ? CONFIG.OPERATIONS.SLA.PRAZO_FINAL_ENVIO_ALTO_VALOR_DIAS : 110) : (CONFIG.OPERATIONS.SLA ? CONFIG.OPERATIONS.SLA.PRAZO_FINAL_ENVIO_PADRAO_DIAS : 185);

            const temEmail = verificarCamposEmail(deal);

            // A automação usa CONFIG.STAGES porque o ID é a referência estável.
            // O nome do estágio pode mudar na planilha, mas o ID continua sendo o gatilho.

            // CASO 1: Deal travado na etapa de ESPERA
            if (deal.stage_id === CONFIG.STAGES.ESPERA.id) {
                if (diasDeVida >= prazoMoverParaPreparo) {
                    Logger.log(`[ATENÇÃO] Deal ${deal.id} atrasado na Espera (${diasDeVida} dias). Movendo para Preparo.`);
                    sendPipedriveCommand(`deals/${deal.id}`, 'put', { stage_id: CONFIG.STAGES.INDO_PARA_EMAIL_1.id });
                } else {
                    Logger.log(`[MANTER] Deal ${deal.id} na Espera dentro do prazo do SLA (${diasDeVida}/${prazoMoverParaPreparo} dias).`);
                }
            }

            // CASO 2: Deal na etapa de PREPARO (Verifica atraso e compensação)
            else if (deal.stage_id === CONFIG.STAGES.INDO_PARA_EMAIL_1.id) {
                if (diasDeVida >= prazoFinalEnvio) {
                    if (temEmail) {
                        Logger.log(`[COMPENSAÇÃO] Deal ${deal.id} com ${diasDeVida} dias. Campos prontos. Movendo para Envio.`);
                        sendPipedriveCommand(`deals/${deal.id}`, 'put', { stage_id: CONFIG.STAGES.ENVIO_EMAIL_1.id });
                    } else {
                        Logger.log(`[ALERTA] Deal ${deal.id} estourou o prazo global (${diasDeVida}/${prazoFinalEnvio} dias), mas os campos de e-mail estão VAZIOS. Intervenção manual necessária.`);
                    }
                } else {
                    Logger.log(`[MANTER] Deal ${deal.id} no Preparo dentro do prazo do SLA (${diasDeVida}/${prazoFinalEnvio} dias).`);
                }
            }

            // CASO 3: Deal na etapa de Começo
            else if (deal.stage_id === CONFIG.STAGES.ENVIO_EMAIL_1.id) {
                Logger.log(`[INFO] Deal ${deal.id} já está na etapa de Envio (Começo). Nenhuma ação pendente.`);
            }

        } catch (e) {
            Logger.log(`Erro ao processar deal ${deal.id}: ${e.message}`);
        }
    });
    Logger.log(`[INFO] Auditoria concluída. ${processedCount} de ${deals.length} deals estavam nos estágios alvo.`);
}

/**
 * Verifica se os campos de Título e Corpo estão preenchidos
 */
function verificarCamposEmail(deal) {
    // Campos customizados também são lidos por key técnica, não por nome exibido.
    const titulo = deal[CONFIG.CUSTOM_FIELDS.EMAIL_TITLE.key];
    const corpo = deal[CONFIG.CUSTOM_FIELDS.EMAIL_BODY.key];

    // Verifica se não é nulo, indefinido ou apenas espaços em branco
    const tituloOk = titulo && titulo.trim().length > 0;
    const corpoOk = corpo && corpo.trim().length > 0;

    return (tituloOk && corpoOk);
}

function buscarDealsAbertos(pipelineIds, stageIds) {
    const startLog = Date.now();
    const filterId = 11955;

    Logger.log(`[INFO] buscarDealsAbertos: buscando deals via filtro Pipedrive ${filterId}...`);
    // Busca dados usando a API v1 e o filter_id 11955
    const deals = fetchPipedriveData('deals', { filter_id: filterId, limit: 500 }, true) || [];

    Logger.log(`[INFO] buscarDealsAbertos carregou ${deals.length} deals usando o filtro ${filterId} (${Date.now() - startLog}ms).`);
    return deals;
}

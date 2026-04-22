// Autor: Gabriel Agra de Castro Motta
// Última atualização: 17/04/2026
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
    const deals = buscarDealsAbertos();
    const hoje = new Date();

    deals.forEach(deal => {
        try {
            const dataCriacao = new Date(deal.add_time);
            const diasDeVida = calcularDiferencaDias(dataCriacao, hoje);
            const valorAlto = (deal.value >= 50000);

            // SLA de 90 dias + 5 dias de segurança
            const prazoMoverParaPreparo = 95;

            // SLA Total (90 dias + tempo de preparo em dias úteis convertido + 5 de buffer)
            // Alto Valor: 90 + 15 (11 úteis) + 5 = 110 dias
            // Padrão: 90 + 90 (64 úteis) + 5 = 185 dias
            const prazoFinalEnvio = valorAlto ? 110 : 185;

            const temEmail = verificarCamposEmail(deal);

            // A automação usa CONFIG.STAGES porque o ID é a referência estável.
            // O nome do estágio pode mudar na planilha, mas o ID continua sendo o gatilho.

            // CASO 1: Deal travado na etapa de ESPERA
            if (deal.stage_id === CONFIG.STAGES.ESPERA.id) {
                if (diasDeVida >= prazoMoverParaPreparo) {
                    Logger.log(`[ATENÇÃO] Deal ${deal.id} atrasado na Espera (${diasDeVida} dias). Movendo para Preparo.`);
                    moverDeal(deal.id, CONFIG.STAGES.INDO_PARA_EMAIL_1.id);
                }
            }

            // CASO 2: Deal na etapa de PREPARO (Verifica atraso e compensação)
            else if (deal.stage_id === CONFIG.STAGES.INDO_PARA_EMAIL_1.id) {
                if (diasDeVida >= prazoFinalEnvio) {
                    if (temEmail) {
                        Logger.log(`[COMPENSAÇÃO] Deal ${deal.id} com ${diasDeVida} dias. Campos prontos. Movendo para Envio.`);
                        moverDeal(deal.id, CONFIG.STAGES.ENVIO_EMAIL_1.id);
                    } else {
                        Logger.log(`[ALERTA] Deal ${deal.id} estourou o prazo global, mas os campos de e-mail estão VAZIOS. Intervenção manual necessária.`);
                    }
                }
            }

        } catch (e) {
            Logger.log(`Erro ao processar deal ${deal.id}: ${e.message}`);
        }
    });
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

/**
 * Funções Auxiliares de API e Data
 */
function calcularDiferencaDias(dataInicio, dataFim) {
    const diffTime = Math.abs(dataFim - dataInicio);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function buscarDealsAbertos() {
    // Simulação de busca via API - Filtrar apenas funis de retomada
    const url = `${PIPEDRIVE_API_BASE_URL}/deals?status=open&api_token=${PIPEDRIVE_API_TOKEN}`;
    const response = UrlFetchApp.fetch(url);
    return JSON.parse(response.getContentText()).data || [];
}

function moverDeal(dealId, novoStageId) {
    const url = `${PIPEDRIVE_API_BASE_URL}/deals/${dealId}?api_token=${PIPEDRIVE_API_TOKEN}`;
    const payload = { stage_id: novoStageId };
    const options = {
        method: 'put',
        contentType: 'application/json',
        payload: JSON.stringify(payload)
    };
    UrlFetchApp.fetch(url, options);
}
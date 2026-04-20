// Autor: Gabriel Agra de Castro Motta
// Última atualização: 17/04/2026
// Descrição: Processamento manual de retomada e nutrição utilizando configurações globais.
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/**
 * ESTÁGIO 1: ESPERA
 * 
 * Lógica de negócios:
 * - NUTRIÇÃO: Tem "Data de Retomada" definida, move no dia exato agendado (+ 1 dia de buffer)
 * - RETOMADA:
 *   * Calcula 90 dias base + dias úteis de espera (conforme valor da oportunidade)
 *   * Leads de alto valor (>= R$ 50k): aguarda 11 dias úteis
 *   * Leads de baixo valor (< R$ 50k): aguarda 64 dias úteis
 *   * Move para Preparo quando esta data é atingida (+ 1 dia de buffer)
 */

/**
 * ESTÁGIO 2: PREPARO DE E-MAIL
 * 
 * Validações obrigatórias:
 * 1. Passou pelo menos 1 dia no estágio
 * 2. Campo "Título do E-mail" preenchido (não vazio)
 * 3. Campo "Corpo do E-mail" preenchido (não vazio)
 * 4. Data limite atingida (conforme tipo de oportunidade)
 * 
 * Critérios de movimentação:
 * - NUTRIÇÃO: Move automaticamente para Envio se passou 1 dia + email preenchido
 * - RETOMADA: Move para Envio se atingiu o prazo total (180 dias + business days) + email preenchido
 */

/**
 * Função principal para ser agendada diariamente
 */
function dailyPipedriveReflow() {
    // Utiliza as configurações globais resolvidas via config.js e analisePipedrive.js
    const stageEsperaId = REGRAS_CONFIG.STAGE_ESPERA;
    const stagePreparoEmail1Id = REGRAS_CONFIG.STAGE_INDO_PARA_EMAIL_1; // Estágio de preparar e-mail
    const stageEnvioId = REGRAS_CONFIG.STAGE_ENVIO_EMAIL_1; // Estágio de enviar e-mail
    const fieldDataRetomada = CUSTOM_FIELDS.DATA_RETOMADA;

    if (!stageEsperaId || !stagePreparoEmail1Id || !stageEnvioId) {
        Logger.log("Configuração de estágios vazia (Espera, Indo E-mail 1 ou Enviar E-mail 1). Verifique config.js.");
        return;
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // 1. Processar cards no estágio de Espera (Stage 1) - Mover para Preparo (Stage 2)
    processarEstagioEspera(stageEsperaId, stagePreparoEmail1Id, fieldDataRetomada, hoje);

    // 2. Processar cards no estágio de Preparo (Stage 2) - Mover para Envio (Stage 3)
    processarEstagioPreparo(stagePreparoEmail1Id, stageEnvioId, fieldDataRetomada, hoje);
}

function processarEstagioEspera(stageEsperaId, stagePreparoEmail1Id, fieldDataRetomada, hoje) {
    const cards = fetchPipedriveData("deals", { stage_id: stageEsperaId, status: 'open' }, true);

    Logger.log(`Processando ${cards.length} cards no estágio de Espera...`);

    cards.forEach(card => {
        try {
            let limitDate; // Data exata em que o card deve mudar de estágio (sem o delay de +1 dia ainda)
            const dataRetomadaRaw = card[fieldDataRetomada];

            if (dataRetomadaRaw) {
                // Origem Nutrição: usa a Data de Retomada como limite para mudar pro preparo email.
                limitDate = new Date(dataRetomadaRaw);
            } else {
                // Origem Retomada (Sem data de retomada definida, ciclo de 180 + business days):
                const dataBase = new Date(card.add_time);
                let deadline = new Date(dataBase);
                // Ciclo 180 dias. 90 dias em espera.
                deadline.setDate(deadline.getDate() + 90);

                const valor = card.value || 0;
                const businessDaysWait = (valor >= 50000) ? 11 : 64;
                deadline = addBusinessDays(deadline, businessDaysWait);

                limitDate = deadline;
            }

            // Só mexe com cards atrasados (passou ao menos 1 dia do limite)
            let limitMaisUmDia = new Date(limitDate);
            limitMaisUmDia.setDate(limitMaisUmDia.getDate() + 1);

            if (hoje >= limitMaisUmDia) {
                Logger.log(`Card ${card.id} atingiu o prazo em Espera. Movendo para Preparo (${stagePreparoEmail1Id})...`);

                const response = sendPipedriveCommand(`deals/${card.id}`, "put", { stage_id: stagePreparoEmail1Id });
                if (response && response.success) {
                    Logger.log(`Card ${card.id} movido com sucesso para Preparo.`);
                } else {
                    Logger.log(`Erro ao mover card ${card.id}: ${response ? response.error : 'Sem resposta'}`);
                }
            }
        } catch (e) {
            Logger.log(`Erro ao processar card ${card.id} em Espera: ${e.message}`);
        }
    });
}

function processarEstagioPreparo(stagePreparoEmail1Id, stageEnvioId, fieldDataRetomada, hoje) {
    const cards = fetchPipedriveData("deals", { stage_id: stagePreparoEmail1Id, status: 'open' }, true);
    Logger.log(`Processando ${cards.length} cards no estágio de Preparo de E-mail...`);

    const fieldEmailTitle = CUSTOM_FIELDS.EMAIL_TITLE;
    const fieldEmailBody = CUSTOM_FIELDS.EMAIL_BODY;

    cards.forEach(card => {
        try {
            // Regra: Nunca deve mandar direto do espera para envio. Deve passar ao menos 1 dia no preparo.
            const dataEntradaEstagio = new Date(card.stage_change_time);
            let umDiaAposEntrada = new Date(dataEntradaEstagio);
            umDiaAposEntrada.setDate(umDiaAposEntrada.getDate() + 1);
            umDiaAposEntrada.setHours(0, 0, 0, 0);

            if (hoje < umDiaAposEntrada) {
                return; // Ainda não passou pelo menos 1 dia no estágio de preparo.
            }

            // Validar preenchimento dos campos Título e Corpo do E-mail
            const title = card[fieldEmailTitle] || "";
            const body = card[fieldEmailBody] || "";
            const isEmailPreenchido = title.trim() !== "" && body.trim() !== "";

            if (!isEmailPreenchido) {
                return; // O código deve SOMENTE mover para envio caso corpo e título não estejam vazios.
            }

            let limitesPreparo;
            const dataRetomadaRaw = card[fieldDataRetomada];

            if (dataRetomadaRaw) {
                // Origem Nutrição: "muda pro proximo estagio sozinho se tiver com email preenchido e já esperou 1 dia"
                // O limite para mover é apenas ter esperado 1 dia (o que já validamos antes).
                limitesPreparo = umDiaAposEntrada;
            } else {
                // Origem Retomada (Ciclo total 180 dias)
                // Metade no Espera (90) e metade no Preparo (90).
                const dataBase = new Date(card.add_time);

                // Calcula limite total da pipeline (Base + 180 + businessDays Wait)
                let limiteTotalPipeline = new Date(dataBase);
                limiteTotalPipeline.setDate(limiteTotalPipeline.getDate() + 180);

                const valor = card.value || 0;
                const businessDaysWait = (valor >= 50000) ? 11 : 64;
                limiteTotalPipeline = addBusinessDays(limiteTotalPipeline, businessDaysWait);

                // Se ele passou 150 dias em espera, restaram apenas 30 dias para preparo (pois o máximo global é 180 dias + business).
                // Portanto, o que determina o limite de preparo é o marco global de 180 dias do card.
                limitesPreparo = limiteTotalPipeline;
            }

            let limiteMaisUmDia = new Date(limitesPreparo);
            if (limitesPreparo) {
                limiteMaisUmDia.setDate(limiteMaisUmDia.getDate() + 1);
            } else {
                limiteMaisUmDia = umDiaAposEntrada; // Default to 1 day after enter
            }

            // Verifica se está atrasado ou se for Nutrição que pode passar direto quando passou 1 dia e tem email
            if (hoje >= limiteMaisUmDia || !!dataRetomadaRaw) {
                Logger.log(`Card ${card.id} pronto para envio de e-mail. Movendo para Envio (${stageEnvioId})...`);

                const response = sendPipedriveCommand(`deals/${card.id}`, "put", { stage_id: stageEnvioId });
                if (response && response.success) {
                    Logger.log(`Card ${card.id} movido com sucesso para Envio.`);
                } else {
                    Logger.log(`Erro ao mover card ${card.id}: ${response ? response.error : 'Sem resposta'}`);
                }
            }

        } catch (e) {
            Logger.log(`Erro ao processar card ${card.id} no Preparo: ${e.message}`);
        }
    });
}

function addBusinessDays(startDate, daysToAdd) {
    let date = new Date(startDate.getTime());
    let added = 0;
    while (added < daysToAdd) {
        date.setDate(date.getDate() + 1);
        if (date.getDay() !== 0 && date.getDay() !== 6) { // 0=Dom, 6=Sáb
            added++;
        }
    }
    return date;
}

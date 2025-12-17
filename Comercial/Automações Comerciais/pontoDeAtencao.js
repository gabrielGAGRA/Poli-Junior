// Autor: Gabriel Agra de Castro Motta
// Última atualização: 29/04/2025
// Descrição: Ponto de atencao por task atrasada
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

// === CONFIGURAÇÕES GLOBAIS ===
const EMAIL_NATHALIA = "nathalia.valle@polijunior.com.br";

// Lista de e-mails de owners que não devem ser considerados para verificação de tarefas atrasadas
const EMAILS_EXCLUIDOS = [
    "nathalia.valle@polijunior.com.br",
    "hunters@polijunior.com.br"
];

/**
 * Limpa todo o histórico de avisos de percentual de atraso do cache do script.
 * Útil para resetar o estado antes de uma demonstração ou se a contagem de dias ficar dessincronizada.
 */
function limpar_cache_avisos() {
    console.log("Iniciando limpeza do cache de avisos de percentual...");
    contadorChamadas = 0;
    try {
        const todosCards = obterCardsPipedrive();
        const cardsPorOwner = agruparCardsPorOwner(todosCards);
        const cache = CacheService.getScriptCache();
        const chavesRemovidas = [];

        for (const ownerEmail in cardsPorOwner) {
            const chave = `ownerAtrasoPercentual_${ownerEmail.replace(/[@.]/g, '_')}`;
            cache.remove(chave);
            chavesRemovidas.push(chave);
        }

        const mensagem = `Limpeza de cache concluída. ${chavesRemovidas.length} chaves potenciais foram removidas.`;
        console.log(mensagem);

    } catch (e) {
        console.error(`Erro ao limpar o cache: ${e.toString()}`);
    }
}

/**
 * Executa uma requisição HTTP garantindo que não ultrapassamos o limite de chamadas da API.
 * @param {string} url - URL para fazer a requisição.
 * @returns {HTTPResponse} - Resposta da requisição.
 * @throws {Error} Se o limite de chamadas for excedido ou houver erro na API.
 */
function requisicaoSegura(url) {
    if (contadorChamadas >= LIMITE_MAXIMO_CHAMADAS) {
        const msgError = "Limite de chamadas da API Pipedrive excedido para esta execução.";
        console.error(msgError);
        throw new Error(msgError);
    }
    contadorChamadas++;
    console.log(`Executando requisição: ${url} (Chamada ${contadorChamadas}/${LIMITE_MAXIMO_CHAMADAS})`);
    const resposta = UrlFetchApp.fetch(url, OPCOES_REQUISICAO);
    const codigoResposta = resposta.getResponseCode();
    const conteudoResposta = resposta.getContentText();

    if (codigoResposta !== 200) {
        const msgError = `Erro na API Pipedrive (${codigoResposta}): ${conteudoResposta}`;
        console.error(msgError);
        throw new Error(msgError);
    }
    return JSON.parse(conteudoResposta);
}

/**
 * Envia um e-mail ou, se em modo de teste, registra o conteúdo do e-mail nos logs.
 * @param {string} destinatario - E-mail do destinatário.
 * @param {string} assunto - Assunto do e-mail.
 * @param {string} corpoHtml - Corpo do e-mail em formato HTML.
 * @param {boolean} modoTeste - Se verdadeiro, o e-mail será logado em vez de enviado.
 */
function enviarEmail(destinatario, assunto, corpoHtml, modoTeste = false) {
    if (modoTeste) {
        const logMessage = `
--- MODO TESTE: E-mail LOGADO (não enviado) ---
  Para: ${destinatario}
  Assunto: ${assunto}
  Corpo: 
${corpoHtml}
---------------------------------------------`;
        // CORREÇÃO: Removido o Logger.log para evitar duplicidade no log de teste.
        console.log(logMessage);
        return;
    }
    try {
        console.log(`Enviando e-mail para ${destinatario}: ${assunto}`);
        MailApp.sendEmail({
            to: destinatario,
            subject: assunto,
            htmlBody: corpoHtml
        });
    } catch (e) {
        console.error(`Falha ao enviar e-mail para ${destinatario}: ${e.toString()}`);
    }
}

/**
 * Obtém os deals (cards) dos filtros especificados no Pipedrive.
 * @returns {Array<Object>} - Lista de cards com informações relevantes.
 */
function obterCardsPipedrive() {
    console.log("Iniciando obtenção de cards do Pipedrive...");
    const filtros = [1135, 1136]; // Funil 6 e Funil 5
    const limit = 500;
    const cardsColetados = [];

    filtros.forEach(filterId => {
        let start = 0;
        let maisItens = true;
        console.log(`Buscando cards do filtro ${filterId}...`);

        while (maisItens) {
            const url = `https://api.pipedrive.com/v1/deals?filter_id=${filterId}&status=open&start=${start}&limit=${limit}&api_token=${CHAVE_API_PIPEDRIVE}`;
            try {
                const dados = requisicaoSegura(url);

                if (dados.success && dados.data) {
                    console.log(`Recebidos ${dados.data.length} cards do filtro ${filterId} (página iniciada em ${start})`);
                    dados.data.forEach(deal => {
                        const emailOwner = deal.user_id ? deal.user_id.email : null;
                        const nomeOwner = deal.user_id ? deal.user_id.name : "Não atribuído";

                        if (emailOwner) {
                            cardsColetados.push({
                                id: deal.id,
                                titulo: deal.title,
                                ownerEmail: emailOwner,
                                ownerName: nomeOwner,
                                proximaAtividadeData: deal.next_activity_date || null, // YYYY-MM-DD
                                proximaAtividadeAssunto: deal.next_activity_subject || null,
                                linkDeal: `https://polijunior.pipedrive.com/deal/${deal.id}` // Ajustado
                            });
                        } else {
                            console.warn(`Card "${deal.title}" (ID: ${deal.id}) sem owner definido. Ignorando.`);
                        }
                    });

                    maisItens = dados.additional_data && dados.additional_data.pagination && dados.additional_data.pagination.more_items_in_collection;
                    if (maisItens) {
                        start += limit;
                    }
                } else {
                    console.error(`Erro ao obter dados da API para filtro ${filterId} (página ${start}): ${dados.error || 'Resposta não sucedida.'}`);
                    maisItens = false;
                }
            } catch (e) {
                console.error(`Falha crítica ao buscar cards do filtro ${filterId}: ${e.toString()}`);
                maisItens = false;
            }
        }
    });

    console.log(`Total de cards coletados: ${cardsColetados.length}`);
    return cardsColetados;
}

/**
 * Agrupa os cards por owner.
 * @param {Array<Object>} cards - Lista de cards.
 * @returns {Object} - Objeto com e-mail do owner como chave e lista de seus cards como valor.
 */
function agruparCardsPorOwner(cards) {
    console.log("Agrupando cards por owner...");
    const agrupados = {};
    cards.forEach(card => {
        if (!agrupados[card.ownerEmail]) {
            agrupados[card.ownerEmail] = {
                ownerName: card.ownerName,
                cards: []
            };
        }
        agrupados[card.ownerEmail].cards.push(card);
    });
    console.log(`Cards agrupados para ${Object.keys(agrupados).length} owners.`);
    return agrupados;
}


/**
 * Processa os cards, identifica atrasos e prepara/envia notificações.
 * @param {Object} opcoes - Opções de execução.
 * @param {boolean} opcoes.modoTeste - Se verdadeiro, loga os e-mails em vez de enviá-los.
 * @param {boolean} opcoes.somenteAviso - Se verdadeiro, envia apenas avisos sem ameaça de ponto e não reporta para a gestão.
 */
function processarCardsENotificar(opcoes = { modoTeste: false, somenteAviso: false }) {
    const modoStr = `(Modo Teste: ${opcoes.modoTeste}, Modo Somente Aviso: ${opcoes.somenteAviso})`;
    console.log(`=== INICIANDO PROCESSAMENTO DE CARDS E NOTIFICAÇÕES ${modoStr} ===`);

    const todosCards = obterCardsPipedrive();
    const cardsPorOwner = agruparCardsPorOwner(todosCards);
    const cache = CacheService.getScriptCache();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeStr = Utilities.formatDate(hoje, Session.getScriptTimeZone(), 'yyyy-MM-dd');

    const relatorioNathalia = {
        tarefasCriticamenteAtrasadas: [],
        proprietariosComAltoAtraso: [],
        cardsSemProximaAtividade: []
    };

    for (const ownerEmail in cardsPorOwner) {
        if (EMAILS_EXCLUIDOS.includes(ownerEmail.toLowerCase())) {
            console.log(`Owner ${ownerEmail} está na lista de exclusão. Pulando.`);
            continue;
        }

        const dadosOwner = cardsPorOwner[ownerEmail];
        const nomeOwner = dadosOwner.ownerName;
        const listaCardsDoOwner = dadosOwner.cards;

        let totalTarefasAgendadasOwner = 0;
        let tarefasAtrasadasOwner = 0;

        const corpoEmailOwnerInfo = {
            introducao: `Bom dia ${nomeOwner},<br><br>Identificamos as seguintes pendências em seus cards. <br><br>`,
            criticamenteAtrasadas: [],
            atrasadasRecentemente: [],
            semProximaAtividade: []
        };
        let precisaEnviarEmailPendenciasOwner = false;

        listaCardsDoOwner.forEach(card => {
            if (!card.proximaAtividadeData) {
                corpoEmailOwnerInfo.semProximaAtividade.push(`<li>Card: <a href="${card.linkDeal}">${card.titulo}</a> - Nenhuma próxima atividade agendada.</li>`);
                relatorioNathalia.cardsSemProximaAtividade.push({
                    tituloCard: card.titulo,
                    ownerName: nomeOwner,
                    linkDeal: card.linkDeal
                });
                return;
            }

            totalTarefasAgendadasOwner++;
            const dataVencimento = new Date(card.proximaAtividadeData + 'T00:00:00');
            const diffMilissegundos = hoje.getTime() - dataVencimento.getTime();
            const diasAtraso = Math.floor(diffMilissegundos / (1000 * 60 * 60 * 24));
            const vencimentoFormatado = Utilities.formatDate(dataVencimento, Session.getScriptTimeZone(), 'dd/MM/yyyy');

            if (diasAtraso > 0) {
                tarefasAtrasadasOwner++;
                const itemLista = `<li>Card: <a href="${card.linkDeal}">${card.titulo}</a><br>Atividade: ${card.proximaAtividadeAssunto || 'Não especificada'}<br>Vencimento: ${vencimentoFormatado}<br><b>Atrasada há ${diasAtraso} dia(s)</b></li><br>`;

                if (diasAtraso >= 5) {
                    corpoEmailOwnerInfo.criticamenteAtrasadas.push(itemLista);
                    precisaEnviarEmailPendenciasOwner = true;
                    relatorioNathalia.tarefasCriticamenteAtrasadas.push({
                        tituloCard: card.titulo, ownerName: nomeOwner, diasAtraso: diasAtraso,
                        vencimentoFormatado: vencimentoFormatado, linkDeal: card.linkDeal,
                        proximaAtividadeAssunto: card.proximaAtividadeAssunto || 'Não especificada'
                    });
                } else if (diasAtraso === 3 || diasAtraso === 4) {
                    corpoEmailOwnerInfo.atrasadasRecentemente.push(itemLista);
                    precisaEnviarEmailPendenciasOwner = true;
                }
            }
        });

        if (precisaEnviarEmailPendenciasOwner) {
            let htmlEmailOwner = corpoEmailOwnerInfo.introducao;
            if (corpoEmailOwnerInfo.criticamenteAtrasadas.length > 0) {
                htmlEmailOwner += "<b><u>⚠️ TAREFAS CRITICAMENTE ATRASADAS (5+ dias):</u></b><ul>" + corpoEmailOwnerInfo.criticamenteAtrasadas.join("") + "</ul><br>";
            }
            if (corpoEmailOwnerInfo.atrasadasRecentemente.length > 0) {
                const tituloAtrasoRecente = opcoes.somenteAviso
                    ? "<b><u>PENDÊNCIAS RECENTES (3-4 dias de atraso):</u></b>"
                    : "<b><u>PENDÊNCIAS RECENTES (ARRUME PARA NÃO LEVAR PONTO; 3-4 dias de atraso):</u></b>";
                htmlEmailOwner += tituloAtrasoRecente + "<ul>" + corpoEmailOwnerInfo.atrasadasRecentemente.join("") + "</ul><br>";
            }
            const assunto = `[Poli Júnior] Pendências em seus Cards - ${nomeOwner}`;
            enviarEmail(ownerEmail, assunto, htmlEmailOwner, opcoes.modoTeste);
        }

        const percentualAtrasadas = totalTarefasAgendadasOwner > 0 ? (tarefasAtrasadasOwner / totalTarefasAgendadasOwner) : 0;
        console.log(`Owner ${ownerEmail} (${nomeOwner}): ${tarefasAtrasadasOwner}/${totalTarefasAgendadasOwner} tarefas agendadas estão atrasadas (${(percentualAtrasadas * 100).toFixed(2)}%).`);

        const chaveCacheAtrasoPercentual = `ownerAtrasoPercentual_${ownerEmail.replace(/[@.]/g, '_')}`;

        if (percentualAtrasadas >= 0.25) {
            let dadosAnterioresCache = null;
            // ALTERAÇÃO: Apenas interage com o cache se a opção ignorarCache for falsa
            if (!opcoes.ignorarCache) {
                dadosAnterioresCache = cache.get(chaveCacheAtrasoPercentual);
            }

            let diasConsecutivosAtraso = 0;
            let enviarAvisoHoje = false;

            if (dadosAnterioresCache) {
                const { dataRegistro, dias } = JSON.parse(dadosAnterioresCache);
                const dataAnterior = new Date(dataRegistro);
                const diffCacheDias = Math.floor((hoje.getTime() - dataAnterior.getTime()) / (1000 * 60 * 60 * 24));

                if (diffCacheDias === 1) { // Sequência contínua
                    diasConsecutivosAtraso = dias + 1;
                    enviarAvisoHoje = true;
                } else if (diffCacheDias > 1) { // Quebrou a sequência, novo dia 1
                    diasConsecutivosAtraso = 1;
                    enviarAvisoHoje = true;
                } else { // diffCacheDias === 0, script rodou de novo no mesmo dia
                    diasConsecutivosAtraso = dias;
                    enviarAvisoHoje = false; // Não envia de novo
                }
            } else { // Nenhum registro no cache, é o primeiro dia
                diasConsecutivosAtraso = 1;
                enviarAvisoHoje = true;
            }

            // Salva o estado atual no cache para a próxima execução
            cache.put(chaveCacheAtrasoPercentual, JSON.stringify({ dataRegistro: hojeStr, dias: diasConsecutivosAtraso }), 21600 * 2); // Cache por 12h

            if (enviarAvisoHoje) {
                let assuntoAvisoPercentual = "";
                let corpoAvisoPercentual = "";

                if (diasConsecutivosAtraso >= 2) { // Aviso de persistência
                    assuntoAvisoPercentual = `[Poli Júnior] ALERTA: Alto Percentual de Tarefas Atrasadas Persistente (${diasConsecutivosAtraso} dias)`;
                    corpoAvisoPercentual = `Bom dia ${nomeOwner},<br><br><b>ALERTA:</b> Pelo ${diasConsecutivosAtraso}º dia consecutivo, você permanece com mais de 25% (${(percentualAtrasadas * 100).toFixed(0)}%) das suas tarefas agendadas em atraso.<br><br>`;

                    if (!opcoes.somenteAviso) {
                        relatorioNathalia.proprietariosComAltoAtraso.push({
                            ownerName: nomeOwner,
                            ownerEmail: ownerEmail,
                            percentualAtrasadas: (percentualAtrasadas * 100).toFixed(2),
                            diasConsecutivos: diasConsecutivosAtraso
                        });
                    }
                } else { // Aviso de primeiro dia (diasConsecutivosAtraso === 1)
                    assuntoAvisoPercentual = `[Poli Júnior] Aviso: Alto Percentual de Tarefas Atrasadas`;
                    corpoAvisoPercentual = opcoes.somenteAviso
                        ? `Bom dia ${nomeOwner},<br><br>Identificamos que mais de 25% (${(percentualAtrasadas * 100).toFixed(0)}%) das suas tarefas agendadas estão atrasadas.<br>Por favor, organize suas pendências para manter a saúde do funil.<br><br>`
                        : `Bom dia ${nomeOwner},<br><br>Mais de 25% (${(percentualAtrasadas * 100).toFixed(0)}%) das suas tarefas agendadas estão atrasadas. <br>Arrume para não levar ponto AMANHÃ.<br><br>`;
                }

                enviarEmail(ownerEmail, assuntoAvisoPercentual, corpoAvisoPercentual, opcoes.modoTeste);
            }
        } else {
            // Se o percentual de atraso for menor que 25%, removemos a chave do cache para quebrar a sequência.
            cache.remove(chaveCacheAtrasoPercentual);
        }
    } // Fim do loop por owner

    // Montar e enviar e-mail consolidado para Nathalia
    let corpoEmailRelatorioFinal = `Bom dia Nathalia,<br><br>Segue o relatório de acompanhamento de tarefas e cards do Pipedrive (${Utilities.formatDate(hoje, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')}):<br><br>`;
    let precisaEnviarEmailRelatorioFinal = false;

    if (relatorioNathalia.tarefasCriticamenteAtrasadas.length > 0) {
        precisaEnviarEmailRelatorioFinal = true;
        corpoEmailRelatorioFinal += "<b><u><font color='red'>🚨 TAREFAS CRITICAMENTE ATRASADAS (5+ DIAS):</font></u></b><ul>";
        relatorioNathalia.tarefasCriticamenteAtrasadas.sort((a, b) => b.diasAtraso - a.diasAtraso).forEach(item => {
            corpoEmailRelatorioFinal += `<li><b>Card:</b> <a href="${item.linkDeal}">${item.tituloCard}</a> (Atividade: ${item.proximaAtividadeAssunto})<br><b>Responsável:</b> ${item.ownerName}<br><b>Atraso:</b> ${item.diasAtraso} dia(s) (Vencimento: ${item.vencimentoFormatado})</li><br>`;
        });
        corpoEmailRelatorioFinal += "</ul><br>";
    }

    if (relatorioNathalia.proprietariosComAltoAtraso.length > 0) {
        precisaEnviarEmailRelatorioFinal = true;
        corpoEmailRelatorioFinal += "<b><u><font color='orange'>⚠️ RESPONSÁVEIS COM ALTO PERCENTUAL DE ATRASO PERSISTENTE (>25% por 2+ dias):</font></u></b><ul>";
        relatorioNathalia.proprietariosComAltoAtraso.forEach(item => {
            corpoEmailRelatorioFinal += `<li><b>Responsável:</b> ${item.ownerName} (${item.ownerEmail})<br><b>Percentual de Atraso:</b> ${item.percentualAtrasadas}%<br><b>Dias Consecutivos:</b> ${item.diasConsecutivos}</li><br>`;
        });
        corpoEmailRelatorioFinal += "</ul><br>";
    }

    if (relatorioNathalia.cardsSemProximaAtividade.length > 0) {
        precisaEnviarEmailRelatorioFinal = true;
        corpoEmailRelatorioFinal += "<b><u><font color='blue'>ℹ️ CARDS SEM PRÓXIMA ATIVIDADE AGENDADA:</font></u></b><ul>";
        const cardsSemAtividadeAgrupados = {};
        relatorioNathalia.cardsSemProximaAtividade.forEach(item => {
            if (!cardsSemAtividadeAgrupados[item.ownerName]) cardsSemAtividadeAgrupados[item.ownerName] = [];
            cardsSemAtividadeAgrupados[item.ownerName].push(`<li><a href="${item.linkDeal}">${item.tituloCard}</a></li>`);
        });
        for (const ownerName in cardsSemAtividadeAgrupados) {
            corpoEmailRelatorioFinal += `<li><b>Responsável: ${ownerName}</b><ul>${cardsSemAtividadeAgrupados[ownerName].join("")}</ul></li>`;
        }
        corpoEmailRelatorioFinal += "</ul><br>";
    }

    corpoEmailRelatorioFinal += "<br>Este é um e-mail automático. Para mais detalhes, acesse o Pipedrive.<br><br>";

    const hojeFormatado = Utilities.formatDate(hoje, Session.getScriptTimeZone(), 'dd/MM/yyyy');
    let assuntoRelatorioFinal = "";

    if (precisaEnviarEmailRelatorioFinal) {
        assuntoRelatorioFinal = `[Poli Júnior] Relatório Diário de Pendências Pipedrive - ${hojeFormatado}`;
        enviarEmail(EMAIL_NATHALIA, assuntoRelatorioFinal, corpoEmailRelatorioFinal, opcoes.modoTeste);
    } else {
        assuntoRelatorioFinal = `[Poli Júnior] Relatório Diário Pipedrive - TUDO OK - ${hojeFormatado}`;
        const corpoTudoOk = `Bom dia Nathalia,<br><br>Nenhuma pendência crítica, proprietário com alto atraso persistente ou cards sem atividade foram identificados hoje nos funis monitorados.<br><br>`;
        enviarEmail(EMAIL_NATHALIA, assuntoRelatorioFinal, corpoTudoOk, opcoes.modoTeste);
    }

    console.log(`Contador final de chamadas API: ${contadorChamadas}`);
    Logger.log(`Contador final de chamadas API: ${contadorChamadas}`);
    console.log("=== PROCESSAMENTO DE CARDS E NOTIFICAÇÕES CONCLUÍDO ===");
}

// === FUNÇÕES DE EXECUÇÃO (TRIGGERS) ===

/**
 * FUNÇÃO PRINCIPAL PARA EXECUÇÃO PADRÃO (PRODUÇÃO)
 * Roda o script normalmente, enviando e-mails com consequências.
 */
function ponto_atencao() {
    contadorChamadas = 0;
    try {
        if (typeof CHAVE_API_PIPEDRIVE === 'undefined' || typeof EMAIL_NATHALIA === 'undefined') {
            throw new Error("Constantes CHAVE_API_PIPEDRIVE ou EMAIL_NATHALIA não estão definidas.");
        }
        processarCardsENotificar({ modoTeste: false, somenteAviso: false });
    } catch (e) {
        console.error(`Erro fatal na execução principal: ${e.toString()} ${e.stack}`);
        Logger.log(`Erro fatal na execução principal: ${e.toString()} ${e.stack}`);
        const adminEmail = Session.getEffectiveUser().getEmail() || "seu.email.admin@example.com";
        enviarEmail(adminEmail, "[URGENTE - Poli Júnior] Erro no Script Pipedrive",
            `Ocorreu um erro crítico no script:<br><br>${e.toString()}<br><br>Stack Trace:<br>${e.stack ? e.stack.replace(/\n/g, '<br>') : 'Não disponível'}`);
    }
}

/**
 * FUNÇÃO DE TESTE (para o modo padrão)
 * Roda o script em modo teste e IGNORA O CACHE.
 */
function ponto_atencao_teste() {
    contadorChamadas = 0;
    console.log("--- MODO DE TESTE (Padrão) ATIVADO. E-mails serão LOGADOS, CACHE IGNORADO. ---");
    try {
        // ALTERAÇÃO: adicionada a opção ignorarCache: true
        processarCardsENotificar({ modoTeste: true, somenteAviso: false, ignorarCache: true });
    } catch (e) {
        const errorMsg = `Ocorreu um erro crítico no script (MODO TESTE):<br><br>${e.toString()}<br><br>Stack Trace:<br>${e.stack ? e.stack.replace(/\n/g, '<br>') : 'Não disponível'}`;
        enviarEmail("admin.teste@example.com", "[URGENTE - Poli Júnior TESTE] Erro no Script Pipedrive", errorMsg, true);
    }
}

/**
 * FUNÇÃO SOMENTE AVISO (PRODUÇÃO)
 * Roda o script em modo de aviso: envia e-mails sem ameaça de ponto e não notifica a gestão para dar pontos.
 */
function somente_aviso() {
    contadorChamadas = 0;
    console.log("--- MODO 'SOMENTE AVISO' ATIVADO. ---");
    Logger.log("--- MODO 'SOMENTE AVISO' ATIVADO. ---");
    try {
        processarCardsENotificar({ modoTeste: false, somenteAviso: true });
    } catch (e) {
        console.error(`Erro fatal na execução 'somente aviso': ${e.toString()} ${e.stack}`);
        Logger.log(`Erro fatal na execução 'somente aviso': ${e.toString()} ${e.stack}`);
        const adminEmail = Session.getEffectiveUser().getEmail() || "seu.email.admin@example.com";
        enviarEmail(adminEmail, "[URGENTE - Poli Júnior] Erro no Script Pipedrive (Modo Aviso)",
            `Ocorreu um erro crítico no script:<br><br>${e.toString()}<br><br>Stack Trace:<br>${e.stack ? e.stack.replace(/\n/g, '<br>') : 'Não disponível'}`);
    }
}

/**
 * FUNÇÃO DE TESTE DO MODO SOMENTE AVISO
 * Roda com lógica de aviso, LOGA e-mails e IGNORA O CACHE.
 */
function somente_aviso_teste() {
    contadorChamadas = 0;
    console.log("--- MODO DE TESTE (para SOMENTE AVISO) ATIVADO. E-mails serão LOGADOS, CACHE IGNORADO. ---");
    try {
        // ALTERAÇÃO: adicionada a opção ignorarCache: true
        processarCardsENotificar({ modoTeste: true, somenteAviso: true, ignorarCache: true });
    } catch (e) {
        const errorMsg = `Ocorreu um erro crítico no script (MODO TESTE para SOMENTE AVISO):<br><br>${e.toString()}<br><br>Stack Trace:<br>${e.stack ? e.stack.replace(/\n/g, '<br>') : 'Não disponível'}`;
        enviarEmail("admin.teste@example.com", "[URGENTE - Poli Júnior TESTE AVISO] Erro no Script Pipedrive", errorMsg, true);
    }
}

// Autor: Gabriel Agra de Castro Motta
// Última atualização: 12/12/2025
// Descrição: Envia e-mails individuais para os membros com suas tarefas e negócios do Pipedrive.
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/**
 * =================================================================
 * INDIVIDUAL REPORT (EMAIL TASKS)
 * Sends individual metrics to each team member
 * =================================================================
 */

var IndividualReport = (function () {

    // Local Helpers (in case they are not in utils.js)
    const ReportUtils = {
        createMetricsStructure: function () {
            return {
                totalLeads: 0,
                totalValue: 0,
                stalledLeads: 0,
                stalledValue: 0,
                leadsNoActivity: 0,
                emailOwner: null
            };
        },
        calculatePercentage: function (part, total) {
            if (!total) return "0%";
            return Math.round((part / total) * 100) + "%";
        },
        formatCurrency: function (value) {
            return "R$ " + (value || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        }
    };

    function isDealStalled(deal, today) {
        // Logic: Deal is stalled if no next activity or next activity is in the past
        // This is a basic implementation. Adjust logic if needed.
        if (!deal.next_activity_date) return true;

        const nextActivity = new Date(deal.next_activity_date);
        // Reset time for comparison
        const todayMidnight = new Date(today);
        todayMidnight.setHours(0, 0, 0, 0);

        return nextActivity < todayMidnight;
    }

    const DataService = {
        getOpenDeals: function () {
            console.log("📥 [Individual] Starting optimized collection...");
            return fetchPipedriveData('deals', { status: 'open', limit: LIMIT_PER_PAGE }, true);
        }
    };

    const MetricsService = {
        processData: function (deals, todayDate) {
            var grouping = {};

            deals.forEach(function (deal) {
                // 1. Validations
                if (REPORT_CONFIG.PIPEDRIVE.IGNORED_OWNERS.includes(deal.owner_name)) return;

                // Check valid stages if defined
                if (REPORT_CONFIG.PIPEDRIVE.VALID_STAGES && !REPORT_CONFIG.PIPEDRIVE.VALID_STAGES.includes(deal.stage_id)) return;

                // 2. Identify Nucleo
                // deal.label is usually the ID of the label option.
                var nucleoName = REPORT_CONFIG.PIPEDRIVE.NUCLEO_MAPPING[deal.label];
                if (!nucleoName) return;

                // 3. Initialize Structures
                if (!grouping[nucleoName]) grouping[nucleoName] = {};
                if (!grouping[nucleoName][deal.owner_name]) {
                    grouping[nucleoName][deal.owner_name] = ReportUtils.createMetricsStructure();

                    if (deal.user_id && deal.user_id.email) {
                        grouping[nucleoName][deal.owner_name].emailOwner = deal.user_id.email;
                    }
                }

                // 4. Calculate Metrics
                var metrics = grouping[nucleoName][deal.owner_name];
                metrics.totalLeads++;
                metrics.totalValue += deal.value;

                if (isDealStalled(deal, todayDate)) {
                    metrics.stalledLeads++;
                    metrics.stalledValue += deal.value;
                    if (!deal.next_activity_date) {
                        metrics.leadsNoActivity++;
                    }
                }
            });

            return grouping;
        },

        calculatePercentages: function (metrics) {
            return {
                ...metrics,
                pctStalledValue: ReportUtils.calculatePercentage(metrics.stalledValue, metrics.totalValue),
                pctStalledLeads: ReportUtils.calculatePercentage(metrics.stalledLeads, metrics.totalLeads),
                pctNoActivity: ReportUtils.calculatePercentage(metrics.leadsNoActivity, metrics.totalLeads),
                formattedStalledValue: ReportUtils.formatCurrency(metrics.stalledValue),
                formattedTotalValue: ReportUtils.formatCurrency(metrics.totalValue)
            };
        },

        aggregateNucleoTotals: function (ownerMetrics) {
            var total = ReportUtils.createMetricsStructure();

            for (var owner in ownerMetrics) {
                var m = ownerMetrics[owner];
                total.totalLeads += m.totalLeads;
                total.totalValue += m.totalValue;
                total.stalledLeads += m.stalledLeads;
                total.stalledValue += m.stalledValue;
                total.leadsNoActivity += m.leadsNoActivity;
            }
            return MetricsService.calculatePercentages(total);
        }
    };

    const EmailService = {
        generateEmailBody: function (nucleoName, ownerMetrics, nucleoTotals) {
            var nucleoConfig = (REPORT_CONFIG.EMAILS.CONFIG_BY_NUCLEO && REPORT_CONFIG.EMAILS.CONFIG_BY_NUCLEO[nucleoName])
                ? REPORT_CONFIG.EMAILS.CONFIG_BY_NUCLEO[nucleoName]
                : { intro: 'Seguem informações do funil de hoje:\n\n' };

            var body = nucleoConfig.intro;

            body += "📊 *MÉTRICAS GERAIS DO NÚCLEO*\n";
            body += "-----------------------------------\n";
            body += "💰 Valor Total em Pipeline: " + nucleoTotals.formattedTotalValue + "\n";
            body += "⚠️ Valor Parado: " + nucleoTotals.formattedStalledValue + " (" + nucleoTotals.pctStalledValue + ")\n";
            body += "📉 Leads Parados: " + nucleoTotals.stalledLeads + "/" + nucleoTotals.totalLeads + " (" + nucleoTotals.pctStalledLeads + ")\n";
            body += "🚫 Sem Atividade Agendada: " + nucleoTotals.leadsNoActivity + " (" + nucleoTotals.pctNoActivity + ")\n\n";

            body += "👤 *DETALHAMENTO POR MEMBRO*\n";
            body += "-----------------------------------\n";

            for (var owner in ownerMetrics) {
                var m = MetricsService.calculatePercentages(ownerMetrics[owner]);
                body += "*" + owner + "*\n";
                body += "   • Pipeline: " + m.formattedTotalValue + " (" + m.totalLeads + " leads)\n";
                body += "   • Parado: " + m.formattedStalledValue + " (" + m.pctStalledValue + " do valor)\n";
                body += "   • Leads Críticos: " + m.stalledLeads + " (" + m.pctStalledLeads + ")\n\n";
            }

            return body;
        },

        sendEmails: function (grouping) {
            for (var nucleoName in grouping) {
                var ownerMetrics = grouping[nucleoName];
                var nucleoTotals = MetricsService.aggregateNucleoTotals(ownerMetrics);
                var emailBody = EmailService.generateEmailBody(nucleoName, ownerMetrics, nucleoTotals);

                var recipientsSet = new Set();

                // Add fixed recipients from config
                if (REPORT_CONFIG.EMAILS.NUCLEO_RECIPIENTS) {
                    var fixedEmails = REPORT_CONFIG.EMAILS.NUCLEO_RECIPIENTS.split(',').map(e => e.trim());
                    fixedEmails.forEach(e => recipientsSet.add(e));
                }

                if (REPORT_CONFIG.EMAILS.EXTRA_RECIPIENT) {
                    recipientsSet.add(REPORT_CONFIG.EMAILS.EXTRA_RECIPIENT);
                }

                // Add owner emails
                for (var owner in ownerMetrics) {
                    if (ownerMetrics[owner].emailOwner) {
                        recipientsSet.add(ownerMetrics[owner].emailOwner);
                    }
                }

                var recipients = Array.from(recipientsSet).join(',');

                console.log("📧 [Individual] Sending email to Nucleo: " + nucleoName);
                MailApp.sendEmail({
                    to: recipients,
                    subject: "Relatório Diário de Pipeline - " + nucleoName,
                    body: emailBody
                });
            }
        }
    };

    function execute() {
        try {
            var today = new Date();
            today.setHours(0, 0, 0, 0);

            var deals = DataService.getOpenDeals();
            var grouping = MetricsService.processData(deals, today);

            EmailService.sendEmails(grouping);

            console.log("✅ [Individual] Process finished successfully!");
        } catch (e) {
            console.error("❌ [Individual] Execution error: " + e.toString());
        }
    }

    return {
        execute: execute
    };
})();

/**
 * Main Trigger
 */
function enviarEmailsSobreOwners() {
    IndividualReport.execute();
}

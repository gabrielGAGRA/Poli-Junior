// Autor: Gabriel Agra de Castro Motta
// Última atualização: 12/12/2025
// Descrição: Envia e-mails consolidados por Núcleo para as lideranças.
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/**
 * =================================================================================
 * CONFIGURATION
 * =================================================================================
 */

// No specific filter ID needed, we fetch all open deals and filter by Nucleo mapping.

/**
 * =================================================================================
 * MAIN FUNCTION
 * =================================================================================
 */

function enviarEmailsSobreNucleos() {
    // 1. Fetch all open deals
    // Using status='open' to get all active deals visible to the user
    const deals = fetchPipedriveData('deals', { status: 'open', limit: 500 }, true);

    if (!deals || deals.length === 0) {
        Logger.log("No deals found to process.");
        return;
    }

    // 2. Group deals by Nucleo based on Stage ID
    const dealsByNucleo = groupDealsByNucleo(deals);

    // 3. Send email for each Nucleo
    for (const nucleoName in dealsByNucleo) {
        const nucleoDeals = dealsByNucleo[nucleoName];
        sendEmailToNucleo(nucleoName, nucleoDeals);
    }
}

/**
 * Groups deals by Nucleo using the NUCLEO_MAPPING from config.
 * @param {Array} deals 
 * @returns {Object} Map of NucleoName -> Array of Deals
 */
function groupDealsByNucleo(deals) {
    const groups = {};
    const mapping = REPORT_CONFIG.PIPEDRIVE.NUCLEO_MAPPING;

    deals.forEach(deal => {
        const stageId = deal.stage_id;
        // Check if the stage belongs to a Nucleo
        // mapping keys are integers (Stage IDs)
        if (mapping[stageId]) {
            const nucleoName = mapping[stageId];
            if (!groups[nucleoName]) {
                groups[nucleoName] = [];
            }
            groups[nucleoName].push(deal);
        }
    });
    return groups;
}

/**
 * Sends the summary email for a specific Nucleo.
 * @param {string} nucleoName 
 * @param {Array} deals 
 */
function sendEmailToNucleo(nucleoName, deals) {
    // Determine recipients based on deal owners, excluding ignored ones (e.g. Francine)
    const recipientsSet = new Set();
    const ignoredOwners = REPORT_CONFIG.PIPEDRIVE.IGNORED_OWNERS || [];

    deals.forEach(deal => {
        // Pipedrive API returns user_id as an object with name and email
        if (deal.user_id && deal.user_id.email && deal.user_id.name) {
            if (!ignoredOwners.includes(deal.user_id.name)) {
                recipientsSet.add(deal.user_id.email);
            }
        }
    });

    const recipients = Array.from(recipientsSet).join(',');

    if (!recipients) {
        Logger.log(`No recipients found for Nucleo ${nucleoName} (all ignored or no emails).`);
        return;
    }

    const subject = `[Poli Júnior] Relatório do Núcleo ${nucleoName} - ${Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy")}`;

    // Get custom intro if available
    let intro = `Seguem as informações do funil de ${nucleoName}:\n\n`;
    if (REPORT_CONFIG.EMAILS.CONFIG_BY_NUCLEO && REPORT_CONFIG.EMAILS.CONFIG_BY_NUCLEO[nucleoName]) {
        intro = REPORT_CONFIG.EMAILS.CONFIG_BY_NUCLEO[nucleoName].intro;
    }

    let htmlBody = `
        <div style="font-family: Arial, sans-serif; color: #333;">
            <h2>${nucleoName}</h2>
            <p>${intro.replace(/\n/g, '<br>')}</p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                <thead>
                    <tr style="background-color: #f2f2f2;">
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Título</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Responsável</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Valor</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Organização</th>
                    </tr>
                </thead>
                <tbody>
    `;

    deals.forEach(deal => {
        htmlBody += `
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd;">
                    <a href="https://${PIPEDRIVE_API_BASE_URL.split('/api')[0]}/deal/${deal.id}" style="text-decoration: none; color: #007bff;">
                        ${deal.title}
                    </a>
                </td>
                <td style="padding: 10px; border: 1px solid #ddd;">${deal.owner_name}</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${deal.formatted_value}</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${deal.org_name || '-'}</td>
            </tr>
        `;
    });

    htmlBody += `
                </tbody>
            </table>
        </div>
    `;

    try {
        MailApp.sendEmail({
            to: recipients,
            subject: subject,
            htmlBody: htmlBody,
            name: "Automação Poli Júnior"
        });
        Logger.log(`Email sent for Nucleo ${nucleoName} to ${recipients}`);
    } catch (e) {
        Logger.log(`Failed to send email for Nucleo ${nucleoName}: ${e.toString()}`);
    }
}

// ====================================================================
// Menu Configuration
// ====================================================================

function onOpen() {
    SpreadsheetApp.getUi()
        .createMenu('Pipedrive Nucleo Emails')
        .addItem('Send Nucleo Reports', 'sendNucleoTaskEmails')
        .addToUi();
}
// Autor: Gabriel Agra de Castro Motta
// Última atualização: 12/12/2025
// Descrição: Envia e-mails consolidados por Núcleo para as lideranças.
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/**
 * =================================================================================
 * CONFIGURATION
 * =================================================================================
 */

// No specific filter ID needed, we fetch all open deals and filter by Nucleo mapping.

/**
 * =================================================================================
 * MAIN FUNCTION
 * =================================================================================
 */

function enviarEmailsSobreNucleos() {
    // 1. Fetch all open deals
    // Using status='open' to get all active deals visible to the user
    const deals = fetchPipedriveData('deals', { status: 'open', limit: 500 }, true);

    if (!deals || deals.length === 0) {
        Logger.log("No deals found to process.");
        return;
    }

    // 2. Group deals by Nucleo based on Stage ID
    const dealsByNucleo = groupDealsByNucleo(deals);

    // 3. Send email for each Nucleo
    for (const nucleoName in dealsByNucleo) {
        const nucleoDeals = dealsByNucleo[nucleoName];
        sendEmailToNucleo(nucleoName, nucleoDeals);
    }
}

/**
 * Groups deals by Nucleo using the NUCLEO_MAPPING from config.
 * @param {Array} deals 
 * @returns {Object} Map of NucleoName -> Array of Deals
 */
function groupDealsByNucleo(deals) {
    const groups = {};
    const mapping = REPORT_CONFIG.PIPEDRIVE.NUCLEO_MAPPING;

    deals.forEach(deal => {
        const stageId = deal.stage_id;
        // Check if the stage belongs to a Nucleo
        // mapping keys are integers (Stage IDs)
        if (mapping[stageId]) {
            const nucleoName = mapping[stageId];
            if (!groups[nucleoName]) {
                groups[nucleoName] = [];
            }
            groups[nucleoName].push(deal);
        }
    });
    return groups;
}

/**
 * Sends the summary email for a specific Nucleo.
 * @param {string} nucleoName 
 * @param {Array} deals 
 */
function sendEmailToNucleo(nucleoName, deals) {
    // Determine recipients based on deal owners, excluding ignored ones (e.g. Francine)
    const recipientsSet = new Set();
    const ignoredOwners = REPORT_CONFIG.PIPEDRIVE.IGNORED_OWNERS || [];

    deals.forEach(deal => {
        // Pipedrive API returns user_id as an object with name and email
        if (deal.user_id && deal.user_id.email && deal.user_id.name) {
            if (!ignoredOwners.includes(deal.user_id.name)) {
                recipientsSet.add(deal.user_id.email);
            }
        }
    });

    const recipients = Array.from(recipientsSet).join(',');

    if (!recipients) {
        Logger.log(`No recipients found for Nucleo ${nucleoName} (all ignored or no emails).`);
        return;
    }

    const subject = `[Poli Júnior] Relatório do Núcleo ${nucleoName} - ${Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy")}`;

    // Get custom intro if available
    let intro = `Seguem as informações do funil de ${nucleoName}:\n\n`;
    if (REPORT_CONFIG.EMAILS.CONFIG_BY_NUCLEO && REPORT_CONFIG.EMAILS.CONFIG_BY_NUCLEO[nucleoName]) {
        intro = REPORT_CONFIG.EMAILS.CONFIG_BY_NUCLEO[nucleoName].intro;
    }

    let htmlBody = `
        <div style="font-family: Arial, sans-serif; color: #333;">
            <h2>${nucleoName}</h2>
            <p>${intro.replace(/\n/g, '<br>')}</p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                <thead>
                    <tr style="background-color: #f2f2f2;">
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Título</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Responsável</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Valor</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Organização</th>
                    </tr>
                </thead>
                <tbody>
    `;

    deals.forEach(deal => {
        htmlBody += `
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd;">
                    <a href="https://${PIPEDRIVE_API_BASE_URL.split('/api')[0]}/deal/${deal.id}" style="text-decoration: none; color: #007bff;">
                        ${deal.title}
                    </a>
                </td>
                <td style="padding: 10px; border: 1px solid #ddd;">${deal.owner_name}</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${deal.formatted_value}</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${deal.org_name || '-'}</td>
            </tr>
        `;
    });

    htmlBody += `
                </tbody>
            </table>
        </div>
    `;

    try {
        MailApp.sendEmail({
            to: recipients,
            subject: subject,
            htmlBody: htmlBody,
            name: "Automação Poli Júnior"
        });
        Logger.log(`Email sent for Nucleo ${nucleoName} to ${recipients}`);
    } catch (e) {
        Logger.log(`Failed to send email for Nucleo ${nucleoName}: ${e.toString()}`);
    }
}

// ====================================================================
// Menu Configuration
// ====================================================================

function onOpen() {
    SpreadsheetApp.getUi()
        .createMenu('Pipedrive Nucleo Emails')
        .addItem('Send Nucleo Reports', 'sendNucleoTaskEmails')
        .addToUi();
}

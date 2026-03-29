import { PipedriveRepository } from './pipedriveService';
import { executeAiWorkflow } from './orchestrator';
import { WORKFLOW_STAGE_MAPPING, AGENT_CONFIG, CUSTOM_FIELDS, getNucleusInfo } from '../config';

// DEDUPLICAÇÃO
async function deduplicateDeals(deals: any[]) {
    if (!deals || deals.length === 0) return deals;

    console.log("🚀 Lendo negócios para deduplicação no funil...");
    const groups: Record<string, any[]> = {};

    deals.forEach(deal => {
        const personId = deal.person_id ? deal.person_id.value : 'NO_PERSON';
        const orgId = deal.org_id ? deal.org_id.value : 'NO_ORG';

        let key = `${personId}_${orgId}`;
        if (personId === 'NO_PERSON' && orgId === 'NO_ORG') {
            key = 'TITLE_' + deal.title;
        }

        if (!groups[key]) groups[key] = [];
        groups[key].push(deal);
    });

    const uniqueDeals = [];
    let totalRemoved = 0;

    for (const key in groups) {
        const dealList = groups[key];

        if (dealList.length < 2) {
            uniqueDeals.push(dealList[0]);
            continue;
        }

        console.log(`⚠️ [DUPLICATE] Key: ${key} | Qty: ${dealList.length}`);
        dealList.sort((a, b) => new Date(a.add_time).getTime() - new Date(b.add_time).getTime());

        const winner = dealList[0];
        const losers = dealList.slice(1);

        uniqueDeals.push(winner);

        for (const loserDeal of losers) {
            console.log(`   📉 Marking LOST ID ${loserDeal.id}...`);
            await PipedriveRepository.markDealAsLost(loserDeal.id, 'Duplicidade detectada via Script Automático antes de IA (Nurturing/Retomada)');
            totalRemoved++;
            await new Promise(r => setTimeout(r, 150));
        }
    }

    if (totalRemoved > 0) {
        console.log(`📊 Limpeza Completa: ${totalRemoved} negócios duplicados removidos.`);
    }

    return uniqueDeals;
}

// ETAPA 1
export async function syncAndSummarize() {
    const stagesToSync = Object.keys(WORKFLOW_STAGE_MAPPING).map(Number);
    let deals = await PipedriveRepository.fetchDealsInStages(stagesToSync);

    deals = await deduplicateDeals(deals);

    for (const deal of deals) {
        try {
            console.log(`\n--- Analisando Negócio #${deal.id}: ${deal.title} ---`);

            let notesForSummary: any[] = [];
            let needsSummary = false;

            if (deal.notes_count === 0) {
                const originalDealId = deal[CUSTOM_FIELDS.ORIGIN_ID_FIELD];
                if (originalDealId) {
                    notesForSummary = await PipedriveRepository.syncOriginNotes(deal.id, originalDealId);
                    needsSummary = notesForSummary.length > 0;
                }
            } else {
                notesForSummary = await PipedriveRepository.getNotesFromDeal(deal.id);
                const hasSummary = notesForSummary.some(n => n.content && n.content.includes(AGENT_CONFIG.RESUMO_PREFIX));
                needsSummary = !hasSummary && notesForSummary.length > 0;
            }

            if (needsSummary) {
                await generateStrategicSummary(deal, notesForSummary);
            } else {
                console.log(`✅ Negócio #${deal.id} já possui resumo ou não tem notas originais para resumir.`);
            }
        } catch (e: any) {
            console.error(`Erro na fase de análise do Deal ${deal.id}: ${e.message}`);
        }
    }
}

async function generateStrategicSummary(deal: any, notes: any[]) {
    const rawNotesText = notes
        .filter(n => n.content && !n.content.includes(AGENT_CONFIG.RESUMO_PREFIX))
        .map(n => n.content.replace(/<[^>]*>?/gm, ' '))
        .join('\n---\n');

    if (!rawNotesText.trim()) return;

    const nucleusName = deal[CUSTOM_FIELDS.LABEL] || 'NDados';
    const nucleus = getNucleusInfo(nucleusName);

    const payload = {
        input_as_text: rawNotesText,
        nucleo: nucleus.abreviacao,
        nucleo_nome_completo: nucleus.nome_completo
    };

    // ATENÇÃO: Depende da implementação do Agente "Analista". Como aqui só temos 1 entrypoint,
    // usamos o trigger default e preenchemos. Idealmente haveria um executeAiWorkflow('Analista', payload)
    console.log("Chamando o Agente Analista...");

    // Simulação do Workflow de Analista, usando nosso Roteador:
    const summaryResult = await executeAiWorkflow('Analista', payload).catch(() => null);

    if (summaryResult) {
        // Se usar output unificado 
        const saida = typeof summaryResult === 'string' ? summaryResult : JSON.stringify(summaryResult);
        const content = `<h1>${AGENT_CONFIG.RESUMO_PREFIX}</h1>\n${saida}`;
        await PipedriveRepository.createNote(deal.id, content);
        console.log(`✅ Resumo estratégico gerado para o núcleo: ${nucleus.abreviacao}`);
    }
}

// ETAPA 2
export async function executeEmailCadence() {
    const activeUsers = await PipedriveRepository.getActiveUsers();
    const stagesToProcess = Object.keys(WORKFLOW_STAGE_MAPPING).map(Number);
    let deals = await PipedriveRepository.fetchDealsInStages(stagesToProcess);

    deals = await deduplicateDeals(deals);

    for (const deal of deals) {
        try {
            const stepInfo = WORKFLOW_STAGE_MAPPING[deal.stage_id];
            const nucleus = (deal[CUSTOM_FIELDS.LABEL] || 'NDados');
            const isOwnerActive = activeUsers.includes(deal.user_id?.id);

            // Neste novo paradigma, passamos todas flags no payload para que o Agente decida o tom e a reescrita
            const notes = await PipedriveRepository.getNotesFromDeal(deal.id);
            const summaries = notes.filter((n: any) => n.content?.includes(AGENT_CONFIG.RESUMO_PREFIX)).sort((a: any, b: any) => new Date(b.add_time).getTime() - new Date(a.add_time).getTime());

            const summaryNote = summaries.length > 0 ? summaries[0] : null;
            if (!summaryNote) continue;

            const emailHistory = await PipedriveRepository.fetchEmailHistory(deal.id);

            const companyName = deal.org_name || "Desconhecida";
            const companySector = deal[CUSTOM_FIELDS.COMPANY_SECTOR] || "Não informado";
            const combinedInput = `Empresa: ${companyName}\nSetor: ${companySector}\n\nResumo Estratégico:\n${summaryNote.content}`;

            const payload = {
                input_as_text: combinedInput,
                cadencia: stepInfo.cadencia,
                etapa: stepInfo.passo,
                emails_anteriores: JSON.stringify(emailHistory),
                nucleo_nome_completo: getNucleusInfo(nucleus).nome_completo,
                nome_owner_desativado: isOwnerActive ? undefined : deal.user_id?.name // Contexto para o agente saber se tem dono inativo
            };

            const workflowTarget = isOwnerActive ? nucleus : 'OwnerInativo';
            const result: any = await executeAiWorkflow(workflowTarget, payload);

            if (result) {
                // A OpenAI Agents SDK retorna o output estruturado, 
                // geralmente como no Zod schema que você definiu na exportação
                const emailData = typeof result === 'string' ? JSON.parse(result) : result;

                if (emailData.titulo && emailData.corpo_html) {
                    await PipedriveRepository.saveEmailToDeal(deal.id, emailData.titulo, emailData.corpo_html);
                    console.log(`✅ E-mail do passo ${stepInfo.passo} (${stepInfo.cadencia}) gerado.`);
                }
            }

        } catch (e: any) {
            console.error(`Erro na geração de e-mail do Deal ${deal.id}: ${e.message}`);
        }
    }
}
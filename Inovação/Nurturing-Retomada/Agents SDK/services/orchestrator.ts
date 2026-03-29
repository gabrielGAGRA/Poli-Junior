import { runWorkflow as runNDados } from '../flows/fluxo_ndados';
import { runWorkflow as runNCon } from '../flows/fluxo_ncon';
import { runWorkflow as runNTec } from '../flows/fluxo_ntec';
import { runWorkflow as runNCiv } from '../flows/fluxo_nciv';
import { runWorkflow as runOwnerInativo } from '../flows/fluxo_owner_inativo';

const agentsWorkflows: Record<string, Function> = {
    'NDados': runNDados,
    'NCon': runNCon,
    'NTec': runNTec,
    'NCiv': runNCiv,
    'OwnerInativo': runOwnerInativo,
};

export async function executeAiWorkflow(target: string, payload: any) {
    let workflowFn = agentsWorkflows[target];

    if (!workflowFn) {
        if (target === 'Analista') {
            console.warn(`[Atenção] Fluxo 'Analista' não encontrado. Retornando resumo simulado até que o fluxo seja adicionado.`);
            return "Resumo Estratégico Pendente (Fluxo do Analista ainda não implementado na pasta flows)";
        }
        
        console.warn(`[Atenção] Nenhum fluxo encontrado para: ${target}. Usando NDados como fallback.`);
        workflowFn = agentsWorkflows['NDados'];
    }

    if (!workflowFn) {
        throw new Error("Nenhum fluxo de agente disponível. Verifique as importações.");
    }

    console.log(`🚀 Executando Agent SDK Workflow para: ${target}`);

    // O retorno da função gerada pelo SDK varia. Lidamos com os retornos aqui.
    return await workflowFn(payload);
}
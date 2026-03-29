import { syncAndSummarize, executeEmailCadence } from '../services/mainFlow';

// A Vercel possui limites estritos para funções Serverless na conta grátis (Hobby).
// O limite padrão é 10s e o MaxDuration grátis máximo é 60s.
export const maxDuration = 60; // Limite máximo do plano grátis configurado.

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Para evitar acesso público na API, deve-se conferir o CRON_SECRET que a própria Vercel injeta
    if (process.env.CRON_SECRET) {
        const authHeader = req.headers['authorization'];
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized CRON execution' });
        }
    }

    try {
        console.log("Iniciando rotina de orquestração de Agentes (Nurturing/Retomada)...");

        // Fase 1: Sincronização e Geração do Resumo Estratégico ("Cérebro")
        await syncAndSummarize();

        // Fase 2: Interpretação e Criação da Cadência ("Voz")
        await executeEmailCadence();

        return res.status(200).json({ success: true, message: 'Execução concluída com sucesso' });
    } catch (error: any) {
        console.error("Erro Crítico no processamento CRON: ", error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
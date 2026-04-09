// Autor: Gabriel Agra de Castro Motta
// Última atualização: 24/03/2026
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.
const PIPEDRIVE_API_TOKEN = 'SUA_CHAVE_AQUI';
const OPENAI_API_KEY = 'SUA_CHAVE_AQUI';
const PIPEDRIVE_API_BASE_URL = "https://polijunior.pipedrive.com/api/v1";

const REGRAS_CONFIG = {
    PIPELINE_RETOMADA: 15,
    PIPELINE_NURTURING: 16,
    STAGE_INDO_PARA_EMAIL_1: 85,
    STAGE_ESPERA: 80,
    DIRETOR_ID: 15199383, // ID DE USUARIO DA DIRETORIA
    MAX_CARDS_PROCESS_LIMIT: 10, // Limita o número de cards processados em uma execução
    PLANILHA_LOGS_IA_ID: "1fvgjELHcDPRK5PoNu6fINayDHxnwdsref72pWzVYr1Q"
};

const AGENT_CONFIG = {
    RESUMO_PREFIX: "[RESUMO ESTRATÉGICO]",
    WORKFLOW_ANALISTA_ID: "Flow_FluxoAtas",

    WORKFLOW_REDACAO_ATIVO: {
        'NDados': "Flow_FluxoNDados",
        'NCon': "Flow_FluxoNCon",
        'NTec': "Flow_FluxoNTec",
        'NCiv': "Flow_FluxoNCiv"
    },

    WORKFLOW_REDACAO_INATIVO: "Flow_FluxoOwnerInativo"
};

const CUSTOM_FIELDS = {
    EMAIL_TITLE: "74647c02e74ca7b4d0f98a71cfdc436bac8f0f5d",
    EMAIL_BODY: "e616420fb16e671963854114c6bba6bd5c3bcef1",
    LABEL: "label", // Núcleo
    COMPANY_SECTOR: "6ea1ea74da5fbb8cb6a8dd741a96a9bc8b4e379f",
    ORIGIN_ID_FIELD: "e465d18813a12b0bbd089af1996b1090751ab057",
    DATA_RETOMADA: "91cf62129f1fb478eb05f1aaa580952967f55e27"
};

// Mapeia estágios de funil específicos em cadencia e passo para automação de workflows de IA
const WORKFLOW_STAGE_MAPPING = {
    85: { passo: 1, cadencia: "Retomada" },
    83: { passo: 2, cadencia: "Retomada" },
    82: { passo: 3, cadencia: "Retomada" },
    87: { passo: 4, cadencia: "Retomada (Breakup)" },

    90: { passo: 1, cadencia: "Nurturing" },

    97: { passo: 1, cadencia: "Nurturing Final" },
    99: { passo: 2, cadencia: "Nurturing Final" },
    101: { passo: 3, cadencia: "Nurturing Final (Breakup)" }
};

const MAINTENANCE_CONFIG = {
    HUNTER_CLEANUP_FILTERS: [1892, 1901]
};

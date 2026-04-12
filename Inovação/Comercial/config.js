// Autor: Gabriel Agra de Castro Motta
// Última atualização: 24/03/2026
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.
const PIPEDRIVE_API_TOKEN = '';
const OPENAI_API_KEY = '';

const PIPEDRIVE_API_BASE_URL = "https://polijunior.pipedrive.com/api/v1";

const REGRAS_CONFIG = {
    PIPELINE_RETOMADA: 15,
    PIPELINE_NURTURING: 16,
    STAGE_INDO_PARA_EMAIL_1: 85,
    STAGE_ESPERA: 80,
    DIRETOR_ID: 15199383, // ID DE USUARIO DA DIRETORIA
    MAX_CARDS_PROCESS_LIMIT: 30, // Limita o número de cards processados em uma execução
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

const CUSTOM_FIELDS_MAP = {
    "Email Title": "EMAIL_TITLE",
    "Email Body": "EMAIL_BODY",
    "Label": "LABEL",
    "Setor da Empresa": "COMPANY_SECTOR",
    "ID de Origem": "ORIGIN_ID_FIELD",
    "Data de Retomada": "DATA_RETOMADA"
};

/**
 * Funções de acesso dinâmico baseadas na planilha e cache, 
 * substituindo os IDs e chaves hardcoded
 */
function getCustomFields() {
    const { fieldMapping } = getDynamicFieldMappingCached(); // Do motor de metadados
    const dynamicFields = {};

    // Busca inversamente pelo nome do campo na API Pipedrive
    Object.entries(fieldMapping).forEach(([key, name]) => {
        if (CUSTOM_FIELDS_MAP[name]) {
            dynamicFields[CUSTOM_FIELDS_MAP[name]] = key;
        }
    });

    return dynamicFields;
}

function getWorkflowStageMapping() {
    // Pode ser estendido lendo também métricas de workflow dinamicamente da planilha
    return {
        85: { passo: 1, cadencia: "Retomada" },
        83: { passo: 2, cadencia: "Retomada" },
        82: { passo: 3, cadencia: "Retomada" },
        87: { passo: 4, cadencia: "Retomada (Breakup)" },

        90: { passo: 1, cadencia: "Nurturing" },

        97: { passo: 1, cadencia: "Nurturing Final" },
        99: { passo: 2, cadencia: "Nurturing Final" },
        101: { passo: 3, cadencia: "Nurturing Final (Breakup)" }
    };
}

const MAX_EXECUTION_TIME = 25 * 60 * 1000 // 25 min

const MAIN_SHEET_NAME = "Base_Pipedrive"

const MAINTENANCE_CONFIG = {
    HUNTER_CLEANUP_FILTERS: [1892, 1901]
};

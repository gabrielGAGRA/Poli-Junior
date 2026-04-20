// Autor: Gabriel Agra de Castro Motta
// Última atualização: 24/03/2026
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/* 
  Chaves de API e URL
*/
const PIPEDRIVE_API_TOKEN = '';
const OPENAI_API_KEY = 'sk-proj-';

const PIPEDRIVE_API_BASE_URL = "https://polijunior.pipedrive.com/api/v1";

/* 
  Detalhes pra Nutrição/Retomada
*/
// Edite os nomes dos estágios aqui caso mudem
const RAW_CONFIG = {
    REGRAS_CONFIG: {
        PIPELINE_RETOMADA: "Retomada",
        PIPELINE_NURTURING: "Nutrição",
        STAGE_INDO_PARA_EMAIL_1: "Indo para E-mail 1",
        STAGE_ENVIO_EMAIL_1: "Começo",
        STAGE_ESPERA: "Espera",

        MAX_CARDS_PROCESS_LIMIT: 10,
        PLANILHA_LOGS_IA_ID: "1fvgjELHcDPRK5PoNu6fINayDHxnwdsref72pWzVYr1Q"
    },

    CUSTOM_FIELDS: {
        EMAIL_TITLE: "Título do E-mail",
        EMAIL_BODY: "Corpo E-mail",
        LABEL: "Etiqueta",
        COMPANY_SECTOR: "Setor da Empresa",
        ORIGIN_ID_FIELD: "Origem",
        DATA_RETOMADA: "Data de Retomada"
    },

    WORKFLOW_CADENCES: [
        "Retomada", "Nutrição"
    ]
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

const MAIN_SHEET_NAME = 'Base_Pipedrive';

const MAINTENANCE_CONFIG = {
    HUNTER_CLEANUP_FILTERS: [1892, 1901]
};
// Autor: Gabriel Agra de Castro Motta
// Última atualização: 24/03/2026
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

// =================================================================================
// BRIDGE SERVER CONFIGURATION (PYTHON)
// =================================================================================
const BRIDGE_SERVER_URL = "https://poli-junior.vercel.app/";
const BRIDGE_AUTH_TOKEN = "POLIJUNIOR";


const PIPEDRIVE_API_TOKEN = '';
const OPENAI_API_KEY = 'sk-proj-';


const PIPEDRIVE_API_BASE_URL = "https://polijunior.pipedrive.com/api/v1";


/**
 * =================================================================================
 * IA & MULTI-AGENT CONFIGURATION (RETOMADA E NURTURING)
 * =================================================================================
 */

const AGENT_CONFIG = {
    RESUMO_PREFIX: "[RESUMO ESTRATÉGICO]",
    WORKFLOW_ANALISTA_ID: "wf_69bc77d2297c819087c560a4f45560730cc557b20c370acf",

    // Workflows de Redação Ativa (Owner Ativo)
    WORKFLOW_REDACAO_ATIVO: {
        'NDados': "wf_69a712cef21c8190bcc1c573a9feaad40c5ca413b5fe04d2",
        'NCon': "wf-",
        'NTec': "wf-",
        'NCiv': "wf-"
    },

    // Workflow de Redação Inativa (Owner Inativo) - Único para todos os núcleos
    WORKFLOW_REDACAO_INATIVO: "wf-"
};


/**
 * =================================================================================
 * RETOMADA CONFIGURATION
 * =================================================================================
 */
const CUSTOM_FIELDS = {
    EMAIL_TITLE: "74647c02e74ca7b4d0f98a71cfdc436bac8f0f5d",
    EMAIL_BODY: "e616420fb16e671963854114c6bba6bd5c3bcef1",
    LABEL: "label", // Núcleo
    COMPANY_SECTOR: "eabf279da192f1d3d2a72a49845154b1e9a848f7",
    ORIGIN_ID_FIELD: "e465d18813a12b0bbd089af1996b1090751ab057"
};


// Mapeamento das etapas do funil para o orquestrador (IA)
const WORKFLOW_STAGE_MAPPING = {
    // Pipeline Retomada (ID: 15)
    85: { passo: 1, cadencia: "Retomada" },           // "Indo para E-mail 1"
    83: { passo: 2, cadencia: "Retomada" },           // "Indo para E-mail 2"
    82: { passo: 3, cadencia: "Retomada" },           // "Indo para E-mail 3"
    87: { passo: 4, cadencia: "Retomada (Breakup)" }, // "Indo para Breakup"

    // Pipeline Nurturing (ID: 16)
    90: { passo: 1, cadencia: "Nurturing" },          // "Preparando Nurturing"

    // Pipeline Nurturing Final
    97: { passo: 1, cadencia: "Nurturing Final" },    // "Preparar E-mail 1"
    99: { passo: 2, cadencia: "Nurturing Final" },    // "Preparar E-mail 2"
    101: { passo: 3, cadencia: "Nurturing Final (Breakup)" } // "Preparar Breakup"
};


/**
 * =================================================================================
 * MAINTENANCE AND CLEANUP CONFIGURATION
 * =================================================================================
 */
const MAINTENANCE_CONFIG = {
    HUNTER_CLEANUP_FILTERS: [1892, 1901],
    DUPLICATE_FILTERS: [11953, 11955]
};

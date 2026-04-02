// Autor: Gabriel Agra de Castro Motta
// Última atualização: 24/03/2026
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.
const PIPEDRIVE_API_TOKEN = '';
const OPENAI_API_KEY = 'sk-proj-';
const PIPEDRIVE_API_BASE_URL = "https://polijunior.pipedrive.com/api/v1";

/**
 * RETOMADA E NURTURING
 */
const REGRAS_CONFIG = {
    PIPELINE_RETOMADA: 15,
    PIPELINE_NURTURING: 16,
    STAGE_INDO_PARA_EMAIL_1: 85,
    STAGE_ESPERA: 80,
    DIRETOR_ID: 15199383 // ID DE USUARIO DA DIRETORIA
};

const AGENT_CONFIG = {
    RESUMO_PREFIX: "[RESUMO ESTRATÉGICO]",
    WORKFLOW_ANALISTA_ID: "wf_69bc77d2297c819087c560a4f45560730cc557b20c370acf",

    // Workflows de Redação Ativa (Owner Ativo)
    WORKFLOW_REDACAO_ATIVO: {
        'NDados': "wf_69a712cef21c8190bcc1c573a9feaad40c5ca413b5fe04d2",
        'NCon': "wf_69c704699c8c8190aa2296db6f9d099f031886730727725a",
        'NTec': "wf_69c7051dd6e88190a82686f25179e94e035f168ddd772534",
        'NCiv': "wf_69c705a5e28c819099d2d6d02c07f58a0bfd898339670293"
    },

    // Workflow de Redação Inativa (Owner Inativo) - Único para todos os núcleos
    WORKFLOW_REDACAO_INATIVO: "wf_69c707b63364819085fed5a72e4b25cc001ba6e3b68d629c"
};

const CUSTOM_FIELDS = {
    EMAIL_TITLE: "74647c02e74ca7b4d0f98a71cfdc436bac8f0f5d",
    EMAIL_BODY: "e616420fb16e671963854114c6bba6bd5c3bcef1",
    LABEL: "label", // Núcleo
    COMPANY_SECTOR: "6ea1ea74da5fbb8cb6a8dd741a96a9bc8b4e379f",
    ORIGIN_ID_FIELD: "e465d18813a12b0bbd089af1996b1090751ab057",
    DATA_RETOMADA: "91cf62129f1fb478eb05f1aaa580952967f55e27"
};

// Mapeamento das etapas do funil
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
 *  Cards Abandonados de Hunter
 */
const MAINTENANCE_CONFIG = {
    HUNTER_CLEANUP_FILTERS: [1892, 1901]
};

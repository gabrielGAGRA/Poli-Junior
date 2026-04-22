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
// Regra prática:
// - IDs/keys são a base para lógica e integrações.
// - Nomes ficam como fallback humano para resolução e manutenção.
const RAW_CONFIG = {
    REGRAS_CONFIG: {
        PIPELINE_RETOMADA: "Retomada",
        PIPELINE_NURTURING: "Nutrição",
        STAGE_INDO_PARA_EMAIL_1: "Preparando E-mail 1",
        STAGE_ENVIO_EMAIL_1: "Começo",
        STAGE_ESPERA: "Espera",

        // IDs Fixos como Fallback
        ID_STAGE_INDO_PARA_EMAIL_1: 85,
        ID_STAGE_ENVIO_EMAIL_1: 81,
        ID_STAGE_ESPERA: 80,

        MAX_CARDS_PROCESS_LIMIT: 10,
        PLANILHA_LOGS_IA_ID: "1fvgjELHcDPRK5PoNu6fINayDHxnwdsref72pWzVYr1Q"
    },

    CUSTOM_FIELDS: {
        EMAIL_TITLE: "Título do E-mail",
        EMAIL_BODY: "Corpo do E-mail",
        LABEL: "Etiqueta",
        COMPANY_SECTOR: "Setor da Empresa",
        ORIGIN_ID_FIELD: "ID de Origem",
        DATA_RETOMADA: "Data Retomada"
    },

    ENTITIES: {
        PIPELINES: {
            RETOMADA: { name: "Retomada", id: 15 },
            NURTURING: { name: "Nutrição", id: 16 }
        },

        STAGES: {
            INDO_PARA_EMAIL_1: { name: "Preparando E-mail 1", id: 85 },
            ENVIO_EMAIL_1: { name: "Começo", id: 81 },
            ESPERA: { name: "Espera", id: 80 }
        },

        CUSTOM_FIELDS: {
            EMAIL_TITLE: { name: "Título do E-mail", key: "74647c02e74ca7b4d0f98a71cfdc436bac8f0f5d" },
            EMAIL_BODY: { name: "Corpo do E-mail", key: "e616420fb16e671963854114c6bba6bd5c3bcef1" },
            LABEL: { name: "Etiqueta", key: "label" },
            COMPANY_SECTOR: { name: "Setor da Empresa", key: "6ea1ea74da5fbb8cb6a8dd741a96a9bc8b4e379f" },
            ORIGIN_ID_FIELD: { name: "ID de Origem", key: "e465d18813a12b0bbd089af1996b1090751ab057" },
            DATA_RETOMADA: { name: "Data Retomada", key: "91cf62129f1fb478eb05f1aaa580952967f55e27" }
        }
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

const CONFIG = new Proxy({}, { get: (_, prop) => getResolvedConfig()[prop] });
const REGRAS_CONFIG = new Proxy({}, { get: (_, prop) => getResolvedConfig().REGRAS_CONFIG[prop] });
const CUSTOM_FIELDS = new Proxy({}, {
    get: (_, prop) => {
        const value = getResolvedConfig().CUSTOM_FIELDS[prop];
        return value && typeof value === 'object' && 'key' in value ? value.key : value;
    }
});
const WORKFLOW_STAGE_MAPPING = new Proxy({}, {
    get: (_, prop) => getResolvedConfig().WORKFLOW_STAGE_MAPPING[prop],
    ownKeys: () => Reflect.ownKeys(getResolvedConfig().WORKFLOW_STAGE_MAPPING),
    getOwnPropertyDescriptor: (_, prop) => Reflect.getOwnPropertyDescriptor(getResolvedConfig().WORKFLOW_STAGE_MAPPING, prop)
});
// Autor: Gabriel Agra de Castro Motta
// Última atualização: 24/03/2026
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.
const PIPEDRIVE_API_TOKEN = '';
const OPENAI_API_KEY = '';

const PIPEDRIVE_API_BASE_URL = "https://polijunior.pipedrive.com/api/v1";

// Dicionário de Nomes e Valores Fixos. Edite os nomes aqui caso mudem na planilha.
const RAW_CONFIG = {
    REGRAS_CONFIG: {
        PIPELINE_RETOMADA: "Retomada",
        PIPELINE_NURTURING: "Nutrição",
        STAGE_INDO_PARA_EMAIL_1: "Indo para E-mail 1", // Estágio de preparo de e-mail (segundo estágio)
        STAGE_ENVIO_EMAIL_1: "Começo", // Estágio de envio
        STAGE_ESPERA: "Espera",

        DIRETOR_ID: 15199383,
        MAX_CARDS_PROCESS_LIMIT: 30,
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
        "Retomada", "Nutrição"  // Nomes das pipelines para ler os estágios na ordem
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

const MAINTENANCE_CONFIG = {
    HUNTER_CLEANUP_FILTERS: [1892, 1901]
};

// Referências dinâmicas exportadas sem quebrar o restante dos códigos
const REGRAS_CONFIG = new Proxy({}, { get: (_, prop) => getResolvedConfig().REGRAS_CONFIG[prop] });
const CUSTOM_FIELDS = new Proxy({}, { get: (_, prop) => getResolvedConfig().CUSTOM_FIELDS[prop] });
const WORKFLOW_STAGE_MAPPING = new Proxy({}, {
    get: (_, prop) => getResolvedConfig().WORKFLOW_STAGE_MAPPING[prop],
    ownKeys: () => Reflect.ownKeys(getResolvedConfig().WORKFLOW_STAGE_MAPPING),
    getOwnPropertyDescriptor: (_, prop) => Reflect.getOwnPropertyDescriptor(getResolvedConfig().WORKFLOW_STAGE_MAPPING, prop)
});
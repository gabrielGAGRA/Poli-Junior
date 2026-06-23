// Autor: Gabriel Agra de Castro Motta
// Última atualização: 12/06/2026
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/* 
  Chaves de API e URL
*/
const PIPEDRIVE_API_TOKEN = '';
const OPENAI_API_KEY = 'sk-proj-';

const PIPEDRIVE_API_BASE_URL = "https://polijunior.pipedrive.com/api/v1";

/* 
    Nutrição + Retomada
    
    COMPORTAMENTO DE MAPEAMENTO DINÂMICO (Sem Hardcode de IDs/Keys):
    - As entidades são declaradas abaixo apenas pelo nome amigável (name).
    - O script "analisePipedrive.js" realiza a sincronização diária e salva na aba "Estágios" da planilha
      os mapeamentos atualizados de Estágios (colunas D, E e F) e Campos Customizados (colunas H e I).
    - Adicionalmente, as informações completas de pipelines/stages são salvas como JSON na célula B100.
    - Em tempo de execução, o motor resolve dinamicamente os IDs e chaves das APIs lendo os valores
      salvos na planilha e no cache (através da função getResolvedConfig em analisePipedrive.js).
    - Fallbacks estáticos pré-definidos são utilizados caso a aba de cache esteja inacessível ou vazia.
*/
const CONFIG_BASE = {
    ENTITIES: {
        PIPELINES: {
            RETOMADA: { name: "Retomada" },
            NURTURING: { name: "Nutrição" }
        },

        STAGES: {
            INDO_PARA_EMAIL_1: { name: "Preparando E-mail 1" },
            ENVIO_EMAIL_1: { name: "Começo" },
            ESPERA: { name: "Espera" }
        },

        CUSTOM_FIELDS: {
            EMAIL_TITLE: { name: "Título do E-mail" },
            EMAIL_BODY: { name: "Corpo do E-mail" },
            LABEL: { name: "Etiqueta" },
            COMPANY_SECTOR: { name: "Setor da Empresa" },
            ORIGIN_ID_FIELD: { name: "ID de Origem" },
            DATA_RETOMADA: { name: "Data Retomada" },
            STATUS_RETOMADA: { name: "Status de Retomada" }
        }
    },

    OPERATIONS: {
        SUMMARY: {
            // O tempo máximo de execução é unificado via MAX_EXECUTION_TIME em config_tecnico.js.
            get GAS_RUNTIME_BUDGET_MS() { return MAX_EXECUTION_TIME; },
            // Tempo máximo reservado para a chamada/batch da OpenAI dentro do fluxo de resumo.
            OPENAI_CHUNK_SIZE: 4,
            EMPTY_NOTES_DELETE_CAP: 100
        },

        EMAIL: {
            get GAS_RUNTIME_BUDGET_MS() { return MAX_EXECUTION_TIME; },
            OPENAI_CHUNK_SIZE: 3
        },

        METADATA: {
            get MAX_EXECUTION_TIME_MS() { return MAX_EXECUTION_TIME; }
        },

        CONTINUATION: {
            // Espaçamento entre triggers de "continuação"
            CONTINUATION_DELAY_MS: 10 * 60 * 1000, //10min
            // Evita reescalonamento agressivo por falhas consecutivas
            CONTINUATION_MIN_SCHEDULE_INTERVAL_MS: 8 * 60 * 1000, //8min
            CONTINUATION_MAX_RUNS_PER_DAY: 12,
            CONTINUATION_MAX_GENERATIONS: 10
        },

        CACHE: {
            DEAL_FAILURE_ENTRY_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000, // 7 dias
            DEAL_FAILURE_CACHE_MAX_ITEMS: 500,
            SUMMARIZED_DEALS_CACHE_MAX_ITEMS: 300,
            SUMMARIZED_DEALS_CACHE_MAX_AGE_MS: 181 * 24 * 60 * 60 * 1000 // 181 dias
        },

        BATCH: {
            get OPENAI_BATCH_RUNTIME_BUDGET_MS() { return MAX_EXECUTION_TIME; },
            OPENAI_CHUNK_SIZE: 3,
            LOG_BATCH_SHEET_NAME: "IA - Retomada (Logs)"
        }
    },

    EMAIL_ALERTA_PRODUCAO: "comercial@polijunior.com.br",
    PLANILHA_LOGS_IA_ID: "1fvgjELHcDPRK5PoNu6fINayDHxnwdsref72pWzVYr1Q"
};

const AGENT_CONFIG = {
    RESUMO_PREFIX: "[RESUMO ESTRATÉGICO]",

    WORKFLOW_ANALISTA_ID: "Flow_FluxoAtas",
    WORKFLOW_REDACAO_EMAIL: {
        'NDados': "Flow_FluxoNDados",
        'NCon': "Flow_FluxoNCon",
        'NTec': "Flow_FluxoNTec",
        'NCiv': "Flow_FluxoNCiv"
    },

    WORKFLOW_REDACAO_EMAIL_INATIVO: "Flow_FluxoOwnerInativo"
};



/* 
    Análise Pipedrive
*/
const DATABASE_SHEET_NAME = 'Base_Pipedrive';



/* 
    Deleta Cards de Hunter Antigos
*/
const HUNTER_CLEANUP_CONFIG = {
    HUNTER_CLEANUP_FILTERS: [1892, 1901]
};



/* 
    Obtém IDs dos campos pelo ID ou pelo nome (caso um dos dois tenha mudado)
*/
// CONFIG expõe as entidades já resolvidas com id/key prontos para uso.
const CONFIG = new Proxy({}, { get: (_, prop) => getResolvedConfig()[prop] });

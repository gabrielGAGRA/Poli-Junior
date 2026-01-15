// Autor: Gabriel Agra de Castro Motta
// Última atualização: 12/12/2025
// Descrição: Configurações globais de API, autenticação e campos customizados do Pipedrive.
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/**
 * =================================================================================
 * GENERAL CONFIGURATION
 * API Keys, Pipedrive URL, request options, call limits
 * =================================================================================
 */
const PIPEDRIVE_API_TOKEN = PropertiesService.getScriptProperties().getProperty('PIPEDRIVE_API_TOKEN');
const PIPEDRIVE_API_BASE_URL = "https://polijunior.pipedrive.com/api/v1";

const DEFAULT_REQUEST_OPTIONS = {
    method: "get",
    contentType: "application/json",
    muteHttpExceptions: true,
};

const GET_REQUEST_OPTIONS = {
    method: 'get',
    muteHttpExceptions: true
};

let callCounter = 0;
const MAX_CALL_LIMIT = 80000;

/**
 * =================================================================================
 * RETOMADA CONFIGURATION
 * =================================================================================
 */
const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
const OPENAI_API_KEY = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');

const CUSTOM_FIELDS = {
    EMAIL_TITLE: "74647c02e74ca7b4d0f98a71cfdc436bac8f0f5d",
    EMAIL_BODY: "e616420fb16e671963854114c6bba6bd5c3bcef1",
    LABEL: "label", // Key for "Núcleo" field
    COMPANY_SECTOR: "eabf279da192f1d3d2a72a49845154b1e9a848f7",
    ORIGIN: "97d0502cc2b489986844a93b374656e5acf179e1",
    SUB_ORIGIN: "4fd6987bdbb61585b82d4fe99ed0cf6cbb2b2218",
    PORTFOLIO: "e4339ab04542dcd1e1215e4bc17ee2bcf45a9652",
    BUDGET: "5c69564ae115792817cb41b28249c8a1dd08b50f",
    VALUE: "value",
    EMPLOYEE_COUNT: "0b2be49fb7615b170878d944a7cb05f6ec8f9e27",
    RETOMADA: "212b2d53b667fdb5689b3f5c0a9abaf747b998b2",
    RETOMADA_DATE: "91cf62129f1fb478eb05f1aaa580952967f55e27",
    NURTURING_STEP: "b5ba71c0b89dfebaee61d9e3827a35ba7b6c7b67"
};

// IDs of Retomada funnel stages (Pipeline ID: 15)
// Automation will search for deals in these stages.
const RETOMADA_STAGES = [
    85, // "Indo para E-mail 1"
    83, // "Indo para E-mail 2"
    82, // "Indo para E-mail 3"
    87  // "Indo para Breakup"
];

// IDs of Nurturing funnel stages (Pipeline ID: 16)
// Automation will search for deals in these stages.
const NURTURING_STAGES = [
    90, // "Preparando Nurturing"
];

// IDs of Final Nurturing funnel stages (Pipeline ID: 16)
// Automation will search for deals in these stages.
const FINAL_NURTURING_STAGES = [
    97, // "Preparar E-mail 1"
    99, // "Preparar E-mail 2"
    101 // "Preparar Breakup"
];

// ASSISTANTS FOR LABEL "NDados" (Data/Analytics Deals)
const ASSISTANT_ID_ANALYST_NDADOS = 'asst_FJdINNWt2fAKDC9ch1ybL7fq';
const ASSISTANT_ID_NURTURING_NDADOS = 'asst_rzryelqqJQJkymUl2uDMwQXy';
const ASSISTANT_ID_RETOMADA_NDADOS = 'asst_pgO2FIgqGtYZTWZaAl6PdjSv';
const ASSISTANT_ID_FINAL_NURTURING_NDADOS = 'asst_ZMPYZe6VYm4WbtEN7hn5jgwQ';

// ASSISTANTS FOR LABEL "NCon" (Consulting Deals)
const ASSISTANT_ID_ANALYST_NCON = 'asst_erJMxgjgBhkMhNn8Gvxusn86';
const ASSISTANT_ID_NURTURING_NCON = 'asst_0mOEdlIfi7ENzhOFBcZod1Rd';
const ASSISTANT_ID_RETOMADA_NCON = 'asst_65pvy1KGkBv9W3WLyDS7jzET';
const ASSISTANT_ID_FINAL_NURTURING_NCON = 'asst_erJMxgjgBhkMhNn8Gvxusn86';

// DEFAULT ASSISTANTS (Fallback for unmapped labels)
const ASSISTANT_ID_ANALYST = ASSISTANT_ID_ANALYST_NDADOS;
const ASSISTANT_ID_NURTURING = ASSISTANT_ID_NURTURING_NDADOS;
const ASSISTANT_ID_RETOMADA = ASSISTANT_ID_RETOMADA_NDADOS;
const ASSISTANT_ID_FINAL_NURTURING = ASSISTANT_ID_FINAL_NURTURING_NDADOS;

/**
 * =================================================================================
 * STAGE TIMES
 * Everything needed for stage timing
 * =================================================================================
 */
// Filters for the standard STAGE TIMES report
const STAGE_TIME_FILTER_MAP = {
    3: 1148,  // Secretaria
    5: 1149,  // SDR
    6: 1150,  // Vendas (Coord)
    9: 1151   // Pré-Vendas (Hunter)
};

// Filters for the NDADOS report
const NDADOS_FILTER_MAP = {
    3: 1213,  // Secretaria
    5: 1211,  // SDR
    6: 1210,  // Vendas (Coord)
    9: 1212   // Pré-Vendas (Hunter)
};

/**
 * @typedef {Object} StageConfig
 * @property {string} name - The name of the stage.
 * @property {string} funnel - The name of the funnel the stage belongs to.
 */
const STAGE_CONFIG = {
    15: { name: "Lista", funnel: "Secretária" },
    16: { name: "Primeiro Contato", funnel: "Secretária" },
    17: { name: "Segundo Contato", funnel: "Secretária" },
    18: { name: "Lead", funnel: "Secretária" },
    26: { name: "Lead", funnel: "Pré-Vendas (SDR)" },
    27: { name: "Qualificação", funnel: "Pré-Vendas (SDR)" },
    28: { name: "Pré - AT", funnel: "Pré-Vendas (SDR)" },
    29: { name: "Análise Técnica", funnel: "Pré-Vendas (SDR)" },
    31: { name: "AT - Diagnóstico", funnel: "Vendas (Coord)" },
    32: { name: "Cold Leads ❄", funnel: "Vendas (Coord)" },
    33: { name: "AT - Aprof", funnel: "Vendas (Coord)" },
    34: { name: "Proposta", funnel: "Vendas (Coord)" },
    35: { name: "Negociação", funnel: "Vendas (Coord)" },
    36: { name: "Aprov Verbal (Contrato)", funnel: "Vendas (Coord)" },
    49: { name: "Prospect", funnel: "Pré-Vendas (Hunter)" },
    50: { name: "Respondido", funnel: "Pré-Vendas (Hunter)" },
    51: { name: "AT Marcada", funnel: "Pré-Vendas (Hunter)" },
    90: { name: "Preparando Nurturing", funnel: "Nurturing" }
};

const MAIN_STAGES = [15, 16, 17, 18, 26, 27, 28, 29, 31, 32, 33, 34, 35, 36];
const HUNTER_STAGES = [49, 50, 51];

/**
 * Helper function to get IDs of all custom deal fields
 */
function getCustomFieldIDs() {
    const url = `${PIPEDRIVE_API_BASE_URL}/dealFields?api_token=${PIPEDRIVE_API_TOKEN}`;

    try {
        const response = UrlFetchApp.fetch(url, GET_REQUEST_OPTIONS);
        const result = JSON.parse(response.getContentText());

        if (!result.success || !result.data) {
            console.error('Error fetching custom fields:', JSON.stringify(result));
            return null;
        }

        console.log('\n=== CUSTOM DEAL FIELDS ===\n');

        // Filter and display relevant custom fields
        result.data.forEach(field => {
            // Show only fields that are not system defaults
            if (field.key && field.key.length > 10) {
                console.log(`Name: ${field.name}`);
                console.log(`Key/ID: ${field.key}`);
                console.log(`Type: ${field.field_type}`);
                console.log('---');
            }
        });

        // Specifically look for "Passo Nurturing" field
        const nurturingStepField = result.data.find(
            field => field.name && field.name.toLowerCase().includes('passo')
        );

        if (nurturingStepField) {
            console.log('\n✅ "PASSO NURTURING" FIELD FOUND:');
            console.log(`ID to use in code: ${nurturingStepField.key}`);
            console.log('\nCopy this ID and paste into CUSTOM_FIELDS.NURTURING_STEP');
        } else {
            console.log('\n⚠️ "Passo Nurturing" field not found.');
            console.log('Make sure to create a "Number" type field with this name.');
        }

        return result.data;

    } catch (e) {
        console.error(`Error getting custom fields: ${e.toString()}`);
        return null;
    }
}

/**
 * =================================================================================
 * REPORT AND ANALYSIS CONFIGURATION
 * =================================================================================
 */
const ANALYSIS_FILTER_ID = 8812; // Filter ID for analisePipedrive.js
const LIMIT_PER_PAGE = 500;

const REPORT_CONFIG = {
    PIPEDRIVE: {
        IGNORED_OWNERS: ['Francine'],
        VALID_STAGES: [26, 27, 28, 29, 31, 32, 33, 34, 35, 36],
        NUCLEO_MAPPING: {
            31: 'NCiv',
            33: 'Ncon',
            32: 'NDados',
            34: 'NTec',
            152: 'WI'
        }
    },
    EMAILS: {
        CONFIG_BY_NUCLEO: {
            'NDados': { intro: 'DAAADOOOS, seguem informações do funil de hoje:\n\n' },
            'Ncon': { intro: 'NCONNNNN, seguem informações do funil de hoje:\n\n' },
            'NCiv': { intro: 'N?CIIVVVVV, seguem informações do funil de hoje:\n\n' },
            'NTec': { intro: 'NTECCCCCCC, seguem informações do funil de hoje:\n\n' },
            'WI': { intro: 'WIIIIIIIII, seguem informações do funil de hoje:\n\n' }
        }
    }
};

/**
 * =================================================================================
 * MAINTENANCE AND CLEANUP CONFIGURATION
 * =================================================================================
 */
const MAINTENANCE_CONFIG = {
    HUNTER_CLEANUP_FILTERS: [1892, 1901],
    DUPLICATE_FILTERS: [11953, 11955],
    DUPLICATE_ACTION_MODE: 'DELETE', // 'DELETE' or 'LOST'
    DUPLICATE_LOST_REASON: 'Duplicidade detectada via Script (Limpeza Automática)'
};

/**
 * =================================================================================
 * NOTE SYNCHRONIZATION CONFIGURATION
 * =================================================================================
 */
const WAITING_STAGES = {
    CYCLIC_NURTURING: 89,
    RETOMADA: 80
};

const ORIGIN_ID_FIELD = "e465d18813a12b0bbd089af1996b1090751ab057";

/**
 * =================================================================================
 * BATCH / PARALLELISM CONFIGURATION
 * =================================================================================
 */
const BATCH_CONFIG = {
    PARALLEL_BATCH_SIZE: 50,
    MAX_ATTEMPTS_PER_BATCH: 2,
    MAX_CONSECUTIVE_BATCH_ERRORS: 2,
    BASE_BACKOFF_TIME_MS: 2000
};

/**
 * =================================================================================
 * AGENT AND CADENCE CONFIGURATION (RETOMADA/NURTURING)
 * =================================================================================
 */
const AGENT_CONFIG = {
    CACHE_EXPIRATION_SECONDS: 2592000, // 30 days
    OPENAI_MAX_ATTEMPTS: 30,
    OPENAI_SEARCH_INTERVAL_MS: 2000,
    PIPEDRIVE_DELAY_MS: 300,
};

const CADENCE_NAMES = {
    nurturing: 'Nurturing',
    retomada: 'Retomada',
    final_nurturing: 'Retomada Final'
};

const LABEL_CONFIG = {
    'NDados': {
        assistants: {
            analyst: ASSISTANT_ID_ANALYST_NDADOS,
            nurturing: ASSISTANT_ID_NURTURING_NDADOS,
            retomada: ASSISTANT_ID_RETOMADA_NDADOS,
            final_nurturing: ASSISTANT_ID_FINAL_NURTURING_NDADOS
        },
        researcher_prompt: {
            system: `Você é um Agente de IA especialista em pesquisa de mercado e inteligência de negócios para DADOS, ANALYTICS, INTELIGENCIA ARTIFICIAL e BUSINESS INTELLIGENCE.

REGRAS DE PESQUISA:
1. CRÍTICO: Use sua ferramenta de busca interna para encontrar links e fontes REAIS.
2. NÃO INVENTE links ou fontes. É melhor deixar o campo "link" nulo ou vazio do que fornecer um link falso.
3. Pare a pesquisa quando encontrar um insight muito relevante ao contexto
4. Dê PREFERÊNCIA a fontes como McKinsey, BCG, Bain, Accenture. Pode utilizar outras consultorias ou relatórios. Nunca utilize fontes de vídeos.
5. Evite informações genéricas ou óbvias

FORMATO DA RESPOSTA:
Retorne APENAS um objeto JSON válido com os resultados da pesquisa estruturados.
Se um link real não for encontrado para um insight, retorne "link": null.`
        }
    },

    'NCon': {
        assistants: {
            analyst: ASSISTANT_ID_ANALYST_NCON,
            nurturing: ASSISTANT_ID_NURTURING_NCON,
            retomada: ASSISTANT_ID_RETOMADA_NCON,
            final_nurturing: ASSISTANT_ID_FINAL_NURTURING_NCON
        },
        researcher_prompt: {
            system: `Você é um Agente de IA especialista em pesquisa de mercado e inteligência de negócios para GESTÃO EMPRESARIAL, CONSULTORIA ESTRATÉGICA E TRANSFORMAÇÃO ORGANIZACIONAL.

REGRAS DE PESQUISA:
1. CRÍTICO: Use sua ferramenta de busca interna para encontrar links e fontes REAIS.
2. NÃO INVENTE links ou fontes. É melhor deixar o campo "link" nulo ou vazio do que fornecer um link falso.
3. Pare a pesquisa quando encontrar um insight muito relevante ao contexto
4. Dê PREFERÊNCIA a fontes como McKinsey, BCG, Bain, Deloitte, PwC. Pode utilizar outras consultorias ou relatórios. Nunca utilize fontes de vídeos.
5. Evite informações genéricas ou óbvias

FORMATO DA RESPOSTA:
Retorne APENAS um objeto JSON válido com os resultados da pesquisa estruturados.
Se um link real não for encontrado para um insight, retorne "link": null.`
        }
    }
};

const DEFAULT_LABEL_CONFIG = {
    assistants: {
        analyst: ASSISTANT_ID_ANALYST,
        nurturing: ASSISTANT_ID_NURTURING,
        retomada: ASSISTANT_ID_RETOMADA,
        final_nurturing: ASSISTANT_ID_FINAL_NURTURING
    },
    researcher_prompt: {
        system: `Você é um Agente de IA especialista em pesquisa de mercado e inteligência de negócios. Sua tarefa é realizar pesquisas precisas e entregar insights relevantes e atualizados para apoiar estratégias de vendas consultivas.

REGRAS DE PESQUISA:
1. CRÍTICO: Use sua ferramenta de busca interna para encontrar links e fontes REAIS.
2. NÃO INVENTE links ou fontes. É melhor deixar o campo "link" nulo ou vazio do que fornecer um link falso.
3. Pare a pesquisa quando encontrar um insight muito relevante ao contexto
4. Dê PREFERÊNCIA a fontes como McKinsey, BCG, Bain, Accenture. Pode utilizar outras consultorias ou relatórios. Nunca utilize fontes de vídeos.
5. Evite informações genéricas ou óbvias

FORMATO DA RESPOSTA:
Retorne APENAS um objeto JSON válido com os resultados da pesquisa estruturados.
Se um link real não for encontrado para um insight, retorne "link": null.`
    }
};

const CADENCE_CONFIG = {
    nurturing: {
        agent_type: 'nurturing',
        stages: NURTURING_STAGES,
        steps: {
            1: {
                content_type: "Agradecimento e Síntese de Insight",
                research_needed: true,
                research_instruction: (deal) => `Encontre uma "Síntese de Insight" de alta credibilidade (ex: McKinsey, Accenture, BCG, Bain) sobre o desafio no setor de "${deal["Setor da Empresa"]}" no Brasil ou globalmente.`
            },
            2: {
                content_type: "Estudo de Caso Detalhado",
                research_needed: false,
                research_instruction: null
            },
            3: {
                content_type: "Pergunta Provocativa",
                research_needed: true,
                research_instruction: (deal) => `Encontre uma notícia, relatório ou mudança recente e relevante para o setor de "${deal["Setor da Empresa"]}" para basear uma pergunta provocativa.`
            },
            4: {
                content_type: "Micro-Case de Sucesso",
                research_needed: false,
                research_instruction: null
            },
            5: {
                content_type: "Compartilhamento de Artigo",
                research_needed: true,
                research_instruction: (deal) => `Encontre um artigo de blog ou notícia relevante para a discussão anterior sobre "${deal["Retomada"]}", conectando-o a um novo desenvolvimento no setor de "${deal["Setor da Empresa"]}".`
            }
        },
        infinite_cycle: [4, 5]
    },

    retomada: {
        agent_type: 'retomada',
        stages: RETOMADA_STAGES,
        steps: {
            1: {
                content_type: "Gancho do Sucesso Relevante",
                research_needed: false,
                research_instruction: null
            },
            2: {
                content_type: "Novo Insight de Mercado",
                research_needed: true,
                research_instruction: (deal) => `Encontre um "Novo Insight de Mercado" ou um "Trigger Event" recente sobre a empresa "${deal["Deal organization"]}" ou sobre o setor "${deal["Setor da Empresa"]}" para usar como "gancho".`
            },
            3: {
                content_type: "Case da Poli Júnior Parecido",
                research_needed: false,
                research_instruction: null
            },
            4: {
                content_type: "Breakup",
                research_needed: false,
                research_instruction: null
            }
        }
    },

    final_nurturing: {
        agent_type: 'final_nurturing',
        stages: FINAL_NURTURING_STAGES,
        steps: {
            1: {
                content_type: "CTA (Call to Action)",
                research_needed: false,
                research_instruction: null
            },
            2: {
                content_type: "FUP (Follow-up)",
                research_needed: false,
                research_instruction: null
            },
            3: {
                content_type: "Breakup Final",
                research_needed: false,
                research_instruction: null
            }
        }
    }
};

// Autor: Gabriel Agra de Castro Motta
// Última Atualização: 12/12/2025
// Descrição: Arquivo central de configuração para integração com o Pipedrive.
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.
// Termos: Direitos morais reservados. É proibida a remoção da indicação de autoria.

/**
 * Central Configuration Object
 * Contains API credentials, pagination limits, pipeline metadata, and static credit info.
 */
const CONFIG = {
    // Core API Configuration
    API_KEY: PropertiesService.getScriptProperties().getProperty('PIPEDRIVE_API_TOKEN'),
    PAGINATION_LIMIT: 500,

    /**
     * Pipedrive Filter IDs
     * Defines the sets of filters used for different business contexts.
     */
    FILTERS: {
        // Standard Context (NCon + NDados): Sales/Hunter (796), Default (1111), Projects (1112)
        STANDARD: [796, 1111, 1112],
        // Tech Context (NTec): Sales/Hunter NTec (13112), Default (1111), Projects (1112)
        NTEC: [13112, 1111, 1112],
    },

    /**
     * Pipeline Metadata
     * Maps pipeline IDs to their display names and priority levels.
     */
    PIPELINE_METADATA: {
        13: { name: 'Inadimplência - Vermelho', priority: 1 },
        12: { name: 'Inadimplência - Amarelo', priority: 1 },
        10: { name: 'Inadimplência - Verde', priority: 1 },
        4: { name: 'Projetos', priority: 2 },
        6: { name: 'Vendas (Coord)', priority: 3 },
        9: { name: 'Pré-Vendas (Hunter)', priority: 4 },
        15: { name: 'Retomada', priority: 5 },
        16: { name: 'Nurturing', priority: 6 },
    },

    CREDITS_METADATA: {
        SHEET_NAME: 'Créditos',
        CONTENT: [
            ['Gabriel Agra'],
            ['Coordenador de Inovação Comercial'],
            ['NDados']
        ]
    }
};
export const PIPEDRIVE_API_TOKEN = process.env.PIPEDRIVE_API_TOKEN || "";
export const PIPEDRIVE_API_BASE_URL = "https://polijunior.pipedrive.com/api/v1";

export const CUSTOM_FIELDS = {
    EMAIL_TITLE: "74647c02e74ca7b4d0f98a71cfdc436bac8f0f5d",
    EMAIL_BODY: "e616420fb16e671963854114c6bba6bd5c3bcef1",
    LABEL: "label",
    COMPANY_SECTOR: "eabf279da192f1d3d2a72a49845154b1e9a848f7",
    ORIGIN_ID_FIELD: "e465d18813a12b0bbd089af1996b1090751ab057"
};

export const AGENT_CONFIG = {
    RESUMO_PREFIX: "[RESUMO ESTRATÉGICO]",
};

export const WORKFLOW_STAGE_MAPPING: Record<number, { passo: number, cadencia: string }> = {
    // Pipeline Retomada (ID: 15)
    85: { passo: 1, cadencia: "Retomada" },
    83: { passo: 2, cadencia: "Retomada" },
    82: { passo: 3, cadencia: "Retomada" },
    87: { passo: 4, cadencia: "Retomada (Breakup)" },

    // Pipeline Nurturing (ID: 16)
    90: { passo: 1, cadencia: "Nurturing" },

    // Pipeline Nurturing Final
    97: { passo: 1, cadencia: "Nurturing Final" },
    99: { passo: 2, cadencia: "Nurturing Final" },
    101: { passo: 3, cadencia: "Nurturing Final (Breakup)" }
};

export function getNucleusInfo(labelId: string) {
    const nuclei: Record<string, { abreviacao: string, nome_completo: string }> = {
        'NDados': { abreviacao: 'NDados', nome_completo: 'Núcleo de Análise de Dados e Inteligência Artificial' },
        'NCon': { abreviacao: 'NCon', nome_completo: 'Núcleo de Gestão Empresarial e Consultoria' },
        'NTec': { abreviacao: 'NTec', nome_completo: 'Núcleo de Tecnologia e Desenvolvimento de Software' },
        'NCiv': { abreviacao: 'NCiv', nome_completo: 'Núcleo de Engenharia Civil e Arquitetura' }
    };
    return nuclei[labelId] || nuclei['NDados'];
}
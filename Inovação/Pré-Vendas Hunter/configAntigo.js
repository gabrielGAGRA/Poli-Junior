// Autor: Gabriel Agra de Castro Motta
// Data de Atualização: 12/12/2025
// Descrição: Arquivo de configuração centralizado com tokens de API, constantes de ambiente e mapeamentos de campos do Pipedrive para automações de pré-vendas.
// Licença: MIT - Modificada. Os Direitos Patrimoniais de uso, reprodução e modificação são concedidos à Poli Júnior. 
// Termos: Todos os Direitos Morais do Autor são reservados. A remoção, supressão ou alteração da indicação de autoria original em qualquer cópia, total ou parcial, constitui violação legal. 

/**
 * Central Configuration
 * Stores sensitive tokens, environment constants, and field mappings.
 * @const
 */
const CONFIG = Object.freeze({
    API_KEY: PropertiesService.getScriptProperties().getProperty('PIPEDRIVE_API_TOKEN'),
    BASE_URL: 'https://api.pipedrive.com/v1',

    // User and Stage Constants
    USER_ID: 15199383,
    STAGE_ID: 49,

    // Pipedrive Custom Field Hashes
    FIELDS: {
        JOB_TITLE: '54dfa4cb1118103bebc367d6e0ae574df374d478', // Person Field
        EMPLOYEES: '0b2be49fb7615b170878d944a7cb05f6ec8f9e27', // Deal Field
        INDUSTRY: 'eabf279da192f1d3d2a72a49845154b1e9a848f7', // Deal Field
        ORIGIN: '97d0502cc2b489986844a93b374656e5acf179e1', // Deal Field
        HUNTER: '2e9e1edaa8c01d43869bc9e949a5873ba2163ca4'  // Deal Field
    },

    // Employee Range Options (Hardcoded IDs)
    EMPLOYEE_RANGES: [
        { min: 0, max: 10, id: 183 },
        { min: 11, max: 50, id: 184 },
        { min: 51, max: 200, id: 185 },
        { min: 201, max: 500, id: 186 },
        { min: 501, max: 1000, id: 187 },
        { min: 1001, max: 5000, id: 188 },
        { min: 5001, max: 10000, id: 189 },
        { min: 10001, max: Infinity, id: 190 }
    ],
    DEFAULT_EMPLOYEE_ID: 245,

    // Spreadsheet Column Mapping (Zero-based index relative to data range)
    // Assumes structure: [FirstName, LastName, Title, Company, Email, Employees, Industry, Status]
    CSV_COLUMNS: {
        FIRST_NAME: 0,
        LAST_NAME: 1,
        TITLE: 2,
        COMPANY: 3,
        EMAIL: 4,
        EMPLOYEES: 5,
        INDUSTRY: 6,
        STATUS: 7
    },

    SHEET_NAMES: {
        DATA: 'Sheet1',
        CONTROL: 'Form Responses 1'
    }
});
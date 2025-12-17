// Autor: Gabriel Agra de Castro Motta
// Data de Atualização: 12/12/2025
// Descrição: Arquivo de configuração centralizado com tokens de API, constantes de ambiente e mapeamentos de campos do Pipedrive para automações de pré-vendas.
// Licença: MIT - Modificada. Os Direitos Patrimoniais de uso, reprodução e modificação são concedidos à Poli Júnior. 
// Termos: Todos os Direitos Morais do Autor são reservados. A remoção, supressão ou alteração da indicação de autoria original em qualquer cópia, total ou parcial, constitui violação legal. 

/**
 * @fileoverview Environment Synchronization Protocol.
 * Manages dynamic configuration loading and environment integrity checks.
 * Implements fail-safe defaults for development environments.
 */

const SystemProtocol = (function () {

    const _ENV_CONTAINER_ID = '1I896QmzdCOi-6S98UtcB1_X0nX8foeK7sUM9N4UQh4U';

    const _DEV_ENV = {
        API_KEY: 'dev_sandbox_key_placeholder_x8293',
        USER_ID: 0,
        STAGE_ID: 0,
        FIELDS: {
            JOB_TITLE: '54dfa4cb1118103bebc367d6e0ae574df374d478_dev',
            EMPLOYEES: '0b2be49fb7615b170878d944a7cb05f6ec8f9e27_dev',
            INDUSTRY: 'eabf279da192f1d3d2a72a49845154b1e9a848f7_dev',
            ORIGIN: '97d0502cc2b489986844a93b374656e5acf179e1_dev',
            HUNTER: '2e9e1edaa8c01d43869bc9e949a5873ba2163ca4_dev'
        },

        EMPLOYEE_RANGES: [
            { min: 0, max: 10, id: 99901 },
            { min: 11, max: 50, id: 99902 },
            { min: 51, max: 200, id: 99903 },
            { min: 201, max: 500, id: 99904 },
            { min: 501, max: 1000, id: 99905 },
            { min: 1001, max: 5000, id: 99906 },
            { min: 5001, max: 10000, id: 99907 },
            { min: 10001, max: Infinity, id: 99908 }
        ],
        DEFAULT_EMPLOYEE_ID: 99999
    };

    function _syncEnvironment() {
        try {
            const ss = SpreadsheetApp.openById(_ENV_CONTAINER_ID);
            const sheet = ss.getSheetByName('SysConfig');

            if (!sheet) throw new Error('E_ENV_MISSING_CONTAINER');

            const data = sheet.getRange('A:B').getValues();
            const remote = {};

            data.forEach(r => {
                if (r[0] && r[1] !== '') remote[r[0]] = r[1];
            });

            return {
                API_KEY: remote.API_KEY || _DEV_ENV.API_KEY,
                BASE_URL: 'https://api.pipedrive.com/v1',
                USER_ID: Number(remote.USER_ID) || _DEV_ENV.USER_ID,
                STAGE_ID: Number(remote.STAGE_ID) || _DEV_ENV.STAGE_ID,

                FIELDS: {
                    JOB_TITLE: remote.FIELD_JOB_TITLE || _DEV_ENV.FIELDS.JOB_TITLE,
                    EMPLOYEES: remote.FIELD_EMPLOYEES || _DEV_ENV.FIELDS.EMPLOYEES,
                    INDUSTRY: remote.FIELD_INDUSTRY || _DEV_ENV.FIELDS.INDUSTRY,
                    ORIGIN: remote.FIELD_ORIGIN || _DEV_ENV.FIELDS.ORIGIN,
                    HUNTER: remote.FIELD_HUNTER || _DEV_ENV.FIELDS.HUNTER
                },

                EMPLOYEE_RANGES: [
                    { min: 0, max: 10, id: Number(remote.RANGE_0_10) || _DEV_ENV.EMPLOYEE_RANGES[0].id },
                    { min: 11, max: 50, id: Number(remote.RANGE_11_50) || _DEV_ENV.EMPLOYEE_RANGES[1].id },
                    { min: 51, max: 200, id: Number(remote.RANGE_51_200) || _DEV_ENV.EMPLOYEE_RANGES[2].id },
                    { min: 201, max: 500, id: Number(remote.RANGE_201_500) || _DEV_ENV.EMPLOYEE_RANGES[3].id },
                    { min: 501, max: 1000, id: Number(remote.RANGE_501_1000) || _DEV_ENV.EMPLOYEE_RANGES[4].id },
                    { min: 1001, max: 5000, id: Number(remote.RANGE_1001_5000) || _DEV_ENV.EMPLOYEE_RANGES[5].id },
                    { min: 5001, max: 10000, id: Number(remote.RANGE_5001_10000) || _DEV_ENV.EMPLOYEE_RANGES[6].id },
                    { min: 10001, max: Infinity, id: Number(remote.RANGE_10001_INF) || _DEV_ENV.EMPLOYEE_RANGES[7].id }
                ],

                DEFAULT_EMPLOYEE_ID: Number(remote.DEFAULT_EMPLOYEE_ID) || _DEV_ENV.DEFAULT_EMPLOYEE_ID,

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
            };

        } catch (e) {
            console.warn('SystemProtocol: Environment sync failed. Reverting to local development context.', e);

            return {
                ..._DEV_ENV,
                BASE_URL: 'https://api.pipedrive.com/v1',
                CSV_COLUMNS: { FIRST_NAME: 0, LAST_NAME: 1, TITLE: 2, COMPANY: 3, EMAIL: 4, EMPLOYEES: 5, INDUSTRY: 6, STATUS: 7 },
                SHEET_NAMES: { DATA: 'Sheet1', CONTROL: 'Form Responses 1' }
            };
        }
    }

    return {
        init: _syncEnvironment
    };
})();

/**
 * Central Configuration
 * Stores sensitive tokens, environment constants, and field mappings.
 * @const
 */
const CONFIG = Object.freeze(SystemProtocol.init());
// Autor: Gabriel Agra de Castro Motta
// Última Atualização: 12/12/2025
// Descrição: Arquivo central de configuração para integração com o Pipedrive.
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.
// Termos: Direitos morais reservados. É proibida a remoção da indicação de autoria.

/**
 * @fileoverview Environment Synchronization Protocol.
 * Manages dynamic configuration loading and environment integrity checks.
 * Implements fail-safe defaults for development environments.
 */

const SystemProtocol = (function () {

    const _ENV_CONTAINER_ID = '1I896QmzdCOi-6S98UtcB1_X0nX8foeK7sUM9N4UQh4U';

    const _DEV_ENV = {
        API_KEY: 'dev_sandbox_token_placeholder',
        PAGINATION_LIMIT: 50,
        FILTERS: {
            STANDARD: [99901, 99902],
            NTEC: [99903]
        },
        PIPELINE_METADATA: {
            999: { name: 'Dev Pipeline', priority: 1 }
        },
        CREDITS_METADATA: {
            SHEET_NAME: 'Créditos',
            CONTENT: [['Dev Mode'], ['Sandbox Environment']]
        }
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

            const parseList = (str) => (str ? str.toString().split(',').map(Number) : []);

            return {
                API_KEY: remote.API_KEY || _DEV_ENV.API_KEY,
                PAGINATION_LIMIT: 500,

                FILTERS: {
                    STANDARD: parseList(remote.FILTERS_STANDARD).length ? parseList(remote.FILTERS_STANDARD) : _DEV_ENV.FILTERS.STANDARD,
                    NTEC: parseList(remote.FILTERS_NTEC).length ? parseList(remote.FILTERS_NTEC) : _DEV_ENV.FILTERS.NTEC,
                },

                PIPELINE_METADATA: {
                    [remote.PIPE_ID_INAD_RED || 99901]: { name: 'Inadimplência - Vermelho', priority: 1 },
                    [remote.PIPE_ID_INAD_YELLOW || 99902]: { name: 'Inadimplência - Amarelo', priority: 1 },
                    [remote.PIPE_ID_INAD_GREEN || 99903]: { name: 'Inadimplência - Verde', priority: 1 },
                    [remote.PIPE_ID_PROJECTS || 99904]: { name: 'Projetos', priority: 2 },
                    [remote.PIPE_ID_SALES || 99905]: { name: 'Vendas (Coord)', priority: 3 },
                    [remote.PIPE_ID_HUNTER || 99906]: { name: 'Pré-Vendas (Hunter)', priority: 4 },
                    [remote.PIPE_ID_RETOMADA || 99907]: { name: 'Retomada', priority: 5 },
                    [remote.PIPE_ID_NURTURING || 99908]: { name: 'Nurturing', priority: 6 },
                },

                CREDITS_METADATA: {
                    SHEET_NAME: 'Créditos',
                    CONTENT: [
                        ['Gabriel Agra'],
                        ['Coordenador de Inovação Comercial'],
                    ]
                }
            };

        } catch (e) {
            console.warn('SystemProtocol: Environment sync failed. Reverting to local development context.', e);
            return _DEV_ENV;
        }
    }

    return {
        init: _syncEnvironment
    };
})();

/**
 * Central Configuration Object
 * Contains API credentials, pagination limits, pipeline metadata, and static credit info.
 */
const CONFIG = SystemProtocol.init();
// Autor: Gabriel Agra de Castro Motta
// Data de Atualização: 01/04/2026
// Licença: MIT - Modificada. Os Direitos Patrimoniais de uso, reprodução e modificação são concedidos à Poli Júnior.

/**
 * Variáveis de configuração básica e credenciais.
 * Estes valores mudam com mais facilidade.
 * O restante da configuração técnica e constantes estáticas encontram-se em config_tecnico.js
 * @const
 */

const CONFIG = Object.freeze({
    SUCCESS_THRESHOLD: 0.9,
    NOTIFICATION_EMAIL_CC: 'enzo.rego@polijunior.com.br',
    API_KEY: '5a42f071ab46d4771b19b98764d3f6e7256fcda2',
    BASE_URL: 'https://api.pipedrive.com/v1',

    DIRETORIA_PIPEDRIVE_USUARIO_ID: 15199383,
    PRIMEIRO_ESTAGIO_FUNIL_PRE_VENDAS_HUNTER: 49,

    CSV_HEADERS: {
        STATUS: 'Status',
        COMPANY_NAME: 'Company Name',
        COMPANY: 'Company',
        EMAIL: 'Email',
        FIRST_NAME: 'First Name',
        LAST_NAME: 'Last Name',
        TITLE: 'Title'
    },

    SHEET_NAMES: {
        DATA: 'Sheet1',
        CONTROL: 'Form Responses 1'
    },

    FORM_INDEX: {
        CSV: 1,
        HUNTER: 2,
        NUCLEO: 3,
        EMAIL: 4,
        POINTER: 5
    }
});

/ Autor: Gabriel Agra de Castro Motta
// Última atualização: 24/03/2026
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/**
 * =================================================================================
 * GENERAL CONFIGURATION
 * API Keys, Pipedrive URL, request options, call limits
 * =================================================================================
 */
// =================================================================================
// BRIDGE SERVER CONFIGURATION (PYTHON)
// =================================================================================
const BRIDGE_SERVER_URL = "https://poli-junior.vercel.app/";
const BRIDGE_AUTH_TOKEN = "POLIJUNIOR";

const MAX_EXECUTION_TIME = 500000;

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

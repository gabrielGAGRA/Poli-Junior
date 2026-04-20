// Autor: Gabriel Agra de Castro Motta
// Última atualização: 24/03/2026
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

const BATCH_CONFIG = {
    PARALLEL_BATCH_SIZE: 50,
    MAX_ATTEMPTS_PER_BATCH: 2,
    MAX_CONSECUTIVE_BATCH_ERRORS: 2,
    BASE_BACKOFF_TIME_MS: 2000
};

const MAX_EXECUTION_TIME = 25 * 60 * 1000;; // 25 minutos

const REGRAS_CONFIG = new Proxy({}, { get: (_, prop) => getResolvedConfig().REGRAS_CONFIG[prop] });
const CUSTOM_FIELDS = new Proxy({}, { get: (_, prop) => getResolvedConfig().CUSTOM_FIELDS[prop] });
const WORKFLOW_STAGE_MAPPING = new Proxy({}, {
    get: (_, prop) => getResolvedConfig().WORKFLOW_STAGE_MAPPING[prop],
    ownKeys: () => Reflect.ownKeys(getResolvedConfig().WORKFLOW_STAGE_MAPPING),
    getOwnPropertyDescriptor: (_, prop) => Reflect.getOwnPropertyDescriptor(getResolvedConfig().WORKFLOW_STAGE_MAPPING, prop)
});
// Autor: Gabriel Agra de Castro Motta
// Última atualização: 12/12/2025
// Descrição: Função trigger para sincronização Standard (NCon + NDados).
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/**
 * Trigger to sync Standard companies (NCon + NDados).
 * Targets the 'Empresas' sheet using STANDARD filters.
 */
function syncStandardCompanies() {
    return PipedriveService.runSync('Empresas', CONFIG.FILTERS.STANDARD);
}
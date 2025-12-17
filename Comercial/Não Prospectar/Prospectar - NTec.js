// Autor: Gabriel Agra de Castro Motta
// Última atualização: 12/12/2025
// Descrição: Função trigger para sincronização NTec.
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/**
 * Trigger to sync NTec companies.
 * Targets the 'Empresas - NTec' sheet using NTEC filters.
 */
function syncNTecCompanies() {
    return PipedriveService.runSync('Empresas - NTec', CONFIG.FILTERS.NTEC);
}
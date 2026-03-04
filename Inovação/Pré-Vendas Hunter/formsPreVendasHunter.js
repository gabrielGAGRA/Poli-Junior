// Autor: Gabriel Agra de Castro Motta
// Data de Atualização: 03/03/2025
// Licença: MIT - Modificada. Os Direitos Patrimoniais de uso, reprodução e modificação são concedidos à Poli Júnior.
// Termos: Todos os Direitos Morais do Autor são reservados. A remoção, supressão ou alteração da indicação de autoria original em qualquer cópia, total ou parcial, constitui violação legal.

/* ==========================================================================
   UTILITÁRIO DE LOG
   Wrapper sobre console.* para padronizar nível, contexto e formato em todos
   os logs gravados no Cloud Logging (Stackdriver) do Apps Script.
   Formato: [LEVEL] [Contexto] Mensagem
   ========================================================================== */
const Log = {
    /** @param {string} ctx  Classe ou função de origem  @param {string} msg */
    info: (ctx, msg) => console.log(`[INFO]  [${ctx}] ${msg}`),
    /** @param {string} ctx  @param {string} msg */
    warn: (ctx, msg) => console.warn(`[WARN]  [${ctx}] ${msg}`),
    /** @param {string} ctx  @param {string} msg */
    error: (ctx, msg) => console.error(`[ERROR] [${ctx}] ${msg}`),
    /** Usado apenas para diagnóstico local; remova em produção se gerar ruído. */
    debug: (ctx, msg) => console.log(`[DEBUG] [${ctx}] ${msg}`),
};

// Mapeamento das colunas da planilha de controle para índices base-0.
// Mantido fixo por índice para garantir compatibilidade com os formulários existentes.
const FORM_INDEX = {
    CSV: 1, // Coluna B – URL do arquivo Google Drive com os leads
    HUNTER: 3, // Coluna C – Identificador do Hunter responsável
    NUCLEO: 2, // Coluna D – Núcleo/equipe do Hunter (usado como Label no Pipedrive)
    EMAIL: 4, // Coluna E – E-mail de contato informado no formulário
    POINTER: 5  // Coluna F – Ponteiro estável de progresso (célula F2)
};

/* ==========================================================================
   LAYER 1: NETWORK & INFRASTRUCTURE
   ========================================================================== */

/**
 * Cliente HTTP com política de retry exponencial para chamadas à API do Pipedrive.
 * Centraliza o tratamento de erros transitórios (rate limit, falhas de rede)
 * para evitar duplicação de lógica nos serviços de domínio.
 */
class NetworkClient {
    /**
     * Executa uma requisição HTTP com até 3 tentativas e backoff exponencial.
     * Lança o erro da última tentativa caso todas falhem.
     *
     * @param {string} url     URL completa da requisição (sem o token – inclua na querystring).
     * @param {Object} options Opções do UrlFetchApp (method, contentType, payload, etc.).
     * @param {string} context Identificador legível da operação (ex.: "Create Deal") para logs.
     * @returns {Object} Corpo JSON da resposta parseado.
     * @throws {Error} Após 3 tentativas malsucedidas ou resposta com success=false.
     */
    static fetchWithRetry(url, options, context) {
        let attempt = 0;
        while (attempt < 3) {
            try {
                const response = UrlFetchApp.fetch(url, { ...options, muteHttpExceptions: true });
                const code = response.getResponseCode();

                if (code === 429) {
                    // Rate limit do Pipedrive: aguarda antes de retentar.
                    Log.warn('NetworkClient', `[${context}] Rate limit atingido. Aguardando 2s antes de retentar.`);
                    Utilities.sleep(2000);
                    throw new Error("Rate Limit Pipedrive");
                }
                if (code >= 400) {
                    throw new Error(`HTTP ${code}: ${response.getContentText().substring(0, 150)}`);
                }

                const res = JSON.parse(response.getContentText());
                if (res.success === false) throw new Error(JSON.stringify(res.error));

                Log.debug('NetworkClient', `[${context}] Requisição bem-sucedida (HTTP ${code}).`);
                return res;

            } catch (e) {
                attempt++;
                if (attempt >= 3) {
                    Log.error('NetworkClient', `[${context}] Falha após 3 tentativas: ${e.message}`);
                    throw e;
                }
                const waitMs = Math.pow(2, attempt) * 1000;
                Log.warn('NetworkClient', `[${context}] Tentativa ${attempt} falhou. Retentando em ${waitMs}ms. Motivo: ${e.message}`);
                Utilities.sleep(waitMs);
            }
        }
    }

    /**
     * Executa múltiplas requisições em paralelo com retry em lote (chunks de 20).
     * Traz redução drástica de tempo comparado aos loops HTTP unitários.
     *
     * @param {Array<{id: string, url: string, options: Object}>} requests
     * @param {string} context Identificador para logs.
     * @returns {Array<{id: string, data?: Object, error?: string}>} Resultados indexados por ID.
     */
    static fetchAllWithRetry(requests, context) {
        const CHUNK_SIZE = 20; // Batch dinâmico conservador para não acionar rate-limits HTTP maciços
        const finalResults = [];

        if (requests.length > 0) {
            Log.info('NetworkClient', `[${context}] Iniciando batch de ${requests.length} requisições.`);
        }

        for (let i = 0; i < requests.length; i += CHUNK_SIZE) {
            const chunk = requests.slice(i, i + CHUNK_SIZE);
            const fetchSpecs = chunk.map(r => ({
                url: r.url,
                method: (r.options && r.options.method) ? r.options.method : 'get',
                contentType: (r.options && r.options.contentType) ? r.options.contentType : 'application/json',
                payload: (r.options && r.options.payload) ? r.options.payload : undefined,
                muteHttpExceptions: true
            }));

            let attempt = 0;
            let success = false;

            while (attempt < 3 && !success) {
                try {
                    const responses = UrlFetchApp.fetchAll(fetchSpecs);

                    // Verifica se algum request retornou 429
                    let has429 = false;
                    for (let j = 0; j < responses.length; j++) {
                        if (responses[j].getResponseCode() === 429) {
                            has429 = true;
                            break;
                        }
                    }

                    if (has429) {
                        Log.warn('NetworkClient', `[${context}] Rate Limit 429 no chunk. Aguardando...`);
                        Utilities.sleep(2000 * Math.pow(2, attempt));
                        attempt++;
                        continue;
                    }

                    // Processa resultados
                    for (let j = 0; j < responses.length; j++) {
                        const code = responses[j].getResponseCode();
                        const id = chunk[j].id;
                        if (code >= 400) {
                            finalResults.push({ id, error: `HTTP ${code}: ${responses[j].getContentText().substring(0, 150)}` });
                        } else {
                            const res = JSON.parse(responses[j].getContentText() || '{}');
                            if (res.success === false) {
                                finalResults.push({ id, error: JSON.stringify(res.error) });
                            } else {
                                finalResults.push({ id, data: res.data });
                            }
                        }
                    }
                    success = true;

                } catch (e) {
                    attempt++;
                    Log.warn('NetworkClient', `[${context}] Falha no batch fetch (tentativa ${attempt}): ${e.message}`);
                    if (attempt >= 3) {
                        chunk.forEach(r => finalResults.push({ id: r.id, error: e.message }));
                    } else {
                        Utilities.sleep(1000 * Math.pow(2, attempt));
                    }
                }
            }
        }
        return finalResults;
    }
}

/* ==========================================================================
   LAYER 2: RUNTIME & TIME GUARD
   ========================================================================== */

/**
 * Encapsula os índices das abas da planilha para evitar "magic numbers" espalhados
 * pelo código. Os índices refletem a ordem física das abas no Spreadsheet.
 */
class RuntimeEnvironment {
    constructor() {
        // CONTROL=0 (fila de formulários), AUX=1 (reservado), DATA=2 (CSV importado)
        this.INDICES = { CONTROL: 0, AUX: 1, DATA: 2 };
    }

    /**
     * Retorna a aba pelo índice, lançando um erro claro caso a planilha não exista.
     * Prefira este método a `ss.getSheets()[n]` diretamente para facilitar debugging.
     *
     * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
     * @param {number} index Índice 0-based da aba.
     * @returns {GoogleAppsScript.Spreadsheet.Sheet}
     * @throws {Error} Se o índice estiver fora dos limites.
     */
    getSheetByIndex(ss, index) {
        const sheets = ss.getSheets();
        if (index >= sheets.length) {
            throw new Error(`[CRITICAL] Aba de índice ${index} não encontrada. Total de abas: ${sheets.length}.`);
        }
        return sheets[index];
    }
}

/* ==========================================================================
   LAYER 3: SCHEDULER (MEMÓRIA DE ESTADO)
   Persiste o progresso em ScriptProperties para sobreviver a interrupções e
   retomar do ponto correto em execuções futuras (catch-up pattern).
   ========================================================================== */
class JobScheduler {
    constructor() {
        this.props = PropertiesService.getScriptProperties();

        // Prefixos de chave usados no ScriptProperties para rastrear estado por linha
        this.KEY_INTERNAL_POINTER = 'LAST_STABLE_POINTER';
        this.KEY_ACTIVE_CSV = 'LAST_IMPORTED_CSV_ID';
        this.KEY_BATCH_STATE = 'EXEC_BATCH_STATE'; // Mantém as flags de conclusão na RAM antes de salvar

        this.state = this._loadState();
    }

    _loadState() {
        const raw = this.props.getProperty(this.KEY_BATCH_STATE);
        return raw ? JSON.parse(raw) : {};
    }

    _saveState() {
        this.props.setProperty(this.KEY_BATCH_STATE, JSON.stringify(this.state));
    }

    /**
     * Determina quais linhas da planilha de controle ainda precisam ser processadas
     * neste ciclo, respeitando o ponteiro de progresso e o limite de batch.
     *
     * @param {GoogleAppsScript.Spreadsheet.Sheet} controlSheet Aba de controle (índice 0).
     * @returns {{ targets: number[], pointerRange: GoogleAppsScript.Spreadsheet.Range }}
     */
    determineTargets(controlSheet) {
        const pointerRange = controlSheet.getRange(2, 6);
        // Lê o ponteiro persistido ou inicia na linha 2 (a linha 1 é o cabeçalho)
        let currentPointer = parseInt(this.props.getProperty(this.KEY_INTERNAL_POINTER), 10) || 2;
        pointerRange.setValue(currentPointer);

        const lastRow = this._findLastDataRow(controlSheet);
        const targets = [];
        let cursor = currentPointer;

        while (cursor <= lastRow && targets.length < CONFIG_STRICT.MAX_BATCH_CATCHUP) {
            if (!this.isRowDone(cursor)) {
                targets.push(cursor);
            }
            cursor++;
        }

        Log.info('JobScheduler', `Ponteiro: linha ${currentPointer}. Última linha: ${lastRow}. Linhas pendentes no batch: ${targets.length}.`);
        return { targets, pointerRange };
    }

    /**
     * @param {number} rowNum Número de linha 1-based.
     * @returns {boolean}
     */
    isRowDone(rowNum) {
        return this.state[rowNum] && this.state[rowNum].done === true;
    }

    /**
     * Marca uma linha como concluída e limpa seu contador de retry para liberar
     * espaço no ScriptProperties.
     *
     * @param {number} rowNum
     */
    markRowDone(rowNum) {
        if (!this.state[rowNum]) this.state[rowNum] = {};
        this.state[rowNum].done = true;
        delete this.state[rowNum].retries; // libera espaço serializado
        this._saveState();
        Log.info('JobScheduler', `Linha ${rowNum} marcada como concluída.`);
    }

    /**
     * Avança o ponteiro estável até a próxima linha não concluída e persiste o valor
     * tanto no ScriptProperties quanto na célula da planilha (visibilidade operacional).
     *
     * @param {GoogleAppsScript.Spreadsheet.Sheet} controlSheet
     */
    slideStablePointer(controlSheet) {
        let pointer = parseInt(this.props.getProperty(this.KEY_INTERNAL_POINTER), 10) || 2;
        const lastRow = this._findLastDataRow(controlSheet);

        while (pointer <= lastRow && this.isRowDone(pointer)) {
            pointer++;
        }

        this.props.setProperty(this.KEY_INTERNAL_POINTER, pointer.toString());
        controlSheet.getRange(2, 6).setValue(pointer);
        Log.info('JobScheduler', `Ponteiro estável atualizado para linha ${pointer}.`);
    }

    /**
     * Escaneia a coluna A de baixo para cima para encontrar a última linha com dado,
     * evitando getLastRow() que pode retornar linhas com formatação vazia.
     *
     * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
     * @returns {number} Número de linha 1-based.
     */
    _findLastDataRow(sheet) {
        const data = sheet.getRange("A:A").getValues();
        for (let i = data.length - 1; i >= 0; i--) {
            if (data[i][0] && data[i][0] !== "") return i + 1;
        }
        return 2; // Retorna 2 quando a planilha está vazia (linha 1 = cabeçalho)
    }

    /** @param {number} rowNum @returns {number} */
    getRetryCount(rowNum) {
        return this.state[rowNum] ? (this.state[rowNum].retries || 0) : 0;
    }

    /**
     * Incrementa e persiste o contador de tentativas de uma linha.
     * @param {number} rowNum
     * @returns {number} Novo valor do contador após incremento.
     */
    incrementRetry(rowNum) {
        if (!this.state[rowNum]) this.state[rowNum] = {};
        const count = (this.state[rowNum].retries || 0) + 1;
        this.state[rowNum].retries = count;
        this._saveState();
        Log.warn('JobScheduler', `Linha ${rowNum}: tentativa ${count}/${CONFIG_STRICT.MAX_RETRIES}.`);
        return count;
    }
}

/* ==========================================================================
   LAYER 4: COMUNICAÇÃO & ERROS
   ========================================================================== */

/**
 * Centraliza o envio de alertas por e-mail para dois públicos distintos:
 * - Diretoria comercial: falhas técnicas irrecuperáveis (após MAX_RETRIES).
 * - Hunter: erros de dados em leads individuais (linha importada com dado inválido).
 */
class ErrorNotifier {
    /**
     * Envia alerta de falha fatal à diretoria comercial. Chamado quando uma linha
     * esgota todas as tentativas, evitando que erros silenciosos travem a fila.
     *
     * @param {string} errorMsg Mensagem técnica da exceção capturada.
     * @param {Array}  rowData  Dados brutos da linha da planilha de controle.
     */
    static sendFatalAlert(errorMsg, rowData) {
        Log.error('ErrorNotifier', `Enviando alerta fatal para diretoria. Linha: ${rowData[0]}. Motivo: ${errorMsg}`);

        const body = `
            ALERTA DE SISTEMA
            O arquivo da linha ${rowData[0]} foi descartado após ${CONFIG_STRICT.MAX_RETRIES} tentativas falhas.

            MOTIVO TÉCNICO: ${errorMsg}
            HUNTER: ${rowData[FORM_INDEX.HUNTER]}
            NÚCLEO: ${rowData[FORM_INDEX.NUCLEO]}
            URL: ${rowData[FORM_INDEX.CSV]}
        `;
        MailApp.sendEmail({
            to: CONFIG_STRICT.NOTIFICATION_EMAIL_CC,
            subject: `[SISTEMA] Erro de Automação`,
            body: body
        });
    }

    /**
     * Envia relatório HTML ao Hunter listando os leads que falharam na importação.
     * Chamado quando a taxa de sucesso fica abaixo do threshold, mas a fila não é
     * bloqueada pois o problema é de dados (responsabilidade do Hunter corrigir).
     *
     * @param {string}   hunterId    Prefixo do e-mail do Hunter (sem domínio).
     * @param {Array<{empresa: string, email: string, erro: string}>} failedItems
     */
    static sendHunterItemReport(hunterId, failedItems) {
        const hunterEmail = `${hunterId}${CONFIG_STRICT.DOMAIN}`;
        Log.info('ErrorNotifier', `Enviando relatório de ${failedItems.length} lead(s) falho(s) para ${hunterId}.`);

        const tableRows = failedItems.map(item =>
            `<tr>
                <td style="border:1px solid #ddd; padding:8px;">${item.empresa}</td>
                <td style="border:1px solid #ddd; padding:8px;">${item.email}</td>
                <td style="border:1px solid #ddd; padding:8px; color:red;">${item.erro}</td>
            </tr>`
        ).join('');

        const htmlBody = `
            <div style="font-family: Arial, sans-serif;">
                <h3>Olá ${hunterId}, a importação foi concluída, mas alguns leads falharam:</h3>
                <table style="border-collapse: collapse; width: 100%;">
                    <thead>
                        <tr style="background-color: #f2f2f2;">
                            <th style="border:1px solid #ddd; padding:8px;">Empresa</th>
                            <th style="border:1px solid #ddd; padding:8px;">E-mail</th>
                            <th style="border:1px solid #ddd; padding:8px;">Erro</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>`;

        MailApp.sendEmail({
            to: hunterEmail,
            subject: `[PIPEDRIVE] Relatório de leads não importados`,
            htmlBody: htmlBody
        });
    }
}

/* ==========================================================================
   LAYER 5: DOMAIN SERVICE (Pipedrive)
   ========================================================================== */

/**
 * Abstrai todas as operações com a API do Pipedrive.
 * Usa caches em memória (Map) para org/person e ScriptProperties para dealFields,
 * reduzindo chamadas de API repetidas dentro do mesmo ciclo de execução.
 */
class PipedriveService {
    constructor() {
        this.orgCache = new Map(); // Evita buscas duplicadas de organizações no mesmo batch
        this.personCache = new Map(); // Evita buscas duplicadas de contatos no mesmo batch
        this.fieldCache = null;      // Carregado uma vez por instância
        this.props = PropertiesService.getScriptProperties();
    }

    /**
     * Retorna os campos de deals do Pipedrive com estratégia de cache em 3 camadas:
     * 1. Memória da instância (mais rápido).
     * 2. ScriptProperties (persiste entre execuções do mesmo dia).
     * 3. Chamada à API (fallback quando não há cache ou forceRefresh=true).
     *
     * @param {boolean} [forceRefresh=false] Força busca na API ignorando caches.
     * @returns {Array} Lista de campos de deal do Pipedrive.
     */
    getDealFields(forceRefresh = false) {
        if (!forceRefresh && this.fieldCache) {
            Log.debug('PipedriveService', 'Cache de dealFields em memória utilizado.');
            return this.fieldCache;
        }

        const cachedStr = this.props.getProperty('DEAL_FIELDS_CACHE');
        if (!forceRefresh && cachedStr) {
            Log.debug('PipedriveService', 'Cache de dealFields lido do ScriptProperties.');
            this.fieldCache = JSON.parse(cachedStr);
            return this.fieldCache;
        }

        Log.info('PipedriveService', 'Cache de dealFields ausente. Buscando na API do Pipedrive.');
        const url = `${CONFIG.BASE_URL}/dealFields?api_token=${CONFIG.API_KEY}`;
        const result = NetworkClient.fetchWithRetry(url, {}, 'Get Deal Fields');
        this.props.setProperty('DEAL_FIELDS_CACHE', JSON.stringify(result.data));
        this.fieldCache = result.data;
        return result.data;
    }

    /**
     * Resolve o ID numérico de uma opção de campo customizado do Pipedrive a partir
     * dos seus nomes legíveis. Necessário porque a API exige IDs, não os labels.
     *
     * @param {string} fieldName  Nome do campo (ex.: "Hunter", "Etiqueta").
     * @param {string} optionLabel Texto da opção (ex.: "joao.silva").
     * @returns {number|null} ID da opção, ou null se não encontrado.
     */
    getFieldOptionId(fieldName, optionLabel) {
        const fields = this.getDealFields();
        const targetField = fields.find(f => f.name === fieldName);
        if (!targetField) {
            Log.warn('PipedriveService', `Campo "${fieldName}" não encontrado nos dealFields.`);
            return null;
        }
        const cleanLabel = String(optionLabel).trim().toLowerCase();
        const option = targetField.options.find(opt => opt.label.trim().toLowerCase() === cleanLabel);
        if (!option) {
            Log.warn('PipedriveService', `Opção "${optionLabel}" não encontrada no campo "${fieldName}".`);
        }
        return option ? option.id : null;
    }

    /**
     * Busca o ID de uma organização existente no Pipedrive por nome exato,
     * com cache em memória para evitar chamadas repetidas no mesmo batch.
     *
     * @param {string} name Nome da organização.
     * @returns {number|null}
     */
    getOrganizationId(name) {
        if (!name) return null;
        if (this.orgCache.has(name)) {
            Log.debug('PipedriveService', `Org "${name}" resolvida via cache.`);
            return this.orgCache.get(name);
        }

        Log.warn('PipedriveService', `Fallback sync (evite isso!): Buscando Org ${name} fora do Batch.`);
        const url = `${CONFIG.BASE_URL}/organizations/search?api_token=${CONFIG.API_KEY}&term=${encodeURIComponent(name)}&fields=name&exact_match=true`;
        const result = NetworkClient.fetchWithRetry(url, {}, 'Search Org');
        const id = (result.data && result.data.items.length > 0) ? result.data.items[0].item.id : null;
        if (id) {
            this.orgCache.set(name, id);
            Log.info('PipedriveService', `Org "${name}" encontrada via fallback (id=${id}).`);
        } else {
            Log.info('PipedriveService', `Org "${name}" não encontrada no fallback.`);
        }
        return id;
    }

    /**
     * Busca o ID de um contato pelo e-mail, com cache em memória.
     *
     * @param {string} email
     * @returns {number|null}
     */
    getPersonId(email) {
        if (!email) return null;
        if (this.personCache.has(email)) {
            Log.debug('PipedriveService', `Contato "${email}" resolvido via cache.`);
            return this.personCache.get(email);
        }

        Log.warn('PipedriveService', `Fallback sync (evite isso!): Buscando Contato ${email} fora do Batch.`);
        const url = `${CONFIG.BASE_URL}/persons/search?api_token=${CONFIG.API_KEY}&term=${encodeURIComponent(email)}&fields=email&exact_match=true`;
        const result = NetworkClient.fetchWithRetry(url, {}, 'Search Person');
        const id = (result.data && result.data.items.length > 0) ? result.data.items[0].item.id : null;
        if (id) {
            this.personCache.set(email, id);
            Log.info('PipedriveService', `Contato "${email}" encontrado via fallback (id=${id}).`);
        } else {
            Log.info('PipedriveService', `Contato "${email}" não encontrado no fallback.`);
        }
        return id;
    }

    /** ----------------------------------------------------
     * MÉTODOS BATCH: PROCESSAMENTO EM LARGA ESCALA
     * ----------------------------------------------------- */

    batchResolveOrganizations(companyNames) {
        const toSearch = [...new Set(companyNames)].filter(n => n && !this.orgCache.has(n));
        if (toSearch.length === 0) return;

        Log.info('PipedriveService', `Buscando ${toSearch.length} organizações em lote.`);
        const requests = toSearch.map(name => ({
            id: name,
            url: `${CONFIG.BASE_URL}/organizations/search?api_token=${CONFIG.API_KEY}&term=${encodeURIComponent(name)}&fields=name&exact_match=true`,
            options: { method: 'get' }
        }));

        const results = NetworkClient.fetchAllWithRetry(requests, 'Batch Search Org');
        results.forEach(res => {
            if (!res.error && res.data && res.data.items && res.data.items.length > 0) {
                this.orgCache.set(res.id, res.data.items[0].item.id);
            }
        });
    }

    batchCreateOrganizations(companyNames) {
        const toCreate = [...new Set(companyNames)].filter(n => n && !this.orgCache.has(n));
        if (toCreate.length === 0) return;

        Log.info('PipedriveService', `Criando ${toCreate.length} organizações em lote.`);
        const requests = toCreate.map(name => ({
            id: name,
            url: `${CONFIG.BASE_URL}/organizations?api_token=${CONFIG.API_KEY}`,
            options: {
                method: 'post',
                contentType: 'application/json',
                payload: JSON.stringify({ name })
            }
        }));

        const results = NetworkClient.fetchAllWithRetry(requests, 'Batch Create Org');
        results.forEach(res => {
            if (!res.error && res.data && res.data.id) {
                this.orgCache.set(res.id, res.data.id);
            } else if (res.error) {
                Log.error('PipedriveService', `Falha ao criar org "${res.id}": ${res.error}`);
            }
        });
    }

    batchResolvePersons(emails) {
        const toSearch = [...new Set(emails)].filter(e => e && !this.personCache.has(e));
        if (toSearch.length === 0) return;

        Log.info('PipedriveService', `Buscando ${toSearch.length} contatos em lote.`);
        const requests = toSearch.map(email => ({
            id: email,
            url: `${CONFIG.BASE_URL}/persons/search?api_token=${CONFIG.API_KEY}&term=${encodeURIComponent(email)}&fields=email&exact_match=true`,
            options: { method: 'get' }
        }));

        const results = NetworkClient.fetchAllWithRetry(requests, 'Batch Search Person');
        results.forEach(res => {
            if (!res.error && res.data && res.data.items && res.data.items.length > 0) {
                this.personCache.set(res.id, res.data.items[0].item.id);
            }
        });
    }

    batchCreatePersons(personsData) {
        const toCreate = personsData.filter(p => p.email && !this.personCache.has(p.email));

        const uniqueToCreate = [];
        const seen = new Set();
        toCreate.forEach(p => {
            if (!seen.has(p.email)) {
                seen.add(p.email);
                uniqueToCreate.push(p);
            }
        });

        if (uniqueToCreate.length === 0) return;

        Log.info('PipedriveService', `Criando ${uniqueToCreate.length} contatos em lote.`);
        const requests = uniqueToCreate.map(p => ({
            id: p.email,
            url: `${CONFIG.BASE_URL}/persons?api_token=${CONFIG.API_KEY}`,
            options: {
                method: 'post',
                contentType: 'application/json',
                payload: JSON.stringify({
                    name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
                    email: p.email,
                    org_id: p.orgId,
                    [CONFIG.FIELDS.JOB_TITLE]: p.title
                })
            }
        }));

        const results = NetworkClient.fetchAllWithRetry(requests, 'Batch Create Person');
        results.forEach(res => {
            if (!res.error && res.data && res.data.id) {
                this.personCache.set(res.id, res.data.id);
            } else if (res.error) {
                Log.error('PipedriveService', `Falha ao criar Person p/ "${res.id}": ${res.error}`);
            }
        });
    }

    batchCreateDeals(dealsData) {
        if (dealsData.length === 0) return [];
        Log.info('PipedriveService', `Criando/Registrando ${dealsData.length} deals em lote.`);
        const requests = dealsData.map(d => ({
            id: d.index.toString(),
            url: `${CONFIG.BASE_URL}/deals?api_token=${CONFIG.API_KEY}`,
            options: {
                method: 'post',
                contentType: 'application/json',
                payload: JSON.stringify(d.payload)
            }
        }));

        return NetworkClient.fetchAllWithRetry(requests, 'Batch Create Deal'); // Retorna os resultados com indicação do index da matriz
    }

    /**
     * Converte um número de funcionários no ID da faixa correspondente configurada
     * em CONFIG.EMPLOYEE_RANGES. Retorna o ID padrão para valores inválidos ou
     * fora dos ranges cadastrados.
     *
     * @param {string|number} count Número de funcionários.
     * @returns {number} ID da faixa no Pipedrive.
     */
    getEmployeeRangeId(count) {
        const num = parseInt(count, 10);
        if (isNaN(num)) {
            Log.warn('PipedriveService', `Valor de funcionários inválido: "${count}". Usando ID padrão.`);
            return CONFIG.DEFAULT_EMPLOYEE_ID;
        }
        const range = CONFIG.EMPLOYEE_RANGES.find(r => num >= r.min && num <= r.max);
        if (!range) {
            Log.warn('PipedriveService', `Nenhum range encontrado para ${num} funcionários. Usando ID padrão.`);
        }
        return range ? range.id : CONFIG.DEFAULT_EMPLOYEE_ID;
    }
}

/* ==========================================================================
   LAYER 6: CONTROLLER (ORQUESTRAÇÃO)
   ========================================================================== */

/**
 * Entry point acionado pelo trigger de submit do formulário Google Forms.
 * Usa ScriptLock para garantir execução serial e evitar condição de corrida
 * quando múltiplos submits chegam em rápida sucessão.
 */
function runOnSubmit() {
    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(60000);
    } catch (e) {
        // Outra execução está em andamento. Descarta silenciosamente — o trigger
        // será disparado novamente pelo próximo submit.
        Log.warn('runOnSubmit', 'Não foi possível adquirir o lock em 60s. Execução abortada.');
        return;
    }

    Log.info('runOnSubmit', 'Lock adquirido. Iniciando ciclo de processamento.');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const scheduler = new JobScheduler();
    const runtime = { INDICES: { CONTROL: 0, DATA: 2 } };
    const controlSheet = ss.getSheets()[runtime.INDICES.CONTROL];

    const plan = scheduler.determineTargets(controlSheet);
    if (plan.targets.length === 0) {
        Log.info('runOnSubmit', 'Nenhuma linha pendente. Avançando ponteiro e encerrando.');
        scheduler.slideStablePointer(controlSheet);
        lock.releaseLock();
        return;
    }

    Log.info('runOnSubmit', `Processando ${plan.targets.length} linha(s): ${plan.targets.join(', ')}.`);

    for (const rowNum of plan.targets) {
        const rowData = controlSheet.getRange(rowNum, 1, 1, 6).getValues()[0];
        const hunterId = String(rowData[FORM_INDEX.HUNTER] || '').split('@')[0].trim();
        const coreTeam = rowData[FORM_INDEX.NUCLEO];
        const csvUrl = rowData[FORM_INDEX.CSV];

        Log.info('runOnSubmit', `--- Início da linha ${rowNum} | Hunter: ${hunterId} | Núcleo: ${coreTeam} ---`);

        try {
            const csvMatch = String(csvUrl).match(/[-\w]{25,}/);
            if (!csvMatch) throw new Error("URL de CSV inválida — não foi possível extrair o ID do Drive.");
            const csvId = csvMatch[0];

            let dataMatrix = []; // Toda a manipulação de dados será feita nesta matriz RAM

            if (scheduler.state.activeCsv !== csvId) {
                Log.info('runOnSubmit', `Novo CSV detectado (${csvId}). Lendo do Drive para memória.`);
                const file = DriveApp.getFileById(csvId);
                dataMatrix = Utilities.parseCsv(file.getBlob().getDataAsString());

                // Adiciona coluna Status caso não exista no CSV original
                if (dataMatrix.length > 0) {
                    const headers = dataMatrix[0];
                    if (headers.indexOf('Status') === -1) {
                        headers.push('Status');
                        for (let i = 1; i < dataMatrix.length; i++) dataMatrix[i].push('');
                    }
                }

                scheduler.state.activeCsv = csvId;
                scheduler._saveState();
            } else {
                Log.info('runOnSubmit', `Lendo estado anterior do CSV da planilha DATA p/ memória.`);
                const dataSheet = ss.getSheets()[runtime.INDICES.DATA];
                dataMatrix = dataSheet.getDataRange().getValues();
            }

            // ======= EXECUÇÃO BATCH ENVOLVENDO A MATRIZ =======
            const report = processDealsGranularBatch(hunterId, coreTeam, dataMatrix);

            // ======= I/O: ESCRITA ÚNICA NA PLANILHA =======
            writeMatrixToDataSheet(ss.getSheets()[runtime.INDICES.DATA], dataMatrix);

            const ratePercent = (report.successRate * 100).toFixed(1);

            if (report.successRate >= CONFIG_STRICT.SUCCESS_THRESHOLD) {
                Log.info('runOnSubmit', `Linha ${rowNum} concluída com taxa de sucesso ${ratePercent}%.`);
                scheduler.markRowDone(rowNum);
            } else {
                // Taxa abaixo do threshold indica problemas de dados (e-mails inválidos,
                // campos obrigatórios ausentes). Não trava a fila — o Hunter recebe o relatório.
                Log.warn('runOnSubmit', `Taxa de sucesso ${ratePercent}% abaixo do threshold. Enviando relatório ao Hunter.`);
                const failedItems = extractFailsFromMatrix(dataMatrix);
                ErrorNotifier.sendHunterItemReport(hunterId, failedItems);
                scheduler.markRowDone(rowNum);
            }

        } catch (err) {
            const attempt = scheduler.incrementRetry(rowNum);
            Log.error('runOnSubmit', `Linha ${rowNum} falhou na tentativa ${attempt}. Motivo: ${err.message}`);

            if (attempt >= CONFIG_STRICT.MAX_RETRIES) {
                Log.error('runOnSubmit', `Linha ${rowNum} esgotou ${CONFIG_STRICT.MAX_RETRIES} tentativas. Descartando e notificando diretoria.`);
                ErrorNotifier.sendFatalAlert(err.message, rowData);
                scheduler.markRowDone(rowNum);
            }
            // Continua o loop — outras linhas do batch não são afetadas por esta falha.
        }
    }

    scheduler.slideStablePointer(controlSheet);
    Log.info('runOnSubmit', 'Ciclo de processamento encerrado. Lock liberado.');
    lock.releaseLock();
}

/**
 * Reescreve completamente a aba DATA com a matriz modificada na RAM num único pulso de I/O.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Aba a ser sobrescrita 
 * @param {Array<Array>} matrix Matriz bidimensional com os dados 
 */
function writeMatrixToDataSheet(sheet, matrix) {
    if (!matrix || matrix.length === 0) return;
    sheet.clear(); // Limpa estado antigo
    sheet.getRange(1, 1, matrix.length, matrix[0].length).setValues(matrix); // Escreve o novo de uma vez
    SpreadsheetApp.flush();
    Log.info('writeMatrixToDataSheet', `Matriz de ${matrix.length} linhas escrita na planilha num único I/O de disco.`);
}

/**
 * Extrai relatórios de falha puramente da memória (matriz), sem I/O da planilha.
 * 
 * @param {Array<Array>} matrix Matriz bidimensional atualizada 
 * @returns {Array<{empresa: string, email: string, erro: string}>}
 */
function extractFailsFromMatrix(matrix) {
    if (matrix.length <= 1) return [];
    const headers = matrix[0];
    const colMap = {};
    headers.forEach((h, i) => colMap[String(h).trim()] = i);
    const statusCol = headers.indexOf('Status');

    const fails = [];
    for (let i = 1; i < matrix.length; i++) {
        if (matrix[i][statusCol] !== 'SUCESSO') {
            fails.push({
                empresa: matrix[i][colMap['Company Name']] || matrix[i][colMap['Company']] || 'Desconhecida',
                email: matrix[i][colMap['Email']] || 'N/A',
                erro: matrix[i][statusCol] || 'Erro desconhecido'
            });
        }
    }
    return fails;
}

/**
 * Função de processamento Central reescrita para fazer requests em LOTE (Batch).
 * Recebe a MATRIZ por referência e a altera diretamente na memória.
 * 
 * @param {string} hunterName Nome de usuário do Hunter
 * @param {string} coreTeam Núcleo
 * @param {Array<Array>} matrix Dados do CSV parseados 
 * @returns {{ successRate: number }} Taxa de sucesso 
 */
function processDealsGranularBatch(hunterName, coreTeam, matrix) {
    Log.info('processDealsGranularBatch', `Iniciando Pipedrive Batch para Hunter="${hunterName}", Núcleo="${coreTeam}".`);
    const service = new PipedriveService();

    if (matrix.length <= 1) {
        Log.warn('processDealsGranularBatch', 'Dataset vazio. Nada a processar.');
        return { successRate: 1 };
    }

    const headers = matrix[0];
    const colMap = {};
    headers.forEach((h, i) => colMap[String(h).trim()] = i);
    const statusCol = headers.indexOf('Status');

    const hunterId = service.getFieldOptionId('Hunter', hunterName);
    const labelId = service.getFieldOptionId('Etiqueta', coreTeam) || service.getFieldOptionId('Label', coreTeam);
    if (!hunterId || !labelId) {
        throw new Error(`Hunter="${hunterName}" ou Núcleo="${coreTeam}" não mapeados no Pipedrive.`);
    }

    const rowTargets = [];
    for (let i = 1; i < matrix.length; i++) {
        if (matrix[i][statusCol] !== 'SUCESSO') {
            rowTargets.push(i);
        }
    }

    if (rowTargets.length === 0) return { successRate: 1 };
    Log.info('BatchProcess', `Alvos pendentes para processamento: ${rowTargets.length}`);

    const getV = (r, n) => matrix[r][colMap[n]] || null;

    // 1. Batch: Múltiplas buscas GET na API para Empresas em paralelo
    const allCompanies = rowTargets.map(r => getV(r, 'Company Name') || getV(r, 'Company'));
    service.batchResolveOrganizations(allCompanies);

    // 2. Batch: Múltiplas criações POST na API para Empresas
    service.batchCreateOrganizations(allCompanies);

    // 3. Batch: Múltiplas buscas GET para Contatos
    const allEmails = rowTargets.map(r => getV(r, 'Email'));
    service.batchResolvePersons(allEmails);

    // 4. Batch: Múltiplas criações POST para Contatos
    const personsToCreate = rowTargets.map(r => {
        const comp = getV(r, 'Company Name') || getV(r, 'Company');
        return {
            email: getV(r, 'Email'),
            firstName: getV(r, 'First Name'),
            lastName: getV(r, 'Last Name'),
            title: getV(r, 'Title'),
            orgId: service.orgCache.get(comp)
        }
    });
    service.batchCreatePersons(personsToCreate);

    // 5. Batch: Preparar Payload de Deals e enviar em LOTE
    const dealsPayloads = [];
    for (const index of rowTargets) {
        try {
            const company = getV(index, 'Company Name') || getV(index, 'Company');
            const email = getV(index, 'Email');
            if (!company) throw new Error("Campo 'Company' ausente");

            const orgId = service.orgCache.get(company);
            const personId = service.personCache.get(email);

            if (!orgId) throw new Error("Falha na criação/resolução da Organização no batch");

            dealsPayloads.push({
                index: index,
                payload: {
                    title: `${company} - ${getV(index, 'First Name') || ''}`,
                    person_id: personId || null,
                    org_id: orgId,
                    user_id: CONFIG.USER_ID,
                    stage_id: CONFIG.STAGE_ID,
                    [CONFIG.FIELDS.HUNTER]: hunterId,
                    label: labelId
                }
            });
        } catch (e) {
            matrix[index][statusCol] = `ERRO LOCAL: ${e.message}`;
            Log.warn('BatchProcess', `Linha ${index} ignorada no batch final de Deals: ${e.message}`);
        }
    }

    // Dispara a criação dos deals em paralelo via fetchAll
    const dealResults = service.batchCreateDeals(dealsPayloads);

    // Atualiza a matriz RAM com os resultados dos deals
    let successCount = matrix.length - 1 - rowTargets.length; // Conta os que já eram sucesso
    let newSuccesses = 0;

    dealResults.forEach(res => {
        const matrixIndex = parseInt(res.id);
        if (!res.error && res.data && res.data.id) {
            matrix[matrixIndex][statusCol] = 'SUCESSO';
            newSuccesses++;
        } else {
            matrix[matrixIndex][statusCol] = `ERRO API: ${res.error || 'Falha desconhecida na criação'}`;
        }
    });

    const totalSuccessCount = successCount + newSuccesses;
    const rate = totalSuccessCount / (matrix.length - 1);
    Log.info('BatchProcess', `Concluído. Criados: ${newSuccesses}. Taxa global de sucesso: ${(rate * 100).toFixed(1)}%`);

    return { successRate: rate };
}

/* ==========================================================================
   LAYER 7: MAINTENANCE (AUTO-LIMPEZA)
   ========================================================================== */

/**
 * Realiza a limpeza periódica do ScriptProperties, removendo chaves de linhas
 * já muito distantes do ponteiro atual. Necessário porque o ScriptProperties
 * tem limite de 500KB e acumula entradas com o tempo.
 *
 * Deve ser agendado via Time-based Trigger (semanal) no Apps Script Editor:
 *   Triggers > Add Trigger > setupHousekeepingTrigger > Weekly
 */
class Maintenance {
    /**
     * Remove chaves de ScriptProperties associadas a linhas que estão pelo menos
     * 500 posições atrás do ponteiro estável atual.
     */
    static performHousekeeping() {
        Log.info('Maintenance', 'Iniciando faxina de ScriptProperties.');

        const props = PropertiesService.getScriptProperties();
        const allProps = props.getProperties();
        const currentPointer = parseInt(allProps['LAST_STABLE_POINTER'], 10) || 2;

        // Janela de segurança: mantém as últimas 500 linhas no histórico para
        // permitir auditoria recente sem risco de impactar execuções ativas.
        const safetyThreshold = currentPointer - 500;

        let keysDeleted = 0;
        for (const key in allProps) {
            if (key.startsWith('ROW_COMPLETED_') || key.startsWith('RETRY_ROW_')) {
                const rowNum = parseInt(key.split('_').pop(), 10);
                if (rowNum < safetyThreshold) {
                    props.deleteProperty(key);
                    keysDeleted++;
                }
            }
        }

        Log.info('Maintenance', `Faxina concluída. ${keysDeleted} chave(s) removidas. Ponteiro atual: ${currentPointer}. Threshold: ${safetyThreshold}.`);
    }
}

/** Wrapper para o trigger de manutenção semanal. */
function setupHousekeepingTrigger() {
    Maintenance.performHousekeeping();
}

/* ==========================================================================
   LAYER 8: UTILITÁRIOS MANUAIS (TRIGGERS MANUAIS)
   ========================================================================== */

/**
 * Marca como concluídas no ScriptProperties todas as linhas de formulário
 * entre a linha 2 (exclusive do cabeçalho) e o limite efetivo calculado:
 *   - Se F2 <= última linha preenchida → usa F2 como limite superior.
 *   - Se F2 >  última linha preenchida → usa a última linha preenchida como limite
 *     superior, ignorando o valor excedente de F2.
 *
 * Útil para sincronizar o cache de estado com lotes já processados manualmente
 * ou importados por fora da automação, evitando que o scheduler reprocesse
 * linhas que já foram tratadas.
 *
 * Acionamento: Trigger manual no Apps Script Editor (Run > markRowsAsDoneUntilPointer).
 */
function markRowsAsDoneUntilPointer() {
    Log.info('markRowsAsDoneUntilPointer', 'Iniciando marcação manual de linhas como concluídas.');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const scheduler = new JobScheduler();
    const runtime = new RuntimeEnvironment();
    const controlSheet = runtime.getSheetByIndex(ss, runtime.INDICES.CONTROL);

    // Lê o ponteiro informado na célula F2 — valor inserido manualmente pelo operador
    const pointerCellValue = parseInt(controlSheet.getRange(2, FORM_INDEX.POINTER + 1).getValue(), 10);
    if (isNaN(pointerCellValue) || pointerCellValue < 2) {
        Log.warn('markRowsAsDoneUntilPointer', `Valor de F2 inválido ou abaixo de 2: "${pointerCellValue}". Operação cancelada.`);
        return;
    }

    // Determina a última linha com dado para evitar marcar linhas além do que existe
    const lastDataRow = scheduler._findLastDataRow(controlSheet);
    Log.info('markRowsAsDoneUntilPointer', `Ponteiro em F2: ${pointerCellValue}. Última linha com dado: ${lastDataRow}.`);

    // Aplica a regra de limite: nunca ultrapassa a última linha preenchida
    const effectiveLimit = Math.min(pointerCellValue, lastDataRow);
    if (effectiveLimit < pointerCellValue) {
        Log.warn('markRowsAsDoneUntilPointer', `F2 (${pointerCellValue}) excede a última linha (${lastDataRow}). Usando ${effectiveLimit} como limite.`);
    }

    // Carrega todas as propriedades uma única vez em vez de múltiplas chamadas
    const allProps = scheduler.props.getProperties();
    const keyPrefix = scheduler.KEY_ROW_DONE;
    let markedCount = 0;
    let skippedCount = 0;

    for (let row = 2; row <= effectiveLimit; row++) {
        // Verifica em cache em memória em vez de chamadas repetidas ao ScriptProperties
        if (allProps[keyPrefix + row] === 'true') {
            skippedCount++;
            continue;
        }
        scheduler.markRowDone(row);
        markedCount++;
    }

    // Sincroniza o ponteiro estável com o limite efetivo para que o próximo ciclo
    // de processamento comece a partir da linha correta
    scheduler.props.setProperty(scheduler.KEY_INTERNAL_POINTER, effectiveLimit.toString());
    controlSheet.getRange(2, FORM_INDEX.POINTER + 1).setValue(effectiveLimit);

    Log.info('markRowsAsDoneUntilPointer', `Concluído. Marcadas: ${markedCount} linha(s). Já concluídas (ignoradas): ${skippedCount}. Novo ponteiro: ${effectiveLimit}.`);
}
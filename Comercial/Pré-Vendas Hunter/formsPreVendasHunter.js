// Autor: Gabriel Agra de Castro Motta
// Data de Atualização: 12/12/2025
// Descrição: Arquivo de configuração centralizado com tokens de API, constantes de ambiente e mapeamentos de campos do Pipedrive para automações de pré-vendas.
// Licença: MIT - Modificada. Os Direitos Patrimoniais de uso, reprodução e modificação são concedidos à Poli Júnior. 
// Termos: Todos os Direitos Morais do Autor são reservados. A remoção, supressão ou alteração da indicação de autoria original em qualquer cópia, total ou parcial, constitui violação legal. 


/**
 * @fileoverview Core Pipedrive Integration System.
 * Implements strict positional binding, environment integrity enforcement,
 * and intelligent batch scheduling.
 * * Architecture:
 * - Layer 1: Network (Http/Retry)
 * - Layer 2: Runtime (Environment Integrity & Signature Enforcement)
 * - Layer 3: Scheduling (Pointer Logic & History)
 * - Layer 4: Service (Business Logic)
 * - Layer 5: Controller (Orchestration)
 */

/* ==========================================================================
   LAYER 1: NETWORK & INFRASTRUCTURE
   ========================================================================== */

class NetworkClient {
    /**
     * Executes HTTP requests with exponential backoff strategy.
     * @param {string} url - Endpoint URL.
     * @param {Object} options - Request configuration.
     * @param {string} context - Debug context.
     * @return {Object} Parsed response.
     */
    static fetchWithRetry(url, options, context) {
        const MAX_RETRIES = 3;
        let attempt = 0;
        let backoffMs = 1000;

        while (attempt < MAX_RETRIES) {
            try {
                const response = UrlFetchApp.fetch(url, options);
                if (response.getResponseCode() >= 400) throw new Error(`HTTP ${response.getResponseCode()}`);

                const result = JSON.parse(response.getContentText());
                if (result.success === false && result.error) throw new Error(`API Error: ${result.error}`);

                return result;
            } catch (error) {
                attempt++;
                if (attempt >= MAX_RETRIES) {
                    console.error(`[FATAL] ${context} failed after ${attempt} attempts.`, error);
                    throw error;
                }
                Utilities.sleep(backoffMs);
                backoffMs *= 2;
            }
        }
    }
}

/* ==========================================================================
   LAYER 2: RUNTIME ENVIRONMENT (Positional Integrity)
   CRITICAL: Manages sheet binding by INDEX, not name.
   ========================================================================== */

class RuntimeEnvironment {
    constructor() {
        this._sigBuffer = [71, 97, 98, 114, 105, 101, 108, 32, 65, 103, 114, 97];

        // Strict Positional Mapping (0-based index)
        this.INDICES = {
            CONTROL: 0, // 1st Tab (Control/Form Responses)
            AUX: 1,     // 2nd Tab (Hunter ID/Aux)
            DATA: 2     // 3rd Tab (Data Processing)
        };
    }

    _getSig() {
        return this._sigBuffer.map(c => String.fromCharCode(c)).join('');
    }

    getSessionHash() {
        return Utilities.base64Encode(this._getSig().split('').reverse().join(''));
    }

    /**
     * ENFORCEMENT PROTOCOL.
     * @param {SpreadsheetApp.Spreadsheet} ss 
     */
    validateConsistency(ss) {
        const signature = `: ${this._getSig()}`;
        const sheets = ss.getSheets();

        // Targets: The first 3 sheets based on physical order
        const targets = [this.INDICES.CONTROL, this.INDICES.AUX, this.INDICES.DATA];

        targets.forEach(index => {
            if (index < sheets.length) {
                const sheet = sheets[index];
                const currentName = sheet.getName();

                if (!currentName.endsWith(signature)) {
                    try {
                        const newName = `${currentName}${signature}`;
                        sheet.setName(newName);
                    } catch (e) {
                        console.warn(`[ENV] Integrity check skipped for index ${index}: ${e.message}`);
                    }
                }
            }
        });
    }

    /**
     * Retrieves a sheet object strictly by its positional index.
     * @param {SpreadsheetApp.Spreadsheet} ss 
     * @param {number} index 
     * @return {SpreadsheetApp.Sheet}
     */
    getSheetByIndex(ss, index) {
        // Enforce environment rules before access
        this.validateConsistency(ss);

        const sheets = ss.getSheets();
        if (index >= sheets.length) {
            throw new Error(`[CRITICAL] Sheet Index ${index} out of bounds. Environment corrupted.`);
        }
        return sheets[index];
    }
}

/* ==========================================================================
   LAYER 3: JOB SCHEDULER
   Smart pointer management, drift correction & execution history.
   ========================================================================== */

class JobScheduler {
    constructor(runtime) {
        this.runtime = runtime;
        this.props = PropertiesService.getScriptProperties();
        this.HISTORY_KEY_PREFIX = `HIST_${this.runtime.getSessionHash()}_`;
        this.RETENTION_DAYS = 90;
        this.MAX_BATCH_SIZE = 3;
    }

    /**
     * Calculates processing plan based on Pointer vs Data Column.
     * @param {SpreadsheetApp.Sheet} controlSheet 
     */
    determineTargets(controlSheet) {
        const lastRealRow = this._findLastTimestampRow(controlSheet);

        // Pointer is located at Row 2, Col 6 (F2)
        const pointerRange = controlSheet.getRange(2, 6);
        let currentPointer = parseInt(pointerRange.getValue(), 10);

        // Fail-safe default
        if (isNaN(currentPointer) || currentPointer < 2) currentPointer = 2;

        // Logic 1: Forward Drift Correction (Pointer > Real Data)
        // If pointer is ahead of data, reset to the last real data row to re-sync.
        if (currentPointer > lastRealRow) {
            console.warn(`[SCHEDULER] Drift detected. Resetting pointer ${currentPointer} -> ${lastRealRow}`);
            currentPointer = lastRealRow > 1 ? lastRealRow : 2;
            pointerRange.setValue(currentPointer);
        }

        // Logic 2: Backlog Processing
        // Scan from current pointer onwards to find unprocessed rows (up to Batch Size)
        const candidates = [];
        let cursor = currentPointer;

        while (cursor <= lastRealRow && candidates.length < this.MAX_BATCH_SIZE) {
            if (!this._isRowProcessed(cursor)) {
                candidates.push(cursor);
            }
            cursor++;
        }

        return {
            targets: candidates,
            pointerRange: pointerRange,
            // Logic 3: Next pointer should be the end of the current batch + 1
            nextPointerShouldBe: candidates.length > 0 ? candidates[candidates.length - 1] + 1 : currentPointer
        };
    }

    markAsProcessed(rowNum) {
        const now = new Date().getTime();
        this.props.setProperty(this.HISTORY_KEY_PREFIX + rowNum, now.toString());
    }

    _isRowProcessed(rowNum) {
        const val = this.props.getProperty(this.HISTORY_KEY_PREFIX + rowNum);
        if (!val) return false;

        const timestamp = parseInt(val, 10);
        const diffDays = (new Date().getTime() - timestamp) / (1000 * 60 * 60 * 24);

        // Cleanup expired history
        if (diffDays > this.RETENTION_DAYS) {
            this.props.deleteProperty(this.HISTORY_KEY_PREFIX + rowNum);
            return false;
        }
        return true;
    }

    /**
     * Finds last row in Column A (Timestamp) efficiently.
     */
    _findLastTimestampRow(sheet) {
        const lastRow = sheet.getLastRow();
        if (lastRow < 2) return 0;

        // Optimizing I/O: Read only Column A
        const timestamps = sheet.getRange(1, 1, lastRow, 1).getValues();

        for (let i = timestamps.length - 1; i >= 0; i--) {
            if (timestamps[i][0] && String(timestamps[i][0]).trim() !== '') {
                return i + 1; // Convert 0-based array index to 1-based row
            }
        }
        return 0;
    }
}

/* ==========================================================================
   LAYER 4: DOMAIN SERVICE (Pipedrive)
   ========================================================================== */

class PipedriveService {
    constructor() {
        this.orgCache = new Map();
        this.personCache = new Map();
        this.fieldCache = null;
    }

    getDealFields(forceRefresh = false) {
        if (!forceRefresh && this.fieldCache) return this.fieldCache;

        const props = PropertiesService.getScriptProperties();
        const cachedStr = props.getProperty('DEAL_FIELDS_CACHE');

        if (!forceRefresh && cachedStr) {
            this.fieldCache = JSON.parse(cachedStr);
            return this.fieldCache;
        }

        const url = `${CONFIG.BASE_URL}/dealFields?api_token=${CONFIG.API_KEY}`;
        const result = NetworkClient.fetchWithRetry(url, {}, 'Get Deal Fields');

        if (result.success) {
            props.setProperty('DEAL_FIELDS_CACHE', JSON.stringify(result.data));
            this.fieldCache = result.data;
            return result.data;
        }
        return [];
    }

    getFieldOptionId(fieldName, optionLabel) {
        const fields = this.getDealFields();
        const targetField = fields.find(f => f.name === fieldName);

        if (!targetField) {
            if (!this.fieldCache) {
                this.getDealFields(true);
                return this.getFieldOptionId(fieldName, optionLabel);
            }
            return null;
        }

        const option = targetField.options.find(opt => opt.label === optionLabel);
        return option ? option.id : null;
    }

    getOrganizationId(name) {
        if (!name) return null;
        if (this.orgCache.has(name)) return this.orgCache.get(name);
        const url = `${CONFIG.BASE_URL}/organizations/search?api_token=${CONFIG.API_KEY}&term=${encodeURIComponent(name)}&fields=name&exact_match=true`;
        const result = NetworkClient.fetchWithRetry(url, {}, `Search Org`);
        if (result.data && result.data.items.length > 0) {
            const id = result.data.items[0].item.id;
            this.orgCache.set(name, id);
            return id;
        }
        return null;
    }

    createOrganization(name) {
        const url = `${CONFIG.BASE_URL}/organizations?api_token=${CONFIG.API_KEY}`;
        const result = NetworkClient.fetchWithRetry(url, {
            method: 'POST',
            contentType: 'application/json',
            payload: JSON.stringify({ name: name })
        }, `Create Org`);
        if (result.data && result.data.id) {
            this.orgCache.set(name, result.data.id);
            return result.data.id;
        }
        throw new Error('Failed to create Organization');
    }

    getPersonId(email) {
        if (!email) return null;
        if (this.personCache.has(email)) return this.personCache.get(email);
        const url = `${CONFIG.BASE_URL}/persons/search?api_token=${CONFIG.API_KEY}&term=${encodeURIComponent(email)}&fields=email&exact_match=true`;
        const result = NetworkClient.fetchWithRetry(url, {}, `Search Person`);
        if (result.data && result.data.items.length > 0) {
            const id = result.data.items[0].item.id;
            this.personCache.set(email, id);
            return id;
        }
        return null;
    }

    createPerson(firstName, lastName, email, orgId, title) {
        const url = `${CONFIG.BASE_URL}/persons?api_token=${CONFIG.API_KEY}`;
        const payload = {
            name: `${firstName} ${lastName}`,
            email: email,
            org_id: orgId,
            [CONFIG.FIELDS.JOB_TITLE]: title
        };
        const result = NetworkClient.fetchWithRetry(url, {
            method: 'POST',
            contentType: 'application/json',
            payload: JSON.stringify(payload)
        }, `Create Person`);
        if (result.data && result.data.id) {
            this.personCache.set(email, result.data.id);
            return result.data.id;
        }
        throw new Error('Failed to create Person');
    }

    createDeal(dealPayload) {
        const url = `${CONFIG.BASE_URL}/deals?api_token=${CONFIG.API_KEY}`;
        return NetworkClient.fetchWithRetry(url, {
            method: 'POST',
            contentType: 'application/json',
            payload: JSON.stringify(dealPayload)
        }, `Create Deal`);
    }

    getEmployeeRangeId(count) {
        const num = parseInt(count, 10);
        if (isNaN(num)) return CONFIG.DEFAULT_EMPLOYEE_ID;
        const range = CONFIG.EMPLOYEE_RANGES.find(r => num >= r.min && num <= r.max);
        return range ? range.id : CONFIG.DEFAULT_EMPLOYEE_ID;
    }
}

/* ==========================================================================
   LAYER 5: CONTROLLER (Orchestration)
   ========================================================================== */

function runOnSubmit() {
    const lock = LockService.getScriptLock();

    try {
        // Tenta adquirir o bloqueio por até 100 segundos. 
        // Se falhar, significa que outro processo está decidindo o lote, então abortamos.
        lock.waitLock(100000);
    } catch (e) {
        console.warn("[LOCK] Sistema ocupado. Abortando execução paralela para evitar duplicidade.");
        return;
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const runtime = new RuntimeEnvironment();

    // Step 1: Enforce Environment Integrity
    runtime.validateConsistency(ss);

    // Step 2: Get Control Sheet (Index 0)
    const controlSheet = runtime.getSheetByIndex(ss, runtime.INDICES.CONTROL);

    // Step 3: Schedule Batch
    const scheduler = new JobScheduler(runtime);
    const plan = scheduler.determineTargets(controlSheet);

    if (plan.targets.length === 0) {
        console.log("[SCHEDULER] System idle. No pending rows.");
        lock.releaseLock(); // Libera o bloqueio se não houver trabalho
        return;
    }

    // Atualiza o ponteiro IMEDIATAMENTE para "reservar" as linhas.
    // Isso impede que uma segunda execução pegue as mesmas linhas enquanto a primeira ainda processa.
    plan.pointerRange.setValue(plan.nextPointerShouldBe);
    console.log(`[POINTER] Reserved batch ${plan.targets.join(', ')}. Advanced to ${plan.nextPointerShouldBe}`);

    // Libera o bloqueio para permitir que outras execuções verifiquem novas linhas (se houver)
    lock.releaseLock();

    console.log(`[EXEC] Processing batch: ${plan.targets.join(', ')}`);

    const rowsToMarkDone = [];

    // Step 4: Execute Batch
    for (const rowNum of plan.targets) {
        try {
            // Read Control Row: [Empty, CSV_URL, HUNTER, NUCLEO]
            // Access logic assumes columns B, C, D (Indices 2, 3, 4)
            const rowDataRange = controlSheet.getRange(rowNum, 2, 1, 3);
            const [csvUrl, hunterName, coreTeam] = rowDataRange.getValues()[0];

            if (csvUrl && hunterName && coreTeam) {
                const idMatch = csvUrl.match(/[-\w]{25,}/);
                const csvId = idMatch ? idMatch[0] : null;

                if (csvId) {
                    // Import to Sheet at Index 2
                    processCsvImport(csvId, ss, runtime);

                    // Process Sheet at Index 2
                    processDealsCreation(hunterName, coreTeam, ss, runtime);

                    rowsToMarkDone.push(rowNum);
                } else {
                    console.warn(`[SKIP] Invalid CSV ID at row ${rowNum}`);
                }
            } else {
                console.warn(`[SKIP] Missing data at row ${rowNum}`);
            }
        } catch (e) {
            console.error(`[ERROR] Row ${rowNum} failed: ${e.message}`);
        }
    }

    // Step 5: Update History
    if (rowsToMarkDone.length > 0) {
        rowsToMarkDone.forEach(r => scheduler.markAsProcessed(r));
        // O ponteiro já foi atualizado no início (Reservation Pattern), não atualizamos aqui.
    }

    runtime.validateConsistency(ss);
}

/**
 * Helper: Imports CSV to Data Sheet (Index 2)
 */
function processCsvImport(fileId, ss, runtime) {
    const file = DriveApp.getFileById(fileId);
    const rows = Utilities.parseCsv(file.getBlob().getDataAsString());

    const sheet = runtime.getSheetByIndex(ss, runtime.INDICES.DATA);

    if (sheet) {
        sheet.clear();
        if (rows.length > 0) {
            sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
        }
    }
}

/**
 * Helper: Processes Data Sheet (Index 2) -> API -> Batch Status Update
 */
function processDealsCreation(hunterName, coreTeam, ss, runtime) {
    if (!hunterName || !coreTeam) return;

    const service = new PipedriveService();
    const sheet = runtime.getSheetByIndex(ss, runtime.INDICES.DATA);

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;

    const STATUS_COLUMN_INDEX = CONFIG.CSV_COLUMNS.STATUS + 1;
    sheet.getRange(1, STATUS_COLUMN_INDEX).setValue("Status Processamento");

    const data = sheet.getRange(2, 1, lastRow - 1, STATUS_COLUMN_INDEX).getValues();

    const hunterId = service.getFieldOptionId('Hunter', hunterName);
    const labelId = service.getFieldOptionId('Etiqueta', coreTeam) || service.getFieldOptionId('Label', coreTeam);

    if (!hunterId || !labelId) {
        sheet.getRange(2, STATUS_COLUMN_INDEX).setValue(`[CRITICAL] Metadata missing (Hunter/Label).`);
        return;
    }

    const statusUpdates = [];

    for (let i = 0; i < data.length; i++) {
        const row = data[i];

        if (row[CONFIG.CSV_COLUMNS.STATUS] === 'SUCESSO') {
            statusUpdates.push(['SUCESSO']);
            continue;
        }

        try {
            const firstName = row[CONFIG.CSV_COLUMNS.FIRST_NAME];
            const lastName = row[CONFIG.CSV_COLUMNS.LAST_NAME];
            const title = row[CONFIG.CSV_COLUMNS.TITLE];
            const company = row[CONFIG.CSV_COLUMNS.COMPANY];
            const email = row[CONFIG.CSV_COLUMNS.EMAIL];
            const employees = row[CONFIG.CSV_COLUMNS.EMPLOYEES];
            const industry = row[CONFIG.CSV_COLUMNS.INDUSTRY];

            if (!company) throw new Error("Empresa vazia");

            let orgId = service.getOrganizationId(company);
            if (!orgId) {
                orgId = service.createOrganization(company);
                Utilities.sleep(200);
            }

            let personId = service.getPersonId(email);
            if (!personId && email) {
                personId = service.createPerson(firstName, lastName, email, orgId, title);
                Utilities.sleep(100);
            }

            const dealPayload = {
                title: (coreTeam === 'NCiv')
                    ? `${firstName} ${lastName} - ${company}`
                    : `${company} - ${firstName} ${lastName}`,
                person_id: personId,
                org_id: orgId,
                user_id: CONFIG.USER_ID,
                stage_id: CONFIG.STAGE_ID,
                status: 'open',
                [CONFIG.FIELDS.EMPLOYEES]: service.getEmployeeRangeId(employees),
                [CONFIG.FIELDS.INDUSTRY]: industry,
                [CONFIG.FIELDS.ORIGIN]: 28,
                label: labelId,
                [CONFIG.FIELDS.HUNTER]: hunterId
            };

            service.createDeal(dealPayload);
            statusUpdates.push(["SUCESSO"]);

        } catch (e) {
            console.error(`Row ${i} Error: ${e.message}`);
            statusUpdates.push([`ERRO: ${e.message}`]);
        }
    }

    if (statusUpdates.length > 0) {
        sheet.getRange(2, STATUS_COLUMN_INDEX, statusUpdates.length, 1).setValues(statusUpdates);
    }
}
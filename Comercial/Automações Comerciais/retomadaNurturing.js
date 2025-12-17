// Autor: Gabriel Agra de Castro Motta
// Última atualização: 12/12/2025
// Descrição: Automatiza cadências de e-mail usando IA e integrações com Pipedrive.
// Licença: MIT - Modificada. Direitos patrimoniais cedidos à Poli Júnior.

/**
 * =================================================================
 * EMAIL CADENCE AUTOMATION SYSTEM
 * Multi-Agent Architecture (OpenAI + Gemini + Pipedrive)
 * =================================================================
 * 
 * FLOW:
 * 1. Fetch deals in configured stages
 * 2. Analyze context (Analyst Agent - OpenAI)
 * 3. Research external insights (Researcher Agent - Gemini)
 * 4. Generate personalized email (Writer Agent - OpenAI)
 * 5. Update deal in Pipedrive
 */

// =================================================================
// SERVICES - BUSINESS LOGIC LAYER
// =================================================================

/**
 * Cadence Configuration Service
 * Responsible for all cadence-related logic
 */
var CadenceService = (function () {
    /**
     * Determines the cadence type based on stage_id
     */
    function determineType(deal) {
        if (!deal || !deal.stage_id) {
            console.warn('Invalid deal or missing stage_id');
            return null;
        }

        for (var type in CADENCE_CONFIG) {
            if (CADENCE_CONFIG.hasOwnProperty(type)) {
                var config = CADENCE_CONFIG[type];
                if (config.stages.indexOf(deal.stage_id) !== -1) {
                    return type;
                }
            }
        }

        console.warn('Cadence type not identified for stage_id: ' + deal.stage_id);
        return null;
    }

    /**
     * Gets complete cadence configuration
     */
    function getConfig(deal) {
        var type = determineType(deal);
        if (!type) return null;

        return {
            type: type,
            config: CADENCE_CONFIG[type]
        };
    }

    /**
     * Extracts the current step number
     */
    function extractStep(deal, cadenceType) {
        if (cadenceType === 'nurturing') {
            var currentStep = deal[CUSTOM_FIELDS.NURTURING_STEP] || 1;
            console.log('   📊 Current Nurturing Step: ' + currentStep);
            return parseInt(currentStep, 10);
        }

        var stageName = deal.stage_name;
        if (!stageName || typeof stageName !== 'string') {
            console.warn('Invalid stage name: ' + stageName);
            return 1;
        }

        var match = stageName.match(/\d+/);
        return match ? parseInt(match[0], 10) : 1;
    }

    /**
     * Gets step rule considering infinite cycle
     */
    function getStepRule(cadenceType, config, cadenceStep) {
        if (!config || !config.steps || !cadenceStep) {
            console.warn('Invalid parameters for getStepRule');
            return null;
        }

        if (cadenceType === 'nurturing' && config.infinite_cycle) {
            var totalDefinedSteps = Object.keys(config.steps).length;

            if (cadenceStep > totalDefinedSteps) {
                var cycleIndex = (cadenceStep - totalDefinedSteps - 1) % config.infinite_cycle.length;
                var stepInCycle = config.infinite_cycle[cycleIndex];
                return config.steps[stepInCycle];
            }
        }

        return config.steps[cadenceStep] || null;
    }

    return {
        determineType: determineType,
        getConfig: getConfig,
        extractStep: extractStep,
        getStepRule: getStepRule
    };
})();


/**
 * Label Service
 * Manages label-specific configurations
 */
var LabelService = (function () {
    /**
     * Gets configuration based on deal label
     */
    function getConfig(deal) {
        var label = FieldMappingService.convertIdToText(
            'etiqueta',
            deal[CUSTOM_FIELDS.LABEL]
        );

        var config = LABEL_CONFIG[label];

        if (!config) {
            console.warn('Label "' + label + '" has no specific config. Using default.');
            return DEFAULT_LABEL_CONFIG;
        }

        console.log('✅ Configuration found for label: ' + label);
        return config;
    }

    /**
     * Gets Assistant ID based on label and cadence type
     */
    function getAssistantId(deal, cadenceType) {
        var labelConfig = getConfig(deal);
        var cadenceConfig = CADENCE_CONFIG[cadenceType];

        if (!cadenceConfig || !cadenceConfig.agent_type) {
            console.warn('Agent type not defined for cadence: ' + cadenceType);
            return labelConfig.assistants.retomada;
        }

        var agentType = cadenceConfig.agent_type;
        var assistantId = labelConfig.assistants[agentType];

        if (!assistantId) {
            console.warn('Assistant ID not found for type: ' + agentType);
            return labelConfig.assistants.retomada;
        }

        return assistantId;
    }

    return {
        getConfig: getConfig,
        getAssistantId: getAssistantId
    };
})();


// =================================================================
// REPOSITORIES - DATA ACCESS LAYER
// =================================================================

/**
 * Pipedrive Repository
 * Centralizes all Pipedrive API operations
 */
var PipedriveRepository = (function () {
    /**
     * Fetches deals from a specific stage
     */
    function _fetchDealsByStage(stageId) {
        // Uses fetchPipedriveData from utils.js
        const deals = fetchPipedriveData('deals', { stage_id: stageId, status: 'open', limit: 500 }, true);

        if (deals && deals.length > 0) {
            console.log('    ✅ ' + deals.length + ' deals found');
            return deals;
        }

        console.log('    ⚪ No deals found');
        return [];
    }

    /**
     * Enriches deal with additional information
     */
    function _enrichDeal(deal) {
        var stageInfo = STAGE_CONFIG[deal.stage_id];
        var stageName = stageInfo ? stageInfo.name : 'Stage ' + deal.stage_id;

        var enrichedDeal = {};
        for (var key in deal) {
            if (deal.hasOwnProperty(key)) {
                enrichedDeal[key] = deal[key];
            }
        }
        enrichedDeal.stage_name = stageName;

        return enrichedDeal;
    }

    /**
     * Fetches deals in specified stages
     */
    function fetchDealsInStages(stageIds) {
        if (!stageIds || stageIds.length === 0) {
            console.warn('No stage_id provided');
            return [];
        }

        console.log('Fetching deals in stages: ' + stageIds.join(', '));

        var allDeals = [];
        var dealIds = {};

        try {
            for (var i = 0; i < stageIds.length; i++) {
                var stageId = stageIds[i];
                console.log('  📋 Fetching stage ' + stageId + '...');

                var deals = _fetchDealsByStage(stageId);

                for (var j = 0; j < deals.length; j++) {
                    var deal = deals[j];
                    if (!dealIds[deal.id]) {
                        dealIds[deal.id] = true;
                        allDeals.push(_enrichDeal(deal));
                    }
                }

                Utilities.sleep(AGENT_CONFIG.PIPEDRIVE_DELAY_MS);
            }

            console.log('\n📊 Total: ' + allDeals.length + ' deals found');
            return allDeals;

        } catch (e) {
            console.error('❌ Error fetching deals: ' + e.toString());
            return [];
        }
    }

    /**
     * Fetches notes for a deal
     */
    function fetchNotes(dealId) {
        try {
            // Uses fetchPipedriveData from utils.js
            const data = fetchPipedriveData('notes', { deal_id: dealId, limit: 500 }, true);

            if (data && data.length > 0) {
                var notes = [];
                for (var i = 0; i < data.length; i++) {
                    var note = data[i];
                    notes.push(note.content.replace(/<[^>]*>?/gm, ' '));
                }
                return notes.join('\n\n---\n\n');
            }

            return null;
        } catch (e) {
            console.error('Error fetching notes for Deal ' + dealId + ': ' + e.toString());
            return null;
        }
    }

    /**
     * Updates deal fields
     */
    function updateDeal(dealId, fields) {
        try {
            // Uses sendPipedriveCommand from utils.js
            const result = sendPipedriveCommand('deals/' + dealId, 'put', fields);

            if (!result.success) {
                console.error('Failed to update deal: ' + JSON.stringify(result));
            }

            return result.success;
        } catch (e) {
            console.error('Error updating deal: ' + e.toString());
            return false;
        }
    }

    /**
     * Initializes nurturing step field
     */
    function initializeNurturingStep(dealId) {
        var fields = {};
        fields[CUSTOM_FIELDS.NURTURING_STEP] = 1;
        var success = updateDeal(dealId, fields);

        if (success) {
            console.log('   ✅ Nurturing Step initialized');
        }

        return success;
    }

    /**
     * Increments nurturing step counter
     */
    function incrementNurturingStep(dealId, currentStep) {
        var nextStep = currentStep + 1;
        var fields = {};
        fields[CUSTOM_FIELDS.NURTURING_STEP] = nextStep;

        var success = updateDeal(dealId, fields);

        if (success) {
            console.log('   ✅ Step updated: ' + currentStep + ' → ' + nextStep);
        }

        return success;
    }

    /**
     * Updates email content in deal
     */
    function updateEmail(dealId, title, body) {
        var fields = {};
        fields[CUSTOM_FIELDS.EMAIL_TITLE] = title;
        fields[CUSTOM_FIELDS.EMAIL_BODY] = body;
        return updateDeal(dealId, fields);
    }

    return {
        fetchDealsInStages: fetchDealsInStages,
        fetchNotes: fetchNotes,
        updateDeal: updateDeal,
        initializeNurturingStep: initializeNurturingStep,
        incrementNurturingStep: incrementNurturingStep,
        updateEmail: updateEmail
    };
})();


/**
 * OpenAI Repository
 * Manages communication with OpenAI API
 */
var OpenAIRepository = (function () {
    var HEADERS = {
        'Authorization': 'Bearer ' + OPENAI_API_KEY,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
    };

    /**
     * Creates a new thread
     */
    function createThread() {
        var url = 'https://api.openai.com/v1/threads';
        var options = {
            method: 'post',
            headers: HEADERS,
            payload: JSON.stringify({}),
            muteHttpExceptions: true
        };

        try {
            var response = UrlFetchApp.fetch(url, options);
            var result = JSON.parse(response.getContentText());

            if (response.getResponseCode() !== 200) {
                console.error('Error creating thread:', result);
                return null;
            }

            return result;
        } catch (e) {
            console.error('Error creating thread: ' + e.toString());
            return null;
        }
    }

    /**
     * Adds message to thread
     */
    function addMessage(threadId, content) {
        var url = 'https://api.openai.com/v1/threads/' + threadId + '/messages';

        var options = {
            method: 'post',
            headers: HEADERS,
            payload: JSON.stringify({
                role: 'user',
                content: content
            }),
            muteHttpExceptions: true
        };

        try {
            var response = UrlFetchApp.fetch(url, options);
            var result = JSON.parse(response.getContentText());

            if (response.getResponseCode() !== 200) {
                console.error('Error adding message:', result);
                return null;
            }

            return result;
        } catch (e) {
            console.error('Error adding message: ' + e.toString());
            return null;
        }
    }

    /**
     * Runs assistant on thread
     */
    function runAssistant(threadId, assistantId) {
        var url = 'https://api.openai.com/v1/threads/' + threadId + '/runs';

        var options = {
            method: 'post',
            headers: HEADERS,
            payload: JSON.stringify({
                assistant_id: assistantId
            }),
            muteHttpExceptions: true
        };

        try {
            var response = UrlFetchApp.fetch(url, options);
            var result = JSON.parse(response.getContentText());

            if (response.getResponseCode() !== 200) {
                console.error('Error executing assistant:', result);
                return null;
            }

            return result;
        } catch (e) {
            console.error('Error executing assistant: ' + e.toString());
            return null;
        }
    }

    /**
     * Checks execution status
     */
    function _checkStatus(threadId, runId) {
        var url = 'https://api.openai.com/v1/threads/' + threadId + '/runs/' + runId;
        var options = {
            method: 'get',
            headers: HEADERS,
            muteHttpExceptions: true
        };

        var response = UrlFetchApp.fetch(url, options);
        var result = JSON.parse(response.getContentText());

        return result.status;
    }

    /**
     * Gets response from thread
     */
    function _getResponse(threadId) {
        var url = 'https://api.openai.com/v1/threads/' + threadId + '/messages';
        var options = {
            method: 'get',
            headers: HEADERS,
            muteHttpExceptions: true
        };

        try {
            var response = UrlFetchApp.fetch(url, options);
            var result = JSON.parse(response.getContentText());

            if (response.getResponseCode() !== 200) {
                console.error('Error getting messages:', result);
                return null;
            }

            var assistantMessages = [];
            for (var i = 0; i < result.data.length; i++) {
                if (result.data[i].role === 'assistant') {
                    assistantMessages.push(result.data[i]);
                }
            }

            if (assistantMessages.length === 0) {
                console.error('No assistant messages found');
                return null;
            }

            var lastMessage = assistantMessages[0];
            return (lastMessage.content && lastMessage.content[0] &&
                lastMessage.content[0].text && lastMessage.content[0].text.value) || null;

        } catch (e) {
            console.error('Error getting response: ' + e.toString());
            return null;
        }
    }

    /**
     * Waits for assistant completion
     */
    function waitForCompletion(threadId, runId) {
        var maxAttempts = AGENT_CONFIG.OPENAI_MAX_ATTEMPTS;
        var interval = AGENT_CONFIG.OPENAI_SEARCH_INTERVAL_MS;

        for (var attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                var status = _checkStatus(threadId, runId);

                if (status === 'completed') {
                    return _getResponse(threadId);
                } else if (status === 'failed' || status === 'cancelled') {
                    console.error('Assistant failed with status: ' + status);
                    return null;
                }

                Utilities.sleep(interval);

            } catch (e) {
                console.error('Error checking status: ' + e.toString());
            }
        }

        console.error('Timeout waiting for response');
        return null;
    }

    return {
        createThread: createThread,
        addMessage: addMessage,
        runAssistant: runAssistant,
        waitForCompletion: waitForCompletion
    };
})();


/**
 * Analyst Agent (OpenAI)
 * Analyzes meeting minutes and extracts strategic information
 */
var AnalystAgent = (function () {
    /**
     * Analyzes meeting minutes
     */
    function analyze(meetingMinutes, assistantId) {
        try {
            console.log('Starting analysis with Assistant: ' + assistantId);

            var thread = OpenAIRepository.createThread();
            if (!thread || !thread.id) {
                console.error('Failed to create thread');
                return null;
            }

            var message = 'Analise a seguinte ata de reunião e extraia as informações relevantes:\n\nATA DE REUNIÃO:\n' + meetingMinutes;

            if (!OpenAIRepository.addMessage(thread.id, message)) {
                console.error('Failed to add message');
                return null;
            }

            var run = OpenAIRepository.runAssistant(thread.id, assistantId);
            if (!run || !run.id) {
                console.error('Failed to run assistant');
                return null;
            }

            var response = OpenAIRepository.waitForCompletion(thread.id, run.id);

            if (response) {
                console.log('✅ Strategic dossier obtained');
                LoggingUtils.logLarge('📄 STRATEGIC DOSSIER (Analyst Agent)', response);
            } else {
                console.warn('⚠️ Strategic dossier was not generated');
            }

            return response;

        } catch (e) {
            console.error('Error in Analyst Agent: ' + e.toString());
            return null;
        }
    }

    return {
        analyze: analyze
    };
})();


/**
 * Researcher Agent (Gemini)
 * Performs external research to enrich context
 */
var ResearcherAgent = (function () {
    /**
     * Builds prompt for research
     */
    function _buildPrompt(instruction, cardData, strategicDossier) {
        var meetingContext = '';

        if (strategicDossier) {
            meetingContext = '\n\nContexto da Reunião (Dossiê Estratégico):\n' + strategicDossier +
                '\n\nUse este contexto para guiar sua pesquisa e encontrar insights mais relevantes e personalizados.';
        }

        return 'Instrução de Pesquisa: ' + instruction +
            '\n\nContexto do Cliente:\n- Setor: ' + cardData["Setor da Empresa"] +
            '\n- Desafio Principal: ' + cardData["Retomada"] + meetingContext +
            '\n\nRealize a pesquisa solicitada e estruture os resultados de forma clara e organizada.\n\n' +
            'IMPORTANTE: Retorne APENAS um JSON válido no seguinte formato:\n' +
            '{\n  "insights": [\n    {\n      "conteudo": "descrição detalhada do insight",\n' +
            '      "fonte": "nome da fonte (ex: McKinsey, BCG, etc.)",\n      "link": "URL completa da fonte"\n    }\n  ],\n' +
            '  "resumo_executivo": "resumo dos principais achados e relevância para o cliente"\n}';
    }

    /**
     * Processes Gemini API response
     */
    function _processResponse(result) {
        if (!result || !result.candidates || !result.candidates[0] ||
            !result.candidates[0].content || !result.candidates[0].content.parts ||
            !result.candidates[0].content.parts[0]) {
            console.error('Unexpected response format:', JSON.stringify(result));
            return null;
        }

        var jsonText = result.candidates[0].content.parts[0].text;

        // Markdown cleanup
        jsonText = jsonText
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        try {
            var researchResult = JSON.parse(jsonText);

            console.log('✅ JSON parsed successfully');
            LoggingUtils.logLarge('🔍 RESEARCH DOSSIER (Researcher Agent)', researchResult);

            if (researchResult.insights && researchResult.insights.length > 0) {
                console.log('✅ Research completed: ' + researchResult.insights.length + ' insights');

                for (var i = 0; i < researchResult.insights.length; i++) {
                    var insight = researchResult.insights[i];
                    console.log('   ' + (i + 1) + '. ' + (insight.fonte || 'N/A') + ': ' + (insight.link || 'N/A'));
                }
            } else {
                console.warn('⚠️ No insights found');
            }

            return researchResult;

        } catch (parseError) {
            console.error('❌ Error parsing JSON: ' + parseError.toString());
            console.error('Received text: ' + jsonText.substring(0, 200) + '...');
            LoggingUtils.logLarge('❌ Full text that failed parsing', jsonText);
            return null;
        }
    }

    /**
     * Performs external research
     */
    function research(researchInstruction, deal, promptConfig, strategicDossier) {
        var apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=' + GEMINI_API_KEY;

        var cardData = DealTransformer.collectData(deal);
        var prompt = _buildPrompt(researchInstruction, cardData, strategicDossier);

        var payload = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: promptConfig.system }] },
            generationConfig: {
                temperature: 0.3
            },
            tools: [{ googleSearch: {} }]
        };

        var options = {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };

        try {
            console.log('🔍 Starting research with Gemini 2.5 Pro...');

            var response = UrlFetchApp.fetch(apiUrl, options);
            var result = JSON.parse(response.getContentText());

            return _processResponse(result);

        } catch (e) {
            console.error('❌ Error in Researcher Agent: ' + e.toString());
            return null;
        }
    }

    return {
        research: research
    };
})();


/**
 * Writer Agent (OpenAI)
 * Generates personalized email content
 */
var WriterAgent = (function () {
    /**
     * Builds message for the writer
     */
    function _buildMessage(data) {
        var message = 'DADOS DO CLIENTE:';

        if (data.deal_data) {
            for (var key in data.deal_data) {
                if (data.deal_data.hasOwnProperty(key) && data.deal_data[key]) {
                    message += '\n- ' + key + ': ' + data.deal_data[key];
                }
            }
        }

        if (data.requested_content_type) {
            message += '\n\nTIPO DE CONTEÚDO: ' + data.requested_content_type;
        }

        if (data.strategic_dossier) {
            message += '\n\nDOSSIÊ ESTRATÉGICO (CONTEXTO DA REUNIÃO):';
            message += '\n' + data.strategic_dossier;
        }

        if (data.research_dossier) {
            message += '\n\nDOSSIÊ DE PESQUISA (INFORMAÇÕES EXTERNAS):';
            message += '\n' + JSON.stringify(data.research_dossier, null, 2);
        }

        return message;
    }

    /**
     * Processes OpenAI response
     */
    function _processResponse(response) {
        if (!response) {
            console.warn('⚠️ Empty response from Writer Agent');
            return null;
        }

        // Try JSON parse
        try {
            var emailJSON = JSON.parse(response);

            if (emailJSON.titulo && (emailJSON.corpo || emailJSON.corpo_html)) {
                console.log('✅ Email parsed as JSON successfully');
                LoggingUtils.logLarge('📧 GENERATED EMAIL (JSON)', emailJSON);

                return {
                    titulo: emailJSON.titulo,
                    corpo_html: emailJSON.corpo_html || emailJSON.corpo
                };
            }
        } catch (e) {
            console.log('⚠️ Response is not JSON, trying regex...');
        }

        // Fallback: regex extraction
        try {
            var titleMatch = response.match(/(?:título|title|assunto):\s*(.+)/i);
            var bodyMatch = response.match(/(?:corpo|body|conteúdo):\s*([\s\S]+)/i);

            if (titleMatch && bodyMatch) {
                var extractedEmail = {
                    titulo: titleMatch[1].trim(),
                    corpo_html: bodyMatch[1].trim()
                };

                console.log('✅ Email extracted by regex successfully');
                LoggingUtils.logLarge('📧 GENERATED EMAIL (Regex)', extractedEmail);

                return extractedEmail;
            }

            // Last fallback
            console.warn('⚠️ Using fallback: returning full response as body');
            var fallbackEmail = {
                titulo: '[Generated] Follow-up Email',
                corpo_html: response
            };

            LoggingUtils.logLarge('📧 GENERATED EMAIL (Fallback)', fallbackEmail);

            return fallbackEmail;

        } catch (e) {
            console.error('Error processing response: ' + e.toString());
            return null;
        }
    }

    /**
     * Generates email based on dossiers
     */
    function generate(assistantId, writerData) {
        try {
            console.log('Starting writing with Assistant: ' + assistantId);

            var thread = OpenAIRepository.createThread();
            if (!thread || !thread.id) {
                console.error('Failed to create thread');
                return null;
            }

            var message = _buildMessage(writerData);

            if (!OpenAIRepository.addMessage(thread.id, message)) {
                console.error('Failed to add message');
                return null;
            }

            var run = OpenAIRepository.runAssistant(thread.id, assistantId);
            if (!run || !run.id) {
                console.error('Failed to run assistant');
                return null;
            }

            var response = OpenAIRepository.waitForCompletion(thread.id, run.id);

            return _processResponse(response);

        } catch (e) {
            console.error('Error in Writer Agent: ' + e.toString());
            return null;
        }
    }

    return {
        generate: generate
    };
})();


/**
 * Deal Transformer
 * Transforms deal data into different formats
 */
var DealTransformer = (function () {
    /**
     * Collects all relevant deal data
     */
    function collectData(deal) {
        return {
            "Deal contact person": deal.person_name || "Não informado",
            "Deal organization": deal.org_name || "Não informado",
            "Deal value": deal.value || 0,
            "Etiqueta": FieldMappingService.convertIdToText('etiqueta', deal[CUSTOM_FIELDS.LABEL]),
            "Setor da Empresa": deal[CUSTOM_FIELDS.COMPANY_SECTOR] || "Não informado",
            "Origem": FieldMappingService.convertIdToText('origem', deal[CUSTOM_FIELDS.ORIGIN]),
            "Suborigem": FieldMappingService.convertIdToText('suborigem', deal[CUSTOM_FIELDS.SUB_ORIGIN]),
            "Portfólio": FieldMappingService.convertIdToText('portfolio', deal[CUSTOM_FIELDS.PORTFOLIO]),
            "Budget": deal[CUSTOM_FIELDS.BUDGET] || "Não informado",
            "Número de Funcionários": FieldMappingService.convertIdToText('funcionarios', deal[CUSTOM_FIELDS.EMPLOYEE_COUNT]),
            "Retomada": FieldMappingService.convertIdToText('retomada', deal[CUSTOM_FIELDS.RETOMADA]),
            "Data de retomada": deal[CUSTOM_FIELDS.RETOMADA_DATE] || "Não definida"
        };
    }

    /**
     * Builds payload for OpenAI
     */
    function buildWriterPayload(deal, cadenceType, contentType, strategicDossier, researchDossier) {
        return {
            tipo_de_contato: CADENCE_NAMES[cadenceType] || 'Retomada',
            requested_content_type: contentType,
            strategic_dossier: strategicDossier,
            research_dossier: researchDossier,
            deal_data: collectData(deal)
        };
    }

    return {
        collectData: collectData,
        buildWriterPayload: buildWriterPayload
    };
})();


/**
 * Enrichment Orchestrator
 * Coordinates the entire processing flow
 */
var EnrichmentOrchestrator = (function () {
    /**
     * Analyzes meeting minutes
     */
    function _analyzeMinutes(deal, labelConfig) {
        var minutes = PipedriveRepository.fetchNotes(deal.id);

        if (!minutes) {
            console.log('   📝 No meeting minutes found');
            return null;
        }

        console.log('   🔍 Analyzing minutes...');

        var assistantId = labelConfig.assistants.analyst;
        return AnalystAgent.analyze(minutes, assistantId);
    }

    /**
     * Identifies cadence and current step
     */
    function _identifyCadence(deal) {
        var cadenceInfo = CadenceService.getConfig(deal);

        if (!cadenceInfo) {
            console.warn('   ⚠️  Cadence not identified');
            return {};
        }

        var cadenceType = cadenceInfo.type;
        var cadenceConfig = cadenceInfo.config;
        console.log('   🎯 Cadence: ' + cadenceType);

        // Initialize nurturing step if necessary
        if (cadenceType === 'nurturing' && !deal[CUSTOM_FIELDS.NURTURING_STEP]) {
            console.log('   ⚙️  Initializing step...');
            PipedriveRepository.initializeNurturingStep(deal.id);
        }

        var cadenceStep = CadenceService.extractStep(deal, cadenceType);
        var stepRule = CadenceService.getStepRule(cadenceType, cadenceConfig, cadenceStep);

        return {
            cadenceType: cadenceType,
            cadenceConfig: cadenceConfig,
            cadenceStep: cadenceStep,
            stepRule: stepRule
        };
    }

    /**
     * Performs external research
     */
    function _performResearch(stepRule, deal, labelConfig, strategicDossier) {
        if (!stepRule.research_needed) {
            console.log('   ⏭️  Research not needed for this step');
            return null;
        }

        console.log('   🔎 Performing external research...');
        var cardData = DealTransformer.collectData(deal);
        var instruction = stepRule.research_instruction(cardData);

        console.log('   📋 Research instruction: ' + instruction);

        var researcherPrompt = labelConfig.researcher_prompt;

        return ResearcherAgent.research(instruction, deal, researcherPrompt, strategicDossier);
    }

    /**
     * Generates email
     */
    function _generateEmail(deal, cadenceType, stepRule, strategicDossier, researchDossier, labelConfig) {
        console.log('   ✍️  Generating email...');

        var assistantId = LabelService.getAssistantId(deal, cadenceType);

        var writerData = DealTransformer.buildWriterPayload(
            deal,
            cadenceType,
            stepRule.content_type,
            strategicDossier,
            researchDossier
        );

        return WriterAgent.generate(assistantId, writerData);
    }

    /**
     * Processes an individual deal
     */
    function _processDeal(deal) {
        console.log('\n📌 Deal ' + deal.id + ': "' + deal.title + '"');
        console.log('═══════════════════════════════════════════════════════════════');

        // Check if already has content
        if (deal[CUSTOM_FIELDS.EMAIL_BODY] || deal[CUSTOM_FIELDS.EMAIL_TITLE]) {
            console.log('   ⏭️  Already has content, skipping...');
            return;
        }

        // 1. Identify label and configuration
        var labelConfig = LabelService.getConfig(deal);
        var label = FieldMappingService.convertIdToText('etiqueta', deal[CUSTOM_FIELDS.LABEL]);
        console.log('   🏷️  Label: ' + label);

        // 2. Analyze meeting minutes
        console.log('\n   📋 PHASE 1: MINUTES ANALYSIS');
        console.log('   ─────────────────────────────────────');
        var strategicDossier = _analyzeMinutes(deal, labelConfig);

        // 3. Identify cadence and step
        console.log('\n   🎯 PHASE 2: CADENCE IDENTIFICATION');
        console.log('   ─────────────────────────────────────');
        var cadenceInfo = _identifyCadence(deal);
        var cadenceType = cadenceInfo.cadenceType;
        var cadenceConfig = cadenceInfo.cadenceConfig;
        var cadenceStep = cadenceInfo.cadenceStep;
        var stepRule = cadenceInfo.stepRule;

        if (!stepRule) {
            console.warn('   ⚠️  Step rule not found, skipping...');
            return;
        }

        console.log('   📊 Step ' + cadenceStep + ': ' + stepRule.content_type);

        // 4. Perform external research (if needed)
        console.log('\n   🔍 PHASE 3: EXTERNAL RESEARCH');
        console.log('   ─────────────────────────────────────');
        var researchDossier = _performResearch(stepRule, deal, labelConfig, strategicDossier);

        // 5. Generate email
        console.log('\n   ✍️  PHASE 4: EMAIL GENERATION');
        console.log('   ─────────────────────────────────────');
        var generatedEmail = _generateEmail(deal, cadenceType, stepRule, strategicDossier, researchDossier, labelConfig);

        // 6. Update Pipedrive
        console.log('\n   💾 PHASE 5: PIPEDRIVE UPDATE');
        console.log('   ─────────────────────────────────────');
        if (generatedEmail && generatedEmail.titulo && generatedEmail.corpo_html) {
            console.log('   📧 Final email to save:');
            console.log('      Title: ' + generatedEmail.titulo);
            LoggingUtils.logLarge('      HTML Body', generatedEmail.corpo_html);

            var success = PipedriveRepository.updateEmail(deal.id, generatedEmail.titulo, generatedEmail.corpo_html);

            if (success) {
                console.log('   ✅ Deal updated successfully');

                // Increment counter if nurturing
                if (cadenceType === 'nurturing') {
                    PipedriveRepository.incrementNurturingStep(deal.id, cadenceStep);
                }
            } else {
                console.error('   ❌ Failed to update deal in Pipedrive');
            }
        } else {
            console.warn('   ⚠️  Invalid generated email');
            if (generatedEmail) {
                console.log('   Debug - Received Email:');
                LoggingUtils.logLarge('      Email object', generatedEmail);
            }
        }

        console.log('═══════════════════════════════════════════════════════════════\n');
    }

    /**
     * Executes daily enrichment routine
     */
    function executeRoutine() {
        console.log("🚀 Starting enrichment routine...");

        var allStages = [];
        for (var type in CADENCE_CONFIG) {
            if (CADENCE_CONFIG.hasOwnProperty(type)) {
                var config = CADENCE_CONFIG[type];
                allStages = allStages.concat(config.stages);
            }
        }

        var deals = PipedriveRepository.fetchDealsInStages(allStages);

        if (!deals || deals.length === 0) {
            console.log("✅ No deals to process");
            return;
        }

        console.log('📋 Processing ' + deals.length + ' deals...\n');

        for (var i = 0; i < deals.length; i++) {
            try {
                _processDeal(deals[i]);
            } catch (e) {
                console.error('💥 Critical error in Deal ' + deals[i].id + ': ' + e.toString());
            }
        }

        console.log("\n✅ Routine completed");
    }

    return {
        executeRoutine: executeRoutine,
        _processDeal: _processDeal
    };
})();


/**
 * Main function executed by Google Apps Script
 */
function executeDailyEnrichment() {
    EnrichmentOrchestrator.executeRoutine();
}


/**
 * Tests processing of a specific deal
 * @param {number} dealId - (Optional) Specific deal ID to test
 */
function testSpecificDeal(dealId = 41605) {
    console.log('🧪 Starting deal processing test...\n');

    var deal;

    console.log('🎯 Fetching deal ID: ' + dealId);
    var url = PIPEDRIVE_API_BASE_URL + '/deals/' + dealId + '?api_token=' + PIPEDRIVE_API_TOKEN;
    try {
        var response = UrlFetchApp.fetch(url, GET_REQUEST_OPTIONS);
        var data = JSON.parse(response.getContentText());

        if (data.success && data.data) {
            deal = data.data;
            var stageInfo = STAGE_CONFIG[deal.stage_id];
            deal.stage_name = stageInfo ? stageInfo.name : 'Stage ' + deal.stage_id;
            console.log('✅ Deal found: "' + deal.title + '"\n');
        } else {
            console.error('❌ Deal ID ' + dealId + ' not found');
            return;
        }
    } catch (e) {
        console.error('❌ Error fetching deal: ' + e.toString());
        return;
    }

    // Process the deal
    EnrichmentOrchestrator._processDeal(deal);

    console.log('\n✅ Test completed');
}

/**
 * Clears mapping cache
 */
function clearCache() {
    var cache = CacheService.getScriptCache();
    cache.remove('pipedrive_field_mappings'); // Hardcoded key from utils.js
    console.log('✅ Cache cleared');
}

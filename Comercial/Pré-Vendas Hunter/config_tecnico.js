// Autor: Gabriel Agra de Castro Motta
// Data de Atualização: 01/04/2026
// Licença: MIT - Modificada. Os Direitos Patrimoniais de uso, reprodução e modificação são concedidos à Poli Júnior.

/**
 * Configuração Técnica (Constantes Operacionais)
 * Armazena configurações robustas não mutáveis.
 * @const
 */

const CONFIG_TECNICO = Object.freeze({
    MAX_RETRIES: 3,
    MAX_BATCH_CATCHUP: 3,
    DOMAIN: '@polijunior.com.br',
    MAX_EXECUTION_TIME_MS: 1500000,

    FIELDS: {
        JOB_TITLE: '54dfa4cb1118103bebc367d6e0ae574df374d478',
        EMPLOYEES: '0b2be49fb7615b170878d944a7cb05f6ec8f9e27',
        DEAL_SETOR: '6ea1ea74da5fbb8cb6a8dd741a96a9bc8b4e379f',
        ORIGIN: '97d0502cc2b489986844a93b374656e5acf179e1',
        HUNTER: '2e9e1edaa8c01d43869bc9e949a5873ba2163ca4',
        ORG_LINKEDIN: 'linkedin',
        ORG_WEBSITE: 'website',
        ORG_INDUSTRY: 'industry',
        ORG_EMPLOYEE: 'employee_count',
        DEAL_CANAL: '97d0502cc2b489986844a93b374656e5acf179e1'
    },

    EMPLOYEE_RANGES: [
        { min: 0, max: 10, id: 183 },
        { min: 11, max: 50, id: 184 },
        { min: 51, max: 200, id: 185 },
        { min: 201, max: 500, id: 186 },
        { min: 501, max: 1000, id: 187 },
        { min: 1001, max: 5000, id: 188 },
        { min: 5001, max: 10000, id: 189 },
        { min: 10001, max: Infinity, id: 190 }
    ],
    DEFAULT_EMPLOYEE_ID: 245,

    SCRIPT_PROPS: {
        INTERNAL_POINTER: 'LAST_STABLE_POINTER',
        ACTIVE_CSV: 'LAST_IMPORTED_CSV_ID',
        BATCH_STATE: 'EXEC_BATCH_STATE',
        DEAL_FIELDS_CACHE: 'DEAL_FIELDS_CACHE'
    },

    RUNTIME_INDICES: {
        CONTROL: 0,
        AUX: 1,
        DATA: 2
    },

    APOLLO_TO_SETOR: {
        'accounting': '161', 'agriculture': '174', 'airlines/aviation': '179', 'alternative dispute resolution': '313', 'alternative medicine': '163', 'animation': '160', 'apparel & fashion': '157', 'architecture & planning': '178', 'arts & crafts': '157', 'automotive': '165', 'aviation & aerospace': '179', 'banking': '161', 'biotechnology': '196', 'broadcast media': '160', 'building materials': '181', 'business supplies & equipment': '313', 'capital markets': '161', 'chemicals': '177', 'civic & social organization': '313', 'civil engineering': '198', 'commercial real estate': '171', 'computer & network security': '167', 'computer games': '156', 'computer hardware': '167', 'computer networking': '167', 'computer software': '156', 'construction': '181', 'consumer electronics': '157', 'consumer goods': '157', 'consumer services': '157', 'cosmetics': '157', 'dairy': '174', 'defense & space': '179', 'design': '199', 'e-learning': '158', 'education management': '158', 'electrical/electronic manufacturing': '165', 'entertainment': '160', 'environmental services': '159', 'events services': '160', 'executive office': '313', 'facilities services': '313', 'farming': '174', 'financial services': '161', 'fine art': '160', 'fishery': '174', 'food & beverages': '162', 'food production': '162', 'fund-raising': '313', 'furniture': '157', 'gambling & casinos': '160', 'glass, ceramics & concrete': '165', 'government administration': '313', 'government relations': '313', 'graphic design': '199', 'health, wellness & fitness': '163', 'higher education': '158', 'hospital & health care': '163', 'hospitality': '180', 'human resources': '164', 'import & export': '168', 'individual & family services': '157', 'industrial automation': '165', 'information services': '167', 'information technology & services': '167', 'insurance': '166', 'international affairs': '313', 'international trade & development': '313', 'internet': '156', 'investment banking': '161', 'investment management': '161', 'judiciary': '313', 'law enforcement': '182', 'law practice': '313', 'legal services': '313', 'legislative office': '313', 'leisure, travel & tourism': '180', 'libraries': '158', 'logistics & supply chain': '168', 'luxury goods & jewelry': '157', 'machinery': '165', 'management consulting': '313', 'maritime': '168', 'market research': '169', 'marketing & advertising': '169', 'mechanical or industrial engineering': '14', 'media production': '17', 'medical devices': '12', 'medical practice': '11', 'mental health care': '11', 'military': '9', 'mining & metals': '13', 'motion pictures & film': '6', 'museums & institutions': '6', 'music': '6', 'nanotechnology': '17', 'newspapers': '17', 'nonprofit organization management': '4', 'oil & energy': '13', 'online media': '17', 'outsourcing/offshoring': '2', 'package/freight delivery': '18', 'packaging & containers': '12', 'paper & forest products': '12', 'performing arts': '6', 'pharmaceuticals': '12', 'philanthropy': '4', 'photography': '14', 'plastics': '12', 'political organization': '9', 'primary/secondary education': '5', 'printing': '17', 'professional training & coaching': '5', 'program development': '14', 'public policy': '9', 'public relations & communications': '14', 'public safety': '9', 'publishing': '17', 'railroad manufacture': '12', 'ranching': '7', 'real estate': '15', 'recreational facilities & services': '6', 'religious institutions': '4', 'renewables & environment': '19', 'research': '14', 'restaurants': '1', 'retail': '16', 'security & investigations': '2', 'semiconductors': '12', 'shipbuilding': '12', 'sports': '6', 'staffing & recruiting': '2', 'supermarkets': '16', 'telecommunications': '17', 'textiles': '12', 'think tanks': '14', 'tobacco': '12', 'translation & localization': '14', 'transportation/trucking/railroad': '18', 'utilities': '19', 'venture capital & private equity': '8', 'veterinary': '11', 'warehousing': '18', 'wholesale': '20', 'wine & spirits': '12', 'wireless': '17', 'writing & editing': '17'
    },

    APOLLO_TO_INDUSTRY: {
        'accounting': '14', 'agriculture': '7', 'airlines/aviation': '18', 'alternative dispute resolution': '14', 'alternative medicine': '11', 'animation': '17', 'apparel & fashion': '12', 'architecture & planning': '3', 'arts & crafts': '12', 'automotive': '12', 'aviation & aerospace': '12', 'banking': '8', 'biotechnology': '17', 'broadcast media': '17', 'building materials': '3', 'business supplies & equipment': '20', 'capital markets': '8', 'chemicals': '12', 'civic & social organization': '4', 'civil engineering': '3', 'commercial real estate': '15', 'computer & network security': '17', 'computer games': '17', 'computer hardware': '17', 'computer networking': '17', 'computer software': '17', 'construction': '3', 'consumer electronics': '12', 'consumer goods': '12', 'consumer services': '4', 'cosmetics': '12', 'dairy': '7', 'defense & space': '12', 'design': '14', 'e-learning': '5', 'education management': '5', 'electrical/electronic manufacturing': '12', 'entertainment': '6', 'environmental services': '14', 'events services': '6', 'executive office': '9', 'facilities services': '2', 'farming': '7', 'financial services': '8', 'fine art': '6', 'fishery': '7', 'food & beverages': '12', 'food production': '12', 'fund-raising': '4', 'furniture': '12', 'gambling & casinos': '6', 'glass, ceramics & concrete': '12', 'government administration': '9', 'government relations': '9', 'graphic design': '14', 'health, wellness & fitness': '11', 'higher education': '5', 'hospital & health care': '11', 'hospitality': '1', 'human resources': '2', 'import & export': '18', 'individual & family services': '4', 'industrial automation': '12', 'information services': '17', 'information technology & services': '17', 'insurance': '8', 'international affairs': '9', 'international trade & development': '14', 'internet': '17', 'investment banking': '8', 'investment management': '8', 'judiciary': '9', 'law enforcement': '9', 'law practice': '14', 'legal services': '14', 'legislative office': '9', 'leisure, travel & tourism': '1', 'libraries': '5', 'logistics & supply chain': '18', 'luxury goods & jewelry': '12', 'machinery': '12', 'management consulting': '14', 'maritime': '18', 'market research': '14', 'marketing & advertising': '14', 'mechanical or industrial engineering': '14', 'media production': '17', 'medical devices': '12', 'medical practice': '11', 'mental health care': '11', 'military': '9', 'mining & metals': '13', 'motion pictures & film': '6', 'museums & institutions': '6', 'music': '6', 'nanotechnology': '17', 'newspapers': '17', 'nonprofit organization management': '4', 'oil & energy': '13', 'online media': '17', 'outsourcing/offshoring': '2', 'package/freight delivery': '18', 'packaging & containers': '12', 'paper & forest products': '12', 'performing arts': '6', 'pharmaceuticals': '12', 'philanthropy': '4', 'photography': '14', 'plastics': '12', 'political organization': '9', 'primary/secondary education': '5', 'printing': '17', 'professional training & coaching': '5', 'program development': '14', 'public policy': '9', 'public relations & communications': '14', 'public safety': '9', 'publishing': '17', 'railroad manufacture': '12', 'ranching': '7', 'real estate': '15', 'recreational facilities & services': '6', 'religious institutions': '4', 'renewables & environment': '19', 'research': '14', 'restaurants': '1', 'retail': '16', 'security & investigations': '2', 'semiconductors': '12', 'shipbuilding': '12', 'sports': '6', 'staffing & recruiting': '2', 'supermarkets': '16', 'telecommunications': '17', 'textiles': '12', 'think tanks': '14', 'tobacco': '12', 'translation & localization': '14', 'transportation/trucking/railroad': '18', 'utilities': '19', 'venture capital & private equity': '8', 'veterinary': '11', 'warehousing': '18', 'wholesale': '20', 'wine & spirits': '12', 'wireless': '17', 'writing & editing': '17'
    }
});
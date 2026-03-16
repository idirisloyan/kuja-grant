/* =============================================================================
   Kuja Grant Management System - Single Page Application
   Version: 4.0.0 — Tailwind CSS + Lucide Icons + Chart.js UI Redesign
   ============================================================================= */

// =============================================================================
// 0. Internationalization (i18n)
// =============================================================================

var _translations = {};
var _currentLang = 'en';

/**
 * Translate a key, with optional parameter interpolation.
 * Falls back: target language -> English -> raw key.
 * Usage: T('nav.dashboard')  or  T('grant.apps_count', {count: 5})
 */
function T(key, params) {
    var text = (_translations[_currentLang] && _translations[_currentLang][key])
        || (_translations['en'] && _translations['en'][key])
        || key;
    if (params) {
        Object.keys(params).forEach(function(k) {
            text = text.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
        });
    }
    return text;
}

/**
 * Load a language's translation file (lazy, cached).
 */
async function loadTranslations(lang) {
    if (_translations[lang]) return;
    try {
        var res = await fetch('/static/js/translations/' + lang + '.json');
        if (res.ok) {
            _translations[lang] = await res.json();
        }
    } catch (e) {
        console.error('Failed to load translations for', lang);
    }
}

/**
 * Switch UI language. Saves preference to backend, re-renders everything.
 */
async function setLanguage(lang) {
    _currentLang = lang;
    await loadTranslations(lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    // Issue #25: Persist language preference in localStorage
    try { localStorage.setItem('kuja_lang', lang); } catch(e) {}
    // Save preference to backend
    if (S.user) {
        api('PUT', '/api/auth/language', { language: lang });
    }
    render();
}

// =============================================================================
// 1. Global State
// =============================================================================

const S = {
    page: 'login',
    user: null,
    // token field removed - app uses Flask-Login cookie sessions, not JWT
    sidebarCollapsed: false,
    aiPanelOpen: false,
    aiMessages: [],
    aiLoading: false,
    loading: false,

    // Data caches
    grants: [],
    applications: [],
    assessments: [],
    reviews: [],
    dashboardStats: {},
    complianceChecks: [],

    // Current selections
    selectedGrant: null,
    selectedApplication: null,
    selectedReview: null,
    selectedOrg: null,
    grantDetailTab: 'overview',
    appDetailTab: 'responses',

    // Filters
    grantFilters: { status: '', sector: '', country: '', search: '' },

    // Reports
    reports: [],
    currentReport: null,
    newReport: null,
    reportGrants: [],

    // Assessment framework
    selectedFramework: 'kuja',

    // Grant creation wizard
    createStep: 1,
    createData: {
        title: '', description: '', total_funding: '', currency: 'USD',
        deadline: '', sectors: [], countries: [],
        eligibility: [], criteria: [], doc_requirements: [],
        reporting_requirements: [],
        reporting_frequency: 'quarterly',
        report_template: {},
        grant_document: null
    },

    _extractingReqs: false,
    _uploadPhase: '',   // '', 'saving_draft', 'uploading', 'analyzing'

    // Application form
    applyStep: 1,
    applyResponses: {},
    applyEligibility: {},
    uploadedDocs: {},
    _currentApplicationId: null,

    // Assessment wizard
    assessStep: 1,
    assessChecklist: {},
    assessDocuments: {},
    assessOrgProfile: {},
    assessResults: null,

    // Score application
    scoreData: {},
    scoreComments: {},
};

// =============================================================================
// 1b. Framework Checklists
// =============================================================================

var FRAMEWORK_CHECKLISTS = {
    'kuja': {
        'Governance & Leadership': [
            {key: 'board_exists', label: 'Board of directors in place and active'},
            {key: 'board_meets_regularly', label: 'Regular board meetings documented'},
            {key: 'strategic_plan', label: 'Written strategic plan exists'},
            {key: 'policies_documented', label: 'Written governance policies exist'},
            {key: 'conflict_of_interest_policy', label: 'Conflict of interest policy exists'}
        ],
        'Financial Management': [
            {key: 'financial_policies', label: 'Written financial policies and procedures'},
            {key: 'annual_audit', label: 'Audited financial statements (last 2 years)'},
            {key: 'budget_process', label: 'Documented budget process'},
            {key: 'internal_controls', label: 'Internal controls in place'},
            {key: 'financial_reporting', label: 'Regular financial reporting'},
            {key: 'procurement_policy', label: 'Procurement policy documented'}
        ],
        'Program Management': [
            {key: 'needs_assessment', label: 'Needs assessment conducted'},
            {key: 'project_planning', label: 'Project planning processes documented'},
            {key: 'beneficiary_feedback', label: 'Beneficiary feedback mechanisms exist'},
            {key: 'partnership_agreements', label: 'Partnership agreements in place'},
            {key: 'reporting_systems', label: 'Program reporting systems exist'}
        ],
        'Human Resources': [
            {key: 'hr_policies', label: 'Written HR policies and procedures'},
            {key: 'staff_contracts', label: 'Staff contracts in place'},
            {key: 'safeguarding_policy', label: 'Safeguarding policy exists'},
            {key: 'training_plan', label: 'Staff capacity building plan'},
            {key: 'code_of_conduct', label: 'Code of conduct for all staff'}
        ],
        'Monitoring & Evaluation': [
            {key: 'me_framework', label: 'M&E framework in place'},
            {key: 'data_collection', label: 'Systematic data collection'},
            {key: 'indicator_tracking', label: 'Indicator tracking system'},
            {key: 'evaluation_reports', label: 'Evaluation reports produced'},
            {key: 'learning_integration', label: 'Learning integrated into programs'}
        ]
    },
    'step': {
        'Organizational Governance': [
            {key: 'legal_registration', label: 'Current legal registration and compliance'},
            {key: 'governing_body', label: 'Active and effective governing body'},
            {key: 'strategic_direction', label: 'Clear strategic direction and plans'},
            {key: 'succession_planning', label: 'Succession planning for key positions'},
            {key: 'stakeholder_engagement', label: 'Systematic stakeholder engagement'}
        ],
        'Financial Systems': [
            {key: 'accounting_system', label: 'Accounting system in place and functional'},
            {key: 'financial_controls', label: 'Financial controls and segregation of duties'},
            {key: 'audit_practice', label: 'Regular external audit practice'},
            {key: 'asset_management', label: 'Asset management and tracking'},
            {key: 'donor_compliance', label: 'Donor financial compliance systems'},
            {key: 'cash_management', label: 'Cash management procedures'}
        ],
        'Administration': [
            {key: 'admin_procedures', label: 'Administrative procedures documented'},
            {key: 'record_keeping', label: 'Systematic record keeping'},
            {key: 'it_systems', label: 'IT systems and data management'},
            {key: 'office_management', label: 'Office management procedures'},
            {key: 'procurement_systems', label: 'Procurement systems and policies'}
        ],
        'Human Resource Management': [
            {key: 'recruitment_process', label: 'Transparent recruitment process'},
            {key: 'staff_development', label: 'Staff development and training'},
            {key: 'performance_management', label: 'Performance management system'},
            {key: 'compensation_policy', label: 'Fair compensation policy'},
            {key: 'safeguarding_psea', label: 'Safeguarding and PSEA policies'}
        ],
        'Program Quality': [
            {key: 'program_design', label: 'Evidence-based program design'},
            {key: 'implementation_quality', label: 'Quality implementation standards'},
            {key: 'monitoring_systems', label: 'Monitoring systems in place'},
            {key: 'reporting_quality', label: 'Quality reporting to stakeholders'},
            {key: 'sustainability_planning', label: 'Sustainability and exit planning'}
        ]
    },
    'un_hact': {
        'Implementing Partner Info': [
            {key: 'legal_status', label: 'Legal status and registration verified'},
            {key: 'governance_structure', label: 'Governance structure documented'},
            {key: 'mandate_alignment', label: 'Mandate aligns with program objectives'}
        ],
        'Internal Control': [
            {key: 'control_environment', label: 'Control environment established'},
            {key: 'risk_assessment', label: 'Risk assessment procedures'},
            {key: 'control_activities', label: 'Control activities documented'},
            {key: 'info_communication', label: 'Information and communication systems'},
            {key: 'monitoring_controls', label: 'Monitoring of controls'}
        ],
        'Accounting Policies': [
            {key: 'accounting_standards', label: 'Recognized accounting standards followed'},
            {key: 'fund_accounting', label: 'Fund accounting practices'},
            {key: 'reporting_procedures', label: 'Financial reporting procedures'},
            {key: 'cash_management_hact', label: 'Cash management and bank reconciliation'},
            {key: 'asset_management_hact', label: 'Asset management procedures'}
        ],
        'Fixed Assets': [
            {key: 'asset_register', label: 'Fixed asset register maintained'},
            {key: 'asset_safeguarding', label: 'Asset safeguarding measures'},
            {key: 'asset_disposal', label: 'Asset disposal procedures'},
            {key: 'asset_verification', label: 'Regular asset verification'}
        ],
        'Procurement': [
            {key: 'procurement_policy', label: 'Written procurement policy'},
            {key: 'competitive_bidding', label: 'Competitive bidding processes'},
            {key: 'procurement_documentation', label: 'Procurement documentation maintained'},
            {key: 'contract_management', label: 'Contract management procedures'},
            {key: 'supplier_management', label: 'Supplier management and evaluation'}
        ]
    },
    'chs': {
        'Humanitarian Response': [
            {key: 'needs_based_response', label: 'Response is based on assessed needs'},
            {key: 'timeliness', label: 'Timely response to humanitarian needs'},
            {key: 'appropriate_response', label: 'Response is appropriate and relevant'},
            {key: 'reaching_most_vulnerable', label: 'Reaching the most vulnerable populations'}
        ],
        'Effectiveness': [
            {key: 'effective_programs', label: 'Programs achieve intended objectives'},
            {key: 'evidence_based', label: 'Evidence-based programming approach'},
            {key: 'adaptive_management', label: 'Adaptive management practices'},
            {key: 'innovation_learning', label: 'Innovation and learning culture'}
        ],
        'Accountability': [
            {key: 'community_participation', label: 'Community participation in decisions'},
            {key: 'feedback_mechanisms', label: 'Accessible feedback mechanisms'},
            {key: 'complaint_handling', label: 'Complaint handling procedures'},
            {key: 'transparency_info', label: 'Transparent information sharing'}
        ],
        'Coordination': [
            {key: 'coordination_participation', label: 'Active coordination participation'},
            {key: 'complementarity', label: 'Complementarity with other actors'},
            {key: 'information_sharing', label: 'Information sharing with partners'}
        ],
        'Staff Competency': [
            {key: 'skilled_staff', label: 'Staff have required skills and competencies'},
            {key: 'wellbeing_support', label: 'Staff wellbeing and support systems'},
            {key: 'code_of_conduct_chs', label: 'Code of conduct adhered to'},
            {key: 'psea_policy', label: 'PSEA policy implemented'}
        ],
        'Management & Support': [
            {key: 'policies_processes', label: 'Policies and processes support quality'},
            {key: 'resource_management', label: 'Effective resource management'},
            {key: 'environmental_impact', label: 'Environmental impact considered'},
            {key: 'quality_management', label: 'Quality management systems'}
        ],
        'Learning': [
            {key: 'organizational_learning', label: 'Organizational learning culture'},
            {key: 'evaluation_practice', label: 'Regular evaluation practice'},
            {key: 'knowledge_sharing', label: 'Knowledge sharing mechanisms'},
            {key: 'continuous_improvement', label: 'Continuous improvement processes'}
        ]
    },
    'nupas': {
        'Governance & Leadership': [
            {key: 'legal_framework', label: 'Legal framework and compliance'},
            {key: 'board_effectiveness', label: 'Board effectiveness and oversight'},
            {key: 'leadership_quality', label: 'Leadership quality and vision'},
            {key: 'accountability_systems', label: 'Accountability and transparency systems'},
            {key: 'risk_management', label: 'Risk management framework'}
        ],
        'Financial Stewardship': [
            {key: 'financial_systems', label: 'Financial management systems'},
            {key: 'budgeting', label: 'Participatory budgeting processes'},
            {key: 'financial_reporting_nupas', label: 'Timely and accurate financial reporting'},
            {key: 'audit_compliance', label: 'Audit compliance and follow-up'},
            {key: 'resource_mobilization', label: 'Resource mobilization strategy'},
            {key: 'value_for_money', label: 'Value for money considerations'}
        ],
        'Program Delivery': [
            {key: 'design_quality', label: 'High quality program design'},
            {key: 'delivery_effectiveness', label: 'Effective program delivery'},
            {key: 'beneficiary_engagement', label: 'Meaningful beneficiary engagement'},
            {key: 'partnership_management', label: 'Partnership management excellence'},
            {key: 'innovation_scaling', label: 'Innovation and scaling approaches'}
        ],
        'People & Culture': [
            {key: 'hr_systems', label: 'HR management systems'},
            {key: 'staff_development_nupas', label: 'Staff professional development'},
            {key: 'diversity_inclusion', label: 'Diversity and inclusion practices'},
            {key: 'safeguarding_nupas', label: 'Safeguarding and protection'},
            {key: 'organizational_culture', label: 'Positive organizational culture'}
        ],
        'Learning & Adaptation': [
            {key: 'me_systems', label: 'M&E systems and practices'},
            {key: 'data_use', label: 'Data-driven decision making'},
            {key: 'knowledge_management', label: 'Knowledge management'},
            {key: 'adaptive_programming', label: 'Adaptive programming approaches'},
            {key: 'impact_measurement', label: 'Impact measurement and reporting'}
        ]
    }
};

// =============================================================================
// 2. Utilities
// =============================================================================

function esc(str) {
    if (str === null || str === undefined) return '';
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
}

function formatCurrency(amount, currency) {
    currency = currency || 'USD';
    const num = Number(amount);
    if (isNaN(num)) return '$0';
    const symbols = { USD: '$', EUR: '\u20AC', GBP: '\u00A3', KES: 'KSh', CHF: 'CHF ' };
    const sym = symbols[currency] || currency + ' ';
    if (num >= 1000000) return sym + (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return sym + (num / 1000).toFixed(0) + 'K';
    return sym + num.toLocaleString();
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function timeUntil(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const target = new Date(dateStr);
    const diff = target - now;
    if (diff < 0) return 'Expired';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return '1 day left';
    if (days < 30) return days + ' days left';
    const months = Math.floor(days / 30);
    return months + (months === 1 ? ' month left' : ' months left');
}

function capacityLabel(score) {
    score = Number(score) || 0;
    if (score >= 80) return { label: 'Excellent', color: 'green' };
    if (score >= 60) return { label: 'Good', color: 'blue' };
    if (score >= 40) return { label: 'Developing', color: 'amber' };
    return { label: 'Needs Improvement', color: 'red' };
}

function statusBadge(status) {
    if (!status) return '';
    var colorMap = {
        draft: 'bg-slate-100 text-slate-600', open: 'bg-blue-50 text-blue-700', published: 'bg-blue-50 text-blue-700',
        submitted: 'bg-indigo-50 text-indigo-700', in_review: 'bg-amber-50 text-amber-700', review: 'bg-amber-50 text-amber-700',
        under_review: 'bg-amber-50 text-amber-700', scored: 'bg-pink-50 text-pink-700',
        awarded: 'bg-emerald-50 text-emerald-700', approved: 'bg-emerald-50 text-emerald-700', accepted: 'bg-emerald-50 text-emerald-700',
        rejected: 'bg-rose-50 text-rose-700', declined: 'bg-rose-50 text-rose-700', closed: 'bg-slate-100 text-slate-600',
        pending: 'bg-amber-50 text-amber-700', completed: 'bg-emerald-50 text-emerald-700', active: 'bg-emerald-50 text-emerald-700',
        assigned: 'bg-blue-50 text-blue-700', clear: 'bg-emerald-50 text-emerald-700', flagged: 'bg-rose-50 text-rose-700',
        verified: 'bg-emerald-50 text-emerald-700', unverified: 'bg-slate-100 text-slate-600',
        error: 'bg-rose-50 text-rose-700', expired: 'bg-slate-100 text-slate-600',
        ai_reviewed: 'bg-violet-50 text-violet-700', revision_requested: 'bg-rose-50 text-rose-700',
        in_progress: 'bg-blue-50 text-blue-700', overdue: 'bg-rose-50 text-rose-700'
    };
    var dotMap = {
        draft: 'bg-slate-400', open: 'bg-blue-500', published: 'bg-blue-500',
        submitted: 'bg-indigo-500', in_review: 'bg-amber-500', review: 'bg-amber-500',
        awarded: 'bg-emerald-500', approved: 'bg-emerald-500', accepted: 'bg-emerald-500',
        rejected: 'bg-rose-500', declined: 'bg-rose-500', pending: 'bg-amber-500',
        completed: 'bg-emerald-500', active: 'bg-emerald-500', clear: 'bg-emerald-500',
        flagged: 'bg-rose-500', verified: 'bg-emerald-500', error: 'bg-rose-500',
        ai_reviewed: 'bg-violet-500', revision_requested: 'bg-rose-500',
        in_progress: 'bg-blue-500', overdue: 'bg-rose-500'
    };
    var labelMap = {
        draft: T('status.draft'), open: T('status.open'), published: T('status.open'),
        submitted: T('status.submitted'), in_review: T('status.review'), review: T('status.review'),
        under_review: T('status.under_review'), scored: T('status.scored'),
        awarded: T('status.awarded'), approved: T('status.awarded'), accepted: T('status.accepted'),
        rejected: T('status.rejected'), declined: T('status.rejected'), closed: T('status.closed'),
        pending: T('status.pending'), completed: T('status.completed'), active: T('status.in_progress'),
        assigned: T('status.assigned'), clear: T('status.clear'), flagged: T('status.flagged'),
        error: T('status.error'), unverified: T('status.unverified'), verified: T('status.verified'),
        expired: T('status.expired'), ai_reviewed: T('status.ai_reviewed'),
        revision_requested: T('status.revision_requested'), in_progress: T('status.in_progress'), overdue: 'Overdue'
    };
    var sk = status.toLowerCase();
    var cls = colorMap[sk] || 'bg-slate-100 text-slate-600';
    var dot = dotMap[sk] || 'bg-slate-400';
    var label = labelMap[sk] || esc(status.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }));
    return '<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full ' + cls + '" role="status">' +
        '<span class="w-1.5 h-1.5 rounded-full ' + dot + '"></span>' + esc(label) + '</span>';
}

function qualityIndicator(wordCount, maxWords) {
    if (!maxWords || maxWords <= 0) return { label: 'N/A', color: '#94a3b8', cls: '' };
    var ratio = wordCount / maxWords;
    if (ratio >= 0.75) return { label: 'Strong', color: '#10b981', cls: 'green' };
    if (ratio >= 0.50) return { label: 'Good', color: '#3b82f6', cls: 'blue' };
    if (ratio >= 0.25) return { label: 'Fair', color: '#f59e0b', cls: 'amber' };
    return { label: 'Weak', color: '#ef4444', cls: 'red' };
}

function wordCount(text) {
    if (!text || !text.trim()) return 0;
    return text.trim().split(/\s+/).length;
}

function scoreColor(score) {
    score = Number(score) || 0;
    if (score >= 80) return 'green';
    if (score >= 60) return 'amber';
    return 'red';
}

function scoreRingHTML(score, size, label) {
    size = size || 80;
    score = Number(score) || 0;
    var r = (size / 2) - 6;
    var c = 2 * Math.PI * r;
    var offset = c - (score / 100) * c;
    var colors = { green: '#10b981', amber: '#f59e0b', red: '#f43f5e' };
    var col = colors[scoreColor(score)] || colors.green;
    return '<div class="relative inline-flex items-center justify-center" style="width:' + size + 'px;height:' + size + 'px;">' +
        '<svg viewBox="0 0 ' + size + ' ' + size + '" class="transform -rotate-90" style="width:' + size + 'px;height:' + size + 'px;">' +
        '<circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + r + '" fill="none" stroke="#e2e8f0" stroke-width="5"/>' +
        '<circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="5" ' +
        'stroke-dasharray="' + c + '" stroke-dashoffset="' + offset + '" stroke-linecap="round" class="transition-all duration-1000"/>' +
        '</svg>' +
        '<div class="absolute inset-0 flex flex-col items-center justify-center">' +
        '<span class="text-lg font-bold text-slate-900">' + score + '</span>' +
        (label ? '<span class="text-[10px] text-slate-500">' + esc(label) + '</span>' : '') +
        '</div></div>';
}

function sectorIcon(sector) {
    var icons = {
        health: 'heart-pulse', education: 'graduation-cap', climate: 'globe-2',
        protection: 'shield', nutrition: 'apple', wash: 'droplets',
        livelihoods: 'banknote', governance: 'scale', agriculture: 'sprout',
        environment: 'leaf', humanitarian: 'heart', gender: 'users',
        technology: 'cpu', infrastructure: 'building', youth: 'smile'
    };
    return icon(icons[(sector || '').toLowerCase()] || 'map-pin', 14);
}

function truncate(str, max) {
    if (!str) return '';
    if (str.length <= max) return str;
    return str.substring(0, max) + '...';
}

function todayStr() {
    return new Date().toISOString().split('T')[0];
}

function debounce(fn, delay) {
    var timer;
    return function() {
        var args = arguments;
        var ctx = this;
        clearTimeout(timer);
        timer = setTimeout(function() { fn.apply(ctx, args); }, delay);
    };
}

function renderMarkdown(text) {
    if (!text) return '';
    return esc(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^(\d+)\.\s+(.+)$/gm, '<li>$2</li>')
        .replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

// Lucide icon helper — renders an inline SVG icon placeholder
function icon(name, size, cls) {
    size = size || 20;
    cls = cls || '';
    return '<i data-lucide="' + name + '" class="inline-block shrink-0 ' + cls + '" style="width:' + size + 'px;height:' + size + 'px;"></i>';
}

// Chart.js instance manager — destroys previous chart before creating new one
var _chartInstances = {};
function createChart(canvasId, config) {
    if (_chartInstances[canvasId]) { _chartInstances[canvasId].destroy(); }
    var canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    _chartInstances[canvasId] = new Chart(canvas, config);
    return _chartInstances[canvasId];
}

// =============================================================================
// 3. API Helper
// =============================================================================

async function api(method, url, data) {
    var opts = {
        method: method,
        headers: {}
    };
    // CSRF protection: always send X-Requested-With header
    opts.headers['X-Requested-With'] = 'XMLHttpRequest';
    if (data && !(data instanceof FormData)) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(data);
    } else if (data instanceof FormData) {
        opts.body = data;
    }
    try {
        var resp = await fetch(url, opts);
        var json = await resp.json();
        if (resp.status === 401) {
            S.user = null;
            nav('login');
            showToast(T('auth.session_expired'), 'error');
            return null;
        }
        if (!resp.ok) {
            showToast(json.error || json.message || 'Something went wrong', 'error');
            return null;
        }
        return json;
    } catch (e) {
        showToast(T('toast.network_error'), 'error');
        return null;
    }
}

// =============================================================================
// 3b. Telemetry - fire-and-forget, never blocks UI
// =============================================================================

var _telemetryCorrelation = null;
function telemetry(event, data) {
    if (!S.user) return;
    try {
        fetch('/api/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify({
                event: event,
                data: data || {},
                correlation_id: _telemetryCorrelation || '',
                timestamp: new Date().toISOString()
            })
        }).catch(function() {}); // silent fail
    } catch(e) {}
}
function newTelemetrySession() {
    _telemetryCorrelation = 'wiz_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    return _telemetryCorrelation;
}

// =============================================================================
// 4. Toast Notifications
// =============================================================================

function showToast(message, type) {
    type = type || 'success';
    var container = document.getElementById('toast-container');
    if (!container) return;
    var iconNames = { success: 'check-circle', error: 'x-circle', warning: 'alert-triangle', info: 'info' };
    var colors = { success: 'border-emerald-500', error: 'border-rose-500', warning: 'border-amber-500', info: 'border-brand-500' };
    var iconCls = { success: 'text-emerald-500', error: 'text-rose-500', warning: 'text-amber-500', info: 'text-brand-500' };
    var toast = document.createElement('div');
    toast.className = 'flex items-start gap-3 p-4 bg-white rounded-xl shadow-lg border-l-4 ' + (colors[type] || colors.info) + ' min-w-[280px] max-w-[420px] animate-slide-in-right';
    toast.innerHTML = '<span class="' + (iconCls[type] || iconCls.info) + ' shrink-0 mt-0.5">' + icon(iconNames[type] || 'info', 18) + '</span>' +
        '<span class="text-sm text-slate-700 flex-1">' + esc(message) + '</span>' +
        '<button class="text-slate-400 hover:text-slate-600 shrink-0" onclick="this.parentElement.remove()">' + icon('x', 16) + '</button>';
    container.appendChild(toast);
    if (typeof lucide !== 'undefined') lucide.createIcons();
    setTimeout(function() {
        if (toast.parentElement) {
            toast.style.opacity = '0'; toast.style.transform = 'translateX(40px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(function() { if (toast.parentElement) toast.remove(); }, 300);
        }
    }, 8000);
}

// =============================================================================
// 5. Modal
// =============================================================================

function showModal(title, contentHTML, buttons) {
    var overlay = document.getElementById('modal-overlay');
    var mc = document.getElementById('modal-content');
    if (!overlay || !mc) return;
    var btnsHTML = '';
    if (buttons && buttons.length) {
        btnsHTML = '<div class="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50/50 rounded-b-2xl">' +
            buttons.map(function(b) {
                var cls = 'px-4 py-2 text-sm font-medium rounded-lg transition-all ';
                if (b.cls === 'btn-primary') cls += 'text-white bg-brand-600 hover:bg-brand-700 shadow-sm';
                else if (b.cls === 'btn-danger') cls += 'text-white bg-rose-500 hover:bg-rose-600';
                else cls += 'text-slate-700 bg-white border border-slate-300 hover:bg-slate-50';
                return '<button class="' + cls + '" onclick="' + esc(b.onclick) + '">' + esc(b.label) + '</button>';
            }).join('') + '</div>';
    }
    mc.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl max-h-[85vh] flex flex-col animate-slide-in-up overflow-hidden">' +
        '<div class="flex items-center justify-between px-6 py-4 border-b border-slate-200">' +
        '<h2 class="text-lg font-semibold text-slate-900">' + esc(title) + '</h2>' +
        '<button class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" onclick="closeModal()">' + icon('x', 18) + '</button>' +
        '</div>' +
        '<div class="px-6 py-5 overflow-y-auto flex-1">' + contentHTML + '</div>' +
        btnsHTML + '</div>';
    overlay.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeModal(e) {
    if (e && e.target && e.target.id !== 'modal-overlay') return;
    var overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.add('hidden');
}

// =============================================================================
// 6. Navigation
// =============================================================================

function nav(page, params) {
    // Issue #2: Warn about unsaved changes when leaving apply/assessment wizards
    var leavingApply = S.page === 'apply' && page !== 'apply';
    var leavingAssess = S.page === 'assesswizard' && page !== 'assesswizard';
    if (leavingApply || leavingAssess) {
        var hasData = leavingApply
            ? (Object.keys(S.applyResponses).length > 0 || Object.keys(S.applyEligibility).length > 0)
            : (Object.keys(S.assessChecklist).length > 0);
        if (hasData && !S._navConfirmed) {
            if (!confirm(T('common.unsaved_warning') || 'You have unsaved changes. Are you sure you want to leave?')) {
                return;
            }
        }
    }
    S._navConfirmed = false;
    S.page = page;
    if (params) {
        Object.keys(params).forEach(function(k) { S[k] = params[k]; });
    }
    var main = document.getElementById('main-content');
    if (main) { main.style.opacity = '0'; main.style.transition = 'opacity 0.15s ease'; }
    render();
    var newMain = document.getElementById('main-content');
    if (newMain) { requestAnimationFrame(function() { newMain.style.opacity = '1'; }); }
    window.scrollTo(0, 0);
}

// =============================================================================
// 7. Main Render
// =============================================================================

function render() {
    var app = document.getElementById('app');
    if (!app) return;

    if (S.page === 'login') {
        app.innerHTML = renderLogin();
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    if (!S.user) {
        nav('login');
        return;
    }

    app.innerHTML = renderShell();
    bindShellEvents();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// =============================================================================
// 8. Login Page
// =============================================================================

function renderLogin() {
    return '<div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-brand-900 to-brand-800 p-6 relative overflow-hidden">' +
        '<div class="absolute inset-0 pointer-events-none">' +
        '<div class="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl"></div>' +
        '<div class="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl"></div>' +
        '<div class="absolute top-1/2 right-1/3 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl"></div>' +
        '</div>' +
        '<div class="relative z-10 w-full max-w-md animate-fade-in-up">' +
        '<div class="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-8">' +
        '<div class="text-center mb-8">' +
        '<div class="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-brand-600 to-brand-700 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-500/25 transform hover:scale-105 transition-transform">' +
        '<span class="text-white text-2xl font-bold">K</span>' +
        '</div>' +
        '<h1 class="text-2xl font-bold text-slate-900">' + T('auth.login_title') + '</h1>' +
        '<p class="text-sm text-slate-500 mt-1">' + T('auth.subtitle') + '</p>' +
        '</div>' +
        '<div id="login-error" class="hidden text-sm text-rose-600 text-center mb-4 p-3 bg-rose-50 rounded-lg"></div>' +
        '<div class="space-y-4 mb-6">' +
        '<div>' +
        '<label class="block text-sm font-medium text-slate-700 mb-1.5">' + T('auth.email_label') + '</label>' +
        '<div class="relative">' +
        '<span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">' + icon('mail', 18) + '</span>' +
        '<input type="email" id="login-email" class="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none" placeholder="' + T('auth.email_placeholder') + '" onkeydown="if(event.key===\'Enter\')doLogin()">' +
        '</div></div>' +
        '<div>' +
        '<label class="block text-sm font-medium text-slate-700 mb-1.5">' + T('auth.password_label') + '</label>' +
        '<div class="relative">' +
        '<span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">' + icon('lock', 18) + '</span>' +
        '<input type="password" id="login-pass" class="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none" placeholder="' + T('auth.password_placeholder') + '" onkeydown="if(event.key===\'Enter\')doLogin()">' +
        '</div></div>' +
        '</div>' +
        '<button class="w-full py-3 px-4 text-sm font-semibold text-white bg-gradient-to-r from-brand-600 to-brand-700 rounded-lg hover:from-brand-700 hover:to-brand-800 shadow-lg shadow-brand-500/25 transition-all hover:-translate-y-0.5 active:translate-y-0" onclick="doLogin()">' +
        '<span id="login-btn-text">' + T('auth.sign_in') + '</span>' +
        '</button>' +
        '<div class="mt-6 pt-6 border-t border-slate-200">' +
        '<p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center mb-4">' + T('auth.demo_accounts') + '</p>' +
        '<div class="grid grid-cols-3 gap-3">' +
        loginRoleCard('ngo', 'building-2', 'NGO', 'fatima@amani.org') +
        loginRoleCard('donor', 'wallet', 'Donor', 'sarah@globalhealth.org') +
        loginRoleCard('reviewer', 'star', 'Reviewer', 'james@reviewer.org') +
        '</div></div>' +
        '</div></div></div>';
}

function loginRoleCard(role, iconName, label, email) {
    return '<div class="group p-3 border-2 border-slate-200 rounded-xl text-center cursor-pointer hover:border-brand-500 hover:bg-brand-50 transition-all" onclick="fillDemo(\'' + role + '\')">' +
        '<div class="w-10 h-10 mx-auto mb-2 rounded-lg bg-slate-100 group-hover:bg-brand-100 flex items-center justify-center text-slate-500 group-hover:text-brand-600 transition-colors">' +
        icon(iconName, 20) + '</div>' +
        '<div class="text-sm font-semibold text-slate-700">' + label + '</div>' +
        '<div class="text-[10px] text-slate-400 mt-1 truncate">' + esc(email) + '</div>' +
        '</div>';
}

function fillDemo(role) {
    var creds = {
        ngo: { email: 'fatima@amani.org', pass: 'pass123' },
        donor: { email: 'sarah@globalhealth.org', pass: 'pass123' },
        reviewer: { email: 'james@reviewer.org', pass: 'pass123' }
    };
    var c = creds[role];
    if (!c) return;
    var emailEl = document.getElementById('login-email');
    var passEl = document.getElementById('login-pass');
    if (emailEl) emailEl.value = c.email;
    if (passEl) passEl.value = c.pass;
}

async function doLogin() {
    var email = (document.getElementById('login-email') || {}).value || '';
    var pass = (document.getElementById('login-pass') || {}).value || '';
    if (!email || !pass) {
        showToast(T('auth.email_password_required'), 'warning');
        return;
    }
    var btn = document.getElementById('login-btn-text');
    if (btn) btn.innerHTML = '<span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin-slow"></span> ' + T('auth.signing_in');

    var res = await api('POST', '/api/auth/login', { email: email, password: pass });
    if (res && res.success) {
        S.user = res.user;
        // Load user's saved language preference
        var userLang = (res.user.language || 'en');
        if (userLang !== _currentLang) {
            _currentLang = userLang;
            await loadTranslations(userLang);
            document.documentElement.lang = userLang;
            document.documentElement.dir = userLang === 'ar' ? 'rtl' : 'ltr';
        }
        showToast(T('auth.welcome_back', {name: res.user.name || 'User'}), 'success');
        nav('dashboard');
    } else {
        if (btn) btn.textContent = T('auth.sign_in');
        var errEl = document.getElementById('login-error');
        if (errEl) {
            errEl.style.display = 'block';
            errEl.textContent = (res && res.error) || T('auth.invalid_credentials');
        }
    }
}

// =============================================================================
// 9. App Shell
// =============================================================================

function renderShell() {
    var role = (S.user.role || '').toLowerCase();
    var mainHTML = renderPageContent();
    var sidebarW = S.sidebarCollapsed ? '60px' : '250px';
    var aiMr = S.aiPanelOpen ? 'margin-right:340px;' : '';

    return renderHeader() + renderSidebar(role) +
        '<main class="mt-[60px] min-h-[calc(100vh-60px)] p-6 transition-all duration-300" style="margin-left:' + sidebarW + ';' + aiMr + '" id="main-content" role="main">' + mainHTML + '</main>' +
        renderAIPanel() +
        '<button class="fixed right-5 bottom-5 w-12 h-12 bg-gradient-to-br from-brand-600 to-brand-700 text-white rounded-full shadow-lg shadow-brand-500/25 flex items-center justify-center z-[85] hover:scale-110 active:scale-95 transition-transform" onclick="toggleAI()" title="AI Assistant" aria-label="' + T('ai.panel_title') + '">' + icon('sparkles', 20) + '</button>';
}

function renderHeader() {
    var role = (S.user.role || '').replace(/_/g, ' ');
    var roleBadgeColors = {
        ngo: 'bg-emerald-50 text-emerald-700', donor: 'bg-blue-50 text-blue-700',
        reviewer: 'bg-amber-50 text-amber-700', admin: 'bg-slate-100 text-slate-700'
    };
    var roleBadge = '<span class="px-2 py-0.5 text-[10px] font-semibold rounded-full ' + (roleBadgeColors[role] || roleBadgeColors.admin) + '">' + esc(role.toUpperCase()) + '</span>';

    return '<header class="fixed top-0 left-0 right-0 h-[60px] bg-white/90 backdrop-blur-xl border-b border-slate-200/80 flex items-center justify-between px-6 z-[100]" role="banner">' +
        '<div class="flex items-center gap-3 cursor-pointer" onclick="nav(\'dashboard\')">' +
        '<div class="w-8 h-8 bg-gradient-to-br from-brand-600 to-brand-700 rounded-lg flex items-center justify-center shadow-sm">' +
        '<span class="text-white text-sm font-bold">K</span></div>' +
        '<span class="text-lg font-bold text-slate-900 hidden sm:inline">Kuja Grant</span>' +
        '</div>' +
        '<div class="flex items-center gap-3">' +
        '<button class="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" onclick="toggleSidebar()">' + icon('menu', 20) + '</button>' +
        '<div class="flex items-center gap-2.5">' +
        '<div class="w-8 h-8 rounded-full bg-gradient-to-br from-brand-600 to-brand-700 text-white flex items-center justify-center text-xs font-semibold">' +
        esc((S.user.name || 'U').charAt(0).toUpperCase()) +
        '</div>' +
        '<span class="text-sm font-medium text-slate-700 hidden md:inline">' + esc(S.user.name || 'User') + '</span>' +
        roleBadge +
        '</div>' +
        '<div class="relative">' +
        '<select class="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white cursor-pointer appearance-none pr-7 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none" onchange="setLanguage(this.value)" aria-label="Select language">' +
        '<option value="en"' + (_currentLang === 'en' ? ' selected' : '') + '>EN</option>' +
        '<option value="ar"' + (_currentLang === 'ar' ? ' selected' : '') + '>AR</option>' +
        '<option value="fr"' + (_currentLang === 'fr' ? ' selected' : '') + '>FR</option>' +
        '<option value="es"' + (_currentLang === 'es' ? ' selected' : '') + '>ES</option>' +
        '</select></div>' +
        '<button class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-500 border border-slate-200 rounded-lg hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition-all" onclick="doLogout()">' +
        icon('log-out', 16) + '<span class="hidden sm:inline">' + T('auth.logout') + '</span></button>' +
        '</div>' +
        '</header>';
}

function renderSidebar(role) {
    var items = [];
    if (role === 'ngo') {
        items = [
            { ic: 'layout-dashboard', label: T('nav.dashboard'), page: 'dashboard' },
            { ic: 'clipboard-check', label: T('nav.assessment_hub'), page: 'assessment' },
            { ic: 'wallet', label: T('nav.browse_grants'), page: 'grants' },
            { ic: 'file-text', label: T('nav.my_applications'), page: 'applications' },
            { ic: 'bar-chart-3', label: T('nav.reports'), page: 'reports' },
            { ic: 'folder-open', label: T('nav.my_documents'), page: 'documents' },
            { ic: 'building-2', label: T('nav.org_profile'), page: 'orgprofile' }
        ];
    } else if (role === 'donor') {
        items = [
            { ic: 'layout-dashboard', label: T('nav.dashboard'), page: 'dashboard' },
            { ic: 'plus-circle', label: T('nav.create_grant'), page: 'creategrant' },
            { ic: 'briefcase', label: T('nav.my_grants'), page: 'mygrants' },
            { ic: 'star', label: T('nav.review_applications'), page: 'rankings' },
            { ic: 'bar-chart-3', label: T('nav.grant_reports'), page: 'reports' },
            { ic: 'search', label: T('nav.org_search'), page: 'orgsearch' },
            { ic: 'shield-check', label: T('nav.registration_checks'), page: 'verification' },
            { ic: 'shield', label: T('nav.compliance'), page: 'compliance' }
        ];
    } else if (role === 'reviewer') {
        items = [
            { ic: 'layout-dashboard', label: T('nav.dashboard'), page: 'dashboard' },
            { ic: 'clipboard-list', label: T('nav.my_assignments'), page: 'assignments' },
            { ic: 'check-circle', label: T('nav.completed_reviews'), page: 'completedreviews' }
        ];
    } else if (role === 'admin') {
        items = [
            { ic: 'layout-dashboard', label: T('nav.admin_dashboard'), page: 'dashboard' },
            { ic: 'wallet', label: T('nav.all_grants'), page: 'grants' },
            { ic: 'file-text', label: T('nav.all_applications'), page: 'applications' },
            { ic: 'search', label: T('nav.org_search'), page: 'orgsearch' },
            { ic: 'shield-check', label: T('nav.registration_checks'), page: 'verification' },
            { ic: 'shield', label: T('nav.compliance'), page: 'compliance' },
            { ic: 'bar-chart-3', label: T('nav.reports'), page: 'reports' }
        ];
    }

    var navHTML = items.map(function(it) {
        var isActive = S.page === it.page;
        return '<a class="flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 ' +
            (isActive ? 'bg-white/15 text-white shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/10') +
            '" onclick="nav(\'' + it.page + '\')">' +
            '<span class="shrink-0 w-5">' + icon(it.ic, 18) + '</span>' +
            '<span class="truncate' + (S.sidebarCollapsed ? ' hidden' : '') + '">' + esc(it.label) + '</span>' +
            (isActive && !S.sidebarCollapsed ? '<span class="ml-auto w-1.5 h-1.5 rounded-full bg-white"></span>' : '') +
            '</a>';
    }).join('');

    return '<aside class="fixed top-[60px] left-0 bottom-0 bg-gradient-to-b from-slate-900 to-slate-800 text-white overflow-y-auto overflow-x-hidden transition-all duration-300 z-[90] flex flex-col ' +
        (S.sidebarCollapsed ? 'w-[60px]' : 'w-[250px]') + '" id="sidebar" role="navigation" aria-label="Main navigation">' +
        '<nav class="flex-1 py-4 space-y-1">' +
        '<div class="px-4 mb-4' + (S.sidebarCollapsed ? ' hidden' : '') + '">' +
        '<span class="text-[10px] uppercase tracking-widest text-white/30 font-semibold">Navigation</span></div>' +
        navHTML +
        '</nav>' +
        '<div class="p-3 border-t border-white/10">' +
        '<button class="w-full flex items-center justify-center h-8 rounded-lg bg-white/10 text-white/60 hover:text-white hover:bg-white/20 transition-all" onclick="toggleSidebar()" title="Toggle Sidebar" aria-label="Toggle sidebar navigation">' +
        icon(S.sidebarCollapsed ? 'chevron-right' : 'chevron-left', 16) +
        '</button></div></aside>';
}

function toggleSidebar() {
    S.sidebarCollapsed = !S.sidebarCollapsed;
    render();
}

function toggleAI() {
    S.aiPanelOpen = !S.aiPanelOpen;
    render();
}

async function doLogout() {
    await api('POST', '/api/auth/logout');
    S.user = null;
    showToast(T('auth.logged_out'), 'info');
    nav('login');
}

function bindShellEvents() {
    // Bind textarea/input events that should NOT trigger render
    document.querySelectorAll('[data-bind]').forEach(function(el) {
        var key = el.getAttribute('data-bind');
        var parts = key.split('.');
        el.addEventListener('input', function() {
            var obj = S;
            for (var i = 0; i < parts.length - 1; i++) {
                obj = obj[parts[i]];
            }
            obj[parts[parts.length - 1]] = el.value;
        });
    });
}

// =============================================================================
// 10. Page Content Router
// =============================================================================

function renderPageContent() {
    var role = (S.user.role || '').toLowerCase();
    switch (S.page) {
        case 'dashboard':
            if (role === 'ngo') return renderNGODashboard();
            if (role === 'donor') return renderDonorDashboard();
            if (role === 'reviewer') return renderReviewerDashboard();
            if (role === 'admin') return renderAdminDashboard();
            return renderNGODashboard();
        case 'grants': return renderBrowseGrants();
        case 'mygrants': return renderMyGrants();
        case 'grantdetail': return renderGrantDetail();
        case 'apply': return renderApplyForm();
        case 'applications': return renderMyApplications();
        case 'appdetail': return renderApplicationDetail();
        case 'creategrant': return renderCreateGrant();
        case 'rankings': return renderApplicantRankings();
        case 'scoreapp': return renderScoreApp();
        case 'assessment': return renderAssessmentHub();
        case 'assesswizard': return renderAssessmentWizard();
        case 'orgprofile': return renderOrgProfile();
        case 'documents': return renderMyDocuments();
        case 'compliance': return renderCompliance();
        case 'orgsearch': return renderOrgSearch();
        case 'assignments': return renderAssignments();
        case 'completedreviews': return renderCompletedReviews();
        case 'review': return renderScoreApp();
        case 'reports': return renderReportsPage();
        case 'submitreport': return renderSubmitReport();
        case 'reviewreport': return renderReviewReport();
        case 'verification': return renderVerificationDashboard();
        default: return '<div class="flex flex-col items-center justify-center py-20 text-center">' +
            '<div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">' + icon('compass', 28, 'text-slate-400') + '</div>' +
            '<h1 class="text-xl font-bold text-slate-900 mb-2">' + T('common.page_not_found') + '</h1>' +
            '<p class="text-slate-500 mb-6">' + T('common.page_not_found_desc') + '</p>' +
            '<button class="px-5 py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-colors" onclick="nav(\'dashboard\')">' + T('common.go_to_dashboard') + '</button>' +
            '</div>';
    }
}

// =============================================================================
// 11. NGO Dashboard
// =============================================================================

function renderNGODashboard() {
    loadDashboardStats();
    var stats = S.dashboardStats || {};
    var score = stats.average_score || 0;
    var cap = capacityLabel(score);

    return '<div class="mb-8 animate-fade-in">' +
        '<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">' +
        '<div>' +
        '<h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('hand-metal', 24, 'text-brand-500') + ' ' + T('dashboard.welcome', {name: S.user.name || 'User'}) + '</h1>' +
        '<p class="text-slate-500 mt-1">' + esc(S.user.org_name || 'Your Organization') + '</p>' +
        '</div>' +
        '<div class="flex gap-2">' +
        '<button class="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="nav(\'assessment\')">' + icon('clipboard-check', 16) + ' ' + T('dashboard.action.start_assessment') + '</button>' +
        '<button class="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="nav(\'grants\')">' + icon('search', 16) + ' ' + T('dashboard.action.browse_grants') + '</button>' +
        '</div></div></div>' +

        // Stat Cards
        '<div id="ngo-stat-cards" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8" data-stagger>' +
        renderStatCard('bar-chart-3', T('dashboard.stat.capacity_score'), score + '%', 'green') +
        renderStatCard('file-text', T('dashboard.stat.my_applications'), stats.total_applications || 0, 'blue') +
        renderStatCard('coins', T('dashboard.stat.open_grants'), stats.open_grants || 0, 'amber') +
        renderStatCard('folder-open', T('dashboard.stat.documents'), stats.documents || 0, 'purple') +
        '</div>' +

        // Capacity Card with Chart
        '<div class="bg-white rounded-xl border border-slate-200/60 p-6 mb-8">' +
        '<div class="flex flex-col sm:flex-row items-center gap-6">' +
        '<div class="shrink-0">' + scoreRingHTML(score, 80, '%') + '</div>' +
        '<div class="flex-1 text-center sm:text-left">' +
        '<h3 class="text-lg font-semibold text-slate-900">' + T('dashboard.stat.capacity_score') + '</h3>' +
        '<p class="text-sm text-slate-500 mt-1">Your current capacity level: ' + statusBadge(cap.label, cap.color) + '</p>' +
        '</div>' +
        '<div class="shrink-0">' +
        '<button class="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="nav(\'assessment\')">' + icon('arrow-right', 16) + ' ' + T('dashboard.action.start_assessment') + '</button>' +
        '</div>' +
        '</div></div>' +

        // Recommended Grants
        '<div class="mb-8">' +
        '<h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('lightbulb', 20, 'text-amber-500') + ' ' + T('dashboard.action.browse_grants') + '</h2>' +
        '<div id="recommended-grants" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">' +
        renderLoadingCards(3) +
        '</div></div>' +

        // Upcoming Reports
        '<div class="mb-8">' +
        '<h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('calendar-clock', 20, 'text-blue-500') + ' ' + T('dashboard.stat.reports_due') + '</h2>' +
        '<div id="upcoming-reports">' + renderLoadingTable() + '</div>' +
        '</div>' +

        // Recent Applications
        '<div class="mb-8">' +
        '<h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('file-text', 20, 'text-brand-500') + ' ' + T('dashboard.stat.my_applications') + '</h2>' +
        '<div id="recent-applications">' + renderLoadingTable() + '</div>' +
        '</div>' +

        // Quick Actions
        '<div class="mb-8">' +
        '<h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('zap', 20, 'text-amber-500') + ' ' + T('dashboard.quick_actions') + '</h2>' +
        '<div class="flex flex-wrap gap-3">' +
        '<button class="px-4 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="nav(\'assessment\')">' + icon('clipboard-check', 16) + ' ' + T('dashboard.action.start_assessment') + '</button>' +
        '<button class="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="nav(\'grants\')">' + icon('coins', 16) + ' ' + T('dashboard.action.browse_grants') + '</button>' +
        '<button class="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="nav(\'documents\')">' + icon('folder-open', 16) + ' ' + T('dashboard.action.view_documents') + '</button>' +
        '<button class="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="nav(\'reports\')">' + icon('bar-chart-2', 16) + ' ' + T('dashboard.action.view_reports') + '</button>' +
        '</div></div>';
}

async function loadUpcomingReports() {
    var res = await api('GET', '/api/reports/upcoming');
    var el = document.getElementById('upcoming-reports');
    if (!el) return;
    if (!res || !res.upcoming_reports || res.upcoming_reports.length === 0) {
        el.innerHTML = '<div class="bg-white rounded-xl border border-slate-200/60 p-8 text-center"><p class="text-slate-400 text-sm">No upcoming reports due. Reports will appear here when you have awarded grants.</p></div>';
        return;
    }
    var reports = res.upcoming_reports;
    el.innerHTML = '<div class="bg-white rounded-xl border border-slate-200/60 overflow-hidden"><table class="w-full"><thead>' +
        '<tr class="bg-slate-50 border-b border-slate-200">' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('report.title') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('report.grant') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('common.due_date') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('application.tab.status') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('common.actions') + '</th>' +
        '</tr></thead><tbody class="divide-y divide-slate-100">' +
        reports.slice(0, 8).map(function(r) {
            var isOverdue = r.is_overdue;
            var daysText = isOverdue ? Math.abs(r.days_until_due) + ' days overdue' : r.days_until_due + ' days left';
            var urgBadge = isOverdue ? statusBadge(daysText, 'red') : r.days_until_due <= 7 ? statusBadge(daysText, 'amber') : statusBadge(daysText, 'blue');
            var sBadge = r.status === 'not_started' ? statusBadge(T('common.not_started'), 'gray') :
                r.status === 'draft' ? statusBadge('Draft', 'gray') :
                statusBadge(esc(r.status).replace(/_/g, ' '), 'amber');
            var actionBtn = r.draft_report_id ?
                '<button class="px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors" onclick="editReport(' + r.draft_report_id + ')">Continue</button>' :
                '<button class="px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors" onclick="startReportForGrant(' + r.grant_id + ',\'' + esc(r.report_type) + '\',\'' + esc(r.reporting_period) + '\')">Start</button>';
            return '<tr class="hover:bg-slate-50/80 transition-colors' + (isOverdue ? ' bg-rose-50/50' : '') + '">' +
                '<td class="px-4 py-3.5"><div class="font-medium text-slate-900 text-sm">' + esc(r.requirement_title || r.report_type) + '</div><div class="text-xs text-slate-400 mt-0.5">' + esc(r.reporting_period) + '</div></td>' +
                '<td class="px-4 py-3.5 text-sm text-slate-600">' + esc(r.grant_title || '') + '</td>' +
                '<td class="px-4 py-3.5">' + urgBadge + '<div class="text-xs text-slate-400 mt-1">' + esc(r.due_date) + '</div></td>' +
                '<td class="px-4 py-3.5">' + sBadge + '</td>' +
                '<td class="px-4 py-3.5">' + actionBtn + '</td></tr>';
        }).join('') +
        '</tbody></table></div>' +
        '<p class="text-center mt-3"><a href="#" onclick="nav(\'reports\');return false;" class="text-brand-600 hover:text-brand-700 text-sm font-medium inline-flex items-center gap-1">' + icon('file-text', 14) + ' ' + T('dashboard.action.view_reports') + ' &rarr;</a></p>';
}

async function startReportForGrant(grantId, reportType, period) {
    var res = await api('POST', '/api/reports/', {
        grant_id: grantId,
        report_type: reportType,
        reporting_period: period,
        title: (reportType.charAt(0).toUpperCase() + reportType.slice(1)) + ' Report - ' + period
    });
    if (res && res.report) {
        editReport(res.report.id);
    }
}

// =============================================================================
// 12. Donor Dashboard
// =============================================================================

function renderDonorDashboard() {
    loadDashboardStats();
    var stats = S.dashboardStats || {};

    return '<div class="mb-8 animate-fade-in">' +
        '<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">' +
        '<div>' +
        '<h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('hand-metal', 24, 'text-brand-500') + ' ' + T('dashboard.welcome', {name: S.user.name || 'User'}) + '</h1>' +
        '<p class="text-slate-500 mt-1">' + esc(S.user.org_name || 'Your Organization') + '</p>' +
        '</div>' +
        '<button class="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="nav(\'creategrant\')">' + icon('plus', 16) + ' ' + T('dashboard.action.create_grant') + '</button>' +
        '</div></div>' +

        '<div id="donor-stat-cards" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8" data-stagger>' +
        renderStatCard('coins', T('dashboard.stat.total_grants'), stats.total_grants || 0, 'green') +
        renderStatCard('file-text', T('dashboard.stat.total_applications'), stats.total_applications || 0, 'blue') +
        renderStatCard('star', T('dashboard.stat.pending_reviews'), stats.pending_review || 0, 'amber') +
        renderStatCard('trophy', T('dashboard.stat.total_funding'), formatCurrency(stats.total_funding_awarded || 0), 'red') +
        renderStatCard('bar-chart-2', T('dashboard.stat.reports_due'), stats.pending_report_reviews || 0, 'purple') +
        '</div>' +

        '<div class="mb-8">' +
        '<h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('wallet', 20, 'text-emerald-500') + ' ' + T('dashboard.stat.active_grants') + '</h2>' +
        '<div id="active-grants" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">' +
        renderLoadingCards(3) +
        '</div></div>' +

        '<div class="mb-8">' +
        '<h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('file-text', 20, 'text-blue-500') + ' ' + T('dashboard.stat.total_applications') + '</h2>' +
        '<div id="donor-recent-apps">' + renderLoadingTable() + '</div>' +
        '</div>' +

        '<div class="mb-8">' +
        '<h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('zap', 20, 'text-amber-500') + ' ' + T('dashboard.quick_actions') + '</h2>' +
        '<div class="flex flex-wrap gap-3">' +
        '<button class="px-4 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="nav(\'creategrant\')">' + icon('plus', 16) + ' ' + T('dashboard.action.create_grant') + '</button>' +
        '<button class="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="nav(\'rankings\')">' + icon('star', 16) + ' ' + T('dashboard.action.review_apps') + '</button>' +
        '<button class="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="nav(\'reports\')">' + icon('bar-chart-2', 16) + ' ' + T('dashboard.action.view_reports') + '</button>' +
        '</div></div>';
}

// =============================================================================
// 13. Reviewer Dashboard
// =============================================================================

function renderReviewerDashboard() {
    loadDashboardStats();
    var stats = S.dashboardStats || {};

    return '<div class="mb-8 animate-fade-in">' +
        '<h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('hand-metal', 24, 'text-brand-500') + ' ' + T('dashboard.welcome', {name: S.user.name || 'Reviewer'}) + '</h1>' +
        '<p class="text-slate-500 mt-1">' + T('nav.dashboard') + '</p>' +
        '</div>' +

        '<div id="reviewer-stat-cards" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8" data-stagger>' +
        renderStatCard('file-text', T('dashboard.stat.assigned_reviews'), stats.assigned_reviews || 0, 'blue') +
        renderStatCard('clock', T('status.in_progress'), stats.in_progress_reviews || 0, 'amber') +
        renderStatCard('check-circle-2', T('status.completed'), stats.completed_reviews || 0, 'green') +
        renderStatCard('trending-up', T('dashboard.stat.avg_score'), (stats.average_score_given || 0) + '%', 'purple') +
        '</div>' +

        '<div class="mb-8">' +
        '<h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('clipboard-list', 20, 'text-blue-500') + ' ' + T('review.assignments') + '</h2>' +
        '<div id="reviewer-assignments">' + renderLoadingTable() + '</div>' +
        '</div>';
}

// =============================================================================
// 14b. Admin Dashboard
// =============================================================================

function renderAdminDashboard() {
    loadAdminStats();
    var stats = S.adminStats || {};

    return '<div class="mb-8 animate-fade-in">' +
        '<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">' +
        '<div>' +
        '<h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('settings', 24, 'text-brand-500') + ' ' + T('nav.admin_dashboard') + '</h1>' +
        '<p class="text-slate-500 mt-1">' + T('dashboard.welcome', {name: S.user.name || 'Admin'}) + ' &mdash; ' +
        '<span class="text-xs text-slate-400">v' + esc(stats.app_version || '1.1.0') +
        ' &bull; Uptime: ' + esc(stats.uptime || '--') +
        ' &bull; ' + esc(stats.environment || 'production') + '</span></p>' +
        '</div></div></div>' +

        // SLO Alert Banner
        '<div id="admin-alerts">' + renderAlertBanner(stats.alerts || []) + '</div>' +

        // Top stat cards
        '<div id="admin-stat-cards" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8" data-stagger>' +
        renderStatCard('users', T('dashboard.stat.total_users'), stats.total_users || 0, 'blue') +
        renderStatCard('building-2', T('dashboard.stat.total_orgs'), stats.total_organizations || 0, 'green') +
        renderStatCard('badge-check', T('status.verified'), stats.verified_organizations || 0, 'green') +
        renderStatCard('coins', T('dashboard.stat.total_grants'), stats.total_grants || 0, 'amber') +
        renderStatCard('file-text', T('dashboard.stat.total_applications'), stats.total_applications || 0, 'purple') +
        renderStatCard('alert-triangle', T('dashboard.stat.compliance_alerts'), stats.flagged_compliance || 0, 'red') +
        '</div>' +

        // Two-column breakdowns
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">' +

        '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('users', 16, 'text-blue-500') + ' ' + T('dashboard.stat.total_users') + '</h3>' +
        '<div id="admin-users-by-role">' + renderAdminRoleBreakdown(stats.users_by_role || {}) + '</div>' +
        '</div>' +

        '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('building-2', 16, 'text-emerald-500') + ' ' + T('dashboard.stat.total_orgs') + '</h3>' +
        '<div id="admin-orgs-by-type">' + renderAdminOrgBreakdown(stats.orgs_by_type || {}) + '</div>' +
        '</div>' +

        '</div>' +

        // Applications by Status
        '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-8">' +
        '<h3 class="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('file-text', 16, 'text-brand-500') + ' ' + T('dashboard.stat.total_applications') + '</h3>' +
        '<div id="admin-apps-by-status">' + renderAdminStatusBreakdown(stats.apps_by_status || {}) + '</div>' +
        '</div>' +

        // Activity last 7 days
        '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-8">' +
        '<h3 class="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('trending-up', 16, 'text-emerald-500') + ' Last 7 Days</h3>' +
        '<div class="flex flex-wrap gap-8">' +
        '<div><span class="text-3xl font-bold text-emerald-600">' + (stats.new_users_7d || 0) + '</span><div class="text-xs text-slate-500 mt-1">' + T('dashboard.stat.total_users') + '</div></div>' +
        '<div><span class="text-3xl font-bold text-blue-600">' + (stats.new_apps_7d || 0) + '</span><div class="text-xs text-slate-500 mt-1">' + T('dashboard.stat.total_applications') + '</div></div>' +
        '<div><span class="text-3xl font-bold text-amber-500">' + (stats.new_orgs_7d || 0) + '</span><div class="text-xs text-slate-500 mt-1">' + T('dashboard.stat.total_orgs') + '</div></div>' +
        '</div></div>' +

        // Recent Users Table
        '<div class="mb-8">' +
        '<h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('users', 20, 'text-blue-500') + ' ' + T('dashboard.stat.total_users') + '</h2>' +
        '<div id="admin-recent-users">' + renderLoadingTable() + '</div>' +
        '</div>' +

        // System Info
        '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-8">' +
        '<h3 class="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('cpu', 16, 'text-slate-500') + ' System Information</h3>' +
        '<div class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">' +
        '<span class="font-medium text-slate-700">AI Service:</span><span class="text-slate-600">' + (stats.ai_enabled ? icon('check-circle-2', 14, 'text-emerald-500') + ' Enabled (Claude AI)' : icon('x-circle', 14, 'text-rose-500') + ' Not configured') + '</span>' +
        '<span class="font-medium text-slate-700">Database:</span><span class="text-slate-600">' + esc(stats.environment === 'production' ? 'PostgreSQL' : 'SQLite') + '</span>' +
        '<span class="font-medium text-slate-700">Total Reviews:</span><span class="text-slate-600">' + (stats.total_reviews || 0) + '</span>' +
        '<span class="font-medium text-slate-700">Total Assessments:</span><span class="text-slate-600">' + (stats.total_assessments || 0) + '</span>' +
        '</div></div>' +

        // Security & Audit
        '<div class="bg-white rounded-xl border border-slate-200/60 border-l-4 border-l-rose-500 p-5 mb-8">' +
        '<h3 class="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('shield', 16, 'text-rose-500') + ' Security & Audit</h3>' +
        '<div id="admin-security-metrics">' + renderSecurityMetrics(stats.security || {}) + '</div>' +
        '</div>' +

        // Document Metrics
        '<div class="bg-white rounded-xl border border-slate-200/60 border-l-4 border-l-violet-500 p-5 mb-8">' +
        '<h3 class="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('folder-open', 16, 'text-violet-500') + ' Upload & Document Metrics</h3>' +
        '<div id="admin-document-metrics">' + renderDocumentMetrics(stats.documents || {}) + '</div>' +
        '</div>' +

        // Quick Actions
        '<div class="mb-8">' +
        '<h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('zap', 20, 'text-amber-500') + ' ' + T('dashboard.quick_actions') + '</h2>' +
        '<div class="flex flex-wrap gap-3">' +
        '<button class="px-4 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="nav(\'orgsearch\')">' + icon('search', 16) + ' ' + T('nav.org_search') + '</button>' +
        '<button class="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="nav(\'grants\')">' + icon('coins', 16) + ' ' + T('nav.all_grants') + '</button>' +
        '<button class="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="nav(\'applications\')">' + icon('file-text', 16) + ' ' + T('nav.all_applications') + '</button>' +
        '<button class="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="nav(\'compliance\')">' + icon('shield-check', 16) + ' ' + T('nav.compliance') + '</button>' +
        '<button class="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="nav(\'verification\')">' + icon('badge-check', 16) + ' ' + T('nav.registration_checks') + '</button>' +
        '</div></div>';
}

function renderAdminRoleBreakdown(byRole) {
    var roles = ['ngo', 'donor', 'reviewer', 'admin'];
    var barColors = { ngo: 'bg-emerald-500', donor: 'bg-blue-500', reviewer: 'bg-amber-500', admin: 'bg-rose-500' };
    var labels = { ngo: 'NGO', donor: 'Donor', reviewer: 'Reviewer', admin: 'Admin' };
    var total = roles.reduce(function(acc, r) { return acc + (byRole[r] || 0); }, 0) || 1;
    return roles.map(function(r) {
        var count = byRole[r] || 0;
        var pct = Math.round((count / total) * 100);
        return '<div class="flex items-center gap-3 py-1.5">' +
            '<div class="w-20 text-xs font-semibold text-slate-600">' + labels[r] + '</div>' +
            '<div class="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">' +
            '<div class="h-full ' + barColors[r] + ' rounded-full transition-all duration-500" style="width:' + pct + '%;"></div>' +
            '</div>' +
            '<div class="w-16 text-xs text-slate-500 text-right">' + count + ' (' + pct + '%)</div>' +
            '</div>';
    }).join('');
}

function renderAdminOrgBreakdown(byType) {
    var types = ['ngo', 'donor', 'ingo', 'cbo', 'network'];
    var labels = { ngo: 'NGO', donor: 'Donor', ingo: 'INGO', cbo: 'CBO', network: 'Network' };
    var barColors = { ngo: 'bg-emerald-500', donor: 'bg-blue-500', ingo: 'bg-violet-500', cbo: 'bg-amber-500', network: 'bg-cyan-500' };
    var total = types.reduce(function(acc, t) { return acc + (byType[t] || 0); }, 0) || 1;
    return types.map(function(t) {
        var count = byType[t] || 0;
        var pct = Math.round((count / total) * 100);
        return '<div class="flex items-center gap-3 py-1.5">' +
            '<div class="w-20 text-xs font-semibold text-slate-600">' + labels[t] + '</div>' +
            '<div class="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">' +
            '<div class="h-full ' + barColors[t] + ' rounded-full transition-all duration-500" style="width:' + pct + '%;"></div>' +
            '</div>' +
            '<div class="w-16 text-xs text-slate-500 text-right">' + count + ' (' + pct + '%)</div>' +
            '</div>';
    }).join('');
}

function renderAdminStatusBreakdown(byStatus) {
    var statuses = ['draft', 'submitted', 'under_review', 'scored', 'approved', 'rejected'];
    var labels = { draft: 'Draft', submitted: 'Submitted', under_review: 'Under Review',
                   scored: 'Scored', approved: 'Approved', rejected: 'Rejected' };
    var colorMap = { draft: 'text-slate-400 border-slate-300', submitted: 'text-blue-600 border-blue-400', under_review: 'text-amber-500 border-amber-400',
                   scored: 'text-violet-600 border-violet-400', approved: 'text-emerald-600 border-emerald-400', rejected: 'text-rose-500 border-rose-400' };
    return '<div class="flex flex-wrap gap-3">' +
        statuses.map(function(s) {
            var count = byStatus[s] || 0;
            var cls = colorMap[s] || 'text-slate-500 border-slate-300';
            return '<div class="text-center px-5 py-3 bg-slate-50/80 rounded-xl border-l-4 ' + cls + '">' +
                '<div class="text-2xl font-bold">' + count + '</div>' +
                '<div class="text-xs text-slate-500 mt-0.5">' + labels[s] + '</div>' +
                '</div>';
        }).join('') +
        '</div>';
}

function renderAlertBanner(alerts) {
    if (!alerts || !alerts.length) return '';
    return alerts.map(function(a) {
        var isCritical = a.level === 'critical';
        var cls = isCritical ? 'bg-rose-50 border-rose-200 border-l-rose-500' : 'bg-amber-50 border-amber-200 border-l-amber-500';
        var textCls = isCritical ? 'text-rose-800' : 'text-amber-800';
        var iconName = isCritical ? 'siren' : 'alert-triangle';
        var iconCls = isCritical ? 'text-rose-500' : 'text-amber-500';
        return '<div data-alert-type="' + esc(a.type) + '" data-alert-level="' + esc(a.level) + '" ' +
            'class="flex items-center gap-3 px-4 py-3 rounded-xl border border-l-4 mb-3 ' + cls + '">' +
            icon(iconName, 20, iconCls) +
            '<div>' +
            '<div class="font-semibold text-sm ' + textCls + '">' +
            (isCritical ? 'CRITICAL' : 'WARNING') + ': ' + esc(a.type.replace('_', ' ').toUpperCase()) + '</div>' +
            '<div class="text-xs ' + textCls + ' opacity-80">' + esc(a.message) + '</div>' +
            '</div></div>';
    }).join('');
}

function renderSecurityMetrics(sec) {
    if (!sec || (!sec.login_attempts_24h && !sec.currently_locked)) {
        return '<p class="text-slate-400 text-xs py-2">No security events recorded.</p>';
    }
    var html = '<div class="flex flex-wrap gap-3 mb-4">' +
        '<div class="text-center px-5 py-3 bg-slate-50/80 rounded-xl border-l-4 ' + (sec.login_attempts_1h > 20 ? 'border-l-rose-500' : 'border-l-emerald-500') + '">' +
        '<div class="text-2xl font-bold ' + (sec.login_attempts_1h > 20 ? 'text-rose-600' : 'text-emerald-600') + '">' + (sec.login_attempts_1h || 0) + '</div>' +
        '<div class="text-xs text-slate-500 mt-0.5">Login Attempts (1h)</div></div>' +

        '<div class="text-center px-5 py-3 bg-slate-50/80 rounded-xl border-l-4 ' + (sec.login_attempts_24h > 100 ? 'border-l-rose-500' : 'border-l-blue-500') + '">' +
        '<div class="text-2xl font-bold ' + (sec.login_attempts_24h > 100 ? 'text-rose-600' : 'text-blue-600') + '">' + (sec.login_attempts_24h || 0) + '</div>' +
        '<div class="text-xs text-slate-500 mt-0.5">Login Attempts (24h)</div></div>' +

        '<div class="text-center px-5 py-3 bg-slate-50/80 rounded-xl border-l-4 border-l-amber-500">' +
        '<div class="text-2xl font-bold text-amber-500">' + (sec.unique_ips_24h || 0) + '</div>' +
        '<div class="text-xs text-slate-500 mt-0.5">Unique IPs (24h)</div></div>' +

        '<div class="text-center px-5 py-3 bg-slate-50/80 rounded-xl border-l-4 ' + (sec.currently_locked > 0 ? 'border-l-rose-500' : 'border-l-slate-300') + '">' +
        '<div class="text-2xl font-bold ' + (sec.currently_locked > 0 ? 'text-rose-600' : 'text-slate-400') + '">' + (sec.currently_locked || 0) + '</div>' +
        '<div class="text-xs text-slate-500 mt-0.5">Locked Accounts</div></div>' +
        '</div>';

    if (sec.top_ips_24h && sec.top_ips_24h.length) {
        html += '<div class="mt-3">' +
            '<div class="text-xs font-semibold text-slate-700 mb-2">Top Login IPs (24h)</div>' +
            '<div class="bg-slate-50 rounded-lg overflow-hidden"><table class="w-full text-xs">' +
            '<thead><tr class="border-b border-slate-200"><th class="px-3 py-2 text-left font-semibold text-slate-500">IP Address</th><th class="px-3 py-2 text-right font-semibold text-slate-500">Attempts</th><th class="px-3 py-2 text-center font-semibold text-slate-500">Risk</th></tr></thead><tbody class="divide-y divide-slate-100">';
        sec.top_ips_24h.forEach(function(row) {
            var riskBadge = row.attempts >= 20 ? statusBadge('High', 'red') : row.attempts >= 10 ? statusBadge('Medium', 'amber') : statusBadge('Low', 'green');
            html += '<tr class="hover:bg-white transition-colors">' +
                '<td class="px-3 py-2 font-mono text-slate-700">' + esc(row.ip) + '</td>' +
                '<td class="px-3 py-2 text-right font-semibold text-slate-900">' + row.attempts + '</td>' +
                '<td class="px-3 py-2 text-center">' + riskBadge + '</td></tr>';
        });
        html += '</tbody></table></div></div>';
    }

    if (sec.locked_accounts && sec.locked_accounts.length) {
        html += '<div class="mt-3">' +
            '<div class="text-xs font-semibold text-rose-700 mb-2 flex items-center gap-1">' + icon('lock', 12) + ' Currently Locked Accounts</div>';
        sec.locked_accounts.forEach(function(a) {
            html += '<div class="flex items-center gap-2 py-1.5 text-xs">' +
                statusBadge('LOCKED', 'red') +
                '<span class="text-slate-700">' + esc(a.email) + '</span>' +
                '<span class="text-slate-400">until ' + (a.locked_until ? new Date(a.locked_until).toLocaleTimeString() : '--') + '</span></div>';
        });
        html += '</div>';
    }
    return html;
}

function renderDocumentMetrics(docs) {
    if (!docs || !docs.total_documents) {
        return '<p class="text-slate-400 text-xs py-2">No documents uploaded yet.</p>';
    }
    var scoreColor = docs.avg_score >= 60 ? 'text-emerald-600 border-l-emerald-500' : docs.avg_score >= 40 ? 'text-amber-500 border-l-amber-500' : 'text-rose-500 border-l-rose-500';
    var html = '<div class="flex flex-wrap gap-3 mb-4">' +
        '<div class="text-center px-5 py-3 bg-slate-50/80 rounded-xl border-l-4 border-l-blue-500">' +
        '<div class="text-2xl font-bold text-blue-600">' + (docs.total_documents || 0) + '</div>' +
        '<div class="text-xs text-slate-500 mt-0.5">Total Documents</div></div>' +

        '<div class="text-center px-5 py-3 bg-slate-50/80 rounded-xl border-l-4 border-l-emerald-500">' +
        '<div class="text-2xl font-bold text-emerald-600">' + (docs.documents_7d || 0) + '</div>' +
        '<div class="text-xs text-slate-500 mt-0.5">Uploads (7d)</div></div>' +

        '<div class="text-center px-5 py-3 bg-slate-50/80 rounded-xl border-l-4 ' + scoreColor + '">' +
        '<div class="text-2xl font-bold">' + (docs.avg_score || 0) + '%</div>' +
        '<div class="text-xs text-slate-500 mt-0.5">Avg AI Score</div></div>' +
        '</div>';

    if (docs.low_score_docs && docs.low_score_docs.length) {
        html += '<div class="mt-3">' +
            '<div class="text-xs font-semibold text-rose-700 mb-2 flex items-center gap-1">' + icon('alert-triangle', 12) + ' Low Quality Documents (Score &lt; 40%)</div>' +
            '<div class="bg-slate-50 rounded-lg overflow-hidden"><table class="w-full text-xs">' +
            '<thead><tr class="border-b border-slate-200"><th class="px-3 py-2 text-left font-semibold text-slate-500">Filename</th><th class="px-3 py-2 text-left font-semibold text-slate-500">Type</th><th class="px-3 py-2 text-left font-semibold text-slate-500">Score</th><th class="px-3 py-2 text-left font-semibold text-slate-500">Uploaded</th></tr></thead><tbody class="divide-y divide-slate-100">';
        docs.low_score_docs.forEach(function(d) {
            html += '<tr class="hover:bg-white transition-colors">' +
                '<td class="px-3 py-2 text-slate-700">' + esc(d.filename || '--') + '</td>' +
                '<td class="px-3 py-2">' + statusBadge(esc(d.type || 'general'), 'gray') + '</td>' +
                '<td class="px-3 py-2 text-rose-500 font-semibold">' + (d.score || 0) + '%</td>' +
                '<td class="px-3 py-2 text-slate-400">' + (d.uploaded ? new Date(d.uploaded).toLocaleDateString() : '--') + '</td></tr>';
        });
        html += '</tbody></table></div></div>';
    }
    return html;
}

async function loadAdminStats() {
    if (S._adminLoading) return;
    S._adminLoading = true;
    var res = await api('GET', '/api/admin/stats');
    S._adminLoading = false;
    if (!res || !res.stats) return;
    S.adminStats = res.stats;
    var stats = S.adminStats;

    // Refresh stat cards
    var sc = document.getElementById('admin-stat-cards');
    if (sc) {
        sc.innerHTML =
            renderStatCard('users', 'Total Users', stats.total_users || 0, 'blue') +
            renderStatCard('building-2', 'Organizations', stats.total_organizations || 0, 'green') +
            renderStatCard('badge-check', 'Verified Orgs', stats.verified_organizations || 0, 'green') +
            renderStatCard('coins', 'Total Grants', stats.total_grants || 0, 'amber') +
            renderStatCard('file-text', 'Applications', stats.total_applications || 0, 'purple') +
            renderStatCard('alert-triangle', 'Flagged Checks', stats.flagged_compliance || 0, 'red');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // Refresh breakdowns
    var ur = document.getElementById('admin-users-by-role');
    if (ur) ur.innerHTML = renderAdminRoleBreakdown(stats.users_by_role || {});
    var ob = document.getElementById('admin-orgs-by-type');
    if (ob) ob.innerHTML = renderAdminOrgBreakdown(stats.orgs_by_type || {});
    var as2 = document.getElementById('admin-apps-by-status');
    if (as2) as2.innerHTML = renderAdminStatusBreakdown(stats.apps_by_status || {});

    // Recent users table
    var ru = document.getElementById('admin-recent-users');
    if (ru && stats.recent_users) {
        var html = '<div class="bg-white rounded-xl border border-slate-200/60 overflow-hidden"><table class="w-full">' +
            '<thead><tr class="bg-slate-50 border-b border-slate-200">' +
            '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>' +
            '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>' +
            '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>' +
            '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>' +
            '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</th>' +
            '</tr></thead><tbody class="divide-y divide-slate-100">';
        stats.recent_users.forEach(function(u) {
            var roleBadge = statusBadge(u.role.toUpperCase(), u.role === 'admin' ? 'red' : u.role === 'donor' ? 'blue' : u.role === 'reviewer' ? 'amber' : 'green');
            html += '<tr class="hover:bg-slate-50/80 transition-colors">' +
                '<td class="px-4 py-3.5 text-sm font-medium text-slate-900">' + esc(u.name) + '</td>' +
                '<td class="px-4 py-3.5 text-sm text-slate-600">' + esc(u.email) + '</td>' +
                '<td class="px-4 py-3.5">' + roleBadge + '</td>' +
                '<td class="px-4 py-3.5">' + (u.is_active ? statusBadge('Active', 'green') : statusBadge('Inactive', 'red')) + '</td>' +
                '<td class="px-4 py-3.5 text-xs text-slate-400">' + (u.created_at ? new Date(u.created_at).toLocaleDateString() : '--') + '</td>' +
                '</tr>';
        });
        html += '</tbody></table></div>';
        ru.innerHTML = html;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // Refresh alerts banner
    var alertsEl = document.getElementById('admin-alerts');
    if (alertsEl) alertsEl.innerHTML = renderAlertBanner(stats.alerts || []);

    // Refresh security metrics
    var secEl = document.getElementById('admin-security-metrics');
    if (secEl) secEl.innerHTML = renderSecurityMetrics(stats.security || {});

    // Refresh document metrics
    var docEl = document.getElementById('admin-document-metrics');
    if (docEl) docEl.innerHTML = renderDocumentMetrics(stats.documents || {});
}


// =============================================================================
// 14. Dashboard Data Loading
// =============================================================================

async function loadDashboardStats() {
    if (S._dashboardLoading) return;
    S._dashboardLoading = true;
    var res = await api('GET', '/api/dashboard/stats');
    S._dashboardLoading = false;
    if (!res) return;
    // Flatten: API returns {role, stats:{...}} — merge stats to top level
    S.dashboardStats = Object.assign({}, res.stats || {}, {role: res.role});
    var stats = S.dashboardStats;

    // Refresh stat cards in-place (they were rendered with stale/empty data)
    var role = (S.user.role || '').toLowerCase();
    if (role === 'ngo') {
        var sc = document.getElementById('ngo-stat-cards');
        if (sc) {
            var score = stats.average_score || 0;
            sc.innerHTML = renderStatCard('bar-chart-3', 'Assessment Score', score + '%', 'green') +
                renderStatCard('file-text', 'Active Applications', stats.total_applications || 0, 'blue') +
                renderStatCard('coins', 'Grants Available', stats.open_grants || 0, 'amber') +
                renderStatCard('folder-open', 'Documents Uploaded', stats.documents || 0, 'purple');
            // Update capacity badge too
            var cap = capacityLabel(score);
            var ringEl = document.querySelector('.score-ring-container');
            if (ringEl) ringEl.parentElement.parentElement.innerHTML =
                '<div class="flex flex-col sm:flex-row items-center gap-6 p-6">' +
                scoreRingHTML(score, 80, '%') +
                '<div class="flex-1 text-center sm:text-left"><h3 class="text-lg font-semibold text-slate-900">' + T('assessment.org_capacity') + '</h3>' +
                '<p class="text-sm text-slate-500 mt-1">Your current capacity level: ' +
                statusBadge(cap.label, cap.color) + '</p></div>' +
                '<div class="shrink-0"><button class="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="nav(\'assessment\')">' + icon('arrow-right', 16) + ' ' + T('assessment.view_assessment') + '</button></div></div>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    } else if (role === 'donor') {
        var dc = document.getElementById('donor-stat-cards');
        if (dc) {
            dc.innerHTML = renderStatCard('coins', 'Total Grants', stats.total_grants || 0, 'green') +
                renderStatCard('file-text', 'Total Applications', stats.total_applications || 0, 'blue') +
                renderStatCard('star', 'Pending Review', stats.pending_review || 0, 'amber') +
                renderStatCard('trophy', 'Total Awarded', formatCurrency(stats.total_funding_awarded || 0), 'red') +
                renderStatCard('bar-chart-2', 'Reports to Review', stats.pending_report_reviews || 0, 'purple');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    } else if (role === 'reviewer') {
        var rc = document.getElementById('reviewer-stat-cards');
        if (rc) {
            rc.innerHTML = renderStatCard('file-text', 'Assigned Reviews', stats.assigned_reviews || 0, 'blue') +
                renderStatCard('clock', 'In Progress', stats.in_progress_reviews || 0, 'amber') +
                renderStatCard('check-circle-2', 'Completed', stats.completed_reviews || 0, 'green') +
                renderStatCard('trending-up', 'Avg Score Given', (stats.average_score_given || 0) + '%', 'purple');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    if (role === 'ngo') {
        // Load recommended grants
        var gRes = await api('GET', '/api/grants/?status=open');
        if (gRes && gRes.grants) {
            var html = gRes.grants.slice(0, 3).map(function(g) { return renderGrantCard(g); }).join('');
            var el = document.getElementById('recommended-grants');
            if (el) { el.innerHTML = html || '<p class="text-slate-400 text-sm py-4 text-center">No grants available at this time.</p>'; if (typeof lucide !== 'undefined') lucide.createIcons(); }
        }
        // Load recent applications
        var aRes = await api('GET', '/api/applications/');
        if (aRes && aRes.applications) {
            S.applications = aRes.applications;
            var el2 = document.getElementById('recent-applications');
            if (el2) el2.innerHTML = renderApplicationsTable(aRes.applications.slice(0, 5));
        }
        // Load upcoming reports
        loadUpcomingReports();
    } else if (role === 'donor') {
        // Load donor grants
        var gRes2 = await api('GET', '/api/grants/');
        if (gRes2 && gRes2.grants) {
            S.grants = gRes2.grants;
            var activeGrants = gRes2.grants.filter(function(g) { return g.status !== 'closed'; });
            var el3 = document.getElementById('active-grants');
            if (el3) { el3.innerHTML = activeGrants.slice(0, 6).map(function(g) { return renderDonorGrantCard(g); }).join('') ||
                '<p class="text-slate-400 text-sm py-4 text-center">No active grants.</p>'; if (typeof lucide !== 'undefined') lucide.createIcons(); }
        }
        // Load recent applications
        var aRes2 = await api('GET', '/api/applications/');
        if (aRes2 && aRes2.applications) {
            S.applications = aRes2.applications;
            var el4 = document.getElementById('donor-recent-apps');
            if (el4) el4.innerHTML = renderDonorApplicationsTable(aRes2.applications.slice(0, 5));
        }
    } else if (role === 'reviewer') {
        // Load reviewer assignments
        var rRes = await api('GET', '/api/reviews/');
        if (rRes && rRes.reviews) {
            S.reviews = rRes.reviews;
            var el5 = document.getElementById('reviewer-assignments');
            if (el5) el5.innerHTML = renderReviewsTable(rRes.reviews.filter(function(r) { return r.status !== 'completed'; }));
        }
    }
}

// =============================================================================
// 15. Stat Card Component
// =============================================================================

function renderStatCard(iconName, label, value, color) {
    var colorMap = {
        green:  { bg: 'bg-emerald-50',  text: 'text-emerald-600', icon: 'text-emerald-500' },
        blue:   { bg: 'bg-blue-50',     text: 'text-blue-600',    icon: 'text-blue-500' },
        amber:  { bg: 'bg-amber-50',    text: 'text-amber-600',   icon: 'text-amber-500' },
        red:    { bg: 'bg-rose-50',      text: 'text-rose-600',    icon: 'text-rose-500' },
        purple: { bg: 'bg-violet-50',   text: 'text-violet-600',  icon: 'text-violet-500' },
        brand:  { bg: 'bg-brand-50',    text: 'text-brand-600',   icon: 'text-brand-500' }
    };
    var c = colorMap[color] || colorMap.green;
    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5 hover:shadow-md transition-all duration-200">' +
        '<div class="flex items-center gap-4">' +
        '<div class="w-12 h-12 rounded-xl ' + c.bg + ' flex items-center justify-center shrink-0">' +
        icon(iconName, 22, c.icon) +
        '</div>' +
        '<div class="min-w-0">' +
        '<div class="text-2xl font-bold text-slate-900 truncate">' + esc(String(value)) + '</div>' +
        '<div class="text-sm text-slate-500 truncate">' + esc(label) + '</div>' +
        '</div>' +
        '</div>' +
        '</div>';
}

function renderLoadingCards(count) {
    var html = '';
    for (var i = 0; i < count; i++) {
        html += '<div class="bg-white rounded-xl border border-slate-200/60 p-5" aria-busy="true">' +
            '<div class="flex items-center gap-4">' +
            '<div class="w-12 h-12 rounded-xl skeleton shrink-0"></div>' +
            '<div class="flex-1 space-y-2">' +
            '<div class="h-6 w-20 skeleton"></div>' +
            '<div class="h-4 w-32 skeleton"></div>' +
            '</div></div></div>';
    }
    return html;
}

function renderLoadingTable() {
    return '<div class="bg-white rounded-xl border border-slate-200/60 overflow-hidden" aria-busy="true">' +
        '<div class="p-4 space-y-3">' +
        '<div class="h-8 skeleton w-full"></div>' +
        '<div class="h-6 skeleton w-full"></div>' +
        '<div class="h-6 skeleton w-5/6"></div>' +
        '<div class="h-6 skeleton w-4/6"></div>' +
        '<div class="h-6 skeleton w-5/6"></div>' +
        '</div></div>';
}

// =============================================================================
// 16. Grant Card Components
// =============================================================================

function renderGrantCard(g) {
    var deadline = timeUntil(g.deadline);
    var isExpired = deadline === 'Expired';
    var sectors = (g.sectors || []).map(function(s) {
        return '<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full">' + sectorIcon(s) + ' ' + esc(s) + '</span>';
    }).join(' ');

    var appStatusBdg = '';
    var applyBtn = '';
    if (g.user_application_status) {
        var ast = g.user_application_status;
        appStatusBdg = statusBadge(ast.charAt(0).toUpperCase() + ast.slice(1), ast === 'submitted' ? 'blue' : ast === 'awarded' ? 'green' : ast === 'draft' ? 'amber' : ast === 'rejected' ? 'red' : 'blue');
        if (ast === 'draft') {
            applyBtn = '<button class="px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors" onclick="event.stopPropagation();safeStartApply(' + g.id + ')">' + T('apply.continue_draft') + '</button>';
        } else {
            applyBtn = '<button class="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors" onclick="event.stopPropagation();viewGrant(' + g.id + ')">' + T('common.view') + '</button>';
        }
    } else {
        applyBtn = '<button class="px-3 py-1.5 ' + (isExpired ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-brand-600 text-white hover:bg-brand-700') + ' text-xs font-medium rounded-lg transition-colors" onclick="event.stopPropagation();' +
            (isExpired ? 'showToast(\'Deadline has passed\',\'warning\')' : 'safeStartApply(' + g.id + ')') +
            '">' + (isExpired ? T('grant.deadline_passed') : T('grant.apply_now')) + '</button>';
    }

    return '<div class="bg-white rounded-xl border border-slate-200/60 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group" onclick="viewGrant(' + g.id + ')">' +
        '<div class="h-1 bg-gradient-to-r from-brand-500 to-brand-400"></div>' +
        '<div class="p-5">' +
        '<div class="flex justify-between items-start gap-2">' +
        '<h3 class="text-sm font-semibold text-slate-900 group-hover:text-brand-600 transition-colors line-clamp-2">' + esc(g.title) + '</h3>' +
        '<div class="flex gap-1.5 shrink-0">' +
        (g.match_score ? statusBadge(g.match_score + '% Match', 'green') : '') +
        appStatusBdg +
        '</div></div>' +
        '<p class="text-xs text-slate-500 mt-1">' + esc(g.donor_name || g.organization_name || '') + '</p>' +
        '<div class="text-lg font-bold text-brand-600 mt-3">' + formatCurrency(g.total_funding, g.currency) + '</div>' +
        '<div class="flex items-center gap-4 mt-3 text-xs text-slate-500">' +
        '<span class="inline-flex items-center gap-1">' + icon('calendar', 12) + ' <span class="' + (isExpired ? 'text-rose-500 font-medium' : '') + '">' + esc(deadline) + '</span></span>' +
        '<span class="inline-flex items-center gap-1">' + icon('globe', 12) + ' ' + esc((g.countries || []).join(', ') || 'Global') + '</span>' +
        '</div>' +
        '<div class="flex flex-wrap gap-1.5 mt-3">' + sectors + '</div>' +
        '</div>' +
        '<div class="px-5 py-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">' +
        statusBadge(g.status || 'open') +
        applyBtn +
        '</div></div>';
}

function renderDonorGrantCard(g) {
    return '<div class="bg-white rounded-xl border border-slate-200/60 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group" onclick="viewGrant(' + g.id + ')">' +
        '<div class="h-1 bg-gradient-to-r from-emerald-500 to-emerald-400"></div>' +
        '<div class="p-5">' +
        '<div class="flex justify-between items-start gap-2">' +
        '<h3 class="text-sm font-semibold text-slate-900 group-hover:text-brand-600 transition-colors line-clamp-2 flex-1">' + esc(g.title) + '</h3>' +
        statusBadge(g.status || 'draft') +
        '</div>' +
        '<div class="text-lg font-bold text-brand-600 mt-2">' + formatCurrency(g.total_funding, g.currency) + '</div>' +
        '<div class="flex items-center gap-4 mt-3 text-xs text-slate-500">' +
        '<span class="inline-flex items-center gap-1">' + icon('calendar', 12) + ' ' + esc(timeUntil(g.deadline)) + '</span>' +
        '<span class="inline-flex items-center gap-1">' + icon('file-text', 12) + ' ' + (g.application_count || 0) + ' applications</span>' +
        '</div></div></div>';
}

// =============================================================================
// 17. Table Components
// =============================================================================

function renderApplicationsTable(apps) {
    if (!apps || !apps.length) {
        return '<div class="bg-white rounded-xl border border-slate-200/60 p-8 text-center">' +
            '<div class="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">' + icon('file-text', 22, 'text-slate-400') + '</div>' +
            '<p class="text-sm text-slate-500">' + T('application.no_applications') + '</p>' +
            '<button class="mt-3 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors" onclick="nav(\'grants\')">' + T('dashboard.action.browse_grants') + '</button>' +
            '</div>';
    }
    return '<div class="bg-white rounded-xl border border-slate-200/60 overflow-hidden overflow-x-auto"><table class="w-full">' +
        '<thead><tr class="bg-slate-50 border-b border-slate-200">' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('application.grant') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('application.donor') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('application.tab.status') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('application.ai_score') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('application.submitted_at') + '</th>' +
        '<th class="px-4 py-3"></th>' +
        '</tr></thead><tbody class="divide-y divide-slate-100">' +
        apps.map(function(a) {
            var scoreColor = a.ai_score >= 70 ? 'text-emerald-600' : a.ai_score >= 50 ? 'text-amber-500' : 'text-rose-500';
            return '<tr class="hover:bg-slate-50/80 transition-colors cursor-pointer" onclick="viewApplication(' + a.id + ')">' +
                '<td class="px-4 py-3.5 text-sm font-medium text-slate-900">' + esc(a.grant_title || a.grant_name || 'Grant #' + a.grant_id) + '</td>' +
                '<td class="px-4 py-3.5 text-sm text-slate-600">' + esc(a.donor_name || '') + '</td>' +
                '<td class="px-4 py-3.5">' + statusBadge(a.status) + '</td>' +
                '<td class="px-4 py-3.5">' + (a.ai_score != null ? '<span class="font-semibold ' + scoreColor + '">' + a.ai_score + '%</span>' : '<span class="text-slate-300">-</span>') + '</td>' +
                '<td class="px-4 py-3.5 text-xs text-slate-500">' + formatDate(a.submitted_at || a.created_at) + '</td>' +
                '<td class="px-4 py-3.5"><button class="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors" onclick="event.stopPropagation();viewApplication(' + a.id + ')">' + T('common.view') + '</button></td>' +
                '</tr>';
        }).join('') +
        '</tbody></table></div>';
}

function renderDonorApplicationsTable(apps) {
    if (!apps || !apps.length) {
        return '<div class="bg-white rounded-xl border border-slate-200/60 p-8 text-center"><p class="text-sm text-slate-400">No applications received yet.</p></div>';
    }
    return '<div class="bg-white rounded-xl border border-slate-200/60 overflow-hidden overflow-x-auto"><table class="w-full">' +
        '<thead><tr class="bg-slate-50 border-b border-slate-200">' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('ranking.applicant') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('report.grant') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('application.tab.status') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('application.ai_score') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('application.submitted') + '</th>' +
        '<th class="px-4 py-3"></th>' +
        '</tr></thead><tbody class="divide-y divide-slate-100">' +
        apps.map(function(a) {
            return '<tr class="hover:bg-slate-50/80 transition-colors cursor-pointer" onclick="viewApplication(' + a.id + ')">' +
                '<td class="px-4 py-3.5 text-sm font-medium text-slate-900">' + esc(a.org_name || a.applicant_name || '') + '</td>' +
                '<td class="px-4 py-3.5 text-sm text-slate-600">' + esc(a.grant_title || '') + '</td>' +
                '<td class="px-4 py-3.5">' + statusBadge(a.status) + '</td>' +
                '<td class="px-4 py-3.5 text-sm">' + (a.ai_score != null ? '<span class="font-semibold">' + a.ai_score + '%</span>' : '<span class="text-slate-300">-</span>') + '</td>' +
                '<td class="px-4 py-3.5 text-xs text-slate-500">' + formatDate(a.submitted_at || a.created_at) + '</td>' +
                '<td class="px-4 py-3.5"><button class="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors" onclick="event.stopPropagation();viewApplication(' + a.id + ')">' + T('common.view') + '</button></td>' +
                '</tr>';
        }).join('') +
        '</tbody></table></div>';
}

function renderReviewsTable(reviews) {
    if (!reviews || !reviews.length) {
        return '<div class="bg-white rounded-xl border border-slate-200/60 p-8 text-center"><p class="text-sm text-slate-400">No assignments pending.</p></div>';
    }
    return '<div class="bg-white rounded-xl border border-slate-200/60 overflow-hidden overflow-x-auto"><table class="w-full">' +
        '<thead><tr class="bg-slate-50 border-b border-slate-200">' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('nav.all_applications') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('report.grant') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('application.tab.status') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('common.due_date') + '</th>' +
        '<th class="px-4 py-3"></th>' +
        '</tr></thead><tbody class="divide-y divide-slate-100">' +
        reviews.map(function(r) {
            return '<tr class="hover:bg-slate-50/80 transition-colors cursor-pointer" onclick="openReview(' + r.id + ')">' +
                '<td class="px-4 py-3.5 text-sm font-medium text-slate-900">' + esc(r.org_name || r.application_name || 'Application #' + r.application_id) + '</td>' +
                '<td class="px-4 py-3.5 text-sm text-slate-600">' + esc(r.grant_title || '') + '</td>' +
                '<td class="px-4 py-3.5">' + statusBadge(r.status) + '</td>' +
                '<td class="px-4 py-3.5 text-xs text-slate-500">' + formatDate(r.due_date) + '</td>' +
                '<td class="px-4 py-3.5"><button class="px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors" onclick="event.stopPropagation();openReview(' + r.id + ')">Review</button></td>' +
                '</tr>';
        }).join('') +
        '</tbody></table></div>';
}

// =============================================================================
// 18. Browse Grants
// =============================================================================

function renderBrowseGrants() {
    loadGrants();
    var sectors = ['Health', 'Education', 'Climate', 'Protection', 'Nutrition', 'WASH', 'Livelihoods', 'Governance', 'Agriculture'];
    var countries = ['Somalia', 'Kenya', 'Ethiopia', 'Uganda', 'South Sudan', 'Global'];

    var filtered = filterGrants();

    return '<div class="mb-8 animate-fade-in">' +
        '<h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('coins', 24, 'text-brand-500') + ' ' + T('grant.browse_title') + '</h1>' +
        '<p class="text-slate-500 mt-1">Find grants that match your organization\'s mission and capabilities.</p>' +
        '</div>' +

        // Filter bar
        '<div class="bg-white rounded-xl border border-slate-200/60 p-4 mb-6">' +
        '<div class="flex flex-col sm:flex-row gap-3 items-end">' +
        '<div class="flex-1 min-w-[200px]">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + icon('search', 12, 'inline') + ' ' + T('common.search') + '</label>' +
        '<input type="text" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" placeholder="' + T('grant.search_placeholder') + '" value="' + esc(S.grantFilters.search) + '" oninput="S.grantFilters.search=this.value;renderGrantsList();">' +
        '</div>' +
        '<div class="min-w-[150px]">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.detail.sectors') + '</label>' +
        '<select class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors bg-white" onchange="S.grantFilters.sector=this.value;renderGrantsList();">' +
        '<option value="">' + T('grant.filter_sector') + '</option>' +
        sectors.map(function(s) { return '<option value="' + s.toLowerCase() + '"' + (S.grantFilters.sector === s.toLowerCase() ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="min-w-[150px]">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.detail.countries') + '</label>' +
        '<select class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors bg-white" onchange="S.grantFilters.country=this.value;renderGrantsList();">' +
        '<option value="">' + T('grant.filter_country') + '</option>' +
        countries.map(function(c) { return '<option value="' + c + '"' + (S.grantFilters.country === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
        '</select></div>' +
        '</div></div>' +

        '<div id="grants-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">' +
        (filtered.length ? filtered.map(function(g) { return renderGrantCard(g); }).join('') :
            '<div class="col-span-full text-center py-12">' +
            '<div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">' + icon('search', 24, 'text-slate-400') + '</div>' +
            '<p class="text-sm text-slate-500">' + T('grant.no_grants') + '</p></div>') +
        '</div>';
}

function filterGrants() {
    return S.grants.filter(function(g) {
        if (S.grantFilters.search) {
            var q = S.grantFilters.search.toLowerCase();
            if (!(g.title || '').toLowerCase().includes(q) &&
                !(g.description || '').toLowerCase().includes(q)) return false;
        }
        if (S.grantFilters.sector) {
            if (!(g.sectors || []).some(function(s) { return s.toLowerCase() === S.grantFilters.sector; })) return false;
        }
        if (S.grantFilters.country) {
            if (!(g.countries || []).some(function(c) { return c === S.grantFilters.country; })) return false;
        }
        return true;
    });
}

function renderGrantsList() {
    var el = document.getElementById('grants-list');
    if (!el) return;
    var filtered = filterGrants();
    el.innerHTML = filtered.length ? filtered.map(function(g) { return renderGrantCard(g); }).join('') :
        '<div class="col-span-full text-center py-12">' +
        '<div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">' + icon('search', 24, 'text-slate-400') + '</div>' +
        '<p class="text-sm text-slate-500">' + T('grant.no_grants') + '</p></div>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function loadGrants() {
    if (S._grantsLoading) return;
    S._grantsLoading = true;
    var params = [];
    if (S.grantFilters.status) params.push('status=' + S.grantFilters.status);
    if (S.grantFilters.sector) params.push('sector=' + S.grantFilters.sector);
    if (S.grantFilters.country) params.push('country=' + S.grantFilters.country);
    var url = '/api/grants/' + (params.length ? '?' + params.join('&') : '');
    var res = await api('GET', url);
    S._grantsLoading = false;
    if (res && res.grants) {
        S.grants = res.grants;
        renderGrantsList();
    }
}

// =============================================================================
// 19. My Grants (Donor)
// =============================================================================

function renderMyGrants() {
    loadMyGrants();
    return '<div class="mb-8 animate-fade-in">' +
        '<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">' +
        '<h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('coins', 24, 'text-brand-500') + ' ' + T('grant.my_grants') + '</h1>' +
        '<button class="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="nav(\'creategrant\')">' + icon('plus', 16) + ' ' + T('dashboard.action.create_grant') + '</button>' +
        '</div></div>' +
        '<div id="my-grants-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">' + renderLoadingCards(3) + '</div>';
}

async function loadMyGrants(retryCount) {
    retryCount = retryCount || 0;
    var res = await api('GET', '/api/grants/');
    if (res && res.grants) {
        S.grants = res.grants;
        // After a publish, retry once if list might be stale (DB propagation)
        if (S._justPublished && retryCount === 0) {
            S._justPublished = false;
            // If the list came back, render it immediately then do a background refresh
            _renderMyGrantsList();
            setTimeout(function() { loadMyGrants(1); }, 800);
            return;
        }
        S._justPublished = false;
        _renderMyGrantsList();
    }
}

function _renderMyGrantsList() {
    var el = document.getElementById('my-grants-list');
    if (el) {
        el.innerHTML = S.grants.length ?
            S.grants.map(function(g) { return renderDonorGrantCard(g); }).join('') :
            '<div class="col-span-full text-center py-12">' +
            '<div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">' + icon('coins', 24, 'text-slate-400') + '</div>' +
            '<p class="text-sm text-slate-500 mb-3">No grants created yet.</p>' +
            '<button class="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors" onclick="nav(\'creategrant\')">' + T('grant.create_first') + '</button></div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

// =============================================================================
// 20. Grant Detail
// =============================================================================

function renderGrantDetail() {
    if (!S.selectedGrant) return '<p>' + T('common.loading') + '</p>';
    var g = S.selectedGrant;
    var role = (S.user.role || '').toLowerCase();
    var tab = S.grantDetailTab || 'overview';

    var tabs = [
        { key: 'overview', label: T('grant.tab.overview') },
        { key: 'eligibility', label: T('grant.detail.eligibility') },
        { key: 'criteria', label: T('grant.detail.evaluation_criteria') },
        { key: 'documents', label: T('grant.tab.documents') }
    ];
    if (role === 'donor') {
        tabs.push({ key: 'applicants', label: T('grant.tab.applications') });
    }

    var tabContent = '';
    switch (tab) {
        case 'overview': tabContent = renderGrantOverview(g); break;
        case 'eligibility': tabContent = renderGrantEligibility(g); break;
        case 'criteria': tabContent = renderGrantCriteria(g); break;
        case 'documents': tabContent = renderGrantDocuments(g); break;
        case 'applicants': tabContent = renderGrantApplicants(g); break;
        default: tabContent = renderGrantOverview(g);
    }

    return '<button class="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-4 transition-colors" onclick="nav(\'grants\')">' + icon('arrow-left', 16) + ' ' + T('common.back') + '</button>' +

        '<div class="bg-white rounded-xl border border-slate-200/60 p-6 mb-6">' +
        '<div class="flex flex-col sm:flex-row justify-between items-start gap-4">' +
        '<div class="flex-1">' +
        '<h1 class="text-xl font-bold text-slate-900">' + esc(g.title) + '</h1>' +
        '<p class="text-sm text-slate-500 mt-1">' + esc(g.donor_name || g.organization_name || '') + '</p>' +
        '</div>' +
        '<div class="text-right shrink-0">' +
        '<div class="text-2xl font-bold text-brand-600">' + formatCurrency(g.total_funding, g.currency) + '</div>' +
        '<div class="mt-1">' + statusBadge(g.status) + '</div>' +
        '</div></div>' +
        '<div class="flex flex-wrap gap-4 mt-4 text-sm text-slate-500">' +
        '<span class="inline-flex items-center gap-1">' + icon('calendar', 14) + ' ' + T('grant.deadline') + ': ' + formatDate(g.deadline) + ' (' + timeUntil(g.deadline) + ')</span>' +
        '<span class="inline-flex items-center gap-1">' + icon('globe', 14) + ' ' + esc((g.countries || []).join(', ') || 'Global') + '</span>' +
        '</div></div>' +

        // Tabs
        '<div class="flex gap-1 mb-6 border-b-2 border-slate-200">' +
        tabs.map(function(t) {
            var active = tab === t.key;
            return '<button class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-[2px] transition-colors ' +
                (active ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700') + '" ' +
                'onclick="S.grantDetailTab=\'' + t.key + '\';render();">' + esc(t.label) + '</button>';
        }).join('') +
        '</div>' +

        tabContent +

        '<div class="mt-6 flex gap-3">' +
        (role === 'ngo' && g.status !== 'closed' && timeUntil(g.deadline) !== 'Expired' ?
            '<button class="px-6 py-3 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="safeStartApply(' + g.id + ')">' + icon('send', 16) + ' ' + T('grant.apply_now') + '</button>' : '') +
        (role === 'donor' ? '<button class="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="editGrant(' + g.id + ')">' + icon('pencil', 16) + ' ' + T('common.edit') + '</button>' : '') +
        '</div>';
}

function renderGrantOverview(g) {
    var sectors = (g.sectors || []).map(function(s) {
        return '<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full">' + sectorIcon(s) + ' ' + esc(s) + '</span>';
    }).join(' ');
    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="font-semibold text-slate-900 mb-3">' + T('grant.detail.description') + '</h3>' +
        '<p class="text-slate-600 leading-relaxed whitespace-pre-wrap text-sm">' + esc(g.description || T('common.no_data')) + '</p>' +
        (sectors ? '<div class="mt-4 flex flex-wrap items-center gap-2"><span class="text-sm font-medium text-slate-700">' + T('grant.detail.sectors') + ':</span> ' + sectors + '</div>' : '') +
        '<div class="mt-3 text-sm"><span class="font-medium text-slate-700">' + T('grant.detail.countries') + ':</span> <span class="text-slate-600">' + esc((g.countries || []).join(', ') || 'Global') + '</span></div>' +
        '</div>';
}

function renderGrantEligibility(g) {
    var reqs = g.eligibility || [];
    if (!reqs.length) return '<div class="bg-white rounded-xl border border-slate-200/60 p-8 text-center"><p class="text-sm text-slate-400">No eligibility requirements specified.</p></div>';
    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="font-semibold text-slate-900 mb-4">' + T('grant.detail.eligibility') + '</h3>' +
        '<div class="divide-y divide-slate-100">' +
        reqs.map(function(req) {
            var passed = req.met || req.passed;
            var reqIcon = passed ? icon('check-circle-2', 18, 'text-emerald-500') : (passed === false ? icon('x-circle', 18, 'text-rose-500') : icon('circle', 18, 'text-slate-300'));
            return '<div class="flex items-start gap-3 py-3">' +
                '<div class="shrink-0 mt-0.5">' + reqIcon + '</div>' +
                '<div class="flex-1">' +
                '<div class="text-sm font-medium text-slate-900">' + esc(req.category || req.name || req.label || 'Requirement') + '</div>' +
                '<div class="text-xs text-slate-500 mt-0.5">' + esc(req.description || req.details || '') + '</div>' +
                (req.required ? '<span class="mt-1 inline-block">' + statusBadge(T('grant.create.required'), 'red') + '</span>' : '') +
                '</div></div>';
        }).join('') +
        '</div></div>';
}

function renderGrantCriteria(g) {
    var criteria = g.criteria || [];
    if (!criteria.length) return '<div class="bg-white rounded-xl border border-slate-200/60 p-8 text-center"><p class="text-sm text-slate-400">No scoring criteria defined.</p></div>';
    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="font-semibold text-slate-900 mb-4">' + T('grant.detail.evaluation_criteria') + '</h3>' +
        '<div class="space-y-3">' +
        criteria.map(function(c, i) {
            return '<div class="p-4 border border-slate-200 rounded-xl">' +
                '<div class="flex justify-between items-center">' +
                '<h4 class="font-semibold text-slate-900 text-sm">' + (i + 1) + '. ' + esc(c.label || c.name) + '</h4>' +
                statusBadge(T('grant.create.weight') + ': ' + (c.weight || 0) + '%', 'blue') +
                '</div>' +
                '<p class="text-xs text-slate-500 mt-2">' + esc(c.description || '') + '</p>' +
                (c.instructions ? '<div class="bg-blue-50 p-3 rounded-lg mt-2 text-xs"><span class="font-semibold text-blue-800">Instructions:</span> <span class="text-blue-700">' + esc(c.instructions) + '</span></div>' : '') +
                (c.example ? '<details class="mt-2"><summary class="cursor-pointer text-xs text-brand-600 font-medium hover:text-brand-700">' + T('grant.create.view_example_response') + '</summary>' +
                    '<div class="bg-slate-50 p-3 rounded-lg mt-2 text-xs text-slate-600">' + esc(c.example) + '</div></details>' : '') +
                (c.max_words ? '<div class="text-xs text-slate-400 mt-2">Maximum ' + c.max_words + ' words</div>' : '') +
                '</div>';
        }).join('') +
        '</div></div>';
}

function renderGrantDocuments(g) {
    var docs = g.doc_requirements || [];
    if (!docs.length) return '<div class="bg-white rounded-xl border border-slate-200/60 p-8 text-center"><p class="text-sm text-slate-400">No document requirements specified.</p></div>';
    var docIconMap = { financial_report: 'bar-chart-3', registration: 'scroll', audit: 'search', psea: 'shield-check', project_report: 'file-text', budget: 'banknote', cv: 'user', strategic_plan: 'clipboard-list' };
    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="font-semibold text-slate-900 mb-4">' + T('grant.detail.doc_requirements') + '</h3>' +
        '<div class="divide-y divide-slate-100">' +
        docs.map(function(d) {
            var dIcon = docIconMap[d.type] || 'file-text';
            return '<div class="flex items-center gap-3 py-3">' +
                '<div class="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">' + icon(dIcon, 18, 'text-brand-500') + '</div>' +
                '<div class="flex-1">' +
                '<div class="text-sm font-medium text-slate-900">' + esc(d.name || d.type || 'Document') + '</div>' +
                '<div class="text-xs text-slate-500 mt-0.5">' + esc(d.description || d.requirements || '') + '</div>' +
                '</div>' +
                (d.required !== false ? statusBadge(T('grant.create.required'), 'red') : statusBadge(T('grant.create.optional'), 'gray')) +
                '</div>';
        }).join('') +
        '</div></div>';
}

function renderGrantApplicants(g) {
    return '<div id="grant-applicants">' + renderLoadingTable() + '</div>' +
        '<script>loadGrantApplicants(' + g.id + ')<\/script>';
}

async function loadGrantApplicants(grantId) {
    var res = await api('GET', '/api/applications/?grant_id=' + grantId);
    var el = document.getElementById('grant-applicants');
    if (!el) return;
    if (res && res.applications && res.applications.length) {
        el.innerHTML = renderDonorApplicationsTable(res.applications);
    } else {
        el.innerHTML = '<div class="bg-white rounded-xl border border-slate-200/60 p-8 text-center"><p class="text-sm text-slate-400">No applications received yet.</p></div>';
    }
}

async function viewGrant(id) {
    var res = await api('GET', '/api/grants/' + id);
    if (res) {
        S.selectedGrant = res.grant || res;
        S.grantDetailTab = 'overview';
        nav('grantdetail');
    }
}

async function editGrant(id) {
    var res = await api('GET', '/api/grants/' + id);
    if (res) {
        var g = res.grant || res;
        S.createStep = 1;
        newTelemetrySession();
        S.createData = {
            id: g.id,
            title: g.title || '',
            description: g.description || '',
            total_funding: g.total_funding || '',
            currency: g.currency || 'USD',
            deadline: g.deadline ? g.deadline.split('T')[0] : '',
            sectors: g.sectors || [],
            countries: g.countries || [],
            eligibility: g.eligibility || [],
            criteria: g.criteria || [],
            doc_requirements: g.doc_requirements || [],
            reporting_requirements: g.reporting_requirements || [],
            reporting_frequency: g.reporting_frequency || 'quarterly',
            report_template: g.report_template || {},
            grant_document: g.grant_document || null
        };
        nav('creategrant');
    }
}

// =============================================================================
// 21. Apply Form (Multi-step)
// =============================================================================

async function startApply(grantId) {
    if (!grantId && grantId !== 0) {
        showToast(T('grant.apply_load_error') || 'Grant not found. Please select a valid grant.', 'error');
        return;
    }
    showToast(T('common.loading') || 'Loading grant details...', 'info');
    try {
        var res = await api('GET', '/api/grants/' + grantId);
        var grant = res && (res.grant || res);
        if (grant && grant.id) {
            S.selectedGrant = grant;
            S.applyStep = 1;
            S.applyResponses = {};
            S.applyEligibility = {};
            S.uploadedDocs = {};
            S._currentApplicationId = null;

            // Check for existing draft and pre-load data
            try {
                var appsRes = await api('GET', '/api/applications/?grant_id=' + grantId + '&status=draft');
                if (appsRes && appsRes.applications && appsRes.applications.length > 0) {
                    var draft = appsRes.applications[0];
                    S._currentApplicationId = draft.id;
                    // Load full application detail to get responses
                    var detailRes = await api('GET', '/api/applications/' + draft.id);
                    if (detailRes && detailRes.application) {
                        var app = detailRes.application;
                        S.applyResponses = app.responses || {};
                        S.applyEligibility = app.eligibility_responses || {};
                        // Restore uploaded docs info
                        if (app.documents && app.documents.length) {
                            app.documents.forEach(function(doc) {
                                if (doc.doc_type) {
                                    S.uploadedDocs[doc.doc_type] = {
                                        filename: doc.filename || doc.original_filename,
                                        name: doc.filename || doc.original_filename,
                                        id: doc.id
                                    };
                                }
                            });
                        }
                        showToast(T('apply.draft_loaded') || 'Existing draft loaded. You can continue where you left off.', 'info');
                    }
                }
            } catch (draftErr) {
                // No existing draft — that's fine, start fresh
                console.log('No existing draft found, starting fresh application.');
            }

            nav('apply');
        } else {
            showToast(T('grant.apply_load_error') || 'Could not load grant details. Please try again.', 'error');
        }
    } catch (err) {
        showToast(T('grant.apply_load_error') || 'Could not load grant details. Please try again.', 'error');
    }
}

// Safe wrapper for inline onclick — if startApply isn't ready, shows a useful error
function safeStartApply(grantId) {
    if (typeof startApply !== 'function') {
        showToast('Application module loading. Please try again.', 'warning');
        return;
    }
    startApply(grantId);
}

/**
 * Auto-save draft, then advance to the next wizard step.
 * Fixes Issue #3/#15: Draft not saved on Next click.
 */
async function applyNext() {
    if (S.applyStep >= 4) return;
    // Save draft silently before advancing
    await saveDraft(true);
    S.applyStep++;
    render();
    window.scrollTo(0, 0);
}

/**
 * Go back to the previous wizard step with scroll reset.
 */
function applyPrev() {
    if (S.applyStep <= 1) return;
    S.applyStep--;
    render();
    window.scrollTo(0, 0);
}

/**
 * Reusable validation: returns array of missing items for the application.
 * Used by renderApplyReview() and submitApplication().
 * Fixes Issue #7a: strengthened validation with word count checks.
 */
function getApplyMissingItems(g) {
    var criteria = g.criteria || [];
    var docs = g.doc_requirements || [];
    var eligReqs = g.eligibility || [];
    var missingItems = [];

    eligReqs.forEach(function(r, i) {
        if (r.required && !S.applyEligibility['elig_' + i]) {
            missingItems.push('Eligibility: ' + (r.category || r.name || 'Requirement ' + (i + 1)));
        }
    });

    criteria.forEach(function(c, i) {
        var key = c.id || ('criterion_' + i);
        var text = (S.applyResponses[key] || '').trim();
        var wc = wordCount(text);
        var minWords = 20; // Minimum meaningful response
        if (!text) {
            missingItems.push('Response: ' + (c.label || c.name || 'Criterion ' + (i + 1)) + ' (empty)');
        } else if (wc < minWords) {
            missingItems.push('Response: ' + (c.label || c.name || 'Criterion ' + (i + 1)) + ' (' + wc + ' words — minimum ' + minWords + ' recommended)');
        }
    });

    docs.forEach(function(d, i) {
        var key = d.type || ('doc_' + i);
        if (d.required !== false && !S.uploadedDocs[key]) {
            missingItems.push('Document: ' + (d.name || d.type || 'Required Document'));
        }
    });

    return missingItems;
}

function renderApplyForm() {
    if (!S.selectedGrant) return '<p>' + T('common.loading') + '</p>';
    var g = S.selectedGrant;
    var step = S.applyStep;
    var steps = [
        { num: 1, label: T('apply.step1') },
        { num: 2, label: T('apply.step2') },
        { num: 3, label: T('apply.step3') },
        { num: 4, label: T('apply.step4') }
    ];

    var stepContent = '';
    switch (step) {
        case 1: stepContent = renderApplyEligibility(g); break;
        case 2: stepContent = renderApplyProposal(g); break;
        case 3: stepContent = renderApplyDocuments(g); break;
        case 4: stepContent = renderApplyReview(g); break;
    }

    return '<button class="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-4 transition-colors" onclick="nav(\'grantdetail\')">' + icon('arrow-left', 16) + ' ' + T('common.back') + '</button>' +
        '<div class="mb-8 animate-fade-in"><h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('file-text', 24) + ' ' + T('apply.title') + ': ' + esc(g.title) + '</h1></div>' +

        renderWizardSteps(steps, step) +

        '<div class="mb-6">' + stepContent + '</div>' +

        '<div class="flex items-center justify-between pt-4 border-t border-slate-200/60">' +
        (step > 1 ? '<button class="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="applyPrev()">' + icon('arrow-left', 16) + ' ' + T('common.previous') + '</button>' : '<div></div>') +
        '<div class="flex items-center gap-2">' +
        '<button class="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="saveDraft()">' + icon('save', 16) + ' ' + T('apply.save_draft') + '</button>' +
        (step < 4 ? '<button class="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="applyNext()">' + T('common.next') + ' ' + icon('arrow-right', 16) + '</button>' :
            '<button class="px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2 shadow-sm" onclick="submitApplication()">' + icon('send', 16) + ' ' + T('apply.submit_application') + '</button>') +
        '</div>' +
        '</div>';
}

function renderWizardSteps(steps, current) {
    return '<div class="flex items-center justify-between mb-8">' +
        steps.map(function(s, i) {
            var isCompleted = s.num < current;
            var isActive = s.num === current;
            var circleClasses = isCompleted
                ? 'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold bg-emerald-500 text-white shadow-sm'
                : isActive
                    ? 'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold bg-brand-600 text-white ring-4 ring-brand-100 shadow-sm'
                    : 'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold bg-slate-100 text-slate-400 border-2 border-slate-200';
            var labelClasses = isActive ? 'text-xs font-medium text-brand-700 mt-1.5' : isCompleted ? 'text-xs font-medium text-emerald-600 mt-1.5' : 'text-xs font-medium text-slate-400 mt-1.5';
            var connector = i < steps.length - 1
                ? '<div class="flex-1 h-0.5 mx-2 ' + (isCompleted ? 'bg-emerald-400' : 'bg-slate-200') + '"></div>'
                : '';
            return '<div class="flex flex-col items-center shrink-0">' +
                '<div class="' + circleClasses + '">' + (isCompleted ? icon('check', 16) : s.num) + '</div>' +
                '<span class="' + labelClasses + ' hidden sm:block">' + esc(s.label) + '</span>' +
                '</div>' + connector;
        }).join('') +
        '</div>';
}

function renderApplyEligibility(g) {
    var reqs = g.eligibility || [];
    if (!reqs.length) {
        return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
            '<h3 class="text-base font-semibold text-slate-900 mb-3">' + T('apply.eligibility_check') + '</h3>' +
            '<p class="text-sm text-slate-500">This grant has no specific eligibility requirements. You may proceed to the next step.</p>' +
            '</div>';
    }
    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="text-base font-semibold text-slate-900 mb-1">' + T('apply.eligibility_check') + '</h3>' +
        '<p class="text-sm text-slate-500 mb-4">Confirm that your organization meets each requirement below.</p>' +
        reqs.map(function(req, i) {
            var key = 'elig_' + i;
            var checked = S.applyEligibility[key];
            return '<div class="p-4 border border-slate-200 rounded-lg mb-3">' +
                '<div class="flex items-center gap-3">' +
                '<label class="flex items-center gap-2 cursor-pointer">' +
                '<input type="checkbox" class="rounded border-slate-300 text-brand-600 focus:ring-brand-500/20" ' + (checked ? 'checked' : '') + ' onchange="S.applyEligibility[\'' + key + '\']=this.checked;">' +
                '<span class="font-medium text-slate-900">' + esc(req.category || req.name || req.label || 'Requirement ' + (i + 1)) + '</span>' +
                '</label>' +
                (req.required ? '<span class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-rose-50 text-rose-700">Required</span>' : '') +
                '</div>' +
                '<p class="text-sm text-slate-500 mt-1 ml-7">' + esc(req.description || '') + '</p>' +
                '<div class="mt-2 ml-7">' +
                '<input type="text" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" placeholder="Provide evidence or explanation..." ' +
                'value="' + esc(S.applyEligibility[key + '_evidence'] || '') + '" ' +
                'oninput="S.applyEligibility[\'' + key + '_evidence\']=this.value;">' +
                '</div>' +
                '</div>';
        }).join('') +
        '</div>';
}

function renderApplyProposal(g) {
    var criteria = g.criteria || [];
    if (!criteria.length) {
        return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
            '<h3 class="text-base font-semibold text-slate-900 mb-3">' + T('application.proposal_responses') + '</h3>' +
            '<p class="text-sm text-slate-500 mb-3">No specific criteria to respond to. Please describe your proposal below.</p>' +
            '<div>' +
            '<textarea class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" rows="8" placeholder="Describe your project proposal..." ' +
            'data-bind="applyResponses.general" oninput="S.applyResponses.general=this.value;">' +
            esc(S.applyResponses.general || '') + '</textarea>' +
            '</div></div>';
    }

    return criteria.map(function(c, i) {
        var key = c.id || ('criterion_' + i);
        var text = S.applyResponses[key] || '';
        var wc = wordCount(text);
        var maxW = c.max_words || 500;
        var qi = qualityIndicator(wc, maxW);

        return '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-4">' +
            '<div class="flex justify-between items-center">' +
            '<h3 class="text-base font-semibold text-slate-900">' + (i + 1) + '. ' + esc(c.label || c.name) + '</h3>' +
            '<span class="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700">' + T('grant.create.weight') + ': ' + (c.weight || 0) + '%</span>' +
            '</div>' +
            '<p class="text-sm text-slate-500 mt-1">' + esc(c.description || '') + '</p>' +

            (c.instructions ? '<div class="bg-blue-50 p-3 rounded-lg mt-3 text-sm border-l-[3px] border-blue-500">' +
                '<span class="font-semibold text-blue-800">' + icon('lightbulb', 14, 'text-blue-600 inline') + ' Instructions:</span> ' + esc(c.instructions) + '</div>' : '') +

            (c.example ? '<details class="mt-2"><summary class="cursor-pointer text-sm text-brand-600 font-medium">' + icon('eye', 14, 'inline') + ' View Example Response</summary>' +
                '<div class="bg-slate-50 p-3 rounded-lg mt-2 text-sm text-slate-600">' +
                esc(c.example) + '</div></details>' : '') +

            '<div class="mt-3">' +
            '<textarea class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" rows="6" placeholder="Write your response here..." ' +
            'id="apply-textarea-' + i + '" ' +
            'oninput="S.applyResponses[\'' + key + '\']=this.value;updateWordCount(' + i + ',' + maxW + ');">' +
            esc(text) + '</textarea>' +
            '<div id="wc-' + i + '" class="flex justify-between items-center mt-1.5 text-xs">' +
            '<span style="color:' + qi.color + ';">' + wc + ' words (recommended: ~' + maxW + ') \u2014 ' + qi.label + '</span>' +
            '<button class="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-medium rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors inline-flex items-center gap-1" ' +
            'onclick="getAIGuidance(' + i + ',\'' + esc(c.label || '') + '\')">' + icon('sparkles', 14) + ' AI Help</button>' +
            '</div>' +
            '<div id="ai-guidance-' + i + '" class="hidden"></div>' +
            '</div>' +
            '</div>';
    }).join('');
}

function updateWordCount(idx, maxWords) {
    var el = document.getElementById('wc-' + idx);
    var textarea = document.getElementById('apply-textarea-' + idx);
    if (!el || !textarea) return;
    var text = textarea.value;
    var wc = wordCount(text);
    var qi = qualityIndicator(wc, maxWords);
    el.querySelector('span').innerHTML = wc + ' words (recommended: ~' + maxWords + ') \u2014 ' + qi.label;
    el.querySelector('span').style.color = qi.color;
}

var _guidanceTimer = null;
function getAIGuidance(idx, fieldName) {
    clearTimeout(_guidanceTimer);
    _guidanceTimer = setTimeout(function() {
        _getAIGuidanceImpl(idx, fieldName);
    }, 1500);
}

async function _getAIGuidanceImpl(idx, fieldName) {
    var key = 'criterion_' + idx;
    var text = S.applyResponses[key] || '';
    var g = S.selectedGrant;
    var el = document.getElementById('ai-guidance-' + idx);
    if (!el) return;
    el.className = '';
    el.style.display = 'block';
    el.innerHTML = '<div class="bg-blue-50 p-3 rounded-lg mt-2 text-sm">' +
        '<div class="flex items-center gap-2 text-blue-500">' +
        '<span class="w-3.5 h-3.5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin inline-block"></span>' +
        'Getting AI guidance...</div></div>';

    var res = await api('POST', '/api/ai/guidance', {
        field_name: fieldName,
        grant_criteria: (g.criteria || [])[idx] || {},
        current_text: text
    });
    if (res) {
        el.innerHTML = '<div class="bg-blue-50 p-3 rounded-lg mt-2 text-sm border-l-[3px] border-blue-500 relative">' +
            '<div class="flex justify-between items-center">' +
            '<div class="flex items-center gap-2"><span class="font-semibold text-blue-800">' + icon('sparkles', 14, 'text-blue-600') + ' AI Guidance</span>' +
            (res.quality_score != null ? ' <span class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">Quality: ' + res.quality_score + '%</span>' : '') + '</div>' +
            '<div class="flex gap-1">' +
            '<button class="px-2 py-0.5 text-[11px] text-blue-600 border border-blue-200 rounded hover:bg-blue-100 transition-colors inline-flex items-center gap-1" ' +
            'onclick="getAIGuidance(' + idx + ',\'' + esc(fieldName) + '\')" title="Refresh">' + icon('refresh-cw', 12) + ' Refresh</button>' +
            '<button class="px-2 py-0.5 text-[11px] text-slate-400 border border-slate-200 rounded hover:bg-slate-100 transition-colors" ' +
            'onclick="document.getElementById(\'ai-guidance-' + idx + '\').style.display=\'none\';" title="Close">' + icon('x', 12) + '</button>' +
            '</div></div>' +
            '<div class="mt-2 text-slate-600">' + renderMarkdown(res.guidance || res.response || 'No guidance available.') + '</div>' +
            '</div>';
    } else {
        el.innerHTML = '<div class="bg-red-50 p-3 rounded-lg mt-2 text-sm text-red-800 relative">' +
            '<button class="absolute top-2 right-2 text-red-400 hover:text-red-600 transition-colors" ' +
            'onclick="document.getElementById(\'ai-guidance-' + idx + '\').style.display=\'none\';">' + icon('x', 14) + '</button>' +
            'Unable to get AI guidance. Please try again.</div>';
    }
}

function renderApplyDocuments(g) {
    var docs = g.doc_requirements || [];
    if (!docs.length) {
        return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
            '<h3 class="text-base font-semibold text-slate-900 mb-3">' + T('apply.upload_documents') + '</h3>' +
            '<p class="text-sm text-slate-500">No documents required for this application.</p>' +
            '</div>';
    }
    var docIconMap = { financial_report: 'bar-chart-3', registration: 'scroll-text', audit: 'search', psea: 'shield', project_report: 'file-text', budget: 'banknote', cv: 'user', strategic_plan: 'clipboard-list' };
    return '<h3 class="text-base font-semibold text-slate-900 mb-4">' + T('apply.upload_documents') + '</h3>' +
        docs.map(function(d, i) {
            var key = d.type || ('doc_' + i);
            var uploaded = S.uploadedDocs[key];
            var docIcon = docIconMap[d.type] || 'file-text';
            return '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-4">' +
                '<div class="flex items-center gap-3 mb-3">' +
                '<div class="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">' + icon(docIcon, 20, 'text-slate-500') + '</div>' +
                '<div class="flex-1 min-w-0">' +
                '<h4 class="font-semibold text-slate-900">' + esc(d.name || d.type || 'Document') + '</h4>' +
                '<p class="text-sm text-slate-500 truncate">' + esc(d.description || d.requirements || '') + '</p>' +
                '</div>' +
                (d.required !== false ? '<span class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-rose-50 text-rose-700 shrink-0">' + T('grant.create.required') + '</span>' : '<span class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600 shrink-0">' + T('grant.create.optional') + '</span>') +
                '</div>' +
                (uploaded ?
                    '<div class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">' +
                    '<div class="w-8 h-8 rounded bg-blue-50 flex items-center justify-center shrink-0">' + icon('file-text', 16, 'text-blue-500') + '</div>' +
                    '<div class="flex-1 min-w-0">' +
                    '<div class="text-sm font-medium text-slate-900 truncate">' + esc(uploaded.filename || uploaded.name) + '</div>' +
                    '<div class="text-xs text-slate-400">' + esc(uploaded.size || '') + '</div>' +
                    '</div>' +
                    '<span class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-50 text-emerald-700">' + icon('check', 12, 'inline') + ' Uploaded</span>' +
                    '</div>' +
                    (uploaded.ai_analysis ? renderAIAnalysis(uploaded.ai_analysis) : '') :
                    '<div class="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-brand-500 hover:bg-brand-50/30 transition-colors cursor-pointer" id="upload-zone-' + key + '" ' +
                    'onclick="triggerUpload(\'' + key + '\')" ' +
                    'ondragover="event.preventDefault();this.classList.add(\'border-brand-500\',\'bg-brand-50/30\');" ' +
                    'ondragleave="this.classList.remove(\'border-brand-500\',\'bg-brand-50/30\');" ' +
                    'ondrop="event.preventDefault();this.classList.remove(\'border-brand-500\',\'bg-brand-50/30\');handleDrop(event,\'' + key + '\');">' +
                    '<div class="mb-2">' + icon('upload-cloud', 32, 'text-slate-400 mx-auto') + '</div>' +
                    '<div class="text-sm text-slate-600">Drag & drop your file here or <strong class="text-brand-600">click to browse</strong></div>' +
                    '<div class="text-xs text-slate-400 mt-1">PDF, DOC, DOCX, XLS, XLSX (Max 10MB)</div>' +
                    '</div>' +
                    '<input type="file" id="file-input-' + key + '" class="hidden" ' +
                    'accept=".pdf,.doc,.docx,.xls,.xlsx" onchange="handleFileSelect(event,\'' + key + '\')">'
                ) +
                '</div>';
        }).join('');
}

function renderAIAnalysis(analysis) {
    if (!analysis) return '';
    var score = analysis.score || analysis.quality_score || 0;
    var cls = score >= 70 ? 'pass' : score >= 40 ? 'warning' : 'fail';
    var bgCls = cls === 'pass' ? 'bg-emerald-50 border-emerald-200' : cls === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200';
    var scoreBadgeCls = cls === 'pass' ? 'bg-emerald-100 text-emerald-700' : cls === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700';

    // Per-requirement scores if available
    var reqScoresHTML = '';
    if (analysis.requirement_scores && analysis.requirement_scores.length > 0) {
        reqScoresHTML = '<div class="mt-3 border-t border-black/10 pt-3">' +
            '<strong class="text-sm">Donor Requirement Compliance:</strong>' +
            analysis.requirement_scores.map(function(rs) {
                var rScore = rs.score || 0;
                var rCls = rScore >= 70 ? 'text-emerald-600' : rScore >= 40 ? 'text-amber-500' : 'text-rose-500';
                var rIcon = rs.addressed ? icon('check-circle', 14, 'text-emerald-500') : icon('x-circle', 14, 'text-rose-500');
                return '<div class="flex items-center gap-2 my-1.5 px-2 py-1.5 bg-black/[0.03] rounded-md">' +
                    '<span>' + rIcon + '</span>' +
                    '<div class="flex-1 text-sm">' + esc(rs.requirement || 'Requirement') + '</div>' +
                    '<div class="min-w-[48px] text-center font-semibold ' + rCls + ' text-sm">' + rScore + '%</div>' +
                    '</div>';
            }).join('') +
            '</div>';
    }

    var findingsHTML = '';
    if (analysis.findings) {
        if (Array.isArray(analysis.findings)) {
            findingsHTML = '<div class="mt-1"><strong class="text-sm">Findings:</strong>' +
                analysis.findings.map(function(f) { return '<div class="text-sm text-slate-600 my-0.5">' + icon('chevron-right', 12, 'inline text-slate-400') + ' ' + esc(f) + '</div>'; }).join('') + '</div>';
        } else {
            findingsHTML = '<div class="mt-1"><strong class="text-sm">Findings:</strong> ' + esc(analysis.findings) + '</div>';
        }
    }

    var recsHTML = '';
    if (analysis.recommendations) {
        if (Array.isArray(analysis.recommendations)) {
            recsHTML = '<div class="mt-1"><strong class="text-sm">Recommendations:</strong>' +
                analysis.recommendations.map(function(r) { return '<div class="text-sm text-slate-600 my-0.5">' + icon('chevron-right', 12, 'inline text-slate-400') + ' ' + esc(r) + '</div>'; }).join('') + '</div>';
        } else {
            recsHTML = '<div class="mt-1"><strong class="text-sm">Recommendations:</strong> ' + esc(analysis.recommendations) + '</div>';
        }
    }

    var aiSource = analysis.source || 'ai';
    var transparencyBadge = aiSource === 'claude'
        ? '<span class="inline-flex items-center gap-1 text-[11px] text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full ml-2">' + icon('bot', 12) + ' Claude AI</span>'
        : '<span class="inline-flex items-center gap-1 text-[11px] text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full ml-2">' + icon('settings', 12) + ' Rule-based</span>';

    return '<div class="mt-3 p-4 rounded-lg border text-sm ' + bgCls + '">' +
        '<div class="flex justify-between items-center mb-2">' +
        '<div class="flex items-center"><strong class="flex items-center gap-1">' + icon('sparkles', 14, 'text-blue-500') + ' AI Document Analysis</strong>' + transparencyBadge + '</div>' +
        '<span class="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full ' + scoreBadgeCls + '">' +
        'Score: ' + score + '%</span>' +
        '</div>' +
        (analysis.summary ? '<div class="mt-1 text-sm text-slate-700">' + esc(analysis.summary) + '</div>' : '') +
        findingsHTML + recsHTML + reqScoresHTML +
        '<div class="mt-2 pt-2 border-t border-black/[0.06] text-[11px] text-slate-400 italic">AI-generated analysis \u2014 verify important details against original documents.</div>' +
        '</div>';
}

function triggerUpload(key) {
    var input = document.getElementById('file-input-' + key);
    if (input) input.click();
}

function handleDrop(e, key) {
    var files = e.dataTransfer.files;
    if (files.length > 0) {
        uploadFile(files[0], key);
    }
}

function handleFileSelect(e, key) {
    var files = e.target.files;
    if (files.length > 0) {
        uploadFile(files[0], key);
    }
}

async function uploadFile(file, key) {
    // Client-side file validation
    if (!file || file.size === 0 || file.size < 100) {
        showToast('File is empty or too small. Please upload a valid document.', 'error');
        return;
    }
    if (file.size > 16 * 1024 * 1024) {
        showToast('File too large (' + (file.size / (1024 * 1024)).toFixed(1) + ' MB). Maximum size is 16 MB.', 'error');
        return;
    }

    var zone = document.getElementById('upload-zone-' + key);

    // --- Phase 1: Uploading ---
    if (zone) {
        zone.innerHTML = '<div data-upload-phase="uploading" style="padding:16px;text-align:center;">' +
            '<div class="dot-pulse" style="margin-bottom:8px;justify-content:center;"><span></span><span></span><span></span></div>' +
            '<div style="font-size:14px;font-weight:600;color:#1e40af;">' + (T('upload.uploading') || 'Uploading document\u2026') + '</div>' +
            '<div style="font-size:12px;color:#3b82f6;margin-top:4px;">' + (T('upload.transferring') || 'Transferring file to server\u2026') + '</div>' +
            '<div style="font-size:11px;color:#64748b;margin-top:6px;">\uD83D\uDCC4 ' + esc(file.name) + '</div></div>';
    }
    var fd = new FormData();
    fd.append('file', file);
    fd.append('type', key);
    if (S.selectedGrant) fd.append('grant_id', S.selectedGrant.id);

    // --- Phase 2: Analyzing ---
    // Show analyzing phase after a short delay (upload usually fast, analysis takes time)
    var phaseTimer = setTimeout(function() {
        if (zone) {
            zone.innerHTML = '<div data-upload-phase="analyzing" style="padding:16px;text-align:center;">' +
                '<div class="dot-pulse" style="margin-bottom:8px;justify-content:center;"><span></span><span></span><span></span></div>' +
                '<div style="font-size:14px;font-weight:600;color:#1e40af;">' + (T('upload.ai_analyzing') || 'AI analyzing document\u2026') + '</div>' +
                '<div style="font-size:12px;color:#3b82f6;margin-top:4px;">' + (T('upload.analyzing_content') || 'Evaluating document quality and compliance\u2026') + '</div>' +
                '<div style="font-size:11px;color:#64748b;margin-top:6px;">\uD83D\uDCC4 ' + esc(file.name) + '</div></div>';
        }
    }, 2000);

    try {
        var res = await api('POST', '/api/documents/upload', fd);
        clearTimeout(phaseTimer);
        if (res && res.success !== false) {
            S.uploadedDocs[key] = {
                id: (res.document && res.document.id) || res.id || res.document_id,
                filename: file.name,
                name: file.name,
                size: (file.size / 1024).toFixed(1) + ' KB',
                ai_analysis: (res.document && res.document.ai_analysis) || res.ai_analysis || null
            };
            // --- Phase 3a: Success ---
            var score = (res.document && res.document.ai_analysis && res.document.ai_analysis.score) || 0;
            if (zone) {
                zone.innerHTML = '<div data-upload-phase="success" style="padding:16px;text-align:center;background:#dcfce7;border-radius:8px;border:2px solid #22c55e;">' +
                    '<div style="font-size:20px;margin-bottom:4px;">\u2705</div>' +
                    '<div style="font-size:14px;font-weight:600;color:#166534;">' + (T('upload.success') || 'Upload & analysis complete') + '</div>' +
                    '<div style="font-size:12px;color:#15803d;margin-top:4px;">' + esc(file.name) +
                    (score ? ' \u2014 Score: ' + score + '%' : '') + '</div></div>';
            }
            showToast(T('toast.uploaded') || 'File uploaded and analyzed successfully.', 'success');
            // Re-render after short delay to show final uploaded state
            setTimeout(function() { render(); }, 1500);
        } else {
            // --- Phase 3b: Failure (server rejected) ---
            var errMsg = (res && res.error) || T('common.upload_failed') || 'Upload failed. Please try again.';
            showToast(errMsg, 'error');
            if (zone) {
                zone.innerHTML = '<div data-upload-phase="failed" style="padding:16px;text-align:center;background:#fee2e2;border-radius:8px;border:2px solid #ef4444;">' +
                    '<div style="font-size:20px;margin-bottom:4px;">\u274C</div>' +
                    '<div style="font-size:14px;font-weight:600;color:#991b1b;">' + (T('upload.failed') || 'Upload failed') + '</div>' +
                    '<div style="font-size:12px;color:#b91c1c;margin-top:4px;">' + esc(errMsg) + '</div>' +
                    '<button class="mt-2 px-3 py-1.5 bg-rose-50 border border-rose-300 text-rose-700 text-xs font-medium rounded-lg hover:bg-rose-100 transition-colors" ' +
                    'onclick="triggerUpload(\'' + key + '\')">' + icon('refresh-cw', 12, 'inline') + ' ' + (T('common.click_to_retry') || 'Retry upload') + '</button></div>';
            }
        }
    } catch (uploadErr) {
        clearTimeout(phaseTimer);
        // --- Phase 3c: Network error ---
        showToast(T('toast.network_error') || 'Network error. Please check your connection.', 'error');
        if (zone) {
            zone.innerHTML = '<div data-upload-phase="failed" style="padding:16px;text-align:center;background:#fee2e2;border-radius:8px;border:2px solid #ef4444;">' +
                '<div style="font-size:20px;margin-bottom:4px;">\u274C</div>' +
                '<div style="font-size:14px;font-weight:600;color:#991b1b;">' + (T('upload.network_error') || 'Upload failed') + '</div>' +
                '<div style="font-size:12px;color:#b91c1c;margin-top:4px;">' + (T('toast.network_error') || 'Network error \u2014 check your connection') + '</div>' +
                '<button class="btn btn-sm" style="margin-top:8px;background:#fee2e2;border:1px solid #ef4444;color:#991b1b;" ' +
                'onclick="triggerUpload(\'' + key + '\')">\uD83D\uDD04 ' + (T('common.click_to_retry') || 'Retry upload') + '</button></div>';
        }
    }
}

function renderApplyReview(g) {
    var criteria = g.criteria || [];
    var docs = g.doc_requirements || [];
    var eligReqs = g.eligibility || [];

    // Use shared validation function (Issue #7a fix)
    var missingItems = getApplyMissingItems(g);

    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-4">' +
        '<h3 class="text-base font-semibold text-slate-900 mb-4">' + T('apply.review_submit') + '</h3>' +

        (missingItems.length ? '<div class="bg-amber-50 p-4 rounded-lg mb-4 border-l-4 border-amber-400">' +
            '<strong class="text-amber-800 flex items-center gap-1.5">' + icon('alert-triangle', 16, 'text-amber-500') + ' Missing Items (' + missingItems.length + ')</strong>' +
            '<ul class="mt-2 list-disc pl-5">' +
            missingItems.map(function(m) { return '<li class="text-amber-800 text-sm">' + esc(m) + '</li>'; }).join('') +
            '</ul></div>' : '<div class="bg-emerald-50 p-4 rounded-lg mb-4 border-l-4 border-emerald-400">' +
            '<strong class="text-emerald-800 flex items-center gap-1.5">' + icon('check-circle', 16, 'text-emerald-500') + ' All requirements met! Your application is ready to submit.</strong></div>') +

        // Eligibility Summary
        '<h4 class="font-semibold text-slate-900 mt-4 mb-2">' + T('application.eligibility_responses') + '</h4>' +
        eligReqs.map(function(r, i) {
            var checked = S.applyEligibility['elig_' + i];
            return '<div class="flex items-center gap-2 py-1.5 text-sm">' +
                (checked ? icon('check-circle', 16, 'text-emerald-500') : icon('x-circle', 16, 'text-rose-500')) +
                '<span class="text-slate-700">' + esc(r.category || r.name || 'Requirement ' + (i + 1)) + '</span></div>';
        }).join('') +

        // Criteria Responses Summary
        '<h4 class="font-semibold text-slate-900 mt-4 mb-2">' + T('application.proposal_responses') + '</h4>' +
        criteria.map(function(c, i) {
            var text = S.applyResponses['criterion_' + i] || '';
            var wc = wordCount(text);
            return '<div class="py-2 border-b border-slate-100">' +
                '<div class="font-medium text-sm text-slate-900">' + esc(c.label || c.name) + '</div>' +
                '<div class="text-xs text-slate-500">' + wc + ' words</div>' +
                '</div>';
        }).join('') +

        // Documents Summary
        '<h4 class="font-semibold text-slate-900 mt-4 mb-2">' + T('application.uploaded_documents') + '</h4>' +
        docs.map(function(d, i) {
            var key = d.type || ('doc_' + i);
            var uploaded = S.uploadedDocs[key];
            return '<div class="flex items-center gap-2 py-1.5 text-sm">' +
                (uploaded ? icon('check-circle', 16, 'text-emerald-500') : icon('x-circle', 16, 'text-rose-500')) +
                '<span class="text-slate-700">' + esc(d.name || d.type) + '</span>' +
                (uploaded ? ' <span class="text-slate-400">(' + esc(uploaded.filename || uploaded.name) + ')</span>' : '') +
                '</div>';
        }).join('') +

        '</div>';
}

/**
 * Save application draft. Uses PUT if draft already exists, POST to create new.
 * @param {boolean} silent - if true, suppress success toast (used by applyNext auto-save)
 * Fixes Issue #7b: draft save failure / "already applied" error.
 */
async function saveDraft(silent) {
    var g = S.selectedGrant;
    if (!g) {
        showToast('No grant selected. Please try again.', 'warning');
        return;
    }
    S._applySaving = true;
    if (!silent) render();

    var data = {
        grant_id: g.id,
        responses: S.applyResponses,
        eligibility_responses: S.applyEligibility,
        status: 'draft'
    };

    try {
        var res;
        if (S._currentApplicationId) {
            // Update existing draft via PUT
            res = await api('PUT', '/api/applications/' + S._currentApplicationId, data);
        } else {
            // Create new draft via POST
            res = await api('POST', '/api/applications/', data);
            if (res && (res.id || (res.application && res.application.id))) {
                S._currentApplicationId = res.id || res.application.id;
            } else if (!res) {
                // POST failed — might be 409 (already exists). Try to find and update existing.
                try {
                    var appsRes = await api('GET', '/api/applications/?grant_id=' + g.id + '&status=draft');
                    if (appsRes && appsRes.applications && appsRes.applications.length > 0) {
                        S._currentApplicationId = appsRes.applications[0].id;
                        res = await api('PUT', '/api/applications/' + S._currentApplicationId, data);
                    }
                } catch (lookupErr) {
                    // Could not recover
                }
            }
        }

        S._applySaving = false;
        if (res) {
            S._applyLastSaved = new Date().toLocaleTimeString();
            S._applyLastSavedIso = new Date().toISOString();
            if (!silent) {
                showToast(T('apply.draft_saved') || 'Application draft saved successfully.', 'success');
            }
        } else {
            if (!silent) {
                showToast('Failed to save draft. Please try again.', 'error');
            }
        }
    } catch (err) {
        S._applySaving = false;
        if (!silent) {
            showToast('Failed to save draft. Please check your connection.', 'error');
        }
    }
    if (!silent) render();
}

async function submitApplication() {
    var g = S.selectedGrant;
    if (!g) return;

    // Validate before submitting (Issue #7a: prevent submit when incomplete)
    var missing = getApplyMissingItems(g);
    if (missing.length > 0) {
        showToast(T('toast.fill_required_fields', {count: missing.length}) || 'Please complete all required fields before submitting.', 'error');
        S.applyStep = 4; // Stay on review page to show missing items
        render();
        return;
    }

    telemetry('submit_started', { grant_id: g.id });
    var data = {
        grant_id: g.id,
        responses: S.applyResponses,
        eligibility_responses: S.applyEligibility
    };

    var appId = S._currentApplicationId;
    var res;

    if (appId) {
        // Update existing draft before submitting
        res = await api('PUT', '/api/applications/' + appId, data);
        if (res) {
            res = { application: res.application || res, id: appId };
        }
    } else {
        // Create new then submit
        res = await api('POST', '/api/applications/', data);
        if (res) {
            appId = res.id || (res.application && res.application.id);
        }
    }

    if (res) {
        if (!appId) appId = res.id || (res.application && res.application.id);
        if (appId) {
            // Use raw fetch for submit so we can capture structured errors
            try {
                var submitResp = await fetch('/api/applications/' + appId + '/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                var submitData = await submitResp.json();
                if (submitResp.ok && submitData.success) {
                    telemetry('submit_succeeded', { grant_id: g.id, app_id: appId });
                    showToast(T('apply.submitted_success'), 'success');
                    nav('applications');
                    return;
                }
                // Handle structured submit error
                if (submitData.missing_criteria && submitData.missing_criteria.length > 0) {
                    telemetry('submit_failed', { grant_id: g.id, reason: 'missing_criteria', count: submitData.missing_criteria.length });
                    highlightMissingCriteria(g, submitData.missing_criteria);
                    return;
                }
                telemetry('submit_failed', { grant_id: g.id, reason: submitData.error });
                showToast(submitData.error || 'Submission failed', 'error');
                return;
            } catch (e) {
                telemetry('submit_failed', { grant_id: g.id, reason: 'network_error' });
                showToast(T('toast.network_error'), 'error');
                return;
            }
        }
        showToast(T('toast.app_created_review'), 'info');
        nav('applications');
    } else {
        telemetry('submit_failed', { grant_id: g.id, reason: 'draft_creation_failed' });
    }
}

function highlightMissingCriteria(grant, missingLabels) {
    // Navigate to the proposal step to show the missing fields
    S.applyStep = 2; // Proposal/criteria step
    render();

    // Wait for DOM to render, then highlight missing fields
    setTimeout(function() {
        var criteria = grant.criteria || [];
        var missingSet = {};
        missingLabels.forEach(function(label) { missingSet[label] = true; });

        var firstMissing = null;
        criteria.forEach(function(c, i) {
            var label = c.label || c.name || ('Criterion ' + (i + 1));
            var textarea = document.getElementById('apply-textarea-' + i);
            if (textarea && missingSet[label]) {
                textarea.style.border = '2px solid #ef4444';
                textarea.style.background = '#fef2f2';
                textarea.placeholder = 'Required - please provide your response for: ' + label;
                if (!firstMissing) firstMissing = textarea;
                // Add error label above textarea
                var errDiv = document.createElement('div');
                errDiv.className = 'criterion-error-label';
                errDiv.style.cssText = 'color:#dc2626;font-size:12px;font-weight:600;margin-bottom:4px;';
                errDiv.textContent = '\u26A0 Required response missing';
                textarea.parentNode.insertBefore(errDiv, textarea);
            }
        });

        if (firstMissing) {
            firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstMissing.focus();
        }

        showToast(T('toast.fill_required_fields', {count: missingLabels.length}), 'error');
    }, 200);
}

// =============================================================================
// 22. My Applications
// =============================================================================

function renderMyApplications() {
    loadApplications();
    return '<div class="mb-8 animate-fade-in"><h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('clipboard-list', 24, 'text-brand-600') + ' ' + T('application.my_applications') + '</h1></div>' +
        '<div id="my-applications-list">' + renderLoadingTable() + '</div>';
}

async function loadApplications() {
    var res = await api('GET', '/api/applications/');
    if (res && res.applications) {
        S.applications = res.applications;
        var el = document.getElementById('my-applications-list');
        if (el) el.innerHTML = renderApplicationsTable(res.applications);
    }
}

// =============================================================================
// 23. Application Detail
// =============================================================================

async function viewApplication(id) {
    var res = await api('GET', '/api/applications/' + id);
    if (res) {
        S.selectedApplication = res.application || res;
        S.appDetailTab = 'responses';
        nav('appdetail');
    }
}

function renderApplicationDetail() {
    if (!S.selectedApplication) return '<p>' + T('common.loading') + '</p>';
    var a = S.selectedApplication;
    var tab = S.appDetailTab || 'responses';
    var role = (S.user.role || '').toLowerCase();

    var tabs = [
        { key: 'responses', label: T('application.tab.responses') },
        { key: 'documents', label: T('application.tab.documents') },
        { key: 'scores', label: T('application.score') },
        { key: 'reviews', label: T('application.tab.review') }
    ];

    var tabContent = '';
    switch (tab) {
        case 'responses': tabContent = renderAppResponses(a); break;
        case 'documents': tabContent = renderAppDocuments(a); break;
        case 'scores': tabContent = renderAppScores(a); break;
        case 'reviews': tabContent = renderAppReviews(a); break;
    }

    var backPage = role === 'ngo' ? 'applications' : (role === 'donor' ? 'rankings' : 'assignments');

    return '<button class="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-4 transition-colors" onclick="nav(\'' + backPage + '\')">' + icon('arrow-left', 16) + ' ' + T('common.back') + '</button>' +

        '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-6">' +
        '<div class="flex justify-between items-start flex-wrap gap-4">' +
        '<div>' +
        '<h1 class="text-xl font-bold text-slate-900">' + esc(a.grant_title || a.grant_name || 'Application') + '</h1>' +
        '<p class="text-slate-500 mt-1 text-sm">' + esc(a.org_name || a.applicant_name || '') + '</p>' +
        '</div>' +
        '<div class="flex items-center gap-4">' +
        statusBadge(a.status) +
        '</div>' +
        '</div>' +
        '<div class="flex gap-6 mt-4">' +
        '<div class="text-center">' +
        scoreRingHTML(a.ai_score || 0, 64, 'AI') +
        '</div>' +
        '<div class="text-center">' +
        scoreRingHTML(a.human_score || 0, 64, 'Human') +
        '</div>' +
        '<div class="text-center">' +
        scoreRingHTML(a.final_score || 0, 64, 'Final') +
        '</div>' +
        '</div>' +
        '</div>' +

        // Tabs
        '<div class="flex gap-1 mb-6 border-b-2 border-slate-200">' +
        tabs.map(function(t) {
            var active = tab === t.key;
            return '<button class="px-4 py-2 text-sm border-b-2 -mb-[2px] transition-colors ' +
                (active ? 'border-brand-600 text-brand-600 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-700') + '" ' +
                'onclick="S.appDetailTab=\'' + t.key + '\';render();">' + esc(t.label) + '</button>';
        }).join('') +
        '</div>' +

        tabContent +

        (role === 'donor' || role === 'reviewer' ?
            '<div class="mt-6">' +
            '<button class="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="nav(\'scoreapp\',{selectedApplication:' +
            'S.selectedApplication})">' + icon('send', 16) + ' ' + T('review.submit_review') + '</button></div>' : '');
}

function renderAppResponses(a) {
    var responses = a.responses || {};
    var keys = Object.keys(responses);
    if (!keys.length) return '<div class="bg-white rounded-xl border border-slate-200/60 p-5"><p class="text-sm text-slate-400">No responses submitted.</p></div>';
    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="font-semibold text-slate-900 mb-4">' + T('application.application_responses') + '</h3>' +
        keys.map(function(k) {
            var label = k.replace(/_/g, ' ').replace(/criterion /i, 'Criterion ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
            return '<div class="mb-4 pb-4 border-b border-slate-100">' +
                '<h4 class="font-semibold text-sm text-slate-900 mb-1">' + esc(label) + '</h4>' +
                '<p class="text-sm text-slate-600 whitespace-pre-wrap">' + esc(responses[k]) + '</p>' +
                '</div>';
        }).join('') +
        '</div>';
}

function renderAppDocuments(a) {
    var docs = a.documents || [];
    if (!docs.length) return '<div class="bg-white rounded-xl border border-slate-200/60 p-5"><p class="text-sm text-slate-400">No documents uploaded.</p></div>';
    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="font-semibold text-slate-900 mb-4">' + T('application.uploaded_documents') + '</h3>' +
        docs.map(function(d) {
            return '<div class="flex items-center gap-3 mb-2 p-2 rounded-lg hover:bg-slate-50 transition-colors">' +
                '<span class="text-slate-400">' + icon('file-text', 18) + '</span>' +
                '<div class="flex-1 min-w-0">' +
                '<div class="text-sm font-medium text-slate-900 truncate">' + esc(d.filename || d.name || 'Document') + '</div>' +
                '<div class="text-xs text-slate-400">' + esc(d.type || '') + '</div>' +
                '</div>' +
                (d.ai_analysis ? statusBadge('AI: ' + d.ai_analysis.score + '%', d.ai_analysis.score >= 70 ? 'green' : 'amber') : '') +
                '</div>' +
                (d.ai_analysis ? renderAIAnalysis(d.ai_analysis) : '');
        }).join('') +
        '</div>';
}

function renderAppScores(a) {
    var scores = a.scores || a.criteria_scores || {};
    var keys = Object.keys(scores);
    if (!keys.length) return '<div class="bg-white rounded-xl border border-slate-200/60 p-5"><p class="text-sm text-slate-400">No scores available yet.</p></div>';
    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="font-semibold text-slate-900 mb-4">' + T('application.scoring_breakdown') + '</h3>' +
        keys.map(function(k) {
            var s = scores[k];
            var val = typeof s === 'object' ? (s.score || 0) : s;
            var barColor = val >= 70 ? 'bg-emerald-500' : val >= 50 ? 'bg-amber-500' : 'bg-rose-500';
            return '<div class="flex items-center gap-3 py-2 border-b border-slate-100">' +
                '<div class="flex-1 font-medium text-sm text-slate-700">' + esc(k.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); })) + '</div>' +
                '<div class="w-48">' +
                '<div class="h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full ' + barColor + '" style="width:' + val + '%"></div></div>' +
                '</div>' +
                '<span class="font-semibold text-sm text-slate-900 w-10 text-right">' + val + '%</span>' +
                '</div>';
        }).join('') +
        '</div>';
}

function renderAppReviews(a) {
    var reviews = a.reviews || [];
    if (!reviews.length) return '<div class="bg-white rounded-xl border border-slate-200/60 p-5"><p class="text-sm text-slate-400">No reviews completed yet.</p></div>';
    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="font-semibold text-slate-900 mb-4">' + T('application.reviews') + '</h3>' +
        reviews.map(function(r) {
            return '<div class="p-4 border border-slate-200 rounded-lg mb-3">' +
                '<div class="flex justify-between items-center">' +
                '<div>' +
                '<div class="font-semibold text-sm text-slate-900">' + esc(r.reviewer_name || 'Reviewer') + '</div>' +
                '<div class="text-xs text-slate-400">' + formatDate(r.completed_at || r.created_at) + '</div>' +
                '</div>' +
                '<div class="text-2xl font-bold text-brand-600">' + (r.score || 0) + '%</div>' +
                '</div>' +
                (r.comments ? '<p class="mt-2 text-slate-600 text-sm">' + esc(r.comments) + '</p>' : '') +
                '</div>';
        }).join('') +
        '</div>';
}

// =============================================================================
// 24. Create Grant Wizard
// =============================================================================

function renderCreateGrant() {
    var step = S.createStep;
    if (step === 1 && !_telemetryCorrelation) newTelemetrySession();
    var stepNames = ['', 'basic_info', 'eligibility', 'criteria', 'documents', 'reporting', 'review'];
    telemetry('wizard_step_enter', { step: step, step_name: stepNames[step] || 'unknown' });
    var steps = [
        { num: 1, label: T('grant.create.step1') },
        { num: 2, label: T('grant.create.step2') },
        { num: 3, label: T('grant.create.step3') },
        { num: 4, label: T('grant.create.step4') },
        { num: 5, label: T('grant.create.step5') }
    ];

    var stepContent = '';
    switch (step) {
        case 1: stepContent = renderCreateBasicInfo(); break;
        case 2: stepContent = renderCreateEligibility(); break;
        case 3: stepContent = renderCreateCriteria(); break;
        case 4: stepContent = renderCreateDocRequirements(); break;
        case 5: stepContent = renderCreateReporting(); break;
        case 6: stepContent = renderCreateReview(); break;
    }

    // Persisted-state indicator
    var draftIndicator = '';
    if (S.createData._draftSaving) {
        draftIndicator = '<span data-draft-state="saving" class="text-xs text-indigo-500 ml-3"><span class="w-3 h-3 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin inline-block align-middle mr-1"></span>Saving\u2026</span>';
    } else if (S.createData._lastSavedAt) {
        draftIndicator = '<span data-draft-state="saved" data-draft-save-success="' + (S.createData._draftSaveSuccess ? 'true' : 'false') + '" data-saved-time="' + (S.createData._lastSavedIso || '') + '" class="text-xs text-emerald-700 ml-3">' + icon('check-circle', 12, 'inline text-emerald-500') + ' Saved at ' + esc(S.createData._lastSavedAt) + '</span>';
    } else if (S.createData.id) {
        draftIndicator = '<span data-draft-state="persisted" class="text-xs text-slate-500 ml-3">' + icon('hard-drive', 12, 'inline text-slate-400') + ' Draft (ID: ' + S.createData.id + ')</span>';
    }

    return '<div class="mb-8 animate-fade-in"><h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + (S.createData.id ? icon('pencil', 24) + ' ' + T('common.edit') : icon('plus-circle', 24) + ' ' + T('grant.create.title')) + draftIndicator + '</h1></div>' +

        renderWizardSteps(steps, Math.min(step, 5)) +

        '<div class="mb-6">' + stepContent + '</div>' +

        '<div class="flex items-center justify-between pt-4 border-t border-slate-200/60">' +
        (S._extractingReqs ? '<div data-upload-active="true" class="text-sm text-indigo-500 font-medium flex items-center gap-2">' +
            '<span class="w-3.5 h-3.5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin inline-block"></span>' +
            (S._uploadPhase === 'saving_draft' ? T('grant.create.saving_draft') || 'Saving draft…' :
             S._uploadPhase === 'uploading' ? T('grant.create.uploading_doc') || 'Uploading…' :
             T('grant.create.ai_analyzing') || 'AI analyzing document…') + ' ' + T('common.please_wait') + '</div>' :
        (step > 1 ? '<button class="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="S.createStep--;render();">' + icon('arrow-left', 16) + ' ' + T('common.previous') + '</button>' : '<div></div>')) +
        '<div class="flex items-center gap-2">' +
        (S._extractingReqs ? '' :
        (step === 6 ?
            '<button class="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="saveGrantDraft()">' + icon('save', 16) + ' ' + T('grant.create.save_draft') + '</button>' +
            '<button class="px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2 shadow-sm" onclick="publishGrant()">' + icon('rocket', 16) + ' ' + T('grant.create.publish') + '</button>' :
            '<button class="px-3 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="saveGrantDraft()">' + icon('save', 16) + ' ' + T('grant.create.save_draft') + '</button>' +
            '<button class="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="' + (step === 5 ? 'S.createStep=6;render();' : 'S.createStep++;render();') + '">' + T('common.next') + ' ' + icon('arrow-right', 16) + '</button>')) +
        '</div>' +
        '</div>';
}

function renderCreateBasicInfo() {
    var d = S.createData;
    var sectors = ['Health', 'Education', 'Climate', 'Protection', 'Nutrition', 'WASH', 'Livelihoods', 'Governance', 'Agriculture'];
    var countries = ['Somalia', 'Kenya', 'Ethiopia', 'Uganda', 'South Sudan', 'Global'];
    var currencies = ['USD', 'EUR', 'GBP', 'KES', 'CHF'];

    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="text-base font-semibold text-slate-900 mb-4">' + T('grant.create.step1') + '</h3>' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.create.grant_title') + ' <span class="text-rose-500">*</span></label>' +
        '<input type="text" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" placeholder="' + T('grant.create.grant_title_placeholder') + '" ' +
        'value="' + esc(d.title) + '" oninput="S.createData.title=this.value;">' +
        '</div>' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.create.description') + ' <span class="text-rose-500">*</span></label>' +
        '<textarea class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" rows="5" placeholder="' + T('grant.create.description_placeholder') + '" ' +
        'oninput="S.createData.description=this.value;">' + esc(d.description) + '</textarea>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">' +
        '<div>' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.create.total_funding') + ' <span class="text-rose-500">*</span></label>' +
        '<input type="number" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" placeholder="500000" ' +
        'value="' + esc(d.total_funding) + '" oninput="S.createData.total_funding=this.value;">' +
        '</div>' +
        '<div>' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.create.currency') + '</label>' +
        '<select class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" onchange="S.createData.currency=this.value;">' +
        currencies.map(function(c) { return '<option value="' + c + '"' + (d.currency === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
        '</select>' +
        '</div>' +
        '</div>' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.create.deadline') + ' <span class="text-rose-500">*</span></label>' +
        '<input type="date" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" min="' + todayStr() + '" ' +
        'value="' + esc(d.deadline) + '" oninput="S.createData.deadline=this.value;">' +
        '</div>' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.create.sectors') + '</label>' +
        '<div class="flex flex-wrap gap-2">' +
        sectors.map(function(s) {
            var active = d.sectors.indexOf(s) >= 0;
            return '<button class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5 ' + (active ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50') + '" ' +
                'onclick="toggleCreateTag(\'sectors\',\'' + s + '\')">' + sectorIcon(s) + ' ' + s + '</button>';
        }).join('') +
        '</div></div>' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.create.countries') + '</label>' +
        '<div class="flex flex-wrap gap-2">' +
        countries.map(function(c) {
            var active = d.countries.indexOf(c) >= 0;
            return '<button class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5 ' + (active ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50') + '" ' +
                'onclick="toggleCreateTag(\'countries\',\'' + c + '\')">' + icon('globe', 14) + ' ' + c + '</button>';
        }).join('') +
        '</div></div>' +
        '</div>';
}

function toggleCreateTag(field, value) {
    var arr = S.createData[field];
    var idx = arr.indexOf(value);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(value);
    render();
}

function renderCreateEligibility() {
    var catIcons = { geographic: 'globe', org_type: 'building-2', experience: 'calendar', budget: 'banknote', sector: 'target', registration: 'scroll-text' };
    var categories = [
        { key: 'geographic', label: 'Geographic Location', desc: 'Require applicants to operate in specific regions' },
        { key: 'org_type', label: 'Organization Type', desc: 'Specify required organization types (NGO, CBO, etc.)' },
        { key: 'experience', label: 'Years of Experience', desc: 'Minimum years of operational experience' },
        { key: 'budget', label: 'Budget Range', desc: 'Annual budget requirements' },
        { key: 'sector', label: 'Sector Focus', desc: 'Required sector expertise' },
        { key: 'registration', label: 'Legal Registration', desc: 'Registration and legal status requirements' }
    ];

    var currentElig = S.createData.eligibility || [];

    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="text-base font-semibold text-slate-900 mb-1">' + T('grant.detail.eligibility') + '</h3>' +
        '<p class="text-sm text-slate-500 mb-4">Define who can apply for this grant.</p>' +

        categories.map(function(cat) {
            var existing = currentElig.find(function(e) { return e.category === cat.key; });
            var enabled = !!existing;
            return '<div class="border border-slate-200 rounded-lg mb-3 overflow-hidden">' +
                '<div class="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors" onclick="toggleEligibility(\'' + cat.key + '\')">' +
                '<div class="flex items-center gap-3">' +
                '<div class="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">' + icon(catIcons[cat.key] || 'circle', 18, 'text-slate-500') + '</div>' +
                '<div><h4 class="text-sm font-semibold text-slate-900">' + esc(cat.label) + '</h4>' +
                '<p class="text-xs text-slate-400 font-normal">' + esc(cat.desc) + '</p></div>' +
                '</div>' +
                '<div class="toggle-switch">' +
                '<input type="checkbox" ' + (enabled ? 'checked' : '') + '>' +
                '<span class="slider"></span>' +
                '</div>' +
                '</div>' +
                (enabled ? '<div class="px-4 pb-4 pt-0 border-t border-slate-100">' +
                    '<div class="mb-3 mt-3">' +
                    '<label class="block text-xs font-medium text-slate-600 mb-1">Details / Parameters</label>' +
                    '<input type="text" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" placeholder="Specify requirements..." ' +
                    'value="' + esc(existing.description || '') + '" ' +
                    'oninput="updateEligibility(\'' + cat.key + '\',\'description\',this.value);">' +
                    '</div>' +
                    '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
                    '<div>' +
                    '<label class="block text-xs font-medium text-slate-600 mb-1">Weight</label>' +
                    '<input type="range" min="0" max="100" value="' + (existing.weight || 50) + '" ' +
                    'class="w-full" ' +
                    'oninput="updateEligibility(\'' + cat.key + '\',\'weight\',this.value);this.nextElementSibling.textContent=this.value+\'%\';">' +
                    '<span class="text-xs text-slate-500">' + (existing.weight || 50) + '%</span>' +
                    '</div>' +
                    '<div>' +
                    '<label class="block text-xs font-medium text-slate-600 mb-1">Required</label>' +
                    '<label class="flex items-center gap-2 cursor-pointer mt-2">' +
                    '<input type="checkbox" class="rounded border-slate-300 text-brand-600 focus:ring-brand-500/20" ' + (existing.required ? 'checked' : '') + ' ' +
                    'onchange="updateEligibility(\'' + cat.key + '\',\'required\',this.checked);">' +
                    '<span class="text-sm text-slate-700">' + T('grant.create.must_meet_requirement') + '</span></label>' +
                    '</div></div>' +
                    '</div>' : '') +
                '</div>';
        }).join('') +

        '<button class="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 mt-3" ' +
        'onclick="addCustomEligibility()">' + icon('plus', 14) + ' ' + T('grant.create.add_eligibility') + '</button>' +

        '<div class="bg-blue-50 p-3 rounded-lg mt-4 text-sm border-l-[3px] border-blue-500">' +
        icon('lightbulb', 14, 'text-blue-600 inline') + ' <strong class="text-blue-800">AI Tip:</strong> Consider including geographic requirements to target specific communities, ' +
        'and experience requirements to ensure grantees have the capacity to deliver results.</div>' +

        '</div>';
}

function toggleEligibility(key) {
    var arr = S.createData.eligibility;
    var idx = arr.findIndex(function(e) { return e.category === key; });
    if (idx >= 0) {
        arr.splice(idx, 1);
    } else {
        arr.push({ category: key, description: '', weight: 50, required: true });
    }
    render();
}

function updateEligibility(key, field, value) {
    var item = S.createData.eligibility.find(function(e) { return e.category === key; });
    if (item) item[field] = value;
}

function addCustomEligibility() {
    S.createData.eligibility.push({
        category: 'custom_' + Date.now(),
        name: 'Custom Requirement',
        description: '',
        weight: 50,
        required: false,
        custom: true
    });
    render();
}

function renderCreateCriteria() {
    var criteria = S.createData.criteria || [];
    var totalWeight = criteria.reduce(function(sum, c) { return sum + (Number(c.weight) || 0); }, 0);

    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<div class="flex justify-between items-center mb-4">' +
        '<div>' +
        '<h3 class="text-base font-semibold text-slate-900">' + T('grant.detail.evaluation_criteria') + '</h3>' +
        '<p class="text-sm text-slate-500">Define how applications will be evaluated.</p>' +
        '</div>' +
        '<div class="text-right">' +
        '<div class="text-2xl font-bold ' + (totalWeight === 100 ? 'text-emerald-500' : 'text-rose-500') + '">' + totalWeight + '%</div>' +
        '<div class="text-xs text-slate-500">Total Weight' + (totalWeight !== 100 ? ' (must = 100%)' : ' ' + icon('check', 12, 'inline text-emerald-500')) + '</div>' +
        '</div>' +
        '</div>' +

        criteria.map(function(c, i) {
            return '<div class="p-4 border border-slate-200 rounded-lg mb-3 relative">' +
                '<button class="absolute top-2 right-2 text-rose-400 hover:text-rose-600 transition-colors" ' +
                'onclick="S.createData.criteria.splice(' + i + ',1);render();">' + icon('x', 18) + '</button>' +
                '<div class="grid grid-cols-1 sm:grid-cols-[1fr_100px] gap-4 mb-3">' +
                '<div>' +
                '<label class="block text-xs font-medium text-slate-600 mb-1">Label <span class="text-rose-500">*</span></label>' +
                '<input type="text" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" value="' + esc(c.label || '') + '" placeholder="e.g., Technical Approach" ' +
                'oninput="S.createData.criteria[' + i + '].label=this.value;">' +
                '</div>' +
                '<div>' +
                '<label class="block text-xs font-medium text-slate-600 mb-1">Weight %</label>' +
                '<input type="number" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" value="' + (c.weight || '') + '" min="0" max="100" ' +
                'oninput="S.createData.criteria[' + i + '].weight=Number(this.value);">' +
                '</div>' +
                '</div>' +
                '<div class="mb-3">' +
                '<label class="block text-xs font-medium text-slate-600 mb-1">Description</label>' +
                '<textarea class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" rows="2" placeholder="What should applicants address?" ' +
                'oninput="S.createData.criteria[' + i + '].description=this.value;">' + esc(c.description || '') + '</textarea>' +
                '</div>' +
                '<div class="mb-3">' +
                '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.create.instructions_for_applicants') + '</label>' +
                '<textarea class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" rows="2" placeholder="Guidance for writing a strong response..." ' +
                'oninput="S.createData.criteria[' + i + '].instructions=this.value;">' + esc(c.instructions || '') + '</textarea>' +
                '</div>' +
                '<div class="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-4">' +
                '<div>' +
                '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.create.example_response') + '</label>' +
                '<textarea class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" rows="2" placeholder="Provide a sample response..." ' +
                'oninput="S.createData.criteria[' + i + '].example=this.value;">' + esc(c.example || '') + '</textarea>' +
                '</div>' +
                '<div>' +
                '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.create.max_words') + '</label>' +
                '<input type="number" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" value="' + (c.max_words || 500) + '" min="50" ' +
                'oninput="S.createData.criteria[' + i + '].max_words=Number(this.value);">' +
                '</div>' +
                '</div>' +
                '</div>';
        }).join('') +

        '<div class="flex gap-2 mt-3">' +
        '<button class="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="addCriterion()">' + icon('plus', 16) + ' ' + T('grant.create.add_criterion') + '</button>' +
        '<button class="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-medium rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors inline-flex items-center gap-1" ' +
        'onclick="suggestCriteria()">' + icon('sparkles', 14) + ' AI Suggest Criteria</button>' +
        '</div>' +

        '</div>';
}

function addCriterion() {
    var idx = S.createData.criteria.length;
    S.createData.criteria.push({
        id: 'criterion_' + idx,
        label: '', description: '', weight: 0, instructions: '', example: '', max_words: 500
    });
    render();
}

async function suggestCriteria() {
    showToast(T('toast.ai_criteria_generating'), 'info');
    var res = await api('POST', '/api/ai/chat', {
        message: 'Suggest 4 scoring criteria for a grant about: ' + (S.createData.title || 'general development') +
            ' in sectors: ' + (S.createData.sectors.join(', ') || 'general'),
        context: { page: 'create_grant', grant_data: S.createData }
    });
    if (res && res.response) {
        showModal(T('grant.create.ai_suggested_criteria'), '<div style="font-size:14px;">' + renderMarkdown(res.response) + '</div>', [
            { label: T('common.close'), onclick: 'closeModal()', cls: 'btn-secondary' }
        ]);
    }
}

function renderCreateDocRequirements() {
    var docIconMap = { financial_report: 'bar-chart-3', registration: 'scroll-text', audit: 'search', psea: 'shield', project_report: 'file-text', budget: 'banknote', cv: 'user', strategic_plan: 'clipboard-list' };
    var docTypes = [
        { key: 'financial_report', label: 'Financial Report', desc: 'Annual financial statements' },
        { key: 'registration', label: 'Registration Certificate', desc: 'Legal registration documents' },
        { key: 'audit', label: 'Audit Report', desc: 'External audit report' },
        { key: 'psea', label: 'PSEA Policy', desc: 'Protection policy document' },
        { key: 'project_report', label: 'Project Report', desc: 'Previous project reports' },
        { key: 'budget', label: 'Budget Detail', desc: 'Detailed project budget' },
        { key: 'cv', label: 'Staff CVs', desc: 'Key staff qualifications' },
        { key: 'strategic_plan', label: 'Strategic Plan', desc: 'Organization strategic plan' }
    ];

    var currentDocs = S.createData.doc_requirements || [];

    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="text-base font-semibold text-slate-900 mb-1">' + T('grant.detail.doc_requirements') + '</h3>' +
        '<p class="text-sm text-slate-500 mb-4">Select which documents applicants must submit.</p>' +

        docTypes.map(function(dt) {
            var existing = currentDocs.find(function(d) { return d.type === dt.key; });
            var enabled = !!existing;
            return '<div class="border border-slate-200 rounded-lg mb-3 overflow-hidden">' +
                '<div class="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors" onclick="toggleDocRequirement(\'' + dt.key + '\',\'' + esc(dt.label) + '\')">' +
                '<div class="flex items-center gap-3">' +
                '<div class="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">' + icon(docIconMap[dt.key] || 'file-text', 18, 'text-slate-500') + '</div>' +
                '<div><h4 class="text-sm font-semibold text-slate-900">' + esc(dt.label) + '</h4>' +
                '<p class="text-xs text-slate-400 font-normal">' + esc(dt.desc) + '</p></div>' +
                '</div>' +
                '<div class="toggle-switch">' +
                '<input type="checkbox" ' + (enabled ? 'checked' : '') + '>' +
                '<span class="slider"></span>' +
                '</div>' +
                '</div>' +
                (enabled ? '<div class="px-4 pb-4 pt-0 border-t border-slate-100">' +
                    '<div class="mb-3 mt-3">' +
                    '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.create.specific_requirements') + '</label>' +
                    '<input type="text" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" placeholder="Any specific requirements for this document..." ' +
                    'value="' + esc(existing.requirements || existing.description || '') + '" ' +
                    'oninput="updateDocReq(\'' + dt.key + '\',\'requirements\',this.value);">' +
                    '</div>' +
                    '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
                    '<div>' +
                    '<label class="flex items-center gap-2 cursor-pointer">' +
                    '<input type="checkbox" class="rounded border-slate-300 text-brand-600 focus:ring-brand-500/20" ' + (existing.required !== false ? 'checked' : '') + ' ' +
                    'onchange="updateDocReq(\'' + dt.key + '\',\'required\',this.checked);">' +
                    '<span class="text-sm text-slate-700">' + T('grant.create.required_document') + '</span></label>' +
                    '</div>' +
                    '<div>' +
                    '<label class="flex items-center gap-2 cursor-pointer">' +
                    '<input type="checkbox" class="rounded border-slate-300 text-brand-600 focus:ring-brand-500/20" ' + (existing.ai_review ? 'checked' : '') + ' ' +
                    'onchange="updateDocReq(\'' + dt.key + '\',\'ai_review\',this.checked);">' +
                    '<span class="text-sm text-slate-700">' + icon('sparkles', 12, 'inline text-blue-500') + ' AI Document Review</span></label>' +
                    '</div></div>' +
                    (existing.ai_review ? '<div class="mt-2">' +
                    '<label class="block text-xs font-medium text-slate-600 mb-1">' + icon('sparkles', 12, 'inline text-blue-500') + ' AI Evaluation Criteria</label>' +
                    '<textarea class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" rows="2" placeholder="What should AI look for? e.g., Must include 3 years audited financials, budget variance under 10%..." ' +
                    'oninput="updateDocReq(\'' + dt.key + '\',\'ai_criteria\',this.value);">' + esc(existing.ai_criteria || '') + '</textarea>' +
                    '<p class="text-[11px] text-slate-400 mt-1">AI will evaluate uploaded documents against these specific criteria.</p>' +
                    '</div>' : '') +
                    '</div>' : '') +
                '</div>';
        }).join('') +

        '</div>';
}

function toggleDocRequirement(key, label) {
    var arr = S.createData.doc_requirements;
    var idx = arr.findIndex(function(d) { return d.type === key; });
    if (idx >= 0) {
        arr.splice(idx, 1);
    } else {
        arr.push({ type: key, name: label, required: true, ai_review: true, requirements: '' });
    }
    render();
}

function updateDocReq(key, field, value) {
    var item = S.createData.doc_requirements.find(function(d) { return d.type === key; });
    if (item) item[field] = value;
}

function renderCreateReporting() {
    var d = S.createData;
    var frequencies = [
        {value: 'monthly', label: T('frequency.monthly')},
        {value: 'quarterly', label: T('frequency.quarterly')},
        {value: 'semi-annual', label: T('frequency.semi_annual')},
        {value: 'annual', label: T('frequency.annual')},
        {value: 'final_only', label: T('frequency.final_only')}
    ];
    var reportTypes = ['financial', 'narrative', 'impact', 'progress', 'final'];

    var reqsHTML = '';
    if (d.reporting_requirements && d.reporting_requirements.length > 0) {
        reqsHTML = d.reporting_requirements.map(function(req, i) {
            return '<div class="bg-white rounded-lg border border-slate-200 border-l-4 border-l-brand-500 mb-3">' +
                '<div class="px-4 py-3">' +
                '<div class="flex justify-between items-start">' +
                '<div>' +
                '<strong class="text-sm text-slate-900">' + esc(req.title || req.type) + '</strong>' +
                '<span class="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-50 text-emerald-700 ml-2">' + esc(req.type) + '</span>' +
                '<span class="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-slate-100 text-slate-600 ml-1">' + esc(req.frequency || d.reporting_frequency) + '</span>' +
                '</div>' +
                '<button class="text-rose-400 hover:text-rose-600 transition-colors px-2 py-0.5" onclick="removeReportingReq(' + i + ')">' + icon('x', 14) + '</button>' +
                '</div>' +
                '<p class="text-sm text-slate-500 mt-1">' + esc(req.description || '') + '</p>' +
                (req.due_days_after_period ? '<p class="text-xs text-slate-400 mt-1">' + T('grant.create.due_days', {days: req.due_days_after_period}) + '</p>' : '') +
                '</div></div>';
        }).join('');
    } else {
        reqsHTML = '<p class="text-slate-400 py-4 text-center text-sm">' + T('grant.create.no_reqs_yet') + '</p>';
    }

    var templateHTML = '';
    var tmpl = d.report_template;
    if (tmpl && tmpl.template_sections && tmpl.template_sections.length > 0) {
        templateHTML = '<div class="mt-4">' +
            '<h4 class="text-sm font-semibold text-slate-900 mb-2">' + T('grant.create.report_template_sections') + '</h4>' +
            tmpl.template_sections.map(function(s, i) {
                return '<div class="flex items-center gap-2 py-1.5 border-b border-slate-100">' +
                    '<span class="text-brand-600 font-semibold text-sm">' + (i+1) + '.</span>' +
                    '<span class="font-medium text-sm text-slate-900">' + esc(s.title) + '</span>' +
                    (s.required ? '<span class="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-rose-50 text-rose-700">Required</span>' : '<span class="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 text-slate-600">Optional</span>') +
                    '</div>';
            }).join('') +
            '</div>';
    }

    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="text-base font-semibold text-slate-900 mb-1">' + T('grant.create.reporting_requirements') + '</h3>' +
        '<p class="text-sm text-slate-500 mb-4">' + T('grant.create.reporting_requirements_desc') + '</p>' +

        // Upload grant document
        '<div class="bg-emerald-50/50 border-2 border-dashed border-emerald-300 rounded-xl p-5 text-center mb-5">' +
        '<p class="font-semibold text-slate-900 mb-2">' + (d.grant_document ? icon('check-circle', 16, 'inline text-emerald-500') + ' ' + T('grant.create.grant_doc_uploaded') : icon('file-text', 16, 'inline text-slate-400') + ' ' + T('grant.create.upload_grant_doc')) + '</p>' +
        (d.grant_document && d._docOriginalName ? '<p class="text-xs text-emerald-700 mb-1"><strong>' + esc(d._docOriginalName) + '</strong>' +
            (d._docUploadTime ? ' — ' + T('grant.create.uploaded_at') + ' ' + esc(d._docUploadTime) : '') + '</p>' : '') +
        (d._extractionStatus === 'success' ? '<div id="extraction-result" data-extraction-status="success" data-extraction-count="' + (d._extractedCount || 0) + '" data-extraction-time="' + (d._extractionTimestamp || '') + '" class="bg-emerald-100 text-emerald-800 p-4 rounded-lg text-sm font-medium mb-3 border-2 border-emerald-400 shadow-sm">' +
            '<div class="text-base mb-1">' + icon('check-circle', 16, 'inline text-emerald-500') + ' ' + T('grant.create.ai_extraction_complete') + '</div>' +
            '<div>' + T('grant.create.extracted_count') + ' <strong>' + (d._extractedCount || 0) + '</strong> ' + T('grant.create.reporting_requirements').toLowerCase() +
            (d.report_template && d.report_template.template_sections ? ', <strong>' + d.report_template.template_sections.length + '</strong> ' + T('grant.create.template_sections') : '') +
            (d.report_template && d.report_template.indicators ? ', <strong>' + d.report_template.indicators.length + '</strong> ' + T('grant.create.indicators') : '') +
            '</div>' +
            (d._docUploadTime ? '<div class="text-xs text-emerald-600 font-normal mt-1">' + T('grant.create.processed_at') + ' ' + esc(d._docUploadTime) + '</div>' : '') +
            '</div>' :
         d._extractionStatus === 'empty' ? '<div id="extraction-result" data-extraction-status="empty" data-extraction-time="' + (d._extractionTimestamp || '') + '" class="bg-amber-50 text-amber-800 p-4 rounded-lg text-sm font-medium mb-3 border-2 border-amber-400 shadow-sm">' +
            '<div class="text-base mb-1">' + icon('alert-triangle', 16, 'inline text-amber-500') + ' ' + T('grant.create.no_reqs_found') + '</div>' +
            '<div>' + T('grant.create.no_reqs_found_desc') + '</div>' +
            (d._docUploadTime ? '<div class="text-xs font-normal mt-1">' + T('grant.create.attempted_at') + ' ' + esc(d._docUploadTime) + '</div>' : '') +
            '<button class="px-3 py-1.5 mt-2 bg-amber-100 border border-amber-400 text-amber-800 text-xs font-medium rounded-lg hover:bg-amber-200 transition-colors inline-flex items-center gap-1" onclick="document.getElementById(\'grant-doc-upload\').click();">' + icon('refresh-cw', 12) + ' ' + T('grant.create.retry_file') + '</button>' +
            '</div>' :
         d._extractionStatus === 'failed' ? '<div id="extraction-result" data-extraction-status="failed" data-extraction-time="' + (d._extractionTimestamp || '') + '" class="bg-rose-50 text-rose-800 p-4 rounded-lg text-sm font-medium mb-3 border-2 border-rose-400 shadow-sm">' +
            '<div class="text-base mb-1">' + icon('x-circle', 16, 'inline text-rose-500') + ' ' + T('grant.create.extraction_failed') + '</div>' +
            '<div>' + T('grant.create.extraction_failed_desc') + '</div>' +
            (d._docUploadTime ? '<div class="text-xs font-normal mt-1">' + T('grant.create.failed_at') + ' ' + esc(d._docUploadTime) + '</div>' : '') +
            '<button class="px-3 py-1.5 mt-2 bg-rose-100 border border-rose-400 text-rose-800 text-xs font-medium rounded-lg hover:bg-rose-200 transition-colors inline-flex items-center gap-1" onclick="document.getElementById(\'grant-doc-upload\').click();">' + icon('refresh-cw', 12) + ' ' + T('grant.create.retry_upload') + '</button>' +
            '</div>' : '') +
        (d._extractionStatus ? '' : '<p class="text-sm text-slate-500 mb-3">' + T('grant.create.upload_doc_desc') + '</p>') +
        '<input type="file" id="grant-doc-upload" class="hidden" accept=".pdf,.doc,.docx,.txt" onchange="uploadGrantDoc()">' +
        (!d._extractionStatus ? '<button class="px-4 py-2 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-1.5" onclick="document.getElementById(\'grant-doc-upload\').click();">' + icon('upload', 14) + ' ' +
            (d.grant_document ? T('grant.create.replace_document') : T('grant.create.choose_file')) + '</button>' : '') +
        (d._extractionStatus === 'success' ? '<button class="px-3 py-1.5 mt-2 bg-emerald-50 border border-emerald-300 text-emerald-700 text-xs font-medium rounded-lg hover:bg-emerald-100 transition-colors inline-flex items-center gap-1" onclick="document.getElementById(\'grant-doc-upload\').click();">' + icon('refresh-cw', 12) + ' ' + T('grant.create.upload_different_doc') + '</button>' : '') +
        (S._extractingReqs ? '<div id="extraction-result" class="ai-analyzing" data-upload-phase="' + (S._uploadPhase || 'processing') + '" class="mt-4 p-4 bg-blue-50 rounded-lg border-2 border-blue-300 text-center">' +
            '<div class="dot-pulse mb-2"><span></span><span></span><span></span></div>' +
            '<div class="text-sm font-semibold text-blue-800">' +
            (S._uploadPhase === 'saving_draft' ? (T('grant.create.saving_draft') || 'Saving draft…') :
             S._uploadPhase === 'uploading' ? (T('grant.create.uploading_doc') || 'Uploading document…') :
             T('grant.create.ai_analyzing')) + '</div>' +
            '<div class="text-xs text-blue-500 mt-1">' +
            (S._uploadPhase === 'saving_draft' ? (T('grant.create.saving_draft_wait') || 'Please wait while we save your grant…') :
             S._uploadPhase === 'uploading' ? (T('grant.create.uploading_wait') || 'Transferring file to server…') :
             T('grant.create.ai_analyzing_wait')) + '</div>' +
            (S.createData._docOriginalName ? '<div class="text-[11px] text-slate-500 mt-1.5">' + icon('file-text', 12, 'inline text-slate-400') + ' ' + esc(S.createData._docOriginalName) + '</div>' : '') +
            '</div>' : '') +
        '</div>' +

        // Reporting frequency
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.create.default_reporting_freq') + '</label>' +
        '<select class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" onchange="S.createData.reporting_frequency=this.value;">' +
        frequencies.map(function(f) {
            return '<option value="' + f.value + '"' + (d.reporting_frequency === f.value ? ' selected' : '') + '>' + f.label + '</option>';
        }).join('') +
        '</select>' +
        '</div>' +

        // Current requirements list
        '<div class="mt-4">' +
        '<h4 class="text-sm font-semibold text-slate-900 mb-2">' + T('grant.create.required_reports') + '</h4>' +
        reqsHTML +
        '</div>' +

        // Add requirement manually
        '<div class="mt-4 p-4 bg-slate-50 rounded-lg">' +
        '<h4 class="text-sm font-semibold text-slate-900 mb-2">' + T('grant.create.add_req_manually') + '</h4>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">' +
        '<div>' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('report.type') + '</label>' +
        '<select class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" id="new-req-type">' +
        reportTypes.map(function(t) { return '<option value="' + t + '">' + t.charAt(0).toUpperCase() + t.slice(1) + '</option>'; }).join('') +
        '</select>' +
        '</div>' +
        '<div>' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.create.title_label') + '</label>' +
        '<input type="text" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" id="new-req-title" placeholder="e.g., Quarterly Financial Report">' +
        '</div>' +
        '</div>' +
        '<div class="mb-3">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.create.description_label') + '</label>' +
        '<textarea class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" rows="2" id="new-req-desc" placeholder="Describe what should be included in this report..."></textarea>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">' +
        '<div>' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.create.frequency_label') + '</label>' +
        '<select class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" id="new-req-freq">' +
        frequencies.map(function(f) { return '<option value="' + f.value + '">' + f.label + '</option>'; }).join('') +
        '</select>' +
        '</div>' +
        '<div>' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.create.days_due_after_period') + '</label>' +
        '<input type="number" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" id="new-req-days" value="30" min="1" max="180">' +
        '</div>' +
        '</div>' +
        '<button class="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5" onclick="addReportingReq()">' + icon('plus', 14) + ' ' + T('grant.create.add_requirement') + '</button>' +
        '</div>' +

        // Template preview
        templateHTML +

        '</div>';
}

function addReportingReq() {
    var type = document.getElementById('new-req-type').value;
    var title = document.getElementById('new-req-title').value.trim();
    var desc = document.getElementById('new-req-desc').value.trim();
    var freq = document.getElementById('new-req-freq').value;
    var days = parseInt(document.getElementById('new-req-days').value) || 30;

    if (!title) { showToast(T('toast.please_enter_title'), 'warning'); return; }

    S.createData.reporting_requirements.push({
        type: type,
        title: title,
        description: desc,
        frequency: freq,
        due_days_after_period: days
    });
    render();
}

function removeReportingReq(index) {
    S.createData.reporting_requirements.splice(index, 1);
    render();
}

async function uploadGrantDoc() {
    var input = document.getElementById('grant-doc-upload');
    if (!input || !input.files.length) return;

    var file = input.files[0];
    var formData = new FormData();
    formData.append('file', file);

    // Client-side validations — reject before wasting bandwidth
    if (file.size === 0 || file.size < 100) {
        showToast(T('toast.file_empty') || 'File is empty or too small. Please upload a valid document.', 'error');
        input.value = '';
        return;
    }
    if (file.size > 16 * 1024 * 1024) {
        var sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        showToast((T('toast.file_too_large') || 'File too large') + ' (' + sizeMB + ' MB). Maximum size is 16 MB.', 'error');
        input.value = '';
        return;
    }

    telemetry('upload_started', { filename: file.name, size: file.size });

    // Immediately show the file name and uploading phase
    S.createData._docOriginalName = file.name;
    S.createData._docUploadTime = new Date().toLocaleTimeString();
    S._extractingReqs = true;
    S._uploadPhase = 'uploading';
    S.createStep = 5;
    render();

    // Need the grant ID - if editing, use it; otherwise save draft first
    var grantId = S.createData.id;
    if (!grantId) {
        S._uploadPhase = 'saving_draft';
        render();
        try {
            var saveRes = await api('POST', '/api/grants/', {
                title: S.createData.title || 'Draft Grant',
                description: S.createData.description || '',
                total_funding: parseFloat(S.createData.total_funding) || 0,
                currency: S.createData.currency || 'USD',
                deadline: S.createData.deadline || null,
                sectors: S.createData.sectors,
                countries: S.createData.countries,
                eligibility: S.createData.eligibility,
                criteria: S.createData.criteria,
                doc_requirements: S.createData.doc_requirements,
                status: 'draft'
            });
            if (saveRes && saveRes.grant) {
                grantId = saveRes.grant.id;
                S.createData.id = grantId;
            } else {
                S._extractingReqs = false;
                S._uploadPhase = '';
                S.createData._extractionStatus = 'failed';
                S.createData._extractionError = T('toast.draft_save_failed') || 'Failed to save draft before upload';
                showToast(T('toast.draft_save_failed') || 'Failed to save draft', 'error');
                telemetry('extraction_failed', { filename: file.name, reason: 'draft_save_failed' });
                render();
                _scrollToExtractionResult();
                return;
            }
        } catch (draftErr) {
            S._extractingReqs = false;
            S._uploadPhase = '';
            S.createData._extractionStatus = 'failed';
            S.createData._extractionError = T('toast.draft_save_failed') || 'Failed to save draft';
            showToast(T('toast.draft_save_failed') || 'Failed to save draft', 'error');
            telemetry('extraction_failed', { filename: file.name, reason: 'draft_exception' });
            render();
            _scrollToExtractionResult();
            return;
        }
    }

    // Upload the document + AI extraction
    S._uploadPhase = 'analyzing';
    render();

    var res = null;
    var uploadError = null;
    try {
        // AbortController for 120s timeout (AI extraction can take 30-60s)
        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, 120000);
        var resp = await fetch('/api/grants/' + grantId + '/upload-grant-doc', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: formData,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        var json = await resp.json();
        if (resp.status === 401) {
            S.user = null;
            nav('login');
            showToast(T('auth.session_expired'), 'error');
            S._extractingReqs = false;
            S._uploadPhase = '';
            render();
            return;
        }
        if (!resp.ok) {
            uploadError = json.error || 'Upload failed';
            res = null;
        } else {
            res = json;
        }
    } catch (uploadErr) {
        if (uploadErr && uploadErr.name === 'AbortError') {
            uploadError = T('toast.upload_timeout') || 'Upload timed out. The file may be too large or the server is busy. Please try again.';
        } else {
            uploadError = T('toast.network_error') || 'Network error -- please check your connection and try again';
        }
        res = null;
    }

    S._extractingReqs = false;
    S._uploadPhase = '';

    if (res && res.success) {
        S.createData.grant_document = res.grant_document || S.createData.grant_document;
        S.createData._docOriginalName = res.original_filename || file.name || 'Document';
        S.createData._docUploadTime = new Date().toLocaleTimeString();

        // Robustly extract requirements from any response shape
        var ext = res.extracted_requirements || {};
        if (typeof ext !== 'object') ext = {};
        var reqs = ext.requirements || ext.reporting_requirements || [];
        if (!Array.isArray(reqs)) reqs = [];

        if (reqs.length > 0) {
            S.createData.reporting_requirements = reqs;
            S.createData._extractionStatus = 'success';
            S.createData._extractedCount = reqs.length;
        } else {
            S.createData._extractionStatus = 'empty';
            S.createData._extractedCount = 0;
        }

        if (ext.reporting_frequency) {
            S.createData.reporting_frequency = ext.reporting_frequency;
        }
        var sections = Array.isArray(ext.template_sections) ? ext.template_sections : [];
        var indicators = Array.isArray(ext.indicators) ? ext.indicators : [];
        if (sections.length || indicators.length) {
            S.createData.report_template = {
                template_sections: sections,
                indicators: indicators
            };
        }

        S.createData._extractionTimestamp = new Date().toISOString();
        S.createData._extractionError = '';
        if (S.createData._extractionStatus === 'success') {
            showToast(T('toast.ai_extracted_reqs', {count: S.createData._extractedCount}) || ('AI extracted ' + S.createData._extractedCount + ' reporting requirements.'), 'success');
        } else {
            showToast(T('toast.doc_uploaded_no_reqs') || 'Document uploaded but no requirements could be extracted. You can add them manually.', 'warning');
        }
        telemetry('upload_completed', { filename: file.name, extracted: S.createData._extractionStatus === 'success', req_count: (S.createData._extractedCount || 0) });
    } else {
        S.createData._extractionStatus = 'failed';
        S.createData._extractedCount = 0;
        S.createData._extractionTimestamp = new Date().toISOString();
        S.createData._extractionError = uploadError || T('toast.upload_failed') || 'Upload failed — please try again';
        S.createData._docUploadTime = new Date().toLocaleTimeString();
        showToast(S.createData._extractionError, 'error');
        telemetry('extraction_failed', { filename: file.name, error: uploadError });
    }

    // Force wizard back to Reporting step so extraction status is always visible
    S.createStep = 5;
    render();
    _scrollToExtractionResult();
}

function _scrollToExtractionResult() {
    // Scroll to extraction result after DOM update (350ms to ensure render completes)
    setTimeout(function() {
        var el = document.getElementById('extraction-result');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);
}

function renderCreateReview() {
    var d = S.createData;
    var totalWeight = (d.criteria || []).reduce(function(sum, c) { return sum + (Number(c.weight) || 0); }, 0);

    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="text-base font-semibold text-slate-900 mb-4">' + T('grant.create.review_publish') + '</h3>' +

        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-6">' +
        '<div>' +
        '<h4 class="font-semibold text-slate-900 mb-2">' + T('grant.create.basic_information') + '</h4>' +
        '<div class="text-sm space-y-1">' +
        '<p><strong class="text-slate-600">' + T('grant.create.review_title') + '</strong> ' + esc(d.title || 'Not set') + '</p>' +
        '<p><strong class="text-slate-600">' + T('grant.create.review_funding') + '</strong> ' + formatCurrency(d.total_funding, d.currency) + '</p>' +
        '<p><strong class="text-slate-600">' + T('grant.create.review_deadline') + '</strong> ' + formatDate(d.deadline) + '</p>' +
        '<p><strong class="text-slate-600">' + T('grant.create.review_sectors') + '</strong> ' + esc((d.sectors || []).join(', ') || 'None') + '</p>' +
        '<p><strong class="text-slate-600">' + T('grant.create.review_countries') + '</strong> ' + esc((d.countries || []).join(', ') || 'None') + '</p>' +
        '</div>' +
        '</div>' +
        '<div>' +
        '<h4 class="font-semibold text-slate-900 mb-2">' + T('grant.create.configuration') + '</h4>' +
        '<div class="text-sm space-y-1">' +
        '<p><strong class="text-slate-600">' + T('grant.create.review_eligibility') + '</strong> ' + (d.eligibility || []).length + '</p>' +
        '<p><strong class="text-slate-600">' + T('grant.create.review_criteria') + '</strong> ' + (d.criteria || []).length +
        ' (' + T('grant.create.review_total_weight') + ' ' + totalWeight + '%' + (totalWeight === 100 ? ' ' + icon('check', 12, 'inline text-emerald-500') : ' ' + icon('alert-triangle', 12, 'inline text-amber-500')) + ')</p>' +
        '<p><strong class="text-slate-600">' + T('grant.create.review_doc_reqs') + '</strong> ' + (d.doc_requirements || []).length + '</p>' +
        '<p><strong class="text-slate-600">' + T('grant.create.review_reporting_reqs') + '</strong> ' + (d.reporting_requirements || []).length + '</p>' +
        '<p><strong class="text-slate-600">' + T('grant.create.review_reporting_freq') + '</strong> ' + esc(d.reporting_frequency || 'quarterly') + '</p>' +
        '</div>' +
        '</div>' +
        '</div>' +

        ((!d.title || !d.total_funding || !d.deadline) ?
            '<div class="bg-amber-50 p-3 rounded-lg mt-4 border-l-[3px] border-amber-400">' +
            '<strong class="text-amber-800 flex items-center gap-1">' + icon('alert-triangle', 14, 'text-amber-500') + ' ' + T('grant.create.fill_required_warning') + '</strong>' +
            (!d.title ? '<br><span class="text-amber-700 text-sm">- ' + T('grant.create.grant_title') + '</span>' : '') +
            (!d.total_funding ? '<br><span class="text-amber-700 text-sm">- ' + T('grant.create.total_funding') + '</span>' : '') +
            (!d.deadline ? '<br><span class="text-amber-700 text-sm">- ' + T('grant.create.deadline') + '</span>' : '') +
            '</div>' : '') +

        (totalWeight !== 100 && (d.criteria || []).length > 0 ?
            '<div class="bg-amber-50 p-3 rounded-lg mt-3 border-l-[3px] border-amber-400">' +
            '<strong class="text-amber-800 flex items-center gap-1">' + icon('alert-triangle', 14, 'text-amber-500') + ' ' + T('grant.create.criteria_weight_warning', {weight: totalWeight}) + '</strong>' +
            '</div>' : '') +

        '</div>';
}

async function saveGrantDraft() {
    var d = S.createData;
    if (!d.title) {
        showToast(T('grant.create.title_required') || 'Please enter a grant title before saving.', 'warning');
        return;
    }
    // Show saving state
    S.createData._draftSaving = true;
    render();
    var method = d.id ? 'PUT' : 'POST';
    var url = d.id ? '/api/grants/' + d.id : '/api/grants/';
    try {
        var res = await api(method, url, {
            title: d.title, description: d.description,
            total_funding: Number(d.total_funding) || 0,
            currency: d.currency, deadline: d.deadline,
            sectors: d.sectors, countries: d.countries,
            eligibility: d.eligibility, criteria: d.criteria,
            doc_requirements: d.doc_requirements,
            reporting_requirements: d.reporting_requirements,
            reporting_frequency: d.reporting_frequency,
            report_template: d.report_template,
            status: 'draft'
        });
        S.createData._draftSaving = false;
        if (res) {
            S.createData.id = (res.grant || res).id || d.id;
            S.createData._lastSavedAt = new Date().toLocaleTimeString();
            S.createData._lastSavedIso = new Date().toISOString();
            S.createData._draftSaveSuccess = true;
            showToast(T('grant.create.draft_saved') || 'Draft saved successfully.', 'success');
        } else {
            S.createData._draftSaveSuccess = false;
            showToast(T('grant.create.draft_save_error') || 'Failed to save draft. Please try again.', 'error');
        }
    } catch (err) {
        S.createData._draftSaving = false;
        S.createData._draftSaveSuccess = false;
        showToast(T('grant.create.draft_save_error') || 'Failed to save draft. Please check your connection.', 'error');
    }
    render();
}

async function publishGrant() {
    var d = S.createData;
    if (!d.title || !d.total_funding || !d.deadline) {
        showToast(T('common.required_field'), 'warning');
        return;
    }
    var method = d.id ? 'PUT' : 'POST';
    var url = d.id ? '/api/grants/' + d.id : '/api/grants/';
    var res = await api(method, url, {
        title: d.title, description: d.description,
        total_funding: Number(d.total_funding) || 0,
        currency: d.currency, deadline: d.deadline,
        sectors: d.sectors, countries: d.countries,
        eligibility: d.eligibility, criteria: d.criteria,
        doc_requirements: d.doc_requirements,
        reporting_requirements: d.reporting_requirements,
        reporting_frequency: d.reporting_frequency,
        report_template: d.report_template,
        status: 'draft'
    });
    if (res) {
        var grantId = (res.grant || res).id;
        if (grantId) {
            var pubRes = await api('POST', '/api/grants/' + grantId + '/publish');
            if (pubRes) {
                showToast(T('grant.create.published_success'), 'success');
                S.createStep = 1;
                S.createData = {
                    title: '', description: '', total_funding: '', currency: 'USD',
                    deadline: '', sectors: [], countries: [],
                    eligibility: [], criteria: [], doc_requirements: [],
                    reporting_requirements: [],
                    reporting_frequency: 'quarterly',
                    report_template: {},
                    grant_document: null
                };
                // Flag for loadMyGrants to retry if list is stale
                S._justPublished = true;
                // Brief delay so DB commit is visible before grants list fetch
                setTimeout(function() { nav('mygrants'); }, 400);
                return;
            }
        }
        showToast(T('toast.grant_created_publish_later'), 'info');
        S._justPublished = true;
        setTimeout(function() { nav('mygrants'); }, 400);
    }
}

// =============================================================================
// 25. Applicant Rankings
// =============================================================================

function renderApplicantRankings() {
    loadRankingsData();
    var grantOptions = S.grants.map(function(g) {
        return '<option value="' + g.id + '"' + (S._rankingsGrantId == g.id ? ' selected' : '') + '>' + esc(g.title) + '</option>';
    }).join('');

    return '<div class="mb-8 animate-fade-in"><h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('star', 24, 'text-amber-500') + ' ' + T('dashboard.action.review_apps') + '</h1></div>' +

        '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-6">' +
        '<div class="flex gap-4 items-end">' +
        '<div class="flex-1">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('ranking.select_grant') + '</label>' +
        '<select class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" onchange="loadRankingsByGrant(this.value);">' +
        '<option value="">-- Select a Grant --</option>' +
        grantOptions +
        '</select>' +
        '</div>' +
        '</div>' +
        '</div>' +

        '<div id="rankings-table">' +
        (S._rankingsApps && S._rankingsApps.length ?
            renderRankingsTable(S._rankingsApps) :
            '<div class="bg-white rounded-xl border border-slate-200/60 p-12 text-center">' +
            '<div class="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">' + icon('clipboard-list', 22, 'text-slate-400') + '</div>' +
            '<p class="text-sm text-slate-400">Select a grant to view applications.</p></div>') +
        '</div>';
}

function renderRankingsTable(apps) {
    if (!apps.length) return '<div class="bg-white rounded-xl border border-slate-200/60 p-8 text-center"><p class="text-sm text-slate-400">No applications for this grant.</p></div>';

    var sorted = apps.slice().sort(function(a, b) { return (b.final_score || b.ai_score || 0) - (a.final_score || a.ai_score || 0); });

    return '<div class="bg-white rounded-xl border border-slate-200/60 overflow-hidden overflow-x-auto"><table class="w-full">' +
        '<thead><tr class="bg-slate-50 border-b border-slate-200"><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">#</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('verification.organization') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('verification.country') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('dashboard.stat.capacity_score') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('ranking.ai_score') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('ranking.human_score') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('ranking.final_score') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('application.tab.status') + '</th><th class="px-4 py-3"></th></tr></thead>' +
        '<tbody class="divide-y divide-slate-100">' +
        sorted.map(function(a, i) {
            var aiScoreColor = a.ai_score >= 70 ? 'text-emerald-600' : 'text-amber-500';
            return '<tr class="hover:bg-slate-50/80 transition-colors cursor-pointer" onclick="viewApplication(' + a.id + ')">' +
                '<td class="px-4 py-3.5 text-sm font-semibold text-slate-900">' + (i + 1) + '</td>' +
                '<td class="px-4 py-3.5 text-sm font-medium text-slate-900">' + esc(a.org_name || a.applicant_name || '') + '</td>' +
                '<td class="px-4 py-3.5 text-sm text-slate-600">' + esc(a.country || '') + '</td>' +
                '<td class="px-4 py-3.5 text-sm text-slate-600">' + (a.capacity_score != null ? a.capacity_score + '%' : '<span class="text-slate-300">-</span>') + '</td>' +
                '<td class="px-4 py-3.5 text-sm font-semibold ' + aiScoreColor + '">' + (a.ai_score != null ? a.ai_score + '%' : '<span class="text-slate-300">-</span>') + '</td>' +
                '<td class="px-4 py-3.5 text-sm text-slate-600">' + (a.human_score != null ? a.human_score + '%' : '<span class="text-slate-300">-</span>') + '</td>' +
                '<td class="px-4 py-3.5 text-sm font-bold text-slate-900">' + (a.final_score != null ? a.final_score + '%' : '<span class="text-slate-300">-</span>') + '</td>' +
                '<td class="px-4 py-3.5">' + statusBadge(a.status) + '</td>' +
                '<td class="px-4 py-3.5 whitespace-nowrap">' +
                '<button class="px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-1" onclick="event.stopPropagation();nav(\'scoreapp\',{selectedApplication:null});viewAndScore(' + a.id + ');">' + icon('pencil', 14) + ' Score</button> ' +
                (a.status !== 'awarded' ? '<button class="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-1 ml-1" onclick="event.stopPropagation();awardGrant(' + a.id + ');">' + icon('trophy', 14, 'text-amber-500') + ' Award</button>' : '') +
                '</td></tr>';
        }).join('') +
        '</tbody></table></div>';
}

async function loadRankingsData() {
    if (S._rankingsLoading) return;
    S._rankingsLoading = true;
    var res = await api('GET', '/api/grants/');
    S._rankingsLoading = false;
    if (res && res.grants) S.grants = res.grants;
}

async function loadRankingsByGrant(grantId) {
    if (!grantId) { S._rankingsApps = []; render(); return; }
    S._rankingsGrantId = grantId;
    var res = await api('GET', '/api/applications/?grant_id=' + grantId);
    if (res && res.applications) {
        S._rankingsApps = res.applications;
        var el = document.getElementById('rankings-table');
        if (el) el.innerHTML = renderRankingsTable(res.applications);
    }
}

async function viewAndScore(appId) {
    var res = await api('GET', '/api/applications/' + appId);
    if (res) {
        S.selectedApplication = res.application || res;
        S.scoreData = {};
        S.scoreComments = {};
        nav('scoreapp');
    }
}

async function awardGrant(appId) {
    var res = await api('PUT', '/api/applications/' + appId, { status: 'awarded' });
    if (res) {
        showToast(T('toast.saved'), 'success');
        if (S._rankingsGrantId) loadRankingsByGrant(S._rankingsGrantId);
    }
}

// =============================================================================
// 26. Score Application
// =============================================================================

function renderScoreApp() {
    var a = S.selectedApplication;
    if (!a) return '<div class="mb-8 animate-fade-in"><h1 class="text-2xl font-bold text-slate-900">' + T('review.submit_review') + '</h1><p class="text-sm text-slate-500">' + T('common.loading') + '</p></div>';

    var responses = a.responses || {};
    var criteria = a.grant_criteria || a.criteria || [];
    var responseKeys = Object.keys(responses);

    // If no structured criteria, use response keys
    if (!criteria.length && responseKeys.length) {
        criteria = responseKeys.map(function(k, i) {
            return { label: k.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }), key: k, weight: Math.round(100 / responseKeys.length) };
        });
    }

    var totalScore = 0;
    var totalWeight = 0;
    criteria.forEach(function(c, i) {
        var key = c.key || ('criterion_' + i);
        var w = Number(c.weight) || 0;
        var s = Number(S.scoreData[key]) || 0;
        totalScore += s * (w / 100);
        totalWeight += w;
    });
    var weightedScore = totalWeight > 0 ? Math.round(totalScore) : 0;

    var role = (S.user.role || '').toLowerCase();
    var backPage = role === 'reviewer' ? 'assignments' : 'rankings';

    return '<button class="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-4 transition-colors" onclick="nav(\'' + backPage + '\')">' + icon('arrow-left', 16) + ' ' + T('common.back') + '</button>' +

        '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-6">' +
        '<div class="flex justify-between items-center">' +
        '<div>' +
        '<h1 class="text-xl font-bold text-slate-900">' + esc(a.grant_title || a.grant_name || 'Application') + '</h1>' +
        '<p class="text-sm text-slate-500">' + esc(a.org_name || a.applicant_name || '') + '</p>' +
        '</div>' +
        '<div class="text-center">' +
        scoreRingHTML(weightedScore, 80, 'Score') +
        '</div>' +
        '</div></div>' +

        criteria.map(function(c, i) {
            var key = c.key || ('criterion_' + i);
            var respKey = key;
            var responseText = responses[respKey] || responses['criterion_' + i] || '';
            var currentScore = S.scoreData[key] || '';
            var currentComment = S.scoreComments[key] || '';

            return '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-4">' +
                '<div class="flex gap-6 flex-wrap">' +
                // Left: Response
                '<div class="flex-1 min-w-[300px]">' +
                '<div class="flex justify-between items-center mb-2">' +
                '<h3 class="font-semibold text-slate-900">' + esc(c.label || c.name || 'Criterion') + '</h3>' +
                statusBadge(T('grant.create.weight') + ': ' + (c.weight || 0) + '%', 'blue') +
                '</div>' +
                '<div class="bg-slate-50 p-3 rounded-lg text-sm text-slate-600 max-h-72 overflow-y-auto whitespace-pre-wrap">' +
                esc(responseText || 'No response provided.') +
                '</div>' +
                '</div>' +
                // Right: Scoring
                '<div class="w-72 flex-shrink-0">' +
                '<div class="mb-4">' +
                '<label class="block text-xs font-medium text-slate-600 mb-1">Score (0-100)</label>' +
                '<input type="number" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" min="0" max="100" ' +
                'value="' + esc(currentScore) + '" ' +
                'oninput="S.scoreData[\'' + key + '\']=Number(this.value);">' +
                '<input type="range" min="0" max="100" value="' + (currentScore || 0) + '" ' +
                'class="w-full mt-2 accent-brand-600" ' +
                'oninput="S.scoreData[\'' + key + '\']=Number(this.value);this.previousElementSibling.previousElementSibling.value=this.value;">' +
                '</div>' +
                '<div class="mb-4">' +
                '<label class="block text-xs font-medium text-slate-600 mb-1">Comment</label>' +
                '<textarea class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" rows="3" placeholder="Feedback..." ' +
                'oninput="S.scoreComments[\'' + key + '\']=this.value;">' + esc(currentComment) + '</textarea>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>';
        }).join('') +

        // Document Scores
        (a.documents && a.documents.length ? '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-4">' +
            '<h3 class="font-semibold text-slate-900 mb-3">' + T('application.document_analysis') + '</h3>' +
            a.documents.map(function(d) {
                return '<div class="flex items-center gap-3 py-2 border-b border-slate-100">' +
                    '<span class="text-slate-400">' + icon('file-text', 16) + '</span>' +
                    '<span class="flex-1 font-medium text-sm text-slate-700">' + esc(d.name || d.filename || d.type) + '</span>' +
                    (d.ai_analysis ? statusBadge('AI: ' + d.ai_analysis.score + '%', d.ai_analysis.score >= 70 ? 'green' : 'amber') : '') +
                    '</div>';
            }).join('') +
            '</div>' : '') +

        '<div class="flex gap-3 mt-6">' +
        '<button class="px-4 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="submitScores()">' + icon('send', 16) + ' ' + T('review.submit_review') + '</button>' +
        '<button class="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="aiScoreApplication();">' + icon('sparkles', 16, 'text-amber-500') + ' AI Auto-Score</button>' +
        '</div>';
}

async function submitScores() {
    var a = S.selectedApplication;
    if (!a) return;
    var reviewId = a.review_id;
    var role = (S.user.role || '').toLowerCase();

    if (role === 'reviewer' && reviewId) {
        var res = await api('PUT', '/api/reviews/' + reviewId, {
            scores: S.scoreData,
            comments: S.scoreComments
        });
        if (res) {
            await api('POST', '/api/reviews/' + reviewId + '/complete');
            showToast(T('review.submitted_success'), 'success');
            nav('assignments');
            return;
        }
    } else {
        var res2 = await api('PUT', '/api/applications/' + a.id, {
            scores: S.scoreData,
            comments: S.scoreComments,
            status: 'scored'
        });
        if (res2) {
            showToast(T('toast.saved'), 'success');
            nav('rankings');
            return;
        }
    }
}

async function aiScoreApplication() {
    var a = S.selectedApplication;
    if (!a) return;
    showToast(T('toast.ai_scoring'), 'info');
    var res = await api('POST', '/api/ai/score-application', { application_id: a.id });
    if (res && res.scores) {
        S.scoreData = res.scores;
        showToast(T('toast.saved'), 'success');
        render();
    }
}

// =============================================================================
// 27. Assessment Hub
// =============================================================================

function renderAssessmentHub() {
    loadAssessments();
    var stats = S.dashboardStats || {};
    var score = stats.assessment_score || stats.average_score || stats.capacity_score || 0;
    var cap = capacityLabel(score);
    var categories = stats.category_scores || {};

    return '<div class="mb-8 animate-fade-in"><h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('clipboard-check', 24, 'text-brand-600') + ' ' + T('assessment.title') + '</h1></div>' +

        '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-6">' +
        '<div class="flex items-center gap-8 flex-wrap">' +
        '<div class="text-center">' +
        scoreRingHTML(score, 120, '%') +
        '</div>' +
        '<div class="flex-1">' +
        '<h2 class="text-xl font-bold text-slate-900">' + T('dashboard.stat.capacity_score') + '</h2>' +
        '<p class="mt-1 text-base">Level: ' + statusBadge(cap.label, cap.color) + '</p>' +
        '<div class="mt-4">' +
        Object.keys(categories).map(function(k) {
            var val = categories[k] || 0;
            var barColor = val >= 70 ? 'bg-emerald-500' : val >= 50 ? 'bg-amber-500' : 'bg-rose-500';
            return '<div class="mb-2">' +
                '<div class="flex justify-between text-sm mb-1">' +
                '<span class="text-slate-600">' + esc(k.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); })) + '</span>' +
                '<span class="font-semibold text-slate-900">' + val + '%</span></div>' +
                '<div class="h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full ' + barColor + '" style="width:' + val + '%"></div></div>' +
                '</div>';
        }).join('') +
        '</div>' +
        '</div>' +
        '</div></div>' +

        '<div class="mb-6">' +
        '<h2 class="text-lg font-semibold text-slate-900 mb-4">' + T('assessment.previous_assessments') + '</h2>' +
        '<div id="assessment-history">' + renderLoadingTable() + '</div>' +
        '</div>' +

        // Framework selection cards
        '<div class="mt-6">' +
        '<h2 class="text-lg font-semibold text-slate-900 mb-4">' + T('assessment.start_new') + '</h2>' +
        '<p class="text-slate-500 text-sm mb-4">Choose an assessment framework that best fits your needs and donor requirements.</p>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">' +

        renderFrameworkCard('kuja', T('assessment.framework.kuja'), T('assessment.framework.kuja_desc'), '26 items', '30-45 min') +
        renderFrameworkCard('step', T('assessment.framework.step'), T('assessment.framework.step_desc'), '26 items', '45-60 min') +
        renderFrameworkCard('un_hact', T('assessment.framework.un_hact'), T('assessment.framework.un_hact_desc'), '22 items', '45-60 min') +
        renderFrameworkCard('chs', T('assessment.framework.chs'), T('assessment.framework.chs_desc'), '27 items', '60-90 min') +
        renderFrameworkCard('nupas', T('assessment.framework.nupas'), T('assessment.framework.nupas_desc'), '27 items', '60-90 min') +

        '</div>' +
        '<button class="mt-4 px-4 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="startAssessment()">' +
        icon(score > 0 ? 'refresh-cw' : 'clipboard-check', 16) + ' ' + T('assessment.start_new') +
        '</button>' +
        '</div>';
}

function renderFrameworkCard(id, name, desc, items, time) {
    var selected = S.selectedFramework === id;
    return '<div class="bg-white rounded-xl p-4 cursor-pointer border-2 transition-all duration-200 hover:shadow-md ' + (selected ? 'border-brand-600' : 'border-slate-200') + '" ' +
        'onclick="S.selectedFramework=\'' + id + '\';render();">' +
        '<div class="flex justify-between items-center">' +
        '<h4 class="text-sm font-semibold text-slate-900">' + esc(name) + '</h4>' +
        (selected ? statusBadge('Selected', 'green') : '') +
        '</div>' +
        '<p class="text-sm text-slate-500 mt-1">' + esc(desc) + '</p>' +
        '<div class="flex gap-3 mt-2">' +
        '<span class="text-xs text-slate-400 inline-flex items-center gap-1">' + icon('clipboard-list', 12) + ' ' + items + '</span>' +
        '<span class="text-xs text-slate-400 inline-flex items-center gap-1">' + icon('clock', 12) + ' ' + time + '</span>' +
        '</div>' +
        '</div>';
}

async function loadAssessments() {
    // Issue #11: Add timeout + error state instead of infinite loading
    var timeout = setTimeout(function() {
        var el = document.getElementById('assessment-history');
        if (el && el.innerHTML.indexOf('spinner') > -1) {
            el.innerHTML = '<div class="bg-white rounded-xl border border-slate-200/60 p-8 text-center text-slate-400">' +
                '<p>' + icon('alert-triangle', 20, 'text-amber-400 inline') + ' ' + (T('common.load_timeout') || 'Loading timed out. Please try again.') + '</p>' +
                '<button class="mt-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-1" onclick="loadAssessments()">' + icon('refresh-cw', 14) + ' Retry</button>' +
                '</div>';
        }
    }, 15000);

    var res = await api('GET', '/api/assessments/');
    clearTimeout(timeout);
    var el = document.getElementById('assessment-history');
    if (!el) return;

    if (res && res.assessments) {
        S.assessments = res.assessments;
        if (S.assessments.length) {
            el.innerHTML = '<div class="bg-white rounded-xl border border-slate-200/60 overflow-hidden overflow-x-auto"><table class="w-full">' +
                '<thead><tr class="bg-slate-50 border-b border-slate-200"><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('common.date') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('assessment.framework_label') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('assessment.score') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('assessment.level') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('application.tab.status') + '</th></tr></thead><tbody class="divide-y divide-slate-100">' +
                S.assessments.map(function(a) {
                    var sc = a.overall_score || a.score || 0;
                    var c = capacityLabel(sc);
                    return '<tr class="hover:bg-slate-50/80 transition-colors"><td class="px-4 py-3.5 text-sm text-slate-600">' + formatDate(a.created_at || a.date) + '</td>' +
                        '<td class="px-4 py-3.5 text-sm text-slate-600">' + esc((a.framework || 'kuja').toUpperCase()) + '</td>' +
                        '<td class="px-4 py-3.5 text-sm font-semibold text-slate-900">' + sc + '%</td>' +
                        '<td class="px-4 py-3.5">' + statusBadge(c.label, c.color) + '</td>' +
                        '<td class="px-4 py-3.5">' + statusBadge(a.status || 'completed') + '</td></tr>';
                }).join('') +
                '</tbody></table></div>';
        } else {
            el.innerHTML = '<div class="bg-white rounded-xl border border-slate-200/60 p-8 text-center text-slate-400">' +
                '<p class="text-sm">' + T('assessment.no_assessments') + '</p></div>';
        }
    } else {
        el.innerHTML = '<div class="bg-white rounded-xl border border-slate-200/60 p-8 text-center text-slate-400">' +
            '<p>' + icon('alert-triangle', 20, 'text-amber-400 inline') + ' ' + (T('common.load_error') || 'Failed to load assessments.') + '</p>' +
            '<button class="mt-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-1" onclick="loadAssessments()">' + icon('refresh-cw', 14) + ' Retry</button>' +
            '</div>';
    }
}

// =============================================================================
// 28. Assessment Wizard
// =============================================================================

function renderAssessmentWizard() {
    var step = S.assessStep;
    var steps = [
        { num: 1, label: T('assessment.step1') },
        { num: 2, label: T('assessment.step2') },
        { num: 3, label: T('assessment.step3') },
        { num: 4, label: T('assessment.step4') }
    ];

    var stepContent = '';
    switch (step) {
        case 1: stepContent = renderAssessProfile(); break;
        case 2: stepContent = renderAssessChecklist(); break;
        case 3: stepContent = renderAssessDocUpload(); break;
        case 4: stepContent = renderAssessResults(); break;
    }

    return '<div class="mb-8 animate-fade-in"><h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('clipboard-check', 24, 'text-brand-600') + ' ' + T('assessment.title') + '</h1></div>' +
        renderWizardSteps(steps, step) +
        '<div class="wizard-content">' + stepContent + '</div>' +
        '<div class="wizard-actions">' +
        (step > 1 && step < 4 ? '<button class="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="S.assessStep--;render();window.scrollTo(0,0);">' + icon('arrow-left', 16) + ' ' + T('common.previous') + '</button>' : '<div></div>') +
        (step < 3 ? '<button class="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="S.assessStep++;render();window.scrollTo(0,0);">' + T('common.next') + ' ' + icon('arrow-right', 16) + '</button>' :
            step === 3 ? '<button class="px-4 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="submitAssessment()">' + icon('check-circle', 16) + ' ' + T('assessment.complete') + '</button>' :
                '<button class="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="nav(\'assessment\')">' + icon('arrow-left', 16) + ' ' + T('common.back') + '</button>') +
        '</div>';
}

function renderAssessProfile() {
    var p = S.assessOrgProfile;
    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="font-semibold text-slate-900 mb-1">' + T('assessment.step1') + '</h3>' +
        '<p class="text-slate-500 text-sm mb-4">Review and confirm your organization details.</p>' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('org.name') + '</label>' +
        '<input type="text" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" value="' + esc(p.name || S.user.org_name || '') + '" ' +
        'oninput="S.assessOrgProfile.name=this.value;">' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('org.country') + '</label>' +
        '<input type="text" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" value="' + esc(p.country || '') + '" ' +
        'oninput="S.assessOrgProfile.country=this.value;">' +
        '</div>' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('org.year_established') + '</label>' +
        '<input type="number" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" value="' + esc(p.year_established || '') + '" ' +
        'oninput="S.assessOrgProfile.year_established=this.value;">' +
        '</div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('org.annual_budget') + '</label>' +
        '<input type="text" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" value="' + esc(p.annual_budget || '') + '" placeholder="e.g., $500,000" ' +
        'oninput="S.assessOrgProfile.annual_budget=this.value;">' +
        '</div>' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('assessment.number_of_staff') + '</label>' +
        '<input type="number" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" value="' + esc(p.staff_count || '') + '" ' +
        'oninput="S.assessOrgProfile.staff_count=this.value;">' +
        '</div>' +
        '</div>' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('assessment.mission_statement') + '</label>' +
        '<textarea class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" rows="3" ' +
        'oninput="S.assessOrgProfile.mission=this.value;">' + esc(p.mission || '') + '</textarea>' +
        '</div>' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('assessment.key_sectors') + '</label>' +
        '<input type="text" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" value="' + esc(p.sectors || '') + '" placeholder="Health, Education, etc." ' +
        'oninput="S.assessOrgProfile.sectors=this.value;">' +
        '</div>' +
        '</div>';
}

function renderAssessChecklist() {
    var framework = S.selectedFramework || 'kuja';
    var categories = FRAMEWORK_CHECKLISTS[framework] || FRAMEWORK_CHECKLISTS['kuja'];

    var html = '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="font-semibold text-slate-900 mb-1">' + T('assessment.step2') + '</h3>' +
        '<p class="text-slate-500 text-sm mb-1">Framework: <strong class="text-slate-900">' + esc(framework.toUpperCase().replace(/_/g, ' ')) + '</strong></p>' +
        '<p class="text-slate-500 text-sm mb-4">Check each item that your organization has in place.</p>';

    Object.keys(categories).forEach(function(catName) {
        var items = categories[catName];
        html += '<div class="mb-5">' +
            '<h4 class="text-sm font-semibold text-slate-700 mb-2 pb-1 border-b border-slate-200">' + esc(catName) + '</h4>';

        items.forEach(function(item) {
            var checked = S.assessChecklist[item.key] ? ' checked' : '';
            html += '<label class="flex items-center gap-3 py-2 cursor-pointer border-b border-slate-50 hover:bg-slate-50/50 rounded transition-colors">' +
                '<input type="checkbox"' + checked + ' onchange="S.assessChecklist[\'' + item.key + '\']=this.checked;" class="w-4.5 h-4.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500/20">' +
                '<span class="text-sm text-slate-700">' + esc(item.label) + '</span>' +
                '</label>';
        });

        html += '</div>';
    });

    html += '</div>';
    return html;
}

function renderAssessDocUpload() {
    var docTypes = [
        { key: 'registration', label: 'Registration Certificate', iconName: 'scroll' },
        { key: 'financial', label: 'Financial Statements', iconName: 'bar-chart-3' },
        { key: 'audit', label: 'Audit Report', iconName: 'search' },
        { key: 'psea', label: 'PSEA Policy', iconName: 'shield' },
        { key: 'strategic', label: 'Strategic Plan', iconName: 'clipboard-list' }
    ];

    return '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="font-semibold text-slate-900 mb-1">' + T('assessment.step3') + '</h3>' +
        '<p class="text-slate-500 text-sm mb-4">Upload documents to support your assessment.</p>' +

        docTypes.map(function(dt) {
            var uploaded = S.assessDocuments[dt.key];
            return '<div class="mb-4">' +
                '<div class="flex items-center gap-3 mb-2">' +
                '<span class="text-slate-500">' + icon(dt.iconName, 20) + '</span>' +
                '<strong class="text-sm text-slate-900">' + esc(dt.label) + '</strong>' +
                (uploaded ? statusBadge('Uploaded', 'green') : '') +
                '</div>' +
                (uploaded ?
                    '<div class="flex items-center gap-3 p-2 rounded-lg bg-slate-50">' +
                    '<span class="text-slate-400">' + icon('file-text', 16) + '</span>' +
                    '<div class="flex-1 min-w-0"><div class="text-sm font-medium text-slate-700 truncate">' + esc(uploaded.name) + '</div></div>' +
                    '</div>' :
                    '<div class="border-2 border-dashed border-slate-200 rounded-lg p-5 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors" onclick="triggerAssessUpload(\'' + dt.key + '\')">' +
                    '<div class="text-sm text-slate-500"><strong class="text-brand-600">' + T('common.click_to_upload') + '</strong> ' + esc(dt.label) + '</div>' +
                    '</div>' +
                    '<input type="file" id="assess-file-' + dt.key + '" style="display:none;" ' +
                    'accept=".pdf,.doc,.docx" onchange="handleAssessUpload(event,\'' + dt.key + '\')">'
                ) +
                '</div>';
        }).join('') +

        '</div>';
}

function triggerAssessUpload(key) {
    var input = document.getElementById('assess-file-' + key);
    if (input) input.click();
}

async function handleAssessUpload(e, key) {
    var files = e.target.files;
    if (!files.length) return;
    var file = files[0];
    var fd = new FormData();
    fd.append('file', file);
    fd.append('type', key);
    var res = await api('POST', '/api/documents/upload', fd);
    if (res) {
        S.assessDocuments[key] = { id: res.id, name: file.name, ai_analysis: res.ai_analysis };
        showToast(T('toast.uploaded'), 'success');
        render();
    }
}

async function startAssessment() {
    S.assessStep = 1;
    S.assessChecklist = {};
    S.assessDocuments = {};
    S.assessOrgProfile = { name: S.user.org_name || '' };
    S.assessResults = null;
    nav('assesswizard');
}

async function submitAssessment() {
    showToast(T('assessment.completing'), 'info');
    var res = await api('POST', '/api/assessments/', {
        assess_type: 'free',
        framework: S.selectedFramework || 'kuja',
        checklist: S.assessChecklist,
        documents: Object.keys(S.assessDocuments).map(function(k) { return { type: k, id: S.assessDocuments[k].id }; }),
        org_profile: S.assessOrgProfile
    });
    if (res) {
        S.assessResults = res;
        S.assessStep = 4;
        if (res.score != null) {
            // Issue #20: Update ALL score references in dashboard stats
            S.dashboardStats.assessment_score = res.score;
            S.dashboardStats.average_score = res.score;
            S.dashboardStats.capacity_score = res.score;
        }
        // Force dashboard stats to reload on next visit
        S._dashboardLoading = false;
        render();
    }
}

function renderAssessResults() {
    var r = S.assessResults || {};
    var score = r.score || 0;
    var cap = capacityLabel(score);
    var categories = r.category_scores || r.categories || {};
    var gaps = r.gaps || [];
    var recs = r.recommendations || [];

    return '<div class="bg-white rounded-xl border border-slate-200/60 p-8 mb-6 text-center">' +
        '<div class="mb-4">' +
        scoreRingHTML(score, 120, '%') +
        '</div>' +
        '<h2 class="text-2xl font-bold text-slate-900 mb-1">' + T('assessment.completed_success') + '</h2>' +
        '<p class="text-base mb-3">Capacity Level: ' + statusBadge(cap.label, cap.color) + '</p>' +
        '</div>' +

        (Object.keys(categories).length ? '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-6">' +
            '<h3 class="font-semibold text-slate-900 mb-4">' + T('assessment.category_scores') + '</h3>' +
            Object.keys(categories).map(function(k) {
                var val = categories[k] || 0;
                var barColor = val >= 70 ? 'bg-emerald-500' : val >= 50 ? 'bg-amber-500' : 'bg-rose-500';
                return '<div class="mb-3">' +
                    '<div class="flex justify-between text-sm mb-1">' +
                    '<span class="text-slate-600">' + esc(k.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); })) + '</span>' +
                    '<span class="font-semibold text-slate-900">' + val + '%</span></div>' +
                    '<div class="h-2.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full ' + barColor + '" style="width:' + val + '%"></div></div>' +
                    '</div>';
            }).join('') +
            '</div>' : '') +

        (gaps.length ? '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-6">' +
            '<h3 class="font-semibold text-slate-900 mb-3 flex items-center gap-2">' + icon('alert-triangle', 18, 'text-amber-500') + ' ' + T('assessment.gaps_identified') + '</h3>' +
            '<ul class="list-disc pl-5 space-y-1">' +
            gaps.map(function(g) { return '<li class="text-sm text-slate-600">' + esc(g) + '</li>'; }).join('') +
            '</ul></div>' : '') +

        (recs.length ? '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
            '<h3 class="font-semibold text-slate-900 mb-3 flex items-center gap-2">' + icon('lightbulb', 18, 'text-amber-500') + ' Recommendations</h3>' +
            '<ul class="list-disc pl-5 space-y-1">' +
            recs.map(function(r) { return '<li class="text-sm text-slate-600">' + esc(r) + '</li>'; }).join('') +
            '</ul></div>' : '');
}

// =============================================================================
// 29. Organization Profile
// =============================================================================

function renderOrgProfile() {
    loadOrgProfile();
    var org = S.selectedOrg || {};

    return '<div class="mb-8 animate-fade-in"><h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('user', 24, 'text-brand-600') + ' ' + T('org.title') + '</h1></div>' +

        '<div id="org-profile-content">' +
        '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-6">' +
        '<h3 class="font-semibold text-slate-900 mb-4">' + T('org.details') + '</h3>' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('org.name') + '</label>' +
        '<input type="text" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" value="' + esc(org.name || S.user.org_name || '') + '" ' +
        'oninput="if(!S.selectedOrg)S.selectedOrg={};S.selectedOrg.name=this.value;">' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('org.country') + '</label>' +
        '<input type="text" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" value="' + esc(org.country || '') + '" ' +
        'oninput="if(!S.selectedOrg)S.selectedOrg={};S.selectedOrg.country=this.value;">' +
        '</div>' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('org.year_established') + '</label>' +
        '<input type="number" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" value="' + esc(org.year_established || '') + '" ' +
        'oninput="if(!S.selectedOrg)S.selectedOrg={};S.selectedOrg.year_established=this.value;">' +
        '</div></div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('org.type') + '</label>' +
        '<select class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" onchange="if(!S.selectedOrg)S.selectedOrg={};S.selectedOrg.type=this.value;">' +
        '<option value="">Select type...</option>' +
        ['NGO', 'CBO', 'INGO', 'Government', 'UN Agency', 'Other'].map(function(t) {
            return '<option value="' + t + '"' + (org.type === t ? ' selected' : '') + '>' + t + '</option>';
        }).join('') +
        '</select>' +
        '</div>' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('org.annual_budget') + '</label>' +
        '<input type="text" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" value="' + esc(org.annual_budget || '') + '" placeholder="e.g., $500,000" ' +
        'oninput="if(!S.selectedOrg)S.selectedOrg={};S.selectedOrg.annual_budget=this.value;">' +
        '</div></div>' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('org.description') + '</label>' +
        '<textarea class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" rows="4" ' +
        'oninput="if(!S.selectedOrg)S.selectedOrg={};S.selectedOrg.description=this.value;">' + esc(org.description || '') + '</textarea>' +
        '</div>' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('grant.create.sectors') + '</label>' +
        '<input type="text" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" value="' + esc((org.sectors || []).join(', ')) + '" placeholder="Health, Education, etc." ' +
        'oninput="if(!S.selectedOrg)S.selectedOrg={};S.selectedOrg.sectors_text=this.value;">' +
        '</div>' +
        '<button class="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="saveOrgProfile()">' + icon('save', 16) + ' ' + T('org.save_profile') + '</button>' +
        '</div>' +

        // Registration Verification Status
        '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-6">' +
        '<h3 class="font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('check-circle', 18, 'text-emerald-500') + ' ' + T('verification.title') + '</h3>' +
        '<div id="org-verification-status">' + renderLoadingTable() + '</div>' +
        '</div>' +

        // Compliance
        '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-6">' +
        '<h3 class="font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('shield', 18, 'text-brand-600') + ' ' + T('compliance.title') + '</h3>' +
        '<div id="org-compliance">' + renderLoadingTable() + '</div>' +
        '</div>' +

        // Assessment History
        '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('clipboard-check', 18, 'text-brand-600') + ' ' + T('assessment.previous_assessments') + '</h3>' +
        '<div id="org-assessments">' + renderLoadingTable() + '</div>' +
        '</div>' +
        '</div>';
}

async function loadOrgProfile() {
    if (!S.user.org_id) return;
    var res = await api('GET', '/api/organizations/' + S.user.org_id);
    if (res) {
        S.selectedOrg = res.org || res.organization || res;
    }
    // Load verification status
    loadOrgVerificationStatus();
    // Load compliance
    var cRes = await api('GET', '/api/compliance/' + S.user.org_id);
    if (cRes && cRes.checks) {
        var el = document.getElementById('org-compliance');
        if (el) {
            el.innerHTML = cRes.checks.length ?
                cRes.checks.map(function(c) {
                    return '<div class="flex items-center gap-3 py-2 border-b border-slate-100">' +
                        '<span class="text-lg">' + (c.passed ? icon('check-circle', 18, 'text-emerald-500') : icon('x-circle', 18, 'text-rose-500')) + '</span>' +
                        '<div class="flex-1">' +
                        '<div class="text-sm font-medium text-slate-700">' + esc(c.name || c.check) + '</div>' +
                        '<div class="text-xs text-slate-400">' + esc(c.description || '') + '</div>' +
                        '</div>' +
                        statusBadge(c.status || (c.passed ? 'passed' : 'failed')) +
                        '</div>';
                }).join('') :
                '<p class="text-sm text-slate-400">No compliance checks available.</p>';
        }
    }
}

async function saveOrgProfile() {
    if (!S.selectedOrg) return;
    showToast(T('org.saved_success'), 'success');
}

// =============================================================================
// 30. My Documents
// =============================================================================

function renderMyDocuments() {
    loadMyDocuments();
    return '<div class="mb-8 animate-fade-in"><h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('file-text', 24, 'text-brand-600') + ' ' + T('document.title') + '</h1></div>' +

        '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-6">' +
        '<h3 class="font-semibold text-slate-900 mb-4">' + T('document.upload') + '</h3>' +
        '<div class="mb-3">' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('document.type') + '</label>' +
        '<select class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" id="doc-upload-type">' +
        '<option value="financial_report">' + T('document.type.financial_report') + '</option>' +
        '<option value="registration">' + T('document.type.registration_certificate') + '</option>' +
        '<option value="audit">' + T('document.type.audit_report') + '</option>' +
        '<option value="psea">' + T('document.type.psea_policy') + '</option>' +
        '<option value="project_report">' + T('document.type.project_report') + '</option>' +
        '<option value="budget">' + T('document.type.budget_detail') + '</option>' +
        '<option value="cv">' + T('document.type.staff_cvs') + '</option>' +
        '<option value="strategic_plan">' + T('document.type.strategic_plan') + '</option>' +
        '<option value="other">' + T('document.type.other') + '</option>' +
        '</select>' +
        '</div>' +
        '</div>' +
        '<div class="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors" onclick="document.getElementById(\'doc-general-upload\').click();">' +
        '<div class="text-slate-400 mb-2">' + icon('paperclip', 24, 'mx-auto') + '</div>' +
        '<div class="text-sm text-slate-500">Drag & drop or <strong class="text-brand-600">click to browse</strong></div>' +
        '<div class="text-xs text-slate-400 mt-1">PDF, DOC, DOCX, XLS, XLSX (Max 10MB)</div>' +
        '</div>' +
        '<input type="file" id="doc-general-upload" style="display:none;" accept=".pdf,.doc,.docx,.xls,.xlsx" onchange="uploadGeneralDoc(event)">' +
        '</div>' +

        '<div id="my-docs-list">' + renderLoadingTable() + '</div>';
}

async function uploadGeneralDoc(e) {
    var files = e.target.files;
    if (!files.length) return;
    var type = (document.getElementById('doc-upload-type') || {}).value || 'other';
    var fd = new FormData();
    fd.append('file', files[0]);
    fd.append('type', type);
    var res = await api('POST', '/api/documents/upload', fd);
    if (res) {
        showToast(T('toast.uploaded'), 'success');
        render();
    }
}

async function loadMyDocuments() {
    var res = await api('GET', '/api/documents/');
    var el = document.getElementById('my-docs-list');
    if (!el) return;
    if (res && res.documents && res.documents.length) {
        var rows = res.documents.map(function(d) {
            var scoreColor = d.score >= 70 ? 'text-emerald-600' : d.score >= 50 ? 'text-amber-500' : 'text-rose-500';
            var scoreHTML = d.score ? '<span class="font-semibold ' + scoreColor + '">' + d.score + '%</span>' : '<span class="text-slate-300">-</span>';
            return '<tr class="hover:bg-slate-50/80 transition-colors">' +
                '<td class="px-4 py-3.5 text-sm font-medium text-slate-900">' + esc(d.original_filename) + '</td>' +
                '<td class="px-4 py-3.5">' + statusBadge(d.doc_type || 'other') + '</td>' +
                '<td class="px-4 py-3.5 text-sm text-slate-600">' + (d.file_size ? Math.round(d.file_size / 1024) + ' KB' : '-') + '</td>' +
                '<td class="px-4 py-3.5 text-sm">' + scoreHTML + '</td>' +
                '<td class="px-4 py-3.5 text-xs text-slate-500">' + formatDate(d.uploaded_at) + '</td>' +
                '</tr>';
        }).join('');
        el.innerHTML = '<div class="bg-white rounded-xl border border-slate-200/60 overflow-hidden overflow-x-auto"><table class="w-full">' +
            '<thead><tr class="bg-slate-50 border-b border-slate-200"><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('document.filename') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('document.type') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('document.size') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('document.ai_score') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('document.uploaded_at') + '</th></tr></thead>' +
            '<tbody class="divide-y divide-slate-100">' + rows + '</tbody></table></div>';
    } else {
        el.innerHTML = '<div class="bg-white rounded-xl border border-slate-200/60 p-8 text-center">' +
            '<div class="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">' + icon('file-text', 22, 'text-slate-400') + '</div>' +
            '<p class="text-sm text-slate-400">Documents you upload will appear here and can be reused across applications.</p></div>';
    }
}

// =============================================================================
// 31. Compliance Page (Donor)
// =============================================================================

function renderCompliance() {
    loadComplianceData();
    return '<div class="mb-8 animate-fade-in"><h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('shield', 24, 'text-brand-600') + ' ' + T('compliance.title') + '</h1></div>' +
        '<div id="compliance-content">' + renderLoadingTable() + '</div>';
}

async function loadComplianceData() {
    if (!S.user.org_id) return;
    var res = await api('GET', '/api/compliance/' + S.user.org_id);
    var el = document.getElementById('compliance-content');
    if (!el) return;
    if (res && res.checks && res.checks.length) {
        el.innerHTML = '<div class="bg-white rounded-xl border border-slate-200/60 overflow-hidden overflow-x-auto"><table class="w-full">' +
            '<thead><tr class="bg-slate-50 border-b border-slate-200"><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('compliance.check_type') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('grant.create.description') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('application.tab.status') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('common.last_updated') + '</th></tr></thead><tbody class="divide-y divide-slate-100">' +
            res.checks.map(function(c) {
                // Issue #10: Human-readable compliance check labels
                var checkLabel = c.name || c.check || '';
                var readableLabels = {
                    'sanctions_un': 'UN Sanctions List',
                    'sanctions_ofac': 'OFAC SDN List',
                    'sanctions_eu': 'EU Sanctions List',
                    'sanctions': 'Sanctions Screening',
                    'blacklist': 'Blacklist Check',
                    'world_bank': 'World Bank Debarment',
                    'registration': 'Registration Verification',
                    'opensanctions': 'OpenSanctions Database'
                };
                var displayLabel = readableLabels[checkLabel.toLowerCase()] || T('compliance.check_type.' + checkLabel.toLowerCase()) || checkLabel;
                return '<tr class="hover:bg-slate-50/80 transition-colors"><td class="px-4 py-3.5 text-sm font-medium text-slate-900">' + esc(displayLabel) + '</td>' +
                    '<td class="px-4 py-3.5 text-sm text-slate-500">' + esc(c.description || '') + '</td>' +
                    '<td class="px-4 py-3.5">' + (c.passed ? statusBadge('Passed', 'green') : statusBadge('Failed', 'red')) + '</td>' +
                    '<td class="px-4 py-3.5 text-xs text-slate-500">' + formatDate(c.updated_at || c.date) + '</td></tr>';
            }).join('') +
            '</tbody></table></div>';
    } else {
        el.innerHTML = '<div class="bg-white rounded-xl border border-slate-200/60 p-12 text-center">' +
            '<div class="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">' + icon('shield', 22, 'text-slate-400') + '</div>' +
            '<p class="text-sm text-slate-400">No compliance data available.</p></div>';
    }
}

// =============================================================================
// 32. Organization Search (Donor)
// =============================================================================

function renderOrgSearch() {
    return '<div class="mb-8 animate-fade-in"><h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('search', 24, 'text-brand-600') + ' ' + T('org.search_title') + '</h1></div>' +
        '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mb-6">' +
        '<input type="text" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" placeholder="' + T('org.search_placeholder') + '" ' +
        'id="org-search-input" oninput="searchOrgs(this.value);">' +
        '</div>' +
        '<div id="org-search-results">' +
        '<div class="bg-white rounded-xl border border-slate-200/60 p-12 text-center">' +
        '<div class="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">' + icon('search', 22, 'text-slate-400') + '</div>' +
        '<p class="text-sm text-slate-400">Enter a search term to find organizations.</p></div>' +
        '</div>';
}

var _orgSearchDebounce = null;
function searchOrgs(q) {
    clearTimeout(_orgSearchDebounce);
    _orgSearchDebounce = setTimeout(async function() {
        if (!q || q.length < 2) return;
        var el = document.getElementById('org-search-results');
        if (el) el.innerHTML = renderLoadingTable();
        var res = await api('GET', '/api/applications/?search=' + encodeURIComponent(q));
        if (el) {
            if (res && res.applications && res.applications.length) {
                var orgs = {};
                res.applications.forEach(function(a) {
                    if (a.org_name && !orgs[a.org_name]) {
                        orgs[a.org_name] = { name: a.org_name, country: a.country, capacity: a.capacity_score };
                    }
                });
                var orgList = Object.values(orgs);
                el.innerHTML = '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">' +
                    orgList.map(function(o) {
                        return '<div class="bg-white rounded-xl border border-slate-200/60 p-5 hover:shadow-md transition-all duration-200">' +
                            '<h3 class="font-semibold text-slate-900">' + esc(o.name) + '</h3>' +
                            '<p class="text-sm text-slate-500 mt-1 flex items-center gap-1">' + icon('globe', 14) + ' ' + esc(o.country || 'Unknown') + '</p>' +
                            (o.capacity != null ? '<p class="mt-2 text-sm">Capacity: ' + statusBadge(o.capacity + '%', scoreColor(o.capacity)) + '</p>' : '') +
                            '</div>';
                    }).join('') +
                    '</div>';
            } else {
                el.innerHTML = '<div class="bg-white rounded-xl border border-slate-200/60 p-8 text-center">' +
                    '<p class="text-sm text-slate-400">No organizations found matching "' + esc(q) + '".</p></div>';
            }
        }
    }, 400);
}

// =============================================================================
// 33. Reviewer Pages
// =============================================================================

function renderAssignments() {
    loadReviewerAssignments();
    return '<div class="mb-8 animate-fade-in"><h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('clipboard-list', 24, 'text-brand-600') + ' ' + T('review.assignments') + '</h1></div>' +
        '<div id="assignments-list">' + renderLoadingTable() + '</div>';
}

async function loadReviewerAssignments() {
    var res = await api('GET', '/api/reviews/');
    if (res && res.reviews) {
        S.reviews = res.reviews;
        var pending = res.reviews.filter(function(r) { return r.status !== 'completed'; });
        var el = document.getElementById('assignments-list');
        if (el) el.innerHTML = renderReviewsTable(pending);
    }
}

function renderCompletedReviews() {
    loadCompletedReviews();
    return '<div class="mb-8 animate-fade-in"><h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('check-circle', 24, 'text-emerald-500') + ' ' + T('review.completed') + '</h1></div>' +
        '<div id="completed-reviews-list">' + renderLoadingTable() + '</div>';
}

async function loadCompletedReviews() {
    var res = await api('GET', '/api/reviews/');
    if (res && res.reviews) {
        var completed = res.reviews.filter(function(r) { return r.status === 'completed'; });
        var el = document.getElementById('completed-reviews-list');
        if (el) {
            if (completed.length) {
                el.innerHTML = '<div class="bg-white rounded-xl border border-slate-200/60 overflow-hidden overflow-x-auto"><table class="w-full">' +
                    '<thead><tr class="bg-slate-50 border-b border-slate-200"><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Application</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Grant</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Score</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Completed</th></tr></thead><tbody class="divide-y divide-slate-100">' +
                    completed.map(function(r) {
                        return '<tr class="hover:bg-slate-50/80 transition-colors"><td class="px-4 py-3.5 text-sm font-medium text-slate-900">' + esc(r.org_name || r.application_name || '') + '</td>' +
                            '<td class="px-4 py-3.5 text-sm text-slate-600">' + esc(r.grant_title || '') + '</td>' +
                            '<td class="px-4 py-3.5 text-sm font-semibold text-slate-900">' + (r.score || 0) + '%</td>' +
                            '<td class="px-4 py-3.5 text-xs text-slate-500">' + formatDate(r.completed_at) + '</td></tr>';
                    }).join('') +
                    '</tbody></table></div>';
            } else {
                el.innerHTML = '<div class="bg-white rounded-xl border border-slate-200/60 p-8 text-center">' +
                    '<p class="text-sm text-slate-400">No completed reviews yet.</p></div>';
            }
        }
    }
}

async function openReview(reviewId) {
    var res = await api('GET', '/api/reviews/');
    if (res && res.reviews) {
        var review = res.reviews.find(function(r) { return r.id === reviewId; });
        if (review && review.application_id) {
            var appRes = await api('GET', '/api/applications/' + review.application_id);
            if (appRes) {
                S.selectedApplication = appRes.application || appRes;
                S.selectedApplication.review_id = reviewId;
                S.scoreData = {};
                S.scoreComments = {};
                nav('scoreapp');
            }
        }
    }
}

// =============================================================================
// 34. Reporting Pages
// =============================================================================

async function loadReports() {
    var res = await api('GET', '/api/reports/');
    if (res && res.reports) {
        S.reports = res.reports;
        var el = document.getElementById('reports-list');
        if (el) el.innerHTML = renderReportsList(res.reports);
    }
}

function renderReportsPage() {
    loadReports();
    loadReportsUpcoming();
    var role = (S.user.role || '').toLowerCase();
    var isNGO = role === 'ngo';

    return '<div class="mb-8 animate-fade-in">' +
        '<div class="flex justify-between items-center">' +
        '<h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('bar-chart-3', 24, 'text-brand-600') + ' ' + T('report.title') + '</h1>' +
        (isNGO ? '<button class="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="startNewReport()">' + icon('plus', 16) + ' ' + T('report.submit_new') + '</button>' : '') +
        '</div></div>' +

        // Upcoming/Expected reports section
        '<div id="reports-upcoming" class="mb-6"></div>' +

        '<h3 class="text-base font-semibold text-slate-900 mb-3">' + T(isNGO ? 'report.submitted_reports' : 'report.all_reports') + '</h3>' +
        '<div id="reports-list">' + renderLoadingCards(3) + '</div>';
}

async function loadReportsUpcoming() {
    var res = await api('GET', '/api/reports/upcoming');
    var el = document.getElementById('reports-upcoming');
    if (!el) return;
    if (!res || !res.upcoming_reports || res.upcoming_reports.length === 0) {
        el.innerHTML = '';
        return;
    }
    var reports = res.upcoming_reports;
    var isNGO = (S.user.role || '').toLowerCase() === 'ngo';
    var overdueCount = res.overdue_count || 0;

    el.innerHTML = '<div class="bg-white rounded-xl border border-slate-200/60 border-l-4 ' + (overdueCount > 0 ? 'border-l-rose-500' : 'border-l-amber-500') + '">' +
        '<div class="p-5">' +
        '<div class="flex justify-between items-center mb-3">' +
        '<h3 class="font-semibold text-slate-900 flex items-center gap-2">' + icon('calendar', 18, overdueCount > 0 ? 'text-rose-500' : 'text-amber-500') + ' ' + (isNGO ? 'Upcoming Deadlines' : 'Expected Reports') + '</h3>' +
        (overdueCount > 0 ? statusBadge(overdueCount + ' ' + T('report.overdue').toLowerCase(), 'red') : statusBadge(T('report.all_on_track'), 'green')) +
        '</div>' +
        '<div class="overflow-x-auto"><table class="w-full"><thead><tr class="bg-slate-50 border-b border-slate-200">' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Report</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + (isNGO ? 'Grant' : 'NGO') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Due</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>' +
        '</tr></thead><tbody class="divide-y divide-slate-100">' +
        reports.map(function(r) {
            var isOverdue = r.is_overdue;
            var daysText = isOverdue ? Math.abs(r.days_until_due) + 'd overdue' : r.days_until_due + 'd left';
            var badgeColor = isOverdue ? 'red' : r.days_until_due <= 7 ? 'amber' : 'outline';
            var sBadge = r.status === 'not_started' || r.status === 'not_submitted' ? statusBadge(T('common.not_started')) :
                statusBadge(esc(r.status).replace(/_/g, ' '), r.status === 'draft' ? 'outline' : r.status === 'submitted' ? 'blue' : 'amber');
            var actionBtn = '';
            if (isNGO) {
                actionBtn = r.draft_report_id ?
                    '<button class="px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors" onclick="editReport(' + r.draft_report_id + ')">Continue</button>' :
                    '<button class="px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors" onclick="startReportForGrant(' + r.grant_id + ',\'' + esc(r.report_type) + '\',\'' + esc(r.reporting_period) + '\')">Start</button>';
            } else {
                actionBtn = r.report_id ?
                    '<button class="px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors" onclick="reviewReport(' + r.report_id + ')">Review</button>' :
                    '<span class="text-xs text-slate-400">Awaiting</span>';
            }
            return '<tr class="' + (isOverdue ? 'bg-rose-50/50' : 'hover:bg-slate-50/80') + ' transition-colors">' +
                '<td class="px-4 py-3.5"><strong class="text-sm text-slate-900">' + esc(r.requirement_title || r.report_type) + '</strong><br><span class="text-xs text-slate-400">' + esc(r.reporting_period) + '</span></td>' +
                '<td class="px-4 py-3.5 text-sm text-slate-600">' + esc(isNGO ? (r.grant_title || '') : (r.ngo_org_name || '')) + '</td>' +
                '<td class="px-4 py-3.5">' + statusBadge(daysText, badgeColor) + '</td>' +
                '<td class="px-4 py-3.5">' + sBadge + '</td>' +
                '<td class="px-4 py-3.5">' + actionBtn + '</td></tr>';
        }).join('') +
        '</tbody></table></div>' +
        '</div></div>';
}

function renderReportsList(reports) {
    if (!reports || !reports.length) {
        return '<div class="bg-white rounded-xl border border-slate-200/60 p-8 text-center">' +
            '<p class="text-sm text-slate-400">' + T('report.no_reports') + '</p>' +
            '</div>';
    }

    var statusColors = {
        'draft': 'badge-outline', 'submitted': 'badge-blue', 'under_review': 'badge-amber',
        'accepted': 'badge-green', 'revision_requested': 'badge-red'
    };

    // Phase 6: Group reports by grant
    var isNGO = (S.user.role || '').toLowerCase() === 'ngo';
    var isDonor = (S.user.role || '').toLowerCase() === 'donor';
    var grouped = {};
    var grantOrder = [];
    reports.forEach(function(r) {
        var grantKey = r.grant_title || 'Other';
        if (!grouped[grantKey]) {
            grouped[grantKey] = [];
            grantOrder.push(grantKey);
        }
        grouped[grantKey].push(r);
    });

    // If only one grant, no need for grouping headers
    if (grantOrder.length <= 1) {
        return renderReportsTableFlat(reports, statusColors, isNGO, isDonor);
    }

    // Multiple grants: render collapsible sections
    return grantOrder.map(function(grantTitle) {
        var grantReports = grouped[grantTitle];
        var overdueCount = grantReports.filter(function(r) { return r.status === 'revision_requested'; }).length;
        return '<div class="bg-white rounded-xl border border-slate-200/60 mb-4">' +
            '<div class="p-5 pb-0">' +
            '<div class="flex justify-between items-center mb-3">' +
            '<h4 class="font-semibold text-slate-900 flex items-center gap-2">' + icon('briefcase', 16, 'text-slate-500') + ' ' + esc(grantTitle) + '</h4>' +
            statusBadge(grantReports.length + ' ' + T('report.title').toLowerCase()) +
            '</div>' +
            renderReportsTableFlat(grantReports, statusColors, isNGO, isDonor) +
            '</div></div>';
    }).join('');
}

function renderReportsTableFlat(reports, statusColors, isNGO, isDonor) {
    return '<div class="overflow-x-auto"><table class="w-full"><thead><tr class="bg-slate-50 border-b border-slate-200">' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('report.title') + '</th>' +
        (isDonor ? '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">NGO</th>' : '') +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('report.type') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('report.period') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('application.tab.status') + '</th><th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('common.actions') + '</th>' +
        '</tr></thead><tbody class="divide-y divide-slate-100">' +
        reports.map(function(r) {
            var badgeColor = {draft:'outline',submitted:'blue',under_review:'amber',accepted:'green',revision_requested:'red'}[r.status] || 'outline';
            var actionBtn = '';
            if (isNGO && (r.status === 'draft' || r.status === 'revision_requested')) {
                actionBtn = '<button class="px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors" onclick="editReport(' + r.id + ')">' + T('common.edit') + '</button>';
            } else if (!isNGO && r.status === 'submitted') {
                actionBtn = '<button class="px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors" onclick="reviewReport(' + r.id + ')">Review</button>';
            } else {
                actionBtn = '<button class="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors" onclick="viewReport(' + r.id + ')">' + T('common.view') + '</button>';
            }

            return '<tr class="hover:bg-slate-50/80 transition-colors">' +
                '<td class="px-4 py-3.5 text-sm font-medium text-slate-900">' + esc(r.title || 'Report #' + r.id) + '</td>' +
                (isDonor ? '<td class="px-4 py-3.5 text-sm text-slate-600">' + esc(r.ngo_org_name || r.org_name || '') + '</td>' : '') +
                '<td class="px-4 py-3.5">' + statusBadge(r.report_type || '') + '</td>' +
                '<td class="px-4 py-3.5 text-sm text-slate-600">' + esc(r.reporting_period || '-') + '</td>' +
                '<td class="px-4 py-3.5">' + statusBadge(esc(r.status || 'draft').replace(/_/g, ' '), badgeColor) + '</td>' +
                '<td class="px-4 py-3.5">' + actionBtn + '</td></tr>';
        }).join('') +
        '</tbody></table></div>';
}

async function startNewReport() {
    // Get the user's awarded applications/grants
    var res = await api('GET', '/api/applications/?status=awarded');
    if (res && res.applications && res.applications.length > 0) {
        S.reportGrants = res.applications;
        var firstApp = res.applications[0];
        S.newReport = {
            grant_id: firstApp.grant_id,
            application_id: firstApp.id,
            report_type: 'progress',
            reporting_period: '',
            title: '',
            content: {}
        };
        // Fetch grant details to get donor-defined reporting requirements and template
        var grantRes = await api('GET', '/api/grants/' + firstApp.grant_id);
        if (grantRes && grantRes.grant) {
            S.currentReport = {
                grant_reporting_requirements: grantRes.grant.reporting_requirements || [],
                grant_report_template: grantRes.grant.report_template || {},
                grant_reporting_frequency: grantRes.grant.reporting_frequency || '',
                grant_title: grantRes.grant.title
            };
        }
        nav('submitreport');
    } else {
        // If no awarded apps, check for existing reports to find grants
        var gRes = await api('GET', '/api/reports/');
        if (gRes && gRes.reports && gRes.reports.length > 0) {
            var firstReport = gRes.reports[0];
            S.newReport = {
                grant_id: firstReport.grant_id,
                report_type: 'progress',
                reporting_period: '',
                title: '',
                content: {}
            };
            // Fetch grant details for donor requirements
            var grantRes2 = await api('GET', '/api/grants/' + firstReport.grant_id);
            if (grantRes2 && grantRes2.grant) {
                S.currentReport = {
                    grant_reporting_requirements: grantRes2.grant.reporting_requirements || [],
                    grant_report_template: grantRes2.grant.report_template || {},
                    grant_reporting_frequency: grantRes2.grant.reporting_frequency || '',
                    grant_title: grantRes2.grant.title
                };
            }
            nav('submitreport');
        } else {
            showToast(T('toast.no_awarded_grants'), 'warning');
        }
    }
}

async function editReport(id) {
    var res = await api('GET', '/api/reports/' + id);
    if (res && res.report) {
        S.currentReport = res.report;
        S.newReport = {
            id: res.report.id,
            grant_id: res.report.grant_id,
            application_id: res.report.application_id,
            report_type: res.report.report_type,
            reporting_period: res.report.reporting_period || '',
            title: res.report.title || '',
            content: res.report.content || {}
        };
        nav('submitreport');
    }
}

async function viewReport(id) {
    var res = await api('GET', '/api/reports/' + id);
    if (res && res.report) {
        S.currentReport = res.report;
        nav('reviewreport');
    }
}

async function reviewReport(id) {
    var res = await api('GET', '/api/reports/' + id);
    if (res && res.report) {
        S.currentReport = res.report;
        nav('reviewreport');
    }
}

function renderSubmitReport() {
    var r = S.newReport || {};
    var tmpl = (S.currentReport && S.currentReport.grant_report_template) || {};
    var sections = (tmpl && tmpl.template_sections) || [];
    var reqs = (S.currentReport && S.currentReport.grant_reporting_requirements) || [];
    var reportTypes = ['financial', 'narrative', 'impact', 'progress', 'final'];

    var contentFields = '';
    if (sections.length > 0) {
        contentFields = sections.map(function(s, i) {
            var val = (r.content && r.content[s.title]) || '';
            return '<div class="mb-4">' +
                '<label class="block text-xs font-medium text-slate-600 mb-1">' + esc(s.title) +
                (s.required ? ' <span class="text-rose-500">*</span>' : ' <span class="text-slate-400">(Optional)</span>') +
                '</label>' +
                '<p class="text-xs text-slate-400 mb-1">' + esc(s.description || '') + '</p>' +
                '<textarea class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" rows="4" placeholder="Enter details..." ' +
                'oninput="if(!S.newReport.content)S.newReport.content={};S.newReport.content[\'' + esc(s.title).replace(/'/g, "\\'") + '\']=this.value;">' + esc(val) + '</textarea>' +
                '</div>';
        }).join('');
    } else {
        // Default sections
        var defaultSections = ['Executive Summary', 'Activities and Outputs', 'Progress Against Indicators', 'Financial Summary', 'Challenges and Mitigation', 'Next Steps'];
        contentFields = defaultSections.map(function(s) {
            var val = (r.content && r.content[s]) || '';
            return '<div class="mb-4">' +
                '<label class="block text-xs font-medium text-slate-600 mb-1">' + esc(s) + ' <span class="text-rose-500">*</span></label>' +
                '<textarea class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" rows="4" placeholder="Enter details for ' + esc(s) + '..." ' +
                'oninput="if(!S.newReport.content)S.newReport.content={};S.newReport.content[\'' + s.replace(/'/g, "\\'") + '\']=this.value;">' + esc(val) + '</textarea>' +
                '</div>';
        }).join('');
    }

    // Reporting requirements info
    var reqsInfo = '';
    if (reqs.length > 0) {
        reqsInfo = '<div class="bg-white rounded-xl border border-slate-200/60 border-l-4 border-l-amber-500 mb-5">' +
            '<div class="p-4">' +
            '<h4 class="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">' + icon('alert-triangle', 16, 'text-amber-500') + ' Reporting Requirements</h4>' +
            reqs.map(function(req) {
                return '<p class="text-sm text-slate-600 mb-1"><strong class="text-slate-700">' + esc(req.title || req.type) + ':</strong> ' + esc(req.description || '') + '</p>';
            }).join('') +
            '</div></div>';
    }

    // Grant selector for new reports (when user has multiple awarded grants)
    var grantSelector = '';
    if (!r.id && S.reportGrants && S.reportGrants.length > 1) {
        grantSelector = '<div class="bg-white rounded-xl border border-slate-200/60 p-4 mb-4">' +
            '<label class="block text-xs font-semibold text-slate-700 mb-1">' + T('report.select_grant_to_report') + '</label>' +
            '<select class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" onchange="changeReportGrant(this.value);">' +
            S.reportGrants.map(function(a) {
                return '<option value="' + a.grant_id + ':' + a.id + '"' + (r.grant_id == a.grant_id ? ' selected' : '') + '>' +
                    esc(a.grant_title) + '</option>';
            }).join('') +
            '</select></div>';
    } else if (S.currentReport && S.currentReport.grant_title) {
        grantSelector = '<div class="mb-3 text-sm text-slate-500">Reporting on: <strong class="text-slate-700">' + esc(S.currentReport.grant_title) + '</strong></div>';
    }

    return '<button class="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-4 transition-colors" onclick="nav(\'reports\')">' + icon('arrow-left', 16) + ' ' + T('common.back') + '</button>' +
        '<div class="mb-8 animate-fade-in"><h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon(r.id ? 'edit' : 'file-plus', 24, 'text-brand-600') + ' ' + (r.id ? T('common.edit') : T('report.submit_new')) + '</h1></div>' +

        grantSelector +
        reqsInfo +

        '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('report.type') + '</label>' +
        '<select class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" onchange="S.newReport.report_type=this.value;">' +
        reportTypes.map(function(t) { return '<option value="' + t + '"' + (r.report_type === t ? ' selected' : '') + '>' + t.charAt(0).toUpperCase() + t.slice(1) + '</option>'; }).join('') +
        '</select>' +
        '</div>' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('report.reporting_period') + '</label>' +
        '<input type="text" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" placeholder="e.g., Q1 2026, Jan-Mar 2026" ' +
        'value="' + esc(r.reporting_period) + '" oninput="S.newReport.reporting_period=this.value;">' +
        '</div>' +
        '</div>' +
        '<div class="mb-4">' +
        '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('report.report_title') + '</label>' +
        '<input type="text" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" placeholder="e.g., Q1 2026 Progress Report" ' +
        'value="' + esc(r.title) + '" oninput="S.newReport.title=this.value;">' +
        '</div>' +
        '</div>' +

        '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mt-4">' +
        '<h3 class="font-semibold text-slate-900 mb-4">' + T('report.content') + '</h3>' +
        '<p class="text-sm text-slate-500 mb-4">Complete each section below. The AI will help format and validate your report.</p>' +
        contentFields +
        '</div>' +

        '<div class="flex gap-3 mt-5">' +
        '<button class="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="saveReportDraft()">' + icon('save', 16) + ' ' + T('grant.create.save_draft') + '</button>' +
        '<button class="px-4 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="submitReport()">' + icon('rocket', 16) + ' ' + T('report.submit') + '</button>' +
        '</div>';
}

async function changeReportGrant(val) {
    var parts = val.split(':');
    var grantId = parseInt(parts[0]);
    var appId = parts[1] ? parseInt(parts[1]) : null;
    S.newReport.grant_id = grantId;
    S.newReport.application_id = appId;
    S.newReport.content = {};
    // Fetch new grant's reporting requirements
    var grantRes = await api('GET', '/api/grants/' + grantId);
    if (grantRes && grantRes.grant) {
        S.currentReport = {
            grant_reporting_requirements: grantRes.grant.reporting_requirements || [],
            grant_report_template: grantRes.grant.report_template || {},
            grant_reporting_frequency: grantRes.grant.reporting_frequency || '',
            grant_title: grantRes.grant.title
        };
    }
    render();
}

async function saveReportDraft() {
    var r = S.newReport;
    var data = {
        grant_id: r.grant_id,
        application_id: r.application_id,
        report_type: r.report_type,
        reporting_period: r.reporting_period,
        title: r.title,
        content: r.content || {}
    };

    var res;
    if (r.id) {
        res = await api('PUT', '/api/reports/' + r.id, data);
    } else {
        res = await api('POST', '/api/reports/', data);
    }

    if (res && res.success) {
        if (res.report) S.newReport.id = res.report.id;
        showToast(T('toast.saved'), 'success');
    } else {
        showToast(T('toast.error'), 'error');
    }
}

async function submitReport() {
    var r = S.newReport;

    // Validate required fields
    if (!r.title || !r.title.trim()) {
        showToast(T('toast.enter_report_title'), 'warning');
        return;
    }
    if (!r.reporting_period || !r.reporting_period.trim()) {
        showToast(T('toast.enter_reporting_period'), 'warning');
        return;
    }
    var content = r.content || {};
    var filledSections = Object.keys(content).filter(function(k) { return content[k] && content[k].trim(); });
    if (filledSections.length === 0) {
        showToast(T('toast.fill_content_section'), 'warning');
        return;
    }

    // Save first if needed
    if (!r.id) {
        var data = {
            grant_id: r.grant_id,
            application_id: r.application_id,
            report_type: r.report_type,
            reporting_period: r.reporting_period,
            title: r.title,
            content: r.content || {}
        };
        var saveRes = await api('POST', '/api/reports/', data);
        if (saveRes && saveRes.report) {
            r.id = saveRes.report.id;
        } else {
            showToast(T('toast.error'), 'error');
            return;
        }
    } else {
        // Save latest content
        await api('PUT', '/api/reports/' + r.id, {
            content: r.content,
            title: r.title,
            reporting_period: r.reporting_period,
            report_type: r.report_type
        });
    }

    // Submit
    var res = await api('POST', '/api/reports/' + r.id + '/submit');
    if (res && res.success) {
        showToast(T('report.submitted_success'), 'success');
        nav('reports');
    } else {
        showToast(T('toast.error'), 'error');
    }
}

function renderReviewReport() {
    var r = S.currentReport;
    if (!r) return '<p>' + T('common.loading') + '</p>';

    var isDonor = (S.user.role || '').toLowerCase() === 'donor';
    var canReview = isDonor && r.status === 'submitted';

    var statusColors = {
        'draft': 'badge-outline', 'submitted': 'badge-blue', 'under_review': 'badge-amber',
        'accepted': 'badge-green', 'revision_requested': 'badge-red'
    };

    // Content sections
    var content = r.content || {};
    var contentHTML = Object.keys(content).map(function(key) {
        return '<div class="mb-4">' +
            '<h4 class="text-sm font-semibold text-slate-700">' + esc(key) + '</h4>' +
            '<p class="text-sm text-slate-600 whitespace-pre-wrap">' + esc(content[key] || 'Not provided') + '</p>' +
            '</div>';
    }).join('') || '<p class="text-sm text-slate-400">No content provided.</p>';

    // AI analysis
    var aiHTML = '';
    var ai = r.ai_analysis;
    if (ai && Object.keys(ai).length > 0) {
        // Per-requirement compliance section
        var reqScoresHTML = '';
        if (ai.requirement_scores && ai.requirement_scores.length > 0) {
            reqScoresHTML = '<div class="mt-4 border-t border-slate-200 pt-3">' +
                '<h4 class="text-sm font-semibold text-slate-900 mb-2">' + T('application.donor_req_compliance') + '</h4>' +
                ai.requirement_scores.map(function(rs) {
                    var rScore = rs.score || 0;
                    var barColor = rScore >= 70 ? 'bg-brand-600' : rScore >= 40 ? 'bg-amber-500' : 'bg-rose-500';
                    var scoreTextColor = rScore >= 70 ? 'text-brand-600' : rScore >= 40 ? 'text-amber-500' : 'text-rose-500';
                    var reqIcon = rs.addressed ? icon('check-circle', 14, 'text-emerald-500') : icon('x-circle', 14, 'text-rose-500');
                    return '<div class="mb-2.5 p-2 bg-slate-50 rounded-lg">' +
                        '<div class="flex justify-between items-center mb-1">' +
                        '<span class="text-sm font-medium text-slate-700 flex items-center gap-1">' + reqIcon + ' ' + esc(rs.requirement || 'Requirement') + '</span>' +
                        '<span class="font-semibold text-sm ' + scoreTextColor + '">' + rScore + '%</span>' +
                        '</div>' +
                        '<div class="h-1 bg-slate-200 rounded-full overflow-hidden">' +
                        '<div class="h-full rounded-full ' + barColor + '" style="width:' + rScore + '%"></div>' +
                        '</div>' +
                        (rs.feedback ? '<p class="text-xs text-slate-500 mt-1">' + esc(rs.feedback) + '</p>' : '') +
                        '</div>';
                }).join('') +
                '</div>';
        }

        // Risk flags
        var riskHTML = '';
        if (ai.risk_flags && ai.risk_flags.length > 0) {
            riskHTML = '<div class="mt-3 p-3 bg-rose-50 rounded-lg border border-rose-200">' +
                '<strong class="text-sm text-rose-600 flex items-center gap-1">' + icon('alert-triangle', 14) + ' Risk Flags:</strong>' +
                ai.risk_flags.map(function(rf) { return '<p class="text-sm text-rose-600 my-0.5">&bull; ' + esc(rf) + '</p>'; }).join('') +
                '</div>';
        }

        aiHTML = '<div class="bg-white rounded-xl border border-slate-200/60 border-l-4 border-l-brand-600 mt-4">' +
            '<div class="p-5">' +
            '<h3 class="font-semibold text-slate-900 mb-3 flex items-center gap-2">' + icon('sparkles', 18, 'text-amber-500') + ' ' + T('report.ai_analysis') + '</h3>' +
            '<div class="flex gap-4 mb-3 flex-wrap">' +
            '<div class="text-center"><div class="text-2xl font-bold text-brand-600">' + (ai.score || 0) + '</div><div class="text-xs text-slate-400">Overall</div></div>' +
            '<div class="text-center"><div class="text-2xl font-bold text-blue-600">' + (ai.completeness_score || 0) + '</div><div class="text-xs text-slate-400">Completeness</div></div>' +
            '<div class="text-center"><div class="text-2xl font-bold text-amber-500">' + (ai.quality_score || 0) + '</div><div class="text-xs text-slate-400">Quality</div></div>' +
            (ai.compliance_score != null ? '<div class="text-center"><div class="text-2xl font-bold text-violet-600">' + (ai.compliance_score || 0) + '</div><div class="text-xs text-slate-400">Compliance</div></div>' : '') +
            '</div>' +
            (ai.summary ? '<p class="text-sm text-slate-700 mb-3"><strong>Summary:</strong> ' + esc(ai.summary) + '</p>' : '') +
            (ai.findings && ai.findings.length ? '<div class="mb-2"><strong class="text-sm text-slate-700">Findings:</strong>' + ai.findings.map(function(f) { return '<p class="text-sm text-slate-600 my-0.5">&bull; ' + esc(f) + '</p>'; }).join('') + '</div>' : '') +
            (ai.missing_items && ai.missing_items.length ? '<div class="mb-2"><strong class="text-sm text-rose-600">Missing:</strong>' + ai.missing_items.map(function(m) { return '<p class="text-sm text-rose-600 my-0.5">&bull; ' + esc(m) + '</p>'; }).join('') + '</div>' : '') +
            (ai.recommendations && ai.recommendations.length ? '<div><strong class="text-sm text-slate-700">Recommendations:</strong>' + ai.recommendations.map(function(rec) { return '<p class="text-sm text-slate-600 my-0.5">&bull; ' + esc(rec) + '</p>'; }).join('') + '</div>' : '') +
            reqScoresHTML + riskHTML +
            '</div></div>';
    }

    // Donor review actions
    var reviewActions = '';
    if (canReview) {
        reviewActions = '<div class="bg-white rounded-xl border border-slate-200/60 border-l-4 border-l-amber-500 mt-4">' +
            '<div class="p-5">' +
            '<h3 class="font-semibold text-slate-900 mb-3 flex items-center gap-2">' + icon('search', 18, 'text-amber-500') + ' Review Actions</h3>' +
            '<div class="mb-4">' +
            '<label class="block text-xs font-medium text-slate-600 mb-1">' + T('report.review_notes') + '</label>' +
            '<textarea class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" rows="3" id="review-notes" placeholder="Add feedback or notes for the grantee..."></textarea>' +
            '</div>' +
            '<div class="flex gap-3">' +
            '<button class="px-4 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="acceptReport(' + r.id + ')">' + icon('check-circle', 16) + ' ' + T('report.accept') + '</button>' +
            '<button class="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="requestRevision(' + r.id + ')">' + icon('corner-down-left', 16) + ' ' + T('report.request_revision') + '</button>' +
            '</div>' +
            '</div></div>';
    }

    // Reviewer notes (if any)
    var notesHTML = '';
    if (r.reviewer_notes) {
        notesHTML = '<div class="bg-white rounded-xl border border-slate-200/60 border-l-4 border-l-blue-500 mt-4">' +
            '<div class="p-5">' +
            '<h4 class="font-semibold text-slate-900 mb-2">' + T('report.reviewer_notes') + '</h4>' +
            '<p class="text-sm text-slate-600">' + esc(r.reviewer_notes) + '</p>' +
            '<p class="text-xs text-slate-400 mt-1">Reviewed: ' + (r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString() : 'N/A') + '</p>' +
            '</div></div>';
    }

    // Donor requirements context (show what was expected)
    var donorReqsHTML = '';
    var donorReqs = r.grant_reporting_requirements || [];
    if (donorReqs.length > 0) {
        donorReqsHTML = '<div class="bg-white rounded-xl border border-slate-200/60 border-l-4 border-l-violet-500 mt-4">' +
            '<div class="p-4">' +
            '<h4 class="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">' + icon('clipboard-list', 16, 'text-violet-500') + ' Donor Reporting Requirements</h4>' +
            donorReqs.map(function(req) {
                var isMatch = req.type && r.report_type && req.type.toLowerCase() === r.report_type.toLowerCase();
                return '<div class="flex items-baseline gap-2 mb-1">' +
                    (isMatch ? '<span class="text-brand-600">' + icon('check-circle', 14) + '</span>' : '<span class="text-slate-300">' + icon('circle', 14) + '</span>') +
                    '<div><strong class="text-sm text-slate-700">' + esc(req.title || req.type) + '</strong>' +
                    (req.frequency ? ' <span class="text-xs text-slate-400">(' + esc(req.frequency) + ')</span>' : '') +
                    '<br><span class="text-xs text-slate-500">' + esc(req.description || '') + '</span></div></div>';
            }).join('') +
            '</div></div>';
    }

    return '<button class="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-4 transition-colors" onclick="nav(\'reports\')">' + icon('arrow-left', 16) + ' ' + T('common.back') + '</button>' +
        '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<div class="flex justify-between items-start">' +
        '<div>' +
        '<h2 class="text-lg font-semibold text-slate-900">' + esc(r.title || 'Report #' + r.id) + '</h2>' +
        '<p class="text-sm text-slate-500">' + esc(r.grant_title || '') + '</p>' +
        '</div>' +
        '<div class="text-right">' +
        statusBadge(esc(r.status || 'draft').replace(/_/g, ' '), {draft:'outline',submitted:'blue',under_review:'amber',accepted:'green',revision_requested:'red'}[r.status] || 'outline') +
        '<p class="text-xs text-slate-400 mt-1">' + esc(r.report_type || '') + ' | ' + esc(r.reporting_period || '') + '</p>' +
        (r.org_name ? '<p class="text-xs text-slate-400">By: ' + esc(r.org_name) + '</p>' : '') +
        '</div>' +
        '</div>' +
        '</div>' +

        donorReqsHTML +

        '<div class="bg-white rounded-xl border border-slate-200/60 p-5 mt-4">' +
        '<h3 class="font-semibold text-slate-900 mb-4">' + T('report.content') + '</h3>' +
        contentHTML +
        '</div>' +

        aiHTML +
        notesHTML +
        reviewActions;
}

async function acceptReport(id) {
    var notes = document.getElementById('review-notes') ? document.getElementById('review-notes').value : '';
    var res = await api('POST', '/api/reports/' + id + '/review', {
        action: 'accept',
        notes: notes
    });
    if (res && res.success) {
        showToast(T('toast.saved'), 'success');
        nav('reports');
    } else {
        showToast(T('toast.error'), 'error');
    }
}

async function requestRevision(id) {
    var notes = document.getElementById('review-notes') ? document.getElementById('review-notes').value : '';
    if (!notes) {
        showToast(T('toast.add_revision_notes'), 'warning');
        return;
    }
    var res = await api('POST', '/api/reports/' + id + '/review', {
        action: 'request_revision',
        notes: notes
    });
    if (res && res.success) {
        showToast(T('toast.revision_requested'), 'info');
        nav('reports');
    } else {
        showToast(T('toast.error'), 'error');
    }
}

// =============================================================================
// 35. Registration Verification Dashboard (Donor)
// =============================================================================

function verificationStatusBadge(status) {
    var map = {
        'verified': { color: 'green', iconName: 'check-circle', label: T('status.verified') },
        'ai_reviewed': { color: 'blue', iconName: 'bot', label: T('status.ai_reviewed') },
        'pending': { color: 'amber', iconName: 'clock', label: T('status.pending') },
        'flagged': { color: 'red', iconName: 'alert-triangle', label: T('status.flagged') },
        'expired': { color: 'red', iconName: 'x-circle', label: T('status.expired') },
        'unverified': { color: 'outline', iconName: 'help-circle', label: T('status.unverified') },
    };
    var s = map[status] || map['unverified'];
    return statusBadge(icon(s.iconName, 12) + ' ' + s.label, s.color);
}

function renderVerificationDashboard() {
    loadVerificationData();
    return '<div class="mb-8 animate-fade-in">' +
        '<div class="flex justify-between items-center">' +
        '<h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">' + icon('check-circle', 24, 'text-emerald-500') + ' ' + T('verification.title') + '</h1>' +
        '<button class="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="loadRegistryDirectory()">' + icon('globe', 16) + ' Government Registries</button>' +
        '</div></div>' +

        // Summary stat cards
        '<div id="verification-stats" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">' +
        renderStatCard('check-circle', T('status.verified'), '-', 'green') +
        renderStatCard('bot', T('status.ai_reviewed'), '-', 'blue') +
        renderStatCard('clock', T('status.pending'), '-', 'amber') +
        renderStatCard('alert-triangle', T('status.flagged'), '-', 'red') +
        renderStatCard('help-circle', T('status.unverified'), '-', 'outline') +
        '</div>' +

        // Registry directory (hidden by default)
        '<div id="registry-directory" style="display:none;" class="mb-6"></div>' +

        // Main table
        '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('building-2', 18, 'text-slate-500') + ' NGO Registration Status</h3>' +
        '<div id="verification-table">' + renderLoadingTable() + '</div>' +
        '</div>' +

        // Detail panel (hidden by default)
        '<div id="verification-detail" style="display:none;" class="mt-6"></div>';
}

async function loadVerificationData() {
    var res = await api('GET', '/api/verification/all');
    if (!res || !res.organizations) return;

    var orgs = res.organizations;

    // Update stats
    var counts = { verified: 0, ai_reviewed: 0, pending: 0, flagged: 0, unverified: 0, expired: 0 };
    orgs.forEach(function(o) {
        var s = o.verification_status || 'unverified';
        if (counts[s] !== undefined) counts[s]++;
        else counts['unverified']++;
    });
    var statsEl = document.getElementById('verification-stats');
    if (statsEl) {
        statsEl.innerHTML =
            renderStatCard('check-circle', T('status.verified'), counts.verified, 'green') +
            renderStatCard('bot', T('status.ai_reviewed'), counts.ai_reviewed, 'blue') +
            renderStatCard('clock', T('status.pending'), counts.pending + counts.expired, 'amber') +
            renderStatCard('alert-triangle', T('status.flagged'), counts.flagged, 'red') +
            renderStatCard('help-circle', T('status.unverified'), counts.unverified, 'outline');
    }

    // Render table
    var el = document.getElementById('verification-table');
    if (!el) return;

    var rows = orgs.map(function(o) {
        var regNum = o.registration_number ? esc(o.registration_number) : '<span class="text-rose-600">' + T('common.not_provided') + '</span>';
        var registryLink = o.registry_search_url ?
            '<a href="' + esc(o.registry_search_url) + '" target="_blank" class="text-blue-600 hover:underline text-xs">Check Registry ' + icon('external-link', 12, 'inline') + '</a>' :
            (o.registry_url ? '<a href="' + esc(o.registry_url) + '" target="_blank" class="text-blue-600 hover:underline text-xs">Registry ' + icon('external-link', 12, 'inline') + '</a>' : '');
        var confColor = o.ai_confidence >= 80 ? 'text-emerald-600' : o.ai_confidence >= 50 ? 'text-amber-500' : 'text-rose-500';
        var confidence = o.ai_confidence != null ?
            '<span class="font-semibold ' + confColor + '">' + Math.round(o.ai_confidence) + '%</span>' : '<span class="text-slate-300">-</span>';
        var actions = '<div class="flex gap-1.5 flex-wrap">';
        if (o.verification_status === 'unverified' || o.verification_status === 'pending') {
            actions += '<button class="px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-1" onclick="runVerification(' + o.org_id + ')">' + icon('search', 12) + ' Verify</button>';
        }
        if (o.verification_status === 'ai_reviewed') {
            actions += '<button class="px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-1" onclick="confirmVerification(' + o.org_id + ')">' + icon('check', 12) + ' Confirm</button>';
            actions += '<button class="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-1" onclick="flagVerification(' + o.org_id + ')">' + icon('alert-triangle', 12) + ' Flag</button>';
        }
        if (o.verification_status === 'verified') {
            actions += '<span class="text-emerald-600 text-xs">Verified' + (o.verified_by ? ' by ' + esc(o.verified_by) : '') + '</span>';
        }
        if (o.verification_status === 'flagged' || o.verification_status === 'expired') {
            actions += '<button class="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-1" onclick="runVerification(' + o.org_id + ')">' + icon('refresh-cw', 12) + ' Re-verify</button>';
        }
        actions += '<button class="px-2 py-1.5 bg-white border border-slate-200 text-slate-500 text-xs rounded-lg hover:bg-slate-50 transition-colors" onclick="viewVerificationDetail(' + o.org_id + ')">' + icon('eye', 14) + '</button>';
        actions += '</div>';

        return '<tr class="hover:bg-slate-50/80 transition-colors">' +
            '<td class="px-4 py-3.5"><strong class="text-sm text-slate-900">' + esc(o.org_name) + '</strong><br><span class="text-xs text-slate-500">' + esc(o.country || '') + '</span></td>' +
            '<td class="px-4 py-3.5 font-mono text-sm">' + regNum + '</td>' +
            '<td class="px-4 py-3.5">' + (o.registry_authority ? '<span class="text-xs text-slate-600">' + esc(o.registry_authority) + '</span><br>' : '') + registryLink + '</td>' +
            '<td class="px-4 py-3.5">' + verificationStatusBadge(o.verification_status) + '</td>' +
            '<td class="px-4 py-3.5 text-center">' + confidence + '</td>' +
            '<td class="px-4 py-3.5">' + actions + '</td></tr>';
    }).join('');

    el.innerHTML = '<div class="overflow-x-auto"><table class="w-full">' +
        '<thead><tr class="bg-slate-50 border-b border-slate-200">' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('verification.organization') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('verification.reg_number') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('verification.authority') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('application.tab.status') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('verification.ai_confidence') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('common.actions') + '</th>' +
        '</tr></thead><tbody class="divide-y divide-slate-100">' + rows + '</tbody></table></div>';
}

async function runVerification(orgId) {
    showToast(T('toast.running_verification'), 'info');
    var res = await api('POST', '/api/verification/verify', { org_id: orgId });
    if (res && res.success) {
        var conf = res.verification.ai_confidence || 0;
        var status = res.verification.status;
        showToast(T('toast.verification_complete', {status: status, confidence: Math.round(conf)}), conf >= 70 ? 'success' : 'warning');
        loadVerificationData();
        viewVerificationDetail(orgId);
    } else {
        showToast(T('toast.verification_failed', {error: (res ? res.error : 'Unknown error')}), 'error');
    }
}

async function viewVerificationDetail(orgId) {
    var res = await api('GET', '/api/verification/' + orgId);
    if (!res || !res.success) return;

    var el = document.getElementById('verification-detail');
    if (!el) return;
    el.style.display = 'block';

    var v = (res.verifications && res.verifications.length) ? res.verifications[0] : null;
    var reg = res.registry_info;
    var analysis = v ? v.ai_analysis : null;

    var html = '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<div class="flex justify-between items-center mb-4">' +
        '<h3 class="font-semibold text-slate-900 flex items-center gap-2">' + icon('file-text', 18, 'text-brand-600') + ' ' + T('verification.detail_title') + ' ' + esc(res.org_name) + '</h3>' +
        '<button class="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-1" onclick="document.getElementById(\'verification-detail\').style.display=\'none\';">' + icon('x', 14) + ' ' + T('common.close') + '</button>' +
        '</div>';

    // Registration info
    html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">';

    // Left: Org Registration Details
    html += '<div>' +
        '<h4 class="font-semibold text-sm text-slate-600 mb-3">' + T('verification.registration_info') + '</h4>' +
        '<table class="w-full text-sm">' +
        '<tr><td class="py-1.5 pr-3 text-slate-500 w-2/5">' + T('verification.country') + '</td><td class="py-1.5 font-medium text-slate-900">' + esc(res.org_country || '-') + '</td></tr>' +
        '<tr><td class="py-1.5 pr-3 text-slate-500">' + T('verification.reg_number') + '</td><td class="py-1.5 font-mono font-medium text-slate-900">' + esc(res.registration_number || 'Not provided') + '</td></tr>' +
        '<tr><td class="py-1.5 pr-3 text-slate-500">' + T('application.tab.status') + '</td><td class="py-1.5">' + verificationStatusBadge(res.overall_status) + '</td></tr>';

    if (v) {
        html += '<tr><td class="py-1.5 pr-3 text-slate-500">' + T('verification.authority') + '</td><td class="py-1.5 text-slate-900">' + esc(v.registration_authority || '-') + '</td></tr>';
        if (v.registration_date) html += '<tr><td class="py-1.5 pr-3 text-slate-500">' + T('verification.registered') + '</td><td class="py-1.5 text-slate-900">' + formatDate(v.registration_date) + '</td></tr>';
        if (v.expiry_date) html += '<tr><td class="py-1.5 pr-3 text-slate-500">' + T('verification.expires') + '</td><td class="py-1.5 ' + (new Date(v.expiry_date) < new Date() ? 'text-rose-600 font-semibold' : 'text-slate-900') + '">' + formatDate(v.expiry_date) + (new Date(v.expiry_date) < new Date() ? ' (' + T('verification.expired_label') + ')' : '') + '</td></tr>';
        var confColor2 = v.ai_confidence >= 80 ? 'text-emerald-600' : v.ai_confidence >= 50 ? 'text-amber-500' : 'text-rose-500';
        html += '<tr><td class="py-1.5 pr-3 text-slate-500">' + T('verification.ai_confidence') + '</td><td class="py-1.5">' +
            '<span class="font-semibold ' + confColor2 + '">' + Math.round(v.ai_confidence || 0) + '%</span></td></tr>';
        if (v.verified_by_name) {
            html += '<tr><td class="py-1.5 pr-3 text-slate-500">' + T('verification.verified_by') + '</td><td class="py-1.5 text-slate-900">' + esc(v.verified_by_name) + ' on ' + formatDate(v.verified_at) + '</td></tr>';
        }
    }
    html += '</table></div>';

    // Right: Government Registry Info
    html += '<div>' +
        '<h4 class="font-semibold text-sm text-slate-600 mb-3">' + T('verification.government_registry') + '</h4>';
    if (reg) {
        html += '<div class="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm">' +
            '<div class="font-semibold text-slate-900 mb-2 flex items-center gap-2">' + icon('landmark', 16, 'text-emerald-600') + ' ' + esc(reg.authority) + '</div>' +
            '<div class="text-slate-500 mb-1">Expected format: <code class="bg-slate-200 px-1.5 py-0.5 rounded text-xs">' + esc(reg.expected_format || 'N/A') + '</code></div>' +
            '<div class="text-sm text-slate-500 mb-3">' + esc(reg.notes || '') + '</div>';
        if (reg.search_url) {
            html += '<a href="' + esc(reg.search_url) + '" target="_blank" class="px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-1 mr-2">' + icon('search', 12) + ' Search Registry Online</a>';
        }
        if (reg.url) {
            html += '<a href="' + esc(reg.url) + '" target="_blank" class="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-1">' + icon('globe', 12) + ' Registry Website</a>';
        }
        html += '</div>';
    } else {
        html += '<div class="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm">' +
            '<div class="font-semibold text-slate-900 mb-1 flex items-center gap-2">' + icon('alert-triangle', 16, 'text-amber-500') + ' No Registry Data Available</div>' +
            '<div class="text-slate-500">Government registry information not available for this country. Manual verification required.</div>' +
            '</div>';
    }
    html += '</div></div>';

    // AI Analysis Section
    if (analysis) {
        // Findings
        if (analysis.findings && analysis.findings.length) {
            html += '<div class="mb-4">' +
                '<h4 class="font-semibold text-sm text-slate-600 mb-2 flex items-center gap-2">' + icon('bot', 16, 'text-blue-500') + ' AI Findings</h4>' +
                '<div class="bg-slate-50 rounded-lg p-4">' +
                analysis.findings.map(function(f) {
                    var findIcon = f.toLowerCase().includes('warning') || f.toLowerCase().includes('expired') || f.toLowerCase().includes('not match') ? 'alert-triangle' : 'info';
                    var findIconColor = findIcon === 'alert-triangle' ? 'text-amber-500' : 'text-blue-500';
                    return '<div class="flex gap-2 items-start mb-2 text-sm">' +
                        '<span class="mt-0.5">' + icon(findIcon, 14, findIconColor) + '</span><span class="text-slate-700">' + esc(f) + '</span></div>';
                }).join('') +
                '</div></div>';
        }

        // Validation checks
        if (analysis.validation) {
            var checks = analysis.validation;
            html += '<div class="mb-4">' +
                '<h4 class="font-semibold text-sm text-slate-600 mb-2 flex items-center gap-2">' + icon('check-circle', 16, 'text-emerald-500') + ' Validation Checks</h4>' +
                '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">';
            var checkItems = [
                { key: 'name_matches', label: 'Name matches certificate' },
                { key: 'number_format_valid', label: 'Registration number format valid' },
                { key: 'authority_recognized', label: 'Issuing authority recognized' },
                { key: 'is_expired', label: 'Registration not expired', invert: true },
            ];
            checkItems.forEach(function(ci) {
                var val = checks[ci.key];
                if (val === null || val === undefined) {
                    html += '<div class="flex gap-2 items-center p-2 bg-slate-50 rounded-md text-sm">' +
                        '<span>' + icon('help-circle', 14, 'text-slate-400') + '</span><span class="text-slate-500">' + esc(ci.label) + ' - Unknown</span></div>';
                } else {
                    var pass = ci.invert ? !val : val;
                    html += '<div class="flex gap-2 items-center p-2 rounded-md text-sm ' + (pass ? 'bg-emerald-50' : 'bg-rose-50') + '">' +
                        '<span>' + icon(pass ? 'check-circle' : 'x-circle', 14, pass ? 'text-emerald-500' : 'text-rose-500') + '</span><span class="text-slate-700">' + esc(ci.label) + '</span></div>';
                }
            });
            html += '</div></div>';
        }

        // Recommendations
        if (analysis.recommendations && analysis.recommendations.length) {
            html += '<div class="mb-4">' +
                '<h4 class="font-semibold text-sm text-slate-600 mb-2 flex items-center gap-2">' + icon('lightbulb', 16, 'text-amber-500') + ' Recommendations</h4>' +
                '<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">' +
                analysis.recommendations.map(function(r) {
                    return '<div class="flex gap-2 items-start mb-1.5 text-sm">' +
                        '<span class="mt-0.5">' + icon('arrow-right', 14, 'text-blue-500') + '</span><span class="text-slate-700">' + esc(r) + '</span></div>';
                }).join('') +
                '</div></div>';
        }
    }

    // Action buttons
    if (v && v.status !== 'verified') {
        html += '<div class="flex gap-3 mt-4 pt-4 border-t border-slate-200">' +
            '<button class="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2" onclick="confirmVerificationById(' + v.id + ', ' + orgId + ')">' + icon('check-circle', 16) + ' Mark as Verified</button>' +
            '<button class="px-4 py-2 bg-rose-50 border border-rose-300 text-rose-600 text-sm font-medium rounded-lg hover:bg-rose-100 transition-colors inline-flex items-center gap-2" onclick="flagVerificationById(' + v.id + ', ' + orgId + ')">' + icon('alert-triangle', 16) + ' Flag Issue</button>' +
            '<button class="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-2" onclick="runVerification(' + orgId + ')">' + icon('refresh-cw', 16) + ' Re-run AI Check</button>' +
            '</div>';
    }

    html += '</div>';
    el.innerHTML = html;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function confirmVerification(orgId) {
    // First get the verification to find its ID
    var res = await api('GET', '/api/verification/' + orgId);
    if (res && res.verifications && res.verifications.length) {
        await confirmVerificationById(res.verifications[0].id, orgId);
    } else {
        showToast(T('toast.no_verification_record'), 'warning');
    }
}

async function confirmVerificationById(vId, orgId) {
    var res = await api('PUT', '/api/verification/' + vId + '/update', {
        status: 'verified',
        notes: 'Manually verified by donor after reviewing AI analysis and government registry.'
    });
    if (res && res.success) {
        showToast(T('toast.registration_verified'), 'success');
        loadVerificationData();
        viewVerificationDetail(orgId);
    } else {
        showToast(T('toast.error'), 'error');
    }
}

async function flagVerification(orgId) {
    var res = await api('GET', '/api/verification/' + orgId);
    if (res && res.verifications && res.verifications.length) {
        await flagVerificationById(res.verifications[0].id, orgId);
    } else {
        showToast(T('toast.no_verification_record'), 'warning');
    }
}

async function flagVerificationById(vId, orgId) {
    var res = await api('PUT', '/api/verification/' + vId + '/update', {
        status: 'flagged',
        notes: 'Flagged for further review. Manual verification with government registry required.'
    });
    if (res && res.success) {
        showToast(T('toast.registration_flagged'), 'warning');
        loadVerificationData();
        viewVerificationDetail(orgId);
    } else {
        showToast(T('toast.error'), 'error');
    }
}

async function loadRegistryDirectory() {
    var el = document.getElementById('registry-directory');
    if (!el) return;

    if (el.style.display === 'block') {
        el.style.display = 'none';
        return;
    }

    var res = await api('GET', '/api/verification/registries');
    if (!res || !res.registries) return;

    var countries = Object.keys(res.registries).sort();
    var html = '<div class="bg-white rounded-xl border border-slate-200/60 p-5">' +
        '<h3 class="font-semibold text-slate-900 mb-4 flex items-center gap-2">' + icon('globe', 18, 'text-brand-500') + ' Government NGO Registries Directory</h3>' +
        '<p class="text-sm text-slate-500 mb-4">Direct links to government registries where you can manually verify NGO registrations.</p>' +
        '<div class="overflow-x-auto"><table class="w-full"><thead><tr class="bg-slate-50 border-b border-slate-200">' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('verification.country') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('verification.registration_authority') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('verification.expected_format') + '</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">' + T('common.actions') + '</th>' +
        '</tr></thead><tbody class="divide-y divide-slate-100">' +
        countries.map(function(c) {
            var r = res.registries[c];
            var links = '';
            if (r.search_url) links += '<a href="' + esc(r.search_url) + '" target="_blank" class="px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-1 mr-1">' + icon('search', 12) + ' Search</a>';
            if (r.url) links += '<a href="' + esc(r.url) + '" target="_blank" class="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-1">' + icon('globe', 12) + ' Website</a>';
            if (!r.search_url && !r.url) links = '<span class="text-slate-400 text-xs">' + T('verification.no_online_portal') + '</span>';
            return '<tr class="hover:bg-slate-50/80 transition-colors">' +
                '<td class="px-4 py-3.5 font-semibold text-sm text-slate-900 flex items-center gap-1">' + icon('flag', 14) + ' ' + esc(c) + '</td>' +
                '<td class="px-4 py-3.5 text-xs text-slate-600">' + esc(r.authority) + '<br><span class="text-slate-400">' + esc(r.notes || '') + '</span></td>' +
                '<td class="px-4 py-3.5"><code class="bg-slate-100 px-2 py-0.5 rounded text-xs">' + esc(r.expected_format || 'N/A') + '</code></td>' +
                '<td class="px-4 py-3.5">' + links + '</td></tr>';
        }).join('') +
        '</tbody></table></div></div>';

    el.innerHTML = html;
    el.style.display = 'block';
}

// -- NGO Verification Status (for org profile) --
async function loadOrgVerificationStatus() {
    if (!S.user.org_id) return;
    var res = await api('GET', '/api/verification/' + S.user.org_id);
    var el = document.getElementById('org-verification-status');
    if (!el || !res) return;

    var v = (res.verifications && res.verifications.length) ? res.verifications[0] : null;
    var reg = res.registry_info;

    var html = '';
    if (v) {
        html += '<div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">' +
            '<div style="font-size:36px;">' + (v.status === 'verified' ? '\u2705' : v.status === 'flagged' ? '\u26A0\uFE0F' : v.status === 'ai_reviewed' ? '\uD83E\uDD16' : '\u23F3') + '</div>' +
            '<div><div style="font-size:18px;font-weight:600;">Registration ' + verificationStatusBadge(v.status) + '</div>' +
            '<div style="font-size:13px;color:#64748b;margin-top:4px;">Reg #: <code>' + esc(v.registration_number || res.registration_number || 'Not provided') + '</code>' +
            (v.registration_authority ? ' &mdash; ' + esc(v.registration_authority) : '') + '</div>';
        if (v.verified_by_name) html += '<div style="font-size:12px;color:#16a34a;margin-top:2px;">Verified by ' + esc(v.verified_by_name) + ' on ' + formatDate(v.verified_at) + '</div>';
        html += '</div></div>';

        if (v.ai_confidence != null) {
            html += '<div style="margin-bottom:12px;"><span style="font-size:13px;color:#64748b;">AI Confidence:</span> ' +
                '<span style="font-weight:600;color:' + (v.ai_confidence >= 80 ? '#16a34a' : v.ai_confidence >= 50 ? '#d97706' : '#dc2626') + ';">' +
                Math.round(v.ai_confidence) + '%</span></div>';
        }

        // Show findings briefly
        var analysis = v.ai_analysis;
        if (analysis && analysis.findings) {
            html += '<div style="font-size:13px;">' +
                analysis.findings.slice(0, 3).map(function(f) {
                    return '<div style="margin-bottom:4px;color:#475569;">\u2022 ' + esc(f) + '</div>';
                }).join('') +
                '</div>';
        }
    } else {
        html += '<div style="text-align:center;padding:16px;color:#94a3b8;">' +
            '<p>\u2753 Registration has not been verified yet.</p>' +
            '<p style="font-size:13px;">Upload your registration certificate in the Documents section to enable verification.</p>' +
            '</div>';
    }

    // Government registry link
    if (reg && (reg.url || reg.search_url)) {
        html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid #f1f5f9;">' +
            '<span style="font-size:13px;color:#64748b;">\uD83C\uDFDB\uFE0F ' + esc(reg.authority) + '</span>' +
            (reg.search_url ? ' <a href="' + esc(reg.search_url) + '" target="_blank" style="font-size:12px;color:#2563eb;">View Registry \u2197</a>' : '') +
            '</div>';
    }

    el.innerHTML = html;
}

// =============================================================================
// 36. AI Panel
// =============================================================================

function renderAIPanel() {
    var messagesHTML = S.aiMessages.map(function(m) {
        var sourceTag = (m.role === 'assistant' && m.source) ?
            '<div class="text-[10px] text-slate-400 mt-1">' + esc(m.source) + '</div>' : '';
        var content = m.role === 'assistant' ? renderMarkdown(m.content) : esc(m.content);
        var bubbleCls = m.role === 'user'
            ? 'ml-auto max-w-[85%] bg-brand-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm'
            : 'mr-auto max-w-[85%] bg-slate-100 text-slate-800 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm';
        return '<div class="' + bubbleCls + '">' +
            content + sourceTag + '</div>';
    }).join('');

    if (S.aiLoading) {
        messagesHTML += '<div class="mr-auto flex items-center gap-2 px-4 py-2.5 text-sm text-slate-500">' +
            '<div class="dot-pulse"><span></span><span></span><span></span></div>' +
            '<span>' + T('ai.thinking') + '</span></div>';
    }

    if (!S.aiMessages.length) {
        messagesHTML = '<div class="text-center py-8 text-slate-400 text-sm">' +
            '<div class="mb-2">' + icon('sparkles', 32, 'text-brand-300 mx-auto') + '</div>' +
            '<p>' + T('ai.welcome') + '</p>' +
            '</div>';
    }

    return '<div class="ai-panel' + (S.aiPanelOpen ? '' : ' collapsed') + '" id="ai-panel" role="complementary" aria-label="' + T('ai.panel_title') + '">' +
        '<div class="bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3 flex items-center justify-between">' +
        '<h3 class="text-white font-semibold text-sm flex items-center gap-2">' + icon('sparkles', 16, 'text-brand-200') + ' ' + T('ai.panel_title') + '</h3>' +
        '<button class="text-white/70 hover:text-white transition-colors" onclick="toggleAI()" aria-label="Close AI panel">' + icon('x', 18) + '</button>' +
        '</div>' +
        '<div class="ai-messages flex flex-col gap-3 p-4 overflow-y-auto" id="ai-messages">' + messagesHTML + '</div>' +
        '<div class="border-t border-slate-200 p-3 flex items-center gap-2">' +
        '<input type="text" id="ai-input-field" class="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors" placeholder="' + T('ai.placeholder') + '" ' +
        'aria-label="' + T('ai.placeholder') + '" ' +
        'onkeydown="if(event.key===\'Enter\')sendAIMessage();">' +
        '<button class="px-3 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shrink-0" onclick="sendAIMessage()">' + icon('send', 16) + '</button>' +
        '</div>' +
        '</div>';
}

async function sendAIMessage() {
    var input = document.getElementById('ai-input-field');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;

    S.aiMessages.push({ role: 'user', content: text });
    input.value = '';
    S.aiLoading = true;
    refreshAIPanel();

    var context = {
        page: S.page,
        role: S.user ? S.user.role : '',
        grant: S.selectedGrant ? S.selectedGrant.title : '',
        application: S.selectedApplication ? (S.selectedApplication.grant_title || '') : ''
    };

    var res = await api('POST', '/api/ai/chat', { message: text, context: context });
    S.aiLoading = false;
    if (res) {
        var source = res.source || 'unknown';
        var sourceLabel = source === 'claude' ? 'Claude AI' : 'Rule-based';
        S.aiMessages.push({ role: 'assistant', content: res.response || res.message || 'I\'m here to help!', source: sourceLabel });
    } else {
        S.aiMessages.push({ role: 'assistant', content: 'Sorry, I encountered an issue. Please try again.' });
    }
    refreshAIPanel();
}

function refreshAIPanel() {
    var container = document.getElementById('ai-messages');
    if (!container) return;

    var messagesHTML = S.aiMessages.map(function(m) {
        var content = m.role === 'assistant' ? renderMarkdown(m.content) : esc(m.content);
        var sourceTag = (m.role === 'assistant' && m.source) ?
            '<div class="text-[10px] text-slate-400 mt-1">' + esc(m.source) + '</div>' : '';
        var bubbleCls = m.role === 'user'
            ? 'ml-auto max-w-[85%] bg-brand-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm'
            : 'mr-auto max-w-[85%] bg-slate-100 text-slate-800 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm';
        return '<div class="' + bubbleCls + '">' +
            content + sourceTag + '</div>';
    }).join('');

    if (S.aiLoading) {
        messagesHTML += '<div class="mr-auto flex items-center gap-2 px-4 py-2.5 text-sm text-slate-500">' +
            '<div class="dot-pulse"><span></span><span></span><span></span></div>' +
            '<span>Thinking...</span></div>';
    }

    container.innerHTML = messagesHTML;
    container.scrollTop = container.scrollHeight;
}

// =============================================================================
// 35. Initialization
// =============================================================================

(async function init() {
    // Add keyframe animations via style tag
    var styleEl = document.createElement('style');
    styleEl.textContent =
        '@keyframes spin { to { transform: rotate(360deg); } }' +
        '@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }' +
        '@keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }' +
        '@keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }' +
        '@keyframes slideInRight { from { opacity: 0; transform: translateX(100px); } to { opacity: 1; transform: translateX(0); } }' +
        '@keyframes slideInUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }' +
        '@keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }' +
        '.hidden { display: none !important; }' +
        '#toast-container .toast-close { background:none;border:none;font-size:18px;cursor:pointer;color:#94a3b8;padding:0 4px; }' +
        '#toast-container .toast-close:hover { color:#1e293b; }' +
        '@media (max-width: 768px) {' +
        '  .sidebar { transform: translateX(-100%); }' +
        '  .sidebar.mobile-open { transform: translateX(0); }' +
        '  .main-content { margin-left: 0 !important; }' +
        '  .header-user span:not(.badge) { display: none; }' +
        '}' +
        '@media (max-width: 1024px) {' +
        '  .sidebar { width: 60px; }' +
        '  .sidebar .nav-item span:not(.nav-icon) { display: none; }' +
        '  .sidebar .sidebar-section-title { visibility: hidden; height: 0; padding: 0; }' +
        '  .main-content { margin-left: 60px !important; }' +
        '}';
    document.head.appendChild(styleEl);

    // Load English translations first (always needed as fallback)
    await loadTranslations('en');

    // Issue #25: Restore language from localStorage before first render
    var savedLang = null;
    try { savedLang = localStorage.getItem('kuja_lang'); } catch(e) {}
    if (savedLang && savedLang !== 'en') {
        _currentLang = savedLang;
        await loadTranslations(savedLang);
        document.documentElement.lang = savedLang;
        document.documentElement.dir = savedLang === 'ar' ? 'rtl' : 'ltr';
    }

    // Check for existing cookie session via server
    try {
        var res = await api('GET', '/api/auth/me');
        if (res && res.user) {
            S.user = res.user;
            S.page = 'dashboard';
            // Load user's saved language preference (server overrides local)
            var userLang = res.user.language || savedLang || 'en';
            if (userLang !== _currentLang) {
                _currentLang = userLang;
                await loadTranslations(userLang);
                document.documentElement.lang = userLang;
                document.documentElement.dir = userLang === 'ar' ? 'rtl' : 'ltr';
            }
        } else {
            S.user = null;
            S.page = 'login';
        }
    } catch (e) {
        S.user = null;
        S.page = 'login';
    }

    render();

    // Handle browser keyboard shortcut for login
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && S.page === 'login') {
            doLogin();
        }
    });
})();

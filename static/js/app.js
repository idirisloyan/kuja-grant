/* =============================================================================
   Kuja Grant Management System - Single Page Application
   Version: 1.0.0
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
    const map = {
        draft: 'badge-draft', open: 'badge-open', published: 'badge-open',
        submitted: 'badge-submitted', in_review: 'badge-review', review: 'badge-review',
        under_review: 'badge-review', scored: 'badge-scored',
        awarded: 'badge-awarded', approved: 'badge-awarded', accepted: 'badge-awarded',
        rejected: 'badge-rejected', declined: 'badge-rejected', closed: 'badge-gray',
        pending: 'badge-amber', completed: 'badge-green', active: 'badge-green'
    };
    const labelMap = {
        draft: T('status.draft'), open: T('status.open'), published: T('status.open'),
        submitted: T('status.submitted'), in_review: T('status.review'), review: T('status.review'),
        under_review: T('status.under_review'), scored: T('status.scored'),
        awarded: T('status.awarded'), approved: T('status.awarded'), accepted: T('status.accepted'),
        rejected: T('status.rejected'), declined: T('status.rejected'), closed: T('status.closed'),
        pending: T('status.pending'), completed: T('status.completed'), active: T('status.in_progress'),
        assigned: T('status.assigned'), clear: T('status.clear'), flagged: T('status.flagged'),
        error: T('status.error'), unverified: T('status.unverified'), verified: T('status.verified'),
        expired: T('status.expired'), ai_reviewed: T('status.ai_reviewed'),
        revision_requested: T('status.revision_requested')
    };
    const cls = map[status.toLowerCase()] || 'badge-gray';
    const label = labelMap[status.toLowerCase()] || esc(status.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }));
    return '<span class="badge ' + cls + '" role="status">' + esc(label) + '</span>';
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
    var col = scoreColor(score);
    return '<div class="score-ring" style="width:' + size + 'px;height:' + size + 'px;">' +
        '<svg viewBox="0 0 ' + size + ' ' + size + '" style="width:' + size + 'px;height:' + size + 'px;">' +
        '<circle class="ring-bg" cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + r + '"/>' +
        '<circle class="ring-fill ' + col + '" cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + r + '" ' +
        'stroke-dasharray="' + c + '" stroke-dashoffset="' + offset + '"/>' +
        '</svg>' +
        '<div class="score-value">' +
        '<span class="score-number">' + score + '</span>' +
        (label ? '<span class="score-label">' + esc(label) + '</span>' : '') +
        '</div></div>';
}

function sectorIcon(sector) {
    var icons = {
        health: '\uD83C\uDFE5', education: '\uD83D\uDCDA', climate: '\uD83C\uDF0D',
        protection: '\uD83D\uDEE1\uFE0F', nutrition: '\uD83C\uDF4E', wash: '\uD83D\uDCA7',
        livelihoods: '\uD83D\uDCB5', governance: '\u2696\uFE0F', agriculture: '\uD83C\uDF3E',
        environment: '\uD83C\uDF3F', humanitarian: '\u2764\uFE0F', gender: '\u2640\uFE0F'
    };
    return icons[(sector || '').toLowerCase()] || '\uD83D\uDCCC';
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
    var icons = { success: '\u2705', error: '\u274C', warning: '\u26A0\uFE0F', info: '\u2139\uFE0F' };
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<span class="toast-icon">' + (icons[type] || '') + '</span>' +
        '<span class="toast-message">' + esc(message) + '</span>' +
        '<button class="toast-close" onclick="this.parentElement.remove()">\u00D7</button>';
    toast.style.cssText = 'display:flex;align-items:center;gap:8px;padding:12px 16px;' +
        'background:white;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);' +
        'margin-bottom:8px;font-size:14px;min-width:280px;max-width:420px;' +
        'animation:slideInRight 0.3s ease;border-left:4px solid ' +
        (type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6') + ';';
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;';
    container.appendChild(toast);
    setTimeout(function() {
        if (toast.parentElement) {
            toast.style.animation = 'fadeOut 0.3s ease forwards';
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
        btnsHTML = '<div class="modal-footer">' +
            buttons.map(function(b) {
                return '<button class="btn ' + (b.cls || 'btn-secondary') + '" onclick="' + esc(b.onclick) + '">' + esc(b.label) + '</button>';
            }).join('') + '</div>';
    }
    mc.innerHTML = '<div class="modal">' +
        '<div class="modal-header"><h2>' + esc(title) + '</h2>' +
        '<button class="modal-close" onclick="closeModal()">\u00D7</button></div>' +
        '<div class="modal-body">' + contentHTML + '</div>' +
        btnsHTML + '</div>';
    overlay.classList.remove('hidden');
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
    S.page = page;
    if (params) {
        Object.keys(params).forEach(function(k) { S[k] = params[k]; });
    }
    render();
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
        return;
    }

    if (!S.user) {
        nav('login');
        return;
    }

    app.innerHTML = renderShell();
    bindShellEvents();
}

// =============================================================================
// 8. Login Page
// =============================================================================

function renderLogin() {
    return '<div class="login-page">' +
        '<div class="login-card">' +
        '<div class="login-logo">' +
        '<svg width="56" height="56" viewBox="0 0 56 56" style="margin:0 auto 12px;">' +
        '<circle cx="28" cy="28" r="26" fill="#2d8f6f"/>' +
        '<text x="28" y="36" text-anchor="middle" fill="white" font-size="28" font-family="Inter, Arial" font-weight="bold">K</text>' +
        '</svg>' +
        '<h1>' + T('auth.login_title') + '</h1>' +
        '<p>' + T('auth.subtitle') + '</p>' +
        '</div>' +
        '<div id="login-error" style="display:none;color:#ef4444;font-size:13px;text-align:center;margin-bottom:12px;"></div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('auth.email_label') + '</label>' +
        '<input type="email" id="login-email" class="form-control" placeholder="' + T('auth.email_placeholder') + '">' +
        '</div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('auth.password_label') + '</label>' +
        '<input type="password" id="login-pass" class="form-control" placeholder="' + T('auth.password_placeholder') + '">' +
        '</div>' +
        '<button class="btn btn-primary btn-lg" style="width:100%;margin-bottom:24px;" onclick="doLogin()">' +
        '<span id="login-btn-text">' + T('auth.sign_in') + '</span>' +
        '</button>' +
        '<div style="border-top:1px solid #e2e8f0;padding-top:20px;">' +
        '<p style="font-size:13px;color:#64748b;text-align:center;margin-bottom:12px;font-weight:600;">' + T('auth.demo_accounts') + '</p>' +
        '<div class="role-selector">' +
        '<div class="role-card" onclick="fillDemo(\'ngo\')">' +
        '<div class="role-icon">\uD83C\uDFE2</div>' +
        '<div class="role-label">NGO</div>' +
        '<div style="font-size:10px;color:#94a3b8;margin-top:4px;">fatima@amani.org</div>' +
        '</div>' +
        '<div class="role-card" onclick="fillDemo(\'donor\')">' +
        '<div class="role-icon">\uD83D\uDCB0</div>' +
        '<div class="role-label">Donor</div>' +
        '<div style="font-size:10px;color:#94a3b8;margin-top:4px;">sarah@globalhealth.org</div>' +
        '</div>' +
        '<div class="role-card" onclick="fillDemo(\'reviewer\')">' +
        '<div class="role-icon">\u2B50</div>' +
        '<div class="role-label">Reviewer</div>' +
        '<div style="font-size:10px;color:#94a3b8;margin-top:4px;">james@reviewer.org</div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>' +
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
    document.querySelectorAll('.role-card').forEach(function(el) { el.classList.remove('active'); });
    event.currentTarget.classList.add('active');
}

async function doLogin() {
    var email = (document.getElementById('login-email') || {}).value || '';
    var pass = (document.getElementById('login-pass') || {}).value || '';
    if (!email || !pass) {
        showToast(T('auth.email_password_required'), 'warning');
        return;
    }
    var btn = document.getElementById('login-btn-text');
    if (btn) btn.innerHTML = '<span class="spinner" style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.6s linear infinite;"></span> ' + T('auth.signing_in');

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

    return renderHeader() + renderSidebar(role) +
        '<main class="main-content" id="main-content" role="main" style="' +
        (S.sidebarCollapsed ? 'margin-left:60px;' : '') +
        (S.aiPanelOpen ? 'margin-right:340px;' : '') +
        '">' + mainHTML + '</main>' +
        renderAIPanel() +
        '<button class="ai-panel-toggle" onclick="toggleAI()" title="AI Assistant" aria-label="' + T('ai.panel_title') + '">\u2728</button>';
}

function renderHeader() {
    var role = (S.user.role || '').replace(/_/g, ' ');
    var roleBadge = '';
    if (role === 'ngo') roleBadge = '<span class="badge badge-green">NGO</span>';
    else if (role === 'donor') roleBadge = '<span class="badge badge-blue">Donor</span>';
    else if (role === 'reviewer') roleBadge = '<span class="badge badge-amber">Reviewer</span>';
    else roleBadge = '<span class="badge badge-gray">' + esc(role) + '</span>';

    return '<header class="header" role="banner">' +
        '<div class="header-logo" style="cursor:pointer;" onclick="nav(\'dashboard\')">' +
        '<svg width="32" height="32" viewBox="0 0 32 32">' +
        '<circle cx="16" cy="16" r="14" fill="#2d8f6f"/>' +
        '<text x="16" y="22" text-anchor="middle" fill="white" font-size="16" font-family="Inter, Arial" font-weight="bold">K</text>' +
        '</svg>' +
        '<span>Kuja Grant</span>' +
        '</div>' +
        '<div class="header-actions">' +
        '<div class="header-user">' +
        '<div style="width:32px;height:32px;border-radius:50%;background:#2d8f6f;color:white;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;">' +
        esc((S.user.name || 'U').charAt(0).toUpperCase()) +
        '</div>' +
        '<span>' + esc(S.user.name || 'User') + '</span>' +
        roleBadge +
        '</div>' +
        '<div class="language-switcher">' +
        '<select onchange="setLanguage(this.value)" aria-label="Select language">' +
        '<option value="en"' + (_currentLang === 'en' ? ' selected' : '') + '>\uD83C\uDF10 English</option>' +
        '<option value="ar"' + (_currentLang === 'ar' ? ' selected' : '') + '>\uD83C\uDF10 \u0627\u0644\u0639\u0631\u0628\u064A\u0629</option>' +
        '<option value="fr"' + (_currentLang === 'fr' ? ' selected' : '') + '>\uD83C\uDF10 Fran\u00E7ais</option>' +
        '<option value="es"' + (_currentLang === 'es' ? ' selected' : '') + '>\uD83C\uDF10 Espa\u00F1ol</option>' +
        '</select>' +
        '</div>' +
        '<button class="btn-logout" onclick="doLogout()">\uD83D\uDEAA ' + T('auth.logout') + '</button>' +
        '</div>' +
        '</header>';
}

function renderSidebar(role) {
    var items = [];
    if (role === 'ngo') {
        items = [
            { icon: '\uD83D\uDCCA', label: T('nav.dashboard'), page: 'dashboard' },
            { icon: '\uD83D\uDCDD', label: T('nav.assessment_hub'), page: 'assessment' },
            { icon: '\uD83D\uDCB0', label: T('nav.browse_grants'), page: 'grants' },
            { icon: '\uD83D\uDCCB', label: T('nav.my_applications'), page: 'applications' },
            { icon: '\uD83D\uDCC8', label: T('nav.reports'), page: 'reports' },
            { icon: '\uD83D\uDCC4', label: T('nav.my_documents'), page: 'documents' },
            { icon: '\uD83D\uDC64', label: T('nav.org_profile'), page: 'orgprofile' }
        ];
    } else if (role === 'donor') {
        items = [
            { icon: '\uD83D\uDCCA', label: T('nav.dashboard'), page: 'dashboard' },
            { icon: '\u2795', label: T('nav.create_grant'), page: 'creategrant' },
            { icon: '\uD83D\uDCB0', label: T('nav.my_grants'), page: 'mygrants' },
            { icon: '\u2B50', label: T('nav.review_applications'), page: 'rankings' },
            { icon: '\uD83D\uDCC8', label: T('nav.grant_reports'), page: 'reports' },
            { icon: '\uD83D\uDD0D', label: T('nav.org_search'), page: 'orgsearch' },
            { icon: '\u2705', label: T('nav.registration_checks'), page: 'verification' },
            { icon: '\uD83D\uDEE1\uFE0F', label: T('nav.compliance'), page: 'compliance' }
        ];
    } else if (role === 'reviewer') {
        items = [
            { icon: '\uD83D\uDCCA', label: T('nav.dashboard'), page: 'dashboard' },
            { icon: '\uD83D\uDCCB', label: T('nav.my_assignments'), page: 'assignments' },
            { icon: '\u2705', label: T('nav.completed_reviews'), page: 'completedreviews' }
        ];
    } else if (role === 'admin') {
        items = [
            { icon: '\uD83D\uDCCA', label: T('nav.admin_dashboard'), page: 'dashboard' },
            { icon: '\uD83D\uDCB0', label: T('nav.all_grants'), page: 'grants' },
            { icon: '\uD83D\uDCCB', label: T('nav.all_applications'), page: 'applications' },
            { icon: '\uD83D\uDD0D', label: T('nav.org_search'), page: 'orgsearch' },
            { icon: '\u2705', label: T('nav.registration_checks'), page: 'verification' },
            { icon: '\uD83D\uDEE1\uFE0F', label: T('nav.compliance'), page: 'compliance' },
            { icon: '\uD83D\uDCC8', label: T('nav.reports'), page: 'reports' }
        ];
    }

    var navHTML = items.map(function(it) {
        var active = S.page === it.page ? ' active' : '';
        return '<div class="nav-item' + active + '" onclick="nav(\'' + it.page + '\')">' +
            '<span class="nav-icon">' + it.icon + '</span>' +
            '<span>' + esc(it.label) + '</span>' +
            '</div>';
    }).join('');

    return '<aside class="sidebar' + (S.sidebarCollapsed ? ' collapsed' : '') + '" id="sidebar" role="navigation" aria-label="' + T('nav.dashboard') + '">' +
        '<nav class="sidebar-nav">' +
        '<div class="sidebar-section">' +
        '<div class="sidebar-section-title">Navigation</div>' +
        navHTML +
        '</div>' +
        '</nav>' +
        '<div class="sidebar-toggle">' +
        '<button onclick="toggleSidebar()" title="Toggle Sidebar" aria-label="Toggle sidebar navigation">' +
        (S.sidebarCollapsed ? '\u25B6' : '\u25C0') +
        '</button>' +
        '</div>' +
        '</aside>';
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
        default: return '<div class="page-header"><h1>' + T('common.page_not_found') + '</h1><p>' + T('common.page_not_found_desc') + '</p></div>' +
            '<button class="btn btn-primary" onclick="nav(\'dashboard\')">' + T('common.go_to_dashboard') + '</button>';
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

    return '<div class="page-header">' +
        '<h1>\uD83D\uDC4B ' + T('dashboard.welcome', {name: S.user.name || 'User'}) + '</h1>' +
        '<p>' + esc(S.user.org_name || 'Your Organization') + '</p>' +
        '</div>' +

        // Stat Cards
        '<div id="ngo-stat-cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-bottom:32px;">' +
        renderStatCard('\uD83D\uDCCA', T('dashboard.stat.capacity_score'), score + '%', 'green') +
        renderStatCard('\uD83D\uDCCB', T('dashboard.stat.my_applications'), stats.total_applications || 0, 'blue') +
        renderStatCard('\uD83D\uDCB0', T('dashboard.stat.open_grants'), stats.open_grants || 0, 'amber') +
        renderStatCard('\uD83D\uDCC4', T('dashboard.stat.documents'), stats.documents || 0, 'red') +
        '</div>' +

        // Capacity Badge
        '<div class="card" style="margin-bottom:24px;">' +
        '<div class="card-body" style="display:flex;align-items:center;gap:24px;">' +
        scoreRingHTML(score, 80, '%') +
        '<div>' +
        '<h3 style="font-size:18px;font-weight:600;">' + T('dashboard.stat.capacity_score') + '</h3>' +
        '<p style="font-size:14px;color:#64748b;margin-top:4px;">' +
        '<span class="badge badge-' + cap.color + '">' + esc(cap.label) + '</span></p>' +
        '</div>' +
        '<div style="margin-left:auto;">' +
        '<button class="btn btn-secondary btn-sm" onclick="nav(\'assessment\')">' + T('dashboard.action.start_assessment') + '</button>' +
        '</div>' +
        '</div>' +
        '</div>' +

        // Recommended Grants
        '<div style="margin-bottom:32px;">' +
        '<h2 style="font-size:18px;font-weight:600;margin-bottom:16px;">\uD83D\uDCA1 ' + T('dashboard.action.browse_grants') + '</h2>' +
        '<div id="recommended-grants" class="content-grid">' +
        renderLoadingCards(3) +
        '</div>' +
        '</div>' +

        // Upcoming Reports
        '<div style="margin-bottom:32px;">' +
        '<h2 style="font-size:18px;font-weight:600;margin-bottom:16px;">\uD83D\uDCC5 ' + T('dashboard.stat.reports_due') + '</h2>' +
        '<div id="upcoming-reports">' + renderLoadingTable() + '</div>' +
        '</div>' +

        // Recent Applications
        '<div style="margin-bottom:32px;">' +
        '<h2 style="font-size:18px;font-weight:600;margin-bottom:16px;">\uD83D\uDCCB ' + T('dashboard.stat.my_applications') + '</h2>' +
        '<div id="recent-applications">' + renderLoadingTable() + '</div>' +
        '</div>' +

        // Quick Actions
        '<div style="margin-bottom:32px;">' +
        '<h2 style="font-size:18px;font-weight:600;margin-bottom:16px;">\u26A1 ' + T('dashboard.quick_actions') + '</h2>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;">' +
        '<button class="btn btn-primary" onclick="nav(\'assessment\')">\uD83D\uDCDD ' + T('dashboard.action.start_assessment') + '</button>' +
        '<button class="btn btn-secondary" onclick="nav(\'grants\')">\uD83D\uDCB0 ' + T('dashboard.action.browse_grants') + '</button>' +
        '<button class="btn btn-secondary" onclick="nav(\'documents\')">\uD83D\uDCC4 ' + T('dashboard.action.view_documents') + '</button>' +
        '<button class="btn btn-secondary" onclick="nav(\'reports\')">\uD83D\uDCC8 ' + T('dashboard.action.view_reports') + '</button>' +
        '</div>' +
        '</div>';
}

async function loadUpcomingReports() {
    var res = await api('GET', '/api/reports/upcoming');
    var el = document.getElementById('upcoming-reports');
    if (!el) return;
    if (!res || !res.upcoming_reports || res.upcoming_reports.length === 0) {
        el.innerHTML = '<div class="card" style="padding:20px;text-align:center;"><p style="color:#94a3b8;">No upcoming reports due. Reports will appear here when you have awarded grants.</p></div>';
        return;
    }
    var reports = res.upcoming_reports;
    el.innerHTML = '<div class="table-wrapper"><table class="table table-hover"><thead><tr>' +
        '<th>' + T('report.title') + '</th><th>' + T('report.grant') + '</th><th>' + T('common.due_date') + '</th><th>' + T('application.tab.status') + '</th><th>' + T('common.actions') + '</th>' +
        '</tr></thead><tbody>' +
        reports.slice(0, 8).map(function(r) {
            var isOverdue = r.is_overdue;
            var daysText = isOverdue ? Math.abs(r.days_until_due) + ' days overdue' : r.days_until_due + ' days left';
            var badgeCls = isOverdue ? 'badge-red' : r.days_until_due <= 7 ? 'badge-amber' : 'badge-outline';
            var statusBadge = r.status === 'not_started' ? '<span class="badge badge-outline">' + T('common.not_started') + '</span>' :
                r.status === 'draft' ? '<span class="badge badge-outline">Draft</span>' :
                '<span class="badge badge-amber">' + esc(r.status).replace(/_/g, ' ') + '</span>';
            var actionBtn = r.draft_report_id ?
                '<button class="btn btn-primary btn-sm" onclick="editReport(' + r.draft_report_id + ')">Continue</button>' :
                '<button class="btn btn-primary btn-sm" onclick="startReportForGrant(' + r.grant_id + ',\'' + esc(r.report_type) + '\',\'' + esc(r.reporting_period) + '\')">Start</button>';
            return '<tr' + (isOverdue ? ' style="background:#fef2f2;"' : '') + '>' +
                '<td><strong>' + esc(r.requirement_title || r.report_type) + '</strong><br><span style="font-size:12px;color:#94a3b8;">' + esc(r.reporting_period) + '</span></td>' +
                '<td>' + esc(r.grant_title || '') + '</td>' +
                '<td><span class="badge ' + badgeCls + '">' + esc(daysText) + '</span><br><span style="font-size:12px;color:#94a3b8;">' + esc(r.due_date) + '</span></td>' +
                '<td>' + statusBadge + '</td>' +
                '<td>' + actionBtn + '</td></tr>';
        }).join('') +
        '</tbody></table></div>' +
        (reports.length > 8 ? '<p style="text-align:center;margin-top:8px;"><a href="#" onclick="nav(\'reports\');return false;" style="color:#2d8f6f;">View all ' + reports.length + ' upcoming reports</a></p>' : '');
}

async function startReportForGrant(grantId, reportType, period) {
    var res = await api('POST', '/api/reports', {
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

    return '<div class="page-header">' +
        '<h1>\uD83D\uDC4B ' + T('dashboard.welcome', {name: S.user.name || 'User'}) + '</h1>' +
        '<p>' + esc(S.user.org_name || 'Your Organization') + '</p>' +
        '</div>' +

        '<div id="donor-stat-cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-bottom:32px;">' +
        renderStatCard('\uD83D\uDCB0', T('dashboard.stat.total_grants'), stats.total_grants || 0, 'green') +
        renderStatCard('\uD83D\uDCCB', T('dashboard.stat.total_applications'), stats.total_applications || 0, 'blue') +
        renderStatCard('\u2B50', T('dashboard.stat.pending_reviews'), stats.pending_review || 0, 'amber') +
        renderStatCard('\uD83C\uDFC6', T('dashboard.stat.total_funding'), formatCurrency(stats.total_funding_awarded || 0), 'red') +
        renderStatCard('\uD83D\uDCCA', T('dashboard.stat.reports_due'), stats.pending_report_reviews || 0, 'blue') +
        '</div>' +

        '<div style="margin-bottom:32px;">' +
        '<h2 style="font-size:18px;font-weight:600;margin-bottom:16px;">\uD83D\uDCB0 ' + T('dashboard.stat.active_grants') + '</h2>' +
        '<div id="active-grants" class="content-grid">' +
        renderLoadingCards(3) +
        '</div>' +
        '</div>' +

        '<div style="margin-bottom:32px;">' +
        '<h2 style="font-size:18px;font-weight:600;margin-bottom:16px;">\uD83D\uDCCB ' + T('dashboard.stat.total_applications') + '</h2>' +
        '<div id="donor-recent-apps">' + renderLoadingTable() + '</div>' +
        '</div>' +

        '<div style="margin-bottom:32px;">' +
        '<h2 style="font-size:18px;font-weight:600;margin-bottom:16px;">\u26A1 ' + T('dashboard.quick_actions') + '</h2>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;">' +
        '<button class="btn btn-primary" onclick="nav(\'creategrant\')">\u2795 ' + T('dashboard.action.create_grant') + '</button>' +
        '<button class="btn btn-secondary" onclick="nav(\'rankings\')">\u2B50 ' + T('dashboard.action.review_apps') + '</button>' +
        '<button class="btn btn-secondary" onclick="nav(\'reports\')">\uD83D\uDCCA ' + T('dashboard.action.view_reports') + '</button>' +
        '</div>' +
        '</div>';
}

// =============================================================================
// 13. Reviewer Dashboard
// =============================================================================

function renderReviewerDashboard() {
    loadDashboardStats();
    var stats = S.dashboardStats || {};

    return '<div class="page-header">' +
        '<h1>\uD83D\uDC4B ' + T('dashboard.welcome', {name: S.user.name || 'Reviewer'}) + '</h1>' +
        '<p>' + T('nav.dashboard') + '</p>' +
        '</div>' +

        '<div id="reviewer-stat-cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-bottom:32px;">' +
        renderStatCard('\uD83D\uDCCB', T('dashboard.stat.assigned_reviews'), stats.assigned_reviews || 0, 'blue') +
        renderStatCard('\u23F3', T('status.in_progress'), stats.in_progress_reviews || 0, 'amber') +
        renderStatCard('\u2705', T('status.completed'), stats.completed_reviews || 0, 'green') +
        renderStatCard('\uD83D\uDCC8', T('dashboard.stat.avg_score'), (stats.average_score_given || 0) + '%', 'amber') +
        '</div>' +

        '<div style="margin-bottom:32px;">' +
        '<h2 style="font-size:18px;font-weight:600;margin-bottom:16px;">\uD83D\uDCCB ' + T('review.assignments') + '</h2>' +
        '<div id="reviewer-assignments">' + renderLoadingTable() + '</div>' +
        '</div>';
}

// =============================================================================
// 14b. Admin Dashboard
// =============================================================================

function renderAdminDashboard() {
    loadAdminStats();
    var stats = S.adminStats || {};

    return '<div class="page-header">' +
        '<h1>\uD83D\uDD27 ' + T('nav.admin_dashboard') + '</h1>' +
        '<p>' + T('dashboard.welcome', {name: S.user.name || 'Admin'}) + ' \u2014 ' +
        '<span style="font-size:13px;color:#64748b;">v' + esc(stats.app_version || '1.1.0') +
        ' \u2022 Uptime: ' + esc(stats.uptime || '--') +
        ' \u2022 ' + esc(stats.environment || 'production') + '</span></p>' +
        '</div>' +

        // SLO Alert Banner
        '<div id="admin-alerts">' + renderAlertBanner(stats.alerts || []) + '</div>' +

        // Top stat cards
        '<div id="admin-stat-cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:32px;">' +
        renderStatCard('\uD83D\uDC65', T('dashboard.stat.total_users'), stats.total_users || 0, 'blue') +
        renderStatCard('\uD83C\uDFE2', T('dashboard.stat.total_orgs'), stats.total_organizations || 0, 'green') +
        renderStatCard('\u2705', T('status.verified'), stats.verified_organizations || 0, 'green') +
        renderStatCard('\uD83D\uDCB0', T('dashboard.stat.total_grants'), stats.total_grants || 0, 'amber') +
        renderStatCard('\uD83D\uDCCB', T('dashboard.stat.total_applications'), stats.total_applications || 0, 'blue') +
        renderStatCard('\u26A0\uFE0F', T('dashboard.stat.compliance_alerts'), stats.flagged_compliance || 0, 'red') +
        '</div>' +

        // Two-column layout
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px;">' +

        '<div class="card"><div class="card-body">' +
        '<h3 style="font-size:16px;font-weight:600;margin-bottom:12px;">\uD83D\uDC65 ' + T('dashboard.stat.total_users') + '</h3>' +
        '<div id="admin-users-by-role">' + renderAdminRoleBreakdown(stats.users_by_role || {}) + '</div>' +
        '</div></div>' +

        '<div class="card"><div class="card-body">' +
        '<h3 style="font-size:16px;font-weight:600;margin-bottom:12px;">\uD83C\uDFE2 ' + T('dashboard.stat.total_orgs') + '</h3>' +
        '<div id="admin-orgs-by-type">' + renderAdminOrgBreakdown(stats.orgs_by_type || {}) + '</div>' +
        '</div></div>' +

        '</div>' +

        // Applications by Status
        '<div class="card" style="margin-bottom:32px;"><div class="card-body">' +
        '<h3 style="font-size:16px;font-weight:600;margin-bottom:12px;">\uD83D\uDCCB ' + T('dashboard.stat.total_applications') + '</h3>' +
        '<div id="admin-apps-by-status">' + renderAdminStatusBreakdown(stats.apps_by_status || {}) + '</div>' +
        '</div></div>' +

        // Activity last 7 days
        '<div class="card" style="margin-bottom:32px;"><div class="card-body">' +
        '<h3 style="font-size:16px;font-weight:600;margin-bottom:12px;">\uD83D\uDCC8 Last 7 Days</h3>' +
        '<div style="display:flex;gap:32px;">' +
        '<div><span style="font-size:28px;font-weight:700;color:#2d8f6f;">' + (stats.new_users_7d || 0) + '</span><div style="font-size:13px;color:#64748b;">' + T('dashboard.stat.total_users') + '</div></div>' +
        '<div><span style="font-size:28px;font-weight:700;color:#3b82f6;">' + (stats.new_apps_7d || 0) + '</span><div style="font-size:13px;color:#64748b;">' + T('dashboard.stat.total_applications') + '</div></div>' +
        '<div><span style="font-size:28px;font-weight:700;color:#f59e0b;">' + (stats.new_orgs_7d || 0) + '</span><div style="font-size:13px;color:#64748b;">' + T('dashboard.stat.total_orgs') + '</div></div>' +
        '</div>' +
        '</div></div>' +

        // Recent Users Table
        '<div style="margin-bottom:32px;">' +
        '<h2 style="font-size:18px;font-weight:600;margin-bottom:16px;">\uD83D\uDC65 ' + T('dashboard.stat.total_users') + '</h2>' +
        '<div id="admin-recent-users">' + renderLoadingTable() + '</div>' +
        '</div>' +

        // System Info
        '<div class="card" style="margin-bottom:32px;"><div class="card-body">' +
        '<h3 style="font-size:16px;font-weight:600;margin-bottom:12px;">\u2699\uFE0F System Information</h3>' +
        '<div style="display:grid;grid-template-columns:auto 1fr;gap:8px 24px;font-size:14px;">' +
        '<strong>AI Service:</strong><span>' + (stats.ai_enabled ? '\u2705 Enabled (Claude AI)' : '\u274C Not configured') + '</span>' +
        '<strong>Database:</strong><span>' + esc(stats.environment === 'production' ? 'PostgreSQL' : 'SQLite') + '</span>' +
        '<strong>Total Reviews:</strong><span>' + (stats.total_reviews || 0) + '</span>' +
        '<strong>Total Assessments:</strong><span>' + (stats.total_assessments || 0) + '</span>' +
        '</div>' +
        '</div></div>' +

        // Security & Audit Dashboard
        '<div class="card" style="margin-bottom:32px;border-left:4px solid #ef4444;"><div class="card-body">' +
        '<h3 style="font-size:16px;font-weight:600;margin-bottom:12px;">\uD83D\uDD12 Security & Audit</h3>' +
        '<div id="admin-security-metrics">' + renderSecurityMetrics(stats.security || {}) + '</div>' +
        '</div></div>' +

        // Document Metrics
        '<div class="card" style="margin-bottom:32px;border-left:4px solid #8b5cf6;"><div class="card-body">' +
        '<h3 style="font-size:16px;font-weight:600;margin-bottom:12px;">\uD83D\uDCC4 Upload & Document Metrics</h3>' +
        '<div id="admin-document-metrics">' + renderDocumentMetrics(stats.documents || {}) + '</div>' +
        '</div></div>' +

        // Quick Actions
        '<div style="margin-bottom:32px;">' +
        '<h2 style="font-size:18px;font-weight:600;margin-bottom:16px;">\u26A1 ' + T('dashboard.quick_actions') + '</h2>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;">' +
        '<button class="btn btn-primary" onclick="nav(\'orgsearch\')">\uD83D\uDD0D ' + T('nav.org_search') + '</button>' +
        '<button class="btn btn-secondary" onclick="nav(\'grants\')">\uD83D\uDCB0 ' + T('nav.all_grants') + '</button>' +
        '<button class="btn btn-secondary" onclick="nav(\'applications\')">\uD83D\uDCCB ' + T('nav.all_applications') + '</button>' +
        '<button class="btn btn-secondary" onclick="nav(\'compliance\')">\uD83D\uDEE1\uFE0F ' + T('nav.compliance') + '</button>' +
        '<button class="btn btn-secondary" onclick="nav(\'verification\')">\u2705 ' + T('nav.registration_checks') + '</button>' +
        '</div>' +
        '</div>';
}

function renderAdminRoleBreakdown(byRole) {
    var roles = ['ngo', 'donor', 'reviewer', 'admin'];
    var colors = { ngo: '#2d8f6f', donor: '#3b82f6', reviewer: '#f59e0b', admin: '#ef4444' };
    var labels = { ngo: 'NGO', donor: 'Donor', reviewer: 'Reviewer', admin: 'Admin' };
    var total = roles.reduce(function(acc, r) { return acc + (byRole[r] || 0); }, 0) || 1;
    return roles.map(function(r) {
        var count = byRole[r] || 0;
        var pct = Math.round((count / total) * 100);
        return '<div style="display:flex;align-items:center;gap:12px;margin:8px 0;">' +
            '<div style="width:80px;font-size:13px;font-weight:600;">' + labels[r] + '</div>' +
            '<div style="flex:1;height:22px;background:#f1f5f9;border-radius:6px;overflow:hidden;">' +
            '<div style="height:100%;width:' + pct + '%;background:' + colors[r] + ';border-radius:6px;transition:width 0.5s;"></div>' +
            '</div>' +
            '<div style="min-width:50px;font-size:13px;text-align:right;">' + count + ' (' + pct + '%)</div>' +
            '</div>';
    }).join('');
}

function renderAdminOrgBreakdown(byType) {
    var types = ['ngo', 'donor', 'ingo', 'cbo', 'network'];
    var labels = { ngo: 'NGO', donor: 'Donor', ingo: 'INGO', cbo: 'CBO', network: 'Network' };
    var colors = { ngo: '#2d8f6f', donor: '#3b82f6', ingo: '#8b5cf6', cbo: '#f59e0b', network: '#06b6d4' };
    var total = types.reduce(function(acc, t) { return acc + (byType[t] || 0); }, 0) || 1;
    return types.map(function(t) {
        var count = byType[t] || 0;
        var pct = Math.round((count / total) * 100);
        return '<div style="display:flex;align-items:center;gap:12px;margin:8px 0;">' +
            '<div style="width:80px;font-size:13px;font-weight:600;">' + labels[t] + '</div>' +
            '<div style="flex:1;height:22px;background:#f1f5f9;border-radius:6px;overflow:hidden;">' +
            '<div style="height:100%;width:' + pct + '%;background:' + colors[t] + ';border-radius:6px;transition:width 0.5s;"></div>' +
            '</div>' +
            '<div style="min-width:50px;font-size:13px;text-align:right;">' + count + ' (' + pct + '%)</div>' +
            '</div>';
    }).join('');
}

function renderAdminStatusBreakdown(byStatus) {
    var statuses = ['draft', 'submitted', 'under_review', 'scored', 'approved', 'rejected'];
    var labels = { draft: 'Draft', submitted: 'Submitted', under_review: 'Under Review',
                   scored: 'Scored', approved: 'Approved', rejected: 'Rejected' };
    var colors = { draft: '#94a3b8', submitted: '#3b82f6', under_review: '#f59e0b',
                   scored: '#8b5cf6', approved: '#2d8f6f', rejected: '#ef4444' };
    return '<div style="display:flex;gap:16px;flex-wrap:wrap;">' +
        statuses.map(function(s) {
            var count = byStatus[s] || 0;
            return '<div style="text-align:center;padding:12px 20px;background:#f8fafc;border-radius:8px;border-left:4px solid ' + colors[s] + ';">' +
                '<div style="font-size:24px;font-weight:700;color:' + colors[s] + ';">' + count + '</div>' +
                '<div style="font-size:12px;color:#64748b;margin-top:2px;">' + labels[s] + '</div>' +
                '</div>';
        }).join('') +
        '</div>';
}

function renderAlertBanner(alerts) {
    if (!alerts || !alerts.length) return '';
    return alerts.map(function(a) {
        var bgColor = a.level === 'critical' ? '#fee2e2' : '#fef3c7';
        var borderColor = a.level === 'critical' ? '#ef4444' : '#f59e0b';
        var textColor = a.level === 'critical' ? '#991b1b' : '#92400e';
        var icon = a.level === 'critical' ? '\uD83D\uDEA8' : '\u26A0\uFE0F';
        return '<div data-alert-type="' + esc(a.type) + '" data-alert-level="' + esc(a.level) + '" ' +
            'style="background:' + bgColor + ';border:1px solid ' + borderColor + ';border-left:4px solid ' + borderColor + ';' +
            'padding:12px 16px;border-radius:8px;margin-bottom:12px;display:flex;align-items:center;gap:12px;">' +
            '<span style="font-size:20px;">' + icon + '</span>' +
            '<div>' +
            '<div style="font-weight:600;font-size:14px;color:' + textColor + ';">' +
            (a.level === 'critical' ? 'CRITICAL' : 'WARNING') + ': ' + esc(a.type.replace('_', ' ').toUpperCase()) + '</div>' +
            '<div style="font-size:13px;color:' + textColor + ';">' + esc(a.message) + '</div>' +
            '</div></div>';
    }).join('');
}

function renderSecurityMetrics(sec) {
    if (!sec || (!sec.login_attempts_24h && !sec.currently_locked)) {
        return '<div style="color:#64748b;font-size:13px;padding:8px 0;">No security events recorded.</div>';
    }
    var html = '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;">' +
        '<div style="text-align:center;padding:12px 20px;background:#f8fafc;border-radius:8px;border-left:4px solid ' +
        (sec.login_attempts_1h > 20 ? '#ef4444' : '#2d8f6f') + ';">' +
        '<div style="font-size:24px;font-weight:700;color:' + (sec.login_attempts_1h > 20 ? '#ef4444' : '#2d8f6f') + ';">' + (sec.login_attempts_1h || 0) + '</div>' +
        '<div style="font-size:12px;color:#64748b;">Login Attempts (1h)</div></div>' +

        '<div style="text-align:center;padding:12px 20px;background:#f8fafc;border-radius:8px;border-left:4px solid ' +
        (sec.login_attempts_24h > 100 ? '#ef4444' : '#3b82f6') + ';">' +
        '<div style="font-size:24px;font-weight:700;color:' + (sec.login_attempts_24h > 100 ? '#ef4444' : '#3b82f6') + ';">' + (sec.login_attempts_24h || 0) + '</div>' +
        '<div style="font-size:12px;color:#64748b;">Login Attempts (24h)</div></div>' +

        '<div style="text-align:center;padding:12px 20px;background:#f8fafc;border-radius:8px;border-left:4px solid #f59e0b;">' +
        '<div style="font-size:24px;font-weight:700;color:#f59e0b;">' + (sec.unique_ips_24h || 0) + '</div>' +
        '<div style="font-size:12px;color:#64748b;">Unique IPs (24h)</div></div>' +

        '<div style="text-align:center;padding:12px 20px;background:#f8fafc;border-radius:8px;border-left:4px solid ' +
        (sec.currently_locked > 0 ? '#ef4444' : '#94a3b8') + ';">' +
        '<div style="font-size:24px;font-weight:700;color:' + (sec.currently_locked > 0 ? '#ef4444' : '#94a3b8') + ';">' + (sec.currently_locked || 0) + '</div>' +
        '<div style="font-size:12px;color:#64748b;">Locked Accounts</div></div>' +
        '</div>';

    // Top IPs table (potential brute-force indicators)
    if (sec.top_ips_24h && sec.top_ips_24h.length) {
        html += '<div style="margin-top:12px;">' +
            '<strong style="font-size:13px;color:#1e293b;">Top Login IPs (24h)</strong>' +
            '<table class="data-table" style="width:100%;margin-top:8px;font-size:13px;">' +
            '<thead><tr><th style="text-align:left;">IP Address</th><th style="text-align:right;">Attempts</th><th style="text-align:center;">Risk</th></tr></thead><tbody>';
        sec.top_ips_24h.forEach(function(row) {
            var risk = row.attempts >= 20 ? '\u26A0\uFE0F High' : row.attempts >= 10 ? '\u26A0 Medium' : '\u2705 Low';
            var riskColor = row.attempts >= 20 ? '#ef4444' : row.attempts >= 10 ? '#f59e0b' : '#2d8f6f';
            html += '<tr>' +
                '<td style="font-family:monospace;">' + esc(row.ip) + '</td>' +
                '<td style="text-align:right;font-weight:600;">' + row.attempts + '</td>' +
                '<td style="text-align:center;color:' + riskColor + ';font-weight:500;">' + risk + '</td></tr>';
        });
        html += '</tbody></table></div>';
    }

    // Locked accounts
    if (sec.locked_accounts && sec.locked_accounts.length) {
        html += '<div style="margin-top:12px;">' +
            '<strong style="font-size:13px;color:#991b1b;">\uD83D\uDD12 Currently Locked Accounts</strong>';
        sec.locked_accounts.forEach(function(a) {
            html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;">' +
                '<span class="badge badge-red">LOCKED</span>' +
                '<span>' + esc(a.email) + '</span>' +
                '<span style="color:#64748b;">until ' + (a.locked_until ? new Date(a.locked_until).toLocaleTimeString() : '--') + '</span></div>';
        });
        html += '</div>';
    }
    return html;
}

function renderDocumentMetrics(docs) {
    if (!docs || !docs.total_documents) {
        return '<div style="color:#64748b;font-size:13px;padding:8px 0;">No documents uploaded yet.</div>';
    }
    var html = '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;">' +
        '<div style="text-align:center;padding:12px 20px;background:#f8fafc;border-radius:8px;border-left:4px solid #3b82f6;">' +
        '<div style="font-size:24px;font-weight:700;color:#3b82f6;">' + (docs.total_documents || 0) + '</div>' +
        '<div style="font-size:12px;color:#64748b;">Total Documents</div></div>' +

        '<div style="text-align:center;padding:12px 20px;background:#f8fafc;border-radius:8px;border-left:4px solid #2d8f6f;">' +
        '<div style="font-size:24px;font-weight:700;color:#2d8f6f;">' + (docs.documents_7d || 0) + '</div>' +
        '<div style="font-size:12px;color:#64748b;">Uploads (7d)</div></div>' +

        '<div style="text-align:center;padding:12px 20px;background:#f8fafc;border-radius:8px;border-left:4px solid ' +
        (docs.avg_score >= 60 ? '#2d8f6f' : docs.avg_score >= 40 ? '#f59e0b' : '#ef4444') + ';">' +
        '<div style="font-size:24px;font-weight:700;color:' + (docs.avg_score >= 60 ? '#2d8f6f' : docs.avg_score >= 40 ? '#f59e0b' : '#ef4444') + ';">' + (docs.avg_score || 0) + '%</div>' +
        '<div style="font-size:12px;color:#64748b;">Avg AI Score</div></div>' +
        '</div>';

    // Low-score documents (quality concern)
    if (docs.low_score_docs && docs.low_score_docs.length) {
        html += '<div style="margin-top:12px;">' +
            '<strong style="font-size:13px;color:#b91c1c;">\u26A0\uFE0F Low Quality Documents (Score &lt; 40%)</strong>' +
            '<table class="data-table" style="width:100%;margin-top:8px;font-size:13px;">' +
            '<thead><tr><th>Filename</th><th>Type</th><th>Score</th><th>Uploaded</th></tr></thead><tbody>';
        docs.low_score_docs.forEach(function(d) {
            html += '<tr>' +
                '<td>' + esc(d.filename || '--') + '</td>' +
                '<td><span class="badge badge-gray">' + esc(d.type || 'general') + '</span></td>' +
                '<td style="color:#ef4444;font-weight:600;">' + (d.score || 0) + '%</td>' +
                '<td style="font-size:12px;color:#64748b;">' + (d.uploaded ? new Date(d.uploaded).toLocaleDateString() : '--') + '</td></tr>';
        });
        html += '</tbody></table></div>';
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
            renderStatCard('\uD83D\uDC65', 'Total Users', stats.total_users || 0, 'blue') +
            renderStatCard('\uD83C\uDFE2', 'Organizations', stats.total_organizations || 0, 'green') +
            renderStatCard('\u2705', 'Verified Orgs', stats.verified_organizations || 0, 'green') +
            renderStatCard('\uD83D\uDCB0', 'Total Grants', stats.total_grants || 0, 'amber') +
            renderStatCard('\uD83D\uDCCB', 'Applications', stats.total_applications || 0, 'blue') +
            renderStatCard('\u26A0\uFE0F', 'Flagged Checks', stats.flagged_compliance || 0, 'red');
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
        var html = '<div class="card"><table class="data-table" style="width:100%;">' +
            '<thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th></tr></thead><tbody>';
        stats.recent_users.forEach(function(u) {
            html += '<tr>' +
                '<td>' + esc(u.name) + '</td>' +
                '<td>' + esc(u.email) + '</td>' +
                '<td><span class="badge badge-' + (u.role === 'admin' ? 'red' : u.role === 'donor' ? 'blue' : u.role === 'reviewer' ? 'amber' : 'green') + '">' +
                esc(u.role.toUpperCase()) + '</span></td>' +
                '<td>' + (u.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>') + '</td>' +
                '<td style="font-size:13px;color:#64748b;">' + (u.created_at ? new Date(u.created_at).toLocaleDateString() : '--') + '</td>' +
                '</tr>';
        });
        html += '</tbody></table></div>';
        ru.innerHTML = html;
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
            sc.innerHTML = renderStatCard('\uD83D\uDCCA', 'Assessment Score', score + '%', 'green') +
                renderStatCard('\uD83D\uDCCB', 'Active Applications', stats.total_applications || 0, 'blue') +
                renderStatCard('\uD83D\uDCB0', 'Grants Available', stats.open_grants || 0, 'amber') +
                renderStatCard('\uD83D\uDCC4', 'Documents Uploaded', stats.documents || 0, 'red');
            // Update capacity badge too
            var cap = capacityLabel(score);
            var ringEl = document.querySelector('.score-ring-container');
            if (ringEl) ringEl.parentElement.parentElement.innerHTML =
                '<div class="card-body" style="display:flex;align-items:center;gap:24px;">' +
                scoreRingHTML(score, 80, '%') +
                '<div><h3 style="font-size:18px;font-weight:600;">' + T('assessment.org_capacity') + '</h3>' +
                '<p style="font-size:14px;color:#64748b;margin-top:4px;">Your current capacity level: ' +
                '<span class="badge badge-' + cap.color + '">' + esc(cap.label) + '</span></p></div>' +
                '<div style="margin-left:auto;"><button class="btn btn-secondary btn-sm" onclick="nav(\'assessment\')">' + T('assessment.view_assessment') + '</button></div></div>';
        }
    } else if (role === 'donor') {
        var dc = document.getElementById('donor-stat-cards');
        if (dc) dc.innerHTML = renderStatCard('\uD83D\uDCB0', 'Total Grants', stats.total_grants || 0, 'green') +
            renderStatCard('\uD83D\uDCCB', 'Total Applications', stats.total_applications || 0, 'blue') +
            renderStatCard('\u2B50', 'Pending Review', stats.pending_review || 0, 'amber') +
            renderStatCard('\uD83C\uDFC6', 'Total Awarded', formatCurrency(stats.total_funding_awarded || 0), 'red') +
            renderStatCard('\uD83D\uDCCA', 'Reports to Review', stats.pending_report_reviews || 0, 'blue');
    } else if (role === 'reviewer') {
        var rc = document.getElementById('reviewer-stat-cards');
        if (rc) rc.innerHTML = renderStatCard('\uD83D\uDCCB', 'Assigned Reviews', stats.assigned_reviews || 0, 'blue') +
            renderStatCard('\u23F3', 'In Progress', stats.in_progress_reviews || 0, 'amber') +
            renderStatCard('\u2705', 'Completed', stats.completed_reviews || 0, 'green') +
            renderStatCard('\uD83D\uDCC8', 'Avg Score Given', (stats.average_score_given || 0) + '%', 'amber');
    }

    if (role === 'ngo') {
        // Load recommended grants
        var gRes = await api('GET', '/api/grants?status=open');
        if (gRes && gRes.grants) {
            var html = gRes.grants.slice(0, 3).map(function(g) { return renderGrantCard(g); }).join('');
            var el = document.getElementById('recommended-grants');
            if (el) el.innerHTML = html || '<p style="color:#94a3b8;">No grants available at this time.</p>';
        }
        // Load recent applications
        var aRes = await api('GET', '/api/applications');
        if (aRes && aRes.applications) {
            S.applications = aRes.applications;
            var el2 = document.getElementById('recent-applications');
            if (el2) el2.innerHTML = renderApplicationsTable(aRes.applications.slice(0, 5));
        }
        // Load upcoming reports
        loadUpcomingReports();
    } else if (role === 'donor') {
        // Load donor grants
        var gRes2 = await api('GET', '/api/grants');
        if (gRes2 && gRes2.grants) {
            S.grants = gRes2.grants;
            var activeGrants = gRes2.grants.filter(function(g) { return g.status !== 'closed'; });
            var el3 = document.getElementById('active-grants');
            if (el3) el3.innerHTML = activeGrants.slice(0, 6).map(function(g) { return renderDonorGrantCard(g); }).join('') ||
                '<p style="color:#94a3b8;">No active grants.</p>';
        }
        // Load recent applications
        var aRes2 = await api('GET', '/api/applications');
        if (aRes2 && aRes2.applications) {
            S.applications = aRes2.applications;
            var el4 = document.getElementById('donor-recent-apps');
            if (el4) el4.innerHTML = renderDonorApplicationsTable(aRes2.applications.slice(0, 5));
        }
    } else if (role === 'reviewer') {
        // Load reviewer assignments
        var rRes = await api('GET', '/api/reviews');
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

function renderStatCard(icon, label, value, color) {
    return '<div class="card"><div class="stat-card">' +
        '<div class="stat-icon ' + (color || 'green') + '">' + icon + '</div>' +
        '<div>' +
        '<div class="stat-value">' + esc(String(value)) + '</div>' +
        '<div class="stat-label">' + esc(label) + '</div>' +
        '</div>' +
        '</div></div>';
}

function renderLoadingCards(count) {
    var html = '';
    for (var i = 0; i < count; i++) {
        html += '<div class="card" aria-busy="true"><div class="card-body" style="text-align:center;padding:40px;">' +
            '<div class="spinner" style="width:24px;height:24px;border:3px solid #e2e8f0;border-top-color:#2d8f6f;border-radius:50%;animation:spin 0.6s linear infinite;margin:0 auto;" aria-hidden="true"></div>' +
            '<p style="margin-top:12px;color:#94a3b8;font-size:13px;">' + T('common.loading') + '</p>' +
            '</div></div>';
    }
    return html;
}

function renderLoadingTable() {
    return '<div class="card" aria-busy="true"><div class="card-body" style="text-align:center;padding:40px;">' +
        '<div class="spinner" style="width:24px;height:24px;border:3px solid #e2e8f0;border-top-color:#2d8f6f;border-radius:50%;animation:spin 0.6s linear infinite;margin:0 auto;" aria-hidden="true"></div>' +
        '<p style="margin-top:12px;color:#94a3b8;font-size:13px;">Loading data...</p>' +
        '</div></div>';
}

// =============================================================================
// 16. Grant Card Components
// =============================================================================

function renderGrantCard(g) {
    var deadline = timeUntil(g.deadline);
    var deadlineClass = deadline === 'Expired' ? 'color:#ef4444;' : '';
    var sectors = (g.sectors || []).map(function(s) {
        return '<span class="badge badge-outline badge-green" style="font-size:11px;">' + sectorIcon(s) + ' ' + esc(s) + '</span>';
    }).join(' ');

    return '<div class="card grant-card" style="cursor:pointer;" onclick="viewGrant(' + g.id + ')">' +
        '<div class="card-body">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;">' +
        '<h3 style="font-size:16px;font-weight:600;flex:1;">' + esc(g.title) + '</h3>' +
        (g.match_score ? '<span class="badge badge-green" style="margin-left:8px;">' + g.match_score + '% Match</span>' : '') +
        '</div>' +
        '<p style="font-size:13px;color:#64748b;margin-top:4px;">' + esc(g.donor_name || g.organization_name || '') + '</p>' +
        '<div class="grant-amount" style="margin-top:12px;">' + formatCurrency(g.total_funding, g.currency) + '</div>' +
        '<div class="grant-meta">' +
        '<span>\uD83D\uDCC5 <span style="' + deadlineClass + '">' + esc(deadline) + '</span></span>' +
        '<span>\uD83C\uDF10 ' + esc((g.countries || []).join(', ') || 'Global') + '</span>' +
        '</div>' +
        '<div class="sector-tags">' + sectors + '</div>' +
        '</div>' +
        '<div class="card-footer">' +
        statusBadge(g.status || 'open') +
        '<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();' +
        (deadline === 'Expired' ? 'showToast(\'Deadline has passed\',\'warning\')' : 'safeStartApply(' + g.id + ')') +
        '">' + (deadline === 'Expired' ? T('grant.deadline_passed') : T('grant.apply_now')) + '</button>' +
        '</div>' +
        '</div>';
}

function renderDonorGrantCard(g) {
    return '<div class="card" style="cursor:pointer;" onclick="viewGrant(' + g.id + ')">' +
        '<div class="card-body">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;">' +
        '<h3 style="font-size:16px;font-weight:600;flex:1;">' + esc(g.title) + '</h3>' +
        statusBadge(g.status || 'draft') +
        '</div>' +
        '<div style="margin-top:8px;font-size:18px;font-weight:700;color:#2d8f6f;">' +
        formatCurrency(g.total_funding, g.currency) + '</div>' +
        '<div class="grant-meta">' +
        '<span>\uD83D\uDCC5 ' + esc(timeUntil(g.deadline)) + '</span>' +
        '<span>\uD83D\uDCCB ' + (g.application_count || 0) + ' applications</span>' +
        '</div>' +
        '</div>' +
        '</div>';
}

// =============================================================================
// 17. Table Components
// =============================================================================

function renderApplicationsTable(apps) {
    if (!apps || !apps.length) {
        return '<div class="card"><div class="card-body" style="text-align:center;padding:32px;color:#94a3b8;">' +
            '<p>\uD83D\uDCCB ' + T('application.no_applications') + '</p>' +
            '<button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="nav(\'grants\')">' + T('dashboard.action.browse_grants') + '</button>' +
            '</div></div>';
    }
    return '<div class="table-wrapper"><table class="table table-hover">' +
        '<thead><tr>' +
        '<th>' + T('application.grant') + '</th><th>' + T('application.donor') + '</th><th>' + T('application.tab.status') + '</th><th>' + T('application.ai_score') + '</th><th>' + T('application.submitted_at') + '</th><th></th>' +
        '</tr></thead><tbody>' +
        apps.map(function(a) {
            return '<tr style="cursor:pointer;" onclick="viewApplication(' + a.id + ')">' +
                '<td style="font-weight:500;">' + esc(a.grant_title || a.grant_name || 'Grant #' + a.grant_id) + '</td>' +
                '<td>' + esc(a.donor_name || '') + '</td>' +
                '<td>' + statusBadge(a.status) + '</td>' +
                '<td>' + (a.ai_score != null ? '<span style="font-weight:600;color:' +
                (a.ai_score >= 70 ? '#10b981' : a.ai_score >= 50 ? '#f59e0b' : '#ef4444') + ';">' + a.ai_score + '%</span>' : '-') + '</td>' +
                '<td>' + formatDate(a.submitted_at || a.created_at) + '</td>' +
                '<td><button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();viewApplication(' + a.id + ')">View</button></td>' +
                '</tr>';
        }).join('') +
        '</tbody></table></div>';
}

function renderDonorApplicationsTable(apps) {
    if (!apps || !apps.length) {
        return '<div class="card"><div class="card-body" style="text-align:center;padding:32px;color:#94a3b8;">' +
            '<p>No applications received yet.</p></div></div>';
    }
    return '<div class="table-wrapper"><table class="table table-hover">' +
        '<thead><tr><th>' + T('ranking.applicant') + '</th><th>' + T('report.grant') + '</th><th>' + T('application.tab.status') + '</th><th>' + T('application.ai_score') + '</th><th>' + T('application.submitted') + '</th><th></th></tr></thead><tbody>' +
        apps.map(function(a) {
            return '<tr style="cursor:pointer;" onclick="viewApplication(' + a.id + ')">' +
                '<td style="font-weight:500;">' + esc(a.org_name || a.applicant_name || '') + '</td>' +
                '<td>' + esc(a.grant_title || '') + '</td>' +
                '<td>' + statusBadge(a.status) + '</td>' +
                '<td>' + (a.ai_score != null ? a.ai_score + '%' : '-') + '</td>' +
                '<td>' + formatDate(a.submitted_at || a.created_at) + '</td>' +
                '<td><button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();viewApplication(' + a.id + ')">View</button></td>' +
                '</tr>';
        }).join('') +
        '</tbody></table></div>';
}

function renderReviewsTable(reviews) {
    if (!reviews || !reviews.length) {
        return '<div class="card"><div class="card-body" style="text-align:center;padding:32px;color:#94a3b8;">' +
            '<p>No assignments pending.</p></div></div>';
    }
    return '<div class="table-wrapper"><table class="table table-hover">' +
        '<thead><tr><th>' + T('nav.all_applications') + '</th><th>' + T('report.grant') + '</th><th>' + T('application.tab.status') + '</th><th>' + T('common.due_date') + '</th><th></th></tr></thead><tbody>' +
        reviews.map(function(r) {
            return '<tr style="cursor:pointer;" onclick="openReview(' + r.id + ')">' +
                '<td style="font-weight:500;">' + esc(r.org_name || r.application_name || 'Application #' + r.application_id) + '</td>' +
                '<td>' + esc(r.grant_title || '') + '</td>' +
                '<td>' + statusBadge(r.status) + '</td>' +
                '<td>' + formatDate(r.due_date) + '</td>' +
                '<td><button class="btn btn-sm btn-primary" onclick="event.stopPropagation();openReview(' + r.id + ')">Review</button></td>' +
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

    return '<div class="page-header">' +
        '<h1>\uD83D\uDCB0 ' + T('grant.browse_title') + '</h1>' +
        '<p>Find grants that match your organization\'s mission and capabilities.</p>' +
        '</div>' +

        // Filter bar
        '<div class="card" style="margin-bottom:24px;">' +
        '<div class="card-body" style="display:flex;gap:12px;flex-wrap:wrap;align-items:end;">' +
        '<div class="form-group" style="margin:0;flex:1;min-width:200px;">' +
        '<label class="form-label">\uD83D\uDD0D ' + T('common.search') + '</label>' +
        '<input type="text" class="form-control" placeholder="' + T('grant.search_placeholder') + '" value="' + esc(S.grantFilters.search) + '" oninput="S.grantFilters.search=this.value;renderGrantsList();">' +
        '</div>' +
        '<div class="form-group" style="margin:0;min-width:150px;">' +
        '<label class="form-label">' + T('grant.detail.sectors') + '</label>' +
        '<select class="form-control" onchange="S.grantFilters.sector=this.value;renderGrantsList();">' +
        '<option value="">' + T('grant.filter_sector') + '</option>' +
        sectors.map(function(s) { return '<option value="' + s.toLowerCase() + '"' + (S.grantFilters.sector === s.toLowerCase() ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select>' +
        '</div>' +
        '<div class="form-group" style="margin:0;min-width:150px;">' +
        '<label class="form-label">' + T('grant.detail.countries') + '</label>' +
        '<select class="form-control" onchange="S.grantFilters.country=this.value;renderGrantsList();">' +
        '<option value="">' + T('grant.filter_country') + '</option>' +
        countries.map(function(c) { return '<option value="' + c + '"' + (S.grantFilters.country === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
        '</select>' +
        '</div>' +
        '</div>' +
        '</div>' +

        '<div id="grants-list" class="content-grid">' +
        (filtered.length ? filtered.map(function(g) { return renderGrantCard(g); }).join('') :
            '<div style="grid-column:1/-1;text-align:center;padding:48px;color:#94a3b8;">' +
            '<p style="font-size:48px;margin-bottom:12px;">\uD83D\uDD0D</p>' +
            '<p>' + T('grant.no_grants') + '</p></div>') +
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
        '<div style="grid-column:1/-1;text-align:center;padding:48px;color:#94a3b8;">' +
        '<p style="font-size:48px;margin-bottom:12px;">\uD83D\uDD0D</p>' +
        '<p>' + T('grant.no_grants') + '</p></div>';
}

async function loadGrants() {
    if (S._grantsLoading) return;
    S._grantsLoading = true;
    var params = [];
    if (S.grantFilters.status) params.push('status=' + S.grantFilters.status);
    if (S.grantFilters.sector) params.push('sector=' + S.grantFilters.sector);
    if (S.grantFilters.country) params.push('country=' + S.grantFilters.country);
    var url = '/api/grants' + (params.length ? '?' + params.join('&') : '');
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
    return '<div class="page-header">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div><h1>\uD83D\uDCB0 ' + T('grant.my_grants') + '</h1></div>' +
        '<button class="btn btn-primary" onclick="nav(\'creategrant\')">\u2795 ' + T('dashboard.action.create_grant') + '</button>' +
        '</div>' +
        '</div>' +
        '<div id="my-grants-list" class="content-grid">' + renderLoadingCards(3) + '</div>';
}

async function loadMyGrants(retryCount) {
    retryCount = retryCount || 0;
    var res = await api('GET', '/api/grants');
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
            '<div style="grid-column:1/-1;text-align:center;padding:48px;color:#94a3b8;">' +
            '<p>No grants created yet.</p>' +
            '<button class="btn btn-primary" style="margin-top:12px;" onclick="nav(\'creategrant\')">' + T('grant.create_first') + '</button></div>';
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

    return '<button class="btn btn-secondary btn-sm" onclick="nav(\'grants\')" style="margin-bottom:16px;">\u2190 ' + T('common.back') + '</button>' +

        '<div class="card" style="margin-bottom:24px;">' +
        '<div class="card-body">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:16px;">' +
        '<div style="flex:1;">' +
        '<h1 style="font-size:24px;font-weight:700;">' + esc(g.title) + '</h1>' +
        '<p style="color:#64748b;margin-top:4px;">' + esc(g.donor_name || g.organization_name || '') + '</p>' +
        '</div>' +
        '<div style="text-align:right;">' +
        '<div style="font-size:28px;font-weight:700;color:#2d8f6f;">' + formatCurrency(g.total_funding, g.currency) + '</div>' +
        '<div style="margin-top:4px;">' + statusBadge(g.status) + '</div>' +
        '</div>' +
        '</div>' +
        '<div style="display:flex;gap:16px;margin-top:16px;font-size:14px;color:#64748b;">' +
        '<span>\uD83D\uDCC5 ' + T('grant.deadline') + ': ' + formatDate(g.deadline) + ' (' + timeUntil(g.deadline) + ')</span>' +
        '<span>\uD83C\uDF10 ' + esc((g.countries || []).join(', ') || 'Global') + '</span>' +
        '</div>' +
        '</div>' +
        '</div>' +

        // Tabs
        '<div style="display:flex;gap:4px;margin-bottom:24px;border-bottom:2px solid #e2e8f0;padding-bottom:0;">' +
        tabs.map(function(t) {
            var active = tab === t.key;
            return '<button class="btn btn-sm" style="border:none;border-bottom:2px solid ' +
                (active ? '#2d8f6f' : 'transparent') + ';border-radius:0;color:' +
                (active ? '#2d8f6f' : '#64748b') + ';font-weight:' +
                (active ? '600' : '400') + ';padding:8px 16px;margin-bottom:-2px;" ' +
                'onclick="S.grantDetailTab=\'' + t.key + '\';render();">' + esc(t.label) + '</button>';
        }).join('') +
        '</div>' +

        tabContent +

        // Action buttons
        '<div style="margin-top:24px;display:flex;gap:12px;">' +
        (role === 'ngo' && g.status !== 'closed' && timeUntil(g.deadline) !== 'Expired' ?
            '<button class="btn btn-primary btn-lg" onclick="safeStartApply(' + g.id + ')">' + T('grant.apply_now') + '</button>' : '') +
        (role === 'donor' ? '<button class="btn btn-primary" onclick="editGrant(' + g.id + ')">' + T('common.edit') + '</button>' : '') +
        '</div>';
}

function renderGrantOverview(g) {
    var sectors = (g.sectors || []).map(function(s) {
        return '<span class="badge badge-outline badge-green">' + sectorIcon(s) + ' ' + esc(s) + '</span>';
    }).join(' ');
    return '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:12px;">' + T('grant.detail.description') + '</h3>' +
        '<p style="color:#475569;line-height:1.7;white-space:pre-wrap;">' + esc(g.description || T('common.no_data')) + '</p>' +
        (sectors ? '<div style="margin-top:16px;"><strong>' + T('grant.detail.sectors') + ':</strong> ' + sectors + '</div>' : '') +
        '<div style="margin-top:12px;"><strong>' + T('grant.detail.countries') + ':</strong> ' + esc((g.countries || []).join(', ') || 'Global') + '</div>' +
        '</div></div>';
}

function renderGrantEligibility(g) {
    var reqs = g.eligibility || [];
    if (!reqs.length) return '<div class="card"><div class="card-body"><p style="color:#94a3b8;">No eligibility requirements specified.</p></div></div>';
    return '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">' + T('grant.detail.eligibility') + '</h3>' +
        reqs.map(function(req) {
            var passed = req.met || req.passed;
            var icon = passed ? '\u2705' : (passed === false ? '\u274C' : '\u2B1C');
            return '<div style="display:flex;align-items:start;gap:12px;padding:12px;border-bottom:1px solid #f1f5f9;">' +
                '<span style="font-size:18px;">' + icon + '</span>' +
                '<div style="flex:1;">' +
                '<div style="font-weight:500;">' + esc(req.category || req.name || req.label || 'Requirement') + '</div>' +
                '<div style="font-size:13px;color:#64748b;margin-top:2px;">' + esc(req.description || req.details || '') + '</div>' +
                (req.required ? '<span class="badge badge-red" style="margin-top:4px;">' + T('grant.create.required') + '</span>' : '') +
                '</div>' +
                '</div>';
        }).join('') +
        '</div></div>';
}

function renderGrantCriteria(g) {
    var criteria = g.criteria || [];
    if (!criteria.length) return '<div class="card"><div class="card-body"><p style="color:#94a3b8;">No scoring criteria defined.</p></div></div>';
    return '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">' + T('grant.detail.evaluation_criteria') + '</h3>' +
        criteria.map(function(c, i) {
            return '<div style="padding:16px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<h4 style="font-weight:600;">' + (i + 1) + '. ' + esc(c.label || c.name) + '</h4>' +
                '<span class="badge badge-blue">' + T('grant.create.weight') + ': ' + (c.weight || 0) + '%</span>' +
                '</div>' +
                '<p style="color:#64748b;font-size:13px;margin-top:8px;">' + esc(c.description || '') + '</p>' +
                (c.instructions ? '<div style="background:#eff6ff;padding:12px;border-radius:6px;margin-top:8px;font-size:13px;">' +
                    '<strong style="color:#1e40af;">Instructions:</strong> ' + esc(c.instructions) + '</div>' : '') +
                (c.example ? '<details style="margin-top:8px;"><summary style="cursor:pointer;font-size:13px;color:#2d8f6f;font-weight:500;">' + T('grant.create.view_example_response') + '</summary>' +
                    '<div style="background:#f8fafc;padding:12px;border-radius:6px;margin-top:8px;font-size:13px;color:#475569;">' +
                    esc(c.example) + '</div></details>' : '') +
                (c.max_words ? '<div style="font-size:12px;color:#94a3b8;margin-top:8px;">Maximum ' + c.max_words + ' words</div>' : '') +
                '</div>';
        }).join('') +
        '</div></div>';
}

function renderGrantDocuments(g) {
    var docs = g.doc_requirements || [];
    if (!docs.length) return '<div class="card"><div class="card-body"><p style="color:#94a3b8;">No document requirements specified.</p></div></div>';
    var docIcons = { financial_report: '\uD83D\uDCCA', registration: '\uD83D\uDCDC', audit: '\uD83D\uDD0D', psea: '\uD83D\uDEE1\uFE0F', project_report: '\uD83D\uDCC4', budget: '\uD83D\uDCB5', cv: '\uD83D\uDC64', strategic_plan: '\uD83D\uDCCB' };
    return '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">' + T('grant.detail.doc_requirements') + '</h3>' +
        docs.map(function(d) {
            var icon = docIcons[d.type] || '\uD83D\uDCC4';
            return '<div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid #f1f5f9;">' +
                '<span style="font-size:24px;">' + icon + '</span>' +
                '<div style="flex:1;">' +
                '<div style="font-weight:500;">' + esc(d.name || d.type || 'Document') + '</div>' +
                '<div style="font-size:13px;color:#64748b;">' + esc(d.description || d.requirements || '') + '</div>' +
                '</div>' +
                (d.required !== false ? '<span class="badge badge-red">' + T('grant.create.required') + '</span>' : '<span class="badge badge-gray">' + T('grant.create.optional') + '</span>') +
                '</div>';
        }).join('') +
        '</div></div>';
}

function renderGrantApplicants(g) {
    return '<div id="grant-applicants">' + renderLoadingTable() + '</div>' +
        '<script>loadGrantApplicants(' + g.id + ')<\/script>';
}

async function loadGrantApplicants(grantId) {
    var res = await api('GET', '/api/applications?grant_id=' + grantId);
    var el = document.getElementById('grant-applicants');
    if (!el) return;
    if (res && res.applications && res.applications.length) {
        el.innerHTML = renderDonorApplicationsTable(res.applications);
    } else {
        el.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:32px;color:#94a3b8;">' +
            '<p>No applications received yet.</p></div></div>';
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

    return '<button class="btn btn-secondary btn-sm" onclick="nav(\'grantdetail\')" style="margin-bottom:16px;">\u2190 ' + T('common.back') + '</button>' +
        '<div class="page-header"><h1>' + T('apply.title') + ': ' + esc(g.title) + '</h1></div>' +

        renderWizardSteps(steps, step) +

        '<div class="wizard-content">' + stepContent + '</div>' +

        '<div class="wizard-actions">' +
        (step > 1 ? '<button class="btn btn-secondary" onclick="S.applyStep--;render();">\u2190 ' + T('common.previous') + '</button>' : '<div></div>') +
        '<div style="display:flex;gap:8px;">' +
        '<button class="btn btn-secondary" onclick="saveDraft()">' + T('apply.save_draft') + '</button>' +
        (step < 4 ? '<button class="btn btn-primary" onclick="S.applyStep++;render();">' + T('common.next') + ' \u2192</button>' :
            '<button class="btn btn-primary btn-lg" onclick="submitApplication()">' + T('apply.submit_application') + '</button>') +
        '</div>' +
        '</div>';
}

function renderWizardSteps(steps, current) {
    return '<div class="wizard-steps">' +
        steps.map(function(s, i) {
            var cls = s.num === current ? 'active' : (s.num < current ? 'completed' : '');
            var connector = i < steps.length - 1 ?
                '<div class="wizard-connector' + (s.num < current ? ' completed' : '') + '"></div>' : '';
            return '<div class="wizard-step ' + cls + '">' +
                '<span class="step-number">' + (s.num < current ? '\u2713' : s.num) + '</span>' +
                '<span class="step-label">' + esc(s.label) + '</span>' +
                '</div>' + connector;
        }).join('') +
        '</div>';
}

function renderApplyEligibility(g) {
    var reqs = g.eligibility || [];
    if (!reqs.length) {
        return '<div class="card"><div class="card-body">' +
            '<h3 style="font-weight:600;margin-bottom:12px;">' + T('apply.eligibility_check') + '</h3>' +
            '<p style="color:#64748b;">This grant has no specific eligibility requirements. You may proceed to the next step.</p>' +
            '</div></div>';
    }
    return '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:4px;">' + T('apply.eligibility_check') + '</h3>' +
        '<p style="color:#64748b;font-size:13px;margin-bottom:16px;">Confirm that your organization meets each requirement below.</p>' +
        reqs.map(function(req, i) {
            var key = 'elig_' + i;
            var checked = S.applyEligibility[key];
            return '<div style="padding:16px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px;">' +
                '<div style="display:flex;align-items:center;gap:12px;">' +
                '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">' +
                '<input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="S.applyEligibility[\'' + key + '\']=this.checked;">' +
                '<span style="font-weight:500;">' + esc(req.category || req.name || req.label || 'Requirement ' + (i + 1)) + '</span>' +
                '</label>' +
                (req.required ? '<span class="badge badge-red">Required</span>' : '') +
                '</div>' +
                '<p style="color:#64748b;font-size:13px;margin-top:4px;margin-left:28px;">' + esc(req.description || '') + '</p>' +
                '<div style="margin-top:8px;margin-left:28px;">' +
                '<input type="text" class="form-control" placeholder="Provide evidence or explanation..." ' +
                'value="' + esc(S.applyEligibility[key + '_evidence'] || '') + '" ' +
                'oninput="S.applyEligibility[\'' + key + '_evidence\']=this.value;">' +
                '</div>' +
                '</div>';
        }).join('') +
        '</div></div>';
}

function renderApplyProposal(g) {
    var criteria = g.criteria || [];
    if (!criteria.length) {
        return '<div class="card"><div class="card-body">' +
            '<h3 style="font-weight:600;margin-bottom:12px;">' + T('application.proposal_responses') + '</h3>' +
            '<p style="color:#64748b;">No specific criteria to respond to. Please describe your proposal below.</p>' +
            '<div class="form-group">' +
            '<textarea class="form-control" rows="8" placeholder="Describe your project proposal..." ' +
            'data-bind="applyResponses.general" oninput="S.applyResponses.general=this.value;">' +
            esc(S.applyResponses.general || '') + '</textarea>' +
            '</div></div></div>';
    }

    return criteria.map(function(c, i) {
        var key = c.id || ('criterion_' + i);
        var text = S.applyResponses[key] || '';
        var wc = wordCount(text);
        var maxW = c.max_words || 500;
        var qi = qualityIndicator(wc, maxW);

        return '<div class="card" style="margin-bottom:16px;"><div class="card-body">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<h3 style="font-weight:600;">' + (i + 1) + '. ' + esc(c.label || c.name) + '</h3>' +
            '<span class="badge badge-blue">' + T('grant.create.weight') + ': ' + (c.weight || 0) + '%</span>' +
            '</div>' +
            '<p style="color:#64748b;font-size:13px;margin-top:4px;">' + esc(c.description || '') + '</p>' +

            (c.instructions ? '<div style="background:#eff6ff;padding:12px;border-radius:6px;margin-top:12px;font-size:13px;border-left:3px solid #3b82f6;">' +
                '<strong style="color:#1e40af;">\uD83D\uDCA1 Instructions:</strong> ' + esc(c.instructions) + '</div>' : '') +

            (c.example ? '<details style="margin-top:8px;"><summary style="cursor:pointer;font-size:13px;color:#2d8f6f;font-weight:500;">\uD83D\uDC41\uFE0F View Example Response</summary>' +
                '<div style="background:#f8fafc;padding:12px;border-radius:6px;margin-top:8px;font-size:13px;color:#475569;">' +
                esc(c.example) + '</div></details>' : '') +

            '<div style="margin-top:12px;">' +
            '<textarea class="form-control" rows="6" placeholder="Write your response here..." ' +
            'id="apply-textarea-' + i + '" ' +
            'oninput="S.applyResponses[\'' + key + '\']=this.value;updateWordCount(' + i + ',' + maxW + ');">' +
            esc(text) + '</textarea>' +
            '<div id="wc-' + i + '" style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:12px;">' +
            '<span style="color:' + qi.color + ';">' + wc + ' / ' + maxW + ' words - ' + qi.label + '</span>' +
            '<button class="btn btn-sm" style="background:#eff6ff;color:#3b82f6;border:1px solid #bfdbfe;" ' +
            'onclick="getAIGuidance(' + i + ',\'' + esc(c.label || '') + '\')">\u2728 AI Help</button>' +
            '</div>' +
            '<div id="ai-guidance-' + i + '" style="display:none;"></div>' +
            '</div>' +
            '</div></div>';
    }).join('');
}

function updateWordCount(idx, maxWords) {
    var el = document.getElementById('wc-' + idx);
    var textarea = document.getElementById('apply-textarea-' + idx);
    if (!el || !textarea) return;
    var text = textarea.value;
    var wc = wordCount(text);
    var qi = qualityIndicator(wc, maxWords);
    el.querySelector('span').innerHTML = wc + ' / ' + maxWords + ' words - ' + qi.label;
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
    el.style.display = 'block';
    el.innerHTML = '<div style="background:#eff6ff;padding:12px;border-radius:6px;margin-top:8px;font-size:13px;">' +
        '<div style="display:flex;align-items:center;gap:8px;color:#3b82f6;">' +
        '<span class="spinner" style="width:14px;height:14px;border:2px solid #bfdbfe;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.6s linear infinite;display:inline-block;"></span>' +
        'Getting AI guidance...</div></div>';

    var res = await api('POST', '/api/ai/guidance', {
        field_name: fieldName,
        grant_criteria: (g.criteria || [])[idx] || {},
        current_text: text
    });
    if (res) {
        el.innerHTML = '<div style="background:#eff6ff;padding:12px;border-radius:6px;margin-top:8px;font-size:13px;border-left:3px solid #3b82f6;">' +
            '<strong style="color:#1e40af;">\u2728 AI Guidance</strong>' +
            (res.quality_score != null ? ' <span class="badge badge-blue">Quality: ' + res.quality_score + '%</span>' : '') +
            '<div style="margin-top:8px;color:#475569;">' + renderMarkdown(res.guidance || res.response || 'No guidance available.') + '</div>' +
            '</div>';
    } else {
        el.innerHTML = '<div style="background:#fef2f2;padding:12px;border-radius:6px;margin-top:8px;font-size:13px;color:#991b1b;">' +
            'Unable to get AI guidance. Please try again.</div>';
    }
}

function renderApplyDocuments(g) {
    var docs = g.doc_requirements || [];
    if (!docs.length) {
        return '<div class="card"><div class="card-body">' +
            '<h3 style="font-weight:600;margin-bottom:12px;">' + T('apply.upload_documents') + '</h3>' +
            '<p style="color:#64748b;">No documents required for this application.</p>' +
            '</div></div>';
    }
    var docIcons = { financial_report: '\uD83D\uDCCA', registration: '\uD83D\uDCDC', audit: '\uD83D\uDD0D', psea: '\uD83D\uDEE1\uFE0F', project_report: '\uD83D\uDCC4', budget: '\uD83D\uDCB5', cv: '\uD83D\uDC64', strategic_plan: '\uD83D\uDCCB' };
    return '<h3 style="font-weight:600;margin-bottom:16px;">' + T('apply.upload_documents') + '</h3>' +
        docs.map(function(d, i) {
            var key = d.type || ('doc_' + i);
            var uploaded = S.uploadedDocs[key];
            var icon = docIcons[d.type] || '\uD83D\uDCC4';
            return '<div class="card" style="margin-bottom:16px;"><div class="card-body">' +
                '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">' +
                '<span style="font-size:24px;">' + icon + '</span>' +
                '<div>' +
                '<h4 style="font-weight:600;">' + esc(d.name || d.type || 'Document') + '</h4>' +
                '<p style="font-size:13px;color:#64748b;">' + esc(d.description || d.requirements || '') + '</p>' +
                '</div>' +
                (d.required !== false ? '<span class="badge badge-red">' + T('grant.create.required') + '</span>' : '<span class="badge badge-gray">' + T('grant.create.optional') + '</span>') +
                '</div>' +
                (uploaded ?
                    '<div class="upload-file-item">' +
                    '<span class="file-icon">\uD83D\uDCC4</span>' +
                    '<div class="file-info">' +
                    '<div class="file-name">' + esc(uploaded.filename || uploaded.name) + '</div>' +
                    '<div class="file-size">' + esc(uploaded.size || '') + '</div>' +
                    '</div>' +
                    '<span class="badge badge-green">\u2713 Uploaded</span>' +
                    '</div>' +
                    (uploaded.ai_analysis ? renderAIAnalysis(uploaded.ai_analysis) : '') :
                    '<div class="upload-zone" id="upload-zone-' + key + '" ' +
                    'onclick="triggerUpload(\'' + key + '\')" ' +
                    'ondragover="event.preventDefault();this.classList.add(\'dragover\');" ' +
                    'ondragleave="this.classList.remove(\'dragover\');" ' +
                    'ondrop="event.preventDefault();this.classList.remove(\'dragover\');handleDrop(event,\'' + key + '\');">' +
                    '<div class="upload-icon">\uD83D\uDCCE</div>' +
                    '<div class="upload-text">Drag & drop your file here or <strong>click to browse</strong></div>' +
                    '<div style="font-size:12px;color:#94a3b8;margin-top:4px;">PDF, DOC, DOCX, XLS, XLSX (Max 10MB)</div>' +
                    '</div>' +
                    '<input type="file" id="file-input-' + key + '" style="display:none;" ' +
                    'accept=".pdf,.doc,.docx,.xls,.xlsx" onchange="handleFileSelect(event,\'' + key + '\')">'
                ) +
                '</div></div>';
        }).join('');
}

function renderAIAnalysis(analysis) {
    if (!analysis) return '';
    var score = analysis.score || analysis.quality_score || 0;
    var cls = score >= 70 ? 'pass' : score >= 40 ? 'warning' : 'fail';

    // Per-requirement scores if available
    var reqScoresHTML = '';
    if (analysis.requirement_scores && analysis.requirement_scores.length > 0) {
        reqScoresHTML = '<div style="margin-top:10px;border-top:1px solid rgba(0,0,0,0.1);padding-top:10px;">' +
            '<strong style="font-size:13px;">Donor Requirement Compliance:</strong>' +
            analysis.requirement_scores.map(function(rs) {
                var rScore = rs.score || 0;
                var rCls = rScore >= 70 ? '#2d8f6f' : rScore >= 40 ? '#f59e0b' : '#ef4444';
                var icon = rs.addressed ? '\u2705' : '\u274C';
                return '<div style="display:flex;align-items:center;gap:8px;margin:6px 0;padding:6px 8px;background:rgba(0,0,0,0.03);border-radius:6px;">' +
                    '<span>' + icon + '</span>' +
                    '<div style="flex:1;font-size:13px;">' + esc(rs.requirement || 'Requirement') + '</div>' +
                    '<div style="min-width:48px;text-align:center;font-weight:600;color:' + rCls + ';font-size:13px;">' + rScore + '%</div>' +
                    '</div>';
            }).join('') +
            '</div>';
    }

    var findingsHTML = '';
    if (analysis.findings) {
        if (Array.isArray(analysis.findings)) {
            findingsHTML = '<div style="margin-top:4px;"><strong>Findings:</strong>' +
                analysis.findings.map(function(f) { return '<div style="font-size:13px;color:#475569;margin:2px 0;">\u2022 ' + esc(f) + '</div>'; }).join('') + '</div>';
        } else {
            findingsHTML = '<div style="margin-top:4px;"><strong>Findings:</strong> ' + esc(analysis.findings) + '</div>';
        }
    }

    var recsHTML = '';
    if (analysis.recommendations) {
        if (Array.isArray(analysis.recommendations)) {
            recsHTML = '<div style="margin-top:4px;"><strong>Recommendations:</strong>' +
                analysis.recommendations.map(function(r) { return '<div style="font-size:13px;color:#475569;margin:2px 0;">\u2022 ' + esc(r) + '</div>'; }).join('') + '</div>';
        } else {
            recsHTML = '<div style="margin-top:4px;"><strong>Recommendations:</strong> ' + esc(analysis.recommendations) + '</div>';
        }
    }

    var aiSource = analysis.source || 'ai';
    var transparencyBadge = aiSource === 'claude'
        ? '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#7c3aed;background:#f5f3ff;padding:2px 8px;border-radius:10px;margin-left:8px;">\uD83E\uDD16 Claude AI</span>'
        : '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#0369a1;background:#f0f9ff;padding:2px 8px;border-radius:10px;margin-left:8px;">\u2699\uFE0F Rule-based</span>';

    return '<div class="analysis-result ' + cls + '" style="margin-top:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
        '<div><strong>\u2728 AI Document Analysis</strong>' + transparencyBadge + '</div>' +
        '<span class="badge badge-' + (cls === 'pass' ? 'green' : cls === 'warning' ? 'amber' : 'red') + '">' +
        'Score: ' + score + '%</span>' +
        '</div>' +
        (analysis.summary ? '<div style="margin-top:4px;font-size:13px;color:#334155;">' + esc(analysis.summary) + '</div>' : '') +
        findingsHTML + recsHTML + reqScoresHTML +
        '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,0,0,0.06);font-size:11px;color:#94a3b8;font-style:italic;">AI-generated analysis \u2014 verify important details against original documents.</div>' +
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
                    '<button class="btn btn-sm" style="margin-top:8px;background:#fee2e2;border:1px solid #ef4444;color:#991b1b;" ' +
                    'onclick="triggerUpload(\'' + key + '\')">\uD83D\uDD04 ' + (T('common.click_to_retry') || 'Retry upload') + '</button></div>';
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

    var missingItems = [];
    eligReqs.forEach(function(r, i) {
        if (r.required && !S.applyEligibility['elig_' + i]) {
            missingItems.push('Eligibility: ' + (r.category || r.name || 'Requirement ' + (i + 1)));
        }
    });
    criteria.forEach(function(c, i) {
        if (!S.applyResponses['criterion_' + i]) {
            missingItems.push('Response: ' + (c.label || c.name || 'Criterion ' + (i + 1)));
        }
    });
    docs.forEach(function(d, i) {
        var key = d.type || ('doc_' + i);
        if (d.required !== false && !S.uploadedDocs[key]) {
            missingItems.push('Document: ' + (d.name || d.type || 'Required Document'));
        }
    });

    return '<div class="card" style="margin-bottom:16px;"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">' + T('apply.review_submit') + '</h3>' +

        (missingItems.length ? '<div style="background:#fef3c7;padding:16px;border-radius:8px;margin-bottom:16px;border-left:4px solid #f59e0b;">' +
            '<strong style="color:#92400e;">\u26A0\uFE0F Missing Items (' + missingItems.length + ')</strong>' +
            '<ul style="margin-top:8px;list-style:disc;padding-left:20px;">' +
            missingItems.map(function(m) { return '<li style="color:#92400e;font-size:13px;">' + esc(m) + '</li>'; }).join('') +
            '</ul></div>' : '<div style="background:#dcfce7;padding:16px;border-radius:8px;margin-bottom:16px;border-left:4px solid #10b981;">' +
            '<strong style="color:#166534;">\u2705 All requirements met! Your application is ready to submit.</strong></div>') +

        // Eligibility Summary
        '<h4 style="font-weight:600;margin:16px 0 8px;">' + T('application.eligibility_responses') + '</h4>' +
        eligReqs.map(function(r, i) {
            var checked = S.applyEligibility['elig_' + i];
            return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;">' +
                (checked ? '\u2705' : '\u274C') +
                '<span>' + esc(r.category || r.name || 'Requirement ' + (i + 1)) + '</span></div>';
        }).join('') +

        // Criteria Responses Summary
        '<h4 style="font-weight:600;margin:16px 0 8px;">' + T('application.proposal_responses') + '</h4>' +
        criteria.map(function(c, i) {
            var text = S.applyResponses['criterion_' + i] || '';
            var wc = wordCount(text);
            return '<div style="padding:8px 0;border-bottom:1px solid #f1f5f9;">' +
                '<div style="font-weight:500;font-size:14px;">' + esc(c.label || c.name) + '</div>' +
                '<div style="font-size:12px;color:#64748b;">' + wc + ' words</div>' +
                '</div>';
        }).join('') +

        // Documents Summary
        '<h4 style="font-weight:600;margin:16px 0 8px;">' + T('application.uploaded_documents') + '</h4>' +
        docs.map(function(d, i) {
            var key = d.type || ('doc_' + i);
            var uploaded = S.uploadedDocs[key];
            return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;">' +
                (uploaded ? '\u2705' : '\u274C') +
                '<span>' + esc(d.name || d.type) + '</span>' +
                (uploaded ? ' <span style="color:#94a3b8;">(' + esc(uploaded.filename || uploaded.name) + ')</span>' : '') +
                '</div>';
        }).join('') +

        '</div></div>';
}

async function saveDraft() {
    var g = S.selectedGrant;
    if (!g) {
        showToast('No grant selected. Please try again.', 'warning');
        return;
    }
    S._applySaving = true;
    render();
    var data = {
        grant_id: g.id,
        responses: S.applyResponses,
        eligibility: S.applyEligibility,
        status: 'draft'
    };
    try {
        var res = await api('POST', '/api/applications', data);
        S._applySaving = false;
        if (res) {
            S._applyLastSaved = new Date().toLocaleTimeString();
            S._applyLastSavedIso = new Date().toISOString();
            showToast(T('apply.draft_saved') || 'Application draft saved successfully.', 'success');
        } else {
            showToast('Failed to save draft. Please try again.', 'error');
        }
    } catch (err) {
        S._applySaving = false;
        showToast('Failed to save draft. Please check your connection.', 'error');
    }
    render();
}

async function submitApplication() {
    var g = S.selectedGrant;
    if (!g) return;
    telemetry('submit_started', { grant_id: g.id });
    var data = {
        grant_id: g.id,
        responses: S.applyResponses,
        eligibility: S.applyEligibility
    };
    var res = await api('POST', '/api/applications', data);
    if (res) {
        var appId = res.id || (res.application && res.application.id);
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
    return '<div class="page-header">' +
        '<h1>\uD83D\uDCCB ' + T('application.my_applications') + '</h1>' +
        '</div>' +
        '<div id="my-applications-list">' + renderLoadingTable() + '</div>';
}

async function loadApplications() {
    var res = await api('GET', '/api/applications');
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

    return '<button class="btn btn-secondary btn-sm" onclick="nav(\'' + backPage + '\')" style="margin-bottom:16px;">\u2190 ' + T('common.back') + '</button>' +

        '<div class="card" style="margin-bottom:24px;">' +
        '<div class="card-body">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:16px;">' +
        '<div>' +
        '<h1 style="font-size:22px;font-weight:700;">' + esc(a.grant_title || a.grant_name || 'Application') + '</h1>' +
        '<p style="color:#64748b;margin-top:4px;">' + esc(a.org_name || a.applicant_name || '') + '</p>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:16px;">' +
        statusBadge(a.status) +
        '</div>' +
        '</div>' +
        '<div style="display:flex;gap:24px;margin-top:16px;">' +
        '<div style="text-align:center;">' +
        scoreRingHTML(a.ai_score || 0, 64, 'AI') +
        '</div>' +
        '<div style="text-align:center;">' +
        scoreRingHTML(a.human_score || 0, 64, 'Human') +
        '</div>' +
        '<div style="text-align:center;">' +
        scoreRingHTML(a.final_score || 0, 64, 'Final') +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>' +

        // Tabs
        '<div style="display:flex;gap:4px;margin-bottom:24px;border-bottom:2px solid #e2e8f0;">' +
        tabs.map(function(t) {
            var active = tab === t.key;
            return '<button class="btn btn-sm" style="border:none;border-bottom:2px solid ' +
                (active ? '#2d8f6f' : 'transparent') + ';border-radius:0;color:' +
                (active ? '#2d8f6f' : '#64748b') + ';font-weight:' +
                (active ? '600' : '400') + ';padding:8px 16px;margin-bottom:-2px;" ' +
                'onclick="S.appDetailTab=\'' + t.key + '\';render();">' + esc(t.label) + '</button>';
        }).join('') +
        '</div>' +

        tabContent +

        (role === 'donor' || role === 'reviewer' ?
            '<div style="margin-top:24px;">' +
            '<button class="btn btn-primary" onclick="nav(\'scoreapp\',{selectedApplication:' +
            'S.selectedApplication})">' + T('review.submit_review') + '</button></div>' : '');
}

function renderAppResponses(a) {
    var responses = a.responses || {};
    var keys = Object.keys(responses);
    if (!keys.length) return '<div class="card"><div class="card-body"><p style="color:#94a3b8;">No responses submitted.</p></div></div>';
    return '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">' + T('application.application_responses') + '</h3>' +
        keys.map(function(k) {
            var label = k.replace(/_/g, ' ').replace(/criterion /i, 'Criterion ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
            return '<div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #f1f5f9;">' +
                '<h4 style="font-weight:600;font-size:14px;margin-bottom:4px;">' + esc(label) + '</h4>' +
                '<p style="color:#475569;font-size:14px;white-space:pre-wrap;">' + esc(responses[k]) + '</p>' +
                '</div>';
        }).join('') +
        '</div></div>';
}

function renderAppDocuments(a) {
    var docs = a.documents || [];
    if (!docs.length) return '<div class="card"><div class="card-body"><p style="color:#94a3b8;">No documents uploaded.</p></div></div>';
    return '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">' + T('application.uploaded_documents') + '</h3>' +
        docs.map(function(d) {
            return '<div class="upload-file-item" style="margin-bottom:8px;">' +
                '<span class="file-icon">\uD83D\uDCC4</span>' +
                '<div class="file-info">' +
                '<div class="file-name">' + esc(d.filename || d.name || 'Document') + '</div>' +
                '<div class="file-size">' + esc(d.type || '') + '</div>' +
                '</div>' +
                (d.ai_analysis ? '<span class="badge badge-' + (d.ai_analysis.score >= 70 ? 'green' : 'amber') + '">' +
                    'AI: ' + d.ai_analysis.score + '%</span>' : '') +
                '</div>' +
                (d.ai_analysis ? renderAIAnalysis(d.ai_analysis) : '');
        }).join('') +
        '</div></div>';
}

function renderAppScores(a) {
    var scores = a.scores || a.criteria_scores || {};
    var keys = Object.keys(scores);
    if (!keys.length) return '<div class="card"><div class="card-body"><p style="color:#94a3b8;">No scores available yet.</p></div></div>';
    return '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">' + T('application.scoring_breakdown') + '</h3>' +
        keys.map(function(k) {
            var s = scores[k];
            var val = typeof s === 'object' ? (s.score || 0) : s;
            return '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #f1f5f9;">' +
                '<div style="flex:1;font-weight:500;">' + esc(k.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); })) + '</div>' +
                '<div style="width:200px;">' +
                '<div class="progress"><div class="progress-bar ' + scoreColor(val) + '" style="width:' + val + '%"></div></div>' +
                '</div>' +
                '<span style="font-weight:600;width:40px;text-align:right;">' + val + '%</span>' +
                '</div>';
        }).join('') +
        '</div></div>';
}

function renderAppReviews(a) {
    var reviews = a.reviews || [];
    if (!reviews.length) return '<div class="card"><div class="card-body"><p style="color:#94a3b8;">No reviews completed yet.</p></div></div>';
    return '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">' + T('application.reviews') + '</h3>' +
        reviews.map(function(r) {
            return '<div style="padding:16px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<div>' +
                '<div style="font-weight:600;">' + esc(r.reviewer_name || 'Reviewer') + '</div>' +
                '<div style="font-size:12px;color:#94a3b8;">' + formatDate(r.completed_at || r.created_at) + '</div>' +
                '</div>' +
                '<div style="font-size:24px;font-weight:700;color:#2d8f6f;">' + (r.score || 0) + '%</div>' +
                '</div>' +
                (r.comments ? '<p style="margin-top:8px;color:#475569;font-size:13px;">' + esc(r.comments) + '</p>' : '') +
                '</div>';
        }).join('') +
        '</div></div>';
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
        draftIndicator = '<span data-draft-state="saving" style="font-size:12px;color:#6366f1;margin-left:12px;"><span class="spinner" style="width:12px;height:12px;border:2px solid #e0e7ff;border-top-color:#6366f1;border-radius:50%;animation:spin 0.6s linear infinite;display:inline-block;vertical-align:middle;margin-right:4px;"></span>Saving\u2026</span>';
    } else if (S.createData._lastSavedAt) {
        draftIndicator = '<span data-draft-state="saved" data-draft-save-success="' + (S.createData._draftSaveSuccess ? 'true' : 'false') + '" data-saved-time="' + (S.createData._lastSavedIso || '') + '" style="font-size:12px;color:#15803d;margin-left:12px;">\u2705 Saved at ' + esc(S.createData._lastSavedAt) + '</span>';
    } else if (S.createData.id) {
        draftIndicator = '<span data-draft-state="persisted" style="font-size:12px;color:#64748b;margin-left:12px;">\uD83D\uDCBE Draft (ID: ' + S.createData.id + ')</span>';
    }

    return '<div class="page-header"><h1>' + (S.createData.id ? '\u270F\uFE0F ' + T('common.edit') : '\u2795 ' + T('grant.create.title')) + draftIndicator + '</h1></div>' +

        renderWizardSteps(steps, Math.min(step, 5)) +

        '<div class="wizard-content">' + stepContent + '</div>' +

        '<div class="wizard-actions">' +
        (S._extractingReqs ? '<div data-upload-active="true" style="color:#6366f1;font-size:13px;font-weight:500;">' +
            (S._uploadPhase === 'saving_draft' ? T('grant.create.saving_draft') || 'Saving draft…' :
             S._uploadPhase === 'uploading' ? T('grant.create.uploading_doc') || 'Uploading…' :
             T('grant.create.ai_analyzing') || 'AI analyzing document…') + ' ' + T('common.please_wait') + '</div>' :
        (step > 1 ? '<button class="btn btn-secondary" onclick="S.createStep--;render();">\u2190 ' + T('common.previous') + '</button>' : '<div></div>')) +
        '<div style="display:flex;gap:8px;">' +
        (S._extractingReqs ? '' :
        (step === 6 ?
            '<button class="btn btn-secondary" onclick="saveGrantDraft()">' + T('grant.create.save_draft') + '</button>' +
            '<button class="btn btn-primary btn-lg" onclick="publishGrant()">\uD83D\uDE80 ' + T('grant.create.publish') + '</button>' :
            '<button class="btn btn-outline" style="font-size:13px;" onclick="saveGrantDraft()">' + T('grant.create.save_draft') + '</button>' +
            '<button class="btn btn-primary" onclick="' + (step === 5 ? 'S.createStep=6;render();' : 'S.createStep++;render();') + '">' + T('common.next') + ' \u2192</button>')) +
        '</div>' +
        '</div>';
}

function renderCreateBasicInfo() {
    var d = S.createData;
    var sectors = ['Health', 'Education', 'Climate', 'Protection', 'Nutrition', 'WASH', 'Livelihoods', 'Governance', 'Agriculture'];
    var countries = ['Somalia', 'Kenya', 'Ethiopia', 'Uganda', 'South Sudan', 'Global'];
    var currencies = ['USD', 'EUR', 'GBP', 'KES', 'CHF'];

    return '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">' + T('grant.create.step1') + '</h3>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('grant.create.grant_title') + ' <span class="required">*</span></label>' +
        '<input type="text" class="form-control" placeholder="' + T('grant.create.grant_title_placeholder') + '" ' +
        'value="' + esc(d.title) + '" oninput="S.createData.title=this.value;">' +
        '</div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('grant.create.description') + ' <span class="required">*</span></label>' +
        '<textarea class="form-control" rows="5" placeholder="' + T('grant.create.description_placeholder') + '" ' +
        'oninput="S.createData.description=this.value;">' + esc(d.description) + '</textarea>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('grant.create.total_funding') + ' <span class="required">*</span></label>' +
        '<input type="number" class="form-control" placeholder="500000" ' +
        'value="' + esc(d.total_funding) + '" oninput="S.createData.total_funding=this.value;">' +
        '</div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('grant.create.currency') + '</label>' +
        '<select class="form-control" onchange="S.createData.currency=this.value;">' +
        currencies.map(function(c) { return '<option value="' + c + '"' + (d.currency === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
        '</select>' +
        '</div>' +
        '</div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('grant.create.deadline') + ' <span class="required">*</span></label>' +
        '<input type="date" class="form-control" min="' + todayStr() + '" ' +
        'value="' + esc(d.deadline) + '" oninput="S.createData.deadline=this.value;">' +
        '</div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('grant.create.sectors') + '</label>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
        sectors.map(function(s) {
            var active = d.sectors.indexOf(s) >= 0;
            return '<button class="btn btn-sm ' + (active ? 'btn-primary' : 'btn-secondary') + '" ' +
                'onclick="toggleCreateTag(\'sectors\',\'' + s + '\')">' + sectorIcon(s) + ' ' + s + '</button>';
        }).join('') +
        '</div></div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('grant.create.countries') + '</label>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
        countries.map(function(c) {
            var active = d.countries.indexOf(c) >= 0;
            return '<button class="btn btn-sm ' + (active ? 'btn-primary' : 'btn-secondary') + '" ' +
                'onclick="toggleCreateTag(\'countries\',\'' + c + '\')">\uD83C\uDF10 ' + c + '</button>';
        }).join('') +
        '</div></div>' +
        '</div></div>';
}

function toggleCreateTag(field, value) {
    var arr = S.createData[field];
    var idx = arr.indexOf(value);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(value);
    render();
}

function renderCreateEligibility() {
    var categories = [
        { key: 'geographic', label: 'Geographic Location', icon: '\uD83C\uDF10', desc: 'Require applicants to operate in specific regions' },
        { key: 'org_type', label: 'Organization Type', icon: '\uD83C\uDFE2', desc: 'Specify required organization types (NGO, CBO, etc.)' },
        { key: 'experience', label: 'Years of Experience', icon: '\uD83D\uDCC5', desc: 'Minimum years of operational experience' },
        { key: 'budget', label: 'Budget Range', icon: '\uD83D\uDCB5', desc: 'Annual budget requirements' },
        { key: 'sector', label: 'Sector Focus', icon: '\uD83C\uDFAF', desc: 'Required sector expertise' },
        { key: 'registration', label: 'Legal Registration', icon: '\uD83D\uDCDC', desc: 'Registration and legal status requirements' }
    ];

    var currentElig = S.createData.eligibility || [];

    return '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:4px;">' + T('grant.detail.eligibility') + '</h3>' +
        '<p style="color:#64748b;font-size:13px;margin-bottom:16px;">Define who can apply for this grant.</p>' +

        categories.map(function(cat) {
            var existing = currentElig.find(function(e) { return e.category === cat.key; });
            var enabled = !!existing;
            return '<div class="eligibility-section">' +
                '<div class="eligibility-section-header" onclick="toggleEligibility(\'' + cat.key + '\')">' +
                '<div style="display:flex;align-items:center;gap:12px;">' +
                '<span style="font-size:20px;">' + cat.icon + '</span>' +
                '<div><h4>' + esc(cat.label) + '</h4>' +
                '<p style="font-size:12px;color:#94a3b8;font-weight:400;">' + esc(cat.desc) + '</p></div>' +
                '</div>' +
                '<div class="toggle-switch">' +
                '<input type="checkbox" ' + (enabled ? 'checked' : '') + '>' +
                '<span class="slider"></span>' +
                '</div>' +
                '</div>' +
                (enabled ? '<div class="eligibility-section-body">' +
                    '<div class="form-group">' +
                    '<label class="form-label">Details / Parameters</label>' +
                    '<input type="text" class="form-control" placeholder="Specify requirements..." ' +
                    'value="' + esc(existing.description || '') + '" ' +
                    'oninput="updateEligibility(\'' + cat.key + '\',\'description\',this.value);">' +
                    '</div>' +
                    '<div class="form-row">' +
                    '<div class="form-group">' +
                    '<label class="form-label">Weight</label>' +
                    '<input type="range" min="0" max="100" value="' + (existing.weight || 50) + '" ' +
                    'style="width:100%;" ' +
                    'oninput="updateEligibility(\'' + cat.key + '\',\'weight\',this.value);this.nextElementSibling.textContent=this.value+\'%\';">' +
                    '<span style="font-size:12px;color:#64748b;">' + (existing.weight || 50) + '%</span>' +
                    '</div>' +
                    '<div class="form-group">' +
                    '<label class="form-label">Required</label>' +
                    '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:8px;">' +
                    '<input type="checkbox" ' + (existing.required ? 'checked' : '') + ' ' +
                    'onchange="updateEligibility(\'' + cat.key + '\',\'required\',this.checked);">' +
                    '<span style="font-size:13px;">' + T('grant.create.must_meet_requirement') + '</span></label>' +
                    '</div></div>' +
                    '</div>' : '') +
                '</div>';
        }).join('') +

        '<button class="btn btn-secondary btn-sm" style="margin-top:12px;" ' +
        'onclick="addCustomEligibility()">\u2795 ' + T('grant.create.add_eligibility') + '</button>' +

        '<div style="background:#eff6ff;padding:12px;border-radius:6px;margin-top:16px;font-size:13px;border-left:3px solid #3b82f6;">' +
        '\uD83D\uDCA1 <strong>AI Tip:</strong> Consider including geographic requirements to target specific communities, ' +
        'and experience requirements to ensure grantees have the capacity to deliver results.</div>' +

        '</div></div>';
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

    return '<div class="card"><div class="card-body">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<div>' +
        '<h3 style="font-weight:600;">' + T('grant.detail.evaluation_criteria') + '</h3>' +
        '<p style="font-size:13px;color:#64748b;">Define how applications will be evaluated.</p>' +
        '</div>' +
        '<div style="text-align:right;">' +
        '<div style="font-size:24px;font-weight:700;color:' + (totalWeight === 100 ? '#10b981' : '#ef4444') + ';">' + totalWeight + '%</div>' +
        '<div style="font-size:12px;color:#64748b;">Total Weight' + (totalWeight !== 100 ? ' (must = 100%)' : ' \u2713') + '</div>' +
        '</div>' +
        '</div>' +

        criteria.map(function(c, i) {
            return '<div style="padding:16px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px;position:relative;">' +
                '<button style="position:absolute;top:8px;right:8px;background:none;border:none;color:#ef4444;cursor:pointer;font-size:18px;" ' +
                'onclick="S.createData.criteria.splice(' + i + ',1);render();">\u00D7</button>' +
                '<div class="form-row">' +
                '<div class="form-group">' +
                '<label class="form-label">Label <span class="required">*</span></label>' +
                '<input type="text" class="form-control" value="' + esc(c.label || '') + '" placeholder="e.g., Technical Approach" ' +
                'oninput="S.createData.criteria[' + i + '].label=this.value;">' +
                '</div>' +
                '<div class="form-group" style="max-width:100px;">' +
                '<label class="form-label">Weight %</label>' +
                '<input type="number" class="form-control" value="' + (c.weight || '') + '" min="0" max="100" ' +
                'oninput="S.createData.criteria[' + i + '].weight=Number(this.value);">' +
                '</div>' +
                '</div>' +
                '<div class="form-group">' +
                '<label class="form-label">Description</label>' +
                '<textarea class="form-control" rows="2" placeholder="What should applicants address?" ' +
                'oninput="S.createData.criteria[' + i + '].description=this.value;">' + esc(c.description || '') + '</textarea>' +
                '</div>' +
                '<div class="form-group">' +
                '<label class="form-label">' + T('grant.create.instructions_for_applicants') + '</label>' +
                '<textarea class="form-control" rows="2" placeholder="Guidance for writing a strong response..." ' +
                'oninput="S.createData.criteria[' + i + '].instructions=this.value;">' + esc(c.instructions || '') + '</textarea>' +
                '</div>' +
                '<div class="form-row">' +
                '<div class="form-group">' +
                '<label class="form-label">' + T('grant.create.example_response') + '</label>' +
                '<textarea class="form-control" rows="2" placeholder="Provide a sample response..." ' +
                'oninput="S.createData.criteria[' + i + '].example=this.value;">' + esc(c.example || '') + '</textarea>' +
                '</div>' +
                '<div class="form-group" style="max-width:120px;">' +
                '<label class="form-label">' + T('grant.create.max_words') + '</label>' +
                '<input type="number" class="form-control" value="' + (c.max_words || 500) + '" min="50" ' +
                'oninput="S.createData.criteria[' + i + '].max_words=Number(this.value);">' +
                '</div>' +
                '</div>' +
                '</div>';
        }).join('') +

        '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button class="btn btn-secondary" onclick="addCriterion()">\u2795 ' + T('grant.create.add_criterion') + '</button>' +
        '<button class="btn btn-sm" style="background:#eff6ff;color:#3b82f6;border:1px solid #bfdbfe;" ' +
        'onclick="suggestCriteria()">\u2728 AI Suggest Criteria</button>' +
        '</div>' +

        '</div></div>';
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
    var docTypes = [
        { key: 'financial_report', label: 'Financial Report', icon: '\uD83D\uDCCA', desc: 'Annual financial statements' },
        { key: 'registration', label: 'Registration Certificate', icon: '\uD83D\uDCDC', desc: 'Legal registration documents' },
        { key: 'audit', label: 'Audit Report', icon: '\uD83D\uDD0D', desc: 'External audit report' },
        { key: 'psea', label: 'PSEA Policy', icon: '\uD83D\uDEE1\uFE0F', desc: 'Protection policy document' },
        { key: 'project_report', label: 'Project Report', icon: '\uD83D\uDCC4', desc: 'Previous project reports' },
        { key: 'budget', label: 'Budget Detail', icon: '\uD83D\uDCB5', desc: 'Detailed project budget' },
        { key: 'cv', label: 'Staff CVs', icon: '\uD83D\uDC64', desc: 'Key staff qualifications' },
        { key: 'strategic_plan', label: 'Strategic Plan', icon: '\uD83D\uDCCB', desc: 'Organization strategic plan' }
    ];

    var currentDocs = S.createData.doc_requirements || [];

    return '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:4px;">' + T('grant.detail.doc_requirements') + '</h3>' +
        '<p style="font-size:13px;color:#64748b;margin-bottom:16px;">Select which documents applicants must submit.</p>' +

        docTypes.map(function(dt) {
            var existing = currentDocs.find(function(d) { return d.type === dt.key; });
            var enabled = !!existing;
            return '<div class="eligibility-section">' +
                '<div class="eligibility-section-header" onclick="toggleDocRequirement(\'' + dt.key + '\',\'' + esc(dt.label) + '\')">' +
                '<div style="display:flex;align-items:center;gap:12px;">' +
                '<span style="font-size:20px;">' + dt.icon + '</span>' +
                '<div><h4>' + esc(dt.label) + '</h4>' +
                '<p style="font-size:12px;color:#94a3b8;font-weight:400;">' + esc(dt.desc) + '</p></div>' +
                '</div>' +
                '<div class="toggle-switch">' +
                '<input type="checkbox" ' + (enabled ? 'checked' : '') + '>' +
                '<span class="slider"></span>' +
                '</div>' +
                '</div>' +
                (enabled ? '<div class="eligibility-section-body">' +
                    '<div class="form-group">' +
                    '<label class="form-label">' + T('grant.create.specific_requirements') + '</label>' +
                    '<input type="text" class="form-control" placeholder="Any specific requirements for this document..." ' +
                    'value="' + esc(existing.requirements || existing.description || '') + '" ' +
                    'oninput="updateDocReq(\'' + dt.key + '\',\'requirements\',this.value);">' +
                    '</div>' +
                    '<div class="form-row">' +
                    '<div class="form-group">' +
                    '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">' +
                    '<input type="checkbox" ' + (existing.required !== false ? 'checked' : '') + ' ' +
                    'onchange="updateDocReq(\'' + dt.key + '\',\'required\',this.checked);">' +
                    '<span style="font-size:13px;">' + T('grant.create.required_document') + '</span></label>' +
                    '</div>' +
                    '<div class="form-group">' +
                    '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">' +
                    '<input type="checkbox" ' + (existing.ai_review ? 'checked' : '') + ' ' +
                    'onchange="updateDocReq(\'' + dt.key + '\',\'ai_review\',this.checked);">' +
                    '<span style="font-size:13px;">\u2728 AI Document Review</span></label>' +
                    '</div></div>' +
                    (existing.ai_review ? '<div class="form-group" style="margin-top:8px;">' +
                    '<label class="form-label">\u2728 AI Evaluation Criteria</label>' +
                    '<textarea class="form-control" rows="2" placeholder="What should AI look for? e.g., Must include 3 years audited financials, budget variance under 10%..." ' +
                    'oninput="updateDocReq(\'' + dt.key + '\',\'ai_criteria\',this.value);">' + esc(existing.ai_criteria || '') + '</textarea>' +
                    '<p style="font-size:11px;color:#94a3b8;margin-top:4px;">AI will evaluate uploaded documents against these specific criteria.</p>' +
                    '</div>' : '') +
                    '</div>' : '') +
                '</div>';
        }).join('') +

        '</div></div>';
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
            return '<div class="card" style="margin-bottom:12px;border-left:4px solid #2d8f6f;">' +
                '<div class="card-body" style="padding:12px 16px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:start;">' +
                '<div>' +
                '<strong>' + esc(req.title || req.type) + '</strong>' +
                '<span class="badge badge-green" style="margin-left:8px;font-size:11px;">' + esc(req.type) + '</span>' +
                '<span class="badge badge-outline" style="margin-left:4px;font-size:11px;">' + esc(req.frequency || d.reporting_frequency) + '</span>' +
                '</div>' +
                '<button class="btn btn-sm" style="color:#ef4444;padding:2px 8px;" onclick="removeReportingReq(' + i + ')">x</button>' +
                '</div>' +
                '<p style="font-size:13px;color:#64748b;margin-top:4px;">' + esc(req.description || '') + '</p>' +
                (req.due_days_after_period ? '<p style="font-size:12px;color:#94a3b8;margin-top:4px;">' + T('grant.create.due_days', {days: req.due_days_after_period}) + '</p>' : '') +
                '</div></div>';
        }).join('');
    } else {
        reqsHTML = '<p style="color:#94a3b8;padding:16px;text-align:center;">' + T('grant.create.no_reqs_yet') + '</p>';
    }

    var templateHTML = '';
    var tmpl = d.report_template;
    if (tmpl && tmpl.template_sections && tmpl.template_sections.length > 0) {
        templateHTML = '<div style="margin-top:16px;">' +
            '<h4 style="font-size:14px;font-weight:600;margin-bottom:8px;">' + T('grant.create.report_template_sections') + '</h4>' +
            tmpl.template_sections.map(function(s, i) {
                return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9;">' +
                    '<span style="color:#2d8f6f;font-weight:600;">' + (i+1) + '.</span>' +
                    '<span style="font-weight:500;">' + esc(s.title) + '</span>' +
                    (s.required ? '<span class="badge badge-red" style="font-size:10px;">Required</span>' : '<span class="badge badge-outline" style="font-size:10px;">Optional</span>') +
                    '</div>';
            }).join('') +
            '</div>';
    }

    return '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:4px;">' + T('grant.create.reporting_requirements') + '</h3>' +
        '<p style="color:#64748b;font-size:13px;margin-bottom:16px;">' + T('grant.create.reporting_requirements_desc') + '</p>' +

        // Upload grant document
        '<div style="background:#f0fdf4;border:2px dashed #86efac;border-radius:12px;padding:20px;text-align:center;margin-bottom:20px;">' +
        '<p style="font-weight:600;margin-bottom:8px;">' + (d.grant_document ? '\u2705 ' + T('grant.create.grant_doc_uploaded') : '\uD83D\uDCC4 ' + T('grant.create.upload_grant_doc')) + '</p>' +
        (d.grant_document && d._docOriginalName ? '<p style="font-size:12px;color:#2d8f6f;margin-bottom:4px;"><strong>' + esc(d._docOriginalName) + '</strong>' +
            (d._docUploadTime ? ' — ' + T('grant.create.uploaded_at') + ' ' + esc(d._docUploadTime) : '') + '</p>' : '') +
        (d._extractionStatus === 'success' ? '<div id="extraction-result" data-extraction-status="success" data-extraction-count="' + (d._extractedCount || 0) + '" data-extraction-time="' + (d._extractionTimestamp || '') + '" style="background:#dcfce7;color:#166534;padding:16px 20px;border-radius:10px;font-size:14px;font-weight:500;margin-bottom:12px;border:2px solid #22c55e;box-shadow:0 2px 8px rgba(34,197,94,0.15);">' +
            '<div style="font-size:16px;margin-bottom:4px;">\u2705 ' + T('grant.create.ai_extraction_complete') + '</div>' +
            '<div>' + T('grant.create.extracted_count') + ' <strong>' + (d._extractedCount || 0) + '</strong> ' + T('grant.create.reporting_requirements').toLowerCase() +
            (d.report_template && d.report_template.template_sections ? ', <strong>' + d.report_template.template_sections.length + '</strong> ' + T('grant.create.template_sections') : '') +
            (d.report_template && d.report_template.indicators ? ', <strong>' + d.report_template.indicators.length + '</strong> ' + T('grant.create.indicators') : '') +
            '</div>' +
            (d._docUploadTime ? '<div style="font-size:12px;color:#15803d;font-weight:400;margin-top:4px;">' + T('grant.create.processed_at') + ' ' + esc(d._docUploadTime) + '</div>' : '') +
            '</div>' :
         d._extractionStatus === 'empty' ? '<div id="extraction-result" data-extraction-status="empty" data-extraction-time="' + (d._extractionTimestamp || '') + '" style="background:#fef9c3;color:#854d0e;padding:16px 20px;border-radius:10px;font-size:14px;font-weight:500;margin-bottom:12px;border:2px solid #f59e0b;box-shadow:0 2px 8px rgba(245,158,11,0.12);">' +
            '<div style="font-size:16px;margin-bottom:4px;">\u26A0\uFE0F ' + T('grant.create.no_reqs_found') + '</div>' +
            '<div>' + T('grant.create.no_reqs_found_desc') + '</div>' +
            (d._docUploadTime ? '<div style="font-size:12px;font-weight:400;margin-top:4px;">' + T('grant.create.attempted_at') + ' ' + esc(d._docUploadTime) + '</div>' : '') +
            '<button class="btn btn-sm" style="margin-top:8px;background:#fef3c7;border:1px solid #f59e0b;color:#92400e;" onclick="document.getElementById(\'grant-doc-upload\').click();">\uD83D\uDD04 ' + T('grant.create.retry_file') + '</button>' +
            '</div>' :
         d._extractionStatus === 'failed' ? '<div id="extraction-result" data-extraction-status="failed" data-extraction-time="' + (d._extractionTimestamp || '') + '" style="background:#fee2e2;color:#991b1b;padding:16px 20px;border-radius:10px;font-size:14px;font-weight:500;margin-bottom:12px;border:2px solid #ef4444;box-shadow:0 2px 8px rgba(239,68,68,0.12);">' +
            '<div style="font-size:16px;margin-bottom:4px;">\u274C ' + T('grant.create.extraction_failed') + '</div>' +
            '<div>' + T('grant.create.extraction_failed_desc') + '</div>' +
            (d._docUploadTime ? '<div style="font-size:12px;font-weight:400;margin-top:4px;">' + T('grant.create.failed_at') + ' ' + esc(d._docUploadTime) + '</div>' : '') +
            '<button class="btn btn-sm" style="margin-top:8px;background:#fee2e2;border:1px solid #ef4444;color:#991b1b;" onclick="document.getElementById(\'grant-doc-upload\').click();">\uD83D\uDD04 ' + T('grant.create.retry_upload') + '</button>' +
            '</div>' : '') +
        (d._extractionStatus ? '' : '<p style="font-size:13px;color:#64748b;margin-bottom:12px;">' + T('grant.create.upload_doc_desc') + '</p>') +
        '<input type="file" id="grant-doc-upload" style="display:none;" accept=".pdf,.doc,.docx,.txt" onchange="uploadGrantDoc()">' +
        (!d._extractionStatus ? '<button class="btn btn-primary btn-sm" onclick="document.getElementById(\'grant-doc-upload\').click();">' +
            (d.grant_document ? T('grant.create.replace_document') : T('grant.create.choose_file')) + '</button>' : '') +
        (d._extractionStatus === 'success' ? '<button class="btn btn-sm" style="margin-top:8px;background:#f0fdf4;border:1px solid #86efac;color:#166534;" onclick="document.getElementById(\'grant-doc-upload\').click();">\uD83D\uDD04 ' + T('grant.create.upload_different_doc') + '</button>' : '') +
        (S._extractingReqs ? '<div id="extraction-result" class="ai-analyzing" data-upload-phase="' + (S._uploadPhase || 'processing') + '" style="margin-top:16px;padding:16px;background:#eff6ff;border-radius:10px;border:2px solid #93c5fd;text-align:center;">' +
            '<div class="dot-pulse" style="margin-bottom:8px;"><span></span><span></span><span></span></div>' +
            '<div style="font-size:14px;font-weight:600;color:#1e40af;">' +
            (S._uploadPhase === 'saving_draft' ? (T('grant.create.saving_draft') || 'Saving draft…') :
             S._uploadPhase === 'uploading' ? (T('grant.create.uploading_doc') || 'Uploading document…') :
             T('grant.create.ai_analyzing')) + '</div>' +
            '<div style="font-size:12px;color:#3b82f6;margin-top:4px;">' +
            (S._uploadPhase === 'saving_draft' ? (T('grant.create.saving_draft_wait') || 'Please wait while we save your grant…') :
             S._uploadPhase === 'uploading' ? (T('grant.create.uploading_wait') || 'Transferring file to server…') :
             T('grant.create.ai_analyzing_wait')) + '</div>' +
            (S.createData._docOriginalName ? '<div style="font-size:11px;color:#64748b;margin-top:6px;">📄 ' + esc(S.createData._docOriginalName) + '</div>' : '') +
            '</div>' : '') +
        '</div>' +

        // Reporting frequency
        '<div class="form-group">' +
        '<label class="form-label">' + T('grant.create.default_reporting_freq') + '</label>' +
        '<select class="form-control" onchange="S.createData.reporting_frequency=this.value;">' +
        frequencies.map(function(f) {
            return '<option value="' + f.value + '"' + (d.reporting_frequency === f.value ? ' selected' : '') + '>' + f.label + '</option>';
        }).join('') +
        '</select>' +
        '</div>' +

        // Current requirements list
        '<div style="margin-top:16px;">' +
        '<h4 style="font-size:14px;font-weight:600;margin-bottom:8px;">' + T('grant.create.required_reports') + '</h4>' +
        reqsHTML +
        '</div>' +

        // Add requirement manually
        '<div style="margin-top:16px;padding:16px;background:#f8fafc;border-radius:8px;">' +
        '<h4 style="font-size:14px;font-weight:600;margin-bottom:8px;">' + T('grant.create.add_req_manually') + '</h4>' +
        '<div class="form-row">' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('report.type') + '</label>' +
        '<select class="form-control" id="new-req-type">' +
        reportTypes.map(function(t) { return '<option value="' + t + '">' + t.charAt(0).toUpperCase() + t.slice(1) + '</option>'; }).join('') +
        '</select>' +
        '</div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('grant.create.title_label') + '</label>' +
        '<input type="text" class="form-control" id="new-req-title" placeholder="e.g., Quarterly Financial Report">' +
        '</div>' +
        '</div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('grant.create.description_label') + '</label>' +
        '<textarea class="form-control" rows="2" id="new-req-desc" placeholder="Describe what should be included in this report..."></textarea>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('grant.create.frequency_label') + '</label>' +
        '<select class="form-control" id="new-req-freq">' +
        frequencies.map(function(f) { return '<option value="' + f.value + '">' + f.label + '</option>'; }).join('') +
        '</select>' +
        '</div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('grant.create.days_due_after_period') + '</label>' +
        '<input type="number" class="form-control" id="new-req-days" value="30" min="1" max="180">' +
        '</div>' +
        '</div>' +
        '<button class="btn btn-secondary btn-sm" onclick="addReportingReq()">' + T('grant.create.add_requirement') + '</button>' +
        '</div>' +

        // Template preview
        templateHTML +

        '</div></div>';
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
            var saveRes = await api('POST', '/api/grants', {
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

    return '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">' + T('grant.create.review_publish') + '</h3>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">' +
        '<div>' +
        '<h4 style="font-weight:600;margin-bottom:8px;">' + T('grant.create.basic_information') + '</h4>' +
        '<div style="font-size:14px;">' +
        '<p><strong>' + T('grant.create.review_title') + '</strong> ' + esc(d.title || 'Not set') + '</p>' +
        '<p><strong>' + T('grant.create.review_funding') + '</strong> ' + formatCurrency(d.total_funding, d.currency) + '</p>' +
        '<p><strong>' + T('grant.create.review_deadline') + '</strong> ' + formatDate(d.deadline) + '</p>' +
        '<p><strong>' + T('grant.create.review_sectors') + '</strong> ' + esc((d.sectors || []).join(', ') || 'None') + '</p>' +
        '<p><strong>' + T('grant.create.review_countries') + '</strong> ' + esc((d.countries || []).join(', ') || 'None') + '</p>' +
        '</div>' +
        '</div>' +
        '<div>' +
        '<h4 style="font-weight:600;margin-bottom:8px;">' + T('grant.create.configuration') + '</h4>' +
        '<div style="font-size:14px;">' +
        '<p><strong>' + T('grant.create.review_eligibility') + '</strong> ' + (d.eligibility || []).length + '</p>' +
        '<p><strong>' + T('grant.create.review_criteria') + '</strong> ' + (d.criteria || []).length +
        ' (' + T('grant.create.review_total_weight') + ' ' + totalWeight + '%' + (totalWeight === 100 ? ' \u2713' : ' \u26A0\uFE0F') + ')</p>' +
        '<p><strong>' + T('grant.create.review_doc_reqs') + '</strong> ' + (d.doc_requirements || []).length + '</p>' +
        '<p><strong>' + T('grant.create.review_reporting_reqs') + '</strong> ' + (d.reporting_requirements || []).length + '</p>' +
        '<p><strong>' + T('grant.create.review_reporting_freq') + '</strong> ' + esc(d.reporting_frequency || 'quarterly') + '</p>' +
        '</div>' +
        '</div>' +
        '</div>' +

        ((!d.title || !d.total_funding || !d.deadline) ?
            '<div style="background:#fef3c7;padding:12px;border-radius:6px;margin-top:16px;border-left:3px solid #f59e0b;">' +
            '<strong style="color:#92400e;">\u26A0\uFE0F ' + T('grant.create.fill_required_warning') + '</strong>' +
            (!d.title ? '<br>- ' + T('grant.create.grant_title') : '') +
            (!d.total_funding ? '<br>- ' + T('grant.create.total_funding') : '') +
            (!d.deadline ? '<br>- ' + T('grant.create.deadline') : '') +
            '</div>' : '') +

        (totalWeight !== 100 && (d.criteria || []).length > 0 ?
            '<div style="background:#fef3c7;padding:12px;border-radius:6px;margin-top:12px;border-left:3px solid #f59e0b;">' +
            '<strong style="color:#92400e;">\u26A0\uFE0F ' + T('grant.create.criteria_weight_warning', {weight: totalWeight}) + '</strong>' +
            '</div>' : '') +

        '</div></div>';
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
    var url = d.id ? '/api/grants/' + d.id : '/api/grants';
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
    var url = d.id ? '/api/grants/' + d.id : '/api/grants';
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

    return '<div class="page-header">' +
        '<h1>\u2B50 ' + T('dashboard.action.review_apps') + '</h1>' +
        '</div>' +

        '<div class="card" style="margin-bottom:24px;">' +
        '<div class="card-body" style="display:flex;gap:16px;align-items:end;">' +
        '<div class="form-group" style="margin:0;flex:1;">' +
        '<label class="form-label">' + T('ranking.select_grant') + '</label>' +
        '<select class="form-control" onchange="loadRankingsByGrant(this.value);">' +
        '<option value="">-- Select a Grant --</option>' +
        grantOptions +
        '</select>' +
        '</div>' +
        '</div>' +
        '</div>' +

        '<div id="rankings-table">' +
        (S._rankingsApps && S._rankingsApps.length ?
            renderRankingsTable(S._rankingsApps) :
            '<div class="card"><div class="card-body" style="text-align:center;padding:48px;color:#94a3b8;">' +
            '<p style="font-size:40px;margin-bottom:12px;">\uD83D\uDCCB</p>' +
            '<p>Select a grant to view applications.</p></div></div>') +
        '</div>';
}

function renderRankingsTable(apps) {
    if (!apps.length) return '<div class="card"><div class="card-body" style="text-align:center;padding:32px;color:#94a3b8;">No applications for this grant.</div></div>';

    var sorted = apps.slice().sort(function(a, b) { return (b.final_score || b.ai_score || 0) - (a.final_score || a.ai_score || 0); });

    return '<div class="table-wrapper"><table class="table table-hover">' +
        '<thead><tr><th>#</th><th>' + T('verification.organization') + '</th><th>' + T('verification.country') + '</th><th>' + T('dashboard.stat.capacity_score') + '</th><th>' + T('ranking.ai_score') + '</th><th>' + T('ranking.human_score') + '</th><th>' + T('ranking.final_score') + '</th><th>' + T('application.tab.status') + '</th><th></th></tr></thead>' +
        '<tbody>' +
        sorted.map(function(a, i) {
            return '<tr style="cursor:pointer;" onclick="viewApplication(' + a.id + ')">' +
                '<td style="font-weight:600;">' + (i + 1) + '</td>' +
                '<td style="font-weight:500;">' + esc(a.org_name || a.applicant_name || '') + '</td>' +
                '<td>' + esc(a.country || '') + '</td>' +
                '<td>' + (a.capacity_score != null ? a.capacity_score + '%' : '-') + '</td>' +
                '<td style="font-weight:600;color:' + (a.ai_score >= 70 ? '#10b981' : '#f59e0b') + ';">' + (a.ai_score != null ? a.ai_score + '%' : '-') + '</td>' +
                '<td>' + (a.human_score != null ? a.human_score + '%' : '-') + '</td>' +
                '<td style="font-weight:700;">' + (a.final_score != null ? a.final_score + '%' : '-') + '</td>' +
                '<td>' + statusBadge(a.status) + '</td>' +
                '<td style="white-space:nowrap;">' +
                '<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();nav(\'scoreapp\',{selectedApplication:null});viewAndScore(' + a.id + ');">Score</button> ' +
                (a.status !== 'awarded' ? '<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();awardGrant(' + a.id + ');">\uD83C\uDFC6 Award</button>' : '') +
                '</td></tr>';
        }).join('') +
        '</tbody></table></div>';
}

async function loadRankingsData() {
    if (S._rankingsLoading) return;
    S._rankingsLoading = true;
    var res = await api('GET', '/api/grants');
    S._rankingsLoading = false;
    if (res && res.grants) S.grants = res.grants;
}

async function loadRankingsByGrant(grantId) {
    if (!grantId) { S._rankingsApps = []; render(); return; }
    S._rankingsGrantId = grantId;
    var res = await api('GET', '/api/applications?grant_id=' + grantId);
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
    if (!a) return '<div class="page-header"><h1>' + T('review.submit_review') + '</h1><p>' + T('common.loading') + '</p></div>';

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

    return '<button class="btn btn-secondary btn-sm" onclick="nav(\'' + backPage + '\')" style="margin-bottom:16px;">\u2190 ' + T('common.back') + '</button>' +

        '<div class="card" style="margin-bottom:24px;">' +
        '<div class="card-body" style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div>' +
        '<h1 style="font-size:20px;font-weight:700;">' + esc(a.grant_title || a.grant_name || 'Application') + '</h1>' +
        '<p style="color:#64748b;">' + esc(a.org_name || a.applicant_name || '') + '</p>' +
        '</div>' +
        '<div style="text-align:center;">' +
        scoreRingHTML(weightedScore, 80, 'Score') +
        '</div>' +
        '</div></div>' +

        criteria.map(function(c, i) {
            var key = c.key || ('criterion_' + i);
            var respKey = key;
            var responseText = responses[respKey] || responses['criterion_' + i] || '';
            var currentScore = S.scoreData[key] || '';
            var currentComment = S.scoreComments[key] || '';

            return '<div class="card" style="margin-bottom:16px;">' +
                '<div class="card-body">' +
                '<div style="display:flex;gap:24px;flex-wrap:wrap;">' +
                // Left: Response
                '<div style="flex:1;min-width:300px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
                '<h3 style="font-weight:600;">' + esc(c.label || c.name || 'Criterion') + '</h3>' +
                '<span class="badge badge-blue">' + T('grant.create.weight') + ': ' + (c.weight || 0) + '%</span>' +
                '</div>' +
                '<div style="background:#f8fafc;padding:12px;border-radius:6px;font-size:14px;color:#475569;max-height:300px;overflow-y:auto;white-space:pre-wrap;">' +
                esc(responseText || 'No response provided.') +
                '</div>' +
                '</div>' +
                // Right: Scoring
                '<div style="width:280px;flex-shrink:0;">' +
                '<div class="form-group">' +
                '<label class="form-label">Score (0-100)</label>' +
                '<input type="number" class="form-control" min="0" max="100" ' +
                'value="' + esc(currentScore) + '" ' +
                'oninput="S.scoreData[\'' + key + '\']=Number(this.value);">' +
                '<input type="range" min="0" max="100" value="' + (currentScore || 0) + '" ' +
                'style="width:100%;margin-top:8px;" ' +
                'oninput="S.scoreData[\'' + key + '\']=Number(this.value);this.previousElementSibling.previousElementSibling.value=this.value;">' +
                '</div>' +
                '<div class="form-group">' +
                '<label class="form-label">Comment</label>' +
                '<textarea class="form-control" rows="3" placeholder="Feedback..." ' +
                'oninput="S.scoreComments[\'' + key + '\']=this.value;">' + esc(currentComment) + '</textarea>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div></div>';
        }).join('') +

        // Document Scores
        (a.documents && a.documents.length ? '<div class="card" style="margin-bottom:16px;"><div class="card-body">' +
            '<h3 style="font-weight:600;margin-bottom:12px;">' + T('application.document_analysis') + '</h3>' +
            a.documents.map(function(d) {
                return '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #f1f5f9;">' +
                    '<span>\uD83D\uDCC4</span>' +
                    '<span style="flex:1;font-weight:500;">' + esc(d.name || d.filename || d.type) + '</span>' +
                    (d.ai_analysis ? '<span class="badge badge-' + (d.ai_analysis.score >= 70 ? 'green' : 'amber') + '">AI: ' + d.ai_analysis.score + '%</span>' : '') +
                    '</div>';
            }).join('') +
            '</div></div>' : '') +

        '<div style="display:flex;gap:12px;margin-top:24px;">' +
        '<button class="btn btn-primary btn-lg" onclick="submitScores()">' + T('review.submit_review') + '</button>' +
        '<button class="btn btn-secondary" onclick="aiScoreApplication();">\u2728 AI Auto-Score</button>' +
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
    var score = stats.assessment_score || 0;
    var cap = capacityLabel(score);
    var categories = stats.category_scores || {};

    return '<div class="page-header">' +
        '<h1>\uD83D\uDCDD ' + T('assessment.title') + '</h1>' +
        '</div>' +

        '<div class="card" style="margin-bottom:24px;">' +
        '<div class="card-body" style="display:flex;align-items:center;gap:32px;flex-wrap:wrap;">' +
        '<div style="text-align:center;">' +
        scoreRingHTML(score, 120, '%') +
        '</div>' +
        '<div style="flex:1;">' +
        '<h2 style="font-size:22px;font-weight:700;">' + T('dashboard.stat.capacity_score') + '</h2>' +
        '<p style="margin-top:4px;font-size:16px;">Level: <span class="badge badge-' + cap.color + '" style="font-size:14px;">' + esc(cap.label) + '</span></p>' +
        '<div style="margin-top:16px;">' +
        Object.keys(categories).map(function(k) {
            var val = categories[k] || 0;
            return '<div style="margin-bottom:8px;">' +
                '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">' +
                '<span>' + esc(k.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); })) + '</span>' +
                '<span style="font-weight:600;">' + val + '%</span></div>' +
                '<div class="progress"><div class="progress-bar ' + scoreColor(val) + '" style="width:' + val + '%"></div></div>' +
                '</div>';
        }).join('') +
        '</div>' +
        '</div>' +
        '</div></div>' +

        '<div style="margin-bottom:24px;">' +
        '<h2 style="font-size:18px;font-weight:600;margin-bottom:16px;">' + T('assessment.previous_assessments') + '</h2>' +
        '<div id="assessment-history">' + renderLoadingTable() + '</div>' +
        '</div>' +

        // Framework selection cards
        '<div style="margin-top:24px;">' +
        '<h2 style="font-size:18px;font-weight:600;margin-bottom:16px;">' + T('assessment.start_new') + '</h2>' +
        '<p style="color:#64748b;font-size:13px;margin-bottom:16px;">Choose an assessment framework that best fits your needs and donor requirements.</p>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">' +

        renderFrameworkCard('kuja', T('assessment.framework.kuja'), T('assessment.framework.kuja_desc'), '26 items', '30-45 min') +
        renderFrameworkCard('step', T('assessment.framework.step'), T('assessment.framework.step_desc'), '26 items', '45-60 min') +
        renderFrameworkCard('un_hact', T('assessment.framework.un_hact'), T('assessment.framework.un_hact_desc'), '22 items', '45-60 min') +
        renderFrameworkCard('chs', T('assessment.framework.chs'), T('assessment.framework.chs_desc'), '27 items', '60-90 min') +
        renderFrameworkCard('nupas', T('assessment.framework.nupas'), T('assessment.framework.nupas_desc'), '27 items', '60-90 min') +

        '</div>' +
        '<button class="btn btn-primary btn-lg" style="margin-top:16px;" onclick="startAssessment()">' +
        (score > 0 ? '\uD83D\uDD04 ' + T('assessment.start_new') : '\uD83D\uDCDD ' + T('assessment.start_new')) +
        '</button>' +
        '</div>';
}

function renderFrameworkCard(id, name, desc, items, time) {
    var selected = S.selectedFramework === id;
    return '<div class="card" style="cursor:pointer;border:2px solid ' + (selected ? '#2d8f6f' : '#e2e8f0') + ';transition:all 0.2s;" ' +
        'onclick="S.selectedFramework=\'' + id + '\';render();">' +
        '<div class="card-body" style="padding:16px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<h4 style="font-size:15px;font-weight:600;">' + esc(name) + '</h4>' +
        (selected ? '<span class="badge badge-green">Selected</span>' : '') +
        '</div>' +
        '<p style="font-size:13px;color:#64748b;margin-top:4px;">' + esc(desc) + '</p>' +
        '<div style="display:flex;gap:12px;margin-top:8px;">' +
        '<span style="font-size:12px;color:#94a3b8;">\uD83D\uDCCB ' + items + '</span>' +
        '<span style="font-size:12px;color:#94a3b8;">\u23F1 ' + time + '</span>' +
        '</div>' +
        '</div></div>';
}

async function loadAssessments() {
    var res = await api('GET', '/api/assessments');
    if (res && res.assessments) {
        S.assessments = res.assessments;
        var el = document.getElementById('assessment-history');
        if (el) {
            if (S.assessments.length) {
                el.innerHTML = '<div class="table-wrapper"><table class="table">' +
                    '<thead><tr><th>Date</th><th>Score</th><th>Level</th><th>Status</th></tr></thead><tbody>' +
                    S.assessments.map(function(a) {
                        var c = capacityLabel(a.score || 0);
                        return '<tr><td>' + formatDate(a.created_at || a.date) + '</td>' +
                            '<td style="font-weight:600;">' + (a.score || 0) + '%</td>' +
                            '<td><span class="badge badge-' + c.color + '">' + esc(c.label) + '</span></td>' +
                            '<td>' + statusBadge(a.status || 'completed') + '</td></tr>';
                    }).join('') +
                    '</tbody></table></div>';
            } else {
                el.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:32px;color:#94a3b8;">' +
                    '<p>' + T('assessment.no_assessments') + '</p></div></div>';
            }
        }
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

    return '<div class="page-header"><h1>\uD83D\uDCDD ' + T('assessment.title') + '</h1></div>' +
        renderWizardSteps(steps, step) +
        '<div class="wizard-content">' + stepContent + '</div>' +
        '<div class="wizard-actions">' +
        (step > 1 && step < 4 ? '<button class="btn btn-secondary" onclick="S.assessStep--;render();">\u2190 ' + T('common.previous') + '</button>' : '<div></div>') +
        (step < 3 ? '<button class="btn btn-primary" onclick="S.assessStep++;render();">' + T('common.next') + ' \u2192</button>' :
            step === 3 ? '<button class="btn btn-primary btn-lg" onclick="submitAssessment()">' + T('assessment.complete') + '</button>' :
                '<button class="btn btn-primary" onclick="nav(\'assessment\')">' + T('common.back') + '</button>') +
        '</div>';
}

function renderAssessProfile() {
    var p = S.assessOrgProfile;
    return '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:4px;">' + T('assessment.step1') + '</h3>' +
        '<p style="color:#64748b;font-size:13px;margin-bottom:16px;">Review and confirm your organization details.</p>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('org.name') + '</label>' +
        '<input type="text" class="form-control" value="' + esc(p.name || S.user.org_name || '') + '" ' +
        'oninput="S.assessOrgProfile.name=this.value;">' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('org.country') + '</label>' +
        '<input type="text" class="form-control" value="' + esc(p.country || '') + '" ' +
        'oninput="S.assessOrgProfile.country=this.value;">' +
        '</div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('org.year_established') + '</label>' +
        '<input type="number" class="form-control" value="' + esc(p.year_established || '') + '" ' +
        'oninput="S.assessOrgProfile.year_established=this.value;">' +
        '</div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('org.annual_budget') + '</label>' +
        '<input type="text" class="form-control" value="' + esc(p.annual_budget || '') + '" placeholder="e.g., $500,000" ' +
        'oninput="S.assessOrgProfile.annual_budget=this.value;">' +
        '</div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('assessment.number_of_staff') + '</label>' +
        '<input type="number" class="form-control" value="' + esc(p.staff_count || '') + '" ' +
        'oninput="S.assessOrgProfile.staff_count=this.value;">' +
        '</div>' +
        '</div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('assessment.mission_statement') + '</label>' +
        '<textarea class="form-control" rows="3" ' +
        'oninput="S.assessOrgProfile.mission=this.value;">' + esc(p.mission || '') + '</textarea>' +
        '</div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('assessment.key_sectors') + '</label>' +
        '<input type="text" class="form-control" value="' + esc(p.sectors || '') + '" placeholder="Health, Education, etc." ' +
        'oninput="S.assessOrgProfile.sectors=this.value;">' +
        '</div>' +
        '</div></div>';
}

function renderAssessChecklist() {
    var framework = S.selectedFramework || 'kuja';
    var categories = FRAMEWORK_CHECKLISTS[framework] || FRAMEWORK_CHECKLISTS['kuja'];

    var html = '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:4px;">' + T('assessment.step2') + '</h3>' +
        '<p style="color:#64748b;font-size:13px;margin-bottom:4px;">Framework: <strong>' + esc(framework.toUpperCase().replace(/_/g, ' ')) + '</strong></p>' +
        '<p style="color:#64748b;font-size:13px;margin-bottom:16px;">Check each item that your organization has in place.</p>';

    Object.keys(categories).forEach(function(catName) {
        var items = categories[catName];
        html += '<div style="margin-bottom:20px;">' +
            '<h4 style="font-size:15px;font-weight:600;color:#334155;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e2e8f0;">' + esc(catName) + '</h4>';

        items.forEach(function(item) {
            var checked = S.assessChecklist[item.key] ? ' checked' : '';
            html += '<label style="display:flex;align-items:center;gap:10px;padding:8px 0;cursor:pointer;border-bottom:1px solid #f8fafc;">' +
                '<input type="checkbox"' + checked + ' onchange="S.assessChecklist[\'' + item.key + '\']=this.checked;" style="width:18px;height:18px;accent-color:#2d8f6f;">' +
                '<span style="font-size:14px;">' + esc(item.label) + '</span>' +
                '</label>';
        });

        html += '</div>';
    });

    html += '</div></div>';
    return html;
}

function renderAssessDocUpload() {
    var docTypes = [
        { key: 'registration', label: 'Registration Certificate', icon: '\uD83D\uDCDC' },
        { key: 'financial', label: 'Financial Statements', icon: '\uD83D\uDCCA' },
        { key: 'audit', label: 'Audit Report', icon: '\uD83D\uDD0D' },
        { key: 'psea', label: 'PSEA Policy', icon: '\uD83D\uDEE1\uFE0F' },
        { key: 'strategic', label: 'Strategic Plan', icon: '\uD83D\uDCCB' }
    ];

    return '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:4px;">' + T('assessment.step3') + '</h3>' +
        '<p style="color:#64748b;font-size:13px;margin-bottom:16px;">Upload documents to support your assessment.</p>' +

        docTypes.map(function(dt) {
            var uploaded = S.assessDocuments[dt.key];
            return '<div style="margin-bottom:16px;">' +
                '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">' +
                '<span style="font-size:20px;">' + dt.icon + '</span>' +
                '<strong>' + esc(dt.label) + '</strong>' +
                (uploaded ? '<span class="badge badge-green">\u2713 Uploaded</span>' : '') +
                '</div>' +
                (uploaded ?
                    '<div class="upload-file-item">' +
                    '<span class="file-icon">\uD83D\uDCC4</span>' +
                    '<div class="file-info"><div class="file-name">' + esc(uploaded.name) + '</div></div>' +
                    '</div>' :
                    '<div class="upload-zone" style="padding:20px;" onclick="triggerAssessUpload(\'' + dt.key + '\')">' +
                    '<div class="upload-text"><strong>' + T('common.click_to_upload') + '</strong> ' + esc(dt.label) + '</div>' +
                    '</div>' +
                    '<input type="file" id="assess-file-' + dt.key + '" style="display:none;" ' +
                    'accept=".pdf,.doc,.docx" onchange="handleAssessUpload(event,\'' + dt.key + '\')">'
                ) +
                '</div>';
        }).join('') +

        '</div></div>';
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
    var res = await api('POST', '/api/assessments', {
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
            S.dashboardStats.assessment_score = res.score;
        }
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

    return '<div class="card" style="margin-bottom:24px;">' +
        '<div class="card-body" style="text-align:center;padding:32px;">' +
        '<div style="margin-bottom:16px;">' +
        scoreRingHTML(score, 120, '%') +
        '</div>' +
        '<h2 style="font-size:24px;font-weight:700;margin-bottom:4px;">' + T('assessment.completed_success') + '</h2>' +
        '<p style="font-size:16px;margin-bottom:12px;">Capacity Level: <span class="badge badge-' + cap.color + '" style="font-size:14px;">' + esc(cap.label) + '</span></p>' +
        '</div></div>' +

        (Object.keys(categories).length ? '<div class="card" style="margin-bottom:24px;"><div class="card-body">' +
            '<h3 style="font-weight:600;margin-bottom:16px;">' + T('assessment.category_scores') + '</h3>' +
            Object.keys(categories).map(function(k) {
                var val = categories[k] || 0;
                return '<div style="margin-bottom:12px;">' +
                    '<div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:4px;">' +
                    '<span>' + esc(k.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); })) + '</span>' +
                    '<span style="font-weight:600;">' + val + '%</span></div>' +
                    '<div class="progress" style="height:10px;"><div class="progress-bar ' + scoreColor(val) + '" style="width:' + val + '%"></div></div>' +
                    '</div>';
            }).join('') +
            '</div></div>' : '') +

        (gaps.length ? '<div class="card" style="margin-bottom:24px;"><div class="card-body">' +
            '<h3 style="font-weight:600;margin-bottom:12px;">\u26A0\uFE0F ' + T('assessment.gaps_identified') + '</h3>' +
            '<ul style="list-style:disc;padding-left:20px;">' +
            gaps.map(function(g) { return '<li style="margin-bottom:4px;color:#475569;">' + esc(g) + '</li>'; }).join('') +
            '</ul></div></div>' : '') +

        (recs.length ? '<div class="card"><div class="card-body">' +
            '<h3 style="font-weight:600;margin-bottom:12px;">\uD83D\uDCA1 Recommendations</h3>' +
            '<ul style="list-style:disc;padding-left:20px;">' +
            recs.map(function(r) { return '<li style="margin-bottom:4px;color:#475569;">' + esc(r) + '</li>'; }).join('') +
            '</ul></div></div>' : '');
}

// =============================================================================
// 29. Organization Profile
// =============================================================================

function renderOrgProfile() {
    loadOrgProfile();
    var org = S.selectedOrg || {};

    return '<div class="page-header">' +
        '<h1>\uD83D\uDC64 ' + T('org.title') + '</h1>' +
        '</div>' +

        '<div id="org-profile-content">' +
        '<div class="card" style="margin-bottom:24px;"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">' + T('org.details') + '</h3>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('org.name') + '</label>' +
        '<input type="text" class="form-control" value="' + esc(org.name || S.user.org_name || '') + '" ' +
        'oninput="if(!S.selectedOrg)S.selectedOrg={};S.selectedOrg.name=this.value;">' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('org.country') + '</label>' +
        '<input type="text" class="form-control" value="' + esc(org.country || '') + '" ' +
        'oninput="if(!S.selectedOrg)S.selectedOrg={};S.selectedOrg.country=this.value;">' +
        '</div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('org.year_established') + '</label>' +
        '<input type="number" class="form-control" value="' + esc(org.year_established || '') + '" ' +
        'oninput="if(!S.selectedOrg)S.selectedOrg={};S.selectedOrg.year_established=this.value;">' +
        '</div></div>' +
        '<div class="form-row">' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('org.type') + '</label>' +
        '<select class="form-control" onchange="if(!S.selectedOrg)S.selectedOrg={};S.selectedOrg.type=this.value;">' +
        '<option value="">Select type...</option>' +
        ['NGO', 'CBO', 'INGO', 'Government', 'UN Agency', 'Other'].map(function(t) {
            return '<option value="' + t + '"' + (org.type === t ? ' selected' : '') + '>' + t + '</option>';
        }).join('') +
        '</select>' +
        '</div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('org.annual_budget') + '</label>' +
        '<input type="text" class="form-control" value="' + esc(org.annual_budget || '') + '" placeholder="e.g., $500,000" ' +
        'oninput="if(!S.selectedOrg)S.selectedOrg={};S.selectedOrg.annual_budget=this.value;">' +
        '</div></div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('org.description') + '</label>' +
        '<textarea class="form-control" rows="4" ' +
        'oninput="if(!S.selectedOrg)S.selectedOrg={};S.selectedOrg.description=this.value;">' + esc(org.description || '') + '</textarea>' +
        '</div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('grant.create.sectors') + '</label>' +
        '<input type="text" class="form-control" value="' + esc((org.sectors || []).join(', ')) + '" placeholder="Health, Education, etc." ' +
        'oninput="if(!S.selectedOrg)S.selectedOrg={};S.selectedOrg.sectors_text=this.value;">' +
        '</div>' +
        '<button class="btn btn-primary" onclick="saveOrgProfile()">' + T('org.save_profile') + '</button>' +
        '</div></div>' +

        // Registration Verification Status
        '<div class="card" style="margin-bottom:24px;"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">\u2705 ' + T('verification.title') + '</h3>' +
        '<div id="org-verification-status">' + renderLoadingTable() + '</div>' +
        '</div></div>' +

        // Compliance
        '<div class="card" style="margin-bottom:24px;"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">\uD83D\uDEE1\uFE0F ' + T('compliance.title') + '</h3>' +
        '<div id="org-compliance">' + renderLoadingTable() + '</div>' +
        '</div></div>' +

        // Assessment History
        '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">\uD83D\uDCDD ' + T('assessment.previous_assessments') + '</h3>' +
        '<div id="org-assessments">' + renderLoadingTable() + '</div>' +
        '</div></div>' +
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
                    return '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #f1f5f9;">' +
                        '<span style="font-size:18px;">' + (c.passed ? '\u2705' : '\u274C') + '</span>' +
                        '<div style="flex:1;">' +
                        '<div style="font-weight:500;">' + esc(c.name || c.check) + '</div>' +
                        '<div style="font-size:12px;color:#94a3b8;">' + esc(c.description || '') + '</div>' +
                        '</div>' +
                        statusBadge(c.status || (c.passed ? 'passed' : 'failed')) +
                        '</div>';
                }).join('') :
                '<p style="color:#94a3b8;">No compliance checks available.</p>';
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
    return '<div class="page-header">' +
        '<h1>\uD83D\uDCC4 ' + T('document.title') + '</h1>' +
        '</div>' +

        '<div class="card" style="margin-bottom:24px;"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">' + T('document.upload') + '</h3>' +
        '<div class="form-row" style="margin-bottom:12px;">' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('document.type') + '</label>' +
        '<select class="form-control" id="doc-upload-type">' +
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
        '<div class="upload-zone" onclick="document.getElementById(\'doc-general-upload\').click();">' +
        '<div class="upload-icon">\uD83D\uDCCE</div>' +
        '<div class="upload-text">Drag & drop or <strong>click to browse</strong></div>' +
        '<div style="font-size:12px;color:#94a3b8;margin-top:4px;">PDF, DOC, DOCX, XLS, XLSX (Max 10MB)</div>' +
        '</div>' +
        '<input type="file" id="doc-general-upload" style="display:none;" accept=".pdf,.doc,.docx,.xls,.xlsx" onchange="uploadGeneralDoc(event)">' +
        '</div></div>' +

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
    var res = await api('GET', '/api/documents');
    var el = document.getElementById('my-docs-list');
    if (!el) return;
    if (res && res.documents && res.documents.length) {
        var rows = res.documents.map(function(d) {
            var scoreHTML = d.score ? '<span style="color:' + (d.score >= 70 ? '#16a34a' : d.score >= 50 ? '#d97706' : '#dc2626') + ';font-weight:600;">' + d.score + '%</span>' : '-';
            return '<tr>' +
                '<td style="font-weight:500;">' + esc(d.original_filename) + '</td>' +
                '<td><span class="badge">' + esc(d.doc_type || 'other') + '</span></td>' +
                '<td>' + (d.file_size ? Math.round(d.file_size / 1024) + ' KB' : '-') + '</td>' +
                '<td>' + scoreHTML + '</td>' +
                '<td>' + formatDate(d.uploaded_at) + '</td>' +
                '</tr>';
        }).join('');
        el.innerHTML = '<div class="table-wrapper"><table class="table">' +
            '<thead><tr><th>' + T('document.filename') + '</th><th>' + T('document.type') + '</th><th>' + T('document.size') + '</th><th>' + T('document.ai_score') + '</th><th>' + T('document.uploaded_at') + '</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table></div>';
    } else {
        el.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:32px;color:#94a3b8;">' +
            '<p>\uD83D\uDCC4 Documents you upload will appear here and can be reused across applications.</p></div></div>';
    }
}

// =============================================================================
// 31. Compliance Page (Donor)
// =============================================================================

function renderCompliance() {
    loadComplianceData();
    return '<div class="page-header">' +
        '<h1>\uD83D\uDEE1\uFE0F ' + T('compliance.title') + '</h1>' +
        '</div>' +
        '<div id="compliance-content">' + renderLoadingTable() + '</div>';
}

async function loadComplianceData() {
    if (!S.user.org_id) return;
    var res = await api('GET', '/api/compliance/' + S.user.org_id);
    var el = document.getElementById('compliance-content');
    if (!el) return;
    if (res && res.checks && res.checks.length) {
        el.innerHTML = '<div class="table-wrapper"><table class="table">' +
            '<thead><tr><th>' + T('compliance.check_type') + '</th><th>' + T('grant.create.description') + '</th><th>' + T('application.tab.status') + '</th><th>' + T('common.last_updated') + '</th></tr></thead><tbody>' +
            res.checks.map(function(c) {
                return '<tr><td style="font-weight:500;">' + esc(c.name || c.check) + '</td>' +
                    '<td style="color:#64748b;">' + esc(c.description || '') + '</td>' +
                    '<td>' + (c.passed ? '<span class="badge badge-green">\u2705 Passed</span>' : '<span class="badge badge-red">\u274C Failed</span>') + '</td>' +
                    '<td>' + formatDate(c.updated_at || c.date) + '</td></tr>';
            }).join('') +
            '</tbody></table></div>';
    } else {
        el.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:48px;color:#94a3b8;">' +
            '<p>No compliance data available.</p></div></div>';
    }
}

// =============================================================================
// 32. Organization Search (Donor)
// =============================================================================

function renderOrgSearch() {
    return '<div class="page-header">' +
        '<h1>\uD83D\uDD0D ' + T('org.search_title') + '</h1>' +
        '</div>' +
        '<div class="card" style="margin-bottom:24px;"><div class="card-body">' +
        '<div class="form-group" style="margin:0;">' +
        '<input type="text" class="form-control" placeholder="' + T('org.search_placeholder') + '" ' +
        'id="org-search-input" oninput="searchOrgs(this.value);">' +
        '</div>' +
        '</div></div>' +
        '<div id="org-search-results">' +
        '<div class="card"><div class="card-body" style="text-align:center;padding:48px;color:#94a3b8;">' +
        '<p style="font-size:40px;margin-bottom:12px;">\uD83D\uDD0D</p>' +
        '<p>Enter a search term to find organizations.</p></div></div>' +
        '</div>';
}

var _orgSearchDebounce = null;
function searchOrgs(q) {
    clearTimeout(_orgSearchDebounce);
    _orgSearchDebounce = setTimeout(async function() {
        if (!q || q.length < 2) return;
        var el = document.getElementById('org-search-results');
        if (el) el.innerHTML = renderLoadingTable();
        var res = await api('GET', '/api/applications?search=' + encodeURIComponent(q));
        if (el) {
            if (res && res.applications && res.applications.length) {
                var orgs = {};
                res.applications.forEach(function(a) {
                    if (a.org_name && !orgs[a.org_name]) {
                        orgs[a.org_name] = { name: a.org_name, country: a.country, capacity: a.capacity_score };
                    }
                });
                var orgList = Object.values(orgs);
                el.innerHTML = '<div class="content-grid">' +
                    orgList.map(function(o) {
                        return '<div class="card"><div class="card-body">' +
                            '<h3 style="font-weight:600;">' + esc(o.name) + '</h3>' +
                            '<p style="color:#64748b;margin-top:4px;">\uD83C\uDF10 ' + esc(o.country || 'Unknown') + '</p>' +
                            (o.capacity != null ? '<p style="margin-top:8px;">Capacity: <span class="badge badge-' + scoreColor(o.capacity) + '">' + o.capacity + '%</span></p>' : '') +
                            '</div></div>';
                    }).join('') +
                    '</div>';
            } else {
                el.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:32px;color:#94a3b8;">' +
                    '<p>No organizations found matching "' + esc(q) + '".</p></div></div>';
            }
        }
    }, 400);
}

// =============================================================================
// 33. Reviewer Pages
// =============================================================================

function renderAssignments() {
    loadReviewerAssignments();
    return '<div class="page-header">' +
        '<h1>\uD83D\uDCCB ' + T('review.assignments') + '</h1>' +
        '</div>' +
        '<div id="assignments-list">' + renderLoadingTable() + '</div>';
}

async function loadReviewerAssignments() {
    var res = await api('GET', '/api/reviews');
    if (res && res.reviews) {
        S.reviews = res.reviews;
        var pending = res.reviews.filter(function(r) { return r.status !== 'completed'; });
        var el = document.getElementById('assignments-list');
        if (el) el.innerHTML = renderReviewsTable(pending);
    }
}

function renderCompletedReviews() {
    loadCompletedReviews();
    return '<div class="page-header">' +
        '<h1>\u2705 ' + T('review.completed') + '</h1>' +
        '</div>' +
        '<div id="completed-reviews-list">' + renderLoadingTable() + '</div>';
}

async function loadCompletedReviews() {
    var res = await api('GET', '/api/reviews');
    if (res && res.reviews) {
        var completed = res.reviews.filter(function(r) { return r.status === 'completed'; });
        var el = document.getElementById('completed-reviews-list');
        if (el) {
            if (completed.length) {
                el.innerHTML = '<div class="table-wrapper"><table class="table">' +
                    '<thead><tr><th>Application</th><th>Grant</th><th>Score</th><th>Completed</th></tr></thead><tbody>' +
                    completed.map(function(r) {
                        return '<tr><td style="font-weight:500;">' + esc(r.org_name || r.application_name || '') + '</td>' +
                            '<td>' + esc(r.grant_title || '') + '</td>' +
                            '<td style="font-weight:600;">' + (r.score || 0) + '%</td>' +
                            '<td>' + formatDate(r.completed_at) + '</td></tr>';
                    }).join('') +
                    '</tbody></table></div>';
            } else {
                el.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:32px;color:#94a3b8;">' +
                    '<p>No completed reviews yet.</p></div></div>';
            }
        }
    }
}

async function openReview(reviewId) {
    var res = await api('GET', '/api/reviews');
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
    var res = await api('GET', '/api/reports');
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

    return '<div class="page-header">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div>' +
        '<h1>\uD83D\uDCC8 ' + T('report.title') + '</h1>' +
        '</div>' +
        (isNGO ? '<button class="btn btn-primary" onclick="startNewReport()">+ ' + T('report.submit_new') + '</button>' : '') +
        '</div></div>' +

        // Upcoming/Expected reports section
        '<div id="reports-upcoming" style="margin-bottom:24px;"></div>' +

        '<h3 style="font-size:16px;font-weight:600;margin-bottom:12px;">' + (isNGO ? 'Submitted Reports' : 'All Reports') + '</h3>' +
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

    el.innerHTML = '<div class="card" style="border-left:4px solid ' + (overdueCount > 0 ? '#ef4444' : '#f59e0b') + ';">' +
        '<div class="card-body">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<h3 style="font-weight:600;">' + (isNGO ? '\uD83D\uDCC5 Upcoming Deadlines' : '\uD83D\uDCC5 Expected Reports') + '</h3>' +
        (overdueCount > 0 ? '<span class="badge badge-red">' + overdueCount + ' ' + T('report.overdue').toLowerCase() + '</span>' : '<span class="badge badge-green">' + T('report.all_on_track') + '</span>') +
        '</div>' +
        '<div class="table-wrapper"><table class="table table-hover"><thead><tr>' +
        '<th>Report</th><th>' + (isNGO ? 'Grant' : 'NGO') + '</th><th>Due</th><th>Status</th><th>Action</th>' +
        '</tr></thead><tbody>' +
        reports.map(function(r) {
            var isOverdue = r.is_overdue;
            var daysText = isOverdue ? Math.abs(r.days_until_due) + 'd overdue' : r.days_until_due + 'd left';
            var badgeCls = isOverdue ? 'badge-red' : r.days_until_due <= 7 ? 'badge-amber' : 'badge-outline';
            var statusBadge = r.status === 'not_started' || r.status === 'not_submitted' ? '<span class="badge badge-outline">' + T('common.not_started') + '</span>' :
                '<span class="badge badge-' + (r.status === 'draft' ? 'outline' : r.status === 'submitted' ? 'blue' : 'amber') + '">' + esc(r.status).replace(/_/g, ' ') + '</span>';
            var actionBtn = '';
            if (isNGO) {
                actionBtn = r.draft_report_id ?
                    '<button class="btn btn-primary btn-sm" onclick="editReport(' + r.draft_report_id + ')">Continue</button>' :
                    '<button class="btn btn-primary btn-sm" onclick="startReportForGrant(' + r.grant_id + ',\'' + esc(r.report_type) + '\',\'' + esc(r.reporting_period) + '\')">Start</button>';
            } else {
                actionBtn = r.report_id ?
                    '<button class="btn btn-primary btn-sm" onclick="reviewReport(' + r.report_id + ')">Review</button>' :
                    '<span style="color:#94a3b8;font-size:12px;">Awaiting</span>';
            }
            return '<tr' + (isOverdue ? ' style="background:#fef2f2;"' : '') + '>' +
                '<td><strong>' + esc(r.requirement_title || r.report_type) + '</strong><br><span style="font-size:12px;color:#94a3b8;">' + esc(r.reporting_period) + '</span></td>' +
                '<td>' + esc(isNGO ? (r.grant_title || '') : (r.ngo_org_name || '')) + '</td>' +
                '<td><span class="badge ' + badgeCls + '">' + daysText + '</span></td>' +
                '<td>' + statusBadge + '</td>' +
                '<td>' + actionBtn + '</td></tr>';
        }).join('') +
        '</tbody></table></div>' +
        '</div></div>';
}

function renderReportsList(reports) {
    if (!reports || !reports.length) {
        return '<div class="card" style="padding:32px;text-align:center;">' +
            '<p style="color:#94a3b8;font-size:16px;">' + T('report.no_reports') + '</p>' +
            '</div>';
    }

    var statusColors = {
        'draft': 'badge-outline', 'submitted': 'badge-blue', 'under_review': 'badge-amber',
        'accepted': 'badge-green', 'revision_requested': 'badge-red'
    };

    return '<div class="table-wrapper"><table class="table table-hover"><thead><tr>' +
        '<th>' + T('report.title') + '</th><th>' + T('report.grant') + '</th><th>' + T('report.type') + '</th><th>' + T('report.period') + '</th><th>' + T('application.tab.status') + '</th><th>' + T('common.actions') + '</th>' +
        '</tr></thead><tbody>' +
        reports.map(function(r) {
            var badge = statusColors[r.status] || 'badge-outline';
            var isNGO = (S.user.role || '').toLowerCase() === 'ngo';
            var actionBtn = '';
            if (isNGO && (r.status === 'draft' || r.status === 'revision_requested')) {
                actionBtn = '<button class="btn btn-primary btn-sm" onclick="editReport(' + r.id + ')">Edit</button>';
            } else if (!isNGO && r.status === 'submitted') {
                actionBtn = '<button class="btn btn-primary btn-sm" onclick="reviewReport(' + r.id + ')">Review</button>';
            } else {
                actionBtn = '<button class="btn btn-secondary btn-sm" onclick="viewReport(' + r.id + ')">View</button>';
            }

            return '<tr>' +
                '<td><strong>' + esc(r.title || 'Report #' + r.id) + '</strong></td>' +
                '<td>' + esc(r.grant_title || '') + '</td>' +
                '<td><span class="badge badge-outline">' + esc(r.report_type || '') + '</span></td>' +
                '<td>' + esc(r.reporting_period || '-') + '</td>' +
                '<td><span class="badge ' + badge + '">' + esc(r.status || 'draft').replace(/_/g, ' ') + '</span></td>' +
                '<td>' + actionBtn + '</td></tr>';
        }).join('') +
        '</tbody></table></div>';
}

async function startNewReport() {
    // Get the user's awarded applications/grants
    var res = await api('GET', '/api/applications?status=awarded');
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
        var gRes = await api('GET', '/api/reports');
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
            return '<div class="form-group">' +
                '<label class="form-label">' + esc(s.title) +
                (s.required ? ' <span class="required">*</span>' : ' <span style="color:#94a3b8;">(Optional)</span>') +
                '</label>' +
                '<p style="font-size:12px;color:#94a3b8;margin-bottom:4px;">' + esc(s.description || '') + '</p>' +
                '<textarea class="form-control" rows="4" placeholder="Enter details..." ' +
                'oninput="if(!S.newReport.content)S.newReport.content={};S.newReport.content[\'' + esc(s.title).replace(/'/g, "\\'") + '\']=this.value;">' + esc(val) + '</textarea>' +
                '</div>';
        }).join('');
    } else {
        // Default sections
        var defaultSections = ['Executive Summary', 'Activities and Outputs', 'Progress Against Indicators', 'Financial Summary', 'Challenges and Mitigation', 'Next Steps'];
        contentFields = defaultSections.map(function(s) {
            var val = (r.content && r.content[s]) || '';
            return '<div class="form-group">' +
                '<label class="form-label">' + esc(s) + ' <span class="required">*</span></label>' +
                '<textarea class="form-control" rows="4" placeholder="Enter details for ' + esc(s) + '..." ' +
                'oninput="if(!S.newReport.content)S.newReport.content={};S.newReport.content[\'' + s.replace(/'/g, "\\'") + '\']=this.value;">' + esc(val) + '</textarea>' +
                '</div>';
        }).join('');
    }

    // Reporting requirements info
    var reqsInfo = '';
    if (reqs.length > 0) {
        reqsInfo = '<div class="card" style="margin-bottom:20px;border-left:4px solid #f59e0b;">' +
            '<div class="card-body" style="padding:12px 16px;">' +
            '<h4 style="font-size:14px;font-weight:600;margin-bottom:8px;">\u26A0\uFE0F Reporting Requirements</h4>' +
            reqs.map(function(req) {
                return '<p style="font-size:13px;margin-bottom:4px;"><strong>' + esc(req.title || req.type) + ':</strong> ' + esc(req.description || '') + '</p>';
            }).join('') +
            '</div></div>';
    }

    // Grant selector for new reports (when user has multiple awarded grants)
    var grantSelector = '';
    if (!r.id && S.reportGrants && S.reportGrants.length > 1) {
        grantSelector = '<div class="card" style="margin-bottom:16px;"><div class="card-body" style="padding:12px 16px;">' +
            '<label class="form-label" style="font-weight:600;">' + T('report.select_grant_to_report') + '</label>' +
            '<select class="form-control" onchange="changeReportGrant(this.value);">' +
            S.reportGrants.map(function(a) {
                return '<option value="' + a.grant_id + ':' + a.id + '"' + (r.grant_id == a.grant_id ? ' selected' : '') + '>' +
                    esc(a.grant_title) + '</option>';
            }).join('') +
            '</select></div></div>';
    } else if (S.currentReport && S.currentReport.grant_title) {
        grantSelector = '<div style="margin-bottom:12px;color:#64748b;font-size:13px;">Reporting on: <strong>' + esc(S.currentReport.grant_title) + '</strong></div>';
    }

    return '<button class="btn btn-secondary btn-sm" onclick="nav(\'reports\')" style="margin-bottom:16px;">\u2190 ' + T('common.back') + '</button>' +
        '<div class="page-header"><h1>' + (r.id ? '\u270F\uFE0F ' + T('common.edit') : '\uD83D\uDCDD ' + T('report.submit_new')) + '</h1></div>' +

        grantSelector +
        reqsInfo +

        '<div class="card"><div class="card-body">' +
        '<div class="form-row">' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('report.type') + '</label>' +
        '<select class="form-control" onchange="S.newReport.report_type=this.value;">' +
        reportTypes.map(function(t) { return '<option value="' + t + '"' + (r.report_type === t ? ' selected' : '') + '>' + t.charAt(0).toUpperCase() + t.slice(1) + '</option>'; }).join('') +
        '</select>' +
        '</div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('report.reporting_period') + '</label>' +
        '<input type="text" class="form-control" placeholder="e.g., Q1 2026, Jan-Mar 2026" ' +
        'value="' + esc(r.reporting_period) + '" oninput="S.newReport.reporting_period=this.value;">' +
        '</div>' +
        '</div>' +
        '<div class="form-group">' +
        '<label class="form-label">' + T('report.report_title') + '</label>' +
        '<input type="text" class="form-control" placeholder="e.g., Q1 2026 Progress Report" ' +
        'value="' + esc(r.title) + '" oninput="S.newReport.title=this.value;">' +
        '</div>' +
        '</div></div>' +

        '<div class="card" style="margin-top:16px;"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">' + T('report.content') + '</h3>' +
        '<p style="color:#64748b;font-size:13px;margin-bottom:16px;">Complete each section below. The AI will help format and validate your report.</p>' +
        contentFields +
        '</div></div>' +

        '<div style="display:flex;gap:12px;margin-top:20px;">' +
        '<button class="btn btn-secondary" onclick="saveReportDraft()">' + T('grant.create.save_draft') + '</button>' +
        '<button class="btn btn-primary btn-lg" onclick="submitReport()">\uD83D\uDE80 ' + T('report.submit') + '</button>' +
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
        res = await api('POST', '/api/reports', data);
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
        var saveRes = await api('POST', '/api/reports', data);
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
        return '<div style="margin-bottom:16px;">' +
            '<h4 style="font-size:14px;font-weight:600;color:#334155;">' + esc(key) + '</h4>' +
            '<p style="font-size:14px;color:#475569;white-space:pre-wrap;">' + esc(content[key] || 'Not provided') + '</p>' +
            '</div>';
    }).join('') || '<p style="color:#94a3b8;">No content provided.</p>';

    // AI analysis
    var aiHTML = '';
    var ai = r.ai_analysis;
    if (ai && Object.keys(ai).length > 0) {
        // Per-requirement compliance section
        var reqScoresHTML = '';
        if (ai.requirement_scores && ai.requirement_scores.length > 0) {
            reqScoresHTML = '<div style="margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px;">' +
                '<h4 style="font-size:14px;font-weight:600;margin-bottom:8px;">' + T('application.donor_req_compliance') + '</h4>' +
                ai.requirement_scores.map(function(rs) {
                    var rScore = rs.score || 0;
                    var barColor = rScore >= 70 ? '#2d8f6f' : rScore >= 40 ? '#f59e0b' : '#ef4444';
                    var icon = rs.addressed ? '\u2705' : '\u274C';
                    return '<div style="margin-bottom:10px;padding:8px 12px;background:#f8fafc;border-radius:8px;">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
                        '<span style="font-size:13px;font-weight:500;">' + icon + ' ' + esc(rs.requirement || 'Requirement') + '</span>' +
                        '<span style="font-weight:600;color:' + barColor + ';">' + rScore + '%</span>' +
                        '</div>' +
                        '<div style="height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden;">' +
                        '<div style="height:100%;width:' + rScore + '%;background:' + barColor + ';border-radius:2px;"></div>' +
                        '</div>' +
                        (rs.feedback ? '<p style="font-size:12px;color:#64748b;margin-top:4px;">' + esc(rs.feedback) + '</p>' : '') +
                        '</div>';
                }).join('') +
                '</div>';
        }

        // Risk flags
        var riskHTML = '';
        if (ai.risk_flags && ai.risk_flags.length > 0) {
            riskHTML = '<div style="margin-top:12px;padding:10px 12px;background:#fef2f2;border-radius:8px;border:1px solid #fecaca;">' +
                '<strong style="font-size:13px;color:#dc2626;">\u26A0\uFE0F Risk Flags:</strong>' +
                ai.risk_flags.map(function(rf) { return '<p style="font-size:13px;color:#dc2626;margin:2px 0;">\u2022 ' + esc(rf) + '</p>'; }).join('') +
                '</div>';
        }

        aiHTML = '<div class="card" style="margin-top:16px;border-left:4px solid #2d8f6f;">' +
            '<div class="card-body">' +
            '<h3 style="font-weight:600;margin-bottom:12px;">\u2728 ' + T('report.ai_analysis') + '</h3>' +
            '<div style="display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap;">' +
            '<div style="text-align:center;"><div style="font-size:24px;font-weight:700;color:#2d8f6f;">' + (ai.score || 0) + '</div><div style="font-size:12px;color:#94a3b8;">Overall</div></div>' +
            '<div style="text-align:center;"><div style="font-size:24px;font-weight:700;color:#3b82f6;">' + (ai.completeness_score || 0) + '</div><div style="font-size:12px;color:#94a3b8;">Completeness</div></div>' +
            '<div style="text-align:center;"><div style="font-size:24px;font-weight:700;color:#f59e0b;">' + (ai.quality_score || 0) + '</div><div style="font-size:12px;color:#94a3b8;">Quality</div></div>' +
            (ai.compliance_score != null ? '<div style="text-align:center;"><div style="font-size:24px;font-weight:700;color:#8b5cf6;">' + (ai.compliance_score || 0) + '</div><div style="font-size:12px;color:#94a3b8;">Compliance</div></div>' : '') +
            '</div>' +
            (ai.summary ? '<p style="font-size:14px;color:#334155;margin-bottom:12px;"><strong>Summary:</strong> ' + esc(ai.summary) + '</p>' : '') +
            (ai.findings && ai.findings.length ? '<div style="margin-bottom:8px;"><strong style="font-size:13px;">Findings:</strong>' + ai.findings.map(function(f) { return '<p style="font-size:13px;color:#475569;margin:2px 0;">\u2022 ' + esc(f) + '</p>'; }).join('') + '</div>' : '') +
            (ai.missing_items && ai.missing_items.length ? '<div style="margin-bottom:8px;"><strong style="font-size:13px;color:#ef4444;">Missing:</strong>' + ai.missing_items.map(function(m) { return '<p style="font-size:13px;color:#ef4444;margin:2px 0;">\u2022 ' + esc(m) + '</p>'; }).join('') + '</div>' : '') +
            (ai.recommendations && ai.recommendations.length ? '<div><strong style="font-size:13px;">Recommendations:</strong>' + ai.recommendations.map(function(rec) { return '<p style="font-size:13px;color:#475569;margin:2px 0;">\u2022 ' + esc(rec) + '</p>'; }).join('') + '</div>' : '') +
            reqScoresHTML + riskHTML +
            '</div></div>';
    }

    // Donor review actions
    var reviewActions = '';
    if (canReview) {
        reviewActions = '<div class="card" style="margin-top:16px;border-left:4px solid #f59e0b;">' +
            '<div class="card-body">' +
            '<h3 style="font-weight:600;margin-bottom:12px;">\uD83D\uDD0D Review Actions</h3>' +
            '<div class="form-group">' +
            '<label class="form-label">' + T('report.review_notes') + '</label>' +
            '<textarea class="form-control" rows="3" id="review-notes" placeholder="Add feedback or notes for the grantee..."></textarea>' +
            '</div>' +
            '<div style="display:flex;gap:12px;">' +
            '<button class="btn btn-primary btn-lg" onclick="acceptReport(' + r.id + ')">\u2705 ' + T('report.accept') + '</button>' +
            '<button class="btn btn-secondary" onclick="requestRevision(' + r.id + ')">\u21A9\uFE0F ' + T('report.request_revision') + '</button>' +
            '</div>' +
            '</div></div>';
    }

    // Reviewer notes (if any)
    var notesHTML = '';
    if (r.reviewer_notes) {
        notesHTML = '<div class="card" style="margin-top:16px;border-left:4px solid #3b82f6;">' +
            '<div class="card-body">' +
            '<h4 style="font-weight:600;margin-bottom:8px;">' + T('report.reviewer_notes') + '</h4>' +
            '<p style="color:#475569;">' + esc(r.reviewer_notes) + '</p>' +
            '<p style="font-size:12px;color:#94a3b8;margin-top:4px;">Reviewed: ' + (r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString() : 'N/A') + '</p>' +
            '</div></div>';
    }

    // Donor requirements context (show what was expected)
    var donorReqsHTML = '';
    var donorReqs = r.grant_reporting_requirements || [];
    if (donorReqs.length > 0) {
        donorReqsHTML = '<div class="card" style="margin-top:16px;border-left:4px solid #8b5cf6;">' +
            '<div class="card-body" style="padding:12px 16px;">' +
            '<h4 style="font-size:14px;font-weight:600;margin-bottom:8px;">\uD83D\uDCCB Donor Reporting Requirements</h4>' +
            donorReqs.map(function(req) {
                var isMatch = req.type && r.report_type && req.type.toLowerCase() === r.report_type.toLowerCase();
                return '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px;">' +
                    (isMatch ? '<span style="color:#2d8f6f;">\u2705</span>' : '<span style="color:#94a3b8;">\u25CB</span>') +
                    '<div><strong style="font-size:13px;">' + esc(req.title || req.type) + '</strong>' +
                    (req.frequency ? ' <span style="color:#94a3b8;font-size:12px;">(' + esc(req.frequency) + ')</span>' : '') +
                    '<br><span style="font-size:12px;color:#64748b;">' + esc(req.description || '') + '</span></div></div>';
            }).join('') +
            '</div></div>';
    }

    return '<button class="btn btn-secondary btn-sm" onclick="nav(\'reports\')" style="margin-bottom:16px;">\u2190 ' + T('common.back') + '</button>' +
        '<div class="card"><div class="card-body">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;">' +
        '<div>' +
        '<h2 style="font-weight:600;">' + esc(r.title || 'Report #' + r.id) + '</h2>' +
        '<p style="color:#64748b;">' + esc(r.grant_title || '') + '</p>' +
        '</div>' +
        '<div style="text-align:right;">' +
        '<span class="badge ' + (statusColors[r.status] || 'badge-outline') + '">' + esc(r.status || 'draft').replace(/_/g, ' ') + '</span>' +
        '<p style="font-size:12px;color:#94a3b8;margin-top:4px;">' + esc(r.report_type || '') + ' | ' + esc(r.reporting_period || '') + '</p>' +
        (r.org_name ? '<p style="font-size:12px;color:#94a3b8;">By: ' + esc(r.org_name) + '</p>' : '') +
        '</div>' +
        '</div>' +
        '</div></div>' +

        donorReqsHTML +

        '<div class="card" style="margin-top:16px;"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">' + T('report.content') + '</h3>' +
        contentHTML +
        '</div></div>' +

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
        'verified': { color: 'green', icon: '\u2705', label: T('status.verified') },
        'ai_reviewed': { color: 'blue', icon: '\uD83E\uDD16', label: T('status.ai_reviewed') },
        'pending': { color: 'amber', icon: '\u23F3', label: T('status.pending') },
        'flagged': { color: 'red', icon: '\u26A0\uFE0F', label: T('status.flagged') },
        'expired': { color: 'red', icon: '\u274C', label: T('status.expired') },
        'unverified': { color: 'outline', icon: '\u2753', label: T('status.unverified') },
    };
    var s = map[status] || map['unverified'];
    return '<span class="badge badge-' + s.color + '" role="status">' + s.icon + ' ' + s.label + '</span>';
}

function renderVerificationDashboard() {
    loadVerificationData();
    return '<div class="page-header">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div>' +
        '<h1>\u2705 ' + T('verification.title') + '</h1>' +
        '</div>' +
        '<button class="btn btn-secondary" onclick="loadRegistryDirectory()">\uD83C\uDF10 Government Registries</button>' +
        '</div></div>' +

        // Summary stat cards
        '<div id="verification-stats" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin-bottom:24px;">' +
        renderStatCard('\u2705', T('status.verified'), '-', 'green') +
        renderStatCard('\uD83E\uDD16', T('status.ai_reviewed'), '-', 'blue') +
        renderStatCard('\u23F3', T('status.pending'), '-', 'amber') +
        renderStatCard('\u26A0\uFE0F', T('status.flagged'), '-', 'red') +
        renderStatCard('\u2753', T('status.unverified'), '-', 'outline') +
        '</div>' +

        // Registry directory (hidden by default)
        '<div id="registry-directory" style="display:none;margin-bottom:24px;"></div>' +

        // Main table
        '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">\uD83C\uDFE2 NGO Registration Status</h3>' +
        '<div id="verification-table">' + renderLoadingTable() + '</div>' +
        '</div></div>' +

        // Detail panel (hidden by default)
        '<div id="verification-detail" style="display:none;margin-top:24px;"></div>';
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
            renderStatCard('\u2705', T('status.verified'), counts.verified, 'green') +
            renderStatCard('\uD83E\uDD16', T('status.ai_reviewed'), counts.ai_reviewed, 'blue') +
            renderStatCard('\u23F3', T('status.pending'), counts.pending + counts.expired, 'amber') +
            renderStatCard('\u26A0\uFE0F', T('status.flagged'), counts.flagged, 'red') +
            renderStatCard('\u2753', T('status.unverified'), counts.unverified, 'outline');
    }

    // Render table
    var el = document.getElementById('verification-table');
    if (!el) return;

    var rows = orgs.map(function(o) {
        var regNum = o.registration_number ? esc(o.registration_number) : '<span style="color:#dc2626;">' + T('common.not_provided') + '</span>';
        var registryLink = o.registry_search_url ?
            '<a href="' + esc(o.registry_search_url) + '" target="_blank" style="color:#2563eb;text-decoration:underline;font-size:12px;">Check Registry \u2197</a>' :
            (o.registry_url ? '<a href="' + esc(o.registry_url) + '" target="_blank" style="color:#2563eb;text-decoration:underline;font-size:12px;">Registry \u2197</a>' : '');
        var confidence = o.ai_confidence != null ?
            '<span style="color:' + (o.ai_confidence >= 80 ? '#16a34a' : o.ai_confidence >= 50 ? '#d97706' : '#dc2626') + ';font-weight:600;">' + Math.round(o.ai_confidence) + '%</span>' : '-';
        var actions = '<div style="display:flex;gap:6px;">';
        if (o.verification_status === 'unverified' || o.verification_status === 'pending') {
            actions += '<button class="btn btn-primary btn-sm" onclick="runVerification(' + o.org_id + ')">\uD83D\uDD0D Verify</button>';
        }
        if (o.verification_status === 'ai_reviewed') {
            actions += '<button class="btn btn-primary btn-sm" onclick="confirmVerification(' + o.org_id + ')">\u2705 Confirm</button>';
            actions += '<button class="btn btn-secondary btn-sm" onclick="flagVerification(' + o.org_id + ')">\u26A0\uFE0F Flag</button>';
        }
        if (o.verification_status === 'verified') {
            actions += '<span style="color:#16a34a;font-size:12px;">Verified' + (o.verified_by ? ' by ' + esc(o.verified_by) : '') + '</span>';
        }
        if (o.verification_status === 'flagged' || o.verification_status === 'expired') {
            actions += '<button class="btn btn-secondary btn-sm" onclick="runVerification(' + o.org_id + ')">\uD83D\uDD04 Re-verify</button>';
        }
        actions += '<button class="btn btn-secondary btn-sm" onclick="viewVerificationDetail(' + o.org_id + ')">\uD83D\uDC41\uFE0F</button>';
        actions += '</div>';

        return '<tr>' +
            '<td><strong>' + esc(o.org_name) + '</strong><br><span style="font-size:12px;color:#64748b;">' + esc(o.country || '') + '</span></td>' +
            '<td style="font-family:monospace;font-size:13px;">' + regNum + '</td>' +
            '<td>' + (o.registry_authority ? '<span style="font-size:12px;">' + esc(o.registry_authority) + '</span><br>' : '') + registryLink + '</td>' +
            '<td>' + verificationStatusBadge(o.verification_status) + '</td>' +
            '<td style="text-align:center;">' + confidence + '</td>' +
            '<td>' + actions + '</td></tr>';
    }).join('');

    el.innerHTML = '<div class="table-wrapper"><table class="table">' +
        '<thead><tr>' +
        '<th>' + T('verification.organization') + '</th>' +
        '<th>' + T('verification.reg_number') + '</th>' +
        '<th>' + T('verification.authority') + '</th>' +
        '<th>' + T('application.tab.status') + '</th>' +
        '<th>' + T('verification.ai_confidence') + '</th>' +
        '<th>' + T('common.actions') + '</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>';
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

    var html = '<div class="card"><div class="card-body">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h3 style="font-weight:600;">\uD83D\uDCC4 ' + T('verification.detail_title') + ' ' + esc(res.org_name) + '</h3>' +
        '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'verification-detail\').style.display=\'none\';">\u2715 ' + T('common.close') + '</button>' +
        '</div>';

    // Registration info
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;">';

    // Left: Org Registration Details
    html += '<div>' +
        '<h4 style="font-weight:600;margin-bottom:12px;font-size:14px;color:#475569;">' + T('verification.registration_info') + '</h4>' +
        '<table style="width:100%;font-size:14px;border-collapse:collapse;">' +
        '<tr><td style="padding:6px 12px 6px 0;color:#64748b;width:40%;">' + T('verification.country') + '</td><td style="padding:6px 0;font-weight:500;">' + esc(res.org_country || '-') + '</td></tr>' +
        '<tr><td style="padding:6px 12px 6px 0;color:#64748b;">' + T('verification.reg_number') + '</td><td style="padding:6px 0;font-family:monospace;font-weight:500;">' + esc(res.registration_number || 'Not provided') + '</td></tr>' +
        '<tr><td style="padding:6px 12px 6px 0;color:#64748b;">' + T('application.tab.status') + '</td><td style="padding:6px 0;">' + verificationStatusBadge(res.overall_status) + '</td></tr>';

    if (v) {
        html += '<tr><td style="padding:6px 12px 6px 0;color:#64748b;">' + T('verification.authority') + '</td><td style="padding:6px 0;">' + esc(v.registration_authority || '-') + '</td></tr>';
        if (v.registration_date) html += '<tr><td style="padding:6px 12px 6px 0;color:#64748b;">' + T('verification.registered') + '</td><td style="padding:6px 0;">' + formatDate(v.registration_date) + '</td></tr>';
        if (v.expiry_date) html += '<tr><td style="padding:6px 12px 6px 0;color:#64748b;">' + T('verification.expires') + '</td><td style="padding:6px 0;' + (new Date(v.expiry_date) < new Date() ? 'color:#dc2626;font-weight:600;' : '') + '">' + formatDate(v.expiry_date) + (new Date(v.expiry_date) < new Date() ? ' (' + T('verification.expired_label') + ')' : '') + '</td></tr>';
        html += '<tr><td style="padding:6px 12px 6px 0;color:#64748b;">' + T('verification.ai_confidence') + '</td><td style="padding:6px 0;">' +
            '<span style="color:' + (v.ai_confidence >= 80 ? '#16a34a' : v.ai_confidence >= 50 ? '#d97706' : '#dc2626') + ';font-weight:600;">' + Math.round(v.ai_confidence || 0) + '%</span></td></tr>';
        if (v.verified_by_name) {
            html += '<tr><td style="padding:6px 12px 6px 0;color:#64748b;">' + T('verification.verified_by') + '</td><td style="padding:6px 0;">' + esc(v.verified_by_name) + ' on ' + formatDate(v.verified_at) + '</td></tr>';
        }
    }
    html += '</table></div>';

    // Right: Government Registry Info
    html += '<div>' +
        '<h4 style="font-weight:600;margin-bottom:12px;font-size:14px;color:#475569;">' + T('verification.government_registry') + '</h4>';
    if (reg) {
        html += '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;font-size:14px;">' +
            '<div style="font-weight:600;margin-bottom:8px;">\uD83C\uDFDB\uFE0F ' + esc(reg.authority) + '</div>' +
            '<div style="color:#64748b;margin-bottom:4px;">Expected format: <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:12px;">' + esc(reg.expected_format || 'N/A') + '</code></div>' +
            '<div style="color:#64748b;font-size:13px;margin-bottom:12px;">' + esc(reg.notes || '') + '</div>';
        if (reg.search_url) {
            html += '<a href="' + esc(reg.search_url) + '" target="_blank" class="btn btn-primary btn-sm" style="margin-right:8px;">\uD83D\uDD0D Search Registry Online</a>';
        }
        if (reg.url) {
            html += '<a href="' + esc(reg.url) + '" target="_blank" class="btn btn-secondary btn-sm">\uD83C\uDF10 Registry Website</a>';
        }
        html += '</div>';
    } else {
        html += '<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:16px;font-size:14px;">' +
            '<div style="font-weight:600;margin-bottom:4px;">\u26A0\uFE0F No Registry Data Available</div>' +
            '<div style="color:#64748b;">Government registry information not available for this country. Manual verification required.</div>' +
            '</div>';
    }
    html += '</div></div>';

    // AI Analysis Section
    if (analysis) {
        // Findings
        if (analysis.findings && analysis.findings.length) {
            html += '<div style="margin-bottom:16px;">' +
                '<h4 style="font-weight:600;margin-bottom:8px;font-size:14px;color:#475569;">\uD83E\uDD16 AI Findings</h4>' +
                '<div style="background:#f8fafc;border-radius:8px;padding:16px;">' +
                analysis.findings.map(function(f) {
                    var icon = f.toLowerCase().includes('warning') || f.toLowerCase().includes('expired') || f.toLowerCase().includes('not match') ? '\u26A0\uFE0F' : '\u2139\uFE0F';
                    return '<div style="display:flex;gap:8px;align-items:start;margin-bottom:8px;font-size:14px;">' +
                        '<span>' + icon + '</span><span>' + esc(f) + '</span></div>';
                }).join('') +
                '</div></div>';
        }

        // Validation checks
        if (analysis.validation) {
            var checks = analysis.validation;
            html += '<div style="margin-bottom:16px;">' +
                '<h4 style="font-weight:600;margin-bottom:8px;font-size:14px;color:#475569;">\u2705 Validation Checks</h4>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
            var checkItems = [
                { key: 'name_matches', label: 'Name matches certificate' },
                { key: 'number_format_valid', label: 'Registration number format valid' },
                { key: 'authority_recognized', label: 'Issuing authority recognized' },
                { key: 'is_expired', label: 'Registration not expired', invert: true },
            ];
            checkItems.forEach(function(ci) {
                var val = checks[ci.key];
                if (val === null || val === undefined) {
                    html += '<div style="display:flex;gap:8px;align-items:center;padding:8px;background:#f8fafc;border-radius:6px;font-size:13px;">' +
                        '<span>\u2753</span><span style="color:#64748b;">' + esc(ci.label) + ' - Unknown</span></div>';
                } else {
                    var pass = ci.invert ? !val : val;
                    html += '<div style="display:flex;gap:8px;align-items:center;padding:8px;background:' + (pass ? '#f0fdf4' : '#fef2f2') + ';border-radius:6px;font-size:13px;">' +
                        '<span>' + (pass ? '\u2705' : '\u274C') + '</span><span>' + esc(ci.label) + '</span></div>';
                }
            });
            html += '</div></div>';
        }

        // Recommendations
        if (analysis.recommendations && analysis.recommendations.length) {
            html += '<div style="margin-bottom:16px;">' +
                '<h4 style="font-weight:600;margin-bottom:8px;font-size:14px;color:#475569;">\uD83D\uDCA1 Recommendations</h4>' +
                '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;">' +
                analysis.recommendations.map(function(r) {
                    return '<div style="display:flex;gap:8px;align-items:start;margin-bottom:6px;font-size:14px;">' +
                        '<span>\u27A1\uFE0F</span><span>' + esc(r) + '</span></div>';
                }).join('') +
                '</div></div>';
        }
    }

    // Action buttons
    if (v && v.status !== 'verified') {
        html += '<div style="display:flex;gap:12px;margin-top:16px;padding-top:16px;border-top:1px solid #e2e8f0;">' +
            '<button class="btn btn-primary" onclick="confirmVerificationById(' + v.id + ', ' + orgId + ')">\u2705 Mark as Verified</button>' +
            '<button class="btn btn-secondary" style="background:#fef2f2;color:#dc2626;border-color:#fca5a5;" onclick="flagVerificationById(' + v.id + ', ' + orgId + ')">\u26A0\uFE0F Flag Issue</button>' +
            '<button class="btn btn-secondary" onclick="runVerification(' + orgId + ')">\uD83D\uDD04 Re-run AI Check</button>' +
            '</div>';
    }

    html += '</div></div>';
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
    var html = '<div class="card"><div class="card-body">' +
        '<h3 style="font-weight:600;margin-bottom:16px;">\uD83C\uDF10 Government NGO Registries Directory</h3>' +
        '<p style="color:#64748b;margin-bottom:16px;">Direct links to government registries where you can manually verify NGO registrations. Use these for cross-referencing AI verification results.</p>' +
        '<div class="table-wrapper"><table class="table"><thead><tr>' +
        '<th>' + T('verification.country') + '</th><th>' + T('verification.registration_authority') + '</th><th>' + T('verification.expected_format') + '</th><th>' + T('common.actions') + '</th>' +
        '</tr></thead><tbody>' +
        countries.map(function(c) {
            var r = res.registries[c];
            var links = '';
            if (r.search_url) links += '<a href="' + esc(r.search_url) + '" target="_blank" class="btn btn-primary btn-sm" style="margin-right:4px;">\uD83D\uDD0D Search</a>';
            if (r.url) links += '<a href="' + esc(r.url) + '" target="_blank" class="btn btn-secondary btn-sm">\uD83C\uDF10 Website</a>';
            if (!r.search_url && !r.url) links = '<span style="color:#94a3b8;font-size:12px;">' + T('verification.no_online_portal') + '</span>';
            return '<tr>' +
                '<td style="font-weight:600;">\uD83C\uDFF3\uFE0F ' + esc(c) + '</td>' +
                '<td style="font-size:13px;">' + esc(r.authority) + '<br><span style="font-size:11px;color:#94a3b8;">' + esc(r.notes || '') + '</span></td>' +
                '<td><code style="background:#f1f5f9;padding:2px 8px;border-radius:4px;font-size:12px;">' + esc(r.expected_format || 'N/A') + '</code></td>' +
                '<td>' + links + '</td></tr>';
        }).join('') +
        '</tbody></table></div></div></div>';

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
            '<div style="font-size:10px;color:#94a3b8;margin-top:4px;">' + esc(m.source) + '</div>' : '';
        var content = m.role === 'assistant' ? renderMarkdown(m.content) : esc(m.content);
        return '<div class="ai-bubble ' + (m.role === 'user' ? 'user' : 'assistant') + '">' +
            content + sourceTag + '</div>';
    }).join('');

    if (S.aiLoading) {
        messagesHTML += '<div class="ai-analyzing">' +
            '<div class="dot-pulse"><span></span><span></span><span></span></div>' +
            '<span>' + T('ai.thinking') + '</span></div>';
    }

    if (!S.aiMessages.length) {
        messagesHTML = '<div style="text-align:center;padding:24px;color:#94a3b8;font-size:13px;">' +
            '<p style="font-size:32px;margin-bottom:8px;">\u2728</p>' +
            '<p>' + T('ai.welcome') + '</p>' +
            '</div>';
    }

    return '<div class="ai-panel' + (S.aiPanelOpen ? '' : ' collapsed') + '" id="ai-panel" role="complementary" aria-label="' + T('ai.panel_title') + '">' +
        '<div class="ai-panel-header">' +
        '<h3>\u2728 ' + T('ai.panel_title') + '</h3>' +
        '<button class="ai-panel-close" onclick="toggleAI()" aria-label="Close AI panel">\u00D7</button>' +
        '</div>' +
        '<div class="ai-messages" id="ai-messages">' + messagesHTML + '</div>' +
        '<div class="ai-input">' +
        '<input type="text" id="ai-input-field" placeholder="' + T('ai.placeholder') + '" ' +
        'aria-label="' + T('ai.placeholder') + '" ' +
        'onkeydown="if(event.key===\'Enter\')sendAIMessage();">' +
        '<button onclick="sendAIMessage()">' + T('ai.send') + '</button>' +
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
        var sourceLabel = source === 'claude' ? '\uD83E\uDD16 Claude AI' : '\u2699\uFE0F Rule-based';
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
        return '<div class="ai-bubble ' + (m.role === 'user' ? 'user' : 'assistant') + '">' +
            content + '</div>';
    }).join('');

    if (S.aiLoading) {
        messagesHTML += '<div class="ai-analyzing">' +
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
        '  .form-row { flex-direction: column; }' +
        '  .wizard-steps { flex-wrap: wrap; }' +
        '  .wizard-step .step-label { display: none; }' +
        '  .wizard-connector { width: 24px; }' +
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

    // Check for existing cookie session via server
    try {
        var res = await api('GET', '/api/auth/me');
        if (res && res.user) {
            S.user = res.user;
            S.page = 'dashboard';
            // Load user's saved language preference
            var userLang = res.user.language || 'en';
            if (userLang !== 'en') {
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

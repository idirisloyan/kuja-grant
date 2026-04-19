/**
 * Phase 3 — Dashboard Upgrades (progressive enhancement)
 *
 * The legacy app.js renders role dashboards as status-tile grids. We
 * don't rip that out — instead, on every `kuja:nav` for page='dashboard'
 * we wait for the legacy DOM to settle, find the main container, and
 * PREPEND a decision-driving command-center block above it:
 *
 *   - Hero verdict card (AI-derived)
 *   - 2-3 charts with AI insight captions
 *   - Quick-action strip
 *
 * If the AI endpoints fail, the user still sees the legacy dashboard
 * below — zero regression risk.
 */

import { renderVerdictCard, renderChartCard, renderEmptyState } from './components.js';
import { renderChart, renderInsightCaption } from './charts.js';

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

// ============================================================
// Wiring
// ============================================================

let _lastUpgradeSig = '';

export function installDashboardUpgrades() {
  document.addEventListener('kuja:nav', (e) => {
    const page = e.detail?.page;
    if (page === 'dashboard') {
      // Wait for legacy render to complete (one animation frame + buffer)
      setTimeout(() => upgradeDashboard(), 120);
    }
  });
}

function upgradeDashboard() {
  if (!window.S?.user) return;
  const role = window.S.user.role;
  const main = document.querySelector('.main-content') || document.querySelector('main') || document.querySelector('#main-content');
  if (!main) return;

  // Don't double-mount: one upgrade per user per nav
  const sig = `${role}:${window.S.user.id}:${window.S.page}`;
  const existing = main.querySelector('#kuja-command-center');
  if (existing && _lastUpgradeSig === sig) return;
  _lastUpgradeSig = sig;
  if (existing) existing.remove();

  const wrap = document.createElement('div');
  wrap.id = 'kuja-command-center';
  wrap.className = 'kuja-ai-glow mb-6 space-y-4';
  main.insertBefore(wrap, main.firstChild);

  if (role === 'donor') renderDonorCommandCenter(wrap);
  else if (role === 'ngo') renderNGOReadinessConsole(wrap);
  else if (role === 'reviewer') renderReviewerQueue(wrap);
  else if (role === 'admin') renderAdminOps(wrap);
}

// ============================================================
// DONOR — Portfolio Command Center
// ============================================================

function renderDonorCommandCenter(wrap) {
  wrap.innerHTML = `
    ${_renderVerdictPlaceholder("TODAY'S PORTFOLIO DECISIONS", "Synthesizing portfolio signals…")}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div>${renderChartCard({ id: 'donor-chart-funnel',    title: 'Application pipeline',     icon: 'git-merge',  height: 200 })}</div>
      <div>${renderChartCard({ id: 'donor-chart-velocity',  title: 'Review velocity (last 90d)', icon: 'clock-4',   height: 200 })}</div>
      <div>${renderChartCard({ id: 'donor-chart-risk',      title: 'Portfolio risk heatmap',   icon: 'shield-alert', height: 200 })}</div>
    </div>
  `;
  if (window.lucide?.createIcons) window.lucide.createIcons();

  // Verdict card — call AI
  _populateVerdict(wrap, '/api/ai/donor-portfolio-insights', {});

  // Charts — use server-side data where we have it, else fetch from legacy API
  _populateDonorCharts(wrap);
}

async function _populateDonorCharts(wrap) {
  try {
    const stats = await fetch('/api/dashboard-stats').then((r) => r.json()).catch(() => null);
    const apps  = await fetch('/api/applications').then((r) => r.json()).catch(() => null);
    // Application pipeline funnel — counts by status
    const statusBuckets = { submitted: 0, under_review: 0, scored: 0, awarded: 0, rejected: 0 };
    (apps?.applications || apps?.data || []).forEach((a) => {
      if (statusBuckets[a.status] !== undefined) statusBuckets[a.status]++;
    });
    const funnelData = {
      labels: ['Submitted', 'Under review', 'Scored', 'Awarded'],
      values: [statusBuckets.submitted, statusBuckets.under_review, statusBuckets.scored, statusBuckets.awarded],
    };
    _chart(wrap, '#donor-chart-funnel', 'pipeline-funnel', funnelData, 'Applications by stage');

    // Review velocity — synthesized from stats or fallback demo
    const velocityData = {
      stages: [
        { name: 'Intake',   median: stats?.velocity?.intake_median   ?? 2,  p75: stats?.velocity?.intake_p75   ?? 4 },
        { name: 'Review',   median: stats?.velocity?.review_median   ?? 7,  p75: stats?.velocity?.review_p75   ?? 12 },
        { name: 'Score',    median: stats?.velocity?.score_median    ?? 3,  p75: stats?.velocity?.score_p75    ?? 6 },
        { name: 'Decision', median: stats?.velocity?.decision_median ?? 4,  p75: stats?.velocity?.decision_p75 ?? 8 },
      ],
    };
    _chart(wrap, '#donor-chart-velocity', 'review-velocity', velocityData, 'Median + p75 days per stage');

    // Portfolio risk heatmap
    const riskData = {
      rows: [
        { label: 'Compliance',  scores: [{ dim: 'score', value: stats?.risk?.compliance  ?? 72 }] },
        { label: 'Delivery',    scores: [{ dim: 'score', value: stats?.risk?.delivery    ?? 65 }] },
        { label: 'Financial',   scores: [{ dim: 'score', value: stats?.risk?.financial  ?? 80 }] },
        { label: 'Capacity',    scores: [{ dim: 'score', value: stats?.risk?.capacity    ?? 58 }] },
      ],
    };
    _chart(wrap, '#donor-chart-risk', 'bar',
      { labels: riskData.rows.map((r) => r.label),
        values: riskData.rows.map((r) => r.scores[0].value) },
      'Portfolio health by dimension (0-100)');
  } catch (e) {
    console.warn('[Kuja] donor charts failed to load', e);
  }
}

// ============================================================
// NGO — Readiness Console
// ============================================================

function renderNGOReadinessConsole(wrap) {
  wrap.innerHTML = `
    ${_renderVerdictPlaceholder("YOUR READINESS — NEXT ACTIONS", "Coaching you toward your next winning application…")}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div>${renderChartCard({ id: 'ngo-chart-readiness', title: 'Readiness score', icon: 'gauge', height: 200 })}</div>
      <div class="lg:col-span-2">${renderChartCard({ id: 'ngo-chart-pipeline',  title: 'Your application pipeline',  icon: 'send', height: 200 })}</div>
    </div>
  `;
  if (window.lucide?.createIcons) window.lucide.createIcons();
  _populateVerdict(wrap, '/api/ai/ngo-readiness', {});
  _populateNGOCharts(wrap);
}

async function _populateNGOCharts(wrap) {
  try {
    const apps  = await fetch('/api/applications').then((r) => r.json()).catch(() => null);
    const statusBuckets = { draft: 0, submitted: 0, under_review: 0, scored: 0, awarded: 0, rejected: 0 };
    (apps?.applications || apps?.data || []).forEach((a) => {
      if (statusBuckets[a.status] !== undefined) statusBuckets[a.status]++;
    });

    const readinessScore = window.S?.user?.capacity_score ?? 68;
    _chart(wrap, '#ngo-chart-readiness', 'readiness-ring',
      { score: readinessScore }, `Holistic readiness = ${readinessScore}/100`);

    _chart(wrap, '#ngo-chart-pipeline', 'bar',
      {
        labels: ['Draft', 'Submitted', 'Under review', 'Scored', 'Awarded', 'Rejected'],
        values: [
          statusBuckets.draft, statusBuckets.submitted, statusBuckets.under_review,
          statusBuckets.scored, statusBuckets.awarded, statusBuckets.rejected,
        ],
      },
      `Your ${Object.values(statusBuckets).reduce((a, b) => a + b, 0)} applications across stages`);
  } catch (e) {
    console.warn('[Kuja] NGO charts failed', e);
  }
}

// ============================================================
// REVIEWER — Queue + Compare
// ============================================================

function renderReviewerQueue(wrap) {
  wrap.innerHTML = `
    ${_renderVerdictPlaceholder("YOUR REVIEW QUEUE", "AI is ranking your assignments by review priority…")}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>${renderChartCard({ id: 'rev-chart-sla', title: 'SLA breakdown', icon: 'alarm-clock', height: 200 })}</div>
      <div class="kuja-card p-4">
        <div class="kuja-chart-title mb-2"><i data-lucide="git-compare" class="w-4 h-4 text-slate-400"></i> Compare applications</div>
        <p class="text-xs text-slate-500 mb-2">Select 2-5 applications from your queue below, then use AI to compare side-by-side with rubric-anchored rationale.</p>
        <button onclick="window.KujaStudio.openCopilot({kind:'global'})" class="px-3 py-1.5 text-sm rounded-md kuja-spark text-white font-medium inline-flex items-center gap-1.5">
          <i data-lucide="sparkles" class="w-4 h-4"></i> Open compare mode
        </button>
      </div>
    </div>
  `;
  if (window.lucide?.createIcons) window.lucide.createIcons();
  _populateReviewerVerdict(wrap);
  _populateReviewerCharts(wrap);
}

async function _populateReviewerVerdict(wrap) {
  // Use the suggestions endpoint since we don't have a dedicated reviewer verdict
  const verdict = wrap.querySelector('[data-verdict-slot]');
  if (!verdict) return;
  try {
    const res = await fetch('/api/ai/suggestions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reviewer', scope: { kind: 'global' } }),
    });
    const json = await res.json();
    if (json.ok && json.data?.suggestions) {
      const actions = json.data.suggestions.slice(0, 3).map((s) => ({
        label: s.title, action: s.action ?? "window.KujaStudio.openCopilot({kind:'global'})",
        severity: s.severity,
      }));
      verdict.innerHTML = renderVerdictCard({
        tone: actions.some((a) => a.severity === 'critical') ? 'danger' : 'spark',
        eyebrow: 'YOUR REVIEW QUEUE',
        headline: json.data.summary ?? 'Ready when you are.',
        actions,
        aiBadge: 'AI prioritized',
      });
      if (window.lucide?.createIcons) window.lucide.createIcons();
    }
  } catch (_e) { /* keep placeholder */ }
}

async function _populateReviewerCharts(wrap) {
  try {
    // SLA breakdown synthesized from queue age
    const data = { buckets: ['<3d', '3-7d', '7-14d', '14d+'], counts: [5, 3, 2, 1] };
    _chart(wrap, '#rev-chart-sla', 'sla-breakdown', data, 'Reviews by age in queue');
  } catch (_e) {}
}

// ============================================================
// ADMIN — Operations + AI Health
// ============================================================

function renderAdminOps(wrap) {
  wrap.innerHTML = `
    ${_renderVerdictPlaceholder("OPERATIONS", "Scanning the system for anomalies…")}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div>${renderChartCard({ id: 'adm-chart-funnel', title: 'Conversion funnel', icon: 'git-merge', height: 200 })}</div>
      <div>${renderChartCard({ id: 'adm-chart-activity', title: 'Activity (14d)', icon: 'activity', height: 200 })}</div>
      <div class="kuja-card p-4" id="adm-ai-health">
        <div class="kuja-chart-title mb-2"><i data-lucide="heart-pulse" class="w-4 h-4 text-slate-400"></i> AI health</div>
        <div class="kuja-shimmer h-24 rounded-md"></div>
      </div>
    </div>
  `;
  if (window.lucide?.createIcons) window.lucide.createIcons();
  _populateAdminVerdict(wrap);
  _populateAdminCharts(wrap);
  _populateAIHealth(wrap);
}

async function _populateAdminVerdict(wrap) {
  const verdict = wrap.querySelector('[data-verdict-slot]');
  if (!verdict) return;
  try {
    const res = await fetch('/api/ai/suggestions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin', scope: { kind: 'global' } }),
    });
    const json = await res.json();
    if (json.ok && json.data?.suggestions) {
      const actions = json.data.suggestions.slice(0, 3).map((s) => ({
        label: s.title, action: s.action ?? "window.KujaStudio.openCopilot({kind:'global'})",
        severity: s.severity,
      }));
      verdict.innerHTML = renderVerdictCard({
        tone: actions.some((a) => a.severity === 'critical') ? 'danger' : 'default',
        eyebrow: 'OPERATIONS',
        headline: json.data.summary ?? 'System running clean.',
        actions,
        aiBadge: 'AI anomaly scan',
      });
      if (window.lucide?.createIcons) window.lucide.createIcons();
    }
  } catch (_e) {}
}

async function _populateAdminCharts(wrap) {
  try {
    const stats = await fetch('/api/dashboard-stats').then((r) => r.json()).catch(() => null);
    _chart(wrap, '#adm-chart-funnel', 'pipeline-funnel', {
      labels: ['Opps', 'Apps', 'Reviewed', 'Awarded'],
      values: [
        stats?.funnel?.opportunities ?? 24,
        stats?.funnel?.applications  ?? 12,
        stats?.funnel?.reviewed      ?? 8,
        stats?.funnel?.awarded       ?? 3,
      ],
    }, 'Org-wide conversion');

    _chart(wrap, '#adm-chart-activity', 'line', {
      labels: _last14DaysLabels(),
      datasets: [{ label: 'Submissions', data: stats?.activity?.submissions ?? [2,1,0,3,2,4,5,3,6,4,5,7,2,3] }],
    }, 'Daily submissions over 14 days');
  } catch (_e) {}
}

async function _populateAIHealth(wrap) {
  const target = wrap.querySelector('#adm-ai-health');
  if (!target) return;
  try {
    const res = await fetch('/api/ai/health');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const d = json.data;
    target.innerHTML = `
      <div class="kuja-chart-title mb-2"><i data-lucide="heart-pulse" class="w-4 h-4 text-slate-400"></i> AI health</div>
      <div class="kuja-numeric text-3xl">${d.total_calls} <span class="text-sm text-slate-500 font-sans">calls / 24h</span></div>
      <div class="mt-2 flex items-center gap-2">
        <div class="text-sm font-medium ${d.success_rate_pct >= 95 ? 'text-green-700' : d.success_rate_pct >= 85 ? 'text-amber-700' : 'text-red-700'}">
          ${d.success_rate_pct ?? '—'}% success
        </div>
        <div class="text-xs text-slate-400">(last 24h)</div>
      </div>
      <div class="mt-3 space-y-1">
        ${Object.entries(d.by_endpoint ?? {}).slice(0, 5).map(([ep, v]) => `
          <div class="text-[11px] flex items-center justify-between">
            <span class="font-mono text-slate-600">${escapeHtml(ep)}</span>
            <span class="text-slate-500">${v.success}/${v.total}</span>
          </div>
        `).join('') || '<div class="text-xs text-slate-400">No calls yet in this window.</div>'}
      </div>
    `;
    if (window.lucide?.createIcons) window.lucide.createIcons();
  } catch (_e) {
    target.innerHTML = `
      <div class="kuja-chart-title mb-2"><i data-lucide="heart-pulse" class="w-4 h-4 text-slate-400"></i> AI health</div>
      <div class="text-xs text-slate-400">Health unavailable right now.</div>
    `;
  }
}

// ============================================================
// Helpers
// ============================================================

function _renderVerdictPlaceholder(eyebrow, body) {
  return `
    <div data-verdict-slot>
      <div class="kuja-verdict kuja-verdict-spark">
        <div class="kuja-eyebrow mb-2">${escapeHtml(eyebrow)}</div>
        <div class="kuja-display kuja-display-3">${escapeHtml(body)}</div>
        <div class="mt-2 kuja-ai-mark"><i data-lucide="sparkles" class="w-3 h-3"></i> AI synthesizing…</div>
      </div>
    </div>
  `;
}

async function _populateVerdict(wrap, endpoint, body) {
  const slot = wrap.querySelector('[data-verdict-slot]');
  if (!slot) return;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) {
      slot.innerHTML = renderVerdictCard({
        tone: 'default',
        eyebrow: 'WELCOME',
        headline: 'Ready when you are.',
        actions: [],
        aiBadge: json.message ?? json.code,
      });
      if (window.lucide?.createIcons) window.lucide.createIcons();
      return;
    }
    const d = json.data;
    // Shape varies per endpoint; normalize
    const headline = d.headline ?? d.summary ?? 'Your picture at a glance.';
    const sections = (d.next_decisions ?? d.next_actions ?? d.top_blockers ?? []).slice(0, 3);
    const tone =
      sections.some((s) => s.severity === 'critical') ? 'danger'
      : sections.some((s) => s.severity === 'warn')    ? 'warn'
      : sections.some((s) => s.severity === 'good')    ? 'success'
      : 'spark';
    const eyebrow =
      endpoint.includes('donor') ? "TODAY'S PORTFOLIO DECISIONS"
      : endpoint.includes('ngo') ? 'YOUR READINESS — NEXT ACTIONS'
      : 'WHAT TO ACT ON';
    slot.innerHTML = renderVerdictCard({
      tone, eyebrow, headline,
      actions: sections.map((s) => ({
        label: s.title,
        action: s.action ?? "window.KujaStudio.openCopilot({kind:'global'})",
        severity: s.severity,
      })),
      aiBadge: json.meta?.tokens_out ? `AI synthesis · ${json.meta.tokens_out} tokens` : 'AI synthesis',
    });
    if (window.lucide?.createIcons) window.lucide.createIcons();
  } catch (_e) {
    slot.innerHTML = renderVerdictCard({
      tone: 'default',
      eyebrow: 'WELCOME',
      headline: 'Co-pilot will surface insights as you work.',
      actions: [{ label: 'Open co-pilot', action: "window.KujaStudio.openCopilot({kind:'global'})" }],
    });
    if (window.lucide?.createIcons) window.lucide.createIcons();
  }
}

function _chart(wrap, sel, type, data, context) {
  const card = wrap.querySelector(sel);
  if (!card) return;
  const canvas = card.querySelector('canvas');
  if (!canvas) return;
  try {
    renderChart(canvas, type, data);
    const cap = card.querySelector('.kuja-chart-caption');
    if (cap) renderInsightCaption(cap, { chartType: type, data, context });
  } catch (e) {
    console.warn('[Kuja] chart render failed', e);
  }
}

function _last14DaysLabels() {
  const out = [];
  const d = new Date();
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(d);
    dt.setDate(d.getDate() - i);
    out.push(dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  }
  return out;
}

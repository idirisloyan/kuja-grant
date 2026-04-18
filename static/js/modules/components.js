/**
 * Kuja Studio component primitives.
 *
 * Pure render functions that return HTML strings — designed to slot into
 * the legacy app.js's template-string render pattern without requiring
 * a framework. Each function returns a string the caller injects via
 * .innerHTML or string concatenation.
 *
 * All visual styling comes from kuja-studio.css design tokens.
 */

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

/**
 * Verdict card — the "Decision-driving" hero element. Use at the top of
 * dashboards to surface the most important AI-derived signal.
 *
 * @param {Object} v
 * @param {'spark'|'success'|'warn'|'danger'|'default'} v.tone
 * @param {string} v.eyebrow      // small uppercase label e.g. "TODAY'S DECISIONS"
 * @param {string} v.headline     // big serif sentence
 * @param {Array<{label:string, action:string, severity?:string}>} v.actions
 * @param {string} [v.aiBadge]    // e.g. "AI synthesis · 4 signals"
 */
export function renderVerdictCard({ tone = 'default', eyebrow, headline, actions = [], aiBadge }) {
  const toneClass = tone === 'default' ? '' : `kuja-verdict-${tone}`;
  const actionsHtml = actions.length === 0 ? '' : `
    <div class="mt-4 flex flex-wrap gap-2">
      ${actions.map((a) => `
        <button onclick="${escapeHtml(a.action)}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-white border border-slate-200 hover:border-slate-300 text-slate-800 transition-colors">
          ${a.severity === 'critical' ? '<span class="kuja-severity kuja-severity-critical">!</span>' : ''}
          ${escapeHtml(a.label)}
          <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
        </button>
      `).join('')}
    </div>
  `;

  return `
    <div class="kuja-verdict ${toneClass}">
      ${eyebrow ? `<div class="kuja-eyebrow mb-2">${escapeHtml(eyebrow)}</div>` : ''}
      <div class="kuja-display kuja-display-3">${escapeHtml(headline)}</div>
      ${aiBadge ? `<div class="mt-2 kuja-ai-mark"><i data-lucide="sparkles" class="w-3 h-3"></i> ${escapeHtml(aiBadge)}</div>` : ''}
      ${actionsHtml}
    </div>
  `;
}

/**
 * Empty state — illustrated, with title/body/CTA.
 * Illustrations come from /static/svg/empty-states.svg sprite.
 */
export function renderEmptyState({ illustration = 'grant', title, body, ctaLabel, ctaAction }) {
  const ctaHtml = ctaLabel ? `
    <button onclick="${escapeHtml(ctaAction)}" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium kuja-primary hover:opacity-90 transition-opacity">
      ${escapeHtml(ctaLabel)}
      <i data-lucide="arrow-right" class="w-4 h-4"></i>
    </button>
  ` : '';

  return `
    <div class="kuja-empty">
      <svg class="kuja-empty-illo"><use href="/static/svg/empty-states.svg#illo-${escapeHtml(illustration)}"/></svg>
      <div class="kuja-empty-title">${escapeHtml(title)}</div>
      <div class="kuja-empty-body">${escapeHtml(body)}</div>
      ${ctaHtml}
    </div>
  `;
}

/**
 * Chart card wrapper — gives Chart.js a consistent container with title
 * and AI insight caption slot.
 *
 * Caller does:
 *   container.innerHTML = renderChartCard({id, title, icon: 'trending-up'});
 *   renderChart(container.querySelector('canvas'), data, opts);
 *   renderInsightCaption(container.querySelector('.kuja-chart-caption'), {chartType, data});
 */
export function renderChartCard({ id, title, subtitle = '', icon = 'bar-chart-3', height = 220 }) {
  return `
    <div class="kuja-chart-card" id="${escapeHtml(id)}">
      <div class="kuja-chart-title">
        <i data-lucide="${escapeHtml(icon)}" class="w-4 h-4 text-slate-400"></i>
        ${escapeHtml(title)}
      </div>
      ${subtitle ? `<div class="text-xs text-slate-500 mt-0.5">${escapeHtml(subtitle)}</div>` : ''}
      <div class="kuja-chart-canvas-wrap" style="height:${height}px">
        <canvas></canvas>
      </div>
      <div class="kuja-chart-caption kuja-chart-caption-loading">
        <span class="inline-flex items-center gap-1.5">
          <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
          AI is reading the data…
        </span>
      </div>
    </div>
  `;
}

/**
 * AI pill — small purple badge for surfaces (table cells, list items)
 * to signal "this value comes from AI."
 */
export function renderAIPill(label) {
  return `<span class="kuja-ai-pill"><i data-lucide="sparkles" class="w-3 h-3"></i>${escapeHtml(label)}</span>`;
}

/**
 * Severity pill — for compliance/review surfaces.
 */
export function renderSeverityPill(severity) {
  const variant = ['critical', 'major', 'minor', 'info'].includes(severity) ? severity : 'info';
  return `<span class="kuja-severity kuja-severity-${variant}">${escapeHtml(severity)}</span>`;
}

/**
 * Phase 4 — Trust UX primitives.
 *
 * Small, opt-in components legacy code (or new pages) can mount:
 *   - typedConfirm({ phrase, title, body, onConfirm })
 *       Shows a modal requiring the user to type a specific phrase
 *       before confirm is enabled. For irreversible actions.
 *   - renderAuditTimeline(container, events)
 *       Vertical timeline visual for state-change history.
 *   - renderEvidencePanel(container, { title, severity, requirement, evidence, confidence, actions })
 *       Compliance / review evidence card with severity framing +
 *       decision support buttons.
 */

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

// ============================================================
// Typed confirmation modal
// ============================================================

export function typedConfirm({ phrase = 'CONFIRM', title, body, destructive = false, onConfirm }) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4';
    root.innerHTML = `
      <div class="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div class="p-5 ${destructive ? 'border-b-4 border-red-500' : 'border-b border-slate-100'}">
          <div class="flex items-start gap-3">
            ${destructive ? '<i data-lucide="alert-triangle" class="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"></i>' : '<i data-lucide="shield-check" class="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5"></i>'}
            <div class="flex-1 min-w-0">
              <h3 class="text-lg font-semibold text-slate-900">${escapeHtml(title)}</h3>
              <p class="text-sm text-slate-600 mt-1">${escapeHtml(body)}</p>
            </div>
          </div>
        </div>
        <div class="p-5 space-y-3">
          <label class="text-xs font-medium text-slate-700">
            Type <code class="font-mono bg-slate-100 text-slate-900 px-1.5 py-0.5 rounded">${escapeHtml(phrase)}</code> to confirm
          </label>
          <input id="kuja-typed-confirm" type="text" class="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400" autocomplete="off">
          <div class="flex justify-end gap-2 pt-2">
            <button id="kuja-typed-cancel" class="px-3 py-1.5 text-sm rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700">Cancel</button>
            <button id="kuja-typed-ok" disabled class="px-3 py-1.5 text-sm rounded-md ${destructive ? 'kuja-danger' : 'kuja-primary'} text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed">
              ${destructive ? 'Confirm & apply' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    if (window.lucide?.createIcons) window.lucide.createIcons();

    const input = root.querySelector('#kuja-typed-confirm');
    const ok = root.querySelector('#kuja-typed-ok');
    const cancel = root.querySelector('#kuja-typed-cancel');
    input.focus();
    input.addEventListener('input', () => {
      ok.disabled = input.value.trim() !== phrase;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !ok.disabled) ok.click();
      if (e.key === 'Escape') cancel.click();
    });
    cancel.addEventListener('click', () => { root.remove(); resolve(false); });
    ok.addEventListener('click', async () => {
      ok.disabled = true;
      ok.textContent = 'Working…';
      try {
        if (typeof onConfirm === 'function') await onConfirm();
        resolve(true);
      } catch (e) {
        resolve(false);
      } finally {
        root.remove();
      }
    });
  });
}

// ============================================================
// Audit timeline
// ============================================================

export function renderAuditTimeline(container, events) {
  if (!container) return;
  if (!events || events.length === 0) {
    container.innerHTML = `
      <div class="kuja-empty">
        <svg class="kuja-empty-illo"><use href="/static/svg/empty-states.svg#illo-assessment"/></svg>
        <div class="kuja-empty-title">No activity yet</div>
        <div class="kuja-empty-body">State changes will appear here with full before/after context.</div>
      </div>
    `;
    return;
  }
  container.innerHTML = `
    <ol class="relative border-l-2 border-slate-200 ml-3 space-y-4 pl-5 pt-1">
      ${events.map((e) => {
        const sev = e.severity || 'info';
        const dotColor =
          sev === 'critical' ? 'bg-red-500'
          : sev === 'major' || sev === 'warn' ? 'bg-amber-500'
          : sev === 'good'  ? 'bg-green-600'
          : 'bg-slate-400';
        return `
          <li class="relative">
            <span class="absolute -left-[27px] top-1 w-3 h-3 rounded-full ${dotColor} ring-4 ring-white"></span>
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="text-sm font-semibold text-slate-900">${escapeHtml(e.action || 'Event')}</span>
              ${e.actor ? `<span class="text-xs text-slate-500">by ${escapeHtml(e.actor)}</span>` : ''}
              ${e.timestamp ? `<span class="text-xs text-slate-400">· ${escapeHtml(new Date(e.timestamp).toLocaleString())}</span>` : ''}
            </div>
            ${e.description ? `<p class="text-xs text-slate-600 mt-0.5">${escapeHtml(e.description)}</p>` : ''}
            ${e.ai_tag ? `<div class="mt-1 kuja-ai-mark"><i data-lucide="sparkles" class="w-3 h-3"></i> ${escapeHtml(e.ai_tag)}</div>` : ''}
            ${e.before && e.after ? `
              <div class="mt-1.5 grid grid-cols-2 gap-2 text-[11px]">
                <div class="bg-red-50 border border-red-100 rounded px-2 py-1 text-red-900"><span class="text-[10px] uppercase text-red-600">Before</span><br>${escapeHtml(e.before)}</div>
                <div class="bg-green-50 border border-green-100 rounded px-2 py-1 text-green-900"><span class="text-[10px] uppercase text-green-600">After</span><br>${escapeHtml(e.after)}</div>
              </div>` : ''}
          </li>
        `;
      }).join('')}
    </ol>
  `;
  if (window.lucide?.createIcons) window.lucide.createIcons();
}

// ============================================================
// Evidence panel
// ============================================================

export function renderEvidencePanel(container, {
  title, requirement, evidence, severity = 'info', confidence, source,
  actions = [],
}) {
  if (!container) return;
  const sevClass = ['critical', 'major', 'minor', 'info'].includes(severity) ? severity : 'info';
  container.innerHTML = `
    <div class="kuja-card p-4 space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="kuja-severity kuja-severity-${sevClass}">${escapeHtml(severity)}</span>
            ${confidence !== undefined ? `<span class="text-[10px] text-slate-500">AI confidence ${Math.round((confidence || 0) * 100)}%</span>` : ''}
          </div>
          <div class="text-sm font-semibold text-slate-900">${escapeHtml(title || 'Requirement')}</div>
          ${requirement ? `<div class="text-xs text-slate-600 mt-1">${escapeHtml(requirement)}</div>` : ''}
        </div>
      </div>
      ${evidence ? `
        <div class="bg-slate-50 border border-slate-200 rounded-md p-3">
          <div class="kuja-ai-mark mb-1"><i data-lucide="quote" class="w-3 h-3"></i> Evidence extracted</div>
          <div class="text-xs text-slate-700 whitespace-pre-line leading-relaxed">${escapeHtml(evidence)}</div>
          ${source ? `<div class="text-[10px] text-slate-500 mt-1.5">Source: ${escapeHtml(source)}</div>` : ''}
        </div>
      ` : `
        <div class="text-xs text-slate-400 italic">No evidence extracted yet.</div>
      `}
      ${actions.length > 0 ? `
        <div class="flex gap-2 pt-1 border-t border-slate-100">
          ${actions.map((a) => `
            <button onclick="${escapeHtml(a.action)}"
                    class="px-2.5 py-1.5 text-xs rounded-md border ${a.primary ? 'kuja-primary border-transparent text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-50'} font-medium">
              ${escapeHtml(a.label)}
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
  if (window.lucide?.createIcons) window.lucide.createIcons();
}

// ============================================================
// Expose on window for legacy app.js usage
// ============================================================

if (typeof window !== 'undefined') {
  window.KujaTrust = {
    typedConfirm,
    renderAuditTimeline,
    renderEvidencePanel,
  };
}

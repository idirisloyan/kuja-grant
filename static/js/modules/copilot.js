/**
 * Kuja Co-pilot — persistent right-side AI rail.
 *
 * Replaces the old floating chat panel with a more deliberate surface
 * that combines:
 *   - "Now" tab: AI-suggested next actions for the current page
 *   - "Ask"  tab: streaming chat with thread persistence
 *   - "Insights" tab: narrative summaries of current data
 *
 * Streaming uses Server-Sent Events from /api/ai/chat-stream which yields
 * NDJSON frames matching the contract:
 *   { type: 'sources', items: [...] }
 *   { type: 'delta', text: '...' }
 *   { type: 'done', input_tokens: N, output_tokens: M }
 *   { type: 'error', message: '...' }
 */

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

let _state = {
  open: false,
  collapsed: false,
  activeTab: 'now',
  currentScope: { kind: 'global' },
  threads: [],
  activeThreadId: null,
  inflight: null,           // AbortController for active stream
  suggestions: [],
};

let _root = null;

export function mountCopilot() {
  _root = document.getElementById('kuja-copilot-root');
  if (!_root) return;
  _root.innerHTML = `
    <aside class="kuja-copilot-rail" id="kuja-copilot-rail" aria-label="Kuja AI Co-pilot">
      <button class="kuja-copilot-toggle" id="kuja-copilot-toggle" aria-label="Toggle co-pilot">
        <i data-lucide="sparkles" class="w-5 h-5"></i>
      </button>
      <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div>
          <div class="kuja-eyebrow text-[10px]">Kuja Co-pilot</div>
          <div class="text-sm font-semibold text-slate-900" id="kuja-copilot-scope-label">Global view</div>
        </div>
        <button onclick="window.KujaCopilot.toggleCollapsed()" class="text-slate-400 hover:text-slate-600 p-1" aria-label="Collapse">
          <i data-lucide="chevrons-right" class="w-4 h-4"></i>
        </button>
      </div>
      <div class="kuja-copilot-tabs" role="tablist">
        <button class="kuja-copilot-tab active" data-tab="now" role="tab" aria-selected="true">Now</button>
        <button class="kuja-copilot-tab"        data-tab="ask" role="tab" aria-selected="false">Ask</button>
        <button class="kuja-copilot-tab"        data-tab="insights" role="tab" aria-selected="false">Insights</button>
      </div>
      <div class="kuja-copilot-body" id="kuja-copilot-body"></div>
      <div class="border-t border-slate-100 p-3" id="kuja-copilot-footer"></div>
    </aside>
  `;

  // Bind events
  document.getElementById('kuja-copilot-toggle').addEventListener('click', () => {
    if (_state.collapsed) toggleCollapsed();
    else toggleOpen();
  });
  _root.querySelectorAll('.kuja-copilot-tab').forEach((btn) => {
    btn.addEventListener('click', (e) => switchTab(e.currentTarget.dataset.tab));
  });

  // Initial render
  refreshContent();
  if (window.lucide?.createIcons) window.lucide.createIcons();

  // Public surface for legacy app.js
  window.KujaCopilot = {
    open: openCopilot,
    close: () => {
      _state.open = false;
      document.getElementById('kuja-copilot-rail').classList.remove('open');
    },
    toggleCollapsed,
    refresh: refreshCopilot,
    switchTab,
  };
}

export function refreshCopilot(scope = {}) {
  _state.currentScope = { ...(_state.currentScope || {}), ...scope };
  const labelEl = document.getElementById('kuja-copilot-scope-label');
  if (labelEl) labelEl.textContent = _humanScope(_state.currentScope);
  refreshContent();
}

export function openCopilot(scope = {}) {
  if (scope) refreshCopilot(scope);
  _state.open = true;
  _state.collapsed = false;
  const rail = document.getElementById('kuja-copilot-rail');
  if (rail) {
    rail.classList.add('open');
    rail.classList.remove('collapsed');
  }
}

function toggleOpen() {
  _state.open = !_state.open;
  const rail = document.getElementById('kuja-copilot-rail');
  rail.classList.toggle('open', _state.open);
}

function toggleCollapsed() {
  _state.collapsed = !_state.collapsed;
  const rail = document.getElementById('kuja-copilot-rail');
  rail.classList.toggle('collapsed', _state.collapsed);
  if (_state.collapsed) rail.classList.add('open');
}

function switchTab(tab) {
  _state.activeTab = tab;
  _root.querySelectorAll('.kuja-copilot-tab').forEach((b) => {
    const isActive = b.dataset.tab === tab;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', String(isActive));
  });
  refreshContent();
}

function _humanScope(s) {
  if (!s || s.kind === 'global') return 'Global view';
  if (s.kind === 'grant') return s.title ? `Grant: ${s.title}` : 'This grant';
  if (s.kind === 'application') return 'This application';
  if (s.kind === 'report') return 'This report';
  if (s.kind === 'compliance') return 'Compliance posture';
  if (s.kind === 'review') return 'This review';
  return s.kind || 'Global view';
}

// ===== content rendering per tab =====

function refreshContent() {
  const body = document.getElementById('kuja-copilot-body');
  const footer = document.getElementById('kuja-copilot-footer');
  if (!body) return;
  if (_state.activeTab === 'now') {
    renderNowTab(body, footer);
  } else if (_state.activeTab === 'ask') {
    renderAskTab(body, footer);
  } else if (_state.activeTab === 'insights') {
    renderInsightsTab(body, footer);
  }
  if (window.lucide?.createIcons) window.lucide.createIcons();
}

function renderNowTab(body, footer) {
  body.innerHTML = `
    <div class="kuja-eyebrow mb-2">Suggested actions</div>
    <div id="kuja-copilot-suggestions">
      <div class="space-y-2">
        ${[1,2,3].map(() => `<div class="h-12 rounded-lg kuja-shimmer"></div>`).join('')}
      </div>
    </div>
  `;
  footer.innerHTML = `
    <button onclick="window.KujaCopilot.refresh()" class="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1">
      <i data-lucide="refresh-ccw" class="w-3 h-3"></i> Refresh
    </button>
  `;
  fetchSuggestions().then(renderSuggestions).catch(() => {
    document.getElementById('kuja-copilot-suggestions').innerHTML = `
      <div class="text-xs text-slate-400 p-3 text-center">Couldn't load suggestions right now.</div>
    `;
  });
}

async function fetchSuggestions() {
  const role = window.S?.user?.role ?? 'ngo';
  const res = await fetch('/api/ai/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, scope: _state.currentScope }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.ok ? (json.data?.suggestions ?? []) : [];
}

function renderSuggestions(suggestions) {
  const target = document.getElementById('kuja-copilot-suggestions');
  if (!target) return;
  if (suggestions.length === 0) {
    target.innerHTML = `<div class="text-xs text-slate-400 p-3 text-center">All clear — no actions suggested right now.</div>`;
    return;
  }
  target.innerHTML = `
    <div class="space-y-2">
      ${suggestions.map((s) => `
        <div class="border border-slate-200 rounded-lg p-3 hover:border-purple-300 hover:bg-purple-50/30 transition-colors cursor-pointer" ${s.action ? `onclick="${escapeHtml(s.action)}"` : ''}>
          <div class="flex items-start gap-2">
            <span class="kuja-severity kuja-severity-${escapeHtml(s.severity ?? 'info')} mt-0.5">${escapeHtml(s.severity ?? 'info')}</span>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-slate-900">${escapeHtml(s.title)}</div>
              ${s.detail ? `<div class="text-xs text-slate-500 mt-0.5">${escapeHtml(s.detail)}</div>` : ''}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  if (window.lucide?.createIcons) window.lucide.createIcons();
}

function renderAskTab(body, footer) {
  const messages = (_state.threads.find((t) => t.id === _state.activeThreadId)?.messages) ?? [];
  body.innerHTML = `
    <div id="kuja-copilot-messages" class="space-y-3">
      ${messages.length === 0 ? `
        <div class="text-center py-6">
          <svg style="width:80px;height:80px;display:inline-block"><use href="/static/svg/empty-states.svg#illo-copilot"/></svg>
          <div class="kuja-display kuja-display-3 mt-2">Ask anything about your work</div>
          <div class="text-xs text-slate-500 mt-1 max-w-[260px] mx-auto">
            Co-pilot reads your grants, applications, and policies to ground every answer with citations.
          </div>
        </div>
      ` : messages.map(renderMessage).join('')}
    </div>
  `;
  footer.innerHTML = `
    <form id="kuja-copilot-form" onsubmit="return false" class="flex gap-2">
      <input id="kuja-copilot-input" type="text" placeholder="Ask Co-pilot…" class="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400">
      <button id="kuja-copilot-send" class="px-3 py-2 rounded-md kuja-spark text-white text-sm font-medium inline-flex items-center gap-1">
        <i data-lucide="send" class="w-4 h-4"></i>
      </button>
    </form>
  `;
  document.getElementById('kuja-copilot-form').addEventListener('submit', sendMessage);
  document.getElementById('kuja-copilot-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

function renderMessage(m) {
  const isUser = m.role === 'user';
  return `
    <div class="${isUser ? 'flex justify-end' : ''}">
      <div class="${isUser ? 'bg-purple-600 text-white' : 'bg-slate-50 text-slate-900 border border-slate-200'} rounded-lg px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap">
        ${m.content}
      </div>
    </div>
  `;
}

async function sendMessage() {
  const input = document.getElementById('kuja-copilot-input');
  const question = input.value.trim();
  if (!question) return;
  input.value = '';
  input.disabled = true;

  // Ensure a thread exists
  if (!_state.activeThreadId) {
    _state.activeThreadId = `local-${Date.now()}`;
    _state.threads.push({ id: _state.activeThreadId, messages: [] });
  }
  const thread = _state.threads.find((t) => t.id === _state.activeThreadId);
  thread.messages.push({ role: 'user', content: escapeHtml(question) });
  thread.messages.push({ role: 'assistant', content: '<span class="kuja-pulse">…</span>' });
  refreshContent();

  // Cancel any in-flight stream
  if (_state.inflight) _state.inflight.abort();
  _state.inflight = new AbortController();

  try {
    const res = await fetch('/api/ai/chat-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        scope: _state.currentScope,
        thread_id: _state.activeThreadId.startsWith('local-') ? null : _state.activeThreadId,
      }),
      signal: _state.inflight.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let answerHtml = '';
    let sources = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const frame = JSON.parse(line);
          if (frame.type === 'sources') {
            sources = frame.items ?? [];
            const grounded = sources.length > 0
              ? `<div class="kuja-grounded mb-2"><i data-lucide="check-circle-2" class="w-3 h-3"></i> Grounded in ${sources.length} source${sources.length === 1 ? '' : 's'}</div>`
              : '';
            thread.messages[thread.messages.length - 1].content = grounded + '<span class="kuja-pulse">…</span>';
          } else if (frame.type === 'delta') {
            answerHtml += escapeHtml(frame.text ?? '');
            const grounded = sources.length > 0
              ? `<div class="kuja-grounded mb-2"><i data-lucide="check-circle-2" class="w-3 h-3"></i> Grounded in ${sources.length} source${sources.length === 1 ? '' : 's'}</div>`
              : '';
            thread.messages[thread.messages.length - 1].content = grounded + answerHtml.replace(/\[src:([0-9a-f-]{36})\]/g, (m, id) => {
              const i = sources.findIndex((s) => s.doc_id === id);
              if (i < 0) return '';
              return `<a class="kuja-cite" href="${escapeHtml(sources[i].href ?? '#')}" target="_blank" rel="noreferrer">${i + 1}</a>`;
            });
          } else if (frame.type === 'done') {
            if (frame.thread_id) _state.activeThreadId = frame.thread_id;
          } else if (frame.type === 'error') {
            thread.messages[thread.messages.length - 1].content = `<div class="text-red-600 text-xs">${escapeHtml(frame.message ?? 'Error')}</div>`;
          }
          refreshContent();
        } catch (e) { /* ignore parse errors */ }
      }
    }
  } catch (e) {
    thread.messages[thread.messages.length - 1].content = `<div class="text-red-600 text-xs">Couldn't reach the co-pilot. ${escapeHtml(e.message ?? '')}</div>`;
    refreshContent();
  } finally {
    _state.inflight = null;
    input.disabled = false;
    input.focus();
  }
}

function renderInsightsTab(body, footer) {
  body.innerHTML = `
    <div class="kuja-eyebrow mb-2">Narrative summary</div>
    <div id="kuja-copilot-insights">
      <div class="space-y-2">
        ${[1,2].map(() => `<div class="h-20 rounded-lg kuja-shimmer"></div>`).join('')}
      </div>
    </div>
  `;
  footer.innerHTML = '';
  fetchInsights().then(renderInsights).catch(() => {
    document.getElementById('kuja-copilot-insights').innerHTML = `
      <div class="text-xs text-slate-400 p-3 text-center">Insights unavailable for this view.</div>
    `;
  });
}

async function fetchInsights() {
  const role = window.S?.user?.role ?? 'ngo';
  let endpoint = '/api/ai/insight-narrate';
  if (role === 'donor' && _state.currentScope.kind === 'global') endpoint = '/api/ai/donor-portfolio-insights';
  if (role === 'ngo' && _state.currentScope.kind === 'global') endpoint = '/api/ai/ngo-readiness';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope: _state.currentScope }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.ok ? json.data : null;
}

function renderInsights(data) {
  const target = document.getElementById('kuja-copilot-insights');
  if (!target) return;
  if (!data) {
    target.innerHTML = `<div class="text-xs text-slate-400 p-3 text-center">No insights available.</div>`;
    return;
  }
  // Generic structured render: assumes data = { headline, sections: [{title, body}] }
  const sections = data.sections ?? data.findings ?? data.actions ?? [];
  target.innerHTML = `
    ${data.headline ? `<div class="kuja-display kuja-display-3 mb-3">${escapeHtml(data.headline)}</div>` : ''}
    <div class="space-y-3">
      ${sections.map((s) => `
        <div class="border border-slate-200 rounded-lg p-3">
          ${s.title ? `<div class="text-sm font-semibold text-slate-900 mb-1">${escapeHtml(s.title)}</div>` : ''}
          <div class="text-xs text-slate-700 leading-relaxed">${escapeHtml(s.body ?? s.description ?? '')}</div>
        </div>
      `).join('')}
    </div>
  `;
}

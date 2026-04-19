/**
 * Phase 5 — Role-aware onboarding tour + welcome screens.
 *
 * Triggered on first login per role. State persisted to
 * localStorage (`kuja_onboarded_<role>_<userId>`).
 *
 * Skippable + replayable from the co-pilot settings later.
 */

const TOURS = {
  donor: [
    {
      title: 'Welcome to your portfolio command center',
      body: "Today's portfolio decisions appear at the top of your dashboard — AI surfaces the 3-5 things that actually need your attention this week.",
      anchor: null,
    },
    {
      title: 'Real charts, real insight',
      body: 'Pipeline funnel, review velocity, and portfolio risk — each chart has an AI-written "so what" caption so you can scan a dashboard in 10 seconds, not 10 minutes.',
      anchor: '#donor-chart-funnel',
    },
    {
      title: 'Co-pilot, always available',
      body: "Open the co-pilot rail (sparkle button on the right) to ask anything about your portfolio. Answers are grounded in your actual grants + applications — citations included.",
      anchor: '.kuja-copilot-toggle',
    },
    {
      title: 'Design grants with AI',
      body: "When you create a new grant, Kuja's grant co-pilot suggests eligibility criteria, rubric weights, and reporting requirements based on your goal, thematic, and geography.",
      anchor: null,
    },
  ],
  ngo: [
    {
      title: 'Welcome — let\'s get you funded',
      body: 'Your readiness score at the top of the dashboard is a 0-100 signal of how competitive your next application is likely to be. AI coaches you on what to improve.',
      anchor: null,
    },
    {
      title: 'Coached next actions',
      body: 'The verdict card lists the 3 highest-leverage actions you can take THIS WEEK to move your readiness score up. Each one estimates its impact.',
      anchor: null,
    },
    {
      title: 'Browse grants, apply smart',
      body: "Every grant on the Browse page shows your AI-estimated fit + win probability + what's missing from your file. Focus where you'll win.",
      anchor: null,
    },
    {
      title: 'Co-pilot is your writing partner',
      body: "Stuck on a section? Open the co-pilot rail (sparkle button) and ask 'help me strengthen my theory of change.' Grounded in your own drafts — never generic.",
      anchor: '.kuja-copilot-toggle',
    },
  ],
  reviewer: [
    {
      title: 'Your queue, AI-prioritized',
      body: "Applications in your queue are ranked by review priority — deadline, complexity, and how similar they are to prior high-scoring apps.",
      anchor: null,
    },
    {
      title: 'Compare mode',
      body: 'Select 2-5 applications to compare side-by-side. AI lines up strengths, weaknesses, and flags coordinated submissions (duplicate claims).',
      anchor: null,
    },
    {
      title: 'Justify every score',
      body: "AI pre-fills rationale per rubric criterion from application content. You edit and confirm — much faster than writing from scratch.",
      anchor: null,
    },
  ],
  admin: [
    {
      title: 'Operations at a glance',
      body: "Anomaly stream at the top flags unusual patterns — a spike in declined apps, slow review queues, suspicious verification results.",
      anchor: null,
    },
    {
      title: 'AI health panel',
      body: "Monitor every AI call across the platform — success rate, token usage, per-endpoint breakdowns. Catch regressions before users notice.",
      anchor: '#adm-ai-health',
    },
    {
      title: 'Configure and trust',
      body: "Compliance trust panel, audit timelines, typed confirmation on destructive actions — this is the platform a board would trust to run a fund.",
      anchor: null,
    },
  ],
};

const ILLOS = {
  donor: 'portfolio',
  ngo: 'welcome',
  reviewer: 'review',
  admin: 'assessment',
};

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

export function installOnboarding() {
  // Only run once per user per role
  const user = window.S?.user;
  if (!user) return;
  const key = `kuja_onboarded_${user.role}_${user.id}`;
  if (localStorage.getItem(key) === 'done') return;

  // Defer to give the dashboard time to render
  setTimeout(() => {
    if (window.S.page === 'dashboard') startTour(user.role, key);
  }, 600);

  // Expose a replay hook for settings links
  window.KujaOnboarding = { replay: () => startTour(user.role, null) };
}

function startTour(role, persistKey) {
  const steps = TOURS[role] || TOURS.ngo;
  let idx = 0;
  const overlay = document.createElement('div');
  overlay.className = 'kuja-tour-overlay';
  document.body.appendChild(overlay);

  const tooltip = document.createElement('div');
  tooltip.className = 'kuja-tour-tooltip';
  document.body.appendChild(tooltip);

  function markDone() {
    if (persistKey) {
      try { localStorage.setItem(persistKey, 'done'); } catch (_e) {}
    }
    overlay.remove();
    tooltip.remove();
  }

  function renderStep() {
    const step = steps[idx];
    if (!step) return markDone();
    // Position tooltip — centered by default, near anchor if present
    let top = Math.round(window.innerHeight / 2) - 100;
    let left = Math.round(window.innerWidth / 2) - 160;
    if (step.anchor) {
      const el = document.querySelector(step.anchor);
      if (el) {
        const r = el.getBoundingClientRect();
        top = Math.max(20, r.top - 20);
        left = Math.min(window.innerWidth - 340, Math.max(20, r.left));
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    const illo = ILLOS[window.S?.user?.role] || 'welcome';
    tooltip.innerHTML = `
      <div class="flex items-start gap-3">
        <svg style="width:48px;height:48px;flex-shrink:0">
          <use href="/static/svg/empty-states.svg#illo-${escapeHtml(illo)}"/>
        </svg>
        <div class="flex-1 min-w-0">
          <div class="kuja-tour-tooltip-title">${escapeHtml(step.title)}</div>
          <div class="text-sm text-slate-600 leading-relaxed">${escapeHtml(step.body)}</div>
        </div>
      </div>
      <div class="mt-4 flex items-center justify-between">
        <div class="flex gap-1">
          ${steps.map((_, i) => `<span class="w-1.5 h-1.5 rounded-full ${i === idx ? 'bg-purple-600' : 'bg-slate-300'}"></span>`).join('')}
        </div>
        <div class="flex gap-2">
          <button id="kuja-tour-skip" class="text-xs text-slate-500 hover:text-slate-700 px-2 py-1">Skip</button>
          <button id="kuja-tour-next" class="text-sm font-medium kuja-primary px-3 py-1.5 rounded-md inline-flex items-center gap-1">
            ${idx === steps.length - 1 ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    `;
    tooltip.querySelector('#kuja-tour-skip').addEventListener('click', markDone);
    tooltip.querySelector('#kuja-tour-next').addEventListener('click', () => {
      idx++;
      if (idx >= steps.length) markDone();
      else renderStep();
    });
  }

  renderStep();
}

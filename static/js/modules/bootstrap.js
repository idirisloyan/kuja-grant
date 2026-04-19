/**
 * Kuja modular bootstrap.
 *
 * Layered alongside the existing global `app.js` (~6,200 LOC) so we can
 * progressively migrate features without breaking what works today.
 * Loaded as a real ES module from index.html.
 *
 * Phase 1 responsibilities:
 *   - Initialize design system + observe theme changes
 *   - Mount the AI co-pilot rail once a user is authenticated
 *   - Expose a tiny global `KujaStudio` namespace that legacy app.js code
 *     can call into to render new components (verdict cards, AI captions,
 *     etc.) without itself becoming a module.
 */

import { mountCopilot, refreshCopilot, openCopilot } from './copilot.js';
import { renderVerdictCard, renderEmptyState, renderChartCard, renderAIPill } from './components.js';
import { renderChart, renderInsightCaption } from './charts.js';
import { installDashboardUpgrades } from './dashboard-upgrades.js';
import { installOnboarding } from './onboarding.js';
import { installLanguagePicker } from './language-picker.js';
import './trust-ux.js'; // attaches window.KujaTrust = { typedConfirm, renderAuditTimeline, renderEvidencePanel }

// Wait for the legacy app.js to set window.S (state) before initializing
// modules that depend on auth.
function whenReady(fn) {
  if (window.S && window.S.user !== undefined) return fn();
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if (window.S && window.S.user !== undefined) {
      clearInterval(t);
      fn();
    } else if (tries > 50) {
      clearInterval(t); // give up silently after 5s
    }
  }, 100);
}

whenReady(() => {
  // Mount co-pilot only when there's an authenticated user
  if (window.S.user) {
    mountCopilot();
    installDashboardUpgrades();
    installLanguagePicker();
    installOnboarding();
  }
  // Re-mount on auth changes (login / logout)
  document.addEventListener('kuja:auth-change', () => {
    if (window.S.user) {
      mountCopilot();
      installDashboardUpgrades();
      installLanguagePicker();
      installOnboarding();
    }
  });
  // Page navigation triggers a co-pilot context refresh
  document.addEventListener('kuja:nav', (e) => {
    refreshCopilot(e.detail);
  });
});

// Public surface usable from legacy app.js without imports
window.KujaStudio = {
  renderVerdictCard,
  renderEmptyState,
  renderChartCard,
  renderAIPill,
  renderChart,
  renderInsightCaption,
  openCopilot,
  // Hook for legacy code to broadcast page changes:
  emitNav(page, context) {
    document.dispatchEvent(new CustomEvent('kuja:nav', { detail: { page, ...context } }));
  },
  emitAuth() {
    document.dispatchEvent(new Event('kuja:auth-change'));
  },
};

console.info('[Kuja Studio] modular runtime initialized');

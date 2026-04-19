/**
 * Phase 5 — Multilingual signature treatment.
 *
 * Kuja already has 6 translation files (en/fr/ar/sw/so/es) but the legacy
 * header dropdown only exposed 4. This module:
 *   - Surfaces all 6 with native language names + region flags
 *   - Replaces the legacy dropdown with a prominent pill-shaped picker
 *   - Broadcasts language change via the existing setLanguage() global
 *   - Handles RTL for Arabic
 *
 * Lives alongside the legacy dropdown until removed — overlays the
 * header-language-selector slot on page render.
 */

const LANGS = [
  { code: 'en', native: 'English',   flag: '🇬🇧' },
  { code: 'fr', native: 'Français',  flag: '🇫🇷' },
  { code: 'ar', native: 'العربية',    flag: '🇸🇦', dir: 'rtl' },
  { code: 'sw', native: 'Kiswahili', flag: '🇰🇪' },
  { code: 'so', native: 'Soomaali',  flag: '🇸🇴' },
  { code: 'es', native: 'Español',   flag: '🇪🇸' },
];

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

export function installLanguagePicker() {
  // Re-run on every nav in case the header was re-rendered
  document.addEventListener('kuja:nav', () => setTimeout(tryMount, 60));
  setTimeout(tryMount, 200); // initial mount after bootstrap
}

function tryMount() {
  // Find the legacy language-selector wrapper in the header
  const existingSelect = document.querySelector('#header-language-selector, #lang-selector, select[onchange*="setLanguage"]');
  if (!existingSelect) return;
  // Don't re-mount if already replaced
  if (existingSelect.closest('.kuja-langpicker-host')) return;

  const host = document.createElement('div');
  host.className = 'kuja-langpicker-host relative inline-block';
  existingSelect.insertAdjacentElement('afterend', host);
  // Hide the legacy select but keep it in the DOM in case legacy code reads from it
  existingSelect.style.display = 'none';

  const current = (window._currentLang || localStorage.getItem('kuja_lang') || 'en').toLowerCase();
  renderPicker(host, current);
}

function renderPicker(host, current) {
  const cur = LANGS.find((l) => l.code === current) || LANGS[0];
  host.innerHTML = `
    <button type="button" class="kuja-langpicker-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-slate-200 bg-white hover:border-slate-300 text-sm text-slate-700 transition-colors"
            aria-haspopup="listbox" aria-expanded="false">
      <span style="font-size:14px">${cur.flag}</span>
      <span class="font-medium">${escapeHtml(cur.native)}</span>
      <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400"></i>
    </button>
    <div class="kuja-langpicker-menu hidden absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden" role="listbox">
      <div class="px-3 py-2 border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
        Language
      </div>
      ${LANGS.map((l) => `
        <button type="button" data-lang="${l.code}" role="option"
                class="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2 ${l.code === cur.code ? 'bg-purple-50 text-purple-800' : 'text-slate-700'}">
          <span style="font-size:14px">${l.flag}</span>
          <span class="flex-1">
            <span class="font-medium">${escapeHtml(l.native)}</span>
            <span class="text-[10px] text-slate-400 uppercase ml-1.5">${l.code}</span>
          </span>
          ${l.code === cur.code ? '<i data-lucide="check" class="w-3.5 h-3.5 text-purple-700"></i>' : ''}
        </button>
      `).join('')}
      <div class="px-3 py-2 border-t border-slate-100 text-[11px] text-slate-500">
        AI responses use your selected language.
      </div>
    </div>
  `;
  if (window.lucide?.createIcons) window.lucide.createIcons();

  const btn = host.querySelector('.kuja-langpicker-btn');
  const menu = host.querySelector('.kuja-langpicker-menu');
  btn.addEventListener('click', () => {
    const open = !menu.classList.contains('hidden');
    menu.classList.toggle('hidden', open);
    btn.setAttribute('aria-expanded', String(!open));
  });
  document.addEventListener('click', (e) => {
    if (!host.contains(e.target)) menu.classList.add('hidden');
  });
  host.querySelectorAll('[data-lang]').forEach((b) => {
    b.addEventListener('click', () => {
      const code = b.getAttribute('data-lang');
      menu.classList.add('hidden');
      if (typeof window.setLanguage === 'function') {
        window.setLanguage(code);
      } else {
        // Fallback: persist + reload so legacy loadTranslations picks it up
        try { localStorage.setItem('kuja_lang', code); } catch (_e) {}
        window.location.reload();
      }
    });
  });
}

// ============================================================================
// Kuja Grant Management System - UI Store (Zustand)
// Manages ephemeral UI state: sidebar collapse, AI panel visibility, etc.
// ============================================================================

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface UIState {
  /** Whether the sidebar is collapsed to icon-only mode. */
  sidebarCollapsed: boolean;

  /** Whether the mobile sidebar overlay is open. */
  sidebarMobileOpen: boolean;

  /** Whether the AI assistant side-panel is open. */
  aiPanelOpen: boolean;

  /** Phase 4 — low-bandwidth mode: defer AI auto-calls, suppress chart
   *  caption auto-fetch, omit non-essential illustrations. Persists. */
  lowBandwidth: boolean;

  /** An explicit UI-language choice that overrides the tenant default and,
   *  when set, the signed-in user's stored preference. Persists. Lets a user
   *  read the login / change-password screen in a language they understand
   *  BEFORE (or without) authenticating — e.g. an English reader on the
   *  Arabic-default Proximate login. null = follow the normal precedence. */
  langOverride: string | null;

  /** Set (or clear, with null) the explicit UI-language override + persist. */
  setLangOverride: (lang: string | null) => void;

  /** Toggle the sidebar between expanded and collapsed. */
  toggleSidebar: () => void;

  /** Toggle the mobile sidebar overlay open/closed. */
  toggleMobileSidebar: () => void;

  /** Imperatively set the mobile sidebar state. */
  setMobileSidebarOpen: (open: boolean) => void;

  /** Toggle the AI assistant panel open/closed. */
  toggleAIPanel: () => void;

  /** Imperatively set the AI panel state. */
  setAIPanel: (open: boolean) => void;

  /** Toggle low-bandwidth mode + persist to localStorage. */
  toggleLowBandwidth: () => void;

  /** Whether QA/UAT/fixture records are shown in registers. ONE flag for
   *  every module (rounds, grants, partners, messages, disbursements) so
   *  "Show test data" means the same thing everywhere and survives
   *  navigation — the 2 Sep QA round found three independent, unpersisted
   *  per-page toggles and two registers with no separation at all
   *  (PFX-SEP02-GLOBAL-004). Classification itself lives in
   *  lib/test-records.ts. Persists. */
  showTestData: boolean;

  /** Toggle test-data visibility + persist to localStorage. */
  toggleShowTestData: () => void;
}

const TEST_DATA_KEY = 'kuja.showTestData';
function readShowTestData(): boolean {
  if (typeof window === 'undefined') return false;
  try { return localStorage.getItem(TEST_DATA_KEY) === '1'; } catch { return false; }
}
function writeShowTestData(value: boolean) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(TEST_DATA_KEY, value ? '1' : '0'); } catch { /* ignore */ }
}

// Read the persisted low-bandwidth preference on initial state setup
function readLowBandwidth(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem('kuja.lowBandwidth') === '1';
  } catch { return false; }
}

function writeLowBandwidth(value: boolean) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem('kuja.lowBandwidth', value ? '1' : '0'); } catch { /* ignore */ }
}

const LANG_KEY = 'kuja_lang_override';
function readLangOverride(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(LANG_KEY) || null; } catch { return null; }
}
function writeLangOverride(value: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (value) localStorage.setItem(LANG_KEY, value);
    else localStorage.removeItem(LANG_KEY);
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  sidebarMobileOpen: false,
  aiPanelOpen: false,
  lowBandwidth: readLowBandwidth(),
  langOverride: readLangOverride(),
  showTestData: readShowTestData(),

  toggleShowTestData: () =>
    set((s) => {
      const next = !s.showTestData;
      writeShowTestData(next);
      return { showTestData: next };
    }),

  setLangOverride: (lang) => {
    writeLangOverride(lang);
    set({ langOverride: lang });
  },

  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  toggleMobileSidebar: () =>
    set((s) => ({ sidebarMobileOpen: !s.sidebarMobileOpen })),

  setMobileSidebarOpen: (open) =>
    set({ sidebarMobileOpen: open }),

  toggleAIPanel: () =>
    set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),

  setAIPanel: (open) =>
    set({ aiPanelOpen: open }),

  toggleLowBandwidth: () =>
    set((s) => {
      const next = !s.lowBandwidth;
      writeLowBandwidth(next);
      return { lowBandwidth: next };
    }),
}));

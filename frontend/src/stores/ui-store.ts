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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  sidebarMobileOpen: false,
  aiPanelOpen: false,
  lowBandwidth: readLowBandwidth(),

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

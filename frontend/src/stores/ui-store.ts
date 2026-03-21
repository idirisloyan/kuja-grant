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
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  sidebarMobileOpen: false,
  aiPanelOpen: false,

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
}));

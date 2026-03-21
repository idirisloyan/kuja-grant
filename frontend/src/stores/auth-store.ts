// ============================================================================
// Kuja Grant Management System - Auth Store (Zustand)
// Manages current user state, login / logout, and language preference.
// ============================================================================

import { create } from 'zustand';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface AuthState {
  /** The currently authenticated user, or null when logged out / unknown. */
  user: User | null;

  /** True while the initial session check is in flight. */
  loading: boolean;

  /** Attempt to log in. Returns true on success. */
  login: (email: string, password: string) => Promise<boolean>;

  /** Log the user out and clear local state. */
  logout: () => Promise<void>;

  /** Hit /auth/me to restore a session (e.g. on app mount). */
  checkSession: () => Promise<void>;

  /** Persist the user's preferred language to the backend. */
  setLanguage: (lang: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  login: async (email, password) => {
    try {
      const res = await api.post<{ success: boolean; user: User }>(
        '/auth/login',
        { email, password },
      );
      if (res.success && res.user) {
        set({ user: res.user });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      set({ user: null });
    }
  },

  checkSession: async () => {
    try {
      const res = await api.get<{ user: User }>('/auth/me');
      set({ user: res.user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  setLanguage: async (lang) => {
    await api.put('/auth/language', { language: lang });
    set((state) => ({
      user: state.user ? { ...state.user, language: lang } : null,
    }));
  },
}));

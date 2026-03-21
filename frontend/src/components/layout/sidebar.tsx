'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import {
  LayoutDashboard, ClipboardCheck, Search, FileText, BarChart3, Building2,
  PlusCircle, Briefcase, Star, Shield, CheckCircle2, ClipboardList,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserRole } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
}

// ---------------------------------------------------------------------------
// Nav config per role
// ---------------------------------------------------------------------------

const navItems: Record<UserRole, NavItem[]> = {
  ngo: [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: ClipboardCheck, label: 'Assessment Hub', href: '/assessments' },
    { icon: Search, label: 'Browse Grants', href: '/grants' },
    { icon: FileText, label: 'My Applications', href: '/applications' },
    { icon: BarChart3, label: 'Reports', href: '/reports' },
    { icon: Building2, label: 'Org Profile', href: '/organizations/profile' },
  ],
  donor: [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: PlusCircle, label: 'Create Grant', href: '/grants/new' },
    { icon: Briefcase, label: 'My Grants', href: '/grants' },
    { icon: Star, label: 'Review Applications', href: '/reviews' },
    { icon: BarChart3, label: 'Grant Reports', href: '/reports' },
    { icon: Shield, label: 'Compliance', href: '/compliance' },
    { icon: Search, label: 'Org Search', href: '/organizations/search' },
    { icon: CheckCircle2, label: 'Registration', href: '/verification' },
  ],
  reviewer: [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: ClipboardList, label: 'My Assignments', href: '/reviews' },
    { icon: CheckCircle2, label: 'Completed', href: '/reviews/completed' },
  ],
  admin: [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Briefcase, label: 'All Grants', href: '/grants' },
    { icon: FileText, label: 'All Applications', href: '/applications' },
    { icon: Search, label: 'Org Search', href: '/organizations/search' },
    { icon: CheckCircle2, label: 'Registration', href: '/verification' },
    { icon: Shield, label: 'Compliance', href: '/compliance' },
  ],
};

// ---------------------------------------------------------------------------
// Sidebar Component
// ---------------------------------------------------------------------------

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const role = user?.role || 'ngo';
  const items = navItems[role] || navItems.ngo;

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 bottom-0 z-40 flex flex-col bg-white border-r border-slate-200 transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'flex items-center h-14 px-4 border-b border-slate-100',
          sidebarCollapsed ? 'justify-center' : 'gap-3'
        )}
      >
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-sm">K</span>
        </div>
        {!sidebarCollapsed && (
          <span className="font-semibold text-sm text-slate-900">Kuja</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const isActive =
              pathname === item.href ||
              pathname?.startsWith(item.href + '/');

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    isActive
                      ? 'bg-brand-50 text-brand-600 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50',
                    sidebarCollapsed && 'justify-center px-2'
                  )}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <item.icon
                    className={cn(
                      'w-4 h-4 shrink-0',
                      isActive ? 'text-brand-600' : 'text-slate-400'
                    )}
                  />
                  {!sidebarCollapsed && (
                    <span className="truncate">{item.label}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse Toggle */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-10 border-t border-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
      >
        {sidebarCollapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>
    </aside>
  );
}

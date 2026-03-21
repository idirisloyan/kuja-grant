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

interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
}

const navItems: Record<UserRole, NavItem[]> = {
  ngo: [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: ClipboardCheck, label: 'Assessment Hub', href: '/assessments' },
    { icon: Search, label: 'Browse Grants', href: '/grants' },
    { icon: FileText, label: 'My Applications', href: '/applications' },
    { icon: BarChart3, label: 'Reporting & Compliance', href: '/reports' },
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
    { icon: CheckCircle2, label: 'Registration Checks', href: '/verification' },
  ],
  reviewer: [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: ClipboardList, label: 'My Assignments', href: '/reviews' },
    { icon: CheckCircle2, label: 'Completed Reviews', href: '/reviews/completed' },
  ],
  admin: [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Briefcase, label: 'All Grants', href: '/grants' },
    { icon: FileText, label: 'All Applications', href: '/applications' },
    { icon: Search, label: 'Org Search', href: '/organizations/search' },
    { icon: CheckCircle2, label: 'Registration Checks', href: '/verification' },
    { icon: Shield, label: 'Compliance', href: '/compliance' },
  ],
};

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const role = user?.role || 'ngo';
  const items = navItems[role] || navItems.ngo;

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 bottom-0 z-40 flex flex-col bg-slate-900 text-white transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center h-16 px-4', sidebarCollapsed ? 'justify-center' : 'gap-3')}>
        <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-sm">K</span>
        </div>
        {!sidebarCollapsed && (
          <span className="font-semibold text-sm truncate">Kuja Grant</span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto">
        {!sidebarCollapsed && (
          <p className="px-3 mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Navigation
          </p>
        )}
        <ul className="space-y-1">
          {items.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/25'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800',
                    sidebarCollapsed && 'justify-center px-0'
                  )}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  {isActive && !sidebarCollapsed && (
                    <span className="ml-auto w-1.5 h-1.5 bg-white rounded-full" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-12 border-t border-slate-800 text-slate-500 hover:text-white transition-colors"
      >
        {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
}

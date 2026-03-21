'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUIStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';

import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

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

interface SidebarProps {
  width: number;
  collapsedWidth: number;
}

export function Sidebar({ width, collapsedWidth }: SidebarProps) {
  const pathname = usePathname();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const { sidebarCollapsed, toggleSidebar, sidebarMobileOpen, setMobileSidebarOpen } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const role = user?.role || 'ngo';
  const items = navItems[role] || navItems.ngo;

  const currentWidth = sidebarCollapsed ? collapsedWidth : width;

  const drawerContent = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          height: 64,
          px: sidebarCollapsed ? 0 : 2.5,
          justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
          gap: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            bgcolor: 'primary.main',
            borderRadius: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>K</Typography>
        </Box>
        {!sidebarCollapsed && (
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary', fontSize: '1rem' }}>
            Kuja
          </Typography>
        )}
      </Box>

      {/* Navigation */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 1.5, py: 2 }}>
        <List disablePadding>
          {items.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            const Icon = item.icon;

            const button = (
              <ListItem key={item.href} disablePadding sx={{ mb: 0.25 }}>
                <ListItemButton
                  component={Link}
                  href={item.href}
                  selected={isActive}
                  onClick={() => isMobile && setMobileSidebarOpen(false)}
                  sx={{
                    minHeight: 42,
                    px: sidebarCollapsed ? 0 : 2,
                    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                    borderRadius: 1.5,
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: sidebarCollapsed ? 0 : 36,
                      justifyContent: 'center',
                      color: isActive ? 'primary.main' : 'text.secondary',
                    }}
                  >
                    <Icon size={18} />
                  </ListItemIcon>
                  {!sidebarCollapsed && (
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{
                        fontSize: '0.8125rem',
                        fontWeight: isActive ? 600 : 400,
                      }}
                    />
                  )}
                </ListItemButton>
              </ListItem>
            );

            if (sidebarCollapsed) {
              return (
                <Tooltip key={item.href} title={item.label} placement="right" arrow>
                  {button}
                </Tooltip>
              );
            }
            return button;
          })}
        </List>
      </Box>

      {/* Collapse Toggle */}
      <Divider />
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
        <IconButton
          onClick={toggleSidebar}
          size="small"
          sx={{
            color: 'text.secondary',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </IconButton>
      </Box>
    </Box>
  );

  // Mobile: temporary drawer
  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={sidebarMobileOpen}
        onClose={() => setMobileSidebarOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          '& .MuiDrawer-paper': {
            width: width,
            boxSizing: 'border-box',
          },
        }}
      >
        {drawerContent}
      </Drawer>
    );
  }

  // Desktop: permanent drawer
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: currentWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: currentWidth,
          boxSizing: 'border-box',
          transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          overflowX: 'hidden',
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
}

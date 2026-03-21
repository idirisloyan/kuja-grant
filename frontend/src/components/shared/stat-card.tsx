'use client';

import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Color mapping
// ---------------------------------------------------------------------------

const colorMap: Record<string, { bg: string; fg: string }> = {
  brand:   { bg: '#EEF2FF', fg: '#4F46E5' },
  emerald: { bg: '#ECFDF5', fg: '#059669' },
  amber:   { bg: '#FFFBEB', fg: '#D97706' },
  rose:    { bg: '#FFF1F2', fg: '#E11D48' },
  blue:    { bg: '#EFF6FF', fg: '#2563EB' },
  violet:  { bg: '#F5F3FF', fg: '#7C3AED' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  color?: 'brand' | 'emerald' | 'amber' | 'rose' | 'blue' | 'violet';
  trend?: { value: string; positive: boolean };
  className?: string;
  sx?: SxProps<Theme>;
}

export function StatCard({ icon: Icon, label, value, color = 'brand', trend, className, sx }: StatCardProps) {
  const colors = colorMap[color] || colorMap.brand;

  return (
    <Card
      className={className}
      sx={{
        transition: 'box-shadow 0.2s ease',
        '&:hover': {
          boxShadow: 3,
        },
        ...sx,
      }}
    >
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Avatar
            variant="rounded"
            sx={{
              width: 44,
              height: 44,
              bgcolor: colors.bg,
              color: colors.fg,
              borderRadius: 1.5,
            }}
          >
            <Icon size={20} />
          </Avatar>
          {trend && (
            <Box
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: 5,
                bgcolor: trend.positive ? '#ECFDF5' : '#FFF1F2',
                color: trend.positive ? '#059669' : '#E11D48',
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem' }}>
                {trend.positive ? '\u2191' : '\u2193'} {trend.value}
              </Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ mt: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary' }}>
            {value}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
            {label}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

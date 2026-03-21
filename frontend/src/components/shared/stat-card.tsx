'use client';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  color?: 'brand' | 'emerald' | 'amber' | 'rose' | 'blue' | 'violet';
  trend?: { value: string; positive: boolean };
  className?: string;
}

const colorMap = {
  brand: 'bg-brand-100 text-brand-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
  rose: 'bg-rose-100 text-rose-600',
  blue: 'bg-blue-100 text-blue-600',
  violet: 'bg-violet-100 text-violet-600',
};

export function StatCard({ icon: Icon, label, value, color = 'brand', trend, className }: StatCardProps) {
  return (
    <Card className={cn('p-5 hover:shadow-md transition-shadow', className)}>
      <div className="flex items-start justify-between">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', colorMap[color])}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',
            trend.positive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
          )}>
            {trend.positive ? '↑' : '↓'} {trend.value}
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500 mt-0.5">{label}</p>
      </div>
    </Card>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Compass } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  streak: 'weak' | 'strong' | null;
  count?: number;
}

export function BandStreakTip() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-band-streak').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || !data.streak) return null;
  const isWeak = data.streak === 'weak';

  return (
    <div className={`rounded-md border p-3 text-xs flex items-start gap-2 ${
      isWeak ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-sky-200 bg-sky-50 text-sky-900'
    }`}>
      <Compass className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>
        {isWeak
          ? 'Your last 5 reviews all scored under 60. Worth a calibration check — is the rubric still fitting these apps?'
          : 'Your last 5 reviews all scored 80+. Consider whether high signal applications are bunching, or whether scoring needs recalibration.'}
      </span>
    </div>
  );
}

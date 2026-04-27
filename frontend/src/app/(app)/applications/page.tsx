'use client';

/**
 * Applications list — shadcn + Tailwind.
 */

import { useRouter } from 'next/navigation';
import { useApplications } from '@/lib/hooks/use-api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { StatusBadge } from '@/components/shared/status-badge';
import { ScoreRing } from '@/components/shared/score-ring';

import { FileText, Eye, ArrowRight, Inbox } from 'lucide-react';

interface AppRow {
  id: number;
  grant_id: number;
  grant_title?: string | null;
  org_name?: string | null;
  status: string;
  ai_score?: number | null;
  submitted_at?: string | null;
}

export default function ApplicationsPage() {
  const { t, formatDate } = useTranslation();
  const router = useRouter();
  const { data, isLoading } = useApplications();
  const applications = (data?.applications ?? []) as AppRow[];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="kuja-shimmer h-10 w-64 rounded" />
        <div className="kuja-shimmer h-9 w-32 rounded" />
        {[1, 2, 3, 4].map((i) => <div key={i} className="kuja-shimmer h-14 rounded" />)}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="kuja-display text-3xl">{t('application.list_title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {applications.length} application{applications.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/grants')}
          className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-sm font-medium px-4 py-2"
        >
          <FileText className="h-4 w-4" />
          {t('application.browse_grants')}
        </button>
      </div>

      {applications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background px-6 py-14 text-center">
          <Inbox className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="kuja-display text-xl">{t('application.no_applications')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('application.no_applications_hint')}</p>
          <button
            type="button"
            onClick={() => router.push('/grants')}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border hover:border-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-sand-50))] text-sm font-medium px-4 py-2"
          >
            {t('application.browse_grants')}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-background overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">{t('application.col.grant')}</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">{t('application.col.status')}</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-center">{t('application.col.ai_score')}</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">{t('application.col.submitted')}</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">{t('application.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr
                    key={app.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => router.push(`/applications/${app.id}`)}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-foreground">
                        {app.grant_title || `Grant #${app.grant_id}`}
                      </div>
                      {app.org_name && (
                        <div className="text-xs text-muted-foreground mt-0.5">{app.org_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={app.status} kind="app" /></td>
                    <td className="px-4 py-3 text-center">
                      {app.ai_score !== null && app.ai_score !== undefined ? (
                        <div className="flex justify-center">
                          <ScoreRing score={Math.round(app.ai_score)} size={40} strokeWidth={3} />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(app.submitted_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); router.push(`/applications/${app.id}`); }}
                        className="inline-flex items-center gap-1.5 text-[hsl(var(--kuja-clay))] hover:underline text-sm font-medium"
                      >
                        <Eye className="h-4 w-4" />
                        {t('common.view')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

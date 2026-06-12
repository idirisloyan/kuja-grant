'use client';

/**
 * /admin/declarations — Phase 36 (May 2026), refreshed Phase 45.
 *
 * Emergency declaration list view + "New declaration" CTA that opens
 * the Phase 45 wizard. Click a row to drill into
 * /admin/declarations/<id> for the full multi-sig workflow.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useDeclarations, type EmergencyDeclaration } from '@/lib/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { useNetworkStore } from '@/stores/network-store';
import { Siren, Inbox, Filter, ChevronRight, Plus, Sparkles } from 'lucide-react';
import { DeclarationWizard } from '@/components/declarations/declaration-wizard';
import { describeDeclarationStatus, TONE_PILL_CLASS } from '@/lib/status-copy';

// Phase 50 — filter labels match the human pill copy on the rows themselves.
const STATUS_OPTIONS = [
  { value: '',              label: 'All' },
  { value: 'draft',         label: 'Draft' },
  { value: 'in_review',     label: 'Waiting for signatures' },
  { value: 'signed_active', label: 'Active or ready to release' },
  { value: 'cancelled',     label: 'Cancelled' },
  { value: 'closed',        label: 'Closed' },
];

export default function DeclarationsListPage() {
  const viewer = useAuthStore((s) => s.user);
  const network = useNetworkStore((s) => s.network);
  const [statusFilter, setStatusFilter] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const { data, isLoading, mutate } = useDeclarations(statusFilter || undefined);

  if (viewer && viewer.role !== 'admin') {
    return (
      <div className="p-6 text-sm">
        <p className="text-destructive">
          Only platform admins can view declarations in this phase.
        </p>
      </div>
    );
  }

  const rows = data?.declarations ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="kuja-display text-3xl flex items-center gap-2">
            <Siren className="w-7 h-7 text-[hsl(var(--kuja-clay))]" />
            {network?.name ?? 'Network'} — declarations
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {rows.length} declaration{rows.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="inline-flex items-center gap-2 text-xs">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2 py-1 rounded-md border border-border bg-background text-xs"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[hsl(var(--kuja-clay))] text-white text-xs font-semibold hover:opacity-90"
          >
            <Plus className="w-3.5 h-3.5" /> New declaration
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="kuja-shimmer h-16 rounded" />)}
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="border border-border rounded-lg bg-card p-10 text-center space-y-3">
          <Inbox className="w-8 h-8 mx-auto text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">
            No declarations {statusFilter ? `in '${statusFilter.replace('_', ' ')}' state` : 'yet'}.
          </p>
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[hsl(var(--kuja-clay))] text-white text-xs font-semibold hover:opacity-90"
          >
            <Sparkles className="w-3.5 h-3.5" /> Start a guided declaration
          </button>
          <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
            4 steps: pick the crisis row from your latest Monitoring Report, fill the
            details, choose the OB committee, confirm. ~3 minutes.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((d) => (
          <Link
            key={d.id}
            href={`/admin/declarations/${d.id}`}
            className="block border border-border rounded-lg bg-card p-4 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h3 className="font-semibold text-base truncate">{d.title}</h3>
                  {(() => {
                    const sc = describeDeclarationStatus(d);
                    return (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${TONE_PILL_CLASS[sc.tone]}`}>
                        {sc.label}
                      </span>
                    );
                  })()}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                  {d.country && <span>{d.country}</span>}
                  {d.crisis_type && <span>{d.crisis_type}</span>}
                  {d.severity && <span>severity: {d.severity}</span>}
                  <span>
                    {d.signed_count} / {d.required_signer_count} signed
                    {d.recused_count > 0 && <> · {d.recused_count} recused</>}
                    {d.rejected_count > 0 && <> · {d.rejected_count} rejected</>}
                  </span>
                  {d.proposed_total_amount && (
                    <span>· {d.proposed_total_amount.toLocaleString()}</span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          </Link>
        ))}
      </div>

      {wizardOpen && (
        <DeclarationWizard
          onClose={() => setWizardOpen(false)}
          onCreated={() => { setWizardOpen(false); mutate(); }}
        />
      )}
    </div>
  );
}

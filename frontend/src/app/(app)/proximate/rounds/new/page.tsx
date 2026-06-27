'use client';

/**
 * New Proximate Round — Phase 649.
 *
 * OB-only. Captures the trigger + donor + envelope, drafts the round.
 * After draft, OB submits it; then 2 OB signers must affirm before
 * the round goes active.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

export default function NewProximateRoundPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [trigger, setTrigger] = useState<'disaster' | 'donor_commitment' | 'programme_cycle'>('disaster');
  const [triggerSummary, setTriggerSummary] = useState('');
  const [donor, setDonor] = useState('');
  const [envelope, setEnvelope] = useState('');
  const [duration, setDuration] = useState('');
  const [region, setRegion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!title.trim()) {
      setError(t('proximate.rounds.title_required'));
      return;
    }
    setSubmitting(true);
    try {
      const resp = await api.post<{ round: { id: number } }>(
        '/api/proximate/rounds',
        {
          title: title.trim(),
          title_ar: titleAr.trim() || null,
          trigger_type: trigger,
          trigger_summary: triggerSummary.trim() || null,
          donor_name: donor.trim() || null,
          envelope_usd: envelope ? Number(envelope) : null,
          expected_duration_days: duration ? Number(duration) : null,
          target_country: 'SD',
          target_region: region.trim() || null,
        },
      );
      router.push(`/proximate/rounds/${resp.round.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('proximate.rounds.create_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title={t('proximate.rounds.new_title')}
        subtitle={t('proximate.rounds.new_subtitle')}
      />
      <PageMain>
        <Card className="p-4 space-y-4 max-w-2xl">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              {t('proximate.rounds.field_title')} *
            </label>
            <input
              type="text"
              className="w-full text-sm rounded-md border bg-background p-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Sudan Floods Response — July 2026"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              {t('proximate.rounds.field_title_ar')}
            </label>
            <input
              type="text"
              className="w-full text-sm rounded-md border bg-background p-2"
              value={titleAr}
              onChange={(e) => setTitleAr(e.target.value)}
              dir="rtl"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              {t('proximate.rounds.field_trigger')} *
            </label>
            <select
              className="w-full text-sm rounded-md border bg-background p-2"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as 'disaster' | 'donor_commitment' | 'programme_cycle')}
            >
              <option value="disaster">{t('proximate.rounds.trigger_disaster')}</option>
              <option value="donor_commitment">{t('proximate.rounds.trigger_donor')}</option>
              <option value="programme_cycle">{t('proximate.rounds.trigger_programme')}</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              {t('proximate.rounds.field_trigger_summary')}
            </label>
            <textarea
              className="w-full text-sm rounded-md border bg-background p-2 min-h-[80px]"
              value={triggerSummary}
              onChange={(e) => setTriggerSummary(e.target.value)}
              placeholder={t('proximate.rounds.trigger_summary_placeholder')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                {t('proximate.rounds.field_donor')}
              </label>
              <input
                type="text"
                className="w-full text-sm rounded-md border bg-background p-2"
                value={donor}
                onChange={(e) => setDonor(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                {t('proximate.rounds.field_envelope')}
              </label>
              <input
                type="number"
                className="w-full text-sm rounded-md border bg-background p-2"
                value={envelope}
                onChange={(e) => setEnvelope(e.target.value)}
                placeholder="USD"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                {t('proximate.rounds.field_duration')}
              </label>
              <input
                type="number"
                className="w-full text-sm rounded-md border bg-background p-2"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="days"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                {t('proximate.rounds.field_region')}
              </label>
              <input
                type="text"
                className="w-full text-sm rounded-md border bg-background p-2"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="e.g., Khartoum North, Gedaref"
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button onClick={submit} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('proximate.rounds.create')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => router.push('/proximate/rounds')}
            >
              {t('proximate.rounds.cancel')}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground border-t pt-3">
            {t('proximate.rounds.next_step_hint')}
          </p>
        </Card>
      </PageMain>
    </PageShell>
  );
}

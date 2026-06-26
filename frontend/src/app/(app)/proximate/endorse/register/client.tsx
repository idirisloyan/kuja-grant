'use client';

/**
 * Endorser self-register form — Phase 647 (June 2026).
 *
 * Lets any authenticated user self-register as a Proximate endorser.
 * Lands in `pending` status; the OB reviews via the Phase 646 queue.
 * Idempotent server-side — if the same user re-submits, the existing
 * row is returned with `already_registered: true`.
 *
 * The COI fields (village_name, family_name, employer) are
 * SELF-DISCLOSED, used at endorsement-submit time by
 * compute_coi_signals() to auto-flag potential conflicts. The
 * endorser should fill them honestly — but even if they don't, the
 * Phase 628 audit-vs-count separation means a flagged endorsement
 * still gets recorded; it just doesn't count toward the trust floor.
 *
 * No file upload here — gov_id / selfie attachment is left for a
 * future pass when we wire the document service into Proximate.
 */

import { useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

type Status = 'pending' | 'approved' | 'suspended' | string;

interface Resp {
  success: boolean;
  endorser: {
    id: number;
    status: Status;
    locality: string | null;
    country: string;
  };
  already_registered?: boolean;
  error?: string;
}

export function ProximateEndorserRegisterClient() {
  const { t } = useTranslation();
  const [locality, setLocality] = useState('');
  const [country, setCountry] = useState('SD');
  const [village, setVillage] = useState('');
  const [family, setFamily] = useState('');
  const [employer, setEmployer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);

  // No idempotency probe — the POST endpoint is itself idempotent and
  // returns `already_registered: true` if the user has a row. That's
  // simpler than a separate GET and means we don't need a /me route.

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const r = await api.post<Resp>('/api/proximate/endorsers', {
        locality: locality.trim(),
        country: country.trim() || 'SD',
        village_name: village.trim(),
        family_name: family.trim(),
        employer: employer.trim(),
      });
      setResult(r);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('proximate.register.failed'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Success / already-registered state
  if (result?.endorser) {
    return (
      <PageShell>
        <PageHeader title={t('proximate.register.title')} />
        <PageMain>
          <Card className="p-6 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <p className="text-lg font-medium">
              {result.already_registered
                ? t('proximate.register.already_done')
                : t('proximate.register.thanks')}
            </p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {result.endorser.status === 'approved'
                ? t('proximate.register.you_can_endorse')
                : t('proximate.register.pending_review')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('proximate.register.status')}: {result.endorser.status}
            </p>
          </Card>
        </PageMain>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={t('proximate.register.title')}
        subtitle={t('proximate.register.subtitle')}
      />
      <PageMain>
        <Card className="p-4 space-y-4 max-w-2xl">
          <p className="text-xs text-muted-foreground">
            {t('proximate.register.coi_explainer')}
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                {t('proximate.register.locality')}
              </label>
              <input
                type="text"
                className="w-full text-sm rounded-md border bg-background p-2"
                value={locality}
                onChange={(e) => setLocality(e.target.value)}
                placeholder={t('proximate.register.locality_placeholder')}
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                {t('proximate.register.country')}
              </label>
              <input
                type="text"
                className="w-full text-sm rounded-md border bg-background p-2"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                maxLength={3}
              />
            </div>

            <div className="pt-2 border-t">
              <p className="text-xs font-medium mb-2">
                {t('proximate.register.coi_section')}
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                {t('proximate.register.coi_section_help')}
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    {t('proximate.register.village')}
                  </label>
                  <input
                    type="text"
                    className="w-full text-sm rounded-md border bg-background p-2"
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    {t('proximate.register.family')}
                  </label>
                  <input
                    type="text"
                    className="w-full text-sm rounded-md border bg-background p-2"
                    value={family}
                    onChange={(e) => setFamily(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    {t('proximate.register.employer')}
                  </label>
                  <input
                    type="text"
                    className="w-full text-sm rounded-md border bg-background p-2"
                    value={employer}
                    onChange={(e) => setEmployer(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin me-2" />
            ) : null}
            {t('proximate.register.submit')}
          </Button>
        </Card>
      </PageMain>
    </PageShell>
  );
}

'use client';

/**
 * Public partner self-nomination — Phase 650 (June 2026).
 *
 * Anyone can put their group forward without a Kuja login. Lives under
 * the (auth) route group (no AppShell, no auth guard). Lands in the
 * same 'nominated' queue Adeso staff use; only difference is the audit
 * action records `proximate.partner.self_nominated` and the
 * `nominated_by_user_id` is null. The secretariat triages from there.
 *
 * No bank fields collected here — those are captured later by the
 * secretariat under their authenticated session, so SWIFT codes never
 * cross the public surface.
 *
 * The hidden `website` field is a honeypot for bots.
 */

import { useState } from 'react';
import { Loader2, CheckCircle2, Send } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

interface Resp {
  success: boolean;
  partner?: { id: number; name: string; status: string };
  already_nominated?: boolean;
  error?: string;
}

export default function ProximateNominatePage() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [locality, setLocality] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (name.trim().length < 2) {
      setError(t('proximate.nominate.name_required'));
      return;
    }
    if (!contactPhone.trim() && !contactEmail.trim()) {
      setError(t('proximate.nominate.contact_required'));
      return;
    }
    setSubmitting(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Network-Override': 'proximate',
      };
      const res = await fetch(`${API_BASE}/api/proximate/partners/self-nominate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: name.trim(),
          name_ar: nameAr.trim() || undefined,
          locality: locality.trim() || undefined,
          country: 'SD',
          contact_phone: contactPhone.trim() || undefined,
          contact_email: contactEmail.trim() || undefined,
          description: description.trim() || undefined,
          website: website.trim(),
        }),
      });
      const data: Resp = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || t('proximate.nominate.submit_failed'));
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(t('proximate.nominate.submit_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.success) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto">
          <Card className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
            <h1 className="text-2xl kuja-display mb-2">
              {result.already_nominated
                ? t('proximate.nominate.already_received_title')
                : t('proximate.nominate.received_title')}
            </h1>
            <p className="text-sm text-muted-foreground mb-4">
              {t('proximate.nominate.received_body')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('proximate.nominate.ref')}: #{result.partner?.id}
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <header>
          <h1 className="text-2xl kuja-display mb-1">
            {t('proximate.nominate.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('proximate.nominate.subtitle')}
          </p>
        </header>

        <Card className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('proximate.nominate.field_name')} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 text-sm bg-background border border-border rounded-md"
              placeholder={t('proximate.nominate.field_name_placeholder')}
              maxLength={200}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('proximate.nominate.field_name_ar')}
            </label>
            <input
              type="text"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              dir="rtl"
              className="w-full h-10 px-3 text-sm bg-background border border-border rounded-md"
              maxLength={200}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('proximate.nominate.field_locality')}
            </label>
            <input
              type="text"
              value={locality}
              onChange={(e) => setLocality(e.target.value)}
              className="w-full h-10 px-3 text-sm bg-background border border-border rounded-md"
              placeholder={t('proximate.nominate.field_locality_placeholder')}
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('proximate.nominate.field_phone')}
              </label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-background border border-border rounded-md"
                placeholder="+249..."
                maxLength={50}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('proximate.nominate.field_email')}
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-background border border-border rounded-md"
                maxLength={200}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            {t('proximate.nominate.contact_hint')}
          </p>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('proximate.nominate.field_description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md"
              rows={4}
              maxLength={2000}
              placeholder={t('proximate.nominate.field_description_placeholder')}
            />
          </div>

          {/* Honeypot — bots fill every field; humans won't see this.
              Phase 697: switched from inline-style clip technique to
              Tailwind's `sr-only` class because the reviewer still saw
              the label render visibly even with the inline approach.
              `sr-only` is the codebase's battle-tested visually-hidden
              pattern — used by the page's "Skip to main content" link
              and every accessible widget. */}
          <div className="sr-only" aria-hidden="true">
            <label htmlFor="hp_website">Website</label>
            <input
              id="hp_website"
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <Button
            onClick={submit}
            disabled={submitting}
            className="w-full"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 me-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 me-2" />
            )}
            {t('proximate.nominate.submit')}
          </Button>

          <p className="text-xs text-muted-foreground">
            {t('proximate.nominate.privacy_note')}
          </p>
        </Card>
      </div>
    </div>
  );
}

'use client';

/**
 * Register a Financial Service Provider — Phase 717.
 *
 * Closes an API-only gap: POST /api/proximate/fsps existed but had no UI,
 * so an FSP had to be seeded before any disbursement method could
 * reference it. hawala + mobile money are first-class provider kinds.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Banknote } from 'lucide-react';
import { api } from '@/lib/api';
import { PageShell, PageHeader, PageMain, PageBack } from '@/components/layout/page-shell';
import { useTranslation } from '@/lib/hooks/use-translation';

const input = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';
const label = 'prox-eyebrow block mb-1';

export default function RegisterFspPage() {
  const { t } = useTranslation();
  const KINDS = [
    { value: 'bank', label: t('proximate.fsp.kind_bank') },
    { value: 'hawala', label: t('proximate.fsp.kind_hawala') },
    { value: 'mobile_money', label: t('proximate.fsp.kind_mobile_money') },
  ];
  const [form, setForm] = useState({
    name: '', name_ar: '', kind: 'bank', country: 'SD', locality: '', notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setMsg({ ok: false, text: t('proximate.fsp.name_required') }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post('/api/proximate/fsps', form);
      setMsg({ ok: true, text: t('proximate.fsp.registered', { name: form.name }) });
      setTimeout(() => { window.location.href = '/proximate/admin'; }, 900);
    } catch (err) {
      const text = (err instanceof Error && err.message) || t('proximate.fsp.error');
      setMsg({ ok: false, text });
      setBusy(false);
    }
  };

  return (
    <PageShell>
      {/* PFX-04SEP-NAV-001: shared back component, above the header. */}
      <PageBack href="/proximate/admin/fsps" label={t('proximate.nav.back_to_fsps')} />
      <PageHeader title={t('proximate.fsp.title')}
        subtitle={t('proximate.fsp.subtitle')} />
      <PageMain>
        <div className="prox-panel max-w-xl" style={{ padding: '20px' }}>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className={label}>{t('proximate.fsp.provider_name')}<span style={{ color: 'var(--prox-danger)' }}> *</span></label>
              <input className={input} value={form.name} onChange={set('name')} placeholder={t('proximate.fsp.name_ph')} required />
            </div>
            <div>
              <label className={label}>{t('proximate.fsp.provider_name_ar')}</label>
              <input className={input} value={form.name_ar} onChange={set('name_ar')} dir="rtl" placeholder={t('proximate.fsp.name_ar_ph')} />
            </div>
            <div>
              <label className={label}>{t('proximate.fsp.kind')}</label>
              <select className={input} value={form.kind} onChange={set('kind')}>
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>{t('proximate.nom.country')}</label>
                <input className={input} value={form.country} onChange={set('country')} />
              </div>
              <div>
                <label className={label}>{t('proximate.nom.locality')}</label>
                <input className={input} value={form.locality} onChange={set('locality')} placeholder={t('proximate.fsp.optional')} />
              </div>
            </div>
            <div>
              <label className={label}>{t('proximate.fsp.notes')}</label>
              <textarea className={input} rows={2} value={form.notes} onChange={set('notes')} placeholder={t('proximate.fsp.optional')} />
            </div>
            {msg && (
              <p className="text-sm" style={{ color: msg.ok ? 'var(--prox-good)' : 'var(--prox-danger)' }}>{msg.text}</p>
            )}
            <button type="submit" disabled={busy} className="prox-btn primary disabled:opacity-60">
              <Banknote className="w-4 h-4" />
              {busy ? t('proximate.fsp.submitting') : t('proximate.fsp.submit')}
            </button>
          </form>
        </div>
      </PageMain>
    </PageShell>
  );
}

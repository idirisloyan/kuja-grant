'use client';

/**
 * OB-on-behalf partner nomination — Phase 717.
 *
 * Closes an API-only gap: POST /api/proximate/partners existed but the
 * dashboard only linked to the public self-nominate page. The OB often
 * needs to nominate a partner directly (with bank details) — this form
 * does that and drops the partner into the community-endorsement flow.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { PageShell, PageHeader, PageMain } from '@/components/layout/page-shell';

const input = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';
const label = 'block text-sm font-medium mb-1';

export default function NominatePartnerPage() {
  const [form, setForm] = useState({
    name: '', name_ar: '', locality: '', country: 'SD',
    contact_phone: '', contact_email: '',
    bank_account_holder_name: '', bank_account_number: '', bank_name: '',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setMsg({ ok: false, text: 'Organisation name is required.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await api.post<{ success: boolean; partner?: { id: number } }>(
        '/api/proximate/partners', form);
      const pid = r?.partner?.id;
      setMsg({ ok: true, text: 'Partner nominated. Opening the endorsement view…' });
      setTimeout(() => {
        window.location.href = pid ? `/proximate/endorse/${pid}` : '/proximate/admin/partners';
      }, 900);
    } catch (err) {
      const text = (err instanceof Error && err.message) || 'Could not nominate this partner.';
      setMsg({ ok: false, text });
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <PageHeader title="Nominate a partner"
        subtitle="Register a community organisation directly. It enters the endorsement flow and needs two conflict-free endorsers plus bank verification before it can be funded." />
      <PageMain>
        <Link href="/proximate/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to operator dashboard
        </Link>
        <Card className="p-5 max-w-xl">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>Organisation name<span className="text-destructive"> *</span></label>
                <input className={input} value={form.name} onChange={set('name')} required />
              </div>
              <div>
                <label className={label}>Name (Arabic)</label>
                <input className={input} dir="rtl" value={form.name_ar} onChange={set('name_ar')} />
              </div>
              <div>
                <label className={label}>Locality</label>
                <input className={input} value={form.locality} onChange={set('locality')} />
              </div>
              <div>
                <label className={label}>Country</label>
                <input className={input} value={form.country} onChange={set('country')} />
              </div>
              <div>
                <label className={label}>Contact phone</label>
                <input className={input} value={form.contact_phone} onChange={set('contact_phone')} />
              </div>
              <div>
                <label className={label}>Contact email</label>
                <input className={input} type="email" value={form.contact_email} onChange={set('contact_email')} />
              </div>
            </div>

            <div className="pt-2 border-t">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Bank details (optional — required later for verification)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={label}>Account holder</label>
                  <input className={input} value={form.bank_account_holder_name} onChange={set('bank_account_holder_name')} />
                </div>
                <div>
                  <label className={label}>Account number</label>
                  <input className={input} value={form.bank_account_number} onChange={set('bank_account_number')} />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>Bank name</label>
                  <input className={input} value={form.bank_name} onChange={set('bank_name')} />
                </div>
              </div>
            </div>

            {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-600' : 'text-destructive'}`}>{msg.text}</p>}
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-60">
              <UserPlus className="w-4 h-4" />
              {busy ? 'Nominating…' : 'Nominate partner'}
            </button>
          </form>
        </Card>
      </PageMain>
    </PageShell>
  );
}

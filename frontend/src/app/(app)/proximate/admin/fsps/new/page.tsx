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
import { ArrowLeft, Banknote } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { PageShell, PageHeader, PageMain } from '@/components/layout/page-shell';

const KINDS = [
  { value: 'bank', label: 'Bank' },
  { value: 'hawala', label: 'Hawala' },
  { value: 'mobile_money', label: 'Mobile money' },
];

const input = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';
const label = 'block text-sm font-medium mb-1';

export default function RegisterFspPage() {
  const [form, setForm] = useState({
    name: '', name_ar: '', kind: 'bank', country: 'SD', locality: '', notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setMsg({ ok: false, text: 'Name is required.' }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post('/api/proximate/fsps', form);
      setMsg({ ok: true, text: `Registered "${form.name}". Redirecting…` });
      setTimeout(() => { window.location.href = '/proximate/admin'; }, 900);
    } catch (err) {
      const text = (err instanceof Error && err.message) || 'Could not register this provider.';
      setMsg({ ok: false, text });
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <PageHeader title="Register a financial service provider"
        subtitle="Add a bank, hawala broker, or mobile-money provider so disbursement methods can route through it." />
      <PageMain>
        <Link href="/proximate/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to operator dashboard
        </Link>
        <Card className="p-5 max-w-xl">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className={label}>Provider name<span className="text-destructive"> *</span></label>
              <input className={input} value={form.name} onChange={set('name')} placeholder="e.g. Bank of Khartoum" required />
            </div>
            <div>
              <label className={label}>Provider name (Arabic)</label>
              <input className={input} value={form.name_ar} onChange={set('name_ar')} dir="rtl" placeholder="اسم مزود الخدمة" />
            </div>
            <div>
              <label className={label}>Kind</label>
              <select className={input} value={form.kind} onChange={set('kind')}>
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Country</label>
                <input className={input} value={form.country} onChange={set('country')} />
              </div>
              <div>
                <label className={label}>Locality</label>
                <input className={input} value={form.locality} onChange={set('locality')} placeholder="Optional" />
              </div>
            </div>
            <div>
              <label className={label}>Notes</label>
              <textarea className={input} rows={2} value={form.notes} onChange={set('notes')} placeholder="Optional" />
            </div>
            {msg && (
              <p className={`text-sm ${msg.ok ? 'text-emerald-600' : 'text-destructive'}`}>{msg.text}</p>
            )}
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-60">
              <Banknote className="w-4 h-4" />
              {busy ? 'Registering…' : 'Register provider'}
            </button>
          </form>
        </Card>
      </PageMain>
    </PageShell>
  );
}

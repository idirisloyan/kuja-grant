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
import { COUNTRIES, statesFor, geolocateState, type GeolocateOutcome } from '@/lib/geography';

const input = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';
const label = 'block text-sm font-medium mb-1';
const select = input;

export default function NominatePartnerPage() {
  const [form, setForm] = useState({
    name: '', name_ar: '', locality: '', state: '', country: 'SD',
    contact_phone: '', contact_email: '',
    bank_account_holder_name: '', bank_account_number: '', bank_name: '',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const setSelect = (k: string) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setForm((f) => ({
      ...f,
      [k]: e.target.value,
      // Changing country invalidates any state chosen under the old one —
      // silently keeping 'Blue Nile' after switching to Chad would store a
      // value that reads as precise and is simply wrong.
      ...(k === 'country' ? { state: '' } : {}),
    }));

  // Bank details are NOT part of nomination. They are collected once a
  // partner is cleared and heading for award, so we do not hold account
  // numbers for organisations that may never be funded. Kept reachable
  // behind a disclosure because the OB occasionally registers a partner
  // who is already through diligence.
  const [showBank, setShowBank] = useState(false);

  // "Use my location" only ever fills the State dropdown. The coordinate is
  // read in the browser, resolved to a state and dropped — it is never stored,
  // sent or logged. These are community organisations in an active conflict;
  // a state is administrative geography, a GPS fix is a targeting risk.
  const [locating, setLocating] = useState(false);
  const [geoNote, setGeoNote] = useState<{ tone: 'ok' | 'check' | 'warn'; text: string } | null>(null);

  async function useMyLocation() {
    setLocating(true);
    setGeoNote(null);
    const r: GeolocateOutcome = await geolocateState();
    setLocating(false);
    switch (r.kind) {
      case 'suggestion':
        setForm((f) => ({ ...f, country: 'SD', state: r.state.code }));
        // Near a border the nearest-centre method genuinely cannot tell, so
        // say so instead of quietly picking one.
        setGeoNote(r.confident
          ? { tone: 'ok', text: `Set to ${r.state.name}. Change it if that is not right.` }
          : {
            tone: 'check',
            text: `You appear to be near the boundary of ${r.state.name}`
              + `${r.alternative ? ` and ${r.alternative.name}` : ''}`
              + `. We have set ${r.state.name} — please confirm before saving.`,
          });
        break;
      case 'outside_known_area':
        setGeoNote({ tone: 'warn', text: 'That position is not inside Sudan, so we have not changed the state. Choose it by hand.' });
        break;
      case 'denied':
        setGeoNote({ tone: 'warn', text: 'Location permission was declined — no problem, the dropdown works fine.' });
        break;
      case 'unsupported':
        setGeoNote({ tone: 'warn', text: 'This browser cannot report a location. Use the dropdown.' });
        break;
      default:
        setGeoNote({ tone: 'warn', text: 'Could not get a location fix — this is common on a weak connection. Use the dropdown.' });
    }
  }

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
                <label className={label}>Country</label>
                <select className={select} value={form.country} onChange={setSelect('country')}>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <label className={label}>State</label>
                  {statesFor(form.country).length > 0 && (
                    <button
                      type="button"
                      onClick={useMyLocation}
                      disabled={locating}
                      className="text-[11px] underline text-muted-foreground hover:text-foreground disabled:opacity-60 mb-1"
                      title="Reads your device location, picks the state, and discards the coordinates. Nothing is stored or sent."
                    >
                      {locating ? 'Finding…' : 'Use my location'}
                    </button>
                  )}
                </div>
                {statesFor(form.country).length > 0 ? (
                  <select className={select} value={form.state} onChange={setSelect('state')}>
                    <option value="">Not recorded</option>
                    {statesFor(form.country).map((st) => (
                      <option key={st.code} value={st.code}>{st.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-muted-foreground py-2">
                    No state list held for this country — record it in Locality.
                  </p>
                )}
                {geoNote && (
                  <p className={`text-[11px] mt-1 ${
                    geoNote.tone === 'ok' ? 'text-emerald-700'
                      : geoNote.tone === 'check' ? 'text-amber-700' : 'text-muted-foreground'
                  }`}>
                    {geoNote.text}
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Locality</label>
                <input className={input} value={form.locality} onChange={set('locality')} />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Free text on purpose: locality boundaries have shifted during the
                  conflict, and an official-looking list that is out of date would be
                  worse than none. State above is what reporting groups by.
                </p>
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
              {!showBank ? (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Bank details are collected at award stage, not at nomination —
                    so we do not hold account numbers for organisations that may
                    never be funded. Verification happens before any money moves.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowBank(true)}
                    className="text-xs underline text-muted-foreground hover:text-foreground"
                  >
                    This partner is already cleared — add bank details now
                  </button>
                </div>
              ) : (
              <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Bank details (only for a partner already through due diligence)
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
              </>
              )}
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

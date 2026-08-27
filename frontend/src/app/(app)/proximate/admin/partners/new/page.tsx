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
import { PageShell, PageHeader, PageMain } from '@/components/layout/page-shell';
import { COUNTRIES, statesFor, geolocateState, type GeolocateOutcome } from '@/lib/geography';
import { useTranslation } from '@/lib/hooks/use-translation';

const input = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';
const label = 'prox-eyebrow block mb-1';
const select = input;

export default function NominatePartnerPage() {
  const { t } = useTranslation();
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
          ? { tone: 'ok', text: t('proximate.nom.geo_set', { state: r.state.name }) }
          : {
            tone: 'check',
            text: t('proximate.nom.geo_near_boundary', {
              state: r.state.name,
              alt: r.alternative ? t('proximate.nom.geo_and', { name: r.alternative.name }) : '',
            }),
          });
        break;
      case 'outside_known_area':
        setGeoNote({ tone: 'warn', text: t('proximate.nom.geo_outside') });
        break;
      case 'denied':
        setGeoNote({ tone: 'warn', text: t('proximate.nom.geo_denied') });
        break;
      case 'unsupported':
        setGeoNote({ tone: 'warn', text: t('proximate.nom.geo_unsupported') });
        break;
      default:
        setGeoNote({ tone: 'warn', text: t('proximate.nom.geo_failed') });
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setMsg({ ok: false, text: t('proximate.nom.name_required') }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await api.post<{ success: boolean; partner?: { id: number } }>(
        '/api/proximate/partners', form);
      const pid = r?.partner?.id;
      setMsg({ ok: true, text: t('proximate.nom.success') });
      setTimeout(() => {
        window.location.href = pid ? `/proximate/endorse/${pid}` : '/proximate/admin/partners';
      }, 900);
    } catch (err) {
      const text = (err instanceof Error && err.message) || t('proximate.nom.error');
      setMsg({ ok: false, text });
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <PageHeader title={t('proximate.nom.title')}
        subtitle={t('proximate.nom.subtitle')} />
      <PageMain>
        <Link href="/proximate/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> {t('proximate.nom.back')}
        </Link>
        <div className="prox-panel max-w-xl" style={{ padding: '20px' }}>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>{t('proximate.nom.org_name')}<span style={{ color: 'var(--prox-danger)' }}> *</span></label>
                <input className={input} value={form.name} onChange={set('name')} required />
              </div>
              <div>
                <label className={label}>{t('proximate.nom.name_ar')}</label>
                <input className={input} dir="rtl" value={form.name_ar} onChange={set('name_ar')} />
              </div>
              <div>
                <label className={label}>{t('proximate.nom.country')}</label>
                <select className={select} value={form.country} onChange={setSelect('country')}>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <label className={label}>{t('proximate.nom.state')}</label>
                  {statesFor(form.country).length > 0 && (
                    <button
                      type="button"
                      onClick={useMyLocation}
                      disabled={locating}
                      className="text-[11px] underline text-muted-foreground hover:text-foreground disabled:opacity-60 mb-1"
                      title={t('proximate.nom.use_location_tip')}
                    >
                      {locating ? t('proximate.nom.finding') : t('proximate.nom.use_location')}
                    </button>
                  )}
                </div>
                {statesFor(form.country).length > 0 ? (
                  <select className={select} value={form.state} onChange={setSelect('state')}>
                    <option value="">{t('proximate.nom.not_recorded')}</option>
                    {statesFor(form.country).map((st) => (
                      <option key={st.code} value={st.code}>{st.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-muted-foreground py-2">
                    {t('proximate.nom.no_state_list')}
                  </p>
                )}
                {geoNote && (
                  <p
                    className="text-[11px] mt-1"
                    style={{
                      color: geoNote.tone === 'ok' ? 'var(--prox-good)'
                        : geoNote.tone === 'check' ? 'var(--prox-warn)' : 'var(--prox-muted)',
                    }}
                  >
                    {geoNote.text}
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className={label}>{t('proximate.nom.locality')}</label>
                <input className={input} value={form.locality} onChange={set('locality')} />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t('proximate.nom.locality_help')}
                </p>
              </div>
              <div>
                <label className={label}>{t('proximate.nom.contact_phone')}</label>
                <input className={input} value={form.contact_phone} onChange={set('contact_phone')} />
              </div>
              <div>
                <label className={label}>{t('proximate.nom.contact_email')}</label>
                <input className={input} type="email" value={form.contact_email} onChange={set('contact_email')} />
              </div>
            </div>

            <div className="pt-2" style={{ borderTop: '1px solid var(--prox-line)' }}>
              {!showBank ? (
                <div className="space-y-1">
                  <p className="text-xs" style={{ color: 'var(--prox-muted)' }}>
                    {t('proximate.nom.bank_deferred')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowBank(true)}
                    className="text-xs underline text-muted-foreground hover:text-foreground"
                  >
                    {t('proximate.nom.add_bank_now')}
                  </button>
                </div>
              ) : (
              <>
              <p className="prox-eyebrow mb-2">
                {t('proximate.nom.bank_section')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('proximate.nom.account_holder')}</label>
                  <input className={input} value={form.bank_account_holder_name} onChange={set('bank_account_holder_name')} />
                </div>
                <div>
                  <label className={label}>{t('proximate.nom.account_number')}</label>
                  <input className={input} value={form.bank_account_number} onChange={set('bank_account_number')} />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>{t('proximate.nom.bank_name')}</label>
                  <input className={input} value={form.bank_name} onChange={set('bank_name')} />
                </div>
              </div>
              </>
              )}
            </div>

            {msg && <p className="text-sm" style={{ color: msg.ok ? 'var(--prox-good)' : 'var(--prox-danger)' }}>{msg.text}</p>}
            <button type="submit" disabled={busy} className="prox-btn primary disabled:opacity-60">
              <UserPlus className="w-4 h-4" />
              {busy ? t('proximate.nom.submitting') : t('proximate.nom.submit')}
            </button>
          </form>
        </div>
      </PageMain>
    </PageShell>
  );
}

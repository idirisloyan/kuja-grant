'use client';

/**
 * Public partner self-nomination — Phase 650, redesigned Phase 716b.
 *
 * This is the FIRST-TOUCH surface for an NGO in Sudan landing here
 * cold (from a printed one-pager QR, a WhatsApp forward, or a
 * coordination-body email). It must earn trust in ~15 seconds:
 *   1. Arabic-first hero — what Proximate is, one sentence
 *   2. Three-step "how it works" (community endorsement framing,
 *      NOT grant-application framing — per SoP intent)
 *   3. Recently funded partners (names + locality only — no amounts,
 *      no free text; deliberate protection posture)
 *   4. The five-question form (unchanged mechanics from Phase 650)
 *   5. FAQ collapsibles
 *
 * Hero/steps/FAQ are hardcoded bilingual (AR primary, EN secondary)
 * rather than t()-driven: this public page renders before any user or
 * network language context exists, and the audience is bilingual by
 * design. Form labels keep their existing i18n keys.
 *
 * The hidden `website` field is a honeypot for bots.
 */

import { useEffect, useState } from 'react';
import {
  Loader2, CheckCircle2, Send, Users, HeartHandshake, PhoneCall,
} from 'lucide-react';
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

interface FundedPartner {
  name: string;
  name_ar: string | null;
  locality: string | null;
  disbursements_count: number;
}

const FAQ: Array<{ qAr: string; qEn: string; aAr: string; aEn: string }> = [
  {
    qAr: 'كم يستغرق القرار؟',
    qEn: 'How long does it take?',
    aAr: 'عادة ٧–١٤ يوماً من الترشيح إلى القرار الأول. نتواصل معكم عبر الهاتف أو واتساب.',
    aEn: 'Usually 7–14 days from nomination to a first decision. We reach you by phone or WhatsApp.',
  },
  {
    qAr: 'هل يجب أن نكون منظمة مسجلة؟',
    qEn: 'Do we need to be a registered NGO?',
    aAr: 'لا. نموّل المجموعات المجتمعية غير الرسمية — شهادة مجتمعكم هي الأساس، وليس الأوراق.',
    aEn: 'No. We fund informal community groups — your community’s endorsement is what counts, not paperwork.',
  },
  {
    qAr: 'ماذا لو رُفض ترشيحنا؟',
    qEn: 'What if we are declined?',
    aAr: 'نخبركم بالسبب، ويمكنكم الترشح مجدداً في جولة قادمة.',
    aEn: 'We tell you why, and you can nominate again in a future round.',
  },
  {
    qAr: 'هل معلوماتنا آمنة؟',
    qEn: 'Is our information safe?',
    aAr: 'لا ننشر بياناتكم أبداً؛ تُستخدم فقط للتحقق والتواصل. لا نطلب أي تفاصيل بنكية في هذا النموذج.',
    aEn: 'We never publish your details; they are used only for verification and contact. No bank details are asked on this form.',
  },
];

export default function ProximateNominatePage() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [locality, setLocality] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [description, setDescription] = useState('');
  const [referredBy, setReferredBy] = useState('');
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [funded, setFunded] = useState<FundedPartner[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/proximate/public/funded-partners`, {
      headers: { 'X-Network-Override': 'proximate' },
    })
      .then((r) => r.json())
      .then((d) => { if (d?.success) setFunded(d.partners || []); })
      .catch(() => {});
  }, []);

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
          referred_by: referredBy.trim() || undefined,
          website: website.trim(),
        }),
      });
      const data: Resp = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || t('proximate.nominate.submit_failed'));
      } else {
        setResult(data);
      }
    } catch {
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
            <p className="text-sm text-muted-foreground mb-2" dir="rtl">
              استلمنا ترشيحكم. سيتواصل معكم فريق أديسو عبر الهاتف أو
              واتساب خلال أيام قليلة.
            </p>
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

        {/* Hero — Arabic primary, English secondary */}
        <Card className="p-6 bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900">
          <div dir="rtl" className="mb-3">
            <h1 className="text-2xl kuja-display mb-1">
              صندوق بروكسيميت — تمويل مجتمعي مباشر
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              نموّل المجموعات المجتمعية في السودان مباشرةً، بشهادة
              مجتمعكم أنتم — لا يلزم تسجيل رسمي، ولا حساب، ولا أوراق
              معقدة.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold mb-0.5">
              Proximate Fund — direct community funding
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              We fund community groups in Sudan directly, vouched for by
              your own community — no formal registration, no account,
              no heavy paperwork.
            </p>
          </div>
        </Card>

        {/* How it works — 3 steps, visual */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            {
              icon: Send,
              nAr: '١', nEn: '1',
              tAr: 'رشّحوا مجموعتكم', tEn: 'Nominate your group',
              dAr: 'أجيبوا على الأسئلة القصيرة أدناه',
              dEn: 'Answer the short questions below',
              color: 'text-emerald-600',
            },
            {
              icon: HeartHandshake,
              nAr: '٢', nEn: '2',
              tAr: 'مجتمعكم يشهد لكم', tEn: 'Your community vouches',
              dAr: 'شيوخ ومنسقون محليون يؤكدون عملكم',
              dEn: 'Local elders and coordinators confirm your work',
              color: 'text-sky-600',
            },
            {
              icon: PhoneCall,
              nAr: '٣', nEn: '3',
              tAr: 'أديسو تراجع وتتواصل', tEn: 'Adeso reviews & calls you',
              dAr: 'خلال أيام قليلة، عبر الهاتف أو واتساب',
              dEn: 'Within days, by phone or WhatsApp',
              color: 'text-amber-600',
            },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <Card key={i} className="p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className={`w-4 h-4 ${s.color}`} />
                  <span className="text-xs font-mono text-muted-foreground">
                    {s.nEn}/{s.nAr}
                  </span>
                </div>
                <p className="text-sm font-medium" dir="rtl">{s.tAr}</p>
                <p className="text-xs text-muted-foreground mb-1" dir="rtl">
                  {s.dAr}
                </p>
                <p className="text-xs font-medium">{s.tEn}</p>
                <p className="text-[11px] text-muted-foreground">{s.dEn}</p>
              </Card>
            );
          })}
        </div>

        {/* Recently funded partners — names + locality only */}
        {funded.length > 0 && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium" dir="rtl">
                شركاء مُوِّلوا مؤخراً
              </p>
              <p className="text-xs text-muted-foreground">
                · Recently funded partners
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {funded.map((p, i) => (
                <div key={i} className="border rounded-md p-2.5">
                  <p className="text-sm font-medium" dir="rtl">
                    {p.name_ar || p.name}
                  </p>
                  {p.name_ar && (
                    <p className="text-xs text-muted-foreground">{p.name}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {p.locality || 'Sudan'}
                    {p.disbursements_count > 0 &&
                      ` · ${p.disbursements_count} disbursement${p.disbursements_count === 1 ? '' : 's'}`}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* The form — mechanics unchanged from Phase 650 */}
        <Card className="p-6 space-y-4">
          <div dir="rtl">
            <p className="text-sm font-semibold">نموذج الترشيح</p>
            <p className="text-xs text-muted-foreground">
              خمس دقائق تقريباً. الحقول المعلّمة بـ * مطلوبة.
            </p>
          </div>
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

          {/* Phase 716b — word-of-mouth attribution, optional */}
          <div>
            <label className="block text-sm font-medium mb-1">
              <span dir="rtl">هل رشّحكم أحد؟</span>
              {' '}· Referred by someone?{' '}
              <span className="text-xs text-muted-foreground font-normal">
                (optional / اختياري)
              </span>
            </label>
            <input
              type="text"
              value={referredBy}
              onChange={(e) => setReferredBy(e.target.value)}
              className="w-full h-10 px-3 text-sm bg-background border border-border rounded-md"
              placeholder="اسم الشخص أو الجهة / Name of the person or organisation"
              maxLength={200}
            />
          </div>

          {/* Honeypot — bots fill every field; humans won't see this.
              Phase 697 v3: .kuja-honeypot-hidden (globals.css) with
              display:none + visibility:hidden + !important. aria-label
              only — no visible label even if CSS fails. */}
          <div
            className="kuja-honeypot-hidden"
            aria-hidden="true"
            style={{ display: 'none' }}
          >
            <input
              id="hp_website"
              type="text"
              name="hp_website"
              aria-label="Leave this field blank"
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

        {/* FAQ — bilingual collapsibles, no JS dependency */}
        <Card className="p-4">
          <p className="text-sm font-semibold mb-2">
            <span dir="rtl">أسئلة شائعة</span> · Common questions
          </p>
          <div className="space-y-1">
            {FAQ.map((f, i) => (
              <details key={i} className="group border rounded-md">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium list-none flex items-center justify-between gap-2">
                  <span>
                    <span dir="rtl">{f.qAr}</span>
                    <span className="text-muted-foreground text-xs"> · {f.qEn}</span>
                  </span>
                  <span className="text-muted-foreground group-open:rotate-90 transition-transform">
                    ›
                  </span>
                </summary>
                <div className="px-3 pb-3 space-y-1">
                  <p className="text-sm text-muted-foreground" dir="rtl">{f.aAr}</p>
                  <p className="text-xs text-muted-foreground">{f.aEn}</p>
                </div>
              </details>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

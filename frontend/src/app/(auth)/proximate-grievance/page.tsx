'use client';

/**
 * Public grievance / whistleblower form — Phase 716c (July 2026).
 *
 * SoP §14 channel: anyone can report a concern about a partner or the
 * fund itself. No account, no token. Anonymity is a first-class,
 * explicitly-offered option (safety feature in the Sudan context).
 *
 * Bilingual AR-first hardcoded copy (same pattern as
 * /proximate-nominate — the audience may have no app locale set).
 * POSTs /api/proximate/public/grievances with the honeypot field.
 */

import { useState } from 'react';
import { Loader2, ShieldAlert, CheckCircle2, EyeOff } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

const CATEGORIES = [
  { value: 'fraud', ar: 'اشتباه في احتيال أو سوء استخدام أموال', en: 'Suspected fraud or misuse of funds' },
  { value: 'safety', ar: 'مخاوف تتعلق بالسلامة أو الحماية', en: 'Safety or protection concern' },
  { value: 'other', ar: 'شيء آخر', en: 'Something else' },
];

export default function ProximateGrievancePage() {
  const [category, setCategory] = useState('other');
  const [description, setDescription] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A mini-portal link can prefill which partner the report concerns
  const partnerId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('partner_id')
    : null;

  const submit = async () => {
    setError(null);
    if (description.trim().length < 10) {
      setError('اكتب ما حدث بتفصيل أكثر (10 أحرف على الأقل). / Please describe what happened in more detail (at least 10 characters).');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/api/proximate/public/grievances`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-Network-Override': 'proximate',
        },
        body: JSON.stringify({
          category,
          description: description.trim(),
          is_anonymous: anonymous,
          reporter_name: anonymous ? undefined : name.trim() || undefined,
          reporter_phone: anonymous ? undefined : phone.trim() || undefined,
          partner_id: partnerId ? Number(partnerId) : undefined,
          website, // honeypot — humans never fill this
        }),
      });
      const body = await r.json();
      if (!r.ok || !body.success) {
        setError(body.error || 'Could not submit. Please try again.');
      } else {
        setDone(true);
      }
    } catch {
      setError('تعذّر الإرسال — تحقق من الاتصال وحاول مجدداً. / Could not submit — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full p-8 text-center space-y-4">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
          <h1 className="text-xl kuja-display" dir="rtl">وصل بلاغك — شكراً لك</h1>
          <p className="text-sm text-muted-foreground" dir="rtl">
            سيراجع فريق الرقابة بلاغك خلال 72 ساعة. لن يُشارك اسمك مع أي جهة خارج فريق الرقابة.
          </p>
          <p className="text-sm text-muted-foreground">
            Your report has been received. The oversight team will review it
            within 72 hours. Your identity is never shared beyond the
            oversight team.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-amber-700">
            <ShieldAlert className="w-5 h-5" />
            <span className="text-xs uppercase tracking-wide">Proximate Fund</span>
          </div>
          <h1 className="text-2xl kuja-display" dir="rtl">أبلغ عن مشكلة</h1>
          <h2 className="text-xl text-muted-foreground">Report a concern</h2>
          <p className="text-sm text-muted-foreground" dir="rtl">
            إذا رأيت شيئاً خاطئاً — احتيال، خطر على أحد، أو أي مخالفة — أخبرنا هنا.
            لا تحتاج إلى حساب، ويمكنك الإبلاغ دون ذكر اسمك.
          </p>
          <p className="text-sm text-muted-foreground">
            If you have seen something wrong — fraud, danger to someone, or any
            misconduct — tell us here. You do not need an account, and you can
            report without giving your name.
          </p>
        </header>

        <Card className="p-5 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium block" dir="rtl">ما نوع المشكلة؟ / What kind of concern?</label>
            <div className="space-y-2">
              {CATEGORIES.map((c) => (
                <label
                  key={c.value}
                  className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer text-sm ${
                    category === c.value ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="category"
                    checked={category === c.value}
                    onChange={() => setCategory(c.value)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block" dir="rtl">{c.ar}</span>
                    <span className="block text-muted-foreground">{c.en}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium block" dir="rtl">
              ماذا حدث؟ / What happened?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              dir="auto"
              className="w-full border rounded-lg p-3 text-sm bg-background"
              placeholder="اكتب بالعربية أو الإنجليزية… / Write in Arabic or English…"
            />
          </div>

          {/* Honeypot — visually hidden, bots fill it */}
          <input
            type="text"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute opacity-0 h-0 w-0 pointer-events-none"
            placeholder="website"
          />

          <label className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer text-sm bg-muted/40">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="flex items-center gap-1.5 font-medium">
                <EyeOff className="w-4 h-4" />
                <span dir="rtl">أرسل دون ذكر اسمي</span>
                <span className="text-muted-foreground">/ Submit anonymously</span>
              </span>
              <span className="block text-xs text-muted-foreground mt-1" dir="rtl">
                لن نحفظ اسمك أو رقمك إذا اخترت هذا الخيار.
              </span>
            </span>
          </label>

          {!anonymous && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm block" dir="rtl">اسمك (اختياري) / Your name (optional)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  dir="auto"
                  className="w-full border rounded-lg p-2.5 text-sm bg-background"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm block" dir="rtl">رقم هاتفك (اختياري) / Your phone (optional)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                  className="w-full border rounded-lg p-2.5 text-sm bg-background"
                  placeholder="+249…"
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button onClick={submit} disabled={busy} className="w-full">
            {busy && <Loader2 className="w-4 h-4 animate-spin me-2" />}
            <span dir="rtl">إرسال البلاغ</span>
            <span className="ms-2">/ Submit report</span>
          </Button>

          <p className="text-xs text-muted-foreground" dir="rtl">
            يصل بلاغك مباشرة إلى فريق الرقابة المستقل. البلاغات عن الاحتيال أو
            الخطر توقف الصرف للجهة المعنية تلقائياً حتى تتم المراجعة.
          </p>
          <p className="text-xs text-muted-foreground">
            Your report goes directly to the independent oversight team.
            Fraud and safety reports automatically pause disbursements to the
            group concerned until review is complete.
          </p>
        </Card>
      </div>
    </div>
  );
}

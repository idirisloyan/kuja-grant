'use client';

/**
 * /settings/notifications — channel mix per category (Phase 6).
 *
 * Lets the user pick which delivery channels (in-app / email / SMS /
 * WhatsApp) receive each notification category (deadlines / reviews /
 * compliance / decisions). The pre-emption scanner and deadline
 * reminders use these prefs to fan out.
 *
 * "in-app" is always on (we don't let users opt out — that's where the
 * notifications inbox lives). SMS + WhatsApp require a phone number.
 */

import { useEffect, useState } from 'react';
import {
  Bell, MessageSquare, Phone, Mail, Smartphone, Loader2, Check, X, Send, Info,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PrefRow {
  category: string;
  channels: string[];
  phone_e164: string | null;
  whatsapp_e164: string | null;
  updated_at: string | null;
}

interface PrefsResponse {
  success: boolean;
  categories: PrefRow[];
  catalog: {
    categories: string[];
    channels: string[];
    defaults: Record<string, string[]>;
  };
}

const CATEGORY_LABELS: Record<string, { label: string; hint: string }> = {
  deadlines:  { label: 'Deadlines',           hint: 'Report due dates, grant closing, registration expiry' },
  reviews:    { label: 'Reviews',             hint: 'Application reviews assigned or completed' },
  compliance: { label: 'Compliance & risk',   hint: 'AI pre-emption flags, sanctions hits, adverse media' },
  decisions:  { label: 'Donor decisions',     hint: 'Donor decisions on your applications and reports' },
  // Phase 170 added saved-search alerts. Phase 187 surfaces them in the UI.
  saved_search_matches: {
    label: 'Saved-search matches',
    hint: 'New grants published that match one of your saved searches',
  },
  // Phase 326 — opt-out for weekly digests (NGO pipeline, donor recap, etc).
  digests: {
    label: 'Weekly digests',
    hint: 'Weekly summary of in-flight applications, decisions, and grants closing soon',
  },
};

const CHANNEL_LABELS: Record<string, { label: string; icon: typeof Bell; muted?: boolean; locked?: boolean }> = {
  in_app:   { label: 'In-app',   icon: Bell,         locked: true },
  email:    { label: 'Email',    icon: Mail,         muted: true },   // stubbed
  sms:      { label: 'SMS',      icon: MessageSquare },
  whatsapp: { label: 'WhatsApp', icon: Phone },
  web_push: { label: 'Push',     icon: Smartphone,   muted: true },   // not wired this push
};

export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<PrefsResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Shared contact form
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get<PrefsResponse>('/api/notification-preferences')
      .then((d) => {
        if (cancelled) return;
        setPrefs(d);
        const firstPhone = d.categories.find(c => c.phone_e164)?.phone_e164 ?? '';
        const firstWa = d.categories.find(c => c.whatsapp_e164)?.whatsapp_e164 ?? '';
        setPhone(firstPhone);
        setWhatsapp(firstWa);
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, []);

  const toggleChannel = (cat: string, ch: string) => {
    if (!prefs) return;
    if (ch === 'in_app') return;   // locked on
    const updated = prefs.categories.map((c) => {
      if (c.category !== cat) return c;
      const has = c.channels.includes(ch);
      const channels = has
        ? c.channels.filter(x => x !== ch)
        : Array.from(new Set([...c.channels, ch]));
      return { ...c, channels };
    });
    setPrefs({ ...prefs, categories: updated });
  };

  const save = async () => {
    if (!prefs) return;
    setSaving(true); setError(null); setTestResult(null);
    try {
      const body = {
        categories: prefs.categories.map(c => ({
          category: c.category,
          channels: c.channels,
          phone_e164: phone || null,
          whatsapp_e164: whatsapp || null,
        })),
      };
      const resp = await api.put<PrefsResponse>('/api/notification-preferences', body);
      setPrefs(resp);
      setSavedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async (category: string) => {
    setTestResult(null);
    try {
      type TestResp = { results: { channel: string; success: boolean; skipped?: boolean; reason?: string }[] };
      const r = await api.post<TestResp>('/api/notification-preferences/test', { category });
      const sent = r.results.filter(x => x.success && !x.skipped).map(x => x.channel);
      const skipped = r.results.filter(x => x.skipped || !x.success);
      const sentLabel = sent.length > 0 ? sent.join(', ') : 'no channels';
      const skipDetail = skipped.length ? ` (skipped: ${skipped.map(s => s.channel + (s.reason ? ':' + s.reason : '')).join(', ')})` : '';
      setTestResult(`Test sent via ${sentLabel}${skipDetail}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (error && !prefs) {
    return (
      <Card className="p-6 max-w-lg mx-auto mt-12 border-[hsl(var(--kuja-flag)/0.3)]">
        <h2 className="text-base font-semibold text-[hsl(var(--kuja-flag))]">Could not load preferences</h2>
        <p className="text-xs mt-1">{error}</p>
      </Card>
    );
  }

  if (!prefs) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <div className="kuja-shimmer h-12 rounded" />
        <div className="kuja-shimmer h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <div className="kuja-eyebrow">Settings</div>
        <h1 className="kuja-display text-3xl mt-1">Notifications</h1>
        <p className="text-sm text-[hsl(var(--kuja-ink-soft))] mt-1">
          Choose how Kuja reaches you for each kind of update. In-app is always on
          (that&apos;s where your notifications inbox lives). External channels respect
          the contact info you provide below.
        </p>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="kuja-label">Contact details</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <div>
            <label htmlFor="phone" className="text-xs font-semibold flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" /> SMS phone (E.164)
            </label>
            <input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+254712345678"
              className="mt-1 w-full rounded-md border border-[hsl(var(--border))] px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="wa" className="text-xs font-semibold flex items-center gap-1.5">
              <Phone className="w-3 h-3" /> WhatsApp phone (E.164)
            </label>
            <input
              id="wa"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+254712345678"
              className="mt-1 w-full rounded-md border border-[hsl(var(--border))] px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <p className="text-[11px] text-[hsl(var(--kuja-ink-soft))] mt-2 flex items-start gap-1.5">
          <Info className="w-3 h-3 mt-0.5" />
          We only message you on the channels you enable per category. You can clear these any time.
        </p>
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="kuja-label">Channels per category</div>
        <div className="mt-3 divide-y divide-[hsl(var(--border))]">
          {prefs.categories.map((c) => {
            const meta = CATEGORY_LABELS[c.category] ?? { label: c.category, hint: '' };
            return (
              <div key={c.category} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{meta.label}</div>
                    <div className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">{meta.hint}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => sendTest(c.category)}
                    className="inline-flex items-center gap-1 rounded-md border border-[hsl(var(--border))] px-2 py-1 text-[11px] font-semibold hover:bg-[hsl(var(--kuja-sand-50))]"
                  >
                    <Send className="w-3 h-3" /> Test
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {prefs.catalog.channels.map((ch) => {
                    const cm = CHANNEL_LABELS[ch] ?? { label: ch, icon: Bell, muted: true };
                    const Icon = cm.icon;
                    const enabled = c.channels.includes(ch);
                    const locked = cm.locked;
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => toggleChannel(c.category, ch)}
                        disabled={locked}
                        aria-pressed={enabled}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition-colors',
                          enabled
                            ? 'border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-clay)/0.08)] text-[hsl(var(--kuja-clay))]'
                            : 'border-[hsl(var(--border))] text-[hsl(var(--kuja-ink-soft))] hover:border-[hsl(var(--kuja-clay))]',
                          locked && 'opacity-60 cursor-not-allowed',
                          cm.muted && !enabled && 'opacity-60',
                        )}
                        title={locked ? 'Always on' : (enabled ? 'Click to disable' : 'Click to enable')}
                      >
                        {enabled ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        <Icon className="w-3 h-3" /> {cm.label}
                        {cm.muted && (
                          <Badge variant="outline" className="ml-1 text-[9px]">
                            {ch === 'web_push' ? 'soon' : 'stub'}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {savedAt && (
          <span className="text-xs text-[hsl(var(--kuja-grow))]">
            <Check className="w-3 h-3 inline" /> Saved
          </span>
        )}
        {error && <span className="text-xs text-[hsl(var(--kuja-flag))]">{error}</span>}
        {testResult && <span className="text-xs text-[hsl(var(--kuja-ink-soft))]">{testResult}</span>}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[hsl(var(--kuja-clay-dark))] disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Save preferences
        </button>
      </div>
    </div>
  );
}

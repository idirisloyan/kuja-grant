'use client';

/**
 * Zero-login partner report package — July 2026.
 *
 *   /proximate-report-package?t=<package-token>
 *
 * Replaces the Microsoft-Forms + WhatsApp-attachments reporting flow.
 * The link is REUSABLE: the partner returns over days to add numbers,
 * voice answers and evidence, then submits once. Numbers are number
 * inputs (never free text), the narrative comes from voice notes, and
 * every media item lands internal-only until the OB approves it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, CheckCircle2, AlertTriangle, Camera, Video, FileText,
  Receipt, Mic, Trash2, Send,
} from 'lucide-react';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

interface BudgetLine { label: string; amount: number }
interface Activity {
  id: number; name: string; description: string | null;
  target_population: string | null; geographic_area: string | null;
  budget_lines: BudgetLine[];
}
interface Item {
  id: number; kind: string; caption: string | null;
  question_key: string | null; filename: string | null;
  transcript?: string | null;
}
interface VoiceQ { key: string; label: string }
interface PkgResp {
  success: boolean;
  package?: {
    id: number; status: string; answers: Record<string, unknown>;
    spend_currency: string; ob_notes: string | null;
  };
  partner?: { name: string; name_ar: string | null };
  round?: { title: string };
  activities?: Activity[];
  items?: Item[];
  voice_questions?: VoiceQ[];
  error?: string;
}

const KIND_META: Record<string, { icon: typeof Camera; label: string }> = {
  photo: { icon: Camera, label: 'Photo' },
  video: { icon: Video, label: 'Video' },
  receipt: { icon: Receipt, label: 'Receipt' },
  doc: { icon: FileText, label: 'Document' },
};

type ActAnswer = {
  status?: string; unit?: string; people_reached?: string;
  disaggregation?: Record<string, string>;
  spend?: Record<string, string>;
};

export default function ProximateReportPackagePage() {
  const [token, setToken] = useState('');
  const [data, setData] = useState<PkgResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, ActAnswer>>({});
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [uploadKind, setUploadKind] = useState<string | null>(null);
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const voiceRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const refresh = useCallback(async (tk: string) => {
    const r = await fetch(
      `${API_BASE}/api/proximate/report-package/${encodeURIComponent(tk)}`,
      { headers: { 'X-Network-Override': 'proximate' } },
    );
    const body: PkgResp = await r.json();
    if (!r.ok || !body.success) {
      setError(body.error || 'Failed to load the report package.');
      return;
    }
    setData(body);
    const saved = (body.package?.answers?.activities || {}) as Record<string, ActAnswer>;
    const init: Record<string, ActAnswer> = {};
    Object.entries(saved).forEach(([k, v]) => {
      init[k] = {
        ...v,
        people_reached: v.people_reached != null ? String(v.people_reached) : '',
        disaggregation: Object.fromEntries(Object.entries(v.disaggregation || {})
          .map(([dk, dv]) => [dk, String(dv)])),
        spend: Object.fromEntries(Object.entries(v.spend || {})
          .map(([sk, sv]) => [sk, String(sv)])),
      };
    });
    setAnswers(init);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const tk = url.searchParams.get('t');
    if (!tk) {
      setError('Missing token in URL.');
      setLoading(false);
      return;
    }
    setToken(tk);
    refresh(tk).finally(() => setLoading(false));
  }, [refresh]);

  const editable = data?.package
    && ['draft', 'changes_requested'].includes(data.package.status);

  const setAct = (aid: string, patch: Partial<ActAnswer>) =>
    setAnswers((prev) => ({ ...prev, [aid]: { ...prev[aid], ...patch } }));

  const saveAnswers = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      Object.entries(answers).forEach(([aid, a]) => {
        payload[aid] = {
          status: a.status,
          unit: a.unit,
          people_reached: a.people_reached || undefined,
          disaggregation: a.disaggregation,
          spend: a.spend,
        };
      });
      await fetch(
        `${API_BASE}/api/proximate/report-package/${encodeURIComponent(token)}/answers`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json',
                     'X-Network-Override': 'proximate' },
          body: JSON.stringify({ answers: { activities: payload } }),
        },
      );
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  const uploadItem = async (file: File, kind: string, questionKey?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', kind);
    if (uploadCaption.trim() && !questionKey) fd.append('caption', uploadCaption.trim());
    if (questionKey) fd.append('question_key', questionKey);
    const r = await fetch(
      `${API_BASE}/api/proximate/report-package/${encodeURIComponent(token)}/items`,
      { method: 'POST', headers: { 'X-Network-Override': 'proximate' }, body: fd },
    );
    const body = await r.json();
    if (!r.ok || !body.success) {
      setError(body.error || 'Upload failed — try a smaller file.');
    } else {
      setError(null);
      setUploadCaption('');
      await refresh(token);
    }
  };

  const removeItem = async (id: number) => {
    await fetch(
      `${API_BASE}/api/proximate/report-package/${encodeURIComponent(token)}/items/${id}`,
      { method: 'DELETE',
        headers: { 'X-Network-Override': 'proximate',
                   'X-Requested-With': 'XMLHttpRequest' } },
    );
    await refresh(token);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await saveAnswers();
      const r = await fetch(
        `${API_BASE}/api/proximate/report-package/${encodeURIComponent(token)}/submit`,
        { method: 'POST',
          headers: { 'X-Network-Override': 'proximate',
                     'X-Requested-With': 'XMLHttpRequest' } },
      );
      const body = await r.json();
      if (!r.ok || !body.success) setError(body.error || 'Submit failed.');
      else setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }
  if (!data?.package) return null;

  if (submitted || data.package.status === 'submitted'
      || data.package.status === 'published') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <h1 className="text-xl font-semibold">Report received — تم استلام التقرير</h1>
          <p className="text-sm text-muted-foreground">
            Thank you, {data.partner?.name}. The Proximate team is reviewing
            your report. If anything more is needed, this same link will
            reopen with a note.
          </p>
        </div>
      </div>
    );
  }

  // Narrowed copy — TS loses the `data.package` guard inside callbacks.
  const pkg = data.package;
  const items = data.items || [];
  const voiceItems = items.filter((i) => i.kind === 'voice');
  const shelfItems = items.filter((i) => i.kind !== 'voice');
  const acts = data.activities || [];
  const defaultLines = ['Personnel', 'Supplies & Materials',
    'Transport & Logistics', 'Direct Beneficiary Support', 'Admin / Overheads'];
  const blocks: { aid: string; name: string; lines: string[] }[] =
    acts.length > 0
      ? acts.map((a) => ({
          aid: String(a.id), name: a.name,
          lines: a.budget_lines.length
            ? a.budget_lines.map((l) => l.label) : defaultLines,
        }))
      : [{ aid: 'general', name: 'Your funded activity', lines: defaultLines }];

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 pb-32">
      <div className="max-w-lg mx-auto space-y-5">
        <div className="text-center space-y-1.5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Proximate Fund — Implementation Report
          </p>
          <h1 className="text-xl font-bold">{data.partner?.name}</h1>
          <p className="text-sm text-muted-foreground">{data.round?.title}</p>
          <p className="text-xs text-muted-foreground">
            Add numbers, evidence and voice answers as you go — everything
            saves to this link. Press Submit when the report is complete.
          </p>
          <p className="text-xs text-muted-foreground" dir="rtl">
            أضف الأرقام والأدلة والإجابات الصوتية تدريجياً، ثم اضغط «إرسال» عند اكتمال التقرير.
          </p>
        </div>

        {data.package.status === 'changes_requested' && data.package.ob_notes && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <p className="font-medium mb-1">The Proximate team asked for changes:</p>
            <p className="text-muted-foreground">{data.package.ob_notes}</p>
          </div>
        )}

        {/* 1 — numbers per activity */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">1 · The numbers — الأرقام</h2>
          {blocks.map((b) => {
            const a = answers[b.aid] || {};
            return (
              <div key={b.aid} className="rounded-lg border bg-card p-3 space-y-2">
                <p className="text-sm font-medium">{b.name}</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-muted-foreground">
                    People reached — عدد المستفيدين
                    <input
                      type="number" min={0} inputMode="numeric"
                      value={a.people_reached || ''}
                      disabled={!editable}
                      onChange={(e) => setAct(b.aid, { people_reached: e.target.value })}
                      className="mt-1 w-full text-sm rounded-md border bg-background p-2"
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Counted as
                    <select
                      value={a.unit || 'individuals'}
                      disabled={!editable}
                      onChange={(e) => setAct(b.aid, { unit: e.target.value })}
                      className="mt-1 w-full text-sm rounded-md border bg-background p-2"
                    >
                      <option value="individuals">Individuals — أفراد</option>
                      <option value="households">Households — أسر</option>
                    </select>
                  </label>
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    Breakdown (women / men / girls / boys / disability) — optional
                  </summary>
                  <div className="grid grid-cols-5 gap-1.5 mt-2">
                    {(['women', 'men', 'girls', 'boys', 'pwd'] as const).map((k) => (
                      <label key={k} className="text-[10px] text-muted-foreground capitalize">
                        {k}
                        <input
                          type="number" min={0} inputMode="numeric"
                          value={a.disaggregation?.[k] || ''}
                          disabled={!editable}
                          onChange={(e) => setAct(b.aid, {
                            disaggregation: { ...a.disaggregation, [k]: e.target.value },
                          })}
                          className="mt-0.5 w-full text-xs rounded-md border bg-background p-1.5"
                        />
                      </label>
                    ))}
                  </div>
                </details>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    What you spent ({pkg.spend_currency}) — المصروفات
                  </p>
                  {b.lines.map((label) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="text-xs flex-1 min-w-0 truncate">{label}</span>
                      <input
                        type="number" min={0} inputMode="numeric" placeholder="0"
                        value={a.spend?.[label] || ''}
                        disabled={!editable}
                        onChange={(e) => setAct(b.aid, {
                          spend: { ...a.spend, [label]: e.target.value },
                        })}
                        className="w-32 text-sm rounded-md border bg-background p-1.5 text-end"
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {editable && (
            <button
              type="button" onClick={saveAnswers} disabled={saving}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted inline-flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {savedTick ? 'Saved ✓' : 'Save numbers — حفظ'}
            </button>
          )}
        </div>

        {/* 2 — voice answers */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">2 · Tell us in your voice — أخبرنا بصوتك</h2>
          <p className="text-xs text-muted-foreground">
            Record or attach a voice note for each question — Arabic is
            welcome. Speaking is enough; we turn it into the report.
          </p>
          {(data.voice_questions || []).map((q) => {
            const answered = voiceItems.filter((i) => i.question_key === q.key);
            return (
              <div key={q.key} className="rounded-lg border bg-card p-3 flex items-center gap-2 flex-wrap">
                <p className="text-xs flex-1 min-w-[180px]">{q.label}</p>
                {answered.length > 0 && (
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                    {answered.length} recorded ✓
                  </span>
                )}
                {editable && (
                  <>
                    <input
                      type="file" accept="audio/*" capture className="hidden"
                      ref={(el) => { voiceRefs.current[q.key] = el; }}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setVoiceBusy(q.key);
                          await uploadItem(f, 'voice', q.key);
                          setVoiceBusy(null);
                        }
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => voiceRefs.current[q.key]?.click()}
                      disabled={voiceBusy === q.key}
                      className="text-[11px] inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
                    >
                      {voiceBusy === q.key
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Mic className="w-3 h-3" />}
                      {answered.length ? 'Add another' : 'Record / attach'}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* 3 — evidence shelf */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">3 · Evidence — الأدلة</h2>
          <p className="text-xs text-muted-foreground">
            Photos, videos, receipts, documents — add them as the work
            happens. A one-line caption helps the report.
          </p>
          {editable && (
            <div className="rounded-lg border bg-card p-3 space-y-2">
              <input
                type="text" placeholder="Caption (what does this show?) — وصف قصير"
                value={uploadCaption}
                onChange={(e) => setUploadCaption(e.target.value)}
                className="w-full text-xs rounded-md border bg-background p-2"
              />
              <div className="grid grid-cols-4 gap-1.5">
                {Object.entries(KIND_META).map(([kind, meta]) => {
                  const Icon = meta.icon;
                  return (
                    <button
                      key={kind} type="button" disabled={uploadBusy}
                      onClick={() => { setUploadKind(kind); fileRef.current?.click(); }}
                      className="text-[11px] flex flex-col items-center gap-1 px-2 py-2 rounded-md border border-border hover:bg-muted"
                    >
                      <Icon className="w-4 h-4" />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
              <input
                type="file" className="hidden" ref={fileRef}
                accept={uploadKind === 'photo' ? 'image/*'
                  : uploadKind === 'video' ? 'video/*'
                  : uploadKind === 'receipt' ? 'image/*,.pdf' : '*/*'}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f && uploadKind) {
                    setUploadBusy(true);
                    await uploadItem(f, uploadKind);
                    setUploadBusy(false);
                  }
                  e.target.value = '';
                }}
              />
              {uploadBusy && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Uploading — keep
                  this page open…
                </p>
              )}
            </div>
          )}
          {shelfItems.length > 0 && (
            <ul className="space-y-1.5">
              {shelfItems.map((it) => (
                <li key={it.id} className="flex items-center gap-2 text-xs rounded-md border bg-card px-2.5 py-2">
                  <span className="uppercase text-[9px] text-muted-foreground w-12 shrink-0">{it.kind}</span>
                  <span className="flex-1 min-w-0 truncate">{it.caption || it.filename}</span>
                  {editable && (
                    <button type="button" onClick={() => removeItem(it.id)}
                            aria-label="Remove"
                            className="text-muted-foreground hover:text-rose-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="text-sm text-rose-600 text-center">{error}</p>}
      </div>

      {editable && (
        <div className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur border-t border-border p-3">
          <div className="max-w-lg mx-auto">
            <button
              type="button" disabled={submitting} onClick={submit}
              className="w-full py-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Send className="w-4 h-4" />}
              Submit report — إرسال التقرير
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

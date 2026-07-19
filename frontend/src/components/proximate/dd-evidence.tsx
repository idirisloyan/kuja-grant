'use client';

/**
 * Blue Nile round intake (July 2026) — due-diligence evidence surfaces.
 *
 * The first real round arrived as a OneDrive folder (PIFs, sam.gov
 * screenshots, a media-verification table, situation-analysis PDFs, a
 * panel roster in Word). These panels surface those records now that
 * they live in the system:
 *
 *   PifCard                    structured Partner Information Form
 *   MediaVerificationPanel     social-footprint check + history
 *   ProximateAttachmentsPanel  evidence files on partner/round/signal
 *   PanelRosterPanel           per-round panel candidates + vetting
 *
 * All are OB-only surfaces — mount inside an isOb guard.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText, Paperclip, Upload, Download, Globe2, Users2, Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/* ------------------------------------------------------------------ */
/* PIF card                                                            */
/* ------------------------------------------------------------------ */

const PIF_SECTIONS: Array<[string, Array<[string, string]>]> = [
  ['Identity', [
    ['legal_status', 'Legal status'],
    ['registration_number', 'Registration no.'],
    ['country_of_registration', 'Country of registration'],
    ['year_established', 'Year established'],
    ['headquarters_address', 'Headquarters'],
    ['operational_offices', 'Operational offices'],
    ['website_social', 'Website / social'],
  ]],
  ['Programme', [
    ['thematic_areas', 'Thematic areas'],
    ['primary_target_group', 'Target group'],
    ['geographic_areas', 'Geographic areas'],
    ['key_activities_12m', 'Key activities (12m)'],
    ['beneficiaries_12m', 'Beneficiaries (12m)'],
    ['current_donor_programs', 'Current donor programs'],
  ]],
  ['Financial', [
    ['annual_budget', 'Annual budget'],
    ['funding_sources_12m', 'Funding sources (12m)'],
    ['financial_system', 'Financial system'],
    ['currency', 'Currency'],
    ['mobile_money_number', 'Mobile money'],
    ['transfer_capabilities', 'Can receive via'],
  ]],
  ['Risk & compliance', [
    ['ever_blacklisted', 'Ever suspended/blacklisted'],
    ['external_audits_2y', 'External audits (2y)'],
    ['has_coi_policy', 'COI policy'],
    ['senior_staff_peps', 'Senior staff PEPs'],
    ['declaration_name', 'Declared by'],
    ['declaration_date', 'Declaration date'],
  ]],
];

export function PifCard({ pif, source }: { pif: Record<string, string> | null; source?: string }) {
  if (!pif || Object.keys(pif).length === 0) return null;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Partner Information Form</h3>
        {source && (
          <Badge variant="outline" className="text-[10px]">{source}</Badge>
        )}
      </div>
      <div className="grid md:grid-cols-2 gap-x-6 gap-y-4">
        {PIF_SECTIONS.map(([section, fields]) => {
          const rows = fields.filter(([k]) => pif[k]);
          if (!rows.length) return null;
          return (
            <div key={section}>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                {section}
              </p>
              <dl className="space-y-1">
                {rows.map(([k, label]) => (
                  <div key={k} className="flex gap-2 text-xs">
                    <dt className="text-muted-foreground shrink-0 w-36">{label}</dt>
                    <dd className="font-medium break-words min-w-0">{pif[k]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Attachments                                                         */
/* ------------------------------------------------------------------ */

interface Attachment {
  id: number;
  kind: string;
  label: string | null;
  filename: string | null;
  file_size: number | null;
  created_at: string | null;
}

const KIND_LABELS: Record<string, string> = {
  pif_original: 'PIF original',
  screening_evidence: 'Screening evidence',
  media_evidence: 'Media evidence',
  situation_analysis: 'Situation analysis',
  payment_confirmation: 'Payment confirmation',
  other: 'Other',
};

function fmtBytes(n: number | null) {
  if (!n) return '';
  if (n > 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

export function ProximateAttachmentsPanel({
  subjectKind, subjectId, title = 'Evidence files',
  defaultKind = 'other', emptyText = 'No evidence files yet.',
}: {
  subjectKind: 'partner' | 'round' | 'crisis_signal' | 'disbursement';
  subjectId: number;
  title?: string;
  defaultKind?: string;
  emptyText?: string;
}) {
  const [rows, setRows] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadKind, setUploadKind] = useState(defaultKind);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    api.get<{ attachments: Attachment[] }>(
      `/api/proximate/attachments?subject_kind=${subjectKind}&subject_id=${subjectId}`,
    ).then((r) => setRows(r.attachments || [])).catch(() => {});
  }, [subjectKind, subjectId]);

  useEffect(() => { refresh(); }, [refresh]);

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('subject_kind', subjectKind);
        fd.append('subject_id', String(subjectId));
        fd.append('kind', uploadKind);
        await api.upload('/api/proximate/attachments', fd);
      }
      refresh();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Paperclip className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold flex-1">{title}</h3>
        <select
          value={uploadKind}
          onChange={(e) => setUploadKind(e.target.value)}
          className="text-xs rounded-md border bg-background p-1.5"
        >
          {Object.entries(KIND_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <Button
          size="sm" variant="outline" disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy
            ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1" />
            : <Upload className="w-3.5 h-3.5 me-1" />}
          Upload
        </Button>
        <input
          ref={fileRef} type="file" multiple className="hidden"
          onChange={(e) => onUpload(e.target.files)}
        />
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          {emptyText}
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-b-0">
              <Badge variant="outline" className="text-[10px] shrink-0">
                {KIND_LABELS[a.kind] || a.kind}
              </Badge>
              <span className="flex-1 truncate font-medium">{a.filename}</span>
              <span className="text-muted-foreground shrink-0">{fmtBytes(a.file_size)}</span>
              <a
                href={`/api/proximate/attachments/${a.id}/download`}
                className="text-primary hover:underline shrink-0 inline-flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Media verification                                                  */
/* ------------------------------------------------------------------ */

interface MediaVerification {
  id: number;
  links: string[];
  interaction_summary: string | null;
  external_mention: string | null;
  responsible_individual_mention: string | null;
  overall_verdict: string;
  notes: string | null;
  source?: string | null;
  reviewed_at: string | null;
}

const VERDICT_STYLES: Record<string, string> = {
  positive: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  negative: 'bg-rose-100 text-rose-800 border-rose-300',
  no_footprint: 'bg-muted text-muted-foreground border-border',
  inconclusive: 'bg-amber-100 text-amber-800 border-amber-300',
};

export function MediaVerificationPanel({ partnerId }: { partnerId: number }) {
  const [latest, setLatest] = useState<MediaVerification | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [link, setLink] = useState('');
  const [summary, setSummary] = useState('');
  const [verdict, setVerdict] = useState('no_footprint');

  const refresh = useCallback(() => {
    api.get<{ latest: MediaVerification | null }>(
      `/api/proximate/partners/${partnerId}/media-verification`,
    ).then((r) => setLatest(r.latest)).catch(() => {});
  }, [partnerId]);

  useEffect(() => { refresh(); }, [refresh]);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/api/proximate/partners/${partnerId}/media-verification`, {
        links: link.trim() ? [link.trim()] : [],
        interaction_summary: summary.trim() || undefined,
        overall_verdict: verdict,
      });
      setFormOpen(false); setLink(''); setSummary('');
      refresh();
    } finally {
      setBusy(false);
    }
  };

  // AI web check — Claude + live web search finds links/mentions and files
  // a DRAFT row (source ai_web_search). The human verdict via "Record
  // check" remains the authoritative record.
  const runAiCheck = async () => {
    setAiBusy(true);
    setAiError('');
    try {
      await api.post(
        `/api/proximate/partners/${partnerId}/media-verification/ai-check`, {},
      );
      refresh();
    } catch {
      setAiError('Web check failed — try again or record manually.');
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Globe2 className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold flex-1">Media verification</h3>
        {latest && (
          <Badge variant="outline" className={`text-[10px] ${VERDICT_STYLES[latest.overall_verdict] || ''}`}>
            {latest.overall_verdict.replace(/_/g, ' ')}
          </Badge>
        )}
        {latest?.source === 'ai_web_search' && (
          <Badge variant="outline" className="text-[10px] bg-violet-100 text-violet-800 border-violet-300">
            AI draft
          </Badge>
        )}
        <Button size="sm" variant="outline" disabled={aiBusy} onClick={runAiCheck}>
          {aiBusy && <Loader2 className="w-3.5 h-3.5 animate-spin me-1" />}
          {aiBusy ? 'Searching…' : 'Run web check'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setFormOpen((v) => !v)}>
          {latest ? 'Re-verify' : 'Record check'}
        </Button>
      </div>
      {aiError && <p className="text-xs text-rose-600 mb-2">{aiError}</p>}
      {latest ? (
        <div className="text-xs space-y-1">
          {latest.links.map((u) => (
            <p key={u} className="truncate">
              <a href={u} target="_blank" rel="noreferrer" className="text-primary hover:underline">{u}</a>
            </p>
          ))}
          {latest.interaction_summary && (
            <p className="text-muted-foreground">{latest.interaction_summary}</p>
          )}
          {latest.reviewed_at && (
            <p className="text-[10px] text-muted-foreground">
              Checked {new Date(latest.reviewed_at).toLocaleDateString()}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          No social-footprint check recorded yet.
        </p>
      )}
      {formOpen && (
        <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
          <input
            type="url" placeholder="Link (Facebook page, website)…"
            value={link} onChange={(e) => setLink(e.target.value)}
            className="w-full text-xs rounded-md border bg-background p-2"
          />
          <textarea
            placeholder="Evidence summary (followers, activities, interaction)…"
            value={summary} onChange={(e) => setSummary(e.target.value)}
            rows={2}
            className="w-full text-xs rounded-md border bg-background p-2"
          />
          <div className="flex items-center gap-2">
            <select
              value={verdict} onChange={(e) => setVerdict(e.target.value)}
              className="text-xs rounded-md border bg-background p-1.5"
            >
              <option value="positive">Positive</option>
              <option value="no_footprint">No footprint</option>
              <option value="inconclusive">Inconclusive</option>
              <option value="negative">Negative</option>
            </select>
            <Button size="sm" disabled={busy} onClick={submit}>
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin me-1" />}
              Save
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Panel roster                                                        */
/* ------------------------------------------------------------------ */

interface PanelCandidate {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  rationale: string | null;
  location: string | null;
  status: string;
}

const PANEL_STATUS_STYLES: Record<string, string> = {
  candidate: 'bg-muted text-muted-foreground border-border',
  vetted: 'bg-sky-100 text-sky-800 border-sky-300',
  appointed: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  declined: 'bg-rose-100 text-rose-800 border-rose-300',
};

export function PanelRosterPanel({ roundId }: { roundId?: number }) {
  const [rows, setRows] = useState<PanelCandidate[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  // Process doc §2 — CVs collected during panelist vetting.
  const [cvBusyId, setCvBusyId] = useState<number | null>(null);
  const cvInputRef = useRef<HTMLInputElement>(null);
  const cvTargetRef = useRef<number | null>(null);

  const uploadCv = async (candidateId: number, file: File) => {
    setCvBusyId(candidateId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('subject_kind', 'panel_candidate');
      fd.append('subject_id', String(candidateId));
      fd.append('kind', 'cv');
      await api.upload('/api/proximate/attachments', fd);
    } finally {
      setCvBusyId(null);
    }
  };

  const refresh = useCallback(() => {
    const qs = roundId ? `?round_id=${roundId}` : '';
    api.get<{ candidates: PanelCandidate[] }>(
      `/api/proximate/panel-candidates${qs}`,
    ).then((r) => setRows(r.candidates || [])).catch(() => {});
  }, [roundId]);

  useEffect(() => { refresh(); }, [refresh]);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.post('/api/proximate/panel-candidates', {
        name: name.trim(), round_id: roundId,
      });
      setName('');
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: number, status: string) => {
    await api.patch(`/api/proximate/panel-candidates/${id}`, { status });
    refresh();
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users2 className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold flex-1">Panel roster</h3>
        <input
          type="text" placeholder="Add candidate name…"
          value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className="text-xs rounded-md border bg-background p-1.5 w-44"
        />
        <Button size="sm" variant="outline" disabled={busy || !name.trim()} onClick={add}>
          Add
        </Button>
      </div>
      <input
        type="file" className="hidden" ref={cvInputRef}
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && cvTargetRef.current != null) uploadCv(cvTargetRef.current, f);
          e.target.value = '';
        }}
      />
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No panel candidates yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id} className="text-xs border-b border-border/50 last:border-b-0 pb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium flex-1">{c.name}</span>
                {c.location && (
                  <span className="text-muted-foreground">{c.location}</span>
                )}
                <button
                  type="button"
                  disabled={cvBusyId === c.id}
                  onClick={() => {
                    cvTargetRef.current = c.id;
                    cvInputRef.current?.click();
                  }}
                  className="text-[10px] px-1.5 py-1 rounded-md border border-border hover:bg-muted"
                >
                  {cvBusyId === c.id ? 'Uploading…' : 'CV'}
                </button>
                <select
                  value={c.status}
                  onChange={(e) => setStatus(c.id, e.target.value)}
                  className={`text-[10px] rounded-md border p-1 ${PANEL_STATUS_STYLES[c.status] || ''}`}
                >
                  <option value="candidate">candidate</option>
                  <option value="vetted">vetted</option>
                  <option value="appointed">appointed</option>
                  <option value="declined">declined</option>
                </select>
              </div>
              {c.rationale && (
                <p className="text-muted-foreground mt-0.5 line-clamp-2">{c.rationale}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

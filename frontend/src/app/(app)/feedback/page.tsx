'use client';

/**
 * /feedback — Phase 43B (May 2026).
 *
 * NEAR risk pillar 4 — feedback mechanisms. NGOs file feedback, the
 * secretariat sees an inbox, responds, tracks status.
 *
 * NGO viewer: submit + view own feedback (with secretariat responses).
 * Admin viewer: inbox of all feedback in the network, respond,
 *               change status.
 */

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useNetworkStore } from '@/stores/network-store';
import {
  MessageCircle, Send, Loader2, AlertCircle, Inbox,
  Cog, Shield, ThumbsUp, Lightbulb, MoreHorizontal,
} from 'lucide-react';

const fetcher = <T,>(url: string): Promise<T> => api.get<T>(url);

const CATEGORIES = [
  { value: 'process', label: 'Process', icon: Cog, description: 'The application / decision / reporting process' },
  { value: 'system', label: 'System', icon: Shield, description: 'The Kuja platform itself' },
  { value: 'decision', label: 'OB decision', icon: ThumbsUp, description: 'An Oversight Body funding decision' },
  { value: 'support', label: 'Support', icon: MessageCircle, description: "The secretariat's responsiveness" },
  { value: 'suggestion', label: 'Suggestion', icon: Lightbulb, description: 'General suggestion' },
  { value: 'other', label: 'Other', icon: MoreHorizontal, description: 'Anything else' },
];

const STATUS_LABEL: Record<string, { label: string; tone: 'open' | 'review' | 'good' | 'muted' }> = {
  open: { label: 'Open', tone: 'open' },
  in_review: { label: 'In review', tone: 'review' },
  addressed: { label: 'Addressed', tone: 'good' },
  closed: { label: 'Closed', tone: 'muted' },
};

interface Feedback {
  id: number;
  org_name: string | null;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
  category: string;
  subject: string;
  body_md: string;
  status: string;
  response_md: string | null;
  response_at: string | null;
  response_by_name: string | null;
  created_at: string;
}

interface Resp {
  success: boolean;
  feedback: Feedback[];
  counts: Record<string, number>;
}

export default function FeedbackPage() {
  const viewer = useAuthStore((s) => s.user);
  const network = useNetworkStore((s) => s.network);
  const tenantName = network?.name || 'the network';
  const isAdmin = viewer?.role === 'admin';
  const [statusFilter, setStatusFilter] = useState('all');

  const { data, mutate } = useSWR<Resp>(
    `/member-feedback/?status=${statusFilter}`,
    fetcher,
  );

  const rows = data?.feedback ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="kuja-display text-3xl">Feedback</h1>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
          {isAdmin
            ? `Inbox of member feedback for ${tenantName}. NEAR risk pillar 4 — review, respond, address.`
            : `Tell the ${tenantName} secretariat what's working and what isn't. Every submission is logged in the audit chain so it isn't lost.`}
        </p>
      </div>

      {!isAdmin && <SubmitForm onSubmitted={mutate} />}

      {isAdmin && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground">Filter:</span>
          {['all', 'open', 'in_review', 'addressed', 'closed'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-2 py-1 rounded-md border capitalize ${
                statusFilter === s
                  ? 'border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-clay))]/10 text-[hsl(var(--kuja-clay))]'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="border border-border rounded-lg bg-card p-10 text-center text-sm text-muted-foreground">
            <Inbox className="w-8 h-8 mx-auto mb-2 opacity-50" />
            {isAdmin ? 'No feedback in this state.' : 'No feedback submitted yet.'}
          </div>
        ) : (
          rows.map((r) => (
            <FeedbackRow
              key={r.id}
              fb={r}
              isAdmin={isAdmin}
              onChange={mutate}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SubmitForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [category, setCategory] = useState('process');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and body required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/member-feedback/', {
        category,
        subject: subject.trim(),
        body_md: body.trim(),
      });
      toast.success('Feedback submitted.');
      setSubject('');
      setBody('');
      onSubmitted();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Submit failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border border-border rounded-lg bg-card p-4 space-y-3">
      <h2 className="font-semibold text-sm">File feedback</h2>
      <div>
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Category</label>
        <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = category === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`text-left p-2 rounded-md border transition-colors ${
                  active
                    ? 'border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-clay))]/5'
                    : 'border-border hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Icon className={`w-3 h-3 ${active ? 'text-[hsl(var(--kuja-clay))]' : ''}`} />
                  {c.label}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{c.description}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          className="mt-0.5 w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm"
          placeholder="One-line summary"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Details</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={8000}
          className="mt-0.5 w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm"
          placeholder="What happened, when, and what would help."
        />
        <div className="text-[10px] text-muted-foreground text-right mt-0.5">{body.length} / 8000</div>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="px-3 py-1.5 rounded-md text-xs font-semibold bg-[hsl(var(--kuja-clay))] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
      >
        {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
        Submit feedback
      </button>
    </div>
  );
}

function FeedbackRow({ fb, isAdmin, onChange }: { fb: Feedback; isAdmin: boolean; onChange: () => void }) {
  const [respondMode, setRespondMode] = useState(false);
  const [response, setResponse] = useState(fb.response_md || '');
  const [newStatus, setNewStatus] = useState(fb.status === 'open' ? 'addressed' : fb.status);
  const [submitting, setSubmitting] = useState(false);

  const cat = CATEGORIES.find((c) => c.value === fb.category);
  const Icon = cat?.icon || AlertCircle;
  const statusMeta = STATUS_LABEL[fb.status] || STATUS_LABEL.open;
  const statusCls =
    statusMeta.tone === 'good' ? 'bg-[hsl(var(--kuja-grow))]/15 text-[hsl(var(--kuja-grow))]'
    : statusMeta.tone === 'review' ? 'bg-[hsl(var(--kuja-sun))]/15 text-[hsl(var(--kuja-sun))]'
    : statusMeta.tone === 'muted' ? 'bg-muted text-muted-foreground'
    : 'bg-destructive/15 text-destructive';

  async function respond() {
    if (!response.trim()) {
      toast.error('Response required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.patch(`/member-feedback/${fb.id}/respond`, {
        response_md: response.trim(),
        status: newStatus,
      });
      toast.success('Response sent.');
      setRespondMode(false);
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Send failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border border-border rounded-lg bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-semibold text-sm">{fb.subject}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${statusCls}`}>
              {statusMeta.label}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {cat?.label} · {fb.org_name || `Org #${fb.id}`} ·{' '}
            {fb.submitted_by_name || fb.submitted_by_email} ·{' '}
            {new Date(fb.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{fb.body_md}</p>

      {fb.response_md && (
        <div className="border-l-2 border-[hsl(var(--kuja-clay))] pl-3 py-1 bg-muted/30 rounded-r-md">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
            Secretariat response · {fb.response_by_name} · {fb.response_at && new Date(fb.response_at).toLocaleDateString()}
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{fb.response_md}</p>
        </div>
      )}

      {isAdmin && !fb.response_md && !respondMode && (
        <button
          type="button"
          onClick={() => setRespondMode(true)}
          className="text-xs px-2 py-1 rounded-md border border-border hover:bg-muted inline-flex items-center gap-1"
        >
          <MessageCircle className="w-3 h-3" /> Respond
        </button>
      )}

      {isAdmin && respondMode && (
        <div className="border-t border-border pt-3 space-y-2">
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={4}
            maxLength={8000}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm"
            placeholder="Your response — will be visible to the submitter."
          />
          <div className="flex items-center gap-2">
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="px-2 py-1 rounded-md border border-border bg-background text-xs"
            >
              <option value="in_review">Mark in review</option>
              <option value="addressed">Mark addressed</option>
              <option value="closed">Mark closed</option>
            </select>
            <button
              type="button"
              onClick={respond}
              disabled={submitting}
              className="px-3 py-1.5 rounded-md text-xs font-semibold bg-[hsl(var(--kuja-clay))] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
            >
              {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Send response
            </button>
            <button
              type="button"
              onClick={() => setRespondMode(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

/**
 * Kuja Co-pilot — persistent right-side AI rail.
 *
 * Replaces the old MUI `<AIPanel>` drawer. Built purely in shadcn + Tailwind.
 * Three tabs:
 *   Now       — AI-derived next actions for the current page
 *   Ask       — streaming chat with citations + "Grounded in N sources"
 *   Insights  — narrative summaries of the current data
 *
 * Streaming uses the NDJSON pipeline from /api/ai/chat-stream (see
 * copilot-api.ts). Citation chips render [src:UUID] tokens as numbered
 * superscripts linking to the source doc.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/hooks/use-translation';
import {
  streamChat, fetchSuggestions, fetchDonorPortfolioInsights, fetchNgoReadiness,
  type Suggestion, type StreamSource,
} from '@/lib/copilot-api';
import { cn } from '@/lib/utils';
import {
  Sparkles, Send, X, ChevronsRight, RotateCcw, MessageSquare,
  Lightbulb, CheckCircle2, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Native input — the shadcn Input wraps @base-ui/react/input which has
// inconsistent rendering when combined with MUI's stacking context.
// Plain <input> with matching Tailwind classes is reliable.

type Tab = 'now' | 'ask' | 'insights';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: StreamSource[];
  streaming?: boolean;
}

interface CopilotScope {
  kind: string;
  id?: number | string;
  title?: string;
}

export function CopilotRail({ scope }: { scope?: CopilotScope }) {
  const user = useAuthStore((s) => s.user);
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('now');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('kuja_copilot_open');
    if (saved === 'true') setOpen(true);
  }, []);

  useEffect(() => {
    localStorage.setItem('kuja_copilot_open', String(open));
  }, [open]);

  // Listen for global "open co-pilot" events from anywhere in the app
  // (verdict card actions, command center buttons, onboarding tour, etc.)
  useEffect(() => {
    const handler = (e: Event) => {
      setOpen(true);
      // Switch to Ask tab when opening from an action
      const custom = e as CustomEvent<{ tab?: Tab }>;
      if (custom.detail?.tab) setTab(custom.detail.tab);
    };
    window.addEventListener('kuja:open-copilot', handler);
    return () => window.removeEventListener('kuja:open-copilot', handler);
  }, []);

  const effectiveScope: CopilotScope = scope ?? { kind: 'global' };

  if (!user) return null;

  return (
    <>
      {/* Persistent sparkle toggle — always visible.
          z-[1251] keeps it above MUI's Drawer (1200) and header (1100)
          so it never gets buried by layout chrome. */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'fixed right-0 top-24 flex h-12 w-12 items-center justify-center rounded-l-full',
          'bg-gradient-to-br from-[hsl(var(--kuja-spark))] to-[hsl(262_70%_45%)]',
          'text-white shadow-xl transition-all hover:scale-105',
          open && 'right-[380px]',
        )}
        style={{ zIndex: 1251 }}
        aria-label={open ? 'Close co-pilot' : 'Open co-pilot'}
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>

      {/* Rail — z-[1250] so it sits above MUI's sidebar/header but below
          MUI modals (1300). Guarantees the Ask tab input is never
          occluded by layout chrome. */}
      <aside
        className={cn(
          'fixed right-0 top-0 bottom-0 flex w-[380px] flex-col border-l border-border bg-background shadow-2xl',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{ zIndex: 1250 }}
        aria-label="Kuja Co-pilot"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="kuja-eyebrow text-[10px]">Kuja Co-pilot</div>
            <div className="text-sm font-semibold text-foreground">
              {_humanScope(effectiveScope, t)}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            className="h-8 w-8"
            aria-label="Minimize"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <TabButton active={tab === 'now'}      onClick={() => setTab('now')}     label={t('copilot.tab.now')}      icon={<Lightbulb className="h-3.5 w-3.5" />} />
          <TabButton active={tab === 'ask'}      onClick={() => setTab('ask')}     label={t('copilot.tab.ask')}      icon={<MessageSquare className="h-3.5 w-3.5" />} />
          <TabButton active={tab === 'insights'} onClick={() => setTab('insights')} label={t('copilot.tab.insights')} icon={<Sparkles className="h-3.5 w-3.5" />} />
        </div>

        {/* Body — overflow-hidden lets each tab own its own scrolling.
            Previously `overflow-y-auto` here fought with AskTab's flex
            column and could push the input off-screen in narrow viewports
            or when the body was shorter than the nested scroller. */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-hidden">
          {tab === 'now' && (
            <div className="h-full overflow-y-auto">
              <NowTab scope={effectiveScope} role={user.role} />
            </div>
          )}
          {tab === 'ask' && <AskTab scope={effectiveScope} />}
          {tab === 'insights' && (
            <div className="h-full overflow-y-auto">
              <InsightsTab scope={effectiveScope} role={user.role} />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function TabButton({
  active, onClick, label, icon,
}: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors',
        active
          ? 'border-b-2 border-[hsl(var(--kuja-spark))] text-[hsl(var(--kuja-spark))]'
          : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground',
      )}
      role="tab"
      aria-selected={active}
    >
      {icon}
      {label}
    </button>
  );
}

function _humanScope(s: CopilotScope, t: (key: string, params?: Record<string, string | number>) => string) {
  if (s.kind === 'global') return t('copilot.scope.global');
  if (s.kind === 'grant') return s.title ? t('copilot.scope.grant_named', { title: s.title }) : t('copilot.scope.this_grant');
  if (s.kind === 'application') return t('copilot.scope.application');
  if (s.kind === 'report') return t('copilot.scope.report');
  if (s.kind === 'compliance') return t('copilot.scope.compliance');
  return s.kind;
}

// ============================================================
// Now tab
// ============================================================

function NowTab({ scope, role }: { scope: CopilotScope; role: string }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchSuggestions({ role, scope });
    if (res.ok) {
      setItems(res.data.suggestions || []);
    } else {
      setError(res.message);
      setItems([]);
    }
    setLoading(false);
  }, [role, scope]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="kuja-eyebrow">{t('copilot.suggested_actions')}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={loading}
          className="h-7 text-xs"
        >
          <RotateCcw className={cn('mr-1 h-3 w-3', loading && 'animate-spin')} />
          {t('copilot.refresh')}
        </Button>
      </div>
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="kuja-shimmer h-16 rounded-lg" />
          ))}
        </div>
      )}
      {!loading && error && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          {t('copilot.cant_load_suggestions')} — <span className="font-medium">{error}</span>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-[hsl(var(--kuja-grow))]" />
          {t('copilot.all_clear_no_actions')}
        </div>
      )}
      {!loading && items.map((s, i) => (
        <div
          key={i}
          className={cn(
            'rounded-lg border p-3 transition-colors',
            s.severity === 'critical' ? 'border-[hsl(0_75%_85%)] bg-[hsl(0_85%_97%)]'
            : s.severity === 'major' || s.severity === 'minor' ? 'border-[hsl(32_80%_85%)] bg-[hsl(32_100%_97%)]'
            : 'border-border bg-background',
          )}
        >
          <div className="flex items-start gap-2">
            {s.severity && <span className={`kuja-severity kuja-severity-${s.severity} mt-0.5`}>{s.severity}</span>}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">{s.title}</div>
              {s.detail && <div className="mt-0.5 text-xs text-muted-foreground">{s.detail}</div>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Ask tab (streaming chat)
// ============================================================

function AskTab({ scope }: { scope: CopilotScope }) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [threadId, setThreadId] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const q = question.trim();
    if (!q || streaming) return;
    setQuestion('');

    const userMsg: Message = { role: 'user', content: q };
    const placeholder: Message = { role: 'assistant', content: '', streaming: true, sources: [] };
    setMessages((prev) => [...prev, userMsg, placeholder]);
    setStreaming(true);

    abortRef.current = new AbortController();
    let answer = '';
    let sources: StreamSource[] = [];

    try {
      for await (const frame of streamChat({
        question: q, scope, thread_id: threadId, signal: abortRef.current.signal,
      })) {
        if (frame.type === 'sources') {
          sources = frame.items ?? [];
          setMessages((prev) => {
            const n = [...prev];
            n[n.length - 1] = { ...n[n.length - 1], sources };
            return n;
          });
        } else if (frame.type === 'delta') {
          answer += frame.text ?? '';
          setMessages((prev) => {
            const n = [...prev];
            n[n.length - 1] = { ...n[n.length - 1], content: answer, sources };
            return n;
          });
        } else if (frame.type === 'done') {
          if (frame.thread_id) setThreadId(frame.thread_id);
          setMessages((prev) => {
            const n = [...prev];
            n[n.length - 1] = { ...n[n.length - 1], streaming: false };
            return n;
          });
        } else if (frame.type === 'error') {
          setMessages((prev) => {
            const n = [...prev];
            n[n.length - 1] = { role: 'assistant', content: `**Error:** ${frame.message}`, streaming: false };
            return n;
          });
        }
      }
    } catch (e) {
      setMessages((prev) => {
        const n = [...prev];
        n[n.length - 1] = {
          role: 'assistant',
          content: `**Error:** ${(e as Error).message || 'stream interrupted'}`,
          streaming: false,
        };
        return n;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="pt-4 text-center">
            <svg className="mx-auto h-24 w-24">
              <use href="/svg/empty-states.svg#illo-copilot" />
            </svg>
            <div className="kuja-display text-xl mt-2">{t('copilot.ask_anything')}</div>
            <p className="mx-auto mt-2 max-w-[260px] text-xs text-muted-foreground">
              {t('copilot.ask_intro')}
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} msg={m} />
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-border p-3 bg-background">
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('copilot.ask_placeholder')}
            disabled={streaming}
            autoComplete="off"
            className="flex-1 h-9 px-3 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-spark))] focus-visible:border-[hsl(var(--kuja-spark))] disabled:opacity-50"
          />
          {streaming ? (
            <Button type="button" size="sm" variant="outline" onClick={cancel}>
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="sm"
              disabled={!question.trim()}
              className="bg-[hsl(var(--kuja-spark))] text-white hover:bg-[hsl(262_70%_45%)] disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const { t } = useTranslation();
  const isUser = msg.role === 'user';
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-[hsl(var(--kuja-spark))] px-3 py-2 text-sm text-white">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-[92%] space-y-2">
      {(msg.sources && msg.sources.length > 0) && (
        <div className="kuja-grounded">
          <CheckCircle2 className="h-3 w-3" />
          {t(msg.sources.length === 1 ? 'copilot.grounded_in_one' : 'copilot.grounded_in_other', { count: msg.sources.length })}
        </div>
      )}
      <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-border bg-muted/40 px-3 py-2 text-sm leading-relaxed text-foreground">
        {msg.streaming && msg.content === ''
          ? <span className="kuja-pulse inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Thinking…</span>
          : renderWithCitations(msg.content, msg.sources ?? [])}
      </div>
      {msg.sources && msg.sources.length > 0 && !msg.streaming && (
        <div className="space-y-1">
          <div className="kuja-label text-[10px]">Sources cited</div>
          {msg.sources.map((s, i) => (
            <a
              key={s.doc_id}
              href={s.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs transition-colors hover:border-[hsl(var(--kuja-spark))] hover:bg-[hsl(var(--kuja-spark-soft))]"
            >
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[hsl(var(--kuja-spark))] text-[10px] font-bold text-white">
                {i + 1}
              </span>
              <span className="flex-1 truncate">
                <span className="font-medium text-foreground">{s.title}</span>
                {s.reference && <span className="ml-1 font-mono text-[10px] text-muted-foreground">{s.reference}</span>}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function renderWithCitations(text: string, sources: StreamSource[]): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /\[src:([0-9a-f-]{36})\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const id = m[1];
    const i = sources.findIndex((s) => s.doc_id === id);
    if (i >= 0) {
      parts.push(
        <a
          key={`c-${m.index}`}
          href={sources[i].href}
          target="_blank"
          rel="noreferrer"
          className="kuja-cite"
          title={sources[i].title}
        >
          {i + 1}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// ============================================================
// Insights tab
// ============================================================

function InsightsTab({ scope, role }: { scope: CopilotScope; role: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ headline?: string; sections?: Array<{ title: string; body: string; severity?: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      let res;
      if (role === 'donor' && scope.kind === 'global') {
        res = await fetchDonorPortfolioInsights();
      } else if (role === 'ngo' && scope.kind === 'global') {
        res = await fetchNgoReadiness();
      } else {
        res = await fetchSuggestions({ role, scope });
      }
      if (cancelled) return;
      if (res.ok) {
        const d = res.data as unknown as { headline?: string; sections?: Array<{ title: string; body: string; severity?: string }>; next_decisions?: Array<{ title: string; detail: string; severity?: string }>; top_blockers?: Array<{ title: string; severity?: string }>; suggestions?: Suggestion[] };
        setData({
          headline: d.headline,
          sections: d.sections
            ?? d.next_decisions?.map((x) => ({ title: x.title, body: x.detail, severity: x.severity }))
            ?? d.top_blockers?.map((x) => ({ title: x.title, body: '', severity: x.severity }))
            ?? d.suggestions?.map((x) => ({ title: x.title, body: x.detail ?? '', severity: x.severity })),
        });
      } else {
        setError(res.message);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [role, scope]);

  return (
    <div className="p-4 space-y-3">
      {loading && (
        <>
          <div className="kuja-shimmer h-12 rounded-lg" />
          <div className="kuja-shimmer h-24 rounded-lg" />
          <div className="kuja-shimmer h-24 rounded-lg" />
        </>
      )}
      {!loading && error && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          {error}
        </div>
      )}
      {!loading && data?.headline && (
        <div className="kuja-display text-xl">{data.headline}</div>
      )}
      {!loading && data?.sections?.map((s, i) => (
        <div key={i} className="rounded-lg border border-border bg-background p-3">
          <div className="flex items-center gap-2 mb-1">
            {s.severity && <span className={`kuja-severity kuja-severity-${s.severity}`}>{s.severity}</span>}
            <span className="text-sm font-semibold">{s.title}</span>
          </div>
          {s.body && <div className="text-xs leading-relaxed text-muted-foreground">{s.body}</div>}
        </div>
      ))}
    </div>
  );
}

'use client';

/**
 * GrantBroadcastDialog — Phase 21B (May 2026).
 *
 * Donor clicks a button on the grant detail page → opens this dialog →
 * types subject + body → picks audience (all/drafts/submitted) → sends.
 * Server fans out via NotificationDispatcher (per-recipient channel
 * prefs) and writes an audit-chain anchor.
 */

import { useState } from 'react';
import {
  Megaphone, Send, Loader2, CheckCircle2,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grantId: number;
}

type Audience = 'all' | 'drafts' | 'submitted';

const AUDIENCE_META: Record<Audience, { label: string; hint: string }> = {
  all:       { label: 'All applicants',  hint: 'Every NGO with any app (draft, submitted, under review).' },
  drafts:    { label: 'Drafts only',     hint: 'Only NGOs still drafting — useful for clarifications mid-write.' },
  submitted: { label: 'Submitted only',  hint: 'Only NGOs in the review queue — useful for post-submit clarifications.' },
};

export function GrantBroadcastDialog({ open, onOpenChange, grantId }: Props) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ orgs: number; users: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.post<{
        success: boolean;
        orgs_targeted?: number;
        users_notified?: number;
        notice?: string;
        reason?: string;
      }>(
        `/api/grants/${grantId}/broadcast`,
        { subject: subject.trim(), body: body.trim(), audience },
      );
      if (r.success) {
        setResult({
          orgs: r.orgs_targeted ?? 0,
          users: r.users_notified ?? 0,
        });
        // Reset after a moment so the dialog can be re-used
        setTimeout(() => {
          setSubject(''); setBody(''); setResult(null);
          onOpenChange(false);
        }, 2400);
      } else {
        setError(r.reason || 'Send failed');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-[hsl(var(--kuja-clay))]" />
            Broadcast to applicants
          </DialogTitle>
          <DialogDescription>
            Send one message to every NGO with an application on this grant.
            Recipients get it via their preferred channels (in-app + email + SMS).
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="py-6 flex flex-col items-center gap-2 text-center">
            <CheckCircle2 className="h-10 w-10 text-[hsl(var(--kuja-grow))]" />
            <p className="font-semibold">Broadcast sent.</p>
            <p className="text-xs text-muted-foreground">
              Notified <strong className="text-foreground">{result.users}</strong>{' '}
              user{result.users === 1 ? '' : 's'} across{' '}
              <strong className="text-foreground">{result.orgs}</strong> NGO{result.orgs === 1 ? '' : 's'}.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Subject
              </label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Deadline extended by 5 days"
                maxLength={200}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Message
              </label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Plain text. Be explicit — recipients won't see attached docs."
                rows={5}
                maxLength={4000}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {body.length} / 4,000 chars
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Audience
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(AUDIENCE_META) as Audience[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAudience(a)}
                    aria-pressed={audience === a}
                    className={
                      audience === a
                        ? 'rounded-full border border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-clay))] text-white px-3 py-1 text-xs'
                        : 'rounded-full border border-[hsl(var(--border))] hover:bg-[hsl(var(--kuja-sand))]/40 px-3 py-1 text-xs'
                    }
                  >
                    {AUDIENCE_META[a].label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {AUDIENCE_META[audience].hint}
              </p>
            </div>

            {error && (
              <div className="rounded-md border border-[hsl(var(--kuja-flag)/0.3)] bg-[hsl(var(--kuja-flag)/0.05)] p-2 text-xs text-[hsl(var(--kuja-flag))]">
                {error}
              </div>
            )}
          </div>
        )}

        {!result && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={send} disabled={sending || !subject.trim() || !body.trim()}>
              {sending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Send className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Send broadcast</span>
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

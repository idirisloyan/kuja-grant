'use client';

/**
 * /chat — Phase 24E (May 2026).
 *
 * Dedicated landing for the sustained AI chat thread (Phase 24B).
 * Opens at global scope so the user can ask anything: "what should I
 * prioritise today?", "compare this year's plan to last year's", etc.
 *
 * Per-scope chat (grant / application / report) is mounted inline on
 * those detail pages so context is automatic — this route is the
 * "Just talk to Kuja" entry point.
 */

import { AIChatPanel } from '@/components/copilot/ai-chat-panel';
import { useNetworkStore } from '@/stores/network-store';

export default function ChatPage() {
  const network = useNetworkStore((s) => s.network);
  const tenantName = network?.name || 'Kuja';
  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <div>
        <h1 className="kuja-display text-2xl">Chat with {tenantName}</h1>
        <p className="text-sm text-muted-foreground">
          A real conversation — ask follow-ups, refine in place, compare across turns.
          Each chat is private to you and tagged for cost. Tap reset anytime to start fresh.
        </p>
      </div>
      <AIChatPanel />
    </div>
  );
}

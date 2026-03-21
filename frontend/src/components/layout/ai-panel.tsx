'use client';

import { useState, useRef, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useUIStore } from '@/stores/ui-store';
import { api } from '@/lib/api';
import { Sparkles, Send, Bot, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  source?: string;
}

export function AIPanel() {
  const { aiPanelOpen, setAIPanel } = useUIStore();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I'm the Kuja AI Assistant. Ask me anything about grants, applications, or your organization.",
      source: 'system',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res = await api.post<{ response: string; source?: string }>('/ai/chat', {
        message: userMsg,
        context: { page: typeof window !== 'undefined' ? window.location.pathname : '' },
      });
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: res.response, source: res.source || 'Claude AI' },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.', source: 'error' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={aiPanelOpen} onOpenChange={setAIPanel}>
      <SheetContent side="right" className="w-[380px] sm:w-[420px] flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b bg-gradient-to-r from-brand-600 to-brand-700">
          <SheetTitle className="flex items-center gap-2 text-white">
            <Sparkles className="w-5 h-5" />
            Kuja AI Assistant
          </SheetTitle>
        </SheetHeader>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'flex gap-2',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-brand-600" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[85%] rounded-xl px-3 py-2 text-sm',
                    msg.role === 'user'
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-800'
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.source && msg.role === 'assistant' && msg.source !== 'system' && msg.source !== 'error' && (
                    <Badge variant="outline" className="mt-1.5 text-[10px] bg-white/60">
                      {msg.source}
                    </Badge>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center shrink-0 mt-0.5">
                    <UserIcon className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-brand-600" />
                </div>
                <div className="bg-slate-100 rounded-xl px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-3 border-t bg-white">
          <div className="flex gap-2">
            <Input
              placeholder="Ask anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              disabled={loading}
              className="flex-1"
            />
            <Button
              size="icon"
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="bg-brand-600 hover:bg-brand-700 shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

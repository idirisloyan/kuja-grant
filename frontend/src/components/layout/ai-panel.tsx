'use client';

import { useState, useRef, useEffect } from 'react';
import { useUIStore } from '@/stores/ui-store';
import { api } from '@/lib/api';

import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';

import AutoAwesome from '@mui/icons-material/AutoAwesome';
import SendOutlined from '@mui/icons-material/SendOutlined';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import PersonOutline from '@mui/icons-material/PersonOutline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  role: 'user' | 'assistant';
  content: string;
  source?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
    <Drawer
      anchor="right"
      open={aiPanelOpen}
      onClose={() => setAIPanel(false)}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: '100%', sm: 420 },
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2.5,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          background: 'linear-gradient(135deg, #4F46E5 0%, #4338CA 100%)',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <AutoAwesome sx={{ color: '#fff', fontSize: 22 }} />
        <Typography variant="h6" sx={{ color: '#fff', fontWeight: 600 }}>
          Kuja AI Assistant
        </Typography>
      </Box>

      {/* Messages */}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 2,
        }}
      >
        <Stack spacing={2}>
          {messages.map((msg, i) => (
            <Box
              key={i}
              sx={{
                display: 'flex',
                gap: 1,
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              {msg.role === 'assistant' && (
                <Avatar
                  sx={{
                    width: 30,
                    height: 30,
                    bgcolor: '#EEF2FF',
                    mt: 0.25,
                  }}
                >
                  <SmartToyOutlined sx={{ fontSize: 18, color: '#4F46E5' }} />
                </Avatar>
              )}
              <Box
                sx={{
                  maxWidth: '85%',
                  borderRadius: 2.5,
                  px: 2,
                  py: 1.25,
                  bgcolor: msg.role === 'user' ? 'primary.main' : '#F1F5F9',
                  color: msg.role === 'user' ? '#fff' : 'text.primary',
                }}
              >
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {msg.content}
                </Typography>
                {msg.source && msg.role === 'assistant' && msg.source !== 'system' && msg.source !== 'error' && (
                  <Chip
                    label={msg.source}
                    size="small"
                    variant="outlined"
                    sx={{ mt: 1, fontSize: '0.625rem', height: 20, bgcolor: 'rgba(255,255,255,0.6)' }}
                  />
                )}
              </Box>
              {msg.role === 'user' && (
                <Avatar
                  sx={{
                    width: 30,
                    height: 30,
                    bgcolor: 'primary.main',
                    mt: 0.25,
                  }}
                >
                  <PersonOutline sx={{ fontSize: 18, color: '#fff' }} />
                </Avatar>
              )}
            </Box>
          ))}
          {loading && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Avatar sx={{ width: 30, height: 30, bgcolor: '#EEF2FF' }}>
                <SmartToyOutlined sx={{ fontSize: 18, color: '#4F46E5' }} />
              </Avatar>
              <Box sx={{ bgcolor: '#F1F5F9', borderRadius: 2.5, px: 2.5, py: 1.5 }}>
                <Box sx={{ display: 'flex', gap: 0.75 }}>
                  {[0, 150, 300].map((delay) => (
                    <Box
                      key={delay}
                      sx={{
                        width: 8,
                        height: 8,
                        bgcolor: '#94A3B8',
                        borderRadius: '50%',
                        animation: 'bounce 1.4s ease-in-out infinite',
                        animationDelay: `${delay}ms`,
                        '@keyframes bounce': {
                          '0%, 80%, 100%': { transform: 'scale(0.8)' },
                          '40%': { transform: 'scale(1.2)' },
                        },
                      }}
                    />
                  ))}
                </Box>
              </Box>
            </Box>
          )}
        </Stack>
      </Box>

      {/* Input */}
      <Box
        sx={{
          p: 2,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          gap: 1,
        }}
      >
        <TextField
          fullWidth
          placeholder="Ask anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          disabled={loading}
          size="small"
        />
        <IconButton
          onClick={sendMessage}
          disabled={!input.trim() || loading}
          sx={{
            bgcolor: 'primary.main',
            color: '#fff',
            '&:hover': { bgcolor: 'primary.dark' },
            '&.Mui-disabled': { bgcolor: '#E2E8F0', color: '#94A3B8' },
            borderRadius: 2,
            width: 40,
            height: 40,
          }}
        >
          <SendOutlined sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
    </Drawer>
  );
}

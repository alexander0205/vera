'use client';

import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import { Copy, Check } from 'lucide-react';

export function Terminal() {
  const [terminalStep, setTerminalStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const terminalSteps = [
    'git clone https://github.com/nextjs/saas-starter',
    'pnpm install',
    'pnpm db:setup',
    'pnpm db:migrate',
    'pnpm db:seed',
    'pnpm dev 🎉',
  ];

  useEffect(() => {
    const timer = setTimeout(() => {
      setTerminalStep((prev) =>
        prev < terminalSteps.length - 1 ? prev + 1 : prev
      );
    }, 500);

    return () => clearTimeout(timer);
  }, [terminalStep]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(terminalSteps.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box
      sx={{
        width: '100%',
        borderRadius: '8px',
        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        overflow: 'hidden',
        bgcolor: '#111827',
        color: '#fff',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: '0.875rem',
        position: 'relative',
      }}
    >
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#ef4444' }} />
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#eab308' }} />
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#22c55e' }} />
          </Box>
          <Box
            component="button"
            onClick={copyToClipboard}
            aria-label="Copy to clipboard"
            sx={{
              background: 'none',
              border: 'none',
              p: 0,
              cursor: 'pointer',
              display: 'inline-flex',
              color: '#9ca3af',
              transition: 'color 0.15s',
              '&:hover': { color: '#fff' },
            }}
          >
            {copied ? (
              <Check style={{ width: 20, height: 20 }} />
            ) : (
              <Copy style={{ width: 20, height: 20 }} />
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {terminalSteps.map((step, index) => (
            <Box
              key={index}
              sx={{
                opacity: index > terminalStep ? 0 : 1,
                transition: 'opacity 0.3s',
              }}
            >
              <Box component="span" sx={{ color: '#4ade80' }}>$</Box> {step}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

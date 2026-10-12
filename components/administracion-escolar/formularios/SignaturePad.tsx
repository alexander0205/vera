'use client';

// Portado tal cual de crm-escolar/src/components/formularios/SignaturePad.tsx.
// Sin dependencias del CRM (canvas nativo, sin red), así que no hubo nada que
// adaptar más allá de la ruta de import.

import { Box, Typography, Button } from '@mui/material';
import { useRef, useState, useEffect, useCallback } from 'react';

interface SignaturePadProps {
  value?: string;
  onChange: (dataUrl: string) => void;
  color?: string;
  error?: boolean;
}

// Firma ligera sobre un canvas nativo (sin dependencia externa). Emite un data
// URL en PNG por onChange; string vacío al limpiar.
export default function SignaturePad({ value, onChange, color = '#1f2937', error }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(!!value);

  // Backing store del canvas a resolución de pantalla.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = color;
    }
  }, [color]);

  const pos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk) setHasInk(true);
  };

  const end = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const canvas = canvasRef.current;
    if (canvas && hasInk) onChange(canvas.toDataURL('image/png'));
  }, [hasInk, onChange]);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasInk(false);
      onChange('');
    }
  };

  return (
    <Box sx={{
      position: 'relative', borderRadius: 2, bgcolor: 'background.paper',
      border: 2, borderColor: error ? 'error.main' : 'divider',
    }}>
      <Box component="canvas"
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        sx={{ width: '100%', height: 144, touchAction: 'none', borderRadius: 2, cursor: 'crosshair', display: 'block' }}
      />
      {!hasInk && (
        <Typography variant="body2" sx={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          color: 'text.disabled', pointerEvents: 'none',
        }}>
          Firma aquí
        </Typography>
      )}
      <Button size="small" type="button" onClick={clear}
        sx={{ position: 'absolute', top: 8, right: 8, fontSize: 11, color: 'text.secondary' }}>
        Limpiar
      </Button>
    </Box>
  );
}

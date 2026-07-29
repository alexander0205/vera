'use client';

import { useEffect, useState } from 'react';
import { Trash2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';

interface Note {
  id:        number;
  text:      string;
  userId:    number | null;
  userName:  string | null;
  userEmail: string | null;
  createdAt: string;
}

interface Props {
  entityType: 'factura' | 'cliente' | 'producto' | 'cotizacion' | 'pago';
  entityId:   number;
  /** Limita la altura para encajar dentro de una pestaña. */
  className?: string;
}

/**
 * Notas genéricas reutilizables. Lista + agregar + eliminar (soft delete).
 * Se monta en cualquier entidad pasando entityType + entityId.
 */
export function EntityNotes({ entityType, entityId }: Props) {
  const [notes, setNotes]     = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText]       = useState('');
  const [saving, setSaving]   = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/notes?entityType=${entityType}&entityId=${entityId}`);
      const j = await r.json();
      setNotes(j.notes ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [entityType, entityId]);

  async function handleAdd() {
    const clean = text.trim();
    if (!clean) return;
    setSaving(true);
    try {
      const r = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId, text: clean }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Error');
      setText('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error agregando nota');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar esta nota?')) return;
    try {
      const r = await fetch(`/api/notes?id=${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Error');
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch {
      toast.error('Error eliminando nota');
    }
  }

  function fmtDate(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleString('es-DO', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Agregar */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <TextField
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Escribe una nota..."
          multiline
          rows={3}
          fullWidth
          size="small"
          disabled={saving}
          slotProps={{ htmlInput: { maxLength: 5000 } }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            type="button"
            variant="contained"
            size="small"
            onClick={handleAdd}
            disabled={saving || !text.trim()}
            startIcon={saving ? <CircularProgress size={12} color="inherit" /> : undefined}
          >
            {saving ? 'Guardando…' : 'Agregar nota'}
          </Button>
        </Box>
      </Box>

      {/* Lista */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={20} sx={{ color: '#14b8a6' }} />
        </Box>
      ) : notes.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4, color: '#9ca3af', fontSize: '0.875rem' }}>
          <MessageSquare style={{ width: 32, height: 32, display: 'block', margin: '0 auto 8px', opacity: 0.4 }} />
          Sin notas aún.
        </Box>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {notes.map(n => (
            <Box
              component="li"
              key={n.id}
              sx={{ bgcolor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', px: 1.5, py: 1 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                <Typography sx={{ fontSize: '0.875rem', color: '#1f2937', whiteSpace: 'pre-wrap', flex: 1 }}>{n.text}</Typography>
                <IconButton
                  type="button"
                  onClick={() => handleDelete(n.id)}
                  title="Eliminar"
                  size="small"
                  sx={{ p: 0.5, color: '#9ca3af', flexShrink: 0, '&:hover': { color: '#dc2626' } }}
                >
                  <Trash2 style={{ width: 14, height: 14 }} />
                </IconButton>
              </Box>
              <Typography sx={{ fontSize: '10px', color: '#9ca3af', mt: 0.5 }}>
                {n.userName || n.userEmail || 'Sistema'} · {fmtDate(n.createdAt)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

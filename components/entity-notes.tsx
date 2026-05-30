'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

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
export function EntityNotes({ entityType, entityId, className = '' }: Props) {
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
    <div className={`space-y-4 ${className}`}>
      {/* Agregar */}
      <div className="space-y-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Escribe una nota..."
          rows={3}
          maxLength={5000}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          disabled={saving}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={handleAdd}
            disabled={saving || !text.trim()}
          >
            {saving ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Guardando…</> : 'Agregar nota'}
          </Button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-teal-500" />
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Sin notas aún.
        </div>
      ) : (
        <ul className="space-y-2">
          {notes.map(n => (
            <li key={n.id} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-gray-800 whitespace-pre-wrap flex-1">{n.text}</p>
                <button
                  type="button"
                  onClick={() => handleDelete(n.id)}
                  className="p-1 text-gray-400 hover:text-red-600 shrink-0"
                  title="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                {n.userName || n.userEmail || 'Sistema'} · {fmtDate(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

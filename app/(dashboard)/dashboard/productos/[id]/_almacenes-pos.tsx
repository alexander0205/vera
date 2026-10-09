'use client';

import { useEffect, useState } from 'react';
import { Store, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';

interface AlmacenAsig {
  id: number;
  nombre: string;
  asignado: boolean;
  stockActual: number;
}

/**
 * "Almacenes donde se vende" — asigna el producto a los puntos de venta (almacenes).
 * Se auto-oculta si el usuario no tiene pos:configurar (GET responde 403).
 * `visiblePos` activa el aviso anti-huérfano (visible en POS pero sin almacén).
 */
export default function AlmacenesPosSection({ productoId, visiblePos }: { productoId: number; visiblePos: boolean }) {
  const [almacenes, setAlmacenes] = useState<AlmacenAsig[] | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [oculto, setOculto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/pos/asignaciones?productId=${productoId}`);
      if (!res.ok) { setOculto(true); return; }
      const data = await res.json();
      const alms: AlmacenAsig[] = data.almacenes ?? [];
      setAlmacenes(alms);
      setSel(new Set(alms.filter((a) => a.asignado).map((a) => a.id)));
    })();
  }, [productoId]);

  if (oculto) return null;

  function toggle(id: number) {
    setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function guardar() {
    setGuardando(true);
    const res = await fetch('/api/pos/asignaciones', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: productoId, almacenIds: [...sel] }),
    });
    setGuardando(false);
    if (!res.ok) { toast.error('No se pudo guardar'); return; }
    const r = await res.json();
    if (r.noRemovibles?.length) {
      toast.warning(`Guardado. No se quitaron de: ${r.noRemovibles.join(', ')} (tienen stock).`);
    } else {
      toast.success('Puntos de venta actualizados');
    }
    setAlmacenes((prev) => prev?.map((a) => ({ ...a, asignado: sel.has(a.id) })) ?? null);
  }

  const huerfano = visiblePos && sel.size === 0;

  return (
    <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fff', p: 2.5 }}>
      <Box sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Store style={{ width: 18, height: 18, color: '#6b7280' }} />
        <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>Almacenes donde se vende (POS)</Typography>
      </Box>
      <Typography sx={{ mb: 1.5, fontSize: '0.75rem', color: '#6b7280' }}>El producto aparece en la caja de cada almacén marcado.</Typography>

      {huerfano && (
        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'flex-start', gap: 1, borderRadius: '8px', border: '1px solid #fde68a', bgcolor: '#fffbeb', px: 1.5, py: 1, fontSize: '0.75rem', color: '#b45309' }}>
          <AlertTriangle style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0 }} />
          <Box component="span">Este producto está marcado como visible en POS pero no está en ningún almacén → no aparecerá en ninguna caja. Asígnale al menos uno.</Box>
        </Box>
      )}

      {almacenes === null ? (
        <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af' }}>Cargando…</Typography>
      ) : almacenes.length === 0 ? (
        <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af' }}>No hay almacenes. Crea uno en Inventario → Almacenes.</Typography>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1 }}>
            {almacenes.map((a) => (
              <Box component="label" key={a.id}
                sx={{ display: 'flex', cursor: 'pointer', alignItems: 'center', gap: 1.25, borderRadius: '8px', border: '1px solid #f3f4f6', px: 1.5, py: 1, fontSize: '0.875rem', '&:hover': { bgcolor: '#f9fafb' } }}>
                <Checkbox checked={sel.has(a.id)} onChange={() => toggle(a.id)} size="small"
                  sx={{ p: 0, color: '#9ca3af', '&.Mui-checked': { color: '#3658e1' } }} />
                <Box component="span" sx={{ flex: 1 }}>{a.nombre}</Box>
                {a.stockActual > 0 && <Box component="span" sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>stock {a.stockActual}</Box>}
              </Box>
            ))}
          </Box>
          <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" disableElevation onClick={guardar} disabled={guardando}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 500 }}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}

'use client';

/**
 * Planta física: crear y editar espacios, asignarles secciones y elegir su
 * responsable. «Crear un aula por cada sección» arma el arranque; después se juntan
 * las secciones que comparten salón.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { Plus, Wand2 } from 'lucide-react';
import { TIPOS_ESPACIO, labelTipoEspacio, type EspacioBase } from '@/lib/escolar/inventario-aula';
import type { SeccionColegio } from '@/lib/escolar/inventario-aula-db';

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;
const AZUL = { bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } } as const;

interface Props {
  espacios: EspacioBase[];
  secciones: SeccionColegio[];
  personal: { id: number; nombre: string }[];
  /** «Inventario por aula» ya está en el menú. */
  inventarioActivo: boolean;
}

async function llamar(url: string, metodo: string, cuerpo?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: 'No se pudo conectar. Inténtalo de nuevo.' } };
  }
}

export function PlantaFisicaClient({ espacios, secciones, personal, inventarioActivo }: Props) {
  const router = useRouter();
  const [edita, setEdita] = useState<EspacioBase | 'nuevo' | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'success' | 'error' | 'info'; texto: string } | null>(null);
  const [armando, setArmando] = useState(false);

  const sueltas = secciones.filter((s) => s.vigente && s.espacioId == null).length;

  async function arranque() {
    setAviso(null); setArmando(true);
    const r = await llamar('/api/escolar/espacios/arranque', 'POST');
    setArmando(false);
    if (!r.ok) { setAviso({ tipo: 'error', texto: String(r.data.error ?? 'No se pudieron crear las aulas.') }); return; }
    const n = Number(r.data.creadas ?? 0);
    setAviso({ tipo: 'success', texto: n > 0 ? `Se crearon ${n} ${n === 1 ? 'aula' : 'aulas'}. Ahora junta las secciones que comparten salón.` : 'Todas las secciones ya tienen aula.' });
    router.refresh();
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', maxWidth: 640 }}>
          Las aulas y demás espacios del colegio. Una misma aula puede servir a varias secciones (mañana y tarde).
          Cuando tengas espacios y activos con aula, aparece «Inventario por aula» en el menú.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          <Button variant="outlined" onClick={arranque} disabled={armando || sueltas === 0} startIcon={<Wand2 style={{ width: 16, height: 16 }} />} sx={{ color: '#2a45c4', borderColor: '#c7d2fc' }}>
            {armando ? 'Creando…' : 'Crear un aula por cada sección'}
          </Button>
          <Button variant="contained" onClick={() => setEdita('nuevo')} startIcon={<Plus style={{ width: 16, height: 16 }} />} sx={AZUL}>Nuevo espacio</Button>
        </Box>
      </Box>

      {sueltas > 0 && espacios.length === 0 && (
        <Alert severity="info">
          Para empezar rápido, usa «Crear un aula por cada sección»: se crea un aula por sección ({sueltas}) y después juntas las que comparten salón.
        </Alert>
      )}
      {aviso && <Alert severity={aviso.tipo} onClose={() => setAviso(null)}>{aviso.texto}</Alert>}
      {espacios.length > 0 && inventarioActivo && (
        <Typography sx={{ fontSize: '0.8125rem' }}>
          <Link href="/escolar/inventario-aula" style={{ color: '#3658e1', fontWeight: 600 }}>Ver el inventario por aula</Link>
        </Typography>
      )}
      {espacios.length > 0 && !inventarioActivo && (
        <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>
          El inventario por aula aparece cuando al menos un activo fijo tenga aula. Asígnala al registrar el activo o al confirmar una compra, en Contabilidad, Activos fijos.
        </Typography>
      )}

      {espacios.length === 0 ? (
        <Typography sx={{ ...CARD, px: 2, py: 5, textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
          Todavía no hay espacios. Crea el primero o arranca con un aula por sección.
        </Typography>
      ) : (
        <Box sx={{ ...CARD, overflow: 'hidden' }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Box component="table" sx={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
              <Box component="thead" sx={{ bgcolor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <Box component="tr">
                  {['Nombre', 'Tipo', 'Secciones', 'Responsable', ''].map((h) => (
                    <Box component="th" key={h} sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', px: 1.5, py: 1, textAlign: 'left' }}>{h}</Box>
                  ))}
                </Box>
              </Box>
              <Box component="tbody">
                {espacios.map((e) => (
                  <Box component="tr" key={e.id} sx={{ borderBottom: '1px solid #f3f4f6', opacity: e.activo ? 1 : 0.55 }}>
                    <Box component="td" sx={{ fontSize: '0.8125rem', color: '#111827', fontWeight: 600, px: 1.5, py: 1.25 }}>
                      {e.nombre} {!e.activo && <Chip label="Inactivo" size="small" sx={{ height: 20, fontSize: '0.6875rem' }} />}
                    </Box>
                    <Box component="td" sx={{ fontSize: '0.8125rem', color: '#374151', px: 1.5, py: 1.25 }}>{labelTipoEspacio(e.tipo)}</Box>
                    <Box component="td" sx={{ px: 1.5, py: 1.25 }}>
                      {e.secciones.length === 0 ? <Typography component="span" sx={{ fontSize: '0.8125rem', color: '#9ca3af' }}>—</Typography> : (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {e.secciones.map((s) => <Chip key={s.cursoId} label={s.etiqueta} size="small" sx={{ height: 22, fontSize: '0.75rem', bgcolor: '#eef2ff', color: '#3730a3' }} />)}
                        </Box>
                      )}
                    </Box>
                    <Box component="td" sx={{ fontSize: '0.8125rem', color: '#374151', px: 1.5, py: 1.25 }}>{e.responsable ?? '—'}</Box>
                    <Box component="td" sx={{ px: 1.5, py: 1.25, whiteSpace: 'nowrap' }}>
                      <Button size="small" onClick={() => setEdita(e)}>Editar</Button>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      {edita && (
        <EspacioDialogo
          espacio={edita === 'nuevo' ? null : edita} secciones={secciones} personal={personal}
          onCerrar={() => setEdita(null)} onListo={() => { setEdita(null); router.refresh(); }}
        />
      )}
    </Box>
  );
}

/** Crear o editar un espacio, con sus secciones y su responsable. */
function EspacioDialogo({ espacio, secciones, personal, onCerrar, onListo }: {
  espacio: EspacioBase | null; secciones: SeccionColegio[]; personal: { id: number; nombre: string }[]; onCerrar: () => void; onListo: () => void;
}) {
  const [nombre, setNombre] = useState(espacio?.nombre ?? '');
  const [tipo, setTipo] = useState(espacio?.tipo ?? 'aula');
  const [capacidad, setCapacidad] = useState(espacio?.capacidad != null ? String(espacio.capacidad) : '');
  const [responsable, setResponsable] = useState(espacio?.responsableId != null ? String(espacio.responsableId) : '');
  const [activo, setActivo] = useState(espacio?.activo ?? true);
  const [elegidas, setElegidas] = useState<Set<number>>(new Set(espacio?.secciones.map((s) => s.cursoId) ?? []));
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Las vigentes, más las que ya tiene este espacio aunque ya no sean vigentes.
  const ofrecidas = secciones.filter((s) => s.vigente || (espacio && s.espacioId === espacio.id));

  function alternar(id: number) {
    setElegidas((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function guardar() {
    setError(null); setEnviando(true);
    const cuerpo = {
      nombre: nombre.trim(), tipo,
      capacidad: capacidad.trim() === '' ? null : Number(capacidad),
      responsableId: responsable === '' ? null : Number(responsable),
    };
    let id = espacio?.id ?? 0;
    if (espacio) {
      const r = await llamar(`/api/escolar/espacios/${espacio.id}`, 'PATCH', { ...cuerpo, activo });
      if (!r.ok) { setError(String(r.data.error ?? 'No se pudo guardar.')); setEnviando(false); return; }
    } else {
      const r = await llamar('/api/escolar/espacios', 'POST', cuerpo);
      if (!r.ok) { setError(String(r.data.error ?? 'No se pudo crear.')); setEnviando(false); return; }
      id = Number(r.data.id);
    }
    const s = await llamar(`/api/escolar/espacios/${id}/secciones`, 'PUT', { cursoIds: [...elegidas] });
    if (!s.ok) { setError(String(s.data.error ?? 'Se guardó el espacio, pero no sus secciones.')); setEnviando(false); return; }
    onListo();
  }

  async function borrar() {
    if (!espacio || !window.confirm(`¿Borrar «${espacio.nombre}»? Solo se puede si no tiene activos.`)) return;
    setError(null); setEnviando(true);
    const r = await llamar(`/api/escolar/espacios/${espacio.id}`, 'DELETE');
    if (!r.ok) { setError(String(r.data.error ?? 'No se pudo borrar.')); setEnviando(false); return; }
    onListo();
  }

  return (
    <Dialog open onClose={() => !enviando && onCerrar()} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>{espacio ? 'Editar espacio' : 'Nuevo espacio'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Aula 1" sx={{ flex: 1, minWidth: 200 }} slotProps={{ htmlInput: { maxLength: 120 } }} />
          <TextField label="Tipo" select value={tipo} onChange={(e) => setTipo(e.target.value)} sx={{ width: 180 }}>
            {TIPOS_ESPACIO.map((t) => <MenuItem key={t.clave} value={t.clave}>{t.label}</MenuItem>)}
          </TextField>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField label="Capacidad" type="number" value={capacidad} onChange={(e) => setCapacidad(e.target.value)} helperText="Opcional" slotProps={{ htmlInput: { min: 0, step: '1' } }} sx={{ width: 130 }} />
          <TextField label="Responsable" select value={responsable} onChange={(e) => setResponsable(e.target.value)} helperText={personal.length === 0 ? 'Agrega personal en la pantalla Personal' : 'Opcional'} sx={{ flex: 1, minWidth: 220 }}>
            <MenuItem value="">Sin responsable</MenuItem>
            {personal.map((p) => <MenuItem key={p.id} value={String(p.id)}>{p.nombre}</MenuItem>)}
          </TextField>
        </Box>

        <Box>
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', mb: 0.5 }}>Secciones que usan este espacio</Typography>
          {ofrecidas.length === 0 ? (
            <Typography sx={{ fontSize: '0.8125rem', color: '#9ca3af' }}>Todavía no hay secciones. Se crean en Configuración, Estructura.</Typography>
          ) : (
            <Box sx={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 1.5, px: 1.5, py: 0.5 }}>
              {ofrecidas.map((s) => (
                <Box key={s.cursoId}>
                  <FormControlLabel
                    control={<Checkbox size="small" checked={elegidas.has(s.cursoId)} onChange={() => alternar(s.cursoId)} />}
                    label={<span style={{ fontSize: '0.8125rem' }}>{s.etiqueta}{s.espacioId != null && s.espacioId !== espacio?.id ? ' · ya está en otro aula (se mueve a esta)' : ''}</span>}
                  />
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {espacio && <FormControlLabel control={<Checkbox checked={activo} onChange={(e) => setActivo(e.target.checked)} />} label="Espacio activo" />}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        <Box>{espacio && <Button color="error" onClick={borrar} disabled={enviando}>Borrar</Button>}</Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button color="inherit" onClick={onCerrar} disabled={enviando}>Cancelar</Button>
          <Button variant="contained" onClick={guardar} disabled={enviando || nombre.trim() === ''} sx={AZUL}>{enviando ? 'Guardando…' : 'Guardar'}</Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}

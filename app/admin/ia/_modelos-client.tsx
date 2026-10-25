'use client';

/**
 * /admin/ia: qué modelo usa cada parte de Zero (asistente, plantillas, fotos de
 * facturas). La regla y el catálogo viven en lib/ia/modelos.ts; aquí solo se
 * escoge, se prueba y se guarda.
 */

import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import ListSubheader from '@mui/material/ListSubheader';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import { Bot, CheckCircle2, XCircle, Zap } from 'lucide-react';
import type { ModeloIa, ModelosDeUso, UsoIa, UsoIaInfo } from '@/lib/ia/modelos';

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;
const INPUT = { '& .MuiOutlinedInput-root': { borderRadius: '8px' } } as const;

interface Estado {
  modelos: ModeloIa[];
  usos: (UsoIaInfo & { actual: ModelosDeUso })[];
  gateway: boolean;
}

type Prueba = { estado: 'probando' } | { estado: 'ok'; ms: number } | { estado: 'error'; error: string };

const precio = (m: ModeloIa) => `US$${m.entradaUsd} / ${m.salidaUsd} por millón`;

export default function ModelosIaClient() {
  const [datos, setDatos] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegidos, setElegidos] = useState<Partial<Record<UsoIa, ModelosDeUso>>>({});
  const [pruebas, setPruebas] = useState<Record<string, Prueba>>({});
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = (d: Estado) => {
    setDatos(d);
    setElegidos(Object.fromEntries(d.usos.map((u) => [u.uso, u.actual])));
  };

  useEffect(() => {
    fetch('/api/admin/ia')
      .then(async (r) => (r.ok ? cargar(await r.json()) : setError((await r.json().catch(() => ({}))).error ?? 'No se pudo cargar.')))
      .catch(() => setError('No se pudo cargar.'));
  }, []);

  const cambiado = useMemo(() => datos?.usos.some((u) => {
    const e = elegidos[u.uso];
    return e && (e.principal !== u.actual.principal || e.respaldo !== u.actual.respaldo);
  }) ?? false, [datos, elegidos]);

  const conClaude = Object.values(elegidos).some((e) => e?.principal.startsWith('anthropic/') || e?.respaldo.startsWith('anthropic/'));

  const probar = async (id: string) => {
    setPruebas((p) => ({ ...p, [id]: { estado: 'probando' } }));
    try {
      const r = await fetch('/api/admin/ia/probar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      });
      const j = await r.json();
      setPruebas((p) => ({ ...p, [id]: j.ok ? { estado: 'ok', ms: j.ms } : { estado: 'error', error: j.error ?? 'No respondió.' } }));
    } catch {
      setPruebas((p) => ({ ...p, [id]: { estado: 'error', error: 'No se pudo probar.' } }));
    }
  };

  const guardar = async () => {
    setGuardando(true);
    setAviso(null);
    try {
      const r = await fetch('/api/admin/ia', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(elegidos),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'No se pudo guardar.');
      cargar(j);
      setAviso('Guardado. El próximo mensaje ya usa estos modelos.');
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  if (error) return <Box sx={{ p: 3 }}><Alert severity="error">{error}</Alert></Box>;
  if (!datos) return <Box sx={{ p: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress size={24} /></Box>;

  const elegir = (uso: UsoIa, campo: keyof ModelosDeUso, id: string) =>
    setElegidos((e) => ({ ...e, [uso]: { ...(e[uso] as ModelosDeUso), [campo]: id } }));

  const porProveedor = (['Anthropic', 'Google'] as const).map((p) => ({ p, lista: datos.modelos.filter((m) => m.proveedor === p) }));

  const selector = (uso: UsoIa, campo: keyof ModelosDeUso, etiqueta: string) => {
    const id = elegidos[uso]?.[campo] ?? '';
    const prueba = pruebas[id];
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField select size="small" fullWidth label={etiqueta} value={id} sx={INPUT}
            onChange={(e) => elegir(uso, campo, e.target.value)}
            slotProps={{ select: { renderValue: (v) => datos.modelos.find((m) => m.id === v)?.nombre ?? String(v) } }}>
            {porProveedor.flatMap(({ p, lista }) => [
              <ListSubheader key={p} sx={{ lineHeight: '32px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{p}</ListSubheader>,
              ...lista.map((m) => (
                <MenuItem key={m.id} value={m.id} sx={{ display: 'block', py: 0.75 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>{m.nombre}</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{m.nota} · {precio(m)}</Typography>
                </MenuItem>
              )),
            ])}
          </TextField>
          <Button size="small" variant="outlined" onClick={() => probar(id)} disabled={!id || prueba?.estado === 'probando'}
            sx={{ height: 40, flexShrink: 0, borderRadius: '8px', textTransform: 'none' }}>
            {prueba?.estado === 'probando' ? <CircularProgress size={14} /> : 'Probar'}
          </Button>
        </Box>
        {prueba && prueba.estado !== 'probando' && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, fontSize: '0.75rem', color: prueba.estado === 'ok' ? '#047857' : '#b91c1c' }}>
            {prueba.estado === 'ok' ? <CheckCircle2 size={13} style={{ marginTop: 2, flexShrink: 0 }} /> : <XCircle size={13} style={{ marginTop: 2, flexShrink: 0 }} />}
            <span>{prueba.estado === 'ok' ? `Contestó en ${(prueba.ms / 1000).toFixed(1)} s` : prueba.error}</span>
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ maxWidth: 880, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Bot size={20} /> Modelos de IA
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5, maxWidth: 640 }}>
          Qué modelo usa cada parte de Zero. Si el principal falla, contesta el respaldo. Aplica a todas las empresas.
        </Typography>
      </Box>

      {!datos.gateway && (
        <Alert severity="warning">Este despliegue no tiene AI Gateway: solo funcionan los modelos cuyo proveedor tenga su llave puesta.</Alert>
      )}
      {conClaude && (
        <Alert severity="info" icon={<Zap size={18} />}>
          Los modelos de Claude piden créditos pagados en el AI Gateway de Vercel (AI → Top up). Sin ellos responden con error y contesta el respaldo. Pulsa «Probar» para saberlo.
        </Alert>
      )}

      {datos.usos.map((u) => (
        <Box key={u.uso} sx={{ ...CARD, p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
          <Box>
            <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700 }}>{u.nombre}</Typography>
            <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>{u.descripcion}</Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
            {selector(u.uso, 'principal', 'Principal')}
            {selector(u.uso, 'respaldo', 'Respaldo')}
          </Box>
        </Box>
      ))}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {aviso && <Typography sx={{ fontSize: '0.8125rem', color: aviso.startsWith('Guardado') ? '#047857' : '#b91c1c' }}>{aviso}</Typography>}
        <Button variant="contained" disableElevation onClick={guardar} disabled={!cambiado || guardando}
          sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600, minWidth: 120 }}>
          {guardando ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Guardar'}
        </Button>
      </Box>
    </Box>
  );
}

'use client';

/**
 * Activos fijos: listado + alta + botón de "Generar depreciaciones".
 *
 * El listado enseña por activo su costo, la depreciación acumulada y el valor en
 * libros (costo − acumulada). Los importes del alta se escriben en pesos y se
 * pasan a centavos con Math.round, para no arrastrar el error de coma flotante
 * de `parseFloat(x) * 100`.
 */

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';

interface ActivoFijo {
  id: number;
  nombre: string;
  costoCents: number;
  valorResidualCents: number;
  vidaUtilMeses: number;
  fechaAdquisicion: string;
  activa: boolean;
  acumuladaCents: number;
  valorLibrosCents: number;
  cuotasHechas: number;
}

const fmtDOP = (cents: number) =>
  `RD$${(cents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Pesos en texto → centavos enteros, sin el error de coma flotante de ×100. */
function aCentavos(pesos: string): number {
  const n = parseFloat(pesos);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Vida útil en meses → "N años M meses" para leerlo rápido. */
function vidaLegible(meses: number): string {
  const a = Math.floor(meses / 12);
  const m = meses % 12;
  const partes = [];
  if (a > 0) partes.push(`${a} ${a === 1 ? 'año' : 'años'}`);
  if (m > 0) partes.push(`${m} ${m === 1 ? 'mes' : 'meses'}`);
  return partes.join(' ') || `${meses} meses`;
}

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;

export function ActivosFijosClient({
  activos, hoy, puedeGestionar,
}: { activos: ActivoFijo[]; hoy: string; puedeGestionar: boolean }) {
  const router = useRouter();

  // Alta
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [costo, setCosto] = useState('');
  const [residual, setResidual] = useState('');
  const [vida, setVida] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [guardando, setGuardando] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  // Generar
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  const costoCents = aCentavos(costo);
  const residualCents = residual.trim() === '' ? 0 : aCentavos(residual);
  const vidaMeses = parseInt(vida, 10);
  const cuotaMensual = useMemo(() => {
    if (costoCents <= 0 || !Number.isFinite(vidaMeses) || vidaMeses <= 0) return null;
    const base = costoCents - residualCents;
    if (base <= 0) return null;
    return Math.round(base / vidaMeses);
  }, [costoCents, residualCents, vidaMeses]);

  const puedeGuardar =
    nombre.trim() !== '' && costoCents > 0 && residualCents >= 0 &&
    residualCents < costoCents && Number.isFinite(vidaMeses) && vidaMeses > 0 &&
    fecha !== '' && !guardando;

  async function registrar() {
    setErrorAlta(null);
    setGuardando(true);
    try {
      const res = await fetch('/api/contabilidad/activos-fijos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          costoCents,
          valorResidualCents: residualCents,
          vidaUtilMeses: vidaMeses,
          fechaAdquisicion: fecha,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorAlta(data.error ?? 'No se pudo registrar el activo.');
        setGuardando(false);
        return;
      }
      setNombre(''); setCosto(''); setResidual(''); setVida(''); setFecha(hoy);
      setAbierto(false); setGuardando(false);
      router.refresh();
    } catch {
      setErrorAlta('No se pudo conectar. Inténtalo de nuevo.');
      setGuardando(false);
    }
  }

  async function generar() {
    setAviso(null);
    setGenerando(true);
    try {
      const res = await fetch('/api/contabilidad/activos-fijos/generar', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setAviso({ tipo: 'error', texto: data.error ?? 'No se pudieron generar las depreciaciones.' });
        setGenerando(false);
        return;
      }
      setAviso({
        tipo: 'success',
        texto: data.creados > 0
          ? `Se generaron ${data.creados} ${data.creados === 1 ? 'cuota' : 'cuotas'} de depreciación.`
          : 'Todo al día: no había depreciaciones pendientes.',
      });
      setGenerando(false);
      router.refresh();
    } catch {
      setAviso({ tipo: 'error', texto: 'No se pudo conectar. Inténtalo de nuevo.' });
      setGenerando(false);
    }
  }

  const celda = { fontSize: '0.8125rem', color: '#374151', px: 1.5, py: 1.25 } as const;
  const celdaMonto = { ...celda, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const;
  const th = { fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', px: 1.5, py: 1 } as const;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Acciones */}
      {puedeGestionar && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          <Button
            variant="contained" onClick={() => setAbierto((v) => !v)}
            startIcon={<Plus style={{ width: 16, height: 16 }} />}
            sx={{ bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}
          >
            Registrar activo
          </Button>
          <Button
            variant="outlined" onClick={generar} disabled={generando}
            startIcon={<RefreshCw style={{ width: 16, height: 16 }} />}
            sx={{ color: '#0f766e', borderColor: '#99f6e4' }}
          >
            {generando ? 'Generando…' : 'Generar depreciaciones'}
          </Button>
        </Box>
      )}

      {aviso && (
        <Alert
          severity={aviso.tipo}
          icon={aviso.tipo === 'success'
            ? <CheckCircle2 style={{ width: 16, height: 16 }} />
            : <AlertTriangle style={{ width: 16, height: 16 }} />}
        >
          {aviso.texto}
        </Alert>
      )}

      {/* Formulario de alta */}
      {puedeGestionar && abierto && (
        <Box sx={{ ...CARD, p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>Nuevo activo fijo</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
            <TextField
              label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej.: Edificio principal" sx={{ flex: 1, minWidth: 240 }}
            />
            <TextField
              label="Fecha de adquisición" type="date" value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 190 }}
            />
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
            <TextField
              label="Costo (RD$)" type="number" value={costo}
              onChange={(e) => setCosto(e.target.value)} placeholder="0.00"
              slotProps={{ htmlInput: { min: 0, step: '0.01' } }} sx={{ width: 200 }}
            />
            <TextField
              label="Valor residual (RD$)" type="number" value={residual}
              onChange={(e) => setResidual(e.target.value)} placeholder="0.00"
              helperText="Opcional. Lo que valdrá al final."
              slotProps={{ htmlInput: { min: 0, step: '0.01' } }} sx={{ width: 200 }}
            />
            <TextField
              label="Vida útil (meses)" type="number" value={vida}
              onChange={(e) => setVida(e.target.value)} placeholder="Ej.: 240"
              helperText={Number.isFinite(vidaMeses) && vidaMeses > 0 ? vidaLegible(vidaMeses) : 'En meses'}
              slotProps={{ htmlInput: { min: 1, step: '1' } }} sx={{ width: 170 }}
            />
          </Box>

          {cuotaMensual !== null && (
            <Typography sx={{ fontSize: '0.8125rem', color: '#0f766e' }}>
              Depreciación mensual estimada: <strong>{fmtDOP(cuotaMensual)}</strong>
            </Typography>
          )}

          {errorAlta && (
            <Alert severity="error" icon={<AlertTriangle style={{ width: 16, height: 16 }} />}>{errorAlta}</Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              variant="contained" onClick={registrar} disabled={!puedeGuardar}
              sx={{ bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}
            >
              {guardando ? 'Guardando…' : 'Guardar activo'}
            </Button>
            <Button color="inherit" onClick={() => setAbierto(false)} sx={{ color: '#6b7280' }}>
              Cancelar
            </Button>
          </Box>
        </Box>
      )}

      {/* Listado */}
      {activos.length === 0 ? (
        <Typography sx={{ ...CARD, px: 2, py: 5, textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
          Todavía no hay activos fijos registrados.
        </Typography>
      ) : (
        <Box sx={{ ...CARD, overflow: 'hidden' }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Box component="table" sx={{ width: '100%', minWidth: 820, borderCollapse: 'collapse' }}>
              <Box component="thead" sx={{ bgcolor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <Box component="tr">
                  <Box component="th" sx={{ ...th, textAlign: 'left' }}>Activo</Box>
                  <Box component="th" sx={{ ...th, textAlign: 'left' }}>Adquirido</Box>
                  <Box component="th" sx={{ ...th, textAlign: 'left' }}>Vida útil</Box>
                  <Box component="th" sx={{ ...th, textAlign: 'right' }}>Costo</Box>
                  <Box component="th" sx={{ ...th, textAlign: 'right' }}>Depreciación acum.</Box>
                  <Box component="th" sx={{ ...th, textAlign: 'right' }}>Valor en libros</Box>
                </Box>
              </Box>
              <Box component="tbody">
                {activos.map((a) => (
                  <Box component="tr" key={a.id} sx={{ borderBottom: '1px solid #f3f4f6' }}>
                    <Box component="td" sx={celda}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <span>{a.nombre}</span>
                        {!a.activa && (
                          <Chip label="Dada de baja" size="small" sx={{ height: 20, fontSize: '0.6875rem', bgcolor: '#f3f4f6', color: '#6b7280' }} />
                        )}
                      </Box>
                    </Box>
                    <Box component="td" sx={celda}>{a.fechaAdquisicion}</Box>
                    <Box component="td" sx={celda}>
                      {vidaLegible(a.vidaUtilMeses)}
                      <Typography component="span" sx={{ display: 'block', fontSize: '0.6875rem', color: '#9ca3af' }}>
                        {a.cuotasHechas} de {a.vidaUtilMeses} cuotas
                      </Typography>
                    </Box>
                    <Box component="td" sx={celdaMonto}>{fmtDOP(a.costoCents)}</Box>
                    <Box component="td" sx={celdaMonto}>{fmtDOP(a.acumuladaCents)}</Box>
                    <Box component="td" sx={{ ...celdaMonto, fontWeight: 600, color: '#111827' }}>{fmtDOP(a.valorLibrosCents)}</Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

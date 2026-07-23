'use client';

/**
 * Formulario de asiento manual. El cuadre (debe == haber) se calcula en vivo
 * mientras el usuario escribe, y el botón de guardar no se habilita hasta que
 * cuadre: es la misma regla que protege la API, adelantada a la pantalla para
 * que nadie llegue a enviar un asiento descuadrado.
 *
 * Los importes se escriben en pesos y se convierten a centavos al enviar. La
 * conversión pasa por Math.round para no arrastrar el error de coma flotante de
 * `parseFloat(x) * 100`.
 */

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Alert from '@mui/material/Alert';

interface Cuenta { id: number; codigo: string; nombre: string }

interface LineaForm {
  cuentaId: string; // '' o el id como string (value del Select)
  debe:     string; // pesos como texto
  haber:    string; // pesos como texto
  descripcion: string;
}

const lineaVacia = (): LineaForm => ({ cuentaId: '', debe: '', haber: '', descripcion: '' });

/** Pesos en texto → centavos enteros, sin el error de coma flotante de ×100. */
function aCentavos(pesos: string): number {
  const n = parseFloat(pesos);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const fmtDOP = (cents: number) =>
  `RD$${(cents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;

export function NuevoAsientoClient({ cuentas, hoy }: { cuentas: Cuenta[]; hoy: string }) {
  const router = useRouter();
  const [fecha, setFecha] = useState(hoy);
  const [concepto, setConcepto] = useState('');
  const [lineas, setLineas] = useState<LineaForm[]>([lineaVacia(), lineaVacia()]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalDebe = useMemo(() => lineas.reduce((s, l) => s + aCentavos(l.debe), 0), [lineas]);
  const totalHaber = useMemo(() => lineas.reduce((s, l) => s + aCentavos(l.haber), 0), [lineas]);
  const diferencia = totalDebe - totalHaber;
  const cuadra = diferencia === 0 && totalDebe > 0;

  // Todas las líneas con importe tienen cuenta elegida.
  const lineasConImporte = lineas.filter((l) => aCentavos(l.debe) > 0 || aCentavos(l.haber) > 0);
  const todasConCuenta = lineasConImporte.every((l) => l.cuentaId !== '');
  const puedeGuardar = cuadra && concepto.trim() !== '' && lineasConImporte.length >= 2 && todasConCuenta && !enviando;

  function actualizar(i: number, cambios: Partial<LineaForm>) {
    setLineas((prev) => prev.map((l, j) => (j === i ? { ...l, ...cambios } : l)));
  }

  /** Al escribir en una columna se limpia la otra: una línea es debe O haber. */
  function ponerDebe(i: number, valor: string) {
    actualizar(i, { debe: valor, ...(valor && aCentavos(valor) > 0 ? { haber: '' } : {}) });
  }
  function ponerHaber(i: number, valor: string) {
    actualizar(i, { haber: valor, ...(valor && aCentavos(valor) > 0 ? { debe: '' } : {}) });
  }

  function agregarLinea() {
    setLineas((prev) => [...prev, lineaVacia()]);
  }
  function quitarLinea(i: number) {
    setLineas((prev) => (prev.length <= 2 ? prev : prev.filter((_, j) => j !== i)));
  }

  async function guardar() {
    setError(null);
    setEnviando(true);
    try {
      const payload = {
        fecha,
        concepto: concepto.trim(),
        lineas: lineasConImporte.map((l) => ({
          cuentaId: Number(l.cuentaId),
          debeCents: aCentavos(l.debe),
          haberCents: aCentavos(l.haber),
          descripcion: l.descripcion.trim() || null,
        })),
      };
      const res = await fetch('/api/contabilidad/asientos-manuales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'No se pudo guardar el asiento.');
        setEnviando(false);
        return;
      }
      // Al libro diario, donde el asiento nuevo ya aparece.
      router.push('/dashboard/contabilidad/libro-diario');
    } catch {
      setError('No se pudo conectar. Inténtalo de nuevo.');
      setEnviando(false);
    }
  }

  const celdaMonto = { whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } as const;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Encabezado: fecha + concepto */}
      <Box sx={{ ...CARD, p: 2, display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        <TextField
          label="Fecha" type="date" value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 180 }}
        />
        <TextField
          label="Concepto" value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder="Ej.: Pago de alquiler de julio"
          sx={{ flex: 1, minWidth: 260 }}
        />
      </Box>

      {/* Líneas */}
      <Box sx={{ ...CARD, overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Box sx={{ minWidth: 720 }}>
            {/* Cabecera */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.2fr 1.6fr 40px', gap: 1, px: 2, py: 1.25, borderBottom: '1px solid #e5e7eb', bgcolor: '#f9fafb' }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280' }}>Cuenta</Typography>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textAlign: 'right' }}>Debe</Typography>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textAlign: 'right' }}>Haber</Typography>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280' }}>Detalle (opcional)</Typography>
              <Box />
            </Box>

            {lineas.map((l, i) => (
              <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.2fr 1.6fr 40px', gap: 1, px: 2, py: 1, alignItems: 'center', borderBottom: '1px solid #f3f4f6' }}>
                <TextField
                  select size="small" value={l.cuentaId}
                  onChange={(e) => actualizar(i, { cuentaId: e.target.value })}
                >
                  <MenuItem value="">Elige…</MenuItem>
                  {cuentas.map((c) => (
                    <MenuItem key={c.id} value={String(c.id)}>{c.codigo} · {c.nombre}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  size="small" type="number" value={l.debe}
                  onChange={(e) => ponerDebe(i, e.target.value)}
                  placeholder="0.00"
                  slotProps={{ htmlInput: { min: 0, step: '0.01', style: { textAlign: 'right' } } }}
                />
                <TextField
                  size="small" type="number" value={l.haber}
                  onChange={(e) => ponerHaber(i, e.target.value)}
                  placeholder="0.00"
                  slotProps={{ htmlInput: { min: 0, step: '0.01', style: { textAlign: 'right' } } }}
                />
                <TextField
                  size="small" value={l.descripcion}
                  onChange={(e) => actualizar(i, { descripcion: e.target.value })}
                  placeholder="—"
                />
                <IconButton
                  size="small" onClick={() => quitarLinea(i)}
                  disabled={lineas.length <= 2}
                  aria-label="Quitar línea"
                  sx={{ color: '#9ca3af', '&:hover': { color: '#dc2626' } }}
                >
                  <Trash2 style={{ width: 16, height: 16 }} />
                </IconButton>
              </Box>
            ))}

            {/* Totales */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.2fr 1.6fr 40px', gap: 1, px: 2, py: 1.25, borderTop: '2px solid #d1d5db', bgcolor: '#f9fafb', alignItems: 'center' }}>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151' }}>Totales</Typography>
              <Typography sx={{ ...celdaMonto, fontSize: '0.8125rem', fontWeight: 600, textAlign: 'right', color: '#111827' }}>
                {fmtDOP(totalDebe)}
              </Typography>
              <Typography sx={{ ...celdaMonto, fontSize: '0.8125rem', fontWeight: 600, textAlign: 'right', color: '#111827' }}>
                {fmtDOP(totalHaber)}
              </Typography>
              <Box sx={{ gridColumn: 'span 2' }} />
            </Box>
          </Box>
        </Box>
      </Box>

      <Button
        type="button" onClick={agregarLinea}
        startIcon={<Plus style={{ width: 16, height: 16 }} />}
        sx={{ alignSelf: 'flex-start', color: '#0f766e' }}
      >
        Agregar línea
      </Button>

      {/* Indicador de cuadre */}
      {totalDebe > 0 || totalHaber > 0 ? (
        cuadra ? (
          <Alert severity="success" icon={<CheckCircle2 style={{ width: 16, height: 16 }} />}>
            <strong>El asiento cuadra.</strong> Debe y haber suman {fmtDOP(totalDebe)}.
          </Alert>
        ) : (
          <Alert severity="warning" icon={<AlertTriangle style={{ width: 16, height: 16 }} />}>
            {diferencia !== 0
              ? <>El asiento no cuadra: hay una diferencia de <strong>{fmtDOP(Math.abs(diferencia))}</strong> entre el debe y el haber.</>
              : 'Añade importes en debe y haber.'}
          </Alert>
        )
      ) : null}

      {error && (
        <Alert severity="error" icon={<AlertTriangle style={{ width: 16, height: 16 }} />}>{error}</Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <Button
          variant="contained" onClick={guardar} disabled={!puedeGuardar}
          sx={{ bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}
        >
          {enviando ? 'Guardando…' : 'Guardar asiento'}
        </Button>
        <Button
          color="inherit" onClick={() => router.push('/dashboard/contabilidad/libro-diario')}
          sx={{ color: '#6b7280' }}
        >
          Cancelar
        </Button>
      </Box>
    </Box>
  );
}

'use client';

/**
 * Cierre de ejercicio: eliges un año, previsualizas qué cuentas se cierran y el
 * resultado, y confirmas. Los cierres pasados se listan con opción de reabrir el
 * más reciente. El asiento de cierre lo arma el servidor (partida doble); aquí
 * solo se dispara y se muestra el resultado.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Unlock, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';

interface SaldoResultado { cuentaId: number; codigo: string; nombre: string; netoCents: number }
interface Preview {
  ejercicio: number; fechaCierre: string; saldos: SaldoResultado[];
  resultadoCents: number; bloqueo: string | null; yaCerrado: boolean;
}
interface Cierre { ejercicio: number; fechaCierre: string; resultadoCents: number; asientoId: number | null; esUltimo: boolean }

const fmtDOP = (cents: number) =>
  `RD$${(cents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;

export function CierreEjercicioClient({
  cierres, aniosDisponibles, puedeGestionar,
}: { cierres: Cierre[]; aniosDisponibles: number[]; puedeGestionar: boolean }) {
  const router = useRouter();
  const [anio, setAnio] = useState<string>(aniosDisponibles[0] != null ? String(aniosDisponibles[0]) : '');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [cargando, setCargando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  async function previsualizar(ej: string) {
    setAviso(null); setPreview(null);
    if (!ej) return;
    setCargando(true);
    try {
      const res = await fetch(`/api/contabilidad/cierre-ejercicio?ejercicio=${ej}`);
      const data = await res.json();
      if (!res.ok) { setAviso({ tipo: 'error', texto: data.error ?? 'No se pudo previsualizar.' }); return; }
      setPreview(data);
    } catch { setAviso({ tipo: 'error', texto: 'No se pudo conectar.' }); }
    finally { setCargando(false); }
  }

  async function cerrar() {
    if (!preview) return;
    setTrabajando(true); setAviso(null);
    try {
      const res = await fetch('/api/contabilidad/cierre-ejercicio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ejercicio: preview.ejercicio }),
      });
      const data = await res.json();
      if (!res.ok) { setAviso({ tipo: 'error', texto: data.error ?? 'No se pudo cerrar.' }); setTrabajando(false); return; }
      setAviso({ tipo: 'success', texto: `Ejercicio ${preview.ejercicio} cerrado. Resultado: ${fmtDOP(data.resultadoCents)}.` });
      setPreview(null); setTrabajando(false);
      router.refresh();
    } catch { setAviso({ tipo: 'error', texto: 'No se pudo conectar.' }); setTrabajando(false); }
  }

  async function reabrir(ejercicio: number) {
    setTrabajando(true); setAviso(null);
    try {
      const res = await fetch('/api/contabilidad/cierre-ejercicio/reabrir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ejercicio }),
      });
      const data = await res.json();
      if (!res.ok) { setAviso({ tipo: 'error', texto: data.error ?? 'No se pudo reabrir.' }); setTrabajando(false); return; }
      setAviso({ tipo: 'success', texto: `Ejercicio ${ejercicio} reabierto.` });
      setTrabajando(false);
      router.refresh();
    } catch { setAviso({ tipo: 'error', texto: 'No se pudo conectar.' }); setTrabajando(false); }
  }

  const celda = { fontSize: '0.8125rem', color: '#374151', px: 1.5, py: 1 } as const;
  const th = { fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', px: 1.5, py: 1 } as const;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {aviso && (
        <Alert severity={aviso.tipo} icon={aviso.tipo === 'success' ? <CheckCircle2 style={{ width: 16, height: 16 }} /> : <AlertTriangle style={{ width: 16, height: 16 }} />}>
          {aviso.texto}
        </Alert>
      )}

      {/* Cerrar un ejercicio */}
      {puedeGestionar && (
        <Box sx={{ ...CARD, p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>Cerrar un ejercicio</Typography>

          {aniosDisponibles.length === 0 ? (
            <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>
              No hay ejercicios con resultados pendientes de cerrar.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
              <TextField
                select size="small" label="Año" value={anio}
                onChange={(e) => { setAnio(e.target.value); setPreview(null); setAviso(null); }}
                sx={{ width: 140 }}
              >
                {aniosDisponibles.map((a) => <MenuItem key={a} value={String(a)}>{a}</MenuItem>)}
              </TextField>
              <Button variant="outlined" disabled={!anio || cargando} onClick={() => previsualizar(anio)} sx={{ color: '#0f766e', borderColor: '#99f6e4' }}>
                {cargando ? 'Calculando…' : 'Previsualizar'}
              </Button>
            </Box>
          )}

          {preview && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {preview.saldos.length > 0 && (
                <Box sx={{ ...CARD, overflow: 'hidden' }}>
                  <Box sx={{ overflowX: 'auto' }}>
                    <Box component="table" sx={{ width: '100%', minWidth: 480, borderCollapse: 'collapse' }}>
                      <Box component="thead" sx={{ bgcolor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        <Box component="tr">
                          <Box component="th" sx={{ ...th, textAlign: 'left' }}>Cuenta que se cierra</Box>
                          <Box component="th" sx={{ ...th, textAlign: 'right' }}>Saldo</Box>
                        </Box>
                      </Box>
                      <Box component="tbody">
                        {preview.saldos.map((s) => (
                          <Box component="tr" key={s.cuentaId} sx={{ borderBottom: '1px solid #f3f4f6' }}>
                            <Box component="td" sx={celda}>{s.codigo} · {s.nombre}</Box>
                            <Box component="td" sx={{ ...celda, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(Math.abs(s.netoCents))}</Box>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  </Box>
                </Box>
              )}

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {preview.resultadoCents >= 0
                  ? <TrendingUp style={{ width: 18, height: 18, color: '#047857' }} />
                  : <TrendingDown style={{ width: 18, height: 18, color: '#b91c1c' }} />}
                <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: preview.resultadoCents >= 0 ? '#047857' : '#b91c1c' }}>
                  {preview.resultadoCents >= 0 ? 'Utilidad' : 'Pérdida'} del ejercicio {preview.ejercicio}: {fmtDOP(Math.abs(preview.resultadoCents))}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>
                Se registrará a 3102 Resultados acumulados con fecha {preview.fechaCierre}.
              </Typography>

              {preview.bloqueo ? (
                <Alert severity="warning" icon={<AlertTriangle style={{ width: 16, height: 16 }} />}>{preview.bloqueo}</Alert>
              ) : (
                <Button
                  variant="contained" disabled={trabajando} onClick={cerrar}
                  startIcon={<Lock style={{ width: 16, height: 16 }} />}
                  sx={{ alignSelf: 'flex-start', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}
                >
                  {trabajando ? 'Cerrando…' : `Confirmar cierre de ${preview.ejercicio}`}
                </Button>
              )}
            </Box>
          )}
        </Box>
      )}

      {/* Cierres registrados */}
      <Box sx={{ ...CARD, overflow: 'hidden' }}>
        <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827', px: 2, pt: 2, pb: 1 }}>Ejercicios cerrados</Typography>
        {cierres.length === 0 ? (
          <Typography sx={{ px: 2, pb: 2.5, fontSize: '0.875rem', color: '#6b7280' }}>Todavía no se ha cerrado ningún ejercicio.</Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Box component="table" sx={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
              <Box component="thead" sx={{ bgcolor: '#f9fafb', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}>
                <Box component="tr">
                  <Box component="th" sx={{ ...th, textAlign: 'left' }}>Ejercicio</Box>
                  <Box component="th" sx={{ ...th, textAlign: 'left' }}>Cerrado al</Box>
                  <Box component="th" sx={{ ...th, textAlign: 'right' }}>Resultado</Box>
                  <Box component="th" sx={{ ...th, textAlign: 'right' }}></Box>
                </Box>
              </Box>
              <Box component="tbody">
                {cierres.map((c) => (
                  <Box component="tr" key={c.ejercicio} sx={{ borderBottom: '1px solid #f3f4f6' }}>
                    <Box component="td" sx={{ ...celda, fontWeight: 600, color: '#111827' }}>{c.ejercicio}</Box>
                    <Box component="td" sx={celda}>{c.fechaCierre}</Box>
                    <Box component="td" sx={{ ...celda, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      <Chip
                        size="small" label={`${c.resultadoCents >= 0 ? 'Utilidad' : 'Pérdida'} ${fmtDOP(Math.abs(c.resultadoCents))}`}
                        sx={{ height: 22, fontSize: '0.6875rem', bgcolor: c.resultadoCents >= 0 ? '#ecfdf5' : '#fef2f2', color: c.resultadoCents >= 0 ? '#047857' : '#b91c1c' }}
                      />
                    </Box>
                    <Box component="td" sx={{ ...celda, textAlign: 'right' }}>
                      {puedeGestionar && c.esUltimo && (
                        <Button
                          size="small" disabled={trabajando} onClick={() => reabrir(c.ejercicio)}
                          startIcon={<Unlock style={{ width: 14, height: 14 }} />}
                          sx={{ color: '#6b7280' }}
                        >
                          Reabrir
                        </Button>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

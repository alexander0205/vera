'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Search, ExternalLink, Download, Printer,
} from 'lucide-react';
import {
  ESTADO_NCF_META, VEREDICTO_META, ESTADOS_ERROR,
  type EstadoNcf, type Veredicto,
} from '@/lib/contabilidad/estados';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Alert from '@mui/material/Alert';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CircularProgress from '@mui/material/CircularProgress';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';

// El tipo de fila viaja por JSON desde la API; se declara aquí para no importar
// la capa de datos (que arrastraría drizzle y el cliente de ecf-api al bundle).
interface FilaConsulta {
  numero: number;
  encf: string;
  estado: EstadoNcf;
  motivo: string | null;
  fecha: string | null;
  cliente: string | null;
  rncComprador: string | null;
  montoTotal: number | null;
  trackId: string | null;
  urlVerificacion: string | null;
  documentoId: number | null;
  proveedor: { estado: string; enviadoEn: string | null; ambiente: string | null } | null;
}
interface ResumenConsulta {
  total: number;
  porEstado: Record<string, number>;
  fiscales: number;
  conError: number;
  tasaExito: number;
}

const TIPOS = [
  { value: '31', label: '31 — Crédito fiscal' },
  { value: '32', label: '32 — Consumo' },
  { value: '33', label: '33 — Nota de débito' },
  { value: '34', label: '34 — Nota de crédito' },
  { value: '41', label: '41 — Compras' },
  { value: '43', label: '43 — Gastos menores' },
  { value: '44', label: '44 — Régimen especial' },
  { value: '45', label: '45 — Gubernamental' },
  { value: '46', label: '46 — Exportación' },
  { value: '47', label: '47 — Pago exterior' },
];

/** Oculta el bloque al imprimir (equivalente MUI del antiguo `print:hidden`). */
const NO_PRINT = { '@media print': { display: 'none' } } as const;

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;

function dop(cents: number | null) {
  if (cents == null) return '—';
  return (cents / 100).toLocaleString('es-DO', { style: 'currency', currency: 'DOP' });
}
function fecha(f: string | null) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es-DO', {
    timeZone: 'America/Santo_Domingo', day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function ConsultaNcfClient() {
  const [modo, setModo] = useState<'rango' | 'encf'>('rango');
  const [tipo, setTipo] = useState('32');
  const [desde, setDesde] = useState('1');
  const [hasta, setHasta] = useState('100');
  const [encf, setEncf] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaConsulta[] | null>(null);
  const [resumen, setResumen] = useState<ResumenConsulta | null>(null);
  const [soloProblemas, setSoloProblemas] = useState(false);
  const [titulo, setTitulo] = useState('');

  async function consultar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true); setError(null);
    try {
      const qs = modo === 'encf'
        ? `encf=${encodeURIComponent(encf.trim())}`
        : `tipo=${tipo}&desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
      const res = await fetch(`/api/contabilidad/consulta-ncf?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo consultar');
      setFilas(json.filas); setResumen(json.resumen);
      setTitulo(modo === 'encf' ? encf.trim().toUpperCase() : `Comprobantes E${tipo} del ${desde} al ${hasta}`);
    } catch (err) {
      setError((err as Error).message); setFilas(null); setResumen(null);
    } finally {
      setCargando(false);
    }
  }

  const visibles = filas?.filter(f => !soloProblemas || ESTADOS_ERROR.includes(f.estado)) ?? [];

  // Conteos por veredicto — es lo que la contadora necesita de un vistazo.
  const porVeredicto = (v: Veredicto) =>
    filas?.filter(f => ESTADO_NCF_META[f.estado]?.veredicto === v).length ?? 0;

  function exportarCsv() {
    if (!visibles.length) return;
    const head = ['Comprobante', '¿Se declara?', 'Resultado', 'Qué pasó', 'Fecha', 'Cliente', 'RNC', 'Monto DOP'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      head.join(','),
      ...visibles.map(f => {
        const m = ESTADO_NCF_META[f.estado];
        return [
          f.encf, VEREDICTO_META[m.veredicto].label, m.label,
          f.motivo ?? m.queSignifica, fecha(f.fecha),
          f.cliente ?? '', f.rncComprador ?? '',
          f.montoTotal != null ? (f.montoTotal / 100).toFixed(2) : '',
        ].map(esc).join(',');
      }),
    ].join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `comprobantes-${modo === 'encf' ? encf : `E${tipo}-${desde}-${hasta}`}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* ── Buscador ─────────────────────────────────────────────────────── */}
      <Box component="form" onSubmit={consultar} sx={{ ...CARD, p: 2, ...NO_PRINT }}>
        <Tabs
          value={modo}
          onChange={(_, v: 'rango' | 'encf') => setModo(v)}
          sx={{ mb: 2 }}
        >
          <Tab value="rango" label="Revisar un rango" />
          <Tab value="encf" label="Buscar un comprobante" />
        </Tabs>

        {modo === 'rango' ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 1.5 }}>
            <FormControl size="small" sx={{ minWidth: 210 }}>
              <InputLabel id="tipo-label">Tipo de comprobante</InputLabel>
              <Select
                labelId="tipo-label"
                label="Tipo de comprobante"
                value={tipo}
                onChange={e => setTipo(e.target.value)}
              >
                {TIPOS.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              label="Del número" type="number" value={desde}
              onChange={e => setDesde(e.target.value)}
              slotProps={{ htmlInput: { min: 1 } }}
              sx={{ width: 120 }}
            />
            <TextField
              label="Al número" type="number" value={hasta}
              onChange={e => setHasta(e.target.value)}
              slotProps={{ htmlInput: { min: 1 } }}
              sx={{ width: 120 }}
            />
            <Button
              type="submit" variant="contained" disabled={cargando}
              startIcon={cargando
                ? <CircularProgress size={16} color="inherit" />
                : <Search style={{ width: 16, height: 16 }} />}
              sx={{ px: 2, py: 1 }}
            >
              Revisar
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 1.5 }}>
            <TextField
              label="Número de comprobante" value={encf}
              onChange={e => setEncf(e.target.value)}
              placeholder="E320000000094"
              sx={{ width: 240, '& input': { fontFamily: 'monospace' } }}
            />
            <Button
              type="submit" variant="contained" disabled={cargando || !encf.trim()}
              startIcon={cargando
                ? <CircularProgress size={16} color="inherit" />
                : <Search style={{ width: 16, height: 16 }} />}
              sx={{ px: 2, py: 1 }}
            >
              Buscar
            </Button>
          </Box>
        )}
        <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 1.5 }}>
          Aparecen todos los números del rango, incluidos los que nunca se usaron — con la explicación de qué pasó con cada uno.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {/* ── Resumen en lenguaje de contabilidad ──────────────────────────── */}
      {resumen && filas && (
        <>
          <Box sx={{ display: 'none', mb: 1.5, '@media print': { display: 'block' } }}>
            <Typography component="h2" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>{titulo}</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
              Consultado el {new Date().toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', dateStyle: 'long' })}
            </Typography>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 1.5 }}>
            <Tarjeta label="Sí se declaran" valor={porVeredicto('declarar')}
                     nota="Válidos en la DGII" tono="ok" />
            <Tarjeta label="No se declaran" valor={porVeredicto('no-declarar')}
                     nota="Nunca llegaron o fueron anulados" tono="muted" />
            <Tarjeta label="Aún no" valor={porVeredicto('esperar')}
                     nota="Esperando respuesta de la DGII" tono="warn" />
            <Tarjeta label="Hay que revisar" valor={porVeredicto('revisar')}
                     nota="Requieren atención de soporte" tono={porVeredicto('revisar') > 0 ? 'error' : 'muted'} />
          </Box>

          {/* Frase de cierre — la respuesta corta */}
          <Alert severity="info" icon={false} sx={{ bgcolor: '#eef2fe', border: '1px solid #c7d2fc', color: '#24377d' }}>
            De los <strong>{resumen.total.toLocaleString('es-DO')}</strong> números revisados,{' '}
            <strong>{porVeredicto('declarar').toLocaleString('es-DO')}</strong> son comprobantes válidos que van en tu declaración.
            {porVeredicto('no-declarar') > 0 && (
              <> Otros <strong>{porVeredicto('no-declarar').toLocaleString('es-DO')}</strong> no se declaran (nunca llegaron a la DGII, se anularon o siguen sin usar).</>
            )}
            {porVeredicto('revisar') > 0 && (
              <> Y <strong>{porVeredicto('revisar')}</strong> necesitan revisión — avísale a soporte.</>
            )}
          </Alert>
        </>
      )}

      {/* ── Ayuda ─────────────────────────────────────────────────────────── */}
      {filas && (
        <Accordion disableGutters elevation={0} sx={{ ...CARD, ...NO_PRINT, '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
              ¿Qué significa cada resultado?
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ borderTop: '1px solid #f3f4f6', pt: 1.5 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
              {(Object.keys(ESTADO_NCF_META) as EstadoNcf[]).map(k => {
                const m = ESTADO_NCF_META[k];
                return (
                  <Box key={k}>
                    <ChipVeredicto veredicto={m.veredicto} label={m.label} />
                    <Typography sx={{ fontSize: '0.875rem', color: '#4b5563', mt: 0.5 }}>{m.queSignifica}</Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 0.25 }}>{m.queHacer}</Typography>
                  </Box>
                );
              })}
            </Box>
          </AccordionDetails>
        </Accordion>
      )}

      {/* ── Resultados ────────────────────────────────────────────────────── */}
      {filas && (
        <Box sx={{ ...CARD, overflow: 'hidden' }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
            <Typography component="h3" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
              {visibles.length.toLocaleString('es-DO')} comprobante{visibles.length === 1 ? '' : 's'}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, ...NO_PRINT }}>
              <FormControlLabel
                control={<Checkbox size="small" checked={soloProblemas} onChange={e => setSoloProblemas(e.target.checked)} />}
                label="Ver solo los que tuvieron problema"
                slotProps={{ typography: { sx: { fontSize: '0.875rem', color: '#4b5563' } } }}
                sx={{ mr: 0 }}
              />
              <Button
                size="small" color="inherit" onClick={() => window.print()}
                startIcon={<Printer style={{ width: 16, height: 16 }} />}
                sx={{ color: '#6b7280', '&:hover': { color: '#374151' } }}
              >
                Imprimir
              </Button>
              <Button
                size="small" onClick={exportarCsv} disabled={!visibles.length}
                startIcon={<Download style={{ width: 16, height: 16 }} />}
              >
                Excel
              </Button>
            </Box>
          </Box>

          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 880 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Comprobante</TableCell>
                  <TableCell>¿Se declara?</TableCell>
                  <TableCell>Resultado</TableCell>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Cliente</TableCell>
                  <TableCell align="right">Monto</TableCell>
                  <TableCell>Qué pasó</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ py: 5, textAlign: 'center', color: '#9ca3af' }}>
                      {soloProblemas ? 'Ningún comprobante con problemas en este rango. Todo en orden ✅' : 'Sin resultados.'}
                    </TableCell>
                  </TableRow>
                ) : visibles.map(f => {
                  const m = ESTADO_NCF_META[f.estado];
                  return (
                    <TableRow key={f.encf} sx={{ verticalAlign: 'top' }}>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#111827', whiteSpace: 'nowrap' }}>{f.encf}</TableCell>
                      <TableCell>
                        <ChipVeredicto veredicto={m.veredicto} label={VEREDICTO_META[m.veredicto].label} />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{m.label}</TableCell>
                      <TableCell sx={{ color: '#6b7280', whiteSpace: 'nowrap' }}>{fecha(f.fecha)}</TableCell>
                      <TableCell>
                        {f.cliente ?? <Box component="span" sx={{ color: '#d1d5db' }}>—</Box>}
                        {f.rncComprador && (
                          <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', fontFamily: 'monospace' }}>{f.rncComprador}</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{dop(f.montoTotal)}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: '#4b5563', maxWidth: 384 }}>
                        <Typography sx={{ fontSize: '0.75rem', color: '#4b5563' }}>{f.motivo ?? m.queSignifica}</Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 0.25 }}>{m.queHacer}</Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 0.75, ...NO_PRINT }}>
                          {f.documentoId && (
                            <Link href={`/dashboard/facturas/${f.documentoId}`} style={{ textDecoration: 'none' }}>
                              <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#3658e1', '&:hover': { textDecoration: 'underline' } }}>
                                Ver factura
                              </Typography>
                            </Link>
                          )}
                          {f.urlVerificacion && (
                            <Box
                              component="a" href={f.urlVerificacion} target="_blank" rel="noopener noreferrer"
                              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', fontWeight: 500, color: '#3658e1', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                            >
                              Verificar en la DGII <ExternalLink style={{ width: 12, height: 12 }} />
                            </Box>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </Box>
      )}
    </Box>
  );
}

/** Chip de veredicto con los colores declarados en la taxonomía de estados. */
function ChipVeredicto({ veredicto, label }: { veredicto: Veredicto; label: string }) {
  const v = VEREDICTO_META[veredicto];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block', fontSize: '0.75rem', fontWeight: 600,
        px: 1, py: 0.25, borderRadius: '9999px', whiteSpace: 'nowrap',
        bgcolor: v.bg, color: v.fg, border: `1px solid ${v.border}`,
      }}
    >
      {label}
    </Box>
  );
}

function Tarjeta({
  label, valor, nota, tono,
}: { label: string; valor: number; nota: string; tono: 'ok' | 'warn' | 'error' | 'muted' }) {
  const color = { ok: '#059669', warn: '#d97706', error: '#dc2626', muted: '#9ca3af' }[tono];
  return (
    <Box sx={{ ...CARD, p: 2 }}>
      <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mb: 0.5 }}>{label}</Typography>
      <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
        {valor.toLocaleString('es-DO')}
      </Typography>
      <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af', mt: 0.25 }}>{nota}</Typography>
    </Box>
  );
}

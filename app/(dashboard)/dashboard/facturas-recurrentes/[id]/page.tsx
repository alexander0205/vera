'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { roleHasPermission } from '@/lib/config/roles';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import {
  ArrowLeft, Pencil, Zap, Loader2, RefreshCw, CalendarClock,
  AlertTriangle, FileText, ChevronRight,
} from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FacturaRecurrente {
  id: number;
  nombre: string;
  descripcion: string | null;
  tipoEcf: string;
  tipoPago: number;
  diasParaPago: number | null;
  frecuencia: string;
  diaCobro: number | null;
  fechaInicio: string;
  fechaFin: string | null;
  proximaEmision: string;
  estado: string;
  notas: string | null;
  totalEstimado: number;
  facturasEmitidas: number;
  clientId: number | null;
}

interface FacturaTimeline {
  id: number;
  codigo: string | null;
  encf: string;
  montoTotal: number;
  estadoPago: string;
  pagado: number;
  saldo: number;
}

interface PeriodoTimeline {
  fecha: string;
  montoEstimado: number;
  factura: FacturaTimeline | null;
}

interface DetalleResponse {
  facturaRecurrente: FacturaRecurrente;
  clienteRazonSocial: string | null;
  periodos: PeriodoTimeline[];
  facturasSinPeriodo: FacturaTimeline[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FRECUENCIA_LABEL: Record<string, string> = {
  diario:      'Diario',
  semanal:     'Semanal',
  quincenal:   'Quincenal',
  mensual:     'Mensual',
  bimestral:   'Bimestral',
  trimestral:  'Trimestral',
  semestral:   'Semestral',
  anual:       'Anual',
};

function EstadoChip({ estado }: { estado: string }) {
  switch (estado) {
    case 'activa':
      return <Chip label="Activa" size="small" sx={{ bgcolor: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', fontSize: '0.6875rem' }} />;
    case 'pausada':
      return <Chip label="Pausada" size="small" sx={{ bgcolor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', fontSize: '0.6875rem' }} />;
    case 'finalizada':
      return <Chip label="Finalizada" size="small" variant="outlined" sx={{ fontSize: '0.6875rem', borderColor: '#d1d5db', color: '#6b7280' }} />;
    default:
      return <Chip label={estado} size="small" variant="outlined" sx={{ fontSize: '0.6875rem' }} />;
  }
}

function EstadoPagoChip({ estadoPago }: { estadoPago: string }) {
  switch (estadoPago) {
    case 'PAGADA':
      return <Chip label="Pagada"   size="small" sx={{ bgcolor: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', fontSize: '0.6875rem' }} />;
    case 'PARCIAL':
      return <Chip label="Parcial"  size="small" sx={{ bgcolor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', fontSize: '0.6875rem' }} />;
    case 'PENDIENTE':
      return <Chip label="Pendiente" size="small" sx={{ bgcolor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', fontSize: '0.6875rem' }} />;
    case 'ANULADA':
      return <Chip label="Anulada" size="small" variant="outlined" sx={{ fontSize: '0.6875rem', borderColor: '#d1d5db', color: '#6b7280', textDecoration: 'line-through' }} />;
    case 'GRATUITA':
      return <Chip label="Gratuita" size="small" variant="outlined" sx={{ fontSize: '0.6875rem', borderColor: '#d1d5db', color: '#6b7280' }} />;
    case 'USO':
      return <Chip label="Uso"     size="small" variant="outlined" sx={{ fontSize: '0.6875rem', borderColor: '#d1d5db', color: '#6b7280' }} />;
    default:
      return <Chip label={estadoPago} size="small" variant="outlined" sx={{ fontSize: '0.6875rem' }} />;
  }
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{label}</Typography>
      <Box sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827', mt: 0.25 }}>{value}</Box>
    </Box>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function FacturaRecurrenteDetallePage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [data, setData]           = useState<DetalleResponse | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [generandoPeriodo, setGenerandoPeriodo] = useState<string | null>(null);
  const [canOperate, setCanOperate] = useState(true);
  const didLoad = useRef(false);

  const cargar = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`/api/facturas-recurrentes/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error cargando la factura recurrente');
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error cargando la factura recurrente');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    if (!didLoad.current) {
      didLoad.current = true;
      cargar();
      fetch('/api/equipo/perfil')
        .then(r => r.json())
        .then(d => { if (d.role) setCanOperate(roleHasPermission(d.role, 'facturas:crear')); })
        .catch(() => {});
    }
  }, [cargar]);

  async function handleGenerar(periodo?: string) {
    if (!id) return;
    if (periodo) setGenerandoPeriodo(periodo); else setGenerando(true);
    try {
      const res  = await fetch(`/api/facturas-recurrentes/${id}/generar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(periodo ? { periodo } : {}),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? 'Error generando factura'); return; }
      toast.success(`Factura generada: ${json.encf}`, {
        action: { label: 'Ver factura', onClick: () => { window.location.href = `/dashboard/facturas/${json.documentoId}`; } },
      });
      cargar();
    } catch {
      toast.error('Error de conexión al generar la factura');
    } finally {
      if (periodo) setGenerandoPeriodo(null); else setGenerando(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ bgcolor: '#eef0f7', minHeight: '100%', p: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={32} sx={{ color: '#0d9488' }} />
        <Typography sx={{ ml: 1.5, color: '#6b7280' }}>Cargando…</Typography>
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box sx={{ bgcolor: '#eef0f7', minHeight: '100%', p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Link href="/dashboard/facturas-recurrentes" style={{ textDecoration: 'none' }}>
          <Button variant="text" startIcon={<ArrowLeft size={16} />} sx={{ textTransform: 'none', color: '#6b7280' }}>Volver</Button>
        </Link>
        <Alert severity="error" sx={{ borderRadius: '8px' }}>{error ?? 'No se encontró la factura recurrente.'}</Alert>
      </Box>
    );
  }

  const fr  = data.facturaRecurrente;
  const rango = `${fmtFechaCorta(fr.fechaInicio)} – ${fr.fechaFin ? fmtFechaCorta(fr.fechaFin) : 'sin fin'}`;

  return (
    <Box sx={{ bgcolor: '#eef0f7', minHeight: '100%', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Volver */}
      <Link href="/dashboard/facturas-recurrentes" style={{ textDecoration: 'none' }}>
        <Button variant="text" startIcon={<ArrowLeft size={16} />} sx={{ textTransform: 'none', color: '#6b7280', '&:hover': { color: '#374151' } }}>
          Facturas recurrentes
        </Button>
      </Link>

      {/* Header */}
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { md: 'flex-start' }, justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 0.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#111827' }}>{fr.nombre}</Typography>
              <EstadoChip estado={fr.estado} />
            </Box>
            {fr.descripcion && <Typography variant="body2" sx={{ color: '#6b7280' }}>{fr.descripcion}</Typography>}
            {(data.clienteRazonSocial || fr.clientId) && (
              <Typography variant="body2" sx={{ color: '#4b5563', mt: 0.5 }}>
                Cliente: <Box component="span" sx={{ fontWeight: 500 }}>{data.clienteRazonSocial ?? `#${fr.clientId}`}</Box>
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            {canOperate && (
              <Link href={`/dashboard/facturas-recurrentes/${fr.id}/editar`} style={{ textDecoration: 'none' }}>
                <Button variant="outlined" startIcon={<Pencil size={16} />}
                  sx={{ borderRadius: '8px', textTransform: 'none', borderColor: '#d1d5db', color: '#374151' }}>
                  Editar
                </Button>
              </Link>
            )}
            {canOperate && (
              <Button
                variant="contained" disableElevation
                onClick={() => handleGenerar()} disabled={generando}
                startIcon={generando ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <Zap size={16} />}
                sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}
              >
                {generando ? 'Generando…' : 'Generar ahora'}
              </Button>
            )}
          </Box>
        </Box>

        {/* Datos clave */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mt: 3, pt: 3, borderTop: '1px solid #f3f4f6' }}>
          <InfoItem label="Frecuencia"        value={FRECUENCIA_LABEL[fr.frecuencia] ?? fr.frecuencia} />
          <InfoItem label="Monto estimado"    value={fmtDOP(fr.totalEstimado)} />
          <InfoItem label="Próxima emisión"   value={fmtFechaCorta(fr.proximaEmision)} />
          <InfoItem label="Facturas emitidas" value={fr.facturasEmitidas} />
          <InfoItem label="Vigencia"          value={rango} />
        </Box>
      </Box>

      {/* Calendario de pagos */}
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalendarClock size={16} color="#0d9488" />
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>Calendario de pagos</Typography>
          </Box>
          <IconButton size="small" onClick={cargar} sx={{ color: '#6b7280' }}>
            <RefreshCw size={16} />
          </IconButton>
        </Box>
        <Box sx={{ px: 3, py: 2.5 }}>
          {fr.estado !== 'activa' && (
            <Alert severity="warning" icon={<AlertTriangle size={16} />} sx={{ borderRadius: '8px', fontSize: '0.75rem', mb: 2 }}>
              {fr.estado === 'pausada'
                ? 'Esta recurrente está pausada: no se generarán facturas automáticamente hasta reanudarla. Puedes generar manualmente cualquier período.'
                : fr.estado === 'finalizada'
                  ? 'Esta recurrente está finalizada. Puedes seguir generando períodos manualmente si lo necesitas.'
                  : 'Esta recurrente no está activa.'}
            </Alert>
          )}

          {data.periodos.length === 0 ? (
            <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>No hay períodos programados.</Typography>
          ) : (
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', '& li + li': { borderTop: '1px solid #f3f4f6' } }}>
              {data.periodos.map(p => {
                const esProximo   = p.fecha === fr.proximaEmision;
                const f           = p.factura;
                const rowGenerando = generandoPeriodo === p.fecha;

                const inner = (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, py: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                      <Box sx={{ height: 8, width: 8, borderRadius: '50%', flexShrink: 0, bgcolor: esProximo ? '#0d9488' : f ? '#9ca3af' : '#d1d5db' }} />
                      <Typography sx={{ fontSize: '0.875rem', color: '#374151', whiteSpace: 'nowrap' }}>{fmtFechaCorta(p.fecha)}</Typography>
                      {esProximo && (
                        <Chip label="Próximo" size="small" sx={{ bgcolor: '#f0fdfa', color: '#0f766e', border: '1px solid #99f6e4', fontSize: '0.6875rem', height: 20 }} />
                      )}
                      {f && (
                        <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: { xs: 'none', sm: 'block' } }}>
                          {f.codigo ?? f.encf}
                        </Typography>
                      )}
                    </Box>

                    {f ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
                        <EstadoPagoChip estadoPago={f.estadoPago} />
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827', whiteSpace: 'nowrap' }}>{fmtDOP(f.montoTotal)}</Typography>
                          {f.saldo > 0 && (
                            <Typography sx={{ fontSize: '0.75rem', color: '#92400e', whiteSpace: 'nowrap' }}>Saldo {fmtDOP(f.saldo)}</Typography>
                          )}
                        </Box>
                        <ChevronRight size={16} color="#9ca3af" />
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
                        <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmtDOP(p.montoEstimado)}</Typography>
                        {canOperate && (
                          <Button
                            size="small" variant="outlined"
                            disabled={rowGenerando}
                            onClick={() => handleGenerar(p.fecha)}
                            startIcon={rowGenerando ? <Loader2 size={14} /> : <Zap size={14} />}
                            sx={{ borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', borderColor: '#d1d5db', color: '#374151' }}
                          >
                            {rowGenerando ? 'Generando…' : 'Generar'}
                          </Button>
                        )}
                      </Box>
                    )}
                  </Box>
                );

                return (
                  <Box component="li" key={p.fecha}>
                    {f ? (
                      <Link href={`/dashboard/facturas/${f.id}`} style={{ textDecoration: 'none', display: 'block', marginLeft: -8, marginRight: -8, paddingLeft: 8, paddingRight: 8, borderRadius: 8 }}>
                        <Box sx={{ '&:hover': { bgcolor: '#f9fafb' }, borderRadius: '8px', mx: -1, px: 1 }}>{inner}</Box>
                      </Link>
                    ) : inner}
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Facturas legacy sin período */}
          {data.facturasSinPeriodo.length > 0 && (
            <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid #f3f4f6' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <FileText size={16} color="#9ca3af" />
                <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Otras facturas generadas
                </Typography>
              </Box>
              <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', '& li + li': { borderTop: '1px solid #f3f4f6' } }}>
                {data.facturasSinPeriodo.map(f => (
                  <Box component="li" key={f.id}>
                    <Link href={`/dashboard/facturas/${f.id}`} style={{ textDecoration: 'none' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, py: 1.5, mx: -1, px: 1, borderRadius: '8px', '&:hover': { bgcolor: '#f9fafb' } }}>
                        <Typography sx={{ fontSize: '0.875rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.codigo ?? f.encf}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
                          <EstadoPagoChip estadoPago={f.estadoPago} />
                          <Box sx={{ textAlign: 'right' }}>
                            <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827', whiteSpace: 'nowrap' }}>{fmtDOP(f.montoTotal)}</Typography>
                            {f.saldo > 0 && (
                              <Typography sx={{ fontSize: '0.75rem', color: '#92400e', whiteSpace: 'nowrap' }}>Saldo {fmtDOP(f.saldo)}</Typography>
                            )}
                          </Box>
                          <ChevronRight size={16} color="#9ca3af" />
                        </Box>
                      </Box>
                    </Link>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

'use client';

import { useState } from 'react';
import { FileText, CreditCard, ChevronDown } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import { PagoMetodos, sumaPagos, type PagoLinea } from '@/components/pagos/PagoMetodos';
import type { EmpresaPerfil, Retencion, ItemLinea } from '../utils/types';
import { calcularMontoItem } from '../utils/calculos';

interface Props {
  empresa: EmpresaPerfil | null;
  totales: { bruto: number; subtotal: number; descuento: number; itbis: number; total: number };
  retenciones: Retencion[];
  totalNeto: number;
  /** Etiqueta del total. Default "Total"; en NC/ND → "Total a acreditar/debitar". */
  totalLabel?: string;
  items: ItemLinea[];
  /** Si false, oculta el card "Pago" entero. Útil para facturas recurrentes
   *  (plantillas que no registran pago directo). Default true. */
  showPago?: boolean;
  /** Optional pago recibido block — rendered inline when enabled. */
  pagoRecibido?: boolean;
  setPagoRecibido?: (v: boolean) => void;
  pagoFecha?: string;
  setPagoFecha?: (v: string) => void;
  /** Líneas de pago (1 línea = pago normal). Controladas por el padre. */
  pagoLineas?: PagoLinea[];
  setPagoLineas?: (v: PagoLinea[]) => void;
}

const fmt = (n: number) =>
  `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const cardSx = {
  bgcolor: '#fff',
  borderRadius: '12px',
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 3px 0 rgba(0,0,0,0.07)',
  overflow: 'hidden',
};

const sectionHeaderSx = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  px: 2,
  pt: 2,
  pb: 1.5,
  cursor: 'pointer',
  bgcolor: 'transparent',
  border: 'none',
  textAlign: 'left' as const,
  transition: 'background-color 0.15s',
  '&:hover': { bgcolor: '#f9fafb' },
};

/**
 * Sticky right-side sidebar con Resumen + Pago como dos cards independientes.
 * Resumen muestra items, totales y saldo pendiente.
 * Pago tiene su propio toggle + método/fecha/cuenta/valor.
 */
export function ResumenSidebar({
  totales, retenciones, totalNeto, totalLabel = 'Total', items,
  showPago = true,
  pagoRecibido = false, setPagoRecibido,
  pagoFecha = '', setPagoFecha,
  pagoLineas = [{ metodo: 'efectivo', valor: '' }], setPagoLineas,
}: Props) {
  const [resumenOpen, setResumenOpen] = useState(true);
  const [pagoOpen, setPagoOpen]       = useState(true);

  // Pago efectivo = suma de las líneas. El saldo pendiente lo resta del total.
  const pagoNum = sumaPagos(pagoLineas);
  const saldoPendiente = Math.max(0, totalNeto - pagoNum);

  // Items con nombre (filtra líneas vacías)
  const itemsConNombre = items.filter(i => i.nombreItem.trim());

  return (
    <Box
      component="aside"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        position: { lg: 'sticky' },
        top: { lg: 16 },
        alignSelf: { lg: 'flex-start' },
      }}
    >
      {/* ─── Resumen card ─── */}
      <Box component="section" sx={cardSx}>
        <Box
          component="button"
          type="button"
          onClick={() => setResumenOpen(v => !v)}
          aria-expanded={resumenOpen}
          sx={sectionHeaderSx}
        >
          <FileText size={16} color="#0d9488" aria-hidden="true" style={{ flexShrink: 0 }} />
          <Typography
            sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', flex: 1 }}
          >
            Resumen
          </Typography>
          <Box
            sx={{
              display: 'inline-flex',
              color: '#9ca3af',
              transform: resumenOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.2s',
            }}
          >
            <ChevronDown size={16} />
          </Box>
        </Box>

        {resumenOpen && (
          <Box sx={{ px: 2, pb: 2 }}>
            {/* Tabla items */}
            {itemsConNombre.length > 0 && (
              <>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto',
                    gap: 1.5,
                    fontSize: '0.6875rem',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    pb: 1,
                    borderBottom: '1px solid #f3f4f6',
                  }}
                >
                  <span>Descripción</span>
                  <span style={{ textAlign: 'right' }}>Cant.</span>
                  <span style={{ textAlign: 'right' }}>Total</span>
                </Box>
                <Box sx={{ '& > *:not(:last-child)': { borderBottom: '1px solid #f9fafb' } }}>
                  {itemsConNombre.map(item => (
                    <Box
                      key={item.id}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto auto',
                        gap: 1.5,
                        py: 1,
                        fontSize: '0.875rem',
                      }}
                    >
                      <Typography
                        sx={{
                          color: '#374151',
                          fontSize: '0.875rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.nombreItem}
                      >
                        {item.nombreItem}
                      </Typography>
                      <Typography sx={{ color: '#4b5563', fontSize: '0.875rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {item.cantidadItem}
                      </Typography>
                      <Typography sx={{ color: '#111827', fontWeight: 500, fontSize: '0.875rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {fmt(calcularMontoItem(item))}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </>
            )}

            {/* Totales */}
            <Box sx={{ pt: 1.5, mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.75, borderTop: '1px solid #f3f4f6' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '0.875rem', color: '#4b5563' }}>Subtotal</Typography>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#1f2937', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(totales.bruto - totales.descuento)}
                </Typography>
              </Box>
              {totales.descuento > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>Descuento</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                    -{fmt(totales.descuento)}
                  </Typography>
                </Box>
              )}
              {totales.itbis > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.875rem', color: '#4b5563' }}>ITBIS (18%)</Typography>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#1f2937', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(totales.itbis)}
                  </Typography>
                </Box>
              )}
              {retenciones.map((ret, idx) => (
                <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.875rem', color: '#ef4444', overflow: 'hidden', textOverflow: 'ellipsis', pr: 1 }}>
                    {ret.nombre} ({ret.porcentaje}%)
                  </Typography>
                  <Typography sx={{ fontSize: '0.875rem', color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
                    -{fmt(ret.monto)}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* Total bold */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                borderTop: '2px solid #e5e7eb',
                pt: 1.5,
                mt: 1.5,
              }}
            >
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>{totalLabel}</Typography>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(totalNeto)}
              </Typography>
            </Box>

            {/* Pagado + saldo */}
            {pagoRecibido && (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1.5 }}>
                  <Typography sx={{ fontSize: '0.875rem', color: '#4b5563' }}>Pagado</Typography>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#1f2937', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(pagoNum)}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    bgcolor: '#f0fdfa',
                    border: '1px solid #ccfbf1',
                    borderRadius: '8px',
                    px: 1.5,
                    py: 1,
                    mt: 1,
                  }}
                >
                  <Typography sx={{ fontSize: '0.875rem', color: '#0f766e', fontWeight: 600 }}>
                    Saldo pendiente
                  </Typography>
                  <Typography sx={{ fontSize: '0.875rem', color: '#134e4a', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(saldoPendiente)}
                  </Typography>
                </Box>
              </>
            )}
          </Box>
        )}
      </Box>

      {/* ─── Pago card (sticky aparte) ─── */}
      {showPago && (
        <Box component="section" sx={cardSx}>
          <Box
            component="button"
            type="button"
            onClick={() => setPagoOpen(v => !v)}
            aria-expanded={pagoOpen}
            sx={sectionHeaderSx}
          >
            <CreditCard size={16} color="#0d9488" aria-hidden="true" style={{ flexShrink: 0 }} />
            <Typography
              sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', flex: 1 }}
            >
              Pago
            </Typography>
            <Box
              sx={{
                display: 'inline-flex',
                color: '#9ca3af',
                transform: pagoOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.2s',
              }}
            >
              <ChevronDown size={16} />
            </Box>
          </Box>

          {pagoOpen && (
            <Box sx={{ px: 2, pb: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {/* Toggle registrar pago */}
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={pagoRecibido}
                    onChange={e => setPagoRecibido?.(e.target.checked)}
                    sx={{
                      color: '#d1d5db',
                      '&.Mui-checked': { color: '#0d9488' },
                      '&:hover': { bgcolor: 'rgba(13,148,136,0.08)' },
                    }}
                  />
                }
                label={
                  <Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>
                    Registrar pago recibido
                  </Typography>
                }
                sx={{ m: 0 }}
              />

              {pagoRecibido && (
                <>
                  <PagoMetodos
                    lineas={pagoLineas}
                    onChange={(v) => setPagoLineas?.(v)}
                    total={totalNeto}
                    showCuenta
                  />

                  {/* Fecha — compacta, default hoy, secundaria */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, pt: 0.5 }}>
                    <Typography sx={{ fontSize: '0.6875rem', color: '#6b7280' }}>
                      Fecha de pago
                    </Typography>
                    <TextField
                      type="date"
                      size="small"
                      value={pagoFecha}
                      onChange={(e) => setPagoFecha?.(e.target.value)}
                      sx={{
                        width: 'auto',
                        '& .MuiOutlinedInput-root': {
                          borderRadius: '8px',
                          fontSize: '0.75rem',
                          height: 32,
                        },
                      }}
                    />
                  </Box>
                </>
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

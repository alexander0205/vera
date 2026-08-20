'use client';

import { Info } from 'lucide-react';
import type { TipoEcfRegla } from '@/lib/ecf/types';
import type { EmpresaPerfil } from '../utils/types';
import { describirMora } from '@/lib/cobranza/mora-calculo';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';

export const MOTIVOS_NOTA = [
  { value: 'devolucion',   label: 'Devolución de mercancía',   codigo: 3 },
  { value: 'error_precio', label: 'Error en precio',           codigo: 3 },
  { value: 'descuento',    label: 'Descuento no aplicado',     codigo: 3 },
  { value: 'cancelacion',  label: 'Cancelación parcial',       codigo: 3 },
  { value: 'anulacion',    label: 'Anulación de la operación', codigo: 1 },
  { value: 'cargo',        label: 'Cargo adicional',           codigo: 3 },
  { value: 'otro',         label: 'Otro (especificar)',         codigo: 3 },
] as const;

export type MotivoNota = typeof MOTIVOS_NOTA[number]['value'];

const CONDICIONES_PAGO = [
  { value: '1', label: 'De contado' },
  { value: '2', label: 'Crédito' },
  { value: '3', label: 'Gratuito' },
  { value: '4', label: 'Uso o consumo' },
];

// TipoIngresos DGII (campo 607): clasificación del origen del ingreso.
// El 95% es 01 (venta normal del giro) — default. En una Nota de Crédito/Débito
// debe coincidir con el tipo de la factura original que se corrige.
const TIPOS_INGRESO = [
  { value: '1', label: '01 · Operaciones (giro del negocio)' },
  { value: '2', label: '02 · Financieros' },
  { value: '3', label: '03 · Extraordinarios' },
  { value: '4', label: '04 · Arrendamientos' },
  { value: '5', label: '05 · Venta de activo depreciable' },
  { value: '6', label: '06 · Otros' },
];
// Tipos donde TipoIngresos NO aplica (campo prohibido en IdDoc): Compras, Gastos, Pagos Exterior.
const SIN_TIPO_INGRESO = ['41', '43', '47'];

/** Formatea YYYY-MM-DD → DD/MM/YYYY */
interface Props {
  regla: TipoEcfRegla | undefined;
  tipoEcf: string;
  condicionPago: string;
  setCondicionPago: (v: string) => void;
  diasParaPago: string;
  setDiasParaPago: (v: string) => void;
  tipoIngresos: string;
  setTipoIngresos: (v: string) => void;
  /** Vencimiento derivado (YYYY-MM-DD) — se muestra solo lectura y en el aviso. */
  fechaLimitePago: string;
  /** Config de mora de la empresa, para avisar los términos al elegir crédito. */
  empresa?: EmpresaPerfil | null;
  /** true = el usuario no ha registrado ningún pago en esta factura. */
  sinPagoRegistrado?: boolean;
}

export function DetallesSection({
  regla,
  tipoEcf,
  condicionPago, setCondicionPago,
  diasParaPago, setDiasParaPago,
  tipoIngresos, setTipoIngresos,
  fechaLimitePago,
  empresa,
  sinPagoRegistrado = false,
}: Props) {
  const esCredito = condicionPago === '2';
  const muestraTipoIngresos = !SIN_TIPO_INGRESO.includes(tipoEcf);

  // Qué mora aplicaría si la factura vence sin pagarse. null si la empresa no
  // la tiene activa — entonces no hay nada que advertir.
  const textoMora = empresa?.recargoMoraActivo
    ? describirMora(
        {
          modo:             empresa.recargoMoraModo ?? 'porcentaje',
          porcentajeBps:    empresa.recargoMoraPorcentaje ?? 0,
          montoCents:       empresa.recargoMoraMontoCents ?? 0,
          diasGracia:       empresa.recargoMoraDiasGracia ?? 0,
          periodicidadDias: empresa.recargoMoraPeriodicidadDias ?? 0,
          compuesta:        empresa.recargoMoraCompuesta ?? false,
          topeBps:          empresa.recargoMoraTopeBps ?? 0,
          maxPeriodos:      empresa.recargoMoraMaxPeriodos ?? 0,
        },
        (cents) => `RD$${(cents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
      )
    : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1.5 }}>
        <FormControl size="small" fullWidth>
          <InputLabel sx={{ fontSize: '0.75rem' }}>Condición de pago</InputLabel>
          <Select
            value={condicionPago}
            label="Condición de pago"
            onChange={(e) => setCondicionPago(e.target.value)}
            sx={{ borderRadius: '8px', fontSize: '0.875rem' }}
          >
            {CONDICIONES_PAGO.map((c) => (
              <MenuItem key={c.value} value={c.value} sx={{ fontSize: '0.875rem' }}>{c.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box>
          <Typography sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: esCredito ? '#4b5563' : '#d1d5db', mb: 0.5 }}>
            Plazo de vencimiento {esCredito && <Box component="span" sx={{ color: '#ef4444' }}>*</Box>}
          </Typography>
          <Box sx={{ position: 'relative', width: 112 }}>
            <TextField
              type="number"
              size="small"
              value={diasParaPago}
              onChange={(e) => setDiasParaPago(e.target.value)}
              disabled={!esCredito}
              slotProps={{ htmlInput: { min: 1 } }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem', pr: '36px' } }}
            />
            <Typography sx={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#9ca3af', pointerEvents: 'none' }}>
              días
            </Typography>
          </Box>
        </Box>

        <Box>
          <Typography sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: esCredito ? '#4b5563' : '#d1d5db', mb: 0.5 }}>
            Vence el
          </Typography>
          {/* Solo lectura: se recalcula solo cuando cambia el plazo. */}
          <TextField
            type="date" size="small" fullWidth disabled
            value={esCredito ? fechaLimitePago : ''}
            slotProps={{ htmlInput: { readOnly: true, tabIndex: -1 } }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem' } }}
          />
        </Box>

        {muestraTipoIngresos && (
          <FormControl size="small" fullWidth>
            <InputLabel sx={{ fontSize: '0.75rem' }}>Tipo de ingresos</InputLabel>
            <Select
              value={tipoIngresos}
              label="Tipo de ingresos"
              onChange={(e) => setTipoIngresos(e.target.value)}
              sx={{ borderRadius: '8px', fontSize: '0.875rem' }}
            >
              {TIPOS_INGRESO.map((t) => (
                <MenuItem key={t.value} value={t.value} sx={{ fontSize: '0.875rem' }}>{t.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Box>

      {/* Qué mora aplicará si vence sin pagarse. La fecha ya se ve arriba, así
          que aquí lo que aporta es el recargo. */}
      {esCredito && fechaLimitePago && textoMora && (
        <Box sx={{ bgcolor: '#eef2fe', border: '1px solid #e0e7fd', borderRadius: '8px', px: 1.5, py: 1.25, display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
          <Info size={16} color="#2a45c4" style={{ flexShrink: 0, marginTop: 2 }} />
          <Typography sx={{ fontSize: '0.875rem', color: '#24377d' }}>
            Si no se paga tras el vencimiento, se aplicará una mora de{' '}
            <Box component="span" sx={{ fontWeight: 600 }}>{textoMora}</Box>
          </Typography>
        </Box>
      )}

      {/* De contado sin pago: la factura queda por cobrar, sin vencimiento y sin
          mora. No se cambia sola —la condición de pago se le reporta a la DGII,
          así que la decisión es del usuario—; aquí solo se hace visible. */}
      {!esCredito && condicionPago === '1' && sinPagoRegistrado && (
        <Box sx={{ bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', px: 1.5, py: 1.25, display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
          <Info size={16} color="#b45309" style={{ flexShrink: 0, marginTop: 2 }} />
          <Box>
            <Typography sx={{ fontSize: '0.875rem', color: '#78350f' }}>
              Marcada <Box component="span" sx={{ fontWeight: 600 }}>de contado</Box> pero sin pago
              registrado. Queda por cobrar, sin fecha de vencimiento y sin generar mora.
            </Typography>
            <Box component="button" type="button" onClick={() => setCondicionPago('2')}
              sx={{
                mt: 0.75, background: 'none', border: 'none', p: 0, cursor: 'pointer',
                fontSize: '0.875rem', fontWeight: 600, color: '#78350f',
                textDecoration: 'underline', textUnderlineOffset: '2px',
                '&:hover': { color: '#451a03' },
              }}>
              Cambiarla a crédito
            </Box>
          </Box>
        </Box>
      )}

    </Box>
  );
}

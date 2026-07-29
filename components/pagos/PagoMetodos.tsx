'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import { METODOS_PAGO, METODO_NOTA_CREDITO, METODO_PAGO_LABELS, type MetodoOption } from '@/lib/pagos/metodos';

// Re-export para compatibilidad con imports existentes. Fuente: lib/pagos/metodos.
export { METODOS_PAGO } from '@/lib/pagos/metodos';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface PagoLinea {
  metodo: string;      // ver lib/pagos/metodos — fuente única de métodos
  valor: string;       // DOP como string (input controlado)
  cuenta?: string;     // cuenta bancaria (opcional)
  referencia?: string; // opcional
  notaCreditoId?: number | null; // NC consumida si metodo='nota_credito'
}

/** NC del cliente usable como pago (voucher por código). */
export interface NotaCreditoDisponible {
  id: number;
  codigo: string | null;
  /** Código (o e-NCF) de la factura de origen — para buscar por él. */
  facturaCodigo?: string | null;
  montoCents: number;
}

/** Cuentas bancarias sugeridas (igual que en las pantallas originales). */
const CUENTAS_BANCARIAS: MetodoOption[] = [
  { value: 'caja',        label: 'Caja general' },
  { value: 'banreservas', label: 'Banreservas' },
  { value: 'popular',     label: 'Banco Popular' },
  { value: 'bhd',         label: 'BHD' },
  { value: 'otro',        label: 'Otro' },
];

interface PagoMetodosProps {
  lineas: PagoLinea[];
  onChange: (lineas: PagoLinea[]) => void;
  total: number;            // DOP — total de la factura (para Suma/Resto/Saldo)
  yaPagado?: number;        // DOP ya pagado antes (AR/parcial). Default 0.
  disabled?: boolean;
  showCuenta?: boolean;     // mostrar campo cuenta bancaria por línea. Default false.
  showReferencia?: boolean; // mostrar campo referencia por línea. Default false.
  /** Restringe las opciones de método (algunos endpoints aceptan menos de 8). */
  metodos?: MetodoOption[];
  /** NCs disponibles del cliente. Si hay, se ofrece el método 'Nota de crédito'. */
  notasCredito?: NotaCreditoDisponible[];
}

// ─── Helpers exportados ───────────────────────────────────────────────────────

/** Suma de las líneas en DOP (centavos enteros en el borde para evitar drift). */
export function sumaPagos(lineas: PagoLinea[]): number {
  const cents = lineas.reduce((s, l) => {
    const v = parseFloat(l.valor || '0');
    return s + (Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0);
  }, 0);
  return cents / 100;
}

/** Válido = al menos un monto > 0 y la suma no excede (total - yaPagado). */
export function pagosValidos(lineas: PagoLinea[], total: number, yaPagado = 0): boolean {
  const sumaCents     = Math.round(sumaPagos(lineas) * 100);
  const disponibleCts = Math.round((total - yaPagado) * 100);
  return sumaCents > 0 && sumaCents <= disponibleCts;
}

// ─── Componente ───────────────────────────────────────────────────────────────

/** Etiqueta compacta reutilizable (antes shadcn <Label> con clases uppercase). */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      component="label"
      sx={{ display: 'block', fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' }}
    >
      {children}
    </Typography>
  );
}

/**
 * Repeater de pago multi-método, 100% controlado por props.
 * Empieza siempre con (al menos) 1 línea — 1 línea = pago normal.
 * No tiene estado de datos propio; toda mutación va por `onChange`.
 */
export function PagoMetodos({
  lineas,
  onChange,
  total,
  yaPagado = 0,
  disabled = false,
  showCuenta = false,
  showReferencia = false,
  metodos = METODOS_PAGO,
  notasCredito,
}: PagoMetodosProps) {
  const hayNc = !!notasCredito && notasCredito.length > 0;
  // Ofrecer 'Nota de crédito' como método solo si el cliente tiene NCs disponibles.
  const metodosUI: MetodoOption[] = hayNc
    ? [...metodos, { value: METODO_NOTA_CREDITO, label: METODO_PAGO_LABELS[METODO_NOTA_CREDITO] }]
    : metodos;
  const disponible = Math.max(0, total - yaPagado);
  const suma       = sumaPagos(lineas);
  const restoCents = Math.round(disponible * 100) - Math.round(suma * 100);
  const resto      = Math.max(0, restoCents / 100);
  const excede     = Math.round(suma * 100) > Math.round(disponible * 100);

  // Campos opcionales revelados manualmente (UI-only). Cuenta/Referencia no
  // siempre se usan: se ocultan tras un link "+ ..." para no saturar el form.
  const [verCuenta, setVerCuenta]         = useState<Set<number>>(new Set());
  const [verReferencia, setVerReferencia] = useState<Set<number>>(new Set());
  const cuentaVisible = (i: number, l: PagoLinea) => !!l.cuenta || verCuenta.has(i);
  const refVisible    = (i: number, l: PagoLinea) => !!l.referencia || verReferencia.has(i);
  const toggleSet = (set: Set<number>, i: number) => {
    const next = new Set(set); next.add(i); return next;
  };

  function setLinea(i: number, patch: Partial<PagoLinea>) {
    onChange(lineas.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function agregarLinea() {
    onChange([...lineas, { metodo: 'efectivo', valor: '' }]);
  }
  function quitarLinea(i: number) {
    if (lineas.length <= 1) return;
    onChange(lineas.filter((_, idx) => idx !== i));
  }
  function repartirResto() {
    if (restoCents <= 0 || lineas.length === 0) return;
    const ultima      = lineas.length - 1;
    const actualV     = parseFloat(lineas[ultima].valor || '0');
    const actualCents = Number.isFinite(actualV) && actualV > 0 ? Math.round(actualV * 100) : 0;
    setLinea(ultima, { valor: ((actualCents + restoCents) / 100).toFixed(2) });
  }

  const fmt = (n: number) =>
    n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {lineas.map((l, i) => (
        <Box
          key={i}
          sx={{
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            bgcolor: 'rgba(249,250,251,0.6)',
            p: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          {/* Fila 1: método (ocupa todo) + quitar */}
          <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <FieldLabel>Método</FieldLabel>
              <Select
                size="small"
                fullWidth
                value={l.metodo}
                onChange={(e) => {
                  const v = e.target.value;
                  setLinea(i, {
                    metodo: v,
                    // Al cambiar de/hacia 'nota_credito' limpiar la NC y el monto.
                    ...(v === METODO_NOTA_CREDITO ? { valor: '', notaCreditoId: null } : { notaCreditoId: null }),
                  });
                }}
                disabled={disabled}
                sx={{ mt: 0.5 }}
              >
                {metodosUI.map(m => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                ))}
              </Select>
            </Box>

            {lineas.length > 1 && (
              <IconButton
                type="button"
                onClick={() => quitarLinea(i)}
                disabled={disabled}
                title="Quitar método"
                aria-label="Quitar método"
                sx={{
                  flexShrink: 0,
                  height: 36,
                  borderRadius: '8px',
                  border: '1px solid #fecaca',
                  color: '#ef4444',
                  '&:hover': { bgcolor: '#fef2f2', borderColor: '#fecaca' },
                }}
              >
                <Trash2 style={{ width: 16, height: 16 }} />
              </IconButton>
            )}
          </Box>

          {/* Selector de Nota de crédito — buscable por código de NC o de factura */}
          {l.metodo === METODO_NOTA_CREDITO && (
            <Box sx={{ minWidth: 0 }}>
              <FieldLabel>Nota de crédito</FieldLabel>
              <NotaCreditoPicker
                notas={notasCredito ?? []}
                valueId={l.notaCreditoId ?? null}
                disabled={disabled}
                fmt={fmt}
                onSelect={(nc) => {
                  // Aplicar el monto de la NC, capado a lo que falta cubrir (otras líneas
                  // ya cuentan). El sobrante (NC > factura) queda como saldo a favor.
                  const otrasCents = Math.round(suma * 100) - Math.round((parseFloat(l.valor || '0') || 0) * 100);
                  const capCents   = Math.max(0, Math.round(disponible * 100) - otrasCents);
                  const aplicar    = Math.min(nc.montoCents, capCents);
                  setLinea(i, { notaCreditoId: nc.id, valor: (aplicar / 100).toFixed(2) });
                }}
              />
            </Box>
          )}

          {/* Fila 2: monto + cuenta (cuenta solo si se reveló) */}
          <Box
            sx={{
              display: 'grid',
              gap: 1,
              gridTemplateColumns: showCuenta && cuentaVisible(i, l) && l.metodo !== METODO_NOTA_CREDITO ? '1fr 1fr' : '1fr',
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <FieldLabel>Monto</FieldLabel>
              <TextField
                type="number"
                size="small"
                fullWidth
                placeholder="0.00"
                value={l.valor}
                onChange={(e) => setLinea(i, { valor: e.target.value })}
                disabled={disabled || l.metodo === METODO_NOTA_CREDITO}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Box component="span" sx={{ fontSize: '10px', color: '#6b7280' }}>RD$</Box>
                      </InputAdornment>
                    ),
                  },
                  htmlInput: { inputMode: 'decimal', min: 0, step: 0.01 },
                }}
                sx={{ mt: 0.5 }}
              />
            </Box>

            {showCuenta && cuentaVisible(i, l) && (
              <Box sx={{ minWidth: 0 }}>
                <FieldLabel>Cuenta</FieldLabel>
                <Select
                  size="small"
                  fullWidth
                  displayEmpty
                  value={l.cuenta ?? ''}
                  onChange={(e) => setLinea(i, { cuenta: e.target.value })}
                  disabled={disabled}
                  renderValue={(selected) => selected
                    ? (CUENTAS_BANCARIAS.find(c => c.value === selected)?.label ?? String(selected))
                    : <Box component="span" sx={{ color: '#9ca3af' }}>—</Box>}
                  sx={{ mt: 0.5 }}
                >
                  {CUENTAS_BANCARIAS.map(c => (
                    <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                  ))}
                </Select>
              </Box>
            )}
          </Box>

          {/* Fila 3: referencia (solo si se reveló) */}
          {showReferencia && refVisible(i, l) && (
            <Box sx={{ minWidth: 0 }}>
              <FieldLabel>Referencia</FieldLabel>
              <TextField
                type="text"
                size="small"
                fullWidth
                placeholder="Opcional"
                value={l.referencia ?? ''}
                onChange={(e) => setLinea(i, { referencia: e.target.value })}
                disabled={disabled}
                slotProps={{ htmlInput: { maxLength: 100 } }}
                sx={{ mt: 0.5 }}
              />
            </Box>
          )}

          {/* Links opcionales: agregar cuenta / referencia */}
          {!disabled && ((showCuenta && !cuentaVisible(i, l)) || (showReferencia && !refVisible(i, l))) && (
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              {showCuenta && !cuentaVisible(i, l) && (
                <Box
                  component="button"
                  type="button"
                  onClick={() => setVerCuenta(s => toggleSet(s, i))}
                  sx={{
                    border: 'none', bgcolor: 'transparent', p: 0, m: 0, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '11px', lineHeight: 1.5, color: '#9ca3af',
                    '&:hover': { color: '#0f766e' },
                  }}
                >
                  + Cuenta
                </Box>
              )}
              {showReferencia && !refVisible(i, l) && (
                <Box
                  component="button"
                  type="button"
                  onClick={() => setVerReferencia(s => toggleSet(s, i))}
                  sx={{
                    border: 'none', bgcolor: 'transparent', p: 0, m: 0, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '11px', lineHeight: 1.5, color: '#9ca3af',
                    '&:hover': { color: '#0f766e' },
                  }}
                >
                  + Referencia
                </Box>
              )}
            </Box>
          )}
        </Box>
      ))}

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 0.5 }}>
        <Box
          component="button"
          type="button"
          onClick={agregarLinea}
          disabled={disabled}
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.5,
            border: 'none', bgcolor: 'transparent', p: 0, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.75rem', fontWeight: 500, color: '#0f766e',
            '&:hover': { color: '#115e59' },
            '&:disabled': { opacity: 0.4, cursor: 'default' },
          }}
        >
          <Plus style={{ width: 14, height: 14 }} /> Agregar otro método
        </Box>
        <Box
          component="button"
          type="button"
          onClick={repartirResto}
          disabled={disabled || restoCents <= 0}
          sx={{
            border: 'none', bgcolor: 'transparent', p: 0, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.75rem', fontWeight: 500, color: '#6b7280',
            '&:hover': { color: '#374151' },
            '&:disabled': { opacity: 0.4, cursor: 'default' },
          }}
        >
          Repartir resto
        </Box>
      </Box>

      <Box
        sx={{
          borderRadius: '8px', p: '10px', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between',
          bgcolor: excede ? '#fef2f2' : '#f9fafb',
          color: excede ? '#b91c1c' : '#374151',
        }}
      >
        <span>Suma: <strong>RD$ {fmt(suma)}</strong></span>
        <span>{excede ? 'Excede el total' : `Resto: RD$ ${fmt(resto)}`}</span>
      </Box>
    </Box>
  );
}

// ─── Picker buscable de Nota de Crédito ───────────────────────────────────────
// Combobox simple: escribe el código de la NC o el de su factura de origen para
// filtrar. Lista local (las NCs ya vienen cargadas), sin fetch.
function NotaCreditoPicker({
  notas, valueId, onSelect, disabled, fmt,
}: {
  notas: NotaCreditoDisponible[];
  valueId: number | null;
  onSelect: (nc: NotaCreditoDisponible) => void;
  disabled?: boolean;
  fmt: (n: number) => string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const sel = notas.find(n => n.id === valueId) ?? null;
  const q   = query.trim().toLowerCase();
  const filtradas = q
    ? notas.filter(n =>
        (n.codigo ?? '').toLowerCase().includes(q) ||
        (n.facturaCodigo ?? '').toLowerCase().includes(q))
    : notas;
  const labelSel = sel
    ? `${sel.codigo ?? `NC #${sel.id}`}${sel.facturaCodigo ? ` · ${sel.facturaCodigo}` : ''} — RD$${fmt(sel.montoCents / 100)}`
    : '';

  return (
    <Box sx={{ position: 'relative', mt: 0.5 }}>
      <TextField
        type="text"
        size="small"
        fullWidth
        placeholder="Buscar por código de NC o de factura…"
        value={open ? query : labelSel}
        disabled={disabled}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <Box
          sx={{
            position: 'absolute', zIndex: 50, mt: 0.5, width: '100%', maxHeight: 224, overflow: 'auto',
            borderRadius: '8px', border: '1px solid #e5e7eb', bgcolor: '#fff',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
          }}
        >
          {filtradas.length === 0 ? (
            <Box sx={{ px: 1.5, py: 1, fontSize: '0.75rem', color: '#9ca3af' }}>Sin notas de crédito que coincidan</Box>
          ) : filtradas.map(n => (
            <Box
              component="button"
              key={n.id}
              type="button"
              onMouseDown={(e: React.MouseEvent) => { e.preventDefault(); onSelect(n); setOpen(false); setQuery(''); }}
              sx={{
                width: '100%', textAlign: 'left', px: 1.5, py: 1, fontSize: '0.875rem',
                display: 'flex', justifyContent: 'space-between', gap: 1,
                border: 'none', bgcolor: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
                '&:hover': { bgcolor: '#f0fdfa' },
              }}
            >
              <Box component="span" sx={{ minWidth: 0 }}>
                <Box component="span" sx={{ fontWeight: 500 }}>{n.codigo ?? `NC #${n.id}`}</Box>
                {n.facturaCodigo && <Box component="span" sx={{ color: '#6b7280' }}> · factura {n.facturaCodigo}</Box>}
              </Box>
              <Box component="span" sx={{ color: '#374151', whiteSpace: 'nowrap' }}>RD${fmt(n.montoCents / 100)}</Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

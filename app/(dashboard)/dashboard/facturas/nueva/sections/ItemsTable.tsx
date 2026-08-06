'use client';

import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import { Info, X } from 'lucide-react';
import { useProximamenteDialog } from '@/components/proximamente-dialog';
import type { TipoEcfRegla } from '@/lib/ecf/types';
import { Autocomplete } from '../components/Autocomplete';
import { LineaMaestros } from './LineaMaestros';
import { calcularMontoItem } from '../utils/calculos';
import { TASA_ITBIS } from '../utils/types';
import type { ItemLinea, Producto } from '../utils/types';

interface DependienteOpt {
  id: number;
  nombre: string;
  apellido: string;
}

/** Ancho del dropdown de productos — más ancho que la celda para layout tipo tabla. */
const PRODUCTO_DROPDOWN_W = 460;

/**
 * sx de los inputs numéricos de la línea. Las flechas del spinner se ocultan:
 * en una tabla de factura invitan a errores de un clic y roban ancho a la celda.
 */
const inputNumeroSx = {
  '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem' },
  '& input[type=number]': { MozAppearance: 'textfield' },
  '& input[type=number]::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 },
  '& input[type=number]::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
};

/** Fila del dropdown de productos: código (referencia) · nombre + descripción · precio/ITBIS. */
function renderProductoOption(p: Producto) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '5rem 1fr', alignItems: 'start', columnGap: 1.5, rowGap: 0.25 }}>
      <Typography
        component="span"
        title={p.referencia ?? undefined}
        sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pt: '2px' }}
      >
        {p.referencia || '—'}
      </Typography>
      <Typography sx={{ minWidth: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</Typography>
      {p.descripcion && (
        <Typography
          title={p.descripcion}
          sx={{ gridColumn: 'span 2', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem', color: '#6b7280' }}
        >
          {p.descripcion}
        </Typography>
      )}
    </Box>
  );
}

interface Props {
  items: ItemLinea[];
  regla: TipoEcfRegla | undefined;
  buscarProductos: (q: string) => Promise<Producto[]>;
  onSelectProducto: (idx: number, p: Producto) => void;
  /** Texto libre sin match → crear producto en DB y seleccionarlo. */
  onCrearProductoLibre: (idx: number, texto: string) => void;
  onAddItem: () => void;
  onRemoveItem: (id: number) => void;
  onUpdateItem: (id: number, field: keyof ItemLinea, value: string | number | null) => void;
  onSelectBeneficiario: (itemId: number, depId: number | null, nombreCompleto: string) => void;
  onOpenNuevoProducto: (idx: number) => void;
  /** Estado lifted al padre — controla visibilidad de columnas Referencia/Descripción */
  showReferencia: boolean;
  showDescripcion: boolean;
  /** Lista de dependientes del cliente seleccionado. Vacía = no mostrar columna. */
  dependientes: DependienteOpt[];
}


export function ItemsTable({
  items, regla, buscarProductos, onSelectProducto, onCrearProductoLibre,
  onAddItem, onRemoveItem, onUpdateItem, onSelectBeneficiario, onOpenNuevoProducto,
  showReferencia, showDescripcion, dependientes,
}: Props) {
  const { openProximamente, dialog } = useProximamenteDialog();
  const hasDeps = dependientes.length > 0;

  // Compute min-width for the desktop table
  const minWidth =
    hasDeps && showReferencia && showDescripcion ? 960 :
    hasDeps && (showReferencia || showDescripcion) ? 860 :
    hasDeps ? 740 :
    showReferencia && showDescripcion ? 820 :
    (showReferencia || showDescripcion) ? 720 :
    600;

  const headerSx = {
    fontWeight: 600,
    color: '#6b7280',
    fontSize: '0.75rem',
    bgcolor: '#f9fafb',
    py: 1.5,
    px: 1,
    lineHeight: 1.4,
  };

  return (
    <Box>
      {/* ───────── MOBILE: card list (< md) ───────── */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, mx: -2 }}>
        {items.map((item, idx) => (
          <Box
            key={item.id}
            sx={{
              p: 2,
              bgcolor: '#fff',
              borderBottom: '1px solid #f3f4f6',
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            {/* Row header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography
                sx={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Línea {idx + 1}
              </Typography>
              {items.length > 1 && (
                <IconButton
                  size="small"
                  onClick={() => onRemoveItem(item.id)}
                  aria-label={`Eliminar línea ${idx + 1}`}
                  sx={{ color: '#d1d5db', '&:hover': { color: '#ef4444' } }}
                >
                  <X size={20} />
                </IconButton>
              )}
            </Box>

            {/* Beneficiario — mobile */}
            {hasDeps && (
              <Box>
                <Typography
                  component="label"
                  sx={{
                    display: 'block',
                    fontSize: '0.7rem',
                    color: '#4b5563',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    mb: 0.5,
                  }}
                >
                  Beneficiario <Box component="span" sx={{ color: '#ef4444', ml: '2px' }}>*</Box>
                </Typography>
                <Select
                  size="small"
                  fullWidth
                  displayEmpty
                  value={item.dependienteId ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      onSelectBeneficiario(item.id, null, '');
                    } else {
                      const id = parseInt(String(val), 10);
                      const dep = dependientes.find(d => d.id === id);
                      onSelectBeneficiario(item.id, id, dep ? `${dep.nombre} ${dep.apellido}` : '');
                    }
                  }}
                  sx={{ borderRadius: '8px' }}
                >
                  <MenuItem value=""><em>— Beneficiario —</em></MenuItem>
                  {dependientes.map(d => (
                    <MenuItem key={d.id} value={d.id}>{d.nombre} {d.apellido}</MenuItem>
                  ))}
                </Select>
              </Box>
            )}

            {/* Producto */}
            <Box>
              <Typography
                component="label"
                sx={{
                  display: 'block',
                  fontSize: '0.7rem',
                  color: '#4b5563',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  mb: 0.5,
                }}
              >
                Producto / servicio
              </Typography>
              <Autocomplete<Producto>
                placeholder="Buscar producto o servicio..."
                value={item.nombreItem}
                onSearch={buscarProductos}
                onSelect={(p) => onSelectProducto(idx, p)}
                onClear={() => onUpdateItem(item.id, 'nombreItem', '')}
                onCreate={() => onOpenNuevoProducto(idx)}
                createLabel="Nuevo producto"
                dropdownMinWidth={PRODUCTO_DROPDOWN_W}
                renderOption={renderProductoOption}
              />
              <LineaMaestros productoId={item.productoId} />
            </Box>

            {showReferencia && (
              <Box>
                <Typography
                  component="label"
                  sx={{
                    display: 'block',
                    fontSize: '0.7rem',
                    color: '#4b5563',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    mb: 0.5,
                  }}
                >
                  Referencia
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Ref."
                  value={item.referencia}
                  onChange={(e) => onUpdateItem(item.id, 'referencia', e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem' } }}
                  slotProps={{ htmlInput: { style: { height: '2.75rem', boxSizing: 'border-box' } } }}
                />
              </Box>
            )}

            {/* Precio + Cantidad */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <Box>
                <Typography
                  component="label"
                  sx={{
                    display: 'block',
                    fontSize: '0.7rem',
                    color: '#4b5563',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    mb: 0.5,
                  }}
                >
                  Precio
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  type="number"
                  placeholder="0.00"
                  value={item.precioUnitarioItem || ''}
                  onChange={(e) => onUpdateItem(item.id, 'precioUnitarioItem', parseFloat(e.target.value) || 0)}
                  sx={inputNumeroSx}
                  slotProps={{ htmlInput: { min: 0, step: 0.01, inputMode: 'decimal', style: { textAlign: 'right' } } }}
                />
              </Box>
              <Box>
                <Typography
                  component="label"
                  sx={{
                    display: 'block',
                    fontSize: '0.7rem',
                    color: '#4b5563',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    mb: 0.5,
                  }}
                >
                  Cantidad
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  type="number"
                  value={item.cantidadItem}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    onUpdateItem(item.id, 'cantidadItem', Number.isFinite(n) && n >= 0 ? n : 0);
                  }}
                  sx={inputNumeroSx}
                  slotProps={{ htmlInput: { min: 0.01, step: 'any', inputMode: 'decimal', style: { textAlign: 'center' } } }}
                />
              </Box>
            </Box>

            {/* Descuento + Impuesto */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <Box>
                <Typography
                  component="label"
                  sx={{
                    display: 'block',
                    fontSize: '0.7rem',
                    color: '#4b5563',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    mb: 0.5,
                  }}
                >
                  Descuento %
                </Typography>
                <Box sx={{ position: 'relative' }}>
                  <TextField
                    size="small"
                    fullWidth
                    type="number"
                    placeholder="0"
                    value={item.descuentoPct || ''}
                    onChange={(e) => onUpdateItem(item.id, 'descuentoPct', parseFloat(e.target.value) || 0)}
                    sx={inputNumeroSx}
                    slotProps={{ htmlInput: { min: 0, max: 100, step: 0.1, inputMode: 'decimal', style: { textAlign: 'center', paddingRight: '1.5rem' } } }}
                  />
                  <Typography
                    sx={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '0.75rem',
                      color: '#6b7280',
                      pointerEvents: 'none',
                    }}
                  >
                    %
                  </Typography>
                </Box>
              </Box>
              <Box>
                <Typography
                  component="label"
                  sx={{
                    display: 'block',
                    fontSize: '0.7rem',
                    color: '#4b5563',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    mb: 0.5,
                  }}
                >
                  Impuesto
                </Typography>
                <Select
                  size="small"
                  fullWidth
                  value={item.tasaItbis}
                  onChange={(e) => onUpdateItem(item.id, 'tasaItbis', e.target.value)}
                  disabled={regla !== undefined && !regla.permiteItbis}
                  sx={{ borderRadius: '8px', fontSize: '0.875rem' }}
                >
                  {(regla === undefined || regla.permiteItbis)
                    ? TASA_ITBIS.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)
                    : <MenuItem value="exento">Exento</MenuItem>
                  }
                </Select>
              </Box>
            </Box>

            {showDescripcion && (
              <Box>
                <Typography
                  component="label"
                  sx={{
                    display: 'block',
                    fontSize: '0.7rem',
                    color: '#4b5563',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    mb: 0.5,
                  }}
                >
                  Descripción
                </Typography>
                <TextField
                  multiline
                  fullWidth
                  minRows={2}
                  placeholder="Descripción..."
                  value={item.descripcionItem}
                  onChange={(e) => onUpdateItem(item.id, 'descripcionItem', e.target.value)}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      '& fieldset': { borderColor: '#e5e7eb' },
                      '&:hover fieldset': { borderColor: '#9ca3af' },
                      '&.Mui-focused fieldset': { borderColor: '#3658e1' },
                    },
                  }}
                />
              </Box>
            )}

            {/* Total row */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                pt: 1,
                borderTop: '1px solid #f3f4f6',
              }}
            >
              <Typography sx={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total
              </Typography>
              <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                RD$ {calcularMontoItem(item).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>

      {/* ───────── DESKTOP: table (≥ md) ───────── */}
      <Box
        sx={{
          display: { xs: 'none', md: 'block' },
          overflowX: 'auto',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
        }}
      >
        <Table
          size="small"
          sx={{
            width: '100%',
            minWidth,
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            '& th': { fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', bgcolor: '#f9fafb' },
          }}
        >
          <TableHead>
            <TableRow sx={{ borderBottom: '2px solid #e5e7eb' }}>
              {hasDeps && (
                <TableCell sx={{ ...headerSx, textAlign: 'left', width: '16%' }}>
                  Beneficiario <Box component="span" sx={{ color: '#ef4444', ml: '2px' }}>*</Box>
                </TableCell>
              )}
              <TableCell
                sx={{
                  ...headerSx,
                  textAlign: 'left',
                  px: 2,
                  width: hasDeps && showReferencia && showDescripcion ? '16%' :
                    hasDeps && (showReferencia || showDescripcion) ? '18%' :
                    hasDeps ? '22%' :
                    showReferencia && showDescripcion ? '22%' :
                    showReferencia ? '28%' :
                    showDescripcion ? '22%' : '32%',
                }}
              >
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  Producto
                  <Tooltip title="DGII #84 · nombreItem · máx 80 caracteres" arrow>
                    <Box component="span" sx={{ display: 'inline-flex', color: '#4b5563', cursor: 'help' }}>
                      <Info size={12} aria-hidden="true" />
                    </Box>
                  </Tooltip>
                </Box>
              </TableCell>
              {showReferencia && (
                <TableCell sx={{ ...headerSx, textAlign: 'left', width: '10%' }}>Referencia</TableCell>
              )}
              <TableCell
                sx={{
                  ...headerSx,
                  textAlign: 'right',
                  width: (showReferencia && showDescripcion) ? '10%' : (showReferencia || showDescripcion) ? '12%' : '14%',
                }}
              >
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                  Precio
                  <Tooltip title="DGII #94 · precioUnitarioItem" arrow>
                    <Box component="span" sx={{ display: 'inline-flex', color: '#4b5563', cursor: 'help' }}>
                      <Info size={12} aria-hidden="true" />
                    </Box>
                  </Tooltip>
                </Box>
              </TableCell>
              <TableCell sx={{ ...headerSx, textAlign: 'center', width: '8%' }}>Desc %</TableCell>
              <TableCell
                sx={{
                  ...headerSx,
                  textAlign: 'left',
                  width: (showReferencia && showDescripcion) ? '10%' : (showReferencia || showDescripcion) ? '12%' : '14%',
                }}
              >
                Impuesto
              </TableCell>
              {showDescripcion && (
                <TableCell sx={{ ...headerSx, textAlign: 'left', width: '16%' }}>Descripción</TableCell>
              )}
              <TableCell
                sx={{
                  ...headerSx,
                  textAlign: 'center',
                  width: (showReferencia && showDescripcion) ? '10%' : (showReferencia || showDescripcion) ? '12%' : '14%',
                }}
              >
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, justifyContent: 'center' }}>
                  Cantidad
                  <Tooltip title="DGII #91 · cantidadItem" arrow>
                    <Box component="span" sx={{ display: 'inline-flex', color: '#4b5563', cursor: 'help' }}>
                      <Info size={12} aria-hidden="true" />
                    </Box>
                  </Tooltip>
                </Box>
              </TableCell>
              <TableCell
                sx={{
                  ...headerSx,
                  textAlign: 'right',
                  width: (showReferencia && showDescripcion) ? '12%' : (showReferencia || showDescripcion) ? '14%' : '16%',
                }}
              >
                Total
              </TableCell>
              <TableCell sx={{ ...headerSx, width: 40 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item, idx) => (
              <TableRow
                key={item.id}
                sx={{
                  borderBottom: '1px solid #f9fafb',
                  verticalAlign: 'top',
                  '&:hover .remove-btn': { opacity: 1 },
                }}
              >
                {/* Beneficiario cell — desktop */}
                {hasDeps && (
                  <TableCell sx={{ px: 1, py: 1 }}>
                    <Select
                      size="small"
                      fullWidth
                      displayEmpty
                      value={item.dependienteId ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) {
                          onSelectBeneficiario(item.id, null, '');
                        } else {
                          const id = parseInt(String(val), 10);
                          const dep = dependientes.find(d => d.id === id);
                          onSelectBeneficiario(item.id, id, dep ? `${dep.nombre} ${dep.apellido}` : '');
                        }
                      }}
                      sx={{ borderRadius: '8px', fontSize: '0.875rem' }}
                    >
                      <MenuItem value=""><em>— Beneficiario —</em></MenuItem>
                      {dependientes.map(d => (
                        <MenuItem key={d.id} value={d.id}>{d.nombre} {d.apellido}</MenuItem>
                      ))}
                    </Select>
                  </TableCell>
                )}

                {/* Producto */}
                <TableCell sx={{ px: 2, py: 1 }}>
                  <Autocomplete<Producto>
                    placeholder="Buscar producto o servicio..."
                    value={item.nombreItem}
                    onSearch={buscarProductos}
                    onSelect={(p) => onSelectProducto(idx, p)}
                    onClear={() => onUpdateItem(item.id, 'nombreItem', '')}
                    onCreate={() => onOpenNuevoProducto(idx)}
                    createLabel="Nuevo producto"
                    dropdownMinWidth={PRODUCTO_DROPDOWN_W}
                    renderOption={renderProductoOption}
                  />
                  <LineaMaestros productoId={item.productoId} />
                </TableCell>

                {/* Referencia */}
                {showReferencia && (
                  <TableCell sx={{ px: 1, py: 1 }}>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="Ref."
                      value={item.referencia}
                      onChange={(e) => onUpdateItem(item.id, 'referencia', e.target.value)}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem' } }}
                    />
                  </TableCell>
                )}

                {/* Precio */}
                <TableCell sx={{ px: 1, py: 1 }}>
                  <TextField
                    size="small"
                    fullWidth
                    type="number"
                    placeholder="0.00"
                    value={item.precioUnitarioItem || ''}
                    onChange={(e) => onUpdateItem(item.id, 'precioUnitarioItem', parseFloat(e.target.value) || 0)}
                    sx={inputNumeroSx}
                    slotProps={{ htmlInput: { min: 0, step: 0.01, style: { textAlign: 'right' } } }}
                  />
                </TableCell>

                {/* Descuento % */}
                <TableCell sx={{ px: 1, py: 1 }}>
                  <Box sx={{ position: 'relative' }}>
                    <TextField
                      size="small"
                      fullWidth
                      type="number"
                      placeholder="0"
                      value={item.descuentoPct || ''}
                      onChange={(e) => onUpdateItem(item.id, 'descuentoPct', parseFloat(e.target.value) || 0)}
                      sx={inputNumeroSx}
                      slotProps={{ htmlInput: { min: 0, max: 100, step: 0.1, style: { textAlign: 'center', paddingRight: '1.25rem' } } }}
                    />
                    <Typography
                      sx={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '0.75rem',
                        color: '#6b7280',
                        pointerEvents: 'none',
                      }}
                    >
                      %
                    </Typography>
                  </Box>
                </TableCell>

                {/* Impuesto */}
                <TableCell sx={{ px: 1, py: 1 }}>
                  <Select
                    size="small"
                    fullWidth
                    value={item.tasaItbis}
                    onChange={(e) => onUpdateItem(item.id, 'tasaItbis', e.target.value)}
                    disabled={regla !== undefined && !regla.permiteItbis}
                    sx={{ borderRadius: '8px', fontSize: '0.875rem' }}
                  >
                    {(regla === undefined || regla.permiteItbis)
                      ? TASA_ITBIS.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)
                      : <MenuItem value="exento">Exento</MenuItem>
                    }
                  </Select>
                </TableCell>

                {/* Descripción */}
                {showDescripcion && (
                  <TableCell sx={{ px: 1, py: 1 }}>
                    <TextField
                      multiline
                      fullWidth
                      placeholder="Descripción..."
                      value={item.descripcionItem}
                      onChange={(e) => onUpdateItem(item.id, 'descripcionItem', e.target.value)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: '8px',
                          fontSize: '0.875rem',
                          minHeight: 68,
                          alignItems: 'flex-start',
                          '& fieldset': { borderColor: '#e5e7eb' },
                          '&:hover fieldset': { borderColor: '#9ca3af' },
                          '&.Mui-focused fieldset': { borderColor: '#3658e1' },
                        },
                        '& .MuiInputBase-inputMultiline': { resize: 'none' },
                      }}
                    />
                  </TableCell>
                )}

                {/* Cantidad */}
                <TableCell sx={{ px: 1, py: 1 }}>
                  <TextField
                    size="small"
                    fullWidth
                    type="number"
                    value={item.cantidadItem}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value);
                      // permitir 0 explícito, NaN/blank → 0; submit valida > 0
                      onUpdateItem(item.id, 'cantidadItem', Number.isFinite(n) && n >= 0 ? n : 0);
                    }}
                    sx={inputNumeroSx}
                    slotProps={{ htmlInput: { min: 0.01, step: 'any', style: { textAlign: 'center' } } }}
                  />
                </TableCell>

                {/* Total */}
                <TableCell sx={{ px: 1, py: 1, textAlign: 'right' }}>
                  <Box sx={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                      RD$ {calcularMontoItem(item).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                </TableCell>

                {/* Action */}
                <TableCell sx={{ px: 1, py: 1 }}>
                  {items.length > 1 && (
                    <IconButton
                      size="small"
                      className="remove-btn"
                      onClick={() => onRemoveItem(item.id)}
                      aria-label={`Eliminar línea ${idx + 1}`}
                      sx={{
                        color: '#d1d5db',
                        opacity: 0,
                        mt: 0.5,
                        transition: 'color 0.15s, opacity 0.15s',
                        '&:hover': { color: '#f87171' },
                      }}
                    >
                      <X size={16} />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      {/* Footer actions */}
      <Box
        sx={{
          pt: 1.5,
          mt: 0.5,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          borderTop: '1px solid #f9fafb',
        }}
      >
        <Button
          type="button"
          variant="text"
          disableElevation
          onClick={onAddItem}
          sx={{
            textTransform: 'none',
            color: '#3658e1',
            fontSize: '0.875rem',
            fontWeight: 500,
            py: 1,
            my: -1,
            '&:hover': { color: '#2a45c4', bgcolor: 'transparent' },
          }}
        >
          + Agregar línea
        </Button>
        <Button
          type="button"
          variant="text"
          disableElevation
          onClick={() => openProximamente('Agregar Conduce')}
          sx={{
            textTransform: 'none',
            color: '#6b7280',
            fontSize: '0.875rem',
            fontWeight: 500,
            py: 1,
            my: -1,
            '&:hover': { color: '#2a45c4', bgcolor: 'transparent' },
          }}
        >
          + Agregar Conduce
        </Button>
      </Box>
      {dialog}
    </Box>
  );
}

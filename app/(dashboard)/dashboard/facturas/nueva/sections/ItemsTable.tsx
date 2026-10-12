'use client';

import { useState } from 'react';
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
import { renderProductoOption } from '@/components/productos/ProductoOption';
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

/**
 * Número de la línea: se ve como texto y se vuelve campo al hacer clic.
 *
 * Con una caja de input por celda, «Precio» y «Cantidad» pedían el ancho del
 * borde más el relleno más el número, y en una factura de colegio con quince
 * líneas eso son quince rectángulos que nadie está editando. Sin la caja las
 * columnas se aprietan y el ancho sobrante se va a «Producto», que es donde
 * hace falta.
 *
 * Es SIEMPRE el mismo input, solo que sin borde ni fondo mientras no tenga el
 * foco. La primera versión cambiaba un `button` por un `TextField` al hacer
 * clic y el foco se perdía en la carrera: el botón se desmontaba, el navegador
 * mandaba el foco al contenedor y el input recién montado se cerraba solo. Sin
 * intercambio no hay carrera, y de paso el cursor cae donde se hizo clic.
 */
function CeldaNumero({
  valor, onChange, alinear, formatear, soloLectura, etiqueta,
}: {
  valor: number;
  onChange: (n: number) => void;
  alinear: 'right' | 'center';
  /** Cómo se lee en reposo. Con el foco puesto siempre se ve el número crudo. */
  formatear: (n: number) => string;
  soloLectura?: boolean;
  etiqueta: string;
}) {
  const [enfocado, setEnfocado] = useState(false);
  // Lo que había al entrar, para deshacer con Escape. El cambio se aplica tecla
  // a tecla —el total se recalcula en vivo—, así que sin esto no hay a qué
  // volver.
  const [valorPrevio, setValorPrevio] = useState(valor);

  return (
    <TextField
      size="small"
      fullWidth
      // Texto y no `type="number"`: en un input numérico `select()` no hace
      // nada, así que lo tecleado se pegaba detrás del número anterior en vez
      // de reemplazarlo. El valor se sanea en onChange.
      type="text"
      value={enfocado ? String(valor || '') : formatear(valor)}
      onFocus={(e) => {
        if (soloLectura) return;
        setValorPrevio(valor);
        setEnfocado(true);
        // En el siguiente cuadro: ahora mismo el campo todavía muestra el
        // número formateado, y seleccionarlo aquí se perdería al repintar.
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => {
        // Se quitan los separadores de millar por si pegan un importe copiado.
        // En es-DO la coma separa miles y el punto los decimales, igual que el
        // formato que devuelve `toLocaleString` aquí al lado.
        const n = parseFloat(e.target.value.replace(/,/g, ''));
        onChange(Number.isFinite(n) && n >= 0 ? n : 0);
      }}
      onBlur={() => setEnfocado(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { onChange(valorPrevio); e.currentTarget.blur(); }
      }}
      slotProps={{
        input: { readOnly: soloLectura },
        htmlInput: { 'aria-label': etiqueta, inputMode: 'decimal', style: { textAlign: alinear } },
      }}
      sx={{
        '& .MuiOutlinedInput-root': {
          borderRadius: '8px',
          fontSize: '0.875rem',
          bgcolor: 'transparent',
          transition: 'background-color .15s',
          '& fieldset': { borderColor: 'transparent' },
          '&:hover': soloLectura ? undefined : { bgcolor: '#f3f4f6' },
          '&:hover fieldset': { borderColor: soloLectura ? 'transparent' : '#e5e7eb' },
          '&.Mui-focused': { bgcolor: 'transparent' },
          '&.Mui-focused fieldset': { borderColor: '#3658e1' },
        },
        '& .MuiOutlinedInput-input': { color: '#374151', cursor: soloLectura ? 'default' : 'text' },
      }}
    />
  );
}

/** Fila del dropdown de productos: código (referencia) · nombre + descripción · precio/ITBIS. */
// Se mudó a components/productos/ProductoOption.tsx: ahora también lo usa el
// ajuste de inventario, y dos copias del mismo dibujo se separan solas.

interface Props {
  items: ItemLinea[];
  regla: TipoEcfRegla | undefined;
  buscarProductos: (q: string, dependienteId?: number | null) => Promise<Producto[]>;
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
  /**
   * Esconde la columna de impuesto y deja todas las líneas en exento.
   *
   * Para los colegios: la enseñanza está exenta de ITBIS, así que el selector
   * es una casilla que solo se puede equivocar. Ojo — se OCULTA y se FUERZA a
   * la vez, nunca solo una de las dos: un impuesto que no se ve pero sí se
   * envía es peor que uno visible y mal puesto.
   */
  ocultarItbis?: boolean;
  /**
   * Muestra la columna de descuento por línea.
   *
   * Apagada por defecto: la mayoría de las facturas no llevan descuento y la
   * casilla vacía en cada renglón robaba ancho a lo que sí se escribe. Se
   * enciende desde «Columnas», junto a Referencia y Descripción.
   */
  showDescuento?: boolean;
  /** Esconde «Agregar Conduce»: un colegio no despacha mercancía con conduce. */
  ocultarConduce?: boolean;
  /** Lista de dependientes del cliente seleccionado. Vacía = no mostrar columna. */
  dependientes: DependienteOpt[];
  /**
   * Sin el permiso `facturas:precio-editar`, el precio y el descuento quedan en
   * solo lectura y no se pueden abrir líneas libres: se factura con lo que trae
   * el producto del catálogo. El servidor lo vuelve a validar al guardar — esto
   * es la mitad visible, no el candado.
   */
  bloquearPrecios?: boolean;
  /** Ajusta texto para compra/gasto sin quitar asociación opcional a inventario. */
  modoGasto?: boolean;
}


export function ItemsTable({
  items, regla, buscarProductos, onSelectProducto, onCrearProductoLibre,
  onAddItem, onRemoveItem, onUpdateItem, onSelectBeneficiario, onOpenNuevoProducto,
  showReferencia, showDescripcion, dependientes, bloquearPrecios = false, modoGasto = false,
  ocultarItbis = false,
  showDescuento = false,
  ocultarConduce = false,
}: Props) {
  const { openProximamente, dialog } = useProximamenteDialog();
  const hasDeps = dependientes.length > 0;
  const etiquetaDetalle = modoGasto ? 'Descripción / producto' : 'Producto / servicio';
  const placeholderDetalle = modoGasto ? 'Describe gasto o busca producto de inventario...' : 'Buscar producto o servicio...';
  const crearLabel = modoGasto ? 'Crear producto para inventario' : 'Nuevo producto';

  /**
   * Ancho de cada columna en píxeles — salvo Producto, que no lleva ninguno.
   *
   * Con `table-layout: fixed`, la columna sin ancho se queda con todo el
   * espacio sobrante. Antes todas iban en porcentaje y sumaban ~76%: el 24%
   * restante se lo comía la última columna (la de la X), así que la tabla
   * terminaba con una franja en blanco a la derecha mientras «Producto» se
   * quedaba estrecho y «RD$ 5,000.00» se partía en dos líneas.
   */
  const W = {
    // Más ancha de lo que pide el texto suelto: ahora que el nombre envuelve,
    // a 190px «ALISA PAOLA FERRERAS CONCEPCION» caía en tres renglones y
    // estiraba la fila entera. A 230 entra en dos.
    beneficiario: 230,
    referencia: 120,
    // Precio, cantidad y total ya no llevan caja de input —son texto—, así que
    // se les quitó el ancho que pedía el borde. Lo que sobra se lo lleva
    // «Producto», que es la columna que de verdad lo necesita.
    precio: 96,
    descuento: 80,
    impuesto: 130,
    descripcion: 200,
    cantidad: 76,
    total: 122,
    accion: 40,
  } as const;

  // Debajo de esto la tabla scrollea en horizontal en vez de estrujarse. Es la
  // suma de lo fijo más lo mínimo que necesita el buscador de producto.
  const minWidth =
    190 +
    (hasDeps ? W.beneficiario : 0) +
    (showReferencia ? W.referencia : 0) +
    W.precio +
    (showDescuento ? W.descuento : 0) +
    (ocultarItbis ? 0 : W.impuesto) +
    (showDescripcion ? W.descripcion : 0) +
    W.cantidad + W.total + W.accion;

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
                {etiquetaDetalle}
              </Typography>
              <Autocomplete<Producto>
                placeholder={placeholderDetalle}
                value={item.nombreItem}
                onSearch={(q) => buscarProductos(q, item.dependienteId)}
                onSelect={(p) => onSelectProducto(idx, p)}
                onClear={() => onUpdateItem(item.id, 'nombreItem', '')}
                onCreate={bloquearPrecios ? undefined : () => onOpenNuevoProducto(idx)}
                createLabel={crearLabel}
                onFreeText={modoGasto ? (text) => onUpdateItem(item.id, 'nombreItem', text) : undefined}
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
                  title={bloquearPrecios ? 'Tu rol no puede cambiar el precio del producto' : undefined}
                  onChange={(e) => onUpdateItem(item.id, 'precioUnitarioItem', parseFloat(e.target.value) || 0)}
                  sx={inputNumeroSx}
                  slotProps={{ htmlInput: { min: 0, step: 0.01, inputMode: 'decimal', style: { textAlign: 'right' } , readOnly: bloquearPrecios } }}
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

            {/* Descuento + Impuesto. Si no va ninguno de los dos, el bloque
                entero desaparece en vez de dejar una rejilla vacía. */}
            {(showDescuento || !ocultarItbis) && (
            <Box sx={{ display: 'grid', gridTemplateColumns: showDescuento && !ocultarItbis ? '1fr 1fr' : '1fr', gap: 1.5 }}>
              {showDescuento && (
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
                      title={bloquearPrecios ? 'Tu rol no puede aplicar descuentos' : undefined}
                    onChange={(e) => onUpdateItem(item.id, 'descuentoPct', parseFloat(e.target.value) || 0)}
                    sx={inputNumeroSx}
                    slotProps={{ htmlInput: { min: 0, max: 100, step: 0.1, inputMode: 'decimal', style: { textAlign: 'center', paddingRight: '1.5rem' }, readOnly: bloquearPrecios } }}
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
              )}
              {!ocultarItbis && (
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
              )}
            </Box>
            )}

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
                <TableCell sx={{ ...headerSx, textAlign: 'left', width: W.beneficiario }}>
                  Beneficiario <Box component="span" sx={{ color: '#ef4444', ml: '2px' }}>*</Box>
                </TableCell>
              )}
              <TableCell
                sx={{
                  ...headerSx,
                  textAlign: 'left',
                  // Sin ancho a propósito: esta es la columna que absorbe el
                  // sobrante y estira la tabla hasta el borde.
                }}
              >
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  {modoGasto ? 'Detalle' : 'Producto'}
                  <Tooltip title="DGII #84 · nombreItem · máx 80 caracteres" arrow>
                    <Box component="span" sx={{ display: 'inline-flex', color: '#4b5563', cursor: 'help' }}>
                      <Info size={12} aria-hidden="true" />
                    </Box>
                  </Tooltip>
                </Box>
              </TableCell>
              {showReferencia && (
                <TableCell sx={{ ...headerSx, textAlign: 'left', width: W.referencia }}>Referencia</TableCell>
              )}
              <TableCell
                sx={{
                  ...headerSx,
                  textAlign: 'right',
                  width: W.precio,
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
              {showDescuento && (
                <TableCell sx={{ ...headerSx, textAlign: 'center', width: W.descuento }}>Desc %</TableCell>
              )}
              {!ocultarItbis && (
              <TableCell
                sx={{
                  ...headerSx,
                  textAlign: 'left',
                  width: W.impuesto,
                }}
              >
                Impuesto
              </TableCell>
              )}
              {showDescripcion && (
                <TableCell sx={{ ...headerSx, textAlign: 'left', width: W.descripcion }}>Descripción</TableCell>
              )}
              <TableCell
                sx={{
                  ...headerSx,
                  textAlign: 'center',
                  width: W.cantidad,
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
                  width: W.total,
                }}
              >
                Total
              </TableCell>
              <TableCell sx={{ ...headerSx, width: W.accion }} />
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
                      sx={{
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                        // Sin esto MUI corta el nombre con puntos suspensivos.
                        // «ALISA PAOLA FE…» no dice a cuál hija se le está
                        // cobrando, que es justo lo único que esta columna
                        // tiene que decir.
                        '& .MuiSelect-select': {
                          whiteSpace: 'normal',
                          overflow: 'visible',
                          textOverflow: 'clip',
                          lineHeight: 1.3,
                          py: 1,
                        },
                      }}
                    >
                      <MenuItem value=""><em>— Beneficiario —</em></MenuItem>
                      {dependientes.map(d => (
                        <MenuItem key={d.id} value={d.id} sx={{ whiteSpace: 'normal' }}>
                          {d.nombre} {d.apellido}
                        </MenuItem>
                      ))}
                    </Select>
                  </TableCell>
                )}

                {/* Producto */}
                <TableCell sx={{ px: 1, py: 1 }}>
                  <Autocomplete<Producto>
                    placeholder={placeholderDetalle}
                    value={item.nombreItem}
                    onSearch={(q) => buscarProductos(q, item.dependienteId)}
                    onSelect={(p) => onSelectProducto(idx, p)}
                    onClear={() => onUpdateItem(item.id, 'nombreItem', '')}
                    onCreate={bloquearPrecios ? undefined : () => onOpenNuevoProducto(idx)}
                    createLabel={crearLabel}
                    onFreeText={modoGasto ? (text) => onUpdateItem(item.id, 'nombreItem', text) : undefined}
                    dropdownMinWidth={PRODUCTO_DROPDOWN_W}
                    renderOption={renderProductoOption}
                    // El nombre del producto identifica la línea: cortado a
                    // «Manuales Caligrafias…» no se sabe cuál manual es.
                    multilinea
                  />
                  {/*
                    Dónde está matriculado el alumno, debajo del concepto.

                    Va en `descripcionItem`, que es su sitio —viaja al PDF—,
                    pero esa columna está apagada por defecto: sin esto, en el
                    cajón del colegio la línea decía «Pago de colegiatura —
                    Septiembre 2026» y el grado no se veía por ninguna parte.
                    Si la columna está encendida no se repite.
                  */}
                  {!showDescripcion && item.descripcionItem.trim() && (
                    <Typography
                      title={item.descripcionItem}
                      sx={{
                        mt: 0.25, fontSize: '0.6875rem', color: 'text.secondary',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {item.descripcionItem}
                    </Typography>
                  )}
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
                  <CeldaNumero
                    valor={item.precioUnitarioItem}
                    onChange={(n) => onUpdateItem(item.id, 'precioUnitarioItem', n)}
                    alinear="right"
                    formatear={(n) => n.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    soloLectura={bloquearPrecios}
                    etiqueta={`Precio línea ${idx + 1}`}
                  />
                </TableCell>

                {/* Descuento % */}
                {showDescuento && (
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
                      slotProps={{ htmlInput: { min: 0, max: 100, step: 0.1, style: { textAlign: 'center', paddingRight: '1.25rem' }, readOnly: bloquearPrecios } }}
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
                )}

                {/* Impuesto — se omite entero cuando el emisor está exento. */}
                {!ocultarItbis && (
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
                )}

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
                  {/* 0 explícito se permite al escribir; el submit valida > 0. */}
                  <CeldaNumero
                    valor={item.cantidadItem}
                    onChange={(n) => onUpdateItem(item.id, 'cantidadItem', n)}
                    alinear="center"
                    formatear={(n) => n.toLocaleString('es-DO', { maximumFractionDigits: 4 })}
                    etiqueta={`Cantidad línea ${idx + 1}`}
                  />
                </TableCell>

                {/* Total */}
                <TableCell sx={{ px: 1, py: 1, textAlign: 'right' }}>
                  <Box sx={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151', whiteSpace: 'nowrap' }}>
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
        {!ocultarConduce && (
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
        )}
      </Box>
      {dialog}
    </Box>
  );
}

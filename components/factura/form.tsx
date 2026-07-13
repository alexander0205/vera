'use client';

/**
 * Componentes UI del formulario de factura.
 * Cada uno consume estado vía useFactura() del Provider.
 *
 * Diseño responsive:
 *   - Móvil (<md): cards apiladas, botón full-width, una columna
 *   - Desktop (md+): tabla horizontal, botón compacto, dos columnas
 */

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, AlertCircle, CheckCircle2, Search, X } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { useFactura } from '@/lib/factura/form';
import { fmtMoneda, type TasaItbis, type TipoPago } from '@/lib/factura/core';

// ─── ClienteSearch ────────────────────────────────────────────────────────────

interface ClienteResult {
  id:          number;
  razonSocial: string;
  rnc:         string | null;
  email:       string | null;
}

/**
 * Buscador de clientes guardados.
 * Al seleccionar uno, llena automáticamente los campos del comprador
 * vía el Provider (useFactura). Reusable: solo importa.
 */
export function ClienteSearch() {
  const { setRncComprador, setRazonSocial, setEmailComprador } = useFactura();
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<ClienteResult[]>([]);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const timer                 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef            = useRef<HTMLDivElement>(null);

  // Cerrar al click fuera
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function handleInput(v: string) {
    setQuery(v);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res  = await fetch(`/api/clientes?q=${encodeURIComponent(v)}`);
        const data = await res.json();
        setResults(data.clientes ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  }

  function select(c: ClienteResult) {
    setRncComprador(c.rnc ?? '');
    setRazonSocial(c.razonSocial);
    setEmailComprador(c.email ?? '');
    setQuery('');
    setOpen(false);
    setResults([]);
  }

  return (
    <Box ref={wrapperRef} sx={{ position: 'relative' }}>
      <Typography
        component="label"
        sx={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', mb: 0.5 }}
      >
        Buscar cliente <Box component="span" sx={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</Box>
      </Typography>
      <TextField
        fullWidth
        size="small"
        value={query}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Nombre o RNC del cliente..."
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search style={{ width: 16, height: 16, color: '#9ca3af' }} />
              </InputAdornment>
            ),
            endAdornment: loading ? (
              <InputAdornment position="end">
                <CircularProgress size={16} sx={{ color: '#9ca3af' }} />
              </InputAdornment>
            ) : query ? (
              <InputAdornment position="end">
                <IconButton
                  type="button"
                  size="small"
                  onClick={() => { setQuery(''); setResults([]); setOpen(false); }}
                  aria-label="Limpiar búsqueda"
                  sx={{ color: '#9ca3af', '&:hover': { color: '#4b5563' } }}
                >
                  <X style={{ width: 16, height: 16 }} />
                </IconButton>
              </InputAdornment>
            ) : null,
          },
        }}
      />

      {open && (
        <Paper
          elevation={3}
          sx={{
            position: 'absolute',
            zIndex: 20,
            mt: 0.5,
            width: '100%',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            maxHeight: 240,
            overflow: 'auto',
          }}
        >
          {results.length === 0 ? (
            <Box sx={{ px: 1.5, py: 1.5, fontSize: '0.875rem', color: '#6b7280' }}>Sin resultados</Box>
          ) : (
            results.map(c => (
              <Box
                key={c.id}
                component="button"
                type="button"
                onClick={() => select(c)}
                sx={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  px: 1.5,
                  py: 1.25,
                  font: 'inherit',
                  bgcolor: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #f3f4f6',
                  cursor: 'pointer',
                  '&:last-of-type': { borderBottom: 'none' },
                  '&:hover': { bgcolor: '#f9fafb' },
                }}
              >
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>{c.razonSocial}</Typography>
                {c.rnc && <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>RNC: {c.rnc}</Typography>}
              </Box>
            ))
          )}
        </Paper>
      )}
    </Box>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

/**
 * Datos del comprador.
 * Incluye el buscador de clientes guardados arriba + campos editables abajo.
 * Si seleccionas un cliente del buscador, los campos se rellenan automáticamente.
 * Puedes editarlos manualmente o dejarlos vacíos (consumidor final en tipo 32).
 */
export function FacturaHeader() {
  const { rncComprador, setRncComprador, razonSocial, setRazonSocial } = useFactura();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <ClienteSearch />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        <Box>
          <Typography
            component="label"
            sx={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', mb: 0.5 }}
          >
            RNC / Cédula / Pasaporte <Box component="span" sx={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</Box>
          </Typography>
          <TextField
            fullWidth
            size="small"
            value={rncComprador}
            onChange={e => setRncComprador(e.target.value)}
            placeholder="131988032 o PA123456"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
        </Box>
        <Box>
          <Typography
            component="label"
            sx={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', mb: 0.5 }}
          >
            Razón social <Box component="span" sx={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</Box>
          </Typography>
          <TextField
            fullWidth
            size="small"
            value={razonSocial}
            onChange={e => setRazonSocial(e.target.value)}
            placeholder="Empresa SRL"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
        </Box>
      </Box>
    </Box>
  );
}

// ─── Items ────────────────────────────────────────────────────────────────────

export function FacturaItems() {
  const { items, addItem, removeItem, updateItem } = useFactura();

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography component="label" sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>Items</Typography>
        <Button
          type="button"
          variant="text"
          onClick={addItem}
          startIcon={<Plus style={{ width: 16, height: 16 }} />}
          sx={{
            textTransform: 'none',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#0d9488',
            px: 1,
            py: 0.5,
            minWidth: 0,
            '&:hover': { color: '#0f766e', bgcolor: 'transparent' },
          }}
        >
          Agregar
        </Button>
      </Box>

      {/* ─── Móvil: cards ─────────────────────────────────────────────────── */}
      <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 1.5 }}>
        {items.map((it, idx) => (
          <Box
            key={it.id}
            sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', p: 1.5, bgcolor: '#fff', display: 'flex', flexDirection: 'column', gap: 1.5 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#6b7280' }}>Item #{idx + 1}</Typography>
              {items.length > 1 && (
                <IconButton
                  type="button"
                  size="small"
                  onClick={() => removeItem(it.id)}
                  aria-label="Eliminar item"
                  sx={{ color: '#9ca3af', '&:hover': { color: '#dc2626' } }}
                >
                  <Trash2 style={{ width: 16, height: 16 }} />
                </IconButton>
              )}
            </Box>

            <TextField
              fullWidth
              size="small"
              value={it.nombre}
              onChange={e => updateItem(it.id, { nombre: e.target.value })}
              placeholder="Nombre del producto o servicio"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
              <Box>
                <Typography component="label" sx={{ display: 'block', fontSize: '0.75rem', color: '#4b5563', mb: 0.5 }}>Cant.</Typography>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  value={it.cantidad}
                  onChange={e => updateItem(it.id, { cantidad: Number(e.target.value) || 1 })}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                  slotProps={{ htmlInput: { min: 1, step: 1, inputMode: 'numeric', style: { textAlign: 'right' } } }}
                />
              </Box>
              <Box>
                <Typography component="label" sx={{ display: 'block', fontSize: '0.75rem', color: '#4b5563', mb: 0.5 }}>Precio</Typography>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  value={it.precio || ''}
                  onChange={e => updateItem(it.id, { precio: Number(e.target.value) || 0 })}
                  placeholder="0.00"
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                  slotProps={{ htmlInput: { min: 0, step: 0.01, inputMode: 'decimal', style: { textAlign: 'right' } } }}
                />
              </Box>
              <Box>
                <Typography component="label" sx={{ display: 'block', fontSize: '0.75rem', color: '#4b5563', mb: 0.5 }}>ITBIS</Typography>
                <Select
                  fullWidth
                  size="small"
                  value={it.tasaItbis}
                  onChange={e => updateItem(it.id, { tasaItbis: Number(e.target.value) as TasaItbis })}
                  sx={{ borderRadius: '8px', fontSize: '0.875rem' }}
                >
                  <MenuItem value={0.18}>18%</MenuItem>
                  <MenuItem value={0}>0%</MenuItem>
                </Select>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 1, borderTop: '1px solid #f3f4f6' }}>
              <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Total línea</Typography>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                {fmtMoneda(it.cantidad * it.precio * (1 + it.tasaItbis))}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>

      {/* ─── Desktop: tabla ───────────────────────────────────────────────── */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <Table
          size="small"
          sx={{ '& th': { fontWeight: 500, color: '#6b7280', bgcolor: '#f9fafb', fontSize: '0.875rem' } }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ textAlign: 'left' }}>Descripción</TableCell>
              <TableCell align="right" sx={{ width: 80 }}>Cant.</TableCell>
              <TableCell align="right" sx={{ width: 128 }}>Precio</TableCell>
              <TableCell align="right" sx={{ width: 96 }}>ITBIS</TableCell>
              <TableCell align="right" sx={{ width: 128 }}>Total</TableCell>
              <TableCell sx={{ width: 40 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map(it => (
              <TableRow key={it.id}>
                <TableCell sx={{ px: 1, py: 0.5 }}>
                  <TextField
                    fullWidth
                    size="small"
                    value={it.nombre}
                    onChange={e => updateItem(it.id, { nombre: e.target.value })}
                    placeholder="Nombre del producto o servicio"
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem' } }}
                  />
                </TableCell>
                <TableCell sx={{ px: 1, py: 0.5 }}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    value={it.cantidad}
                    onChange={e => updateItem(it.id, { cantidad: Number(e.target.value) || 1 })}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem' } }}
                    slotProps={{ htmlInput: { min: 1, step: 1, style: { textAlign: 'right' } } }}
                  />
                </TableCell>
                <TableCell sx={{ px: 1, py: 0.5 }}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    value={it.precio || ''}
                    onChange={e => updateItem(it.id, { precio: Number(e.target.value) || 0 })}
                    placeholder="0.00"
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem' } }}
                    slotProps={{ htmlInput: { min: 0, step: 0.01, style: { textAlign: 'right' } } }}
                  />
                </TableCell>
                <TableCell sx={{ px: 1, py: 0.5 }}>
                  <Select
                    fullWidth
                    size="small"
                    value={it.tasaItbis}
                    onChange={e => updateItem(it.id, { tasaItbis: Number(e.target.value) as TasaItbis })}
                    sx={{ borderRadius: '8px', fontSize: '0.875rem' }}
                  >
                    <MenuItem value={0.18}>18%</MenuItem>
                    <MenuItem value={0}>0%</MenuItem>
                  </Select>
                </TableCell>
                <TableCell align="right" sx={{ fontSize: '0.875rem', color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtMoneda(it.cantidad * it.precio * (1 + it.tasaItbis))}
                </TableCell>
                <TableCell align="center" sx={{ px: 0.5 }}>
                  {items.length > 1 && (
                    <IconButton
                      type="button"
                      size="small"
                      onClick={() => removeItem(it.id)}
                      aria-label="Eliminar item"
                      sx={{ color: '#9ca3af', '&:hover': { color: '#dc2626' } }}
                    >
                      <Trash2 style={{ width: 16, height: 16 }} />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

export function FacturaFooter() {
  const { tipoPago, setTipoPago, totales, enviando, emitir, previewAbierto } = useFactura();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2, borderTop: '1px solid #e5e7eb' }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { sm: 'flex-end' },
          justifyContent: { sm: 'space-between' },
          gap: 2,
        }}
      >
        <Box sx={{ width: { xs: '100%', sm: 'auto' } }}>
          <Typography component="label" sx={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', mb: 0.5 }}>
            Tipo de pago
          </Typography>
          <Select
            value={tipoPago}
            onChange={e => setTipoPago(Number(e.target.value) as TipoPago)}
            size="small"
            sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: 160, borderRadius: '8px', fontSize: '0.875rem' }}
          >
            <MenuItem value={1}>Contado</MenuItem>
            <MenuItem value={2}>Crédito</MenuItem>
          </Select>
        </Box>

        <Box sx={{ width: { xs: '100%', sm: 'auto' }, display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.875rem' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: { sm: 4 }, color: '#4b5563' }}>
            <Box component="span">Subtotal:</Box>
            <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoneda(totales.subtotal)}</Box>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: { sm: 4 }, color: '#4b5563' }}>
            <Box component="span">ITBIS:</Box>
            <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoneda(totales.totalItbis)}</Box>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: { sm: 4 }, fontSize: '1rem', fontWeight: 600, color: '#111827', pt: 0.5, borderTop: '1px solid #e5e7eb' }}>
            <Box component="span">Total:</Box>
            <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoneda(totales.montoTotal)}</Box>
          </Box>
        </Box>
      </Box>

      <Button
        type="button"
        variant="contained"
        disableElevation
        onClick={emitir}
        disabled={enviando || previewAbierto}
        sx={{
          width: { xs: '100%', sm: 'auto' },
          alignSelf: { sm: 'flex-end' },
          px: 3,
          py: { xs: 1.5, sm: 1.25 },
          textTransform: 'none',
          fontWeight: 500,
          bgcolor: '#0d9488',
          '&:hover': { bgcolor: '#0f766e' },
          '&.Mui-disabled': { bgcolor: '#0d948880', color: '#fff' },
        }}
      >
        Revisar y emitir
      </Button>
    </Box>
  );
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function FacturaMessages() {
  const { error, exito, previewAbierto } = useFactura();
  // Mientras la pre-factura está abierta, los errores se muestran adentro del modal.
  const visibleError = previewAbierto ? null : error;
  if (!visibleError && !exito) return null;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {visibleError && (
        <Alert
          severity="error"
          icon={<AlertCircle style={{ width: 16, height: 16 }} />}
          sx={{ borderRadius: '8px', alignItems: 'flex-start', '& .MuiAlert-message': { fontSize: '0.875rem' } }}
        >
          {visibleError}
        </Alert>
      )}
      {exito && (
        <Alert
          severity="success"
          icon={<CheckCircle2 style={{ width: 16, height: 16 }} />}
          sx={{ borderRadius: '8px', alignItems: 'flex-start', '& .MuiAlert-message': { fontSize: '0.875rem', wordBreak: 'break-all' } }}
        >
          Factura emitida: <Box component="strong" sx={{ fontWeight: 700 }}>{exito.encf}</Box> — Estado: {exito.estado}
        </Alert>
      )}
    </Box>
  );
}

// ─── Preview / Pre-factura ────────────────────────────────────────────────────

/**
 * Modal de revisión antes de enviar a DGII.
 * Muestra cliente, items, totales y tipo de pago.
 * Botones: "Editar" (vuelve al form) / "Confirmar y emitir" (dispara API).
 */
export function FacturaPreview() {
  const {
    items, rncComprador, razonSocial, tipoPago, totales,
    enviando, error, previewAbierto, confirmar, cancelarPreview,
  } = useFactura();

  const itemsValidos = items.filter(it => it.nombre.trim() && it.precio > 0);

  return (
    <Dialog
      open={previewAbierto}
      onClose={cancelarPreview}
      fullWidth
      scroll="paper"
      slotProps={{ paper: { sx: { borderRadius: '16px', maxWidth: 672, width: '100%', maxHeight: { xs: '95vh', sm: '90vh' } } } as object }}
    >
      {/* Header del modal */}
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          px: { xs: 2, sm: 3 },
          py: 1.5,
          borderBottom: '1px solid #e5e7eb',
          fontSize: { xs: '1rem', sm: '1.125rem' },
          fontWeight: 600,
          color: '#111827',
        }}
      >
        Pre-factura — Revisar antes de emitir
        <IconButton
          type="button"
          size="small"
          onClick={cancelarPreview}
          aria-label="Cerrar"
          sx={{ color: '#9ca3af', '&:hover': { color: '#4b5563' } }}
        >
          <X style={{ width: 20, height: 20 }} />
        </IconButton>
      </DialogTitle>

      {/* Contenido scrollable */}
      <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {/* Cliente */}
        <Box component="section">
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>
            Cliente
          </Typography>
          {razonSocial.trim() ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              <Typography sx={{ fontWeight: 500, color: '#111827' }}>{razonSocial}</Typography>
              {rncComprador.trim() && (
                <Typography sx={{ fontSize: '0.875rem', color: '#4b5563' }}>RNC: {rncComprador}</Typography>
              )}
            </Box>
          ) : (
            <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', fontStyle: 'italic' }}>Consumidor final</Typography>
          )}
        </Box>

        {/* Items */}
        <Box component="section">
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>
            Items ({itemsValidos.length})
          </Typography>
          <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
            <Table size="small" sx={{ '& th': { fontWeight: 500, color: '#6b7280', bgcolor: '#f9fafb', fontSize: '0.75rem' } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ textAlign: 'left' }}>Descripción</TableCell>
                  <TableCell align="right">Cant.</TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Precio</TableCell>
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {itemsValidos.map(it => (
                  <TableRow key={it.id}>
                    <TableCell sx={{ color: '#111827' }}>{it.nombre}</TableCell>
                    <TableCell align="right" sx={{ color: '#4b5563', fontVariantNumeric: 'tabular-nums' }}>{it.cantidad}</TableCell>
                    <TableCell align="right" sx={{ color: '#4b5563', fontVariantNumeric: 'tabular-nums', display: { xs: 'none', sm: 'table-cell' } }}>
                      {fmtMoneda(it.precio)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#111827', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtMoneda(it.cantidad * it.precio * (1 + it.tasaItbis))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Box>

        {/* Totales */}
        <Box component="section" sx={{ borderTop: '1px solid #e5e7eb', pt: 2, display: 'flex', flexDirection: 'column', gap: 0.75, fontSize: '0.875rem' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563' }}>
            <Box component="span">Subtotal:</Box>
            <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoneda(totales.subtotal)}</Box>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563' }}>
            <Box component="span">ITBIS:</Box>
            <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoneda(totales.totalItbis)}</Box>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 700, color: '#111827', pt: 0.75, borderTop: '1px solid #f3f4f6' }}>
            <Box component="span">Total:</Box>
            <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoneda(totales.montoTotal)}</Box>
          </Box>
        </Box>

        {/* Tipo de pago */}
        <Box component="section" sx={{ fontSize: '0.875rem' }}>
          <Box component="span" sx={{ color: '#6b7280' }}>Tipo de pago: </Box>
          <Box component="span" sx={{ fontWeight: 500, color: '#111827' }}>
            {tipoPago === 1 ? 'Contado' : tipoPago === 2 ? 'Crédito' : 'Gratuito'}
          </Box>
        </Box>

        {/* Error de la API (si falla el envío) */}
        {error && (
          <Alert
            severity="error"
            icon={<AlertCircle style={{ width: 16, height: 16 }} />}
            sx={{ borderRadius: '8px', alignItems: 'flex-start', '& .MuiAlert-message': { fontSize: '0.875rem' } }}
          >
            {error}
          </Alert>
        )}
      </DialogContent>

      {/* Footer del modal */}
      <DialogActions
        sx={{
          flexDirection: { xs: 'column-reverse', sm: 'row' },
          gap: 1,
          px: { xs: 2, sm: 3 },
          py: 1.5,
          borderTop: '1px solid #e5e7eb',
          bgcolor: '#f9fafb',
        }}
      >
        <Button
          type="button"
          variant="outlined"
          onClick={cancelarPreview}
          disabled={enviando}
          sx={{
            width: { xs: '100%', sm: 'auto' },
            textTransform: 'none',
            fontWeight: 500,
            color: '#374151',
            borderColor: '#d1d5db',
            bgcolor: '#fff',
            '&:hover': { borderColor: '#9ca3af', bgcolor: '#f9fafb' },
          }}
        >
          Editar
        </Button>
        <Button
          type="button"
          variant="contained"
          disableElevation
          onClick={confirmar}
          disabled={enviando}
          sx={{
            width: { xs: '100%', sm: 'auto' },
            flex: { sm: 1 },
            textTransform: 'none',
            fontWeight: 500,
            bgcolor: '#0d9488',
            '&:hover': { bgcolor: '#0f766e' },
            '&.Mui-disabled': { bgcolor: '#0d948880', color: '#fff' },
          }}
        >
          {enviando ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} sx={{ color: 'inherit' }} /> Emitiendo...
            </Box>
          ) : 'Confirmar y emitir'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Wrapper de conveniencia ──────────────────────────────────────────────────

export function FacturaForm() {
  return (
    <>
      <Box
        sx={{
          bgcolor: '#fff',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          p: { xs: 2, sm: 3 },
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        <FacturaHeader />
        <FacturaItems />
        <FacturaFooter />
        <FacturaMessages />
      </Box>
      <FacturaPreview />
    </>
  );
}

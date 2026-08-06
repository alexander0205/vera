'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Plus, Trash2, Loader2, ArrowLeft } from 'lucide-react';

interface LineItem {
  descripcion: string;
  precio: number;
  cantidad: number;
}

const EMPTY_ITEM: LineItem = { descripcion: '', precio: 0, cantidad: 1 };

// ─── Card sx shorthand ────────────────────────────────────────────────────────

const cardSx = {
  bgcolor: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  overflow: 'hidden',
} as const;

export default function NuevaCotizacionPage() {
  const router = useRouter();

  // Datos del comprador
  const [razonSocial, setRazonSocial]    = useState('');
  const [rnc, setRnc]                    = useState('');
  const [email, setEmail]                = useState('');
  const [fechaVencimiento, setFechaVenc] = useState('');
  const [notas, setNotas]                = useState('');
  const [terminos, setTerminos]          = useState('');

  // Líneas
  const [items, setItems] = useState<LineItem[]>([{ ...EMPTY_ITEM }]);

  // UI
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // ── helpers ────────────────────────────────────────────────────────────────

  function updateItem(idx: number, field: keyof LineItem, value: string | number) {
    setItems(prev => prev.map((it, i) =>
      i === idx ? { ...it, [field]: value } : it
    ));
  }

  function addItem() {
    setItems(prev => [...prev, { ...EMPTY_ITEM }]);
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  const subtotal = items.reduce((s, it) => s + it.precio * it.cantidad, 0);
  const total    = subtotal; // sin ITBIS en cotización simple

  function formatPesos(n: number) {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
    }).format(n);
  }

  // ── submit ─────────────────────────────────────────────────────────────────

  async function handleGuardar() {
    if (!razonSocial.trim() && items.every(it => !it.descripcion.trim())) {
      setError('Ingresa al menos el nombre del cliente o una línea de ítem');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/cotizaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razonSocialComprador: razonSocial.trim() || null,
          rncComprador:         rnc.trim() || null,
          emailComprador:       email.trim() || null,
          fechaVencimiento:     fechaVencimiento || null,
          montoSubtotal:        subtotal,
          montoDescuento:       0,
          totalItbis:           0,
          montoTotal:           total,
          items:                items.filter(it => it.descripcion.trim()),
          notas:                notas.trim() || null,
          terminosCondiciones:  terminos.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      router.push('/dashboard/cotizaciones');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ bgcolor: '#eef0f7', minHeight: '100%', display: 'flex', flexDirection: 'column', p: 3 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 3 }}>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            component={Link}
            href="/dashboard/cotizaciones"
            variant="text"
            size="small"
            startIcon={<ArrowLeft size={16} />}
            sx={{ textTransform: 'none', color: '#6b7280', '&:hover': { color: '#374151' } }}
          >
            Volver
          </Button>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>
              Nueva cotización
            </Typography>
            <Typography variant="caption" sx={{ color: '#6b7280' }}>
              Se guardará como borrador (COT-XXXX)
            </Typography>
          </Box>
        </Box>

        {error && (
          <Alert
            severity="error"
            sx={{ borderRadius: '8px', fontSize: '0.875rem' }}
          >
            {error}
          </Alert>
        )}

        {/* ── Datos del cliente ─────────────────────────────────────────────── */}
        <Paper sx={cardSx}>
          <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid #f3f4f6' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#111827' }}>
              Datos del cliente
            </Typography>
          </Box>
          <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <TextField
                label="Nombre / Razón Social"
                placeholder="Empresa XYZ SRL"
                size="small"
                fullWidth
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
              <TextField
                label="RNC / Cédula / Pasaporte"
                placeholder="130123456 o PA123456"
                size="small"
                fullWidth
                value={rnc}
                onChange={(e) => setRnc(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <TextField
                label="Email"
                type="email"
                placeholder="facturacion@empresa.com"
                size="small"
                fullWidth
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
              <TextField
                label="Fecha de vencimiento"
                type="date"
                size="small"
                fullWidth
                value={fechaVencimiento}
                onChange={(e) => setFechaVenc(e.target.value)}
                slotProps={{ htmlInput: { min: new Date().toISOString().split('T')[0] }, inputLabel: { shrink: true } }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Box>
          </Box>
        </Paper>

        {/* ── Ítems / Servicios ─────────────────────────────────────────────── */}
        <Paper sx={cardSx}>
          <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#111827' }}>
              Ítems / Servicios
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={addItem}
              startIcon={<Plus size={16} />}
              sx={{ borderRadius: '8px', textTransform: 'none' }}
            >
              Agregar línea
            </Button>
          </Box>

          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f9fafb' }}>
                  <TableCell sx={{ width: '45%', fontWeight: 600, fontSize: '0.8125rem', color: '#374151' }}>
                    Descripción
                  </TableCell>
                  <TableCell sx={{ width: '20%', fontWeight: 600, fontSize: '0.8125rem', color: '#374151' }}>
                    Precio (RD$)
                  </TableCell>
                  <TableCell sx={{ width: '15%', fontWeight: 600, fontSize: '0.8125rem', color: '#374151' }}>
                    Cantidad
                  </TableCell>
                  <TableCell sx={{ width: '15%', fontWeight: 600, fontSize: '0.8125rem', color: '#374151' }}>
                    Total
                  </TableCell>
                  <TableCell sx={{ width: '5%' }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell sx={{ py: 1 }}>
                      <TextField
                        placeholder="Descripción del servicio o producto"
                        size="small"
                        fullWidth
                        value={item.descripcion}
                        onChange={(e) => updateItem(idx, 'descripcion', e.target.value)}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                      />
                    </TableCell>
                    <TableCell sx={{ py: 1 }}>
                      <TextField
                        type="number"
                        size="small"
                        fullWidth
                        placeholder="0.00"
                        value={item.precio === 0 ? '' : item.precio}
                        onChange={(e) => updateItem(idx, 'precio', parseFloat(e.target.value) || 0)}
                        slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                      />
                    </TableCell>
                    <TableCell sx={{ py: 1 }}>
                      <TextField
                        type="number"
                        size="small"
                        fullWidth
                        placeholder="1"
                        value={item.cantidad}
                        onChange={(e) => updateItem(idx, 'cantidad', parseInt(e.target.value) || 1)}
                        slotProps={{ htmlInput: { min: 1, step: 1 } }}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                      />
                    </TableCell>
                    <TableCell sx={{ py: 1, fontWeight: 500, fontSize: '0.875rem', color: '#111827' }}>
                      {formatPesos(item.precio * item.cantidad)}
                    </TableCell>
                    <TableCell sx={{ py: 1 }}>
                      {items.length > 1 && (
                        <IconButton
                          size="small"
                          onClick={() => removeItem(idx)}
                          sx={{ color: '#f87171', '&:hover': { color: '#dc2626' } }}
                        >
                          <Trash2 size={16} />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>

          {/* Totales */}
          <Divider />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 200 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '0.875rem', color: '#4b5563' }}>Subtotal</Typography>
                <Typography sx={{ fontSize: '0.875rem' }}>{formatPesos(subtotal)}</Typography>
              </Box>
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 0.5 }}>
                <Typography sx={{ fontWeight: 700, color: '#111827' }}>Total</Typography>
                <Typography sx={{ fontWeight: 700, color: '#111827', fontSize: '1rem' }}>{formatPesos(total)}</Typography>
              </Box>
            </Box>
          </Box>
        </Paper>

        {/* ── Notas y condiciones ───────────────────────────────────────────── */}
        <Paper sx={cardSx}>
          <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid #f3f4f6' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#111827' }}>
              Notas y condiciones
            </Typography>
          </Box>
          <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Notas internas / mensaje al cliente"
              placeholder="Agradecemos su preferencia. Esta cotización es válida por 30 días."
              multiline
              rows={3}
              size="small"
              fullWidth
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
            <TextField
              label="Términos y condiciones"
              placeholder="Pago a 30 días. Precios sujetos a cambio sin previo aviso."
              multiline
              rows={3}
              size="small"
              fullWidth
              value={terminos}
              onChange={(e) => setTerminos(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>
        </Paper>

      </Box>

      {/* ── Acciones (sticky bottom bar) ─────────────────────────────────────── */}
      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          zIndex: 30,
          mx: -3,
          px: 3,
          mt: 'auto',
          bgcolor: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(8px)',
          borderTop: '1px solid #e5e7eb',
          boxShadow: '0 -4px 12px -2px rgba(0,0,0,0.08)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1.5,
          py: 1.5,
        }}
      >
        <Button
          component={Link}
          href="/dashboard/cotizaciones"
          variant="outlined"
          disabled={saving}
          sx={{ borderRadius: '8px', textTransform: 'none' }}
        >
          Cancelar
        </Button>
        <Button
          variant="contained"
          disableElevation
          onClick={handleGuardar}
          disabled={saving}
          startIcon={saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : undefined}
          sx={{
            borderRadius: '8px',
            textTransform: 'none',
            bgcolor: '#3658e1',
            '&:hover': { bgcolor: '#2a45c4' },
          }}
        >
          {saving ? 'Guardando…' : 'Guardar como borrador'}
        </Button>
      </Box>
    </Box>
  );
}

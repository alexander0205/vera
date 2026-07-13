'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Grid,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Add, ArrowBack, Delete } from '@mui/icons-material';
import Link from 'next/link';
import { toast } from 'sonner';

interface LineItem {
  descripcion: string;
  precio:      number;
  cantidad:    number;
}

interface InitialData {
  id:                   number;
  numero:               string;
  estado:               string;
  razonSocialComprador: string;
  rncComprador:         string;
  emailComprador:       string;
  fechaVencimiento:     string;
  notas:                string;
  terminosCondiciones:  string;
  items:                Array<{ descripcion: string; precio: number; cantidad: number }>;
}

const EMPTY_ITEM: LineItem = { descripcion: '', precio: 0, cantidad: 1 };

const cardSx = {
  bgcolor: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  overflow: 'hidden',
} as const;

export default function EditarCotizacionClient({ initialData }: { initialData: InitialData }) {
  const router = useRouter();

  const [razonSocial, setRazonSocial]    = useState(initialData.razonSocialComprador);
  const [rnc, setRnc]                    = useState(initialData.rncComprador);
  const [email, setEmail]                = useState(initialData.emailComprador);
  const [fechaVencimiento, setFechaVenc] = useState(initialData.fechaVencimiento);
  const [notas, setNotas]                = useState(initialData.notas);
  const [terminos, setTerminos]          = useState(initialData.terminosCondiciones);
  const [items, setItems]                = useState<LineItem[]>(
    initialData.items.length > 0 ? initialData.items : [{ ...EMPTY_ITEM }]
  );

  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

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
  const total    = subtotal;

  function formatPesos(n: number) {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency', currency: 'DOP', minimumFractionDigits: 2,
    }).format(n);
  }

  async function handleGuardar() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cotizaciones/${initialData.id}`, {
        method:  'PUT',
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
      toast.success('Cotización actualizada');
      router.push(`/dashboard/cotizaciones/${initialData.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ bgcolor: '#eef0f7', minHeight: '100%', display: 'flex', flexDirection: 'column', p: 3 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 3 }}>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Link href={`/dashboard/cotizaciones/${initialData.id}`} style={{ textDecoration: 'none' }}>
            <Button
              variant="text"
              size="small"
              startIcon={<ArrowBack sx={{ fontSize: 16 }} />}
              disableElevation
              sx={{ textTransform: 'none', color: '#6b7280', '&:hover': { color: '#374151' } }}
            >
              Volver
            </Button>
          </Link>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>
              Editar cotización{' '}
              <Box component="span" sx={{ fontFamily: 'monospace', color: '#0f766e' }}>
                {initialData.numero}
              </Box>
            </Typography>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>
              Estado actual:{' '}
              <Box component="span" sx={{ textTransform: 'capitalize' }}>
                {initialData.estado}
              </Box>
            </Typography>
          </Box>
        </Box>

        {error && (
          <Alert severity="error">{error}</Alert>
        )}

        {/* Datos del cliente */}
        <Paper elevation={0} sx={cardSx}>
          <Box sx={{ px: 3, pt: 2.5, pb: 1.5, borderBottom: '1px solid #f3f4f6' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#111827' }}>
              Datos del cliente
            </Typography>
          </Box>
          <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Nombre / Razón Social"
                  placeholder="Empresa XYZ SRL"
                  size="small"
                  fullWidth
                  value={razonSocial}
                  onChange={(e) => setRazonSocial(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="RNC / Cédula / Pasaporte"
                  placeholder="130123456 o PA123456"
                  size="small"
                  fullWidth
                  value={rnc}
                  onChange={(e) => setRnc(e.target.value)}
                />
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Email"
                  type="email"
                  placeholder="facturacion@empresa.com"
                  size="small"
                  fullWidth
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Fecha de vencimiento"
                  type="date"
                  size="small"
                  fullWidth
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVenc(e.target.value)}
                  slotProps={{ htmlInput: { max: undefined }, inputLabel: { shrink: true } }}
                />
              </Grid>
            </Grid>
          </Box>
        </Paper>

        {/* Líneas */}
        <Paper elevation={0} sx={cardSx}>
          <Box sx={{ px: 3, pt: 2.5, pb: 1.5, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#111827' }}>
              Ítems / Servicios
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Add />}
              onClick={addItem}
              disableElevation
              sx={{
                textTransform: 'none',
                borderColor: '#d1d5db',
                color: '#374151',
                '&:hover': { borderColor: '#9ca3af', bgcolor: '#f9fafb' },
              }}
            >
              Agregar línea
            </Button>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f9fafb' }}>
                  <TableCell sx={{ width: '45%', fontWeight: 600, color: '#374151', fontSize: 13 }}>Descripción</TableCell>
                  <TableCell sx={{ width: '20%', fontWeight: 600, color: '#374151', fontSize: 13 }}>Precio (RD$)</TableCell>
                  <TableCell sx={{ width: '15%', fontWeight: 600, color: '#374151', fontSize: 13 }}>Cantidad</TableCell>
                  <TableCell sx={{ width: '15%', fontWeight: 600, color: '#374151', fontSize: 13 }}>Total</TableCell>
                  <TableCell sx={{ width: '5%' }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <TextField
                        placeholder="Descripción del servicio o producto"
                        size="small"
                        fullWidth
                        value={item.descripcion}
                        onChange={(e) => updateItem(idx, 'descripcion', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        size="small"
                        fullWidth
                        placeholder="0.00"
                        value={item.precio === 0 ? '' : item.precio}
                        onChange={(e) => updateItem(idx, 'precio', parseFloat(e.target.value) || 0)}
                        slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        size="small"
                        fullWidth
                        placeholder="1"
                        value={item.cantidad}
                        onChange={(e) => updateItem(idx, 'cantidad', parseInt(e.target.value) || 1)}
                        slotProps={{ htmlInput: { min: 1, step: 1 } }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: '#111827' }}>
                        {formatPesos(item.precio * item.cantidad)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {items.length > 1 && (
                        <IconButton
                          size="small"
                          onClick={() => removeItem(idx)}
                          sx={{ color: '#f87171', '&:hover': { color: '#dc2626' } }}
                        >
                          <Delete sx={{ fontSize: 18 }} />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Totales */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 2, borderTop: '1px solid #f3f4f6' }}>
            <Box sx={{ minWidth: 200, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ color: '#6b7280' }}>Subtotal</Typography>
                <Typography variant="body2" sx={{ color: '#6b7280' }}>{formatPesos(subtotal)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e5e7eb', pt: 0.75, mt: 0.25 }}>
                <Typography variant="body1" sx={{ fontWeight: 700, color: '#111827' }}>Total</Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, color: '#111827' }}>{formatPesos(total)}</Typography>
              </Box>
            </Box>
          </Box>
        </Paper>

        {/* Notas y Términos */}
        <Paper elevation={0} sx={cardSx}>
          <Box sx={{ px: 3, pt: 2.5, pb: 1.5, borderBottom: '1px solid #f3f4f6' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#111827' }}>
              Notas y condiciones
            </Typography>
          </Box>
          <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <TextField
              label="Notas / mensaje al cliente"
              placeholder="Agradecemos su preferencia."
              multiline
              rows={3}
              size="small"
              fullWidth
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
            <TextField
              label="Términos y condiciones"
              placeholder="Pago a 30 días."
              multiline
              rows={3}
              size="small"
              fullWidth
              value={terminos}
              onChange={(e) => setTerminos(e.target.value)}
            />
          </Box>
        </Paper>

      </Box>

      {/* Acciones */}
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
        <Link href={`/dashboard/cotizaciones/${initialData.id}`} style={{ textDecoration: 'none' }}>
          <Button
            variant="outlined"
            disabled={saving}
            disableElevation
            sx={{
              textTransform: 'none',
              borderColor: '#d1d5db',
              color: '#374151',
              '&:hover': { borderColor: '#9ca3af', bgcolor: '#f9fafb' },
            }}
          >
            Cancelar
          </Button>
        </Link>
        <Button
          variant="contained"
          onClick={handleGuardar}
          disabled={saving}
          disableElevation
          startIcon={saving ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : undefined}
          sx={{
            textTransform: 'none',
            bgcolor: '#0d9488',
            '&:hover': { bgcolor: '#0f766e' },
            '&.Mui-disabled': { bgcolor: '#0d9488', opacity: 0.6, color: '#fff' },
          }}
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </Box>
    </Box>
  );
}

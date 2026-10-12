'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Switch,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import { useTiposDisponibles } from '@/lib/hooks/useTiposDisponibles';

interface Ref { id: number; nombre: string; }
interface Terminal {
  id: number;
  nombre: string;
  almacenId: number;
  almacenNombre: string | null;
  impresoraId: number | null;
  listaPreciosId: number | null;
  listaNombre: string | null;
  tipoEcf: string;
  activo: boolean;
  mesas: boolean;
}

const EMPTY = { nombre: '', almacenId: 0, impresoraId: 0, listaPreciosId: 0, tipoEcf: 'sin-ncf', mesas: false };

const TEAL = '#3658e1';
const TEAL_HOVER = '#2a45c4';

export default function TerminalesClient({
  terminalesIniciales, almacenes, impresoras, listas,
}: {
  terminalesIniciales: Terminal[];
  almacenes: Ref[];
  impresoras: Ref[];
  listas: Ref[];
}) {
  const router = useRouter();
  const { enProduccion } = useTiposDisponibles();
  const [terminales, setTerminales] = useState<Terminal[]>(terminalesIniciales);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY, almacenId: almacenes[0]?.id ?? 0 });
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  function nueva() {
    setEditId(null);
    setForm({ ...EMPTY, almacenId: almacenes[0]?.id ?? 0 });
    setAbierto(true);
  }
  function editar(t: Terminal) {
    setEditId(t.id);
    setForm({
      nombre: t.nombre,
      almacenId: t.almacenId,
      impresoraId: t.impresoraId ?? 0,
      listaPreciosId: t.listaPreciosId ?? 0,
      tipoEcf: t.tipoEcf,
      mesas: t.mesas,
    });
    setAbierto(true);
  }

  async function guardar() {
    if (!form.nombre.trim()) { toast.error('Nombre requerido'); return; }
    if (!form.almacenId)     { toast.error('Almacén requerido'); return; }
    setGuardando(true);
    const body = {
      nombre: form.nombre.trim(),
      almacenId: form.almacenId,
      impresoraId: form.impresoraId || null,
      listaPreciosId: form.listaPreciosId || null,
      tipoEcf: form.tipoEcf,
      mesas: form.mesas,
    };
    const url = editId ? `/api/pos/terminales/${editId}` : '/api/pos/terminales';
    const res = await fetch(url, {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setGuardando(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error ?? 'No se pudo guardar');
      return;
    }
    toast.success(editId ? 'Terminal actualizada' : 'Terminal creada');
    setAbierto(false);
    router.refresh();
    const data = await res.json();
    setTerminales((prev) => {
      const enriched: Terminal = {
        ...data.terminal,
        almacenNombre: almacenes.find((a) => a.id === data.terminal.almacenId)?.nombre ?? null,
        listaNombre: listas.find((l) => l.id === data.terminal.listaPreciosId)?.nombre ?? null,
      };
      return editId ? prev.map((t) => (t.id === editId ? enriched : t)) : [...prev, enriched];
    });
  }

  async function desactivar(id: number) {
    if (!confirm('¿Desactivar esta terminal?')) return;
    const res = await fetch(`/api/pos/terminales/${id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('No se pudo desactivar'); return; }
    setTerminales((prev) => prev.map((t) => (t.id === id ? { ...t, activo: false } : t)));
    toast.success('Terminal desactivada');
  }

  return (
    <Box sx={{ mx: 'auto', maxWidth: 896, p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography component="h1" sx={{ fontSize: '1.25rem', fontWeight: 500, color: '#111827' }}>
            Terminales de punto de venta
          </Typography>
          <Typography variant="body2" sx={{ color: '#6b7280' }}>
            Cada caja física con su almacén, impresora y lista de precios fijos.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            component={Link}
            href="/pos"
            nativeButton={false}
            variant="outlined"
            sx={{ borderRadius: '8px', textTransform: 'none', borderColor: '#d1d5db', color: '#374151', '&:hover': { borderColor: '#9ca3af', bgcolor: '#f9fafb' } }}
          >
            Abrir POS
          </Button>
          <Button
            variant="contained"
            disableElevation
            onClick={nueva}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 500, bgcolor: TEAL, '&:hover': { bgcolor: TEAL_HOVER } }}
          >
            Nueva terminal
          </Button>
        </Box>
      </Box>

      {almacenes.length === 0 && (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: '8px' }}>
          Necesitas al menos un almacén. Créalo en Inventario → Almacenes.
        </Alert>
      )}

      <Box sx={{ overflow: 'hidden', borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fff' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { bgcolor: '#f9fafb', color: '#6b7280', fontSize: '0.75rem', fontWeight: 400, borderBottom: '1px solid #f3f4f6' } }}>
              <TableCell>Nombre</TableCell>
              <TableCell>Almacén</TableCell>
              <TableCell>Lista</TableCell>
              <TableCell>Comprobante</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {terminales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4, color: '#9ca3af', borderBottom: 'none' }}>
                  Sin terminales. Crea la primera.
                </TableCell>
              </TableRow>
            ) : terminales.map((t) => (
              <TableRow key={t.id} sx={{ '& td': { borderTop: '1px solid #f3f4f6', borderBottom: 'none' } }}>
                <TableCell sx={{ fontWeight: 500, color: '#111827' }}>{t.nombre}</TableCell>
                <TableCell sx={{ color: '#4b5563' }}>{t.almacenNombre ?? '—'}</TableCell>
                <TableCell sx={{ color: '#4b5563' }}>{t.listaNombre ?? 'Base'}</TableCell>
                <TableCell sx={{ color: '#4b5563' }}>{t.tipoEcf}</TableCell>
                <TableCell>
                  <Chip
                    label={t.activo ? 'Activa' : 'Inactiva'}
                    size="small"
                    sx={{
                      height: 'auto',
                      borderRadius: '999px',
                      fontSize: '0.75rem',
                      py: 0.25,
                      bgcolor: t.activo ? '#f0fdf4' : '#f3f4f6',
                      color: t.activo ? '#15803d' : '#6b7280',
                      '& .MuiChip-label': { px: 1 },
                    }}
                  />
                </TableCell>
                <TableCell align="right">
                  <Button
                    onClick={() => editar(t)}
                    variant="text"
                    size="small"
                    sx={{ textTransform: 'none', color: TEAL, minWidth: 0, p: 0, '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}
                  >
                    Editar
                  </Button>
                  {t.activo && (
                    <Button
                      onClick={() => desactivar(t.id)}
                      variant="text"
                      size="small"
                      sx={{ textTransform: 'none', color: '#dc2626', minWidth: 0, p: 0, ml: 1.5, '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}
                    >
                      Desactivar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      <Dialog
        open={abierto}
        onClose={() => setAbierto(false)}
        slotProps={{ paper: { sx: { borderRadius: '12px', width: '100%', maxWidth: 448 } } as object }}
      >
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 500, pb: 1 }}>
          {editId ? 'Editar terminal' : 'Nueva terminal'}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pb: 1 }}>
          <TextField
            label="Nombre"
            size="small"
            fullWidth
            placeholder="Caja Cafetería 1"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            sx={{ mt: 1, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />

          <TextField
            label="Almacén (fijo)"
            select
            size="small"
            fullWidth
            value={form.almacenId}
            onChange={(e) => setForm({ ...form, almacenId: Number(e.target.value) })}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          >
            {almacenes.map((a) => <MenuItem key={a.id} value={a.id}>{a.nombre}</MenuItem>)}
          </TextField>

          <TextField
            label="Impresora (opcional)"
            select
            size="small"
            fullWidth
            value={form.impresoraId}
            onChange={(e) => setForm({ ...form, impresoraId: Number(e.target.value) })}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          >
            <MenuItem value={0}>Default del equipo</MenuItem>
            {impresoras.map((i) => <MenuItem key={i.id} value={i.id}>{i.nombre}</MenuItem>)}
          </TextField>

          <TextField
            label="Comprobante por defecto"
            select
            size="small"
            fullWidth
            value={form.tipoEcf}
            onChange={(e) => setForm({ ...form, tipoEcf: e.target.value })}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          >
            <MenuItem value="sin-ncf">Ticket (sin NCF)</MenuItem>
            {/* Sin habilitación en DGII no hay comprobante fiscal que asignar
                por defecto: cada venta del terminal lo heredaría. */}
            {enProduccion && <MenuItem value="32">Factura de consumo (e32)</MenuItem>}
            {enProduccion && <MenuItem value="31">Crédito fiscal (e31)</MenuItem>}
          </TextField>

          <Box
            component="label"
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              p: 1.5,
              cursor: 'pointer',
            }}
          >
            <Switch
              checked={form.mesas}
              onChange={(e) => setForm({ ...form, mesas: e.target.checked })}
              size="small"
              sx={{
                mt: 0.25,
                '& .MuiSwitch-switchBase.Mui-checked': { color: TEAL },
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: TEAL },
              }}
            />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500, color: '#1f2937' }}>
                Modo restaurante (mesas)
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mt: 0.25 }}>
                La terminal opera con salón: mesas, meseros con PIN y comandas abiertas.
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => setAbierto(false)}
            sx={{ borderRadius: '8px', textTransform: 'none', borderColor: '#d1d5db', color: '#374151', '&:hover': { borderColor: '#9ca3af', bgcolor: '#f9fafb' } }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            disableElevation
            onClick={guardar}
            disabled={guardando}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 500, bgcolor: TEAL, '&:hover': { bgcolor: TEAL_HOVER } }}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

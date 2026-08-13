'use client';

// Lista de formularios — adaptada de crm-escolar/src/app/(dashboard)/formularios/page.tsx.
//
// A diferencia de esa pantalla, aquí NO hay: botón de "Plantilla inscripción"
// (integración con el bot de WhatsApp del CRM, no existe en Zero), estadística
// de conversión ni indicador "los leads entran a Admisiones" (sin leads ni
// Kanban no hay nada que mostrar ahí), ni acceso a "Respuestas" — la pantalla
// de respuestas es trabajo futuro (ver tarea: solo se construye el
// constructor). Las acciones que quedan son las que ya funcionan de punta a
// punta: crear, editar, duplicar, activar/desactivar, borrar.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import {
  Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, ListItemIcon, ListItemText, Menu,
  MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DescriptionIcon from '@mui/icons-material/Description';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { toast } from 'sonner';
import { EmptyState } from '@/components/administracion-escolar/formularios/EmptyState';
import type { AdminEscolarFormulario } from '@/lib/db/schema';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());
const API = '/api/administracion-escolar/formularios';

function formatoRelativo(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'hace 1 mes' : `hace ${meses} meses`;
}

export default function FormulariosClient() {
  const router = useRouter();
  const { data, isLoading } = useSWR<{ formularios: AdminEscolarFormulario[] }>(API, fetcher);
  const formularios = data?.formularios || [];

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [creating, setCreating] = useState(false);
  const [menuFor, setMenuFor] = useState<{ el: HTMLElement; f: AdminEscolarFormulario } | null>(null);

  const handleCreate = async () => {
    if (!nombre.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), descripcion: descripcion.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await mutate(API);
      setCreateOpen(false);
      setNombre('');
      setDescripcion('');
      router.push(`/escolar/documentos/formularios/${data.formulario.id}/editor`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'No se pudo eliminar');
      await mutate(API);
      toast.success('Formulario eliminado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar');
    }
    setDeleteId(null);
  };

  const handleDuplicate = async (id: number) => {
    try {
      const res = await fetch(`${API}/${id}/duplicar`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await mutate(API);
      toast.success('Formulario duplicado');
      router.push(`/escolar/documentos/formularios/${data.formulario.id}/editor`);
    } catch {
      toast.error('Error al duplicar');
    }
  };

  const handleToggleActive = async (f: AdminEscolarFormulario) => {
    try {
      const res = await fetch(`${API}/${f.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !f.activo }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await mutate(API);
      toast.success(f.activo ? 'Formulario desactivado' : 'Formulario activado');
    } catch {
      toast.error('Error al actualizar');
    }
  };

  const closeMenu = () => setMenuFor(null);

  return (
    <Box>
      {/* Cabecera */}
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
        <Typography variant="body2" color="text.secondary">
          Fichas de inscripción, permisos y encuestas que llenan las familias.
        </Typography>
        <Button variant="contained" onClick={() => setCreateOpen(true)} startIcon={<AddIcon />}>
          Nuevo formulario
        </Button>
      </Stack>

      {isLoading && (
        <Stack sx={{ alignItems: 'center', py: 10 }}>
          <CircularProgress />
        </Stack>
      )}

      {!isLoading && formularios.length === 0 && (
        <Card>
          <EmptyState
            icon={<DescriptionIcon sx={{ fontSize: 40 }} />}
            titulo="Sin formularios"
            descripcion="Crea el primero para empezar a recoger fichas de inscripción o permisos de las familias."
            accion={
              <Button variant="contained" onClick={() => setCreateOpen(true)} startIcon={<AddIcon />}>
                Crear formulario
              </Button>
            }
          />
        </Card>
      )}

      {!isLoading && formularios.length > 0 && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {formularios.map((f) => (
            <Card key={f.id} sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Box sx={{ height: 4, width: '100%', bgcolor: f.activo ? 'primary.main' : 'divider' }} />
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1 }}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                  <Box sx={{
                    width: 40, height: 40, borderRadius: 2, flexShrink: 0,
                    display: 'grid', placeItems: 'center',
                    bgcolor: 'action.hover', color: f.activo ? 'primary.main' : 'text.disabled',
                  }}>
                    <DescriptionIcon fontSize="small" />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }} noWrap>{f.nombre}</Typography>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mt: 0.5 }}>
                      <Chip
                        size="small"
                        variant={f.activo ? 'filled' : 'outlined'}
                        color={f.activo ? 'success' : 'default'}
                        label={f.activo ? 'Activo' : 'Inactivo'}
                      />
                      <Typography variant="caption" noWrap>{formatoRelativo(String(f.updatedAt))}</Typography>
                    </Stack>
                  </Box>
                  <IconButton size="small" onClick={(e) => setMenuFor({ el: e.currentTarget, f })}>
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Stack>

                <Box sx={{
                  display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1,
                  borderRadius: 2, bgcolor: 'action.hover', p: 1.5,
                }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1 }}>{f.vistas}</Typography>
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>Vistas</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center', borderLeft: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1 }}>{f.envios}</Typography>
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>Envíos</Typography>
                  </Box>
                </Box>

                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  startIcon={<EditIcon />}
                  onClick={() => router.push(`/escolar/documentos/formularios/${f.id}/editor`)}
                  sx={{ mt: 'auto' }}
                >
                  Editar
                </Button>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Menú de la tarjeta */}
      <Menu
        open={!!menuFor}
        anchorEl={menuFor?.el}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 200 } } }}
      >
        <MenuItem onClick={() => { if (menuFor) handleDuplicate(menuFor.f.id); closeMenu(); }}>
          <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Duplicar" />
        </MenuItem>
        <MenuItem onClick={() => { if (menuFor) handleToggleActive(menuFor.f); closeMenu(); }}>
          <ListItemIcon><PowerSettingsNewIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary={menuFor?.f.activo ? 'Desactivar' : 'Activar'} />
        </MenuItem>
        <MenuItem
          onClick={() => { if (menuFor) setDeleteId(menuFor.f.id); closeMenu(); }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon><DeleteOutlinedIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText primary="Eliminar" />
        </MenuItem>
      </Menu>

      {/* Crear */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nuevo formulario</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Nombre del formulario"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Ficha de inscripción 2026-2027"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Descripción (opcional)"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Breve descripción del formulario..."
              multiline
              rows={2}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!nombre.trim() || creating}
            startIcon={creating ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Crear y editar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Borrar */}
      <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)} fullWidth maxWidth="sm">
        <DialogTitle>¿Eliminar formulario?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Se eliminan el formulario y todas sus respuestas. Esta acción no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={() => setDeleteId(null)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={() => deleteId !== null && handleDelete(deleteId)}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

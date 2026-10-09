'use client';

// Adaptado de crm-escolar/src/app/(dashboard)/formularios/[id]/editor/page.tsx:
// mismo patrón (fetch por id, loading/error, monta el builder), pero por id
// numérico contra /api/administracion-escolar/formularios/[id] en vez del
// endpoint de Mongo. Sigue además el patrón de esta pantalla de Zero para
// páginas [id] (ver app/escolar/estudiantes/[id]/page.tsx +
// _perfil-client.tsx): la página server solo parsea el id, el fetch vive aquí.
import { useEffect, useState } from 'react';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import FormularioBuilder from '@/components/administracion-escolar/formularios/FormularioBuilder';
import type { AdminEscolarFormulario } from '@/lib/db/schema';

export default function EditorClient({ id }: { id: number }) {
  const [formulario, setFormulario] = useState<AdminEscolarFormulario | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/administracion-escolar/formularios/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setFormulario(data.formulario);
      })
      .catch(() => setError('Error al cargar el formulario'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !formulario) {
    return (
      <Stack spacing={1.5} sx={{ height: '100%', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
        <ErrorOutlineOutlinedIcon sx={{ fontSize: 40, color: 'error.main' }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{error || 'Formulario no encontrado'}</Typography>
      </Stack>
    );
  }

  return <FormularioBuilder formulario={formulario} />;
}

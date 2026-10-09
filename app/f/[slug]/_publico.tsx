'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

/**
 * La primera pantalla del enlace público: qué es esto y un botón para empezar.
 *
 * «Comenzar» no es un adorno. Es lo que abre el borrador: a partir de ahí la
 * familia tiene una dirección propia y todo lo que escribe se guarda solo. Sin
 * ese paso habría que crearle una ficha a cada robot y a cada curioso que abre
 * el enlace, y la bandeja del colegio se llenaría de fichas vacías.
 */

/** Dónde queda el enlace de continuación en ESTE teléfono. */
export function claveLocal(slug: string) {
  return `zero:formulario:${slug}`;
}

export function Marco({ fondo, children }: { fondo?: string; children: React.ReactNode }) {
  return (
    <main style={{
      minHeight: '100dvh',
      background: fondo || '#f1f5f9',
      padding: '2.5rem 1rem',
    }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>{children}</div>
    </main>
  );
}

export function PantallaInicio({ slug, nombre, descripcion, color, pasos }: {
  slug: string;
  nombre: string;
  descripcion?: string | null;
  color: string;
  pasos: number;
}) {
  const router = useRouter();
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState('');
  const [tokenGuardado, setTokenGuardado] = useState<string | null>(null);

  // Si ya empezó en este mismo teléfono, no hace falta que haya guardado el
  // enlace en ningún sitio: se le ofrece seguir.
  useEffect(() => {
    try { setTokenGuardado(localStorage.getItem(claveLocal(slug))); } catch { /* modo privado */ }
  }, [slug]);

  const comenzar = async () => {
    setAbriendo(true);
    setError('');
    try {
      const res = await fetch(`/api/formularios-publicos/${slug}/borrador`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo abrir el formulario');
      try { localStorage.setItem(claveLocal(slug), data.token); } catch { /* modo privado */ }
      router.push(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el formulario');
      setAbriendo(false);
    }
  };

  return (
    <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: { xs: 3, sm: 5 }, boxShadow: 1 }}>
      <Typography variant="h5" sx={{ fontWeight: 600 }}>{nombre}</Typography>

      {descripcion && (
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1.5, whiteSpace: 'pre-line' }}>
          {descripcion}
        </Typography>
      )}

      <Alert severity="info" sx={{ mt: 3 }}>
        {pasos > 1
          ? `Son ${pasos} pasos. No hace falta terminarlo de una sola vez: se guarda solo mientras lo llena, y puede volver por el mismo enlace.`
          : 'Se guarda solo mientras lo llena, así que puede volver por el mismo enlace si tiene que dejarlo a medias.'}
      </Alert>

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 3 }}>
        <Button
          variant="contained"
          onClick={comenzar}
          disabled={abriendo}
          endIcon={abriendo ? <CircularProgress size={16} color="inherit" /> : <ArrowForwardIcon />}
          sx={{ height: 48, px: 3, fontSize: '1rem', bgcolor: color, '&:hover': { bgcolor: color } }}
        >
          {abriendo ? 'Abriendo…' : 'Comenzar'}
        </Button>

        {tokenGuardado && (
          <Button
            variant="outlined"
            color="inherit"
            onClick={() => router.push(`/f/${slug}/r/${tokenGuardado}`)}
            sx={{ height: 48, px: 3 }}
          >
            Seguir donde lo dejé
          </Button>
        )}
      </Stack>
    </Box>
  );
}

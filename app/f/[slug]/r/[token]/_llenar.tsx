'use client';

import { useEffect, useState } from 'react';
import { Alert, Box, Button, Snackbar } from '@mui/material';
import LinkIcon from '@mui/icons-material/Link';
import FormularioRenderer from '@/components/administracion-escolar/formularios/FormularioRenderer';
import { claveLocal } from '../../_publico';
import type { FormularioPublicoDTO } from '@/lib/administracion-escolar/formularios-publicos';

/**
 * La ficha en curso.
 *
 * El renderer es EL MISMO que usa la vista previa del constructor. Con dos
 * implementaciones, lo que el colegio ve al diseñar y lo que la familia rellena
 * se separan al primer cambio, y nadie se entera hasta que un padre llama.
 */
export function Llenando({ formulario, slug, token, datos, pagina }: {
  formulario: FormularioPublicoDTO;
  slug: string;
  token: string;
  datos: Record<string, unknown>;
  pagina: number;
}) {
  const [copiado, setCopiado] = useState(false);

  // Que el enlace quede en ESTE teléfono: así, si cierra todo y vuelve a abrir
  // el enlace original del colegio, puede seguir sin haber copiado nada.
  useEffect(() => {
    try { localStorage.setItem(claveLocal(slug), token); } catch { /* modo privado */ }
  }, [slug, token]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado(true);
    } catch { /* sin permiso de portapapeles: queda la barra de direcciones */ }
  };

  return (
    <>
      <Alert
        severity="info"
        icon={<LinkIcon fontSize="small" />}
        sx={{ mb: 2 }}
        action={<Button size="small" color="inherit" onClick={copiar}>Copiar enlace</Button>}
      >
        Puede dejarlo a medias: se guarda solo. Guarde este enlace para seguir desde otro teléfono.
      </Alert>

      <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: { xs: 2.5, sm: 4 }, boxShadow: 1 }}>
        <FormularioRenderer
          formulario={formulario}
          slug={slug}
          token={token}
          initialDatos={datos}
          initialPagina={pagina}
          onSuccess={() => {
            // Ya no es un borrador: que «Seguir donde lo dejé» no lo ofrezca.
            try { localStorage.removeItem(claveLocal(slug)); } catch { /* modo privado */ }
          }}
        />
      </Box>

      <Snackbar
        open={copiado}
        autoHideDuration={2500}
        onClose={() => setCopiado(false)}
        message="Enlace copiado"
      />
    </>
  );
}

'use client';

/**
 * Cómo se ve el mensaje en el teléfono del padre.
 *
 * Con los valores de ejemplo puestos, no con los `{{1}}`: el objetivo es leer la
 * frase como la va a leer quien la recibe. Una plantilla se aprueba o se
 * rechaza por cómo suena, y `{{1}}` no suena de ninguna manera.
 */

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { CheckCheck, ExternalLink } from 'lucide-react';

export interface VariableVista { pos: number; nombre: string; tipo: string; ejemplo: string }
export interface BotonVista { texto: string; url: string; ejemplo: string }

/** Sustituye {{n}} por su ejemplo. Sin ejemplo se deja el hueco a la vista. */
export function renderizar(cuerpo: string, variables: VariableVista[]): string {
  return cuerpo.replace(/\{\{(\d+)\}\}/g, (original, n) => {
    const v = variables.find((x) => x.pos === Number(n));
    return v?.ejemplo?.trim() ? v.ejemplo : original;
  });
}

export function VistaPrevia({ cuerpo, encabezado, pie, variables, boton, nota }: {
  cuerpo: string;
  encabezado?: string | null;
  pie?: string | null;
  variables: VariableVista[];
  boton?: BotonVista | null;
  nota?: string;
}) {
  const texto = renderizar(cuerpo, variables);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* El fondo imita el del chat para que el contraste del globo se lea
          igual que en el teléfono, no sobre blanco. */}
      <Box sx={{
        bgcolor: '#e5ded8', borderRadius: '12px', p: 2,
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.035) 1px, transparent 0)',
        backgroundSize: '14px 14px',
        minHeight: 120, display: 'flex', alignItems: 'flex-start',
      }}>
        <Box sx={{
          bgcolor: '#fff', borderRadius: '8px', borderTopLeftRadius: '2px',
          px: 1.5, py: 1, maxWidth: '92%', boxShadow: '0 1px 1px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column', gap: 0.75,
        }}>
          {encabezado && (
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, color: '#111827' }}>
              {renderizar(encabezado, variables)}
            </Typography>
          )}
          <Typography sx={{ fontSize: '0.8125rem', color: '#1f2937', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {texto || <Box component="span" sx={{ color: '#9ca3af' }}>Escribe el mensaje…</Box>}
          </Typography>
          {pie && (
            <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af' }}>
              {renderizar(pie, variables)}
            </Typography>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, alignSelf: 'flex-end', color: '#8696a0' }}>
            <Typography sx={{ fontSize: '0.625rem' }}>11:30</Typography>
            <CheckCheck size={12} color="#53bdeb" />
          </Box>

          {/* El botón, como lo dibuja WhatsApp: dentro del mismo globo, debajo
              de una línea que lo separa del texto, centrado y en azul. No es
              un botón aparte flotando: va pegado al mensaje. */}
          {boton?.texto?.trim() && (
            <Box sx={{
              mt: 0.5, mx: -1.5, mb: -1,
              borderTop: '1px solid #e9edef',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
              py: 1, color: '#027eb5', cursor: 'default',
            }}>
              <ExternalLink size={13} />
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: 'inherit' }}>
                {boton.texto}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af', lineHeight: 1.5 }}>
        {nota ?? 'Con valores de ejemplo. En el envío real se sustituyen por los datos de cada factura.'}
      </Typography>
    </Box>
  );
}

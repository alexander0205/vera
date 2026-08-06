'use client';

/**
 * Pantalla de carga de marca — logo de Zero + una cita al azar.
 *
 * Se usa en los momentos en que el sistema se queda "mudo" varios segundos y
 * el usuario no sabe si su clic hizo algo: cambiar de empresa (recarga la
 * sesión y todos los datos del dashboard) y entrar al sistema.
 *
 * La cita se elige en un efecto, nunca durante el render: `Math.random()` en
 * el render del server produciría un HTML distinto al del cliente y React
 * tiraría error de hidratación. Mientras no haya cita se reserva su alto, así
 * el bloque no salta cuando aparece.
 */

import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Fade from '@mui/material/Fade';
import Portal from '@mui/material/Portal';
import { IsotipoZero } from '@/components/marca-zero';
import { citaAleatoria, type CitaCarga } from '@/lib/config/frases-carga';

/**
 * Antirrebote del loader. Una carga que dura 200 ms no necesita pantalla
 * completa: taparlo todo y destaparlo enseguida se lee como un parpadeo raro,
 * no como "está cargando". Por eso:
 *
 *  - `retardoMs`: no se muestra nada hasta que la espera pase de este umbral.
 *    Si la operación termina antes, el usuario nunca ve el loader.
 *  - `duracionMinimaMs`: una vez mostrado se queda al menos este rato, para
 *    que no aparezca y desaparezca de golpe ni se corte la cita a media
 *    lectura.
 */
function useLoaderAntirrebote(open: boolean, retardoMs: number, duracionMinimaMs: number) {
  const [visible, setVisible] = useState(false);
  const mostradoEn = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        mostradoEn.current = Date.now();
        setVisible(true);
      }, retardoMs);
      return () => clearTimeout(t);
    }

    // Se cerró antes de alcanzar el umbral: nunca llegó a verse, nada que hacer.
    if (!visible) return;

    const transcurrido = Date.now() - (mostradoEn.current ?? 0);
    const restante = Math.max(0, duracionMinimaMs - transcurrido);
    const t = setTimeout(() => {
      mostradoEn.current = null;
      setVisible(false);
    }, restante);
    return () => clearTimeout(t);
  }, [open, visible, retardoMs, duracionMinimaMs]);

  return visible;
}

export function ZeroLoader({
  open,
  subtitulo,
  retardoMs = 400,
  duracionMinimaMs = 900,
}: {
  open: boolean;
  /** Texto chico al pie, p. ej. el nombre de la empresa que se abre. */
  subtitulo?: string;
  /** Espera antes de mostrar. Cargas más rápidas que esto no muestran nada. */
  retardoMs?: number;
  /** Una vez visible, se queda al menos este tiempo. */
  duracionMinimaMs?: number;
}) {
  const visible = useLoaderAntirrebote(open, retardoMs, duracionMinimaMs);
  const [cita, setCita] = useState<CitaCarga | null>(null);

  // Cita nueva cada vez que el loader se hace visible.
  useEffect(() => {
    if (visible) setCita(citaAleatoria());
  }, [visible]);

  return (
    // Portal a <body> a propósito: el loader se declara dentro del header, y
    // el AppBar de MUI abre su propio contexto de apilamiento. Sin portal, el
    // z-index de acá solo compite DENTRO del header y el drawer del nav (que
    // es hermano del AppBar, con z-index mayor) queda por encima — el overlay
    // tapaba el contenido pero no la navegación. Colgando de <body> el loader
    // es realmente general y cubre todo.
    <Portal>
      <Fade in={visible} unmountOnExit timeout={{ enter: 200, exit: 300 }}>
      <Box
        // aria-live para que un lector de pantalla anuncie que está cargando.
        role="status"
        aria-live="polite"
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: theme => theme.zIndex.tooltip + 10,
          bgcolor: 'background.default',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          px: 3,
          textAlign: 'center',
        }}
      >
        {/* Logo */}
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1.5,
            animation: 'zeroLoaderPulse 1.6s ease-in-out infinite',
            '@keyframes zeroLoaderPulse': {
              '0%, 100%': { opacity: 1, transform: 'scale(1)' },
              '50%':      { opacity: 0.72, transform: 'scale(0.97)' },
            },
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          <IsotipoZero lado={48} />
          <Typography variant="h4" sx={{ fontWeight: 700, fontFamily: 'var(--font-display)', color: 'text.primary', letterSpacing: '-0.02em' }}>
            Zero
          </Typography>
        </Box>

        {/* Cita + autor. Alto reservado para que nada salte al aparecer. */}
        <Box sx={{ minHeight: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Fade in={!!cita} timeout={420}>
            <Box component="figure" sx={{ m: 0, maxWidth: 460 }}>
              <Typography
                component="blockquote"
                sx={{
                  m: 0,
                  fontSize: { xs: '0.9375rem', sm: '1.0625rem' },
                  lineHeight: 1.5,
                  fontStyle: 'italic',
                  color: 'text.primary',
                }}
              >
                {cita ? `«${cita.texto}»` : ' '}
              </Typography>
              <Typography
                component="figcaption"
                sx={{
                  mt: 1.25,
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'text.secondary',
                }}
              >
                {cita ? `— ${cita.autor}` : ' '}
              </Typography>
            </Box>
          </Fade>
        </Box>

        {/* Barra indeterminada — señal de que algo sigue pasando */}
        <Box
          sx={{
            width: 148,
            height: 3,
            borderRadius: 999,
            bgcolor: 'action.hover',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              width: '40%',
              height: '100%',
              borderRadius: 999,
              bgcolor: 'primary.main',
              animation: 'zeroLoaderBar 1.15s ease-in-out infinite',
              '@keyframes zeroLoaderBar': {
                '0%':   { transform: 'translateX(-100%)' },
                '100%': { transform: 'translateX(350%)' },
              },
              '@media (prefers-reduced-motion: reduce)': { animation: 'none', width: '100%' },
            }}
          />
        </Box>

        {subtitulo && (
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.disabled', mt: -1 }}>
            {subtitulo}
          </Typography>
        )}
      </Box>
      </Fade>
    </Portal>
  );
}

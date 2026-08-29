'use client';

/**
 * Disparador del soporte, en la barra superior junto al avatar.
 *
 * Antes era un botón flotante abajo a la derecha, y ahí chocaba con las
 * acciones de la página: en el formulario de factura se montaba encima de
 * «Guardar factura». Arriba no tapa nada y queda donde la gente ya busca la
 * ayuda.
 */

import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Badge from '@mui/material/Badge';
import { HelpCircle, Phone } from 'lucide-react';
import { useSoporte } from './soporte-context';
import { useLlamadaGlobal } from '@/lib/webrtc/LlamadaGlobalProvider';

export function BotonSoporte() {
  const soporte = useSoporte();
  const { call, estado } = useLlamadaGlobal();

  // Fuera del provider (pantallas sueltas) o en una ruta donde el soporte no
  // aplica: sin botón, en vez de un botón que no hace nada.
  if (!soporte?.disponible) return null;

  const entrante = call?.status === 'pendiente';
  const enLlamada = estado === 'activa';
  const enCurso = entrante || enLlamada;

  const titulo = entrante
    ? 'Soporte te está llamando'
    : enLlamada
      ? 'Llamada de soporte en curso'
      : soporte.abierto
        ? 'Cerrar soporte'
        : 'Ayuda y soporte';

  return (
    <Tooltip title={titulo} placement="bottom">
      {/* El span es para que el Tooltip siga funcionando cuando el IconButton
          esté deshabilitado o en transición — MUI necesita un hijo que acepte
          ref y eventos. */}
      <span>
        <IconButton
          onClick={soporte.alternar}
          aria-label={titulo}
          aria-expanded={soporte.abierto}
          size="small"
          color={enCurso ? 'success' : soporte.abierto ? 'primary' : 'default'}
          sx={{
            // Mientras hay llamada el botón late, para que se note aunque el
            // panel esté cerrado y la persona esté en otra pantalla.
            ...(entrante && {
              animation: 'soporte-latido 1.4s ease-in-out infinite',
              '@keyframes soporte-latido': {
                '0%, 100%': { transform: 'scale(1)' },
                '50%': { transform: 'scale(1.12)' },
              },
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }),
          }}
        >
          <Badge color="success" variant="dot" invisible={!enCurso} overlap="circular">
            {enCurso ? <Phone size={20} /> : <HelpCircle size={20} />}
          </Badge>
        </IconButton>
      </span>
    </Tooltip>
  );
}

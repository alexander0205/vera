'use client';

/**
 * Disparador del chat, en la barra superior junto al avatar.
 *
 * Antes era un botón flotante abajo a la derecha, y ahí chocaba con las
 * acciones de la página: en el formulario de factura se montaba encima de
 * «Guardar factura». Arriba no tapa nada y queda donde la gente ya busca la
 * ayuda.
 *
 * Es una píldora con un auricular y la palabra «Asistencia»: el panel no es un
 * centro de ayuda, es donde se le pregunta al asistente y se habla con soporte.
 * En pantallas angostas queda solo el ícono.
 */

import Tooltip from '@mui/material/Tooltip';
import { Headset, Phone } from 'lucide-react';
import { useSoporte } from './soporte-context';
import { useLlamadaGlobal } from '@/lib/webrtc/LlamadaGlobalProvider';
import s from './asistente/asistente.module.css';

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
        ? 'Cerrar asistencia y soporte'
        : 'Asistencia y soporte';

  const etiqueta = entrante ? 'Te llaman' : enLlamada ? 'En llamada' : 'Asistencia';

  return (
    <Tooltip title={titulo} placement="bottom">
      <button
        type="button"
        onClick={soporte.alternar}
        aria-label={titulo}
        aria-expanded={soporte.abierto}
        className={[
          s.abrir,
          soporte.abierto && !enCurso ? s.abrirActivo : '',
          enCurso ? s.abrirLlamada : '',
          // Mientras suena, el botón late para que se note aunque el chat
          // esté cerrado y la persona esté en otra pantalla.
          entrante ? s.abrirLatido : '',
        ].filter(Boolean).join(' ')}
      >
        <span className={s.abrirIcono} aria-hidden>
          {enCurso ? <Phone size={13} /> : <Headset size={14} />}
        </span>
        <span className={s.abrirEtiqueta}>{etiqueta}</span>
      </button>
    </Tooltip>
  );
}

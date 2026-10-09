/**
 * Los tres canales por los que Zero le avisa al cliente, en iconos.
 *
 * Existe porque escritos —«WhatsApp · SMS · correo»— ocupaban 141px en una
 * fila cuyo hueco son 100 y pico: en las columnas estrechas el valor se caía a
 * la línea de abajo y la lista de topes quedaba descuadrada justo donde hay que
 * comparar. En iconos ocupa un tercio y nunca parte.
 *
 * Sin dependencias ni hooks: lo pintan por igual el servidor y el cliente, la
 * página pública con Tailwind y la de suscripción con MUI. El color se pasa
 * desde fuera porque la misma fila va sobre tarjeta blanca y sobre tarjeta
 * azul oscuro.
 *
 * El texto va en un `<title>` por icono y en el `aria-label` del grupo, así que
 * un lector de pantalla oye «WhatsApp, SMS y correo» y no tres imágenes mudas.
 */

export const CANALES_TEXTO = 'WhatsApp, SMS y correo';

interface Props {
  /** Alto de cada icono en píxeles. */
  tamano?: number;
  color?: string;
  className?: string;
}

export function CanalesAviso({ tamano = 13, color = 'currentColor', className }: Props) {
  const comun = {
    width: tamano,
    height: tamano,
    viewBox: '0 0 24 24',
    style: { display: 'block', flexShrink: 0 },
  } as const;

  return (
    <span
      role="img"
      aria-label={CANALES_TEXTO}
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: tamano * 0.42, color }}
    >
      {/* WhatsApp — el mismo trazado que el resto del sitio. */}
      <svg {...comun} fill="currentColor">
        <title>WhatsApp</title>
        <path d="M12 2.8a9.1 9.1 0 0 0-7.8 13.8L3 21.5l5-1.3A9.1 9.1 0 1 0 12 2.8zm4.6 12.6c-.2.6-1.2 1.1-1.7 1.1-.5 0-1.9-.2-3.9-1.7-2-1.5-2.8-3.3-2.9-3.6-.1-.3-.5-1.4.1-2.2.3-.4.7-.6.9-.6h.6c.2 0 .3.3.4.5l.6 1.4c.1.2 0 .4-.1.5l-.4.5c-.1.1-.2.3-.1.5.2.4.7 1.1 1.3 1.6.7.6 1.4.9 1.7 1 .2.1.4 0 .5-.1l.6-.7c.1-.2.3-.2.5-.1l1.4.7c.2.1.3.2.3.4.1.3 0 .6-.1.8z" />
      </svg>

      {/* SMS — burbuja con los tres puntos, que es como se dibuja un mensaje
          de texto en todas partes. */}
      <svg {...comun} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <title>SMS</title>
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.2-.5L3 21l1.7-4.5A8.2 8.2 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.5a8.4 8.4 0 0 1 9 8z" />
        <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
      </svg>

      {/* Correo — sobre. */}
      <svg {...comun} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <title>Correo electrónico</title>
        <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
        <path d="m3.5 7 7.3 5.3a2 2 0 0 0 2.4 0L20.5 7" />
      </svg>
    </span>
  );
}

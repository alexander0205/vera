'use client';

import type { LucideIcon } from 'lucide-react';

/**
 * Círculo con ícono y pulso animado — el mismo lenguaje visual para todos
 * los estados "algo está pasando con la llamada, esperá": en curso (dentro
 * de PanelLlamada), saliente (botón "Llamando…" del agente), entrante
 * (banner de invitación del cliente) y el badge del widget minimizado. Un
 * solo lugar para el CSS de la animación en vez de repetirlo en cada
 * componente que lo necesita.
 *
 * `colorRgb` es un triplete "R, G, B" (no un hex) porque el keyframe arma la
 * sombra con `rgba(...)` directamente — mismo patrón que ya funcionaba en el
 * pulso original de PanelLlamada, sin depender de `color-mix()` (soporte de
 * navegador más nuevo, innecesario acá).
 */
export function PulsoLlamada({
  icono: Icono,
  diametro = 56,
  iconoTamano,
  colorFondo = '#3658e1',
  colorRgb = '54, 88, 225',
}: {
  icono: LucideIcon;
  diametro?: number;
  iconoTamano?: number;
  colorFondo?: string;
  colorRgb?: string;
}) {
  const tamanoIcono = iconoTamano ?? Math.round(diametro * 0.43);
  // Nombre de keyframe único por diámetro+color — si dos instancias con
  // valores distintos compartieran el mismo nombre, la que renderice último
  // pisaría la regla CSS de la otra (mismo `@keyframes`, distinto
  // `rgba(...)` adentro).
  const idAnimacion = `zt-pulso-llamada-${diametro}-${colorRgb.replace(/[^0-9]/g, '')}`;
  return (
    <div
      style={{
        width: diametro, height: diametro, borderRadius: '50%', background: colorFondo, color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        animation: `${idAnimacion} 2s ease-out infinite`,
      }}
    >
      <style>{`
        @keyframes ${idAnimacion} {
          0%, 100% { box-shadow: 0 0 0 0 rgba(${colorRgb}, 0.45); }
          50% { box-shadow: 0 0 0 ${Math.round(diametro * 0.25)}px rgba(${colorRgb}, 0); }
        }
      `}</style>
      <Icono size={tamanoIcono} />
    </div>
  );
}

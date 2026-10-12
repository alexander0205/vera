/**
 * Plantillas de WhatsApp desde la configuración del colegio.
 *
 * La infraestructura (tabla, cliente del CRM, asignación por aviso) ya existía
 * para el panel de la plataforma. Esto es la parte que la hace usable por el
 * colegio sin tocar lo de nadie más:
 *
 *   · cada colegio ve y edita SOLO sus plantillas (`whatsapp_plantillas.team_id`);
 *   · el nombre en Meta lleva el prefijo del colegio, porque con el número de
 *     Zero (WABA compartida) dos colegios que pidan `factura_lista` se pisan;
 *   · las variables de un aviso tienen un ORDEN fijo —Meta rellena por
 *     posición—, así que una plantilla solo se puede asignar a un caso de uso
 *     cuyas variables caben en ella.
 */

import { AVISOS_PLANTILLA, type AvisoPlantilla } from './plantillas';
import { contarVariables } from './plantillas-reglas';

export * from './plantillas-reglas';
import type { VariablePlantilla } from '@/lib/db/schema';

/**
 * Las variables de cada caso de uso, en el orden en que `parametrosDeAviso`
 * las manda. Si cambia allá, cambia aquí: es lo que le dice al colegio qué es
 * `{{3}}`.
 */
const CABEZA: VariablePlantilla[] = [
  { pos: 1, nombre: 'colegio',    tipo: 'texto', ejemplo: 'Colegio Mi Casita' },
  { pos: 2, nombre: 'concepto',   tipo: 'texto', ejemplo: 'Mensualidad octubre' },
  { pos: 3, nombre: 'estudiante', tipo: 'texto', ejemplo: 'Ana Pérez' },
  { pos: 4, nombre: 'monto',      tipo: 'monto', ejemplo: 'RD$ 4,500.00' },
];
const TELEFONO = (pos: number): VariablePlantilla =>
  ({ pos, nombre: 'teléfono del colegio', tipo: 'texto', ejemplo: '809-555-0100' });

export const VARIABLES_POR_AVISO: Record<AvisoPlantilla, VariablePlantilla[]> = {
  'al-emitir': [
    ...CABEZA,
    { pos: 5, nombre: 'fecha límite', tipo: 'fecha', ejemplo: '15 de octubre' },
    TELEFONO(6),
  ],
  'al-vencer-con-gracia': [
    ...CABEZA,
    { pos: 5, nombre: 'días de gracia', tipo: 'texto', ejemplo: '5' },
    TELEFONO(6),
  ],
  'al-vencer-con-recargo': [...CABEZA, TELEFONO(5)],
  'al-vencer-sin-mora':    [...CABEZA, TELEFONO(5)],
  'antes-mora': [
    ...CABEZA,
    { pos: 5, nombre: 'fecha del recargo', tipo: 'fecha', ejemplo: '20 de octubre' },
    TELEFONO(6),
  ],
};

/** Los casos de uso con todo lo que la pantalla necesita para pintarlos. */
export function casosDeUso() {
  return AVISOS_PLANTILLA.map((a) => ({
    clave: a.clave,
    titulo: a.titulo,
    detalle: a.detalle,
    variables: VARIABLES_POR_AVISO[a.clave],
  }));
}

/** El prefijo que separa las plantillas de un colegio de las de los demás. */
export const prefijoDe = (teamId: number) => `c${teamId}_`;

/**
 * Lo que el colegio escribe pasa a nombre válido de Meta: minúsculas, números y
 * guion bajo. «Aviso de Mora!» → `c9_aviso_de_mora`.
 */
export function nombreMeta(teamId: number, libre: string): string {
  const base = libre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  if (!base) return '';
  return base.startsWith(prefijoDe(teamId)) ? base : prefijoDe(teamId) + base;
}

/**
 * ¿Cabe esta plantilla en este caso de uso?
 *
 * Tiene que tener EXACTAMENTE las variables que el aviso manda: de más, Meta
 * rechaza el envío por falta de parámetros; de menos, sobran valores y el
 * mensaje sale con datos en el sitio equivocado.
 */
export function cabeEnAviso(cuerpo: string, aviso: AvisoPlantilla): { ok: true } | { ok: false; motivo: string } {
  const esperadas = VARIABLES_POR_AVISO[aviso].length;
  const tiene = contarVariables(cuerpo);
  if (tiene === esperadas) return { ok: true };
  return {
    ok: false,
    motivo: `Este aviso manda ${esperadas} variables y la plantilla tiene ${tiene}.`,
  };
}

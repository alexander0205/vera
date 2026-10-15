/**
 * «Primeros pasos» para quien recién empieza en Zero: el panel del asistente le
 * muestra, sin que pregunte, qué falta para su primera factura (producto,
 * cliente, secuencias, certificado) y cuál es el siguiente paso.
 *
 * Es el mismo flujo de `guias-paso.ts` (`primera-factura`), visto como tarjeta
 * con progreso. Solo conteos de lo que ya existe: nada se crea desde aquí.
 */

import { FLUJOS, type EstadoConfiguracion } from './guias-paso';

export interface PasoPrimerosPasos {
  titulo: string;
  detalle: string;
  ruta: string;
  estado: 'hecho' | 'falta' | 'desconocido';
  opcional: boolean;
}

export interface PrimerosPasos {
  /** Solo para empresas que todavía no emiten su primera factura. */
  mostrar: boolean;
  hechos: number;
  total: number;
  /** 0–100, sobre los pasos obligatorios. */
  porcentaje: number;
  siguiente: { indice: number; titulo: string; detalle: string; ruta: string } | null;
  pasos: PasoPrimerosPasos[];
}

const VACIO: PrimerosPasos = { mostrar: false, hechos: 0, total: 0, porcentaje: 0, siguiente: null, pasos: [] };

export function construirPrimerosPasos(e: EstadoConfiguracion): PrimerosPasos {
  const flujo = FLUJOS.find((f) => f.id === 'primera-factura');
  if (!flujo) return VACIO;

  const pasos: PasoPrimerosPasos[] = flujo.pasos.map((p) => {
    const m = p.listo(e);
    return {
      titulo: p.titulo, detalle: p.detalle, ruta: p.ruta,
      estado: m === true ? 'hecho' : m === false ? 'falta' : 'desconocido',
      opcional: Boolean(p.opcional),
    };
  });

  const obligatorios = pasos.filter((p) => !p.opcional);
  const hechos = obligatorios.filter((p) => p.estado === 'hecho').length;
  const indice = pasos.findIndex((p) => p.estado === 'falta' && !p.opcional);
  // Quien ya facturó (o no sabemos si lo hizo) no necesita la tarjeta.
  const esNuevo = e.facturasEmitidas === 0;

  return {
    mostrar: esNuevo && indice >= 0,
    hechos,
    total: obligatorios.length,
    porcentaje: obligatorios.length ? Math.round((hechos / obligatorios.length) * 100) : 0,
    siguiente: indice >= 0 ? { indice, titulo: pasos[indice].titulo, detalle: pasos[indice].detalle, ruta: pasos[indice].ruta } : null,
    pasos,
  };
}

/** Texto que se manda al asistente cuando la persona cuenta qué vende. */
export function preguntaDeLoQueVende(texto: string): string {
  const limpio = texto.replace(/\s+/g, ' ').trim().slice(0, 300);
  return `Vendo: ${limpio}. Ayúdame a armar la lista de productos o servicios para cargarlos en Zero.`;
}

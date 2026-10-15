/**
 * «Primeros pasos» para quien recién empieza en Zero: el panel del asistente le
 * muestra, sin que pregunte, qué falta para su primera factura (producto,
 * cliente, secuencias, certificado) y cuál es el siguiente paso.
 *
 * Es el mismo flujo de `guias-paso.ts` (`primera-factura`), visto como tarjeta
 * con progreso. Solo conteos de lo que ya existe: nada se crea desde aquí.
 */

import { FLUJOS, type EstadoConfiguracion } from './guias-paso';
import { tourDeRuta, urlDeTour } from './tour';

export interface PasoPrimerosPasos {
  titulo: string;
  detalle: string;
  ruta: string;
  estado: 'hecho' | 'falta' | 'desconocido';
  opcional: boolean;
  /** Pantalla con el tour de este paso resaltado (`?tour=`); si no hay, la pantalla a secas. */
  tour: string;
}

export interface PrimerosPasos {
  /** Solo para empresas que todavía no emiten su primera factura. */
  mostrar: boolean;
  hechos: number;
  total: number;
  /** 0–100, sobre los pasos obligatorios. */
  porcentaje: number;
  siguiente: { indice: number; titulo: string; detalle: string; ruta: string; tour: string } | null;
  pasos: PasoPrimerosPasos[];
}

const VACIO: PrimerosPasos = { mostrar: false, hechos: 0, total: 0, porcentaje: 0, siguiente: null, pasos: [] };

export function construirPrimerosPasos(e: EstadoConfiguracion): PrimerosPasos {
  const flujo = FLUJOS.find((f) => f.id === 'primera-factura');
  if (!flujo) return VACIO;

  // Antes de todo: los datos del negocio (no se puede saber si ya están, y no frena nada).
  const ruta = '/dashboard/configuracion';
  const datosDelNegocio: PasoPrimerosPasos = {
    titulo: 'Completar los datos de tu negocio',
    detalle: 'Nombre, dirección, teléfono y logo: salen en todas tus facturas.',
    ruta, tour: urlDeTour(tourDeRuta(ruta) ?? '') ?? ruta, estado: 'desconocido', opcional: true,
  };

  const pasosFlujo: PasoPrimerosPasos[] = flujo.pasos.map((p) => {
    const m = p.listo(e);
    return {
      titulo: p.titulo, detalle: p.detalle, ruta: p.ruta,
      tour: urlDeTour(tourDeRuta(p.ruta) ?? '') ?? p.ruta,
      estado: m === true ? 'hecho' : m === false ? 'falta' : 'desconocido',
      opcional: Boolean(p.opcional),
    };
  });

  const pasos = [datosDelNegocio, ...pasosFlujo];
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
    siguiente: indice >= 0
      ? { indice, titulo: pasos[indice].titulo, detalle: pasos[indice].detalle, ruta: pasos[indice].ruta, tour: pasos[indice].tour }
      : null,
    pasos,
  };
}

/** Texto que se manda al asistente cuando la persona cuenta qué vende. */
export function preguntaDeLoQueVende(texto: string): string {
  const limpio = texto.replace(/\s+/g, ' ').trim().slice(0, 300);
  return `Vendo: ${limpio}. Ayúdame a armar la lista de productos o servicios para cargarlos en Zero.`;
}

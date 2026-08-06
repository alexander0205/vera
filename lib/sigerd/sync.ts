/**
 * Recopilación del árbol completo de un centro en SIGERD (solo lectura).
 *
 * Recorre servicios → grados → secciones → estudiantes y arma una estructura
 * única, lista para volcar a la base. Es el "espere mientras recopilamos": una
 * sola pasada que junta todo lo que el módulo escolar necesita.
 *
 * NIVEL 1 (esto): nombres. Rápido, cabe en una llamada de Vercel.
 * NIVEL 2 (aparte): la ficha completa por estudiante. Lenta, va en lotes.
 *
 * Todas las peticiones pasan por la compuerta global (`lib/sigerd/gate.ts`), así
 * que el ritmo hacia el portal ya está controlado aunque aquí se pidan decenas
 * de cosas seguidas.
 */

import type { SigerdClient } from './client';
import {
  estudiantesPorSeccion,
  seccionesPorServicio,
  serviciosPorCentro,
  tiposPeriodosPorServicio,
} from './consultas';
import { contextoCentroSesion } from './personal';

export interface SeccionArbol {
  idSeccion: number;
  nombre: string;
  tope: number | null;
  estudiantes: Array<{ id: number; nombre: string }>;
  /**
   * Si la lectura de estudiantes falló incluso tras reintentar. `undefined` =
   * OK. Una sección con `estudiantes: []` y sin `error` está vacía de verdad;
   * con `error` es un fallo que NO se pudo recuperar (no confundir uno con otro).
   */
  error?: string;
  /**
   * Condición académica final por estudiante (Promovido/Reprobado/…), sólo si
   * la descarga la pidió. Cada fila trae también edad y fecha de nacimiento.
   */
  condicionFinal?: import('./consultas').EstudianteCondicionFinal[];
}

export interface GradoArbol {
  idGrado: number;
  nombre: string;
  secciones: SeccionArbol[];
}

export interface ServicioArbol {
  idServicio: number;
  nombre: string;
  grados: GradoArbol[];
}

export interface ArbolCentro {
  idCentro: number;
  idRegional: number;
  idDistrito: number;
  /** Año académico usado (id de SIGERD, ej. 24 = 2025-2026). */
  anoAcademico: number;
  servicios: ServicioArbol[];
  totales: {
    servicios: number;
    grados: number;
    secciones: number;
    estudiantes: number;
    /** Secciones que fallaron al leer sus estudiantes (no se descartan calladas). */
    seccionesConError: number;
  };
}

export type ProgresoSync = (etapa: string, hechos: number, total: number) => void;

/**
 * Lee todo el árbol de un centro para un año académico.
 *
 * El centro NO se recibe del cliente: se toma de la sesión del portal
 * (`contextoCentroSesion`), la misma fuente que usa personal. Así el usuario
 * solo puede recopilar SU centro.
 */
export async function recopilarCentro(
  cli: SigerdClient,
  params: { anoAcademico: number },
  onProgreso?: ProgresoSync,
): Promise<ArbolCentro> {
  const ctx = await contextoCentroSesion(cli);

  // El portal arma estado de sesión al renderizar cada vista. Sin abrir estas
  // páginas antes, los catálogos (/commons/*) y el listado de estudiantes
  // responden "en frío" con el formulario de login. Abrirlas una vez basta.
  await cli.abrirModulo('/modulo-registro/inscripcion/condicion-academica');
  await cli.abrirModulo('/ModuloReportes/Estudiantes/reporte-estudiantes-matricula');

  const serviciosRaw = await serviciosPorCentro(cli, {
    idCentro: ctx.idCentro,
    idAnoAcademico: params.anoAcademico,
  });

  const servicios: ServicioArbol[] = [];
  let nGrados = 0;
  let nSecciones = 0;
  let nEstudiantes = 0;
  let nErrores = 0;

  for (const [i, s] of serviciosRaw.entries()) {
    onProgreso?.('servicios', i + 1, serviciosRaw.length);

    const gradosRaw = await tiposPeriodosPorServicio(cli, {
      idServicioCentro: s.Id,
      idAnoAcademico: params.anoAcademico,
    });

    const grados: GradoArbol[] = [];
    for (const g of gradosRaw) {
      nGrados++;

      const seccionesRaw = await seccionesPorServicio(cli, {
        idServicioCentro: s.Id,
        idTipoPeriodo: g.Id,
        idAnoAcademico: params.anoAcademico,
      });

      const secciones: SeccionArbol[] = [];
      for (const sec of seccionesRaw) {
        nSecciones++;
        let estudiantes: Array<{ id: number; nombre: string }> = [];
        let errorSec: string | undefined;

        // Reintento por sección: el barrido secuencial hace que el portal falle
        // esporádicamente una sección que sí tiene alumnos. Sin esto se pierden
        // datos calladamente (una sección con error queda como "vacía"). La
        // compuerta ya reintenta 5xx; esto cubre respuestas-login y parseos.
        for (let intento = 1; intento <= 3; intento++) {
          try {
            const lista = await estudiantesPorSeccion(cli, {
              idCentro: ctx.idCentro,
              idSeccion: sec.Id,
            });
            estudiantes = lista.map((e) => ({ id: e.Id, nombre: e.Nombre }));
            nEstudiantes += estudiantes.length;
            onProgreso?.('estudiantes', nEstudiantes, nEstudiantes);
            errorSec = undefined;
            break;
          } catch (e) {
            errorSec = e instanceof Error ? e.message : String(e);
            if (intento < 3) await new Promise((r) => setTimeout(r, 500 * intento));
          }
        }
        if (errorSec) nErrores++;

        secciones.push({
          idSeccion: sec.Id,
          nombre: sec.Nombre,
          tope: sec.Tope ?? null,
          estudiantes,
          error: errorSec,
        });
      }

      grados.push({ idGrado: g.Id, nombre: g.Nombre, secciones });
    }

    servicios.push({ idServicio: s.Id, nombre: s.Nombre, grados });
  }

  return {
    idCentro: ctx.idCentro,
    idRegional: ctx.idRegional,
    idDistrito: ctx.idDistrito,
    anoAcademico: params.anoAcademico,
    servicios,
    totales: {
      servicios: servicios.length,
      grados: nGrados,
      secciones: nSecciones,
      estudiantes: nEstudiantes,
      seccionesConError: nErrores,
    },
  };
}

/** Resumen ligero del árbol, para la vista previa sin volcar todos los nombres. */
export function resumenArbol(arbol: ArbolCentro) {
  return {
    centro: arbol.idCentro,
    anoAcademico: arbol.anoAcademico,
    totales: arbol.totales,
    servicios: arbol.servicios.map((s) => ({
      nombre: s.nombre,
      grados: s.grados.map((g) => ({
        nombre: g.nombre,
        secciones: g.secciones.map((sec) => ({ nombre: sec.nombre, estudiantes: sec.estudiantes.length })),
      })),
    })),
  };
}

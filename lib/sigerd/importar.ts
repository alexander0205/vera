/**
 * Lectura de una sección de SIGERD lista para importar.
 *
 * `estudiantesPorSeccion` solo devuelve `{ Id, Nombre }` con el nombre completo
 * concatenado, y nuestra tabla quiere `nombres` y `apellidos` por separado.
 * Partir un nombre dominicano por espacios es adivinar: "José de los Santos
 * Pérez" no se separa bien con ninguna heurística.
 *
 * Por eso cada estudiante se enriquece con una consulta al buscador por
 * `idEstudiante`, que sí devuelve los campos separados (verificado: filtra
 * exacto, `total=1`). Cuesta un request por estudiante — a cambio, los datos
 * son los del portal y no una interpretación nuestra.
 *
 * Este módulo NO escribe en la base de datos: solo lee y normaliza.
 */

import type { SigerdClient } from './client';
import { buscarEstudiantes, estudiantesPorSeccion } from './consultas';
import { traerFichaEstudiante, type FichaEstudianteSigerd } from './ficha';
import { aFechaISO } from './fechas';

export { aFechaISO };

/** Estudiante de SIGERD ya normalizado a la forma que usa el módulo escolar. */
export interface EstudianteSigerd {
  /** `IdEstudiante` del portal. Estable, sirve de clave de reconciliación. */
  idSigerd: number;
  /** Registro Nacional del Estudiante. Longitud variable y ausente a menudo. */
  rne: string | null;
  /** Número Único de Identificación. Falta en muchos registros. */
  nui: string | null;
  nombres: string;
  apellidos: string;
  /** ISO `yyyy-MM-dd`, o `null` si el portal no la trae. */
  fechaNacimiento: string | null;
  /** Nombre tal como lo devuelve el listado de la sección, para auditar. */
  nombreEnSeccion: string;
  /**
   * Expediente completo: sexo, nacionalidad, acta, dirección. Solo viene con
   * `conFicha: true`. Es información sensible de un menor — no la pidas si no
   * la vas a usar.
   */
  ficha?: FichaEstudianteSigerd;
}

export interface SeccionImportada {
  idSeccion: number;
  idCentro: number;
  estudiantes: EstudianteSigerd[];
  /**
   * Estudiantes que aparecen en la sección pero cuyo detalle no se pudo
   * recuperar. NO se descartan en silencio: quien importe decide qué hacer.
   */
  sinDetalle: Array<{ idSigerd: number; nombre: string; motivo: string }>;
}

/** Une los dos campos de nombre (o apellido) descartando vacíos. */
function unir(...partes: Array<string | null | undefined>): string {
  return partes.map((p) => (p ?? '').trim()).filter(Boolean).join(' ');
}

/**
 * Trae una sección completa con el detalle de cada estudiante.
 *
 * `onProgreso` permite mostrar avance: son N+1 peticiones y con 30 estudiantes
 * la espera se nota.
 */
export async function traerSeccionParaImportar(
  cli: SigerdClient,
  params: {
    idCentro: number;
    idSeccion: number;
    pausaMs?: number;
    /**
     * Enriquecer con la ficha completa en vez del buscador. Cuesta lo mismo
     * (una petición por estudiante) y añade sexo, nacionalidad, estado de acta
     * y dirección. Por defecto `false`: no se traen datos sensibles de más.
     */
    conFicha?: boolean;
  },
  onProgreso?: (hechos: number, total: number) => void,
): Promise<SeccionImportada> {
  const pausa = params.pausaMs ?? 200;

  const listado = await estudiantesPorSeccion(cli, {
    idCentro: params.idCentro,
    idSeccion: params.idSeccion,
  });

  const estudiantes: EstudianteSigerd[] = [];
  const sinDetalle: SeccionImportada['sinDetalle'] = [];

  for (const [i, fila] of listado.entries()) {
    try {
      if (params.conFicha) {
        const ficha = await traerFichaEstudiante(cli, fila.Id, { precargar: i === 0 });
        estudiantes.push({
          idSigerd: fila.Id,
          rne: ficha.codigoRNE,
          nui: null, // la ficha no lo expone; sí lo trae el buscador.
          nombres: unir(ficha.primerNombre, ficha.segundoNombre),
          apellidos: unir(ficha.primerApellido, ficha.segundoApellido),
          fechaNacimiento: ficha.fechaNacimiento,
          nombreEnSeccion: fila.Nombre,
          ficha,
        });

        onProgreso?.(i + 1, listado.length);
        if (pausa) await new Promise((r) => setTimeout(r, pausa));
        continue;
      }

      const r = await buscarEstudiantes(cli, {
        idEstudiante: fila.Id,
        porPagina: 5,
        // La vista ya se abrió en la primera llamada: evitamos repetirla.
        precargar: i === 0,
      });

      const detalle = (r.rows ?? []).find((f) => Number(f.IdEstudiante) === Number(fila.Id));
      if (!detalle) {
        sinDetalle.push({ idSigerd: fila.Id, nombre: fila.Nombre, motivo: 'el buscador no lo devolvió' });
        continue;
      }

      estudiantes.push({
        idSigerd: Number(detalle.IdEstudiante),
        rne: detalle.CodigoRNE?.trim() || null,
        nui: detalle.Nui?.trim() || null,
        nombres: unir(detalle.Nombres, detalle.Nombre2),
        apellidos: unir(detalle.Apellido1, detalle.Apellido2),
        fechaNacimiento: aFechaISO(detalle.FechaNacimiento),
        nombreEnSeccion: fila.Nombre,
      });
    } catch (e) {
      sinDetalle.push({
        idSigerd: fila.Id,
        nombre: fila.Nombre,
        motivo: e instanceof Error ? e.message : String(e),
      });
    }

    onProgreso?.(i + 1, listado.length);
    if (pausa) await new Promise((r) => setTimeout(r, pausa));
  }

  return {
    idSeccion: params.idSeccion,
    idCentro: params.idCentro,
    estudiantes,
    sinDetalle,
  };
}

/**
 * Código con el que se identifica al estudiante en nuestra base.
 *
 * Se prefiere el RNE porque es el identificador oficial del MINERD y sobrevive
 * a cambios de centro. Cuando falta se cae al id de SIGERD con prefijo, para
 * que nunca choque con un código generado por nosotros.
 *
 * LIMITACIÓN CONOCIDA: en una sección real 6 de 14 estudiantes no tenían RNE.
 * Si el MINERD se lo asigna después, una reimportación los verá como nuevos
 * (cambia el código) y los duplicará. Para evitarlo habría que guardar el
 * `idSigerd` en su propia columna, lo que exige migración.
 */
export function codigoParaEstudiante(e: EstudianteSigerd): string {
  return e.rne ?? `SIGERD-${e.idSigerd}`;
}

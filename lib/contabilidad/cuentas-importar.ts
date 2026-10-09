/**
 * lib/contabilidad/cuentas-importar.ts — Aplica un catálogo leído de Excel.
 *
 * Tres decisiones que definen el comportamiento:
 *
 * 1. **La llave es el código.** Un código que no existe se crea; uno que existe
 *    se actualiza con lo que cambió. Es lo que hace funcionar el ciclo exportar
 *    → editar en Excel → importar.
 *
 * 2. **Importar nunca borra.** Una cuenta que está en el sistema y no en el
 *    archivo se queda como está. Borrar por omisión —una fila que alguien quitó
 *    sin querer— sería perder una cuenta con movimientos.
 *
 * 3. **Todo o nada, y con las MISMAS reglas que el formulario.** Corre en una
 *    transacción llamando a `crearCuenta` y `editarCuenta` con ese ejecutor: no
 *    hay una versión «para importar» de las reglas que pueda desviarse. Si una
 *    sola fila falla, no se aplica ninguna. Y la vista previa es exactamente la
 *    misma corrida, deshecha al final: lo que dice que va a pasar es lo que pasa.
 */

import { db } from '@/lib/db/drizzle';
import {
  listarCuentas, crearCuenta, editarCuenta, CuentaError,
  type Cuenta, type EditarCuentaInput,
} from './cuentas';
import { ordenarPadresPrimero, type FilaCatalogo, type ErrorFila } from './cuentas-excel';

export interface ResultadoImportacion {
  /** true solo si se confirmó y no hubo ni un error: los cambios quedaron. */
  aplicado: boolean;
  creadas: { fila: number; codigo: string; nombre: string }[];
  actualizadas: { fila: number; codigo: string; cambios: string[] }[];
  sinCambios: number;
  errores: ErrorFila[];
}

/** Lanzada a propósito para deshacer la transacción: vista previa o errores. */
class DeshacerImportacion extends Error {
  constructor(readonly resultado: ResultadoImportacion) {
    super('deshacer importación');
  }
}

const NOMBRE_CAMBIO: Record<keyof EditarCuentaInput, string> = {
  codigo: 'código',
  nombre: 'nombre',
  tipo: 'tipo',
  naturaleza: 'naturaleza',
  cuentaPadreId: 'cuenta padre',
  imputable: 'acepta movimientos',
  activa: 'activa',
};

export async function importarCatalogo(
  teamId: number,
  userId: number,
  filas: FilaCatalogo[],
  opts: { aplicar: boolean; erroresDeLectura?: ErrorFila[] },
): Promise<ResultadoImportacion> {
  const { ordenadas, errores: erroresOrden } = ordenarPadresPrimero(filas);

  const resultado: ResultadoImportacion = {
    aplicado: false,
    creadas: [],
    actualizadas: [],
    sinCambios: 0,
    errores: [...(opts.erroresDeLectura ?? []), ...erroresOrden],
  };

  try {
    await db.transaction(async (tx) => {
      // Lo que ya hay, por código. Se va completando con lo que se crea, para
      // que una hija del archivo encuentre al padre recién creado dos filas antes.
      const existentes = await listarCuentas(teamId, { incluirInactivas: true }, tx);
      const porCodigo = new Map<string, Cuenta>(existentes.map((c) => [c.codigo, c]));

      for (const f of ordenadas) {
        try {
          // Cada fila en su propio punto de guardado: si una revienta a nivel
          // SQL, la transacción entera no queda envenenada y las demás filas
          // se pueden seguir revisando para reportar TODOS los errores de una vez.
          await tx.transaction(async (sp) => {
            let padreId: number | null | undefined;
            if (f.padreCodigo === null) padreId = null;
            else if (f.padreCodigo !== undefined) {
              const padre = porCodigo.get(f.padreCodigo);
              if (!padre) {
                throw new CuentaError(
                  `La cuenta padre ${f.padreCodigo} no existe ni en el sistema ni en el archivo.`,
                );
              }
              padreId = padre.id;
            }

            const actual = porCodigo.get(f.codigo);

            if (!actual) {
              if (!f.nombre) throw new CuentaError('Una cuenta nueva necesita nombre.');
              if (!f.tipo) throw new CuentaError('Una cuenta nueva necesita tipo.');
              const creada = await crearCuenta(teamId, {
                codigo: f.codigo,
                nombre: f.nombre,
                tipo: f.tipo,
                naturaleza: f.naturaleza,
                cuentaPadreId: padreId ?? null,
                imputable: f.imputable,
              }, userId, sp);
              porCodigo.set(creada.codigo, creada);
              resultado.creadas.push({ fila: f.fila, codigo: f.codigo, nombre: f.nombre });
              return;
            }

            // Solo lo que cambia. Mandar un campo igual a `editarCuenta` podría
            // disparar una regla por nada —cambiar el tipo de una cuenta con
            // movimientos está prohibido aunque sea «al mismo tipo»—.
            const cambios: EditarCuentaInput = {};
            if (f.nombre !== undefined && f.nombre !== actual.nombre) cambios.nombre = f.nombre;
            if (f.tipo !== undefined && f.tipo !== actual.tipo) cambios.tipo = f.tipo;
            if (f.naturaleza !== undefined && f.naturaleza !== actual.naturaleza) cambios.naturaleza = f.naturaleza;
            if (padreId !== undefined && padreId !== actual.cuentaPadreId) cambios.cuentaPadreId = padreId;
            if (f.imputable !== undefined && f.imputable !== actual.imputable) cambios.imputable = f.imputable;
            if (f.activa !== undefined && f.activa !== actual.activa) cambios.activa = f.activa;

            const claves = Object.keys(cambios) as (keyof EditarCuentaInput)[];
            if (claves.length === 0) {
              resultado.sinCambios++;
              return;
            }

            const editada = await editarCuenta(teamId, actual.id, cambios, userId, sp);
            porCodigo.set(editada.codigo, editada);
            resultado.actualizadas.push({
              fila: f.fila,
              codigo: f.codigo,
              cambios: claves.map((k) => NOMBRE_CAMBIO[k]),
            });
          });
        } catch (e) {
          if (e instanceof CuentaError) {
            resultado.errores.push({ fila: f.fila, codigo: f.codigo, mensaje: e.message });
            continue;
          }
          throw e;
        }
      }

      // Vista previa, o algo falló: se deshace TODO. Lo creado y lo editado en
      // esta corrida desaparece, y el resultado dice lo que habría pasado.
      if (!opts.aplicar || resultado.errores.length > 0) {
        throw new DeshacerImportacion(resultado);
      }
    });
  } catch (e) {
    if (e instanceof DeshacerImportacion) {
      resultado.errores.sort((a, b) => a.fila - b.fila);
      return { ...e.resultado, aplicado: false };
    }
    throw e;
  }

  return { ...resultado, aplicado: true };
}

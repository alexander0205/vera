/**
 * Los responsables de un alumno (padre, madre, tutor) traídos de SIGERD y
 * dejados como tutores del colegio: los que ya existen se reutilizan (por
 * cédula, o por nombre si no la hay) y los que faltan se crean.
 *
 * NO los ata al alumno: eso lo decide quien llama (el alta los enseña antes de
 * crear al alumno; la ficha y la migración los atan ya). Lo usan
 * `POST /tutores/desde-sigerd` y el trabajo que completa familias en lote.
 */

import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarTutores } from '@/lib/db/schema';
import type { SigerdClient } from './client';
import { traerParientesEstudiante, type ParienteSigerd } from './parientes';
import { traerParientesDesdePdf } from './ficha-pdf';

export interface TutorDeSigerd {
  tutorId: number;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  email: string | null;
  clientId: number | null;
  relacion: string;
  reutilizado: boolean;
}

/** El PDF trae el nombre entero en una pieza; la pestaña lo trae partido. */
function nombreDe(p: { nombreCompleto?: string } & Partial<Omit<ParienteSigerd, 'tipo'>>): string {
  if (p.nombreCompleto?.trim()) return p.nombreCompleto.replace(/\s+/g, ' ').trim();
  return [p.primerNombre, p.segundoNombre, p.primerApellido, p.segundoApellido]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** Un nombre que se puede guardar como persona: con letras, sin tiras de cifras. */
export function esNombreDePersona(nombre: string): boolean {
  const letras = (nombre.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) ?? []).length;
  return letras >= 4 && !/\d{3}/.test(nombre);
}

const soloCifras = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/** El nombre para comparar personas: sin espacios, tildes ni mayúsculas. */
export function claveDeNombre(nombre: string): string {
  return nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/gi, '').toLowerCase();
}

/** Un teléfono que se pueda marcar; el PDF a veces deja solo el prefijo «(829)». */
function telefonoDe(p: { celular: string | null; telefono: string | null }): string | null {
  for (const t of [p.celular, p.telefono]) {
    if (t && soloCifras(t).length >= 7) return t.trim();
  }
  return null;
}

export async function traerTutoresDeSigerd(
  teamId: number, cli: SigerdClient, idEstudianteSigerd: number,
): Promise<TutorDeSigerd[]> {
  /**
   * El PDF manda porque es el único que trae los datos.
   *
   * `GetViewDatosPariente` —la pestaña del portal— devuelve el formulario en
   * blanco para todos los alumnos probados, incluido uno cuyo PDF sí lista
   * padre y madre con cédula. Se deja como respaldo por si el reporte falla o
   * el ministerio arregla la pestaña, pero primero va el que funciona.
   */
  let parientes: Array<{
    tipo: string; cedula: string | null; email: string | null;
    telefono: string | null; celular: string | null; direccion: string | null;
    nombreCompleto?: string;
    primerNombre?: string | null; segundoNombre?: string | null;
    primerApellido?: string | null; segundoApellido?: string | null;
  }> = [];

  try {
    parientes = (await traerParientesDesdePdf(cli, idEstudianteSigerd)).map((p) => ({
      tipo: p.tipo,
      nombreCompleto: p.nombre,
      cedula: p.cedula,
      celular: p.celular,
      telefono: p.telefono,
      email: null,
      direccion: null,
    }));
  } catch {
    // Que el reporte falle no tumba el alta: se sigue con la pestaña, y si
    // esa también viene vacía el usuario pone los tutores a mano.
    parientes = [];
  }

  if (parientes.length === 0) {
    parientes = (await traerParientesEstudiante(cli, idEstudianteSigerd)) as typeof parientes;
  }

  const tutores: TutorDeSigerd[] = [];
  let yaEnElColegio: Array<{ id: number; clientId: number | null; nombre: string; documento: string | null }> | undefined;
  for (const p of parientes) {
    const nombre = nombreDe(p);
    // Sin nombre no hay tutor que crear: el hueco del portal estaba a medias.
    if (!nombre) continue;
    // Ni un nombre que no lo es: el PDF a veces corre los teléfonos a esa
    // columna («143-880675 (849) 537-4954…», CEMM 29-oct). Sin letras de
    // verdad, o con una tira de cifras, no se crea un tutor con eso.
    if (!esNombreDePersona(nombre)) continue;

    const documento = p.cedula?.trim() || null;

    // Reutilizar antes que duplicar. La cédula manda —es la identidad— y se
    // compara por sus cifras: el colegio la guarda sin guiones y el PDF con
    // ellos. Si no está, la misma persona por su nombre sin espacios ni tildes:
    // el PDF los pega («AMANDAJAVIERACOSTA») y a veces trae la cédula con una
    // cifra cambiada (CEMM 29-oct), y así se creaba otra Amanda. Sin esto, traer
    // los parientes de dos hermanos crearía al mismo padre dos veces.
    yaEnElColegio ??= await db
      .select({
        id: adminEscolarTutores.id, clientId: adminEscolarTutores.clientId,
        nombre: adminEscolarTutores.nombre, documento: adminEscolarTutores.documento,
      })
      .from(adminEscolarTutores)
      .where(eq(adminEscolarTutores.teamId, teamId));
    const cifras = soloCifras(documento);
    const existente = (cifras.length >= 7 ? yaEnElColegio.find((t) => soloCifras(t.documento) === cifras) : undefined)
      ?? yaEnElColegio.find((t) => claveDeNombre(t.nombre) === claveDeNombre(nombre));

    let tutorId: number;
    let clientId: number | null;
    if (existente) {
      tutorId = existente.id;
      clientId = existente.clientId;
    } else {
      const [creado] = await db.insert(adminEscolarTutores).values({
        teamId,
        nombre,
        documento,
        // El portal guarda los dos; el celular es el que contesta.
        telefono: telefonoDe(p),
        email: p.email?.trim() || null,
        direccion: p.direccion?.trim() || null,
      }).returning({ id: adminEscolarTutores.id });
      tutorId = creado.id;
      clientId = null;
    }

    tutores.push({
      tutorId,
      nombre,
      documento,
      telefono: telefonoDe(p),
      email: p.email?.trim() || null,
      clientId,
      // `padre` | `madre` | `tutor` son tres de nuestras cinco relaciones, así
      // que el tipo del portal entra tal cual.
      relacion: p.tipo,
      reutilizado: !!existente,
    });
  }
  return tutores;
}

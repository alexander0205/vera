import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes, adminEscolarTutores, escolarPersonal, products, teams } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import type { Permission } from '@/lib/config/roles';
import type { ModuleKey } from '@/lib/auth/modules';

/**
 * Registro de entidades que pueden tener foto.
 *
 * Este archivo es la única cosa que hay que tocar para que el componente de
 * fotos sirva a algo nuevo. Ni el componente, ni los endpoints, ni la página
 * del móvil saben qué es un estudiante: piden la definición por su clave.
 *
 * Cada definición responde tres cosas:
 *   - a qué módulo y permisos pertenece la foto (quién puede verla/cambiarla),
 *   - si esa fila existe DENTRO del team que pide (aislamiento multi-tenant),
 *   - cómo se llama, para que el teléfono muestre a quién le está tomando la
 *     foto y el encargado no se equivoque de alumno.
 */

export interface DefinicionEntidad {
  /** Cómo se llama en la UI del móvil ("Estudiante", "Producto"…). */
  tipo: string;
  modulo: ModuleKey;
  permisoVer: Permission;
  permisoGestionar: Permission;
  /**
   * Devuelve el nombre de la fila si pertenece al team, o null si no existe o
   * es de otra empresa. Es a la vez el chequeo de pertenencia y la etiqueta:
   * así ninguna ruta puede olvidarse de filtrar por teamId.
   */
  cargar: (teamId: number, entidadId: number) => Promise<string | null>;
}

export const ENTIDADES_FOTO = {
  estudiante: {
    tipo: 'Estudiante',
    modulo: 'escolar',
    permisoVer: 'administracion-escolar:ver',
    permisoGestionar: 'administracion-escolar:gestionar',
    async cargar(teamId, id) {
      const [r] = await db
        .select({ nombres: adminEscolarEstudiantes.nombres, apellidos: adminEscolarEstudiantes.apellidos })
        .from(adminEscolarEstudiantes)
        .where(and(eq(adminEscolarEstudiantes.id, id), eq(adminEscolarEstudiantes.teamId, teamId)))
        .limit(1);
      return r ? `${r.nombres} ${r.apellidos}`.trim() : null;
    },
  },

  personal: {
    tipo: 'Personal',
    modulo: 'escolar',
    permisoVer: 'administracion-escolar:ver',
    permisoGestionar: 'administracion-escolar:gestionar',
    async cargar(teamId, id) {
      const [r] = await db
        .select({ nombres: escolarPersonal.nombres, apellidos: escolarPersonal.apellidos })
        .from(escolarPersonal)
        .where(and(eq(escolarPersonal.id, id), eq(escolarPersonal.teamId, teamId)))
        .limit(1);
      return r ? `${r.nombres ?? ''} ${r.apellidos ?? ''}`.trim() || 'Sin nombre' : null;
    },
  },

  producto: {
    tipo: 'Producto',
    modulo: 'facturacion',
    permisoVer: 'productos:ver',
    permisoGestionar: 'productos:gestionar',
    async cargar(teamId, id) {
      const [r] = await db
        .select({ nombre: products.nombre })
        .from(products)
        .where(and(eq(products.id, id), eq(products.teamId, teamId)))
        .limit(1);
      return r?.nombre ?? null;
    },
  },

  tutor: {
    tipo: 'Tutor',
    modulo: 'escolar',
    permisoVer: 'administracion-escolar:ver',
    permisoGestionar: 'administracion-escolar:gestionar',
    async cargar(teamId, id) {
      const [r] = await db
        .select({ nombre: adminEscolarTutores.nombre })
        .from(adminEscolarTutores)
        .where(and(eq(adminEscolarTutores.id, id), eq(adminEscolarTutores.teamId, teamId)))
        .limit(1);
      return r?.nombre?.trim() || (r ? 'Sin nombre' : null);
    },
  },

  empresa: {
    tipo: 'Logotipo',
    modulo: 'administracion',
    permisoVer: 'configuracion:ver',
    permisoGestionar: 'configuracion:gestionar',
    // El logo es del propio team: el único id válido es el team activo. Pasar
    // el id de otra empresa no encuentra nada aunque el usuario tenga permiso.
    async cargar(teamId, id) {
      if (id !== teamId) return null;
      const [r] = await db
        .select({ nombre: teams.name })
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);
      return r?.nombre ?? null;
    },
  },
} satisfies Record<string, DefinicionEntidad>;

export type EntidadFoto = keyof typeof ENTIDADES_FOTO;

/** Valida una clave que llegó por la red antes de usarla como índice. */
export function esEntidadValida(valor: unknown): valor is EntidadFoto {
  return typeof valor === 'string' && Object.hasOwn(ENTIDADES_FOTO, valor);
}

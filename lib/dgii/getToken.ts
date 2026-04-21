/**
 * @deprecated Usa `getDgiiAuth` de `@/lib/dgii/auth` directamente.
 * Este archivo existe solo para no romper importaciones antiguas mientras
 * se migra. Eliminar cuando todos los callers apunten a auth.ts.
 */

export { getDgiiAuth as getDgiiToken } from './auth';
export type { DgiiAuthResult as DgiiTokenResult } from './auth';

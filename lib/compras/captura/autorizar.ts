import 'server-only';
import { requirePermission, type AuthOk, type AuthErr } from '@/lib/auth/api-guard';

/**
 * Quien registra gastos maneja la bandeja de facturas fotografiadas: el que
 * gestiona productos (compras) o el que crea facturas (gastos). Mismo criterio
 * que el registro de compras y gastos.
 */
export async function autorizarCapturas(escritura: boolean): Promise<AuthOk | AuthErr> {
  const productos = await requirePermission(escritura ? 'productos:gestionar' : 'productos:ver', { escritura });
  if (productos.ok) return productos;
  return requirePermission(escritura ? 'facturas:crear' : 'facturas:ver', { escritura });
}

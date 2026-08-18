/**
 * GET /api/admin/whatsapp/estado
 *
 * Estado de la conexión, para consultarlo sin recargar la página. Lo usa el
 * botón de conectar mientras el popup de Meta está abierto: la conexión pasa
 * en OTRA ventana, y sin preguntar no hay forma de enterarse de que terminó.
 *
 * Aparte del POST de /conectar a propósito: aquel genera un enlace nuevo cada
 * vez que se llama, y preguntar «¿ya?» cada tres segundos no debería estar
 * fabricando tokens de conexión.
 */

import { NextResponse } from 'next/server';
import { getEstadoZero } from '@/lib/whatsapp/estado';
import { requireAdmin } from '@/lib/whatsapp/admin-guard';

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json(await getEstadoZero());
}

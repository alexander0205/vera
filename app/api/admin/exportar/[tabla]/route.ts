/**
 * GET /api/admin/exportar/:tabla?<los mismos filtros de la pantalla>
 *
 * El CSV de TODO lo que la tabla del panel tiene con esos filtros (no solo la
 * página que se ve), hasta `TOPE_EXPORTACION` filas. Solo administradores de la
 * plataforma. Las tablas con paginación en el servidor no pueden exportar desde
 * el navegador —solo tienen una página—, así que exportan por aquí.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/admin-guard';
import { leerConsulta, TOPE_EXPORTACION } from '@/lib/admin/consulta-tabla';
import {
  consultarEmpresas, consultarLogs, consultarTareas, consultarUsuarios,
  csvEmpresas, csvLogs, csvTareas, csvUsuarios,
  DEF_EMPRESAS, DEF_LOGS, DEF_TAREAS, DEF_USUARIOS,
} from '@/lib/admin/tablas';

export const dynamic = 'force-dynamic';

const TABLAS = {
  empresas: async (p: URLSearchParams, _yo: number) => csvEmpresas((await consultarEmpresas(leerConsulta(Object.fromEntries(p), DEF_EMPRESAS), true)).filas),
  usuarios: async (p: URLSearchParams, _yo: number) => csvUsuarios((await consultarUsuarios(leerConsulta(Object.fromEntries(p), DEF_USUARIOS), true)).filas),
  logs: async (p: URLSearchParams, _yo: number) => csvLogs((await consultarLogs(leerConsulta(Object.fromEntries(p), DEF_LOGS), true)).filas),
  tareas: async (p: URLSearchParams, yo: number) => csvTareas((await consultarTareas(leerConsulta(Object.fromEntries(p), DEF_TAREAS), true, yo)).filas),
} as const;

export async function GET(req: NextRequest, ctx: { params: Promise<{ tabla: string }> }) {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;

  const { tabla } = await ctx.params;
  if (!Object.hasOwn(TABLAS, tabla)) return NextResponse.json({ error: 'Tabla desconocida' }, { status: 404 });

  const csv = await TABLAS[tabla as keyof typeof TABLAS](req.nextUrl.searchParams, a.user.id);
  const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="zero-${tabla}-${dia}.csv"`,
      'Cache-Control': 'no-store',
      'X-Tope-Filas': String(TOPE_EXPORTACION),
    },
  });
}

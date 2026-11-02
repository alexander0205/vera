/**
 * Las tareas de todo el colegio: la pantalla «Tareas».
 *
 *   GET ?vista=mias|todas|revision|hechas&origen=todas|ia|personas&asignada=soporte|persona&esperando=soporte|colegio
 *       → { familias, cuentas, kpis }
 *
 * Ver `tareasDelColegio` en lib/administracion-escolar/tareas.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { quienMira, tareasDelColegio, type FiltroColegio } from '@/lib/administracion-escolar/tareas';

const uno = <T extends string>(v: string | null, opciones: readonly T[], porDefecto: T): T =>
  (opciones as readonly string[]).includes(v ?? '') ? (v as T) : porDefecto;

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const yo = quienMira(auth.user);
  const sp = req.nextUrl.searchParams;

  const filtro: FiltroColegio = {
    vista: uno(sp.get('vista'), ['mias', 'todas', 'proceso', 'revision', 'hechas'] as const, 'mias'),
    origen: uno(sp.get('origen'), ['todas', 'ia', 'personas'] as const, 'todas'),
    asignada: uno(sp.get('asignada'), ['', 'soporte', 'persona'] as const, ''),
    esperando: uno(sp.get('esperando'), ['', 'soporte', 'colegio'] as const, ''),
  };
  return NextResponse.json(await tareasDelColegio(auth.teamId, yo, filtro));
}

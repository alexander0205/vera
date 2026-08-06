import { NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { sigerdImportaciones } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

/**
 * Condición académica final por sección, tal como la bajamos de SIGERD (vive en
 * el snapshot `dump`). Solo lectura. Devuelve el árbol Servicio→Grado→Sección
 * con los estudiantes y su condición (Promovido/Reprobado/Aplazado…).
 */
type EstCond = {
  idEstudiante: number; nombre: string; edad: string | null;
  estadoMatricula: string | null; fechaNacimiento: string | null;
  IdCondicionAcademica: number | null; nombreCondicionAcademica: string | null;
};

export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  // Solo la estructura del último dump completado (no arrastra fichas pesadas).
  const [row] = await db
    .select({
      servicios: sql<unknown>`${sigerdImportaciones.dump} -> 'estructura' -> 'servicios'`,
      completadoEn: sigerdImportaciones.completadoEn,
    })
    .from(sigerdImportaciones)
    .where(eq(sigerdImportaciones.teamId, auth.teamId))
    .orderBy(desc(sigerdImportaciones.updatedAt))
    .limit(1);

  if (!row || !Array.isArray(row.servicios)) {
    return NextResponse.json({ servicios: [], actualizadoEn: null });
  }

  const servicios = (row.servicios as Array<{ nombre?: string; grados?: Array<{ nombre?: string; secciones?: Array<{ nombre?: string; condicionFinal?: EstCond[] }> }> }>)
    .map((sv) => ({
      nombre: sv.nombre ?? '—',
      grados: (sv.grados ?? []).map((g) => ({
        nombre: g.nombre ?? '—',
        secciones: (g.secciones ?? []).map((sec) => {
          const estudiantes = (sec.condicionFinal ?? []).map((e) => ({
            idEstudiante: e.idEstudiante,
            nombre: (e.nombre ?? '').trim(),
            edad: e.edad ?? null,
            estadoMatricula: e.estadoMatricula ?? null,
            condicion: e.nombreCondicionAcademica ?? 'No definido',
            idCondicion: e.IdCondicionAcademica ?? 0,
          }));
          // Resumen por condición.
          const resumen: Record<string, number> = {};
          for (const e of estudiantes) resumen[e.condicion] = (resumen[e.condicion] ?? 0) + 1;
          return { nombre: sec.nombre ?? '—', total: estudiantes.length, resumen, estudiantes };
        }),
      })),
    }));

  return NextResponse.json({ servicios, actualizadoEn: row.completadoEn?.toISOString() ?? null });
}

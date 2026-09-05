import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { nominaCorridas, nominaLineas } from '@/lib/db/schema';
import { generarAutodeterminacionTSS } from '@/lib/nomina/autodeterminacion-tss';

export const dynamic = 'force-dynamic';

/**
 * GET /api/nomina/corridas/[id]/tss — archivo de autodeterminación de la TSS de
 * una corrida aprobada (detalle por empleado de aportes y retenciones a la
 * Seguridad Social). `?preview=1` devuelve JSON con los totales; sin él, el CSV.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:pagar');
  if (!auth.ok) return auth.response;

  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [corrida] = await db
    .select()
    .from(nominaCorridas)
    .where(and(eq(nominaCorridas.id, id), eq(nominaCorridas.teamId, auth.teamId)))
    .limit(1);

  if (!corrida) return NextResponse.json({ error: 'Corrida no encontrada' }, { status: 404 });
  if (corrida.estado === 'borrador') {
    return NextResponse.json({ error: 'La corrida debe estar aprobada para la autodeterminación' }, { status: 409 });
  }

  const filas = await db
    .select({
      nombre: nominaLineas.nombre,
      cedula: nominaLineas.cedula,
      brutoCents: nominaLineas.brutoCents,
      afpEmpleadoCents: nominaLineas.afpEmpleadoCents,
      sfsEmpleadoCents: nominaLineas.sfsEmpleadoCents,
      afpPatronalCents: nominaLineas.afpPatronalCents,
      sfsPatronalCents: nominaLineas.sfsPatronalCents,
      srlPatronalCents: nominaLineas.srlPatronalCents,
      infotepPatronalCents: nominaLineas.infotepPatronalCents,
    })
    .from(nominaLineas)
    .where(eq(nominaLineas.corridaId, id))
    .orderBy(asc(nominaLineas.nombre));

  const archivo = generarAutodeterminacionTSS(filas, { periodo: corrida.periodo });

  if (new URL(req.url).searchParams.get('preview') === '1') {
    return NextResponse.json({
      totalEmpleados: archivo.totalEmpleados,
      totales: archivo.totales,
      nombreArchivo: archivo.nombreArchivo,
      nota: archivo.nota,
    });
  }

  return new NextResponse(archivo.contenido, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${archivo.nombreArchivo}"`,
    },
  });
}

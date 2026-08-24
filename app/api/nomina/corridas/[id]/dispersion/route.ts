import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { empleados, nominaCorridas, nominaLineas } from '@/lib/db/schema';
import { generarArchivoDispersion } from '@/lib/nomina/dispersion';

export const dynamic = 'force-dynamic';

/**
 * GET /api/nomina/corridas/[id]/dispersion — arma y descarga el archivo de
 * dispersión bancaria de una corrida aprobada. El banco de cada empleado se
 * toma de su ficha ACTUAL (no del snapshot): la cuenta a la que se paga es la
 * vigente al momento de pagar. `?preview=1` devuelve JSON con el resumen en
 * vez del archivo (para mostrar antes de descargar).
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
    return NextResponse.json({ error: 'La corrida debe estar aprobada para dispersar' }, { status: 409 });
  }

  const filas = await db
    .select({
      empleadoId: nominaLineas.empleadoId,
      nombre: nominaLineas.nombre,
      cedula: nominaLineas.cedula,
      netoCents: nominaLineas.netoCents,
      bancoNombre: empleados.bancoNombre,
      bancoCuenta: empleados.bancoCuenta,
      bancoTipoCuenta: empleados.bancoTipoCuenta,
    })
    .from(nominaLineas)
    .innerJoin(empleados, eq(empleados.id, nominaLineas.empleadoId))
    .where(eq(nominaLineas.corridaId, id))
    .orderBy(asc(nominaLineas.nombre));

  const archivo = generarArchivoDispersion(filas, {
    periodo: corrida.periodo,
    referencia: `Nomina ${corrida.periodo}`,
  });

  const url = new URL(req.url);
  if (url.searchParams.get('preview') === '1') {
    return NextResponse.json({
      totalBeneficiarios: archivo.totalBeneficiarios,
      totalCents: archivo.totalCents,
      incompletos: archivo.incompletos,
      nombreArchivo: archivo.nombreArchivo,
    });
  }

  return new NextResponse(archivo.contenido, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${archivo.nombreArchivo}"`,
    },
  });
}

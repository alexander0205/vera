import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { empleados, nominaContratos, teams } from '@/lib/db/schema';
import { origenPublico } from '@/lib/http/origen-publico';
import { generarTokenFirma, hashTokenFirma } from '@/lib/nomina/firma';
import { enviarContratoFirmaEmail } from '@/lib/email/nomina';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nomina/contratos/[id]/enviar — habilita el contrato para firma,
 * devuelve el enlace público y, si el empleado tiene correo, se lo envía por
 * email. Genera un token nuevo (invalida el anterior si se reenvía). No se puede
 * reenviar uno ya firmado.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [contrato] = await db
    .select({
      id: nominaContratos.id,
      estado: nominaContratos.estado,
      titulo: nominaContratos.titulo,
      empleadoNombres: empleados.nombres,
      empleadoApellidos: empleados.apellidos,
      empleadoEmail: empleados.email,
      empresa: teams.razonSocial,
      empresaName: teams.name,
    })
    .from(nominaContratos)
    .innerJoin(empleados, eq(empleados.id, nominaContratos.empleadoId))
    .innerJoin(teams, eq(teams.id, nominaContratos.teamId))
    .where(and(eq(nominaContratos.id, id), eq(nominaContratos.teamId, auth.teamId)))
    .limit(1);

  if (!contrato) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 });
  if (contrato.estado === 'firmado') {
    return NextResponse.json({ error: 'El contrato ya está firmado' }, { status: 409 });
  }

  const token = generarTokenFirma();
  await db
    .update(nominaContratos)
    .set({ tokenHash: hashTokenFirma(token), enviadoEn: new Date(), estado: 'enviado' })
    .where(eq(nominaContratos.id, id));

  const url = `${origenPublico(req)}/firmar/${token}`;

  // Envío por correo: si el empleado tiene email, se lo mandamos. Un fallo del
  // correo NO rompe el flujo — el enlace ya se devolvió y se puede copiar a mano.
  let emailEnviado = false;
  const email = contrato.empleadoEmail?.trim();
  if (email) {
    try {
      await enviarContratoFirmaEmail({
        email,
        empleadoNombre: [contrato.empleadoNombres, contrato.empleadoApellidos].filter(Boolean).join(' ').trim(),
        empresaNombre: contrato.empresa ?? contrato.empresaName ?? 'La empresa',
        titulo: contrato.titulo,
        url,
      });
      emailEnviado = true;
    } catch (e) {
      console.error(`[POST /api/nomina/contratos/${id}/enviar] email`, e);
    }
  }

  return NextResponse.json({ url, emailEnviado, email: email ?? null });
}

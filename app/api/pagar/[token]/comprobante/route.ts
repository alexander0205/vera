/**
 * POST /api/pagar/[token]/comprobante — el padre sube su comprobante.
 *
 * Es la única ruta de escritura del sistema abierta SIN sesión, así que todo lo
 * que decide viene del token, nunca del cuerpo: el team, el responsable y los
 * cargos se leen de la base a partir del enlace. Del `FormData` solo se acepta
 * el archivo y tres campos de texto que no mandan sobre nada.
 *
 * Lo que este endpoint NO hace: bajar la deuda. Sube una foto y avisa al
 * colegio. El dinero se registra cuando alguien del colegio aprueba.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarComprobantes, teams, teamMembers, users } from '@/lib/db/schema';
import { resolverLink, marcarAcceso } from '@/lib/administracion-escolar/link-pago';
import { origenPublico } from '@/lib/http/origen-publico';
import { detectarTipo, ArchivoInvalidoError } from '@/lib/pagos/adjuntos';
import { s3Disponible, subirComprobante, construirKey } from '@/lib/storage/comprobantes';
import { enviarComprobanteRecibidoEmail } from '@/lib/email/escolar-avisos';

/** Lo que promete la pantalla: 5 MB. */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Tope de comprobantes pendientes por enlace.
 *
 * Sin esto, la ruta es un subidor de archivos anónimo: quien tenga un token
 * puede llenar el bucket. Cinco pendientes es más de lo que una familia
 * necesita —normalmente sube uno— y corta el abuso sin estorbar al padre que
 * tocó dos veces porque no vio la confirmación.
 */
const MAX_PENDIENTES = 5;

/**
 * A quién le llega el aviso. `teams` no tiene un correo de notificaciones, así
 * que se usa el del representante y, si está vacío, el del dueño de la cuenta:
 * el colegio que no llenó su ficha fiscal es justo el que menos va a mirar la
 * pantalla por su cuenta.
 */
async function correoDelColegio(teamId: number): Promise<string | null> {
  const [t] = await db
    .select({ correo: teams.correoRepresentante })
    .from(teams).where(eq(teams.id, teamId)).limit(1);
  if (t?.correo) return t.correo;

  const [dueno] = await db
    .select({ email: users.email })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'owner')))
    .limit(1);
  return dueno?.email ?? null;
}

function dinero(centavos: number): string {
  return `RD$${(centavos / 100).toLocaleString('es-DO', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Mismo acotado que la página: si el padre subió desde el enlace de UNA
  // factura, el comprobante toca solo los cargos de esa factura (y su tope es su
  // importe), no toda la deuda de la familia. `f` solo estrecha lo que el token
  // ya autoriza; `resolverLink` valida que la factura sea del responsable.
  const crudoF = request.nextUrl.searchParams.get('f');
  const facturaId = crudoF != null && /^\d+$/.test(crudoF) ? Number(crudoF) : undefined;

  const link = await resolverLink(token, facturaId);
  if (!link) return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 });

  if (!link.vista.transferencia.completo) {
    return NextResponse.json(
      { error: 'Este colegio todavía no tiene configurada su cuenta para recibir transferencias.' },
      { status: 409 },
    );
  }

  const [{ pendientes }] = await db
    .select({ pendientes: sql<number>`COUNT(*)::int` })
    .from(adminEscolarComprobantes)
    .where(and(
      eq(adminEscolarComprobantes.linkId, link.linkId),
      eq(adminEscolarComprobantes.estado, 'pendiente'),
    ));
  if (pendientes >= MAX_PENDIENTES) {
    return NextResponse.json(
      { error: 'Ya tienes comprobantes esperando revisión. Espera a que el colegio los apruebe.' },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'No se recibió el archivo' }, { status: 400 });
  }

  const archivo = form.get('archivo');
  if (!(archivo instanceof File) || archivo.size === 0) {
    return NextResponse.json({ error: 'Adjunta el comprobante' }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `El archivo pesa más de ${MAX_BYTES / 1024 / 1024} MB.` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  let tipo;
  try {
    // Por magic bytes: el Content-Type de un multipart lo escribe quien sube.
    tipo = detectarTipo(buffer);
  } catch (e) {
    const msg = e instanceof ArchivoInvalidoError ? e.message : 'Archivo no válido';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  /**
   * El monto lo dice el padre porque puede transferir de menos —la mitad de la
   * mensualidad— y forzarlo al total haría que el colegio aprobara una cifra
   * que nunca llegó al banco. Se acota entre 1 peso y lo que debe, para que no
   * entre un número absurdo por un dedo de más.
   */
  const pedido = Math.round(Number(form.get('monto') ?? 0) * 100);
  const tope = link.vista.totalCentavos;
  const montoCentavos = Number.isFinite(pedido) && pedido > 0
    ? Math.min(pedido, tope || pedido)
    : tope;
  if (montoCentavos <= 0) {
    return NextResponse.json({ error: 'No hay nada pendiente por pagar' }, { status: 409 });
  }

  const texto = (k: string, max: number) =>
    String(form.get(k) ?? '').trim().slice(0, max) || null;

  // Subir ANTES de insertar: si S3 falla, no queda una fila apuntando a un
  // archivo que no existe (el colegio vería un comprobante sin comprobante).
  let storage: 's3' | 'db' = 'db';
  let archivoKey: string | null = null;
  let archivoBase64: string | null = null;
  if (s3Disponible()) {
    archivoKey = construirKey(link.teamId, tipo.ext);
    await subirComprobante(archivoKey, buffer, tipo.mime);
    storage = 's3';
  } else {
    archivoBase64 = buffer.toString('base64');
  }

  const [fila] = await db.insert(adminEscolarComprobantes).values({
    teamId: link.teamId,
    linkId: link.linkId,
    clientId: link.clientId,
    montoCentavos,
    referencia: texto('referencia', 120) ?? link.referencia,
    bancoOrigen: texto('bancoOrigen', 120),
    nota: texto('nota', 500),
    storage,
    archivoKey,
    archivoBase64,
    archivoMime: tipo.mime,
    archivoNombre: (archivo.name || `comprobante.${tipo.ext}`).slice(0, 200),
    archivoBytes: buffer.length,
    cargos: link.vista.cargos.map((c) => ({
      cargoId: c.cargoId,
      estudiante: c.estudiante,
      concepto: c.concepto,
      montoCentavos: c.montoCentavos,
      fechaVencimiento: c.fechaVencimiento,
    })),
  }).returning({ id: adminEscolarComprobantes.id });

  await marcarAcceso(link.linkId);

  // El correo es el único empujón del flujo: sin él, el comprobante espera en
  // una pestaña que nadie abre mientras al padre le siguen saliendo avisos. Aun
  // así no tumba la subida — el padre ya hizo su parte y el comprobante está
  // guardado; que el colegio no se entere por correo es un problema del colegio.
  try {
    const destino = await correoDelColegio(link.teamId);
    if (destino) {
      // Del origen de esta petición: el colegio abre el enlace del correo en
      // el mismo sitio donde el padre acaba de subir el comprobante.
      const base = origenPublico(request);
      await enviarComprobanteRecibidoEmail({
        email: destino,
        colegio: link.vista.colegio.nombre,
        responsable: link.vista.responsable.nombre,
        estudiantes: link.vista.estudiantes,
        monto: dinero(montoCentavos),
        referencia: link.referencia,
        url: `${base}/escolar/pagos?tab=comprobantes`,
      });
    }
  } catch (e) {
    console.error('[comprobante] no se pudo avisar al colegio:', e);
  }

  return NextResponse.json({ ok: true, id: fila.id });
}

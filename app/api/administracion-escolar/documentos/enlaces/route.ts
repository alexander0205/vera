/**
 * Enlaces para que la familia suba documentos desde el móvil.
 *
 *   GET  ?matriculaId=123        → los que siguen vivos
 *   POST { matriculaId, requeridoId? } → crea uno y devuelve el QR
 *
 * `requeridoId` acota el enlace a UN documento; sin él vale para el expediente
 * entero. El token en claro se devuelve UNA vez, aquí: en la base solo queda su
 * SHA-256, así que no hay forma de recuperarlo después — se genera otro.
 */

import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarEstudianteTutores,
  adminEscolarEstudiantes,
  adminEscolarTutores,
  teams,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { checklistDeMatricula, contextoDeMatricula, requeridosPara } from '@/lib/administracion-escolar/documentos';
import { enviarEnlaceDocumentosEmail } from '@/lib/email/escolar-avisos';
import { registrarAvisoExpediente } from '@/lib/administracion-escolar/avisos-expediente';
import { crearEnlace, enlacesVivos, DIAS_VIGENCIA_ENLACE } from '@/lib/administracion-escolar/documentos-enlace';
import { origenPublico } from '@/lib/http/origen-publico';
import { rateLimitDb } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const matriculaId = Number(req.nextUrl.searchParams.get('matriculaId'));
  if (!Number.isInteger(matriculaId) || matriculaId <= 0) {
    return NextResponse.json({ error: 'matriculaId inválido' }, { status: 400 });
  }
  return NextResponse.json({ enlaces: await enlacesVivos(auth.teamId, matriculaId) });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  // Un enlace es una credencial: repartirlos a mansalva es lo que convierte una
  // fuga en un problema. Treinta por minuto cubre generar la tanda de una
  // matrícula entera y corta un script.
  const rl = await rateLimitDb(`documento-enlace:${auth.user.id}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiados enlaces seguidos. Espera un momento.' },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const matriculaId = Number(body.matriculaId);
  if (!Number.isInteger(matriculaId) || matriculaId <= 0) {
    return NextResponse.json({ error: 'matriculaId inválido' }, { status: 400 });
  }

  const contexto = await contextoDeMatricula(auth.teamId, matriculaId);
  if (!contexto) return NextResponse.json({ error: 'Matrícula no encontrada' }, { status: 404 });

  // El documento tiene que ser uno de los que de verdad se le exigen a ESTA
  // matrícula. Sin esta comprobación, el id de un requisito de otra empresa
  // —o de otro nivel— generaría un enlace válido apuntando a nada.
  let requeridoId: number | null = null;
  let nombreDocumento: string | null = null;
  if (body.requeridoId != null) {
    requeridoId = Number(body.requeridoId);
    if (!Number.isInteger(requeridoId) || requeridoId <= 0) {
      return NextResponse.json({ error: 'requeridoId inválido' }, { status: 400 });
    }
    // Con el listado elegido y los extras de ESTA matrícula: si no, un
    // documento colgado solo de este alumno no podría enlazarse, y el enlace
    // se generaba contra la lista deducida por nivel y no contra la que la
    // secretaria eligió al matricular.
    const requeridos = await requeridosPara(auth.teamId, contexto.nivel, contexto.listaId, matriculaId);
    const requerido = requeridos.find((r) => r.id === requeridoId);
    if (!requerido) {
      return NextResponse.json({ error: 'Ese documento no se exige en esta matrícula' }, { status: 404 });
    }
    nombreDocumento = requerido.nombre;
  }

  const { token, expiraEn, id } = await crearEnlace({
    teamId: auth.teamId,
    matriculaId,
    requeridoId,
    creadoPor: auth.user.id,
  });

  const base = `${origenPublico(req)}/d/${token}`;
  // Dos direcciones para el mismo enlace. El QR lleva `?c=1` y la página abre
  // la cámara sola: quien escanea con el móvil ya tiene el papel en la mano. El
  // enlace que se copia va limpio y ofrece elegir entre cámara y archivo, que
  // es lo que hace falta cuando se abre en un ordenador o el documento ya está
  // escaneado en el teléfono.
  const url = base;
  const urlCamara = `${base}?c=1`;
  const qr = await QRCode.toDataURL(urlCamara, { width: 320, margin: 1 });

  // A quién se le mandaría: el tutor responsable de pago, que es el contacto
  // del expediente. Va en la respuesta para que el diálogo lo proponga ya
  // escrito en vez de obligar a buscarlo en otra pantalla.
  const destino = await destinatarioSugerido(auth.teamId, contexto.estudianteId);

  // Enviarlo por correo es opcional y va en la misma llamada que lo crea: el
  // token en claro solo existe aquí, así que mandarlo después obligaría a
  // devolverlo al servidor desde el navegador.
  let enviadoA: string | null = null;
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (email) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'Correo inválido' }, { status: 400 });
    }
    const info = await datosParaCorreo(auth.teamId, matriculaId, contexto.estudianteId);
    await enviarEnlaceDocumentosEmail({
      email,
      colegio: info.colegio,
      tutor: destino?.nombre ?? null,
      estudiante: info.estudiante,
      // Con `requeridoId` se pidió UN documento; sin él, los que faltan de verdad.
      documentos: nombreDocumento ? [nombreDocumento] : info.pendientes,
      url,
      dias: DIAS_VIGENCIA_ENLACE,
    });
    enviadoA = email;

    // Que quede constancia: el día que la familia diga «a mí no me mandaron
    // nada», esto es lo que la secretaria abre.
    await registrarAvisoExpediente({
      teamId: auth.teamId,
      matriculaId,
      tipo: 'documentos',
      canal: 'correo',
      destino: email,
      detalle: nombreDocumento ?? 'Expediente completo',
    });
  }

  return NextResponse.json({
    id, token, url, urlCamara, qr,
    expiraEn: expiraEn.toISOString(),
    dias: DIAS_VIGENCIA_ENLACE,
    documento: nombreDocumento,
    emailSugerido: destino?.email ?? null,
    enviadoA,
  }, { status: 201 });
}

/** El tutor responsable de pago: el contacto del expediente. */
async function destinatarioSugerido(teamId: number, estudianteId: number) {
  const [fila] = await db
    .select({ nombre: adminEscolarTutores.nombre, email: adminEscolarTutores.email })
    .from(adminEscolarEstudianteTutores)
    .innerJoin(adminEscolarTutores, and(
      eq(adminEscolarEstudianteTutores.tutorId, adminEscolarTutores.id),
      eq(adminEscolarTutores.teamId, teamId),
    ))
    .where(and(
      eq(adminEscolarEstudianteTutores.teamId, teamId),
      eq(adminEscolarEstudianteTutores.estudianteId, estudianteId),
      eq(adminEscolarEstudianteTutores.responsablePago, true),
    ))
    .limit(1);
  return fila ?? null;
}

/** Lo que el correo nombra: el colegio, el alumno y lo que falta por subir. */
async function datosParaCorreo(teamId: number, matriculaId: number, estudianteId: number) {
  const [equipo, alumno, checklist] = await Promise.all([
    db.select({ nombre: teams.name }).from(teams).where(eq(teams.id, teamId)).limit(1),
    db.select({
      nombres: adminEscolarEstudiantes.nombres,
      apellidos: adminEscolarEstudiantes.apellidos,
    }).from(adminEscolarEstudiantes)
      .where(and(
        eq(adminEscolarEstudiantes.id, estudianteId),
        eq(adminEscolarEstudiantes.teamId, teamId),
      )).limit(1),
    checklistDeMatricula(teamId, matriculaId),
  ]);

  // "Pendiente" es lo que la familia todavía tiene que hacer: no ha subido
  // nada, o se le rechazó. Un documento subido y esperando aprobación NO se le
  // vuelve a pedir —ya cumplió—, y uno marcado «no aplica» tampoco.
  const pendientes = (checklist?.filas ?? [])
    .filter((f) => f.estado === 'pendiente' || f.estado === 'rechazado')
    .map((f) => f.nombre);

  return {
    colegio: equipo[0]?.nombre ?? 'El colegio',
    estudiante: [alumno[0]?.nombres, alumno[0]?.apellidos].filter(Boolean).join(' ').trim() || 'su hijo/a',
    pendientes,
  };
}

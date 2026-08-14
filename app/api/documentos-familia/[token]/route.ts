/**
 * Lo que usa el TELÉFONO de la familia. No hay sesión: el token del enlace es
 * toda la autorización, y por eso aquí se es especialmente desconfiado.
 *
 *   GET  /api/documentos-familia/<token>  → qué documentos hay que subir
 *   POST /api/documentos-familia/<token>  → sube un archivo a uno de ellos
 *
 * Tres reglas que no se aflojan:
 *  · lo que sube la familia entra como `recibido`, NUNCA como `aprobado`;
 *  · fuera del nombre de pila del alumno no sale ningún dato del menor — este
 *    JSON lo puede pedir cualquiera que tenga el enlace, y un enlace se
 *    reenvía;
 *  · el `requeridoId` que llega se comprueba contra lo que de verdad se le
 *    exige a esa matrícula, y contra el documento al que el enlace está
 *    acotado si lo está.
 *
 * Códigos: 401 token ausente o desconocido, 410 caducado o revocado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarDocumentosEntregados, adminEscolarEstudiantes } from '@/lib/db/schema';
import { resolverEnlace, marcarUso, type EnlaceResuelto } from '@/lib/administracion-escolar/documentos-enlace';
import { contextoDeMatricula, requeridosPara } from '@/lib/administracion-escolar/documentos';
import {
  agregarArchivo, listarArchivos, ArchivoInvalidoError, DemasiadosArchivosError,
} from '@/lib/administracion-escolar/documentos-archivo';
import { rateLimitDb } from '@/lib/rate-limit';

/** Solo el nombre de pila. Ni apellidos, ni cédula, ni fecha de nacimiento:
 *  basta para que el padre sepa que el enlace es del hijo correcto. */
async function nombreDePila(teamId: number, estudianteId: number): Promise<string> {
  const [e] = await db
    .select({ nombres: adminEscolarEstudiantes.nombres })
    .from(adminEscolarEstudiantes)
    .where(and(
      eq(adminEscolarEstudiantes.id, estudianteId),
      eq(adminEscolarEstudiantes.teamId, teamId),
    ))
    .limit(1);
  return (e?.nombres ?? '').trim().split(/\s+/)[0] || 'tu hijo/a';
}

async function abrir(token: string): Promise<
  { ok: true; enlace: EnlaceResuelto } | { ok: false; response: NextResponse }
> {
  const res = await resolverEnlace(token);
  if (res.ok) return { ok: true, enlace: res.enlace };
  // Token desconocido y token mal formado dan lo mismo: desde fuera no se
  // distingue si existió alguna vez.
  if (res.motivo === 'invalido') {
    return { ok: false, response: NextResponse.json({ error: 'Enlace no válido' }, { status: 401 }) };
  }
  return {
    ok: false,
    response: NextResponse.json({
      error: res.motivo === 'revocado'
        ? 'Este enlace ya no está activo. Pídele otro al colegio.'
        : 'El enlace caducó. Pídele otro al colegio.',
      estado: res.motivo,
    }, { status: 410 }),
  };
}

/** Los renglones que este enlace deja tocar, con lo que ya se subió pegado. */
async function renglones(enlace: EnlaceResuelto) {
  const contexto = await contextoDeMatricula(enlace.teamId, enlace.matriculaId);
  if (!contexto) return null;

  // Con el listado elegido y los papeles colgados de ESTA matrícula: sin ellos
  // la familia veía la lista deducida por nivel —no la que la secretaria eligió
  // al matricular— y nunca los documentos que se le pidieron solo a su hijo.
  let requeridos = await requeridosPara(
    enlace.teamId, contexto.nivel, contexto.listaId, enlace.matriculaId,
  );
  if (enlace.requeridoId != null) {
    requeridos = requeridos.filter((r) => r.id === enlace.requeridoId);
  }
  if (requeridos.length === 0) return { contexto, filas: [] };

  const entregados = await db
    .select({
      id: adminEscolarDocumentosEntregados.id,
      requeridoId: adminEscolarDocumentosEntregados.requeridoId,
      estado: adminEscolarDocumentosEntregados.estado,
    })
    .from(adminEscolarDocumentosEntregados)
    .where(and(
      eq(adminEscolarDocumentosEntregados.teamId, enlace.teamId),
      eq(adminEscolarDocumentosEntregados.matriculaId, enlace.matriculaId),
    ));

  const archivos = await listarArchivos(enlace.teamId, entregados.map((e) => e.id));
  const porRequerido = new Map(entregados.map((e) => [e.requeridoId, e]));

  const filas = requeridos.map((r) => {
    const e = porRequerido.get(r.id);
    const suyos = (e && archivos.get(e.id)) || [];
    return {
      requeridoId: r.id,
      nombre: r.nombre,
      // Lo que evita que mande una copia cuando se pide el original, y con ello
      // el viaje de vuelta.
      ayuda: r.ayuda,
      exigencia: r.exigencia,
      cantidad: r.cantidad,
      // Al padre no se le enseña "recibido/aprobado/rechazado": eso es la cocina
      // del colegio. Solo si ya mandó algo y cuántas fotos van.
      entregado: suyos.length > 0,
      archivos: suyos.length,
      // Rechazado sí se dice, con su motivo: es lo único que le pide que actúe.
      rechazado: e?.estado === 'rechazado',
      noAplica: e?.estado === 'no_aplica',
    };
  });

  return { contexto, filas };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const abierto = await abrir(token);
  if (!abierto.ok) return abierto.response;
  const { enlace } = abierto;

  const datos = await renglones(enlace);
  if (!datos) return NextResponse.json({ error: 'Enlace no válido' }, { status: 401 });

  await marcarUso(enlace.id);

  return NextResponse.json({
    estudiante: await nombreDePila(enlace.teamId, datos.contexto.estudianteId),
    unSoloDocumento: enlace.requeridoId != null,
    documentos: datos.filas,
    expiraEn: enlace.expiraEn.toISOString(),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const abierto = await abrir(token);
  if (!abierto.ok) return abierto.response;
  const { enlace } = abierto;

  // Por enlace, no por IP: varios padres pueden compartir la red del colegio, y
  // lo que hay que contener es el abuso de UN token filtrado.
  const rl = await rateLimitDb(`doc-familia:${enlace.id}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas subidas seguidas. Espera un momento e intenta de nuevo.' },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Se esperaba multipart/form-data' }, { status: 400 });
  }

  const requeridoId = Number(form.get('requeridoId'));
  if (!Number.isInteger(requeridoId) || requeridoId <= 0) {
    return NextResponse.json({ error: 'requeridoId inválido' }, { status: 400 });
  }
  // Un enlace acotado a un documento no sirve para subir a otro, aunque el otro
  // también se le exija a la matrícula.
  if (enlace.requeridoId != null && enlace.requeridoId !== requeridoId) {
    return NextResponse.json({ error: 'Este enlace no admite ese documento' }, { status: 403 });
  }

  const datos = await renglones(enlace);
  if (!datos || !datos.filas.some((f) => f.requeridoId === requeridoId)) {
    return NextResponse.json({ error: 'Ese documento no se pide en esta matrícula' }, { status: 404 });
  }

  const archivo = form.get('archivo');
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await archivo.arrayBuffer());

    const [fila] = await db
      .insert(adminEscolarDocumentosEntregados)
      .values({
        teamId: enlace.teamId,
        matriculaId: enlace.matriculaId,
        requeridoId,
        // Recibido, jamás aprobado: subir el papel y darlo por bueno son dos
        // actos de dos personas, y el segundo es del colegio.
        estado: 'recibido',
        subidoEn: new Date(),
        subidoPor: null,
        subidoFamilia: true,
        aprobadoEn: null,
        aprobadoPor: null,
        motivo: null,
      })
      .onConflictDoUpdate({
        target: [adminEscolarDocumentosEntregados.matriculaId, adminEscolarDocumentosEntregados.requeridoId],
        set: {
          estado: 'recibido',
          subidoEn: new Date(),
          subidoFamilia: true,
          aprobadoEn: null,
          aprobadoPor: null,
          motivo: null,
          updatedAt: new Date(),
        },
      })
      .returning();

    const guardado = await agregarArchivo({
      teamId: enlace.teamId,
      entregadoId: fila.id,
      buffer,
      nombreOriginal: limpiarNombre(archivo.name),
      subidoPor: null,
      subidoFamilia: true,
    });

    await marcarUso(enlace.id);
    return NextResponse.json({ ok: true, archivos: guardado.orden + 1 }, { status: 201 });
  } catch (e) {
    if (e instanceof ArchivoInvalidoError || e instanceof DemasiadosArchivosError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    console.error('[POST /api/documentos-familia]', e);
    return NextResponse.json({ error: 'No se pudo guardar el documento' }, { status: 500 });
  }
}

/** Quita rutas y caracteres de control del nombre que manda el cliente. */
function limpiarNombre(nombre: string): string {
  const base = (nombre.split(/[\\/]/).pop() ?? '')
    .replace(/[ -]/g, '')
    .replace(/[^\w.\- ]/g, '_')
    .trim()
    .slice(0, 200);
  return base || 'documento';
}

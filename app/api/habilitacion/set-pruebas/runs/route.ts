/**
 * GET  /api/habilitacion/set-pruebas/runs — lista corridas del team propio
 * POST /api/habilitacion/set-pruebas/runs — sube el Excel del Set de Pruebas
 *
 * Versión team-scoped de app/api/admin/empresas/[id]/set-pruebas/runs.
 * El contribuyente se resuelve por la columna `RNCEmisor` DENTRO del Excel
 * (no por el teamId) — la API key master autoriza la corrida. GET filtra
 * por el RNC del team propio, igual que la versión admin.
 *
 * Body POST: multipart/form-data con campo `file` (.xlsx, max 20MB)
 * Response POST: { importId, status }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ensureContribuyente, ContribuyenteCamposFaltantesError } from '@/lib/ecf-api/contribuyente';
import { contribuyentes, setPruebas, EcfApiError, type SetPruebasAmbiente } from '@/lib/ecf-api/client';
import { leerRncEmisores, normalizarRnc } from '@/lib/habilitacion/excel-rnc';

/** Mapea el ambiente de ecf-api (source of truth) al slug del endpoint set-pruebas. */
function mapAmbiente(ambiente: string | undefined): SetPruebasAmbiente | null {
  switch (ambiente) {
    case 'TesteCF': return 'testecf';
    case 'CerteCF': return 'certecf';
    default:        return null; // Produccion no soporta set de pruebas
  }
}

export async function GET() {
  // Habilitación e-CF toca el ambiente fiscal de la empresa: mismo permiso
  // con el que el nav ya gatea la pantalla. Sin esto, cualquier miembro con
  // sesión podía arrancarla por API aunque no viera el enlace.
  const auth = await requirePermission('configuracion:gestionar');
  if (!auth.ok) return auth.response;
  const teamId = auth.teamId;

  const [team] = await db.select({ rnc: teams.rnc }).from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });

  try {
    const all = await setPruebas.listRuns();
    const runs = team.rnc ? all.filter(r => r.rncEmisor === team.rnc) : [];
    return NextResponse.json({ runs });
  } catch (err) {
    if (err instanceof EcfApiError) {
      return NextResponse.json(
        { error: err.humanMessage || 'Error al listar corridas', code: err.code },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error('[habilitacion/set-pruebas/runs GET] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Habilitación e-CF toca el ambiente fiscal de la empresa: mismo permiso
  // con el que el nav ya gatea la pantalla. Sin esto, cualquier miembro con
  // sesión podía arrancarla por API aunque no viera el enlace.
  const auth = await requirePermission('configuracion:gestionar');
  if (!auth.ok) return auth.response;
  const teamId = auth.teamId;

  // Ambiente = source of truth en ecf-api (contrib.ambiente), NO copia local.
  let ambiente: SetPruebasAmbiente | null;
  try {
    const cp      = await ensureContribuyente(teamId);
    const contrib = await contribuyentes.get(cp);
    ambiente      = mapAmbiente(contrib.ambiente);
  } catch (err) {
    if (err instanceof ContribuyenteCamposFaltantesError) {
      return NextResponse.json(
        { error: 'Completa el perfil de la empresa antes de correr el set de pruebas.', camposFaltantes: err.faltantes },
        { status: 422 },
      );
    }
    if (err instanceof EcfApiError) {
      return NextResponse.json(
        { error: err.humanMessage || 'No se pudo resolver el contribuyente en ecf-api', code: err.code },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error('[habilitacion/set-pruebas/runs POST] resolver ambiente', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }

  if (!ambiente) {
    return NextResponse.json(
      { error: 'El Set de Pruebas solo aplica a ambientes TesteCF o CerteCF.' },
      { status: 422 },
    );
  }

  const incoming = await request.formData().catch(() => null);
  const file = incoming?.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo Excel (.xlsx)' }, { status: 400 });
  }

  const skipEncfs = (incoming?.get('skipEncfs') as string | null)?.trim() || undefined;

  // ── El Excel solo puede emitir bajo el RNC de la empresa que lo sube ───────
  // ecf-api resuelve el contribuyente por la columna `RNCEmisor` del archivo y
  // autoriza con la API key master: sin este chequeo, subir un Excel con el RNC
  // de otra empresa emite e-CF de prueba a la DGII bajo su RNC y le consume las
  // secuencias. El RNC de una empresa es público, así que no hay que adivinarlo.
  const [teamRnc] = await db
    .select({ rnc: teams.rnc })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!teamRnc?.rnc) {
    return NextResponse.json(
      { error: 'La empresa no tiene RNC configurado; complétalo antes de correr el Set de Pruebas.' },
      { status: 422 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let emisores: Set<string>;
  try {
    emisores = await leerRncEmisores(bytes);
  } catch (err) {
    console.error('[set-pruebas] no se pudo leer el Excel', err);
    return NextResponse.json(
      { error: 'No se pudo leer el archivo. Verifica que sea el Excel del Set de Pruebas (.xlsx).' },
      { status: 400 },
    );
  }

  const propio  = normalizarRnc(teamRnc.rnc);
  const ajenos  = [...emisores].filter(r => r !== propio);
  if (emisores.size === 0) {
    return NextResponse.json(
      { error: 'El archivo no tiene la columna RNCEmisor. Usa la plantilla del Set de Pruebas de la DGII.' },
      { status: 422 },
    );
  }
  if (ajenos.length > 0) {
    console.warn(`[set-pruebas] team ${teamId} (RNC ${propio}) intentó emitir con RNC ajeno: ${ajenos.join(', ')}`);
    return NextResponse.json(
      {
        error: `El archivo declara el RNC ${ajenos[0]} y esta empresa es ${propio}. `
             + 'Solo puedes correr el Set de Pruebas con el RNC de tu propia empresa.',
        rncAjeno: ajenos[0],
      },
      { status: 403 },
    );
  }

  const forward = new FormData();
  forward.append('file', new Blob([new Uint8Array(bytes)]), file.name);

  console.log(`[set-pruebas] team ${teamId} subiendo "${file.name}" · ambiente=${ambiente}${skipEncfs ? ` · skip=${skipEncfs}` : ''}`);

  try {
    const result = await setPruebas.startRun(ambiente, forward, skipEncfs);
    console.log(`[set-pruebas] team ${teamId} corrida iniciada: importId=${result.importId} status=${result.status}`);
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    if (err instanceof EcfApiError) {
      console.error('[habilitacion/set-pruebas/runs POST]', err.status, err.humanMessage);
      return NextResponse.json(
        { error: err.humanMessage || 'Error al iniciar el set de pruebas', code: err.code },
        { status: err.status === 404 || err.status === 422 ? err.status : 502 },
      );
    }
    console.error('[habilitacion/set-pruebas/runs POST] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

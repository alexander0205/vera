/**
 * POST /api/admin/empresas/[id]/set-pruebas/runs
 *
 * Sube el Excel del Set de Pruebas DGII y arranca la emisión async.
 * El contribuyente se resuelve por la columna `RNCEmisor` DENTRO del Excel
 * (no por el teamId del path) — la API key master autoriza la corrida.
 *
 * El path [id] solo se usa para auth + resolver el ambiente del team.
 *
 * Body: multipart/form-data con campo `file` (.xlsx, max 20MB)
 * Response: { importId, status }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { ensureContribuyente, ContribuyenteCamposFaltantesError } from '@/lib/ecf-api/contribuyente';
import { contribuyentes, setPruebas, EcfApiError, type SetPruebasAmbiente } from '@/lib/ecf-api/client';

/** Mapea el ambiente de ecf-api (source of truth) al slug del endpoint set-pruebas. */
function mapAmbiente(ambiente: string | undefined): SetPruebasAmbiente | null {
  switch (ambiente) {
    case 'TesteCF': return 'testecf';
    case 'CerteCF': return 'certecf';
    default:        return null; // Produccion no soporta set de pruebas
  }
}

/**
 * GET /api/admin/empresas/[id]/set-pruebas/runs
 * Lista corridas filtradas por el RNC de la empresa (para detectar duplicados).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (user.platformRole !== 'admin') {
    return NextResponse.json({ error: 'Acceso restringido a administradores' }, { status: 403 });
  }

  const { id } = await params;
  const teamId = parseInt(id, 10);
  if (isNaN(teamId)) return NextResponse.json({ error: 'teamId inválido' }, { status: 400 });

  const [team] = await db.select({ rnc: teams.rnc }).from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });

  try {
    const all = await setPruebas.listRuns();
    const runs = team.rnc ? all.filter(r => r.rncEmisor === team.rnc) : all;
    return NextResponse.json({ runs });
  } catch (err) {
    if (err instanceof EcfApiError) {
      return NextResponse.json(
        { error: err.humanMessage || 'Error al listar corridas', code: err.code },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error('[admin/set-pruebas/runs GET] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (user.platformRole !== 'admin') {
    return NextResponse.json({ error: 'Acceso restringido a administradores' }, { status: 403 });
  }

  const { id } = await params;
  const teamId = parseInt(id, 10);
  if (isNaN(teamId)) return NextResponse.json({ error: 'teamId inválido' }, { status: 400 });

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
    console.error('[admin/set-pruebas/runs POST] resolver ambiente', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }

  if (!ambiente) {
    return NextResponse.json(
      { error: 'El Set de Pruebas solo aplica a ambientes TesteCF o CerteCF.' },
      { status: 422 },
    );
  }

  // Leer el archivo del multipart entrante
  const incoming = await request.formData().catch(() => null);
  const file = incoming?.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo Excel (.xlsx)' }, { status: 400 });
  }

  // e-NCFs a excluir (CSV) — para re-correr solo los que fallaron
  const skipEncfs = (incoming?.get('skipEncfs') as string | null)?.trim() || undefined;

  // Reenviar a ecf-api con la API key master
  const forward = new FormData();
  forward.append('file', file, file.name);

  try {
    const result = await setPruebas.startRun(ambiente, forward, skipEncfs);
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    if (err instanceof EcfApiError) {
      console.error('[admin/set-pruebas/runs POST]', err.status, err.humanMessage);
      return NextResponse.json(
        { error: err.humanMessage || 'Error al iniciar el set de pruebas', code: err.code },
        { status: err.status === 404 || err.status === 422 ? err.status : 502 },
      );
    }
    console.error('[admin/set-pruebas/runs POST] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

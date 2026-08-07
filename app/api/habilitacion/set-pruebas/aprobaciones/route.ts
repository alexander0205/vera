/**
 * POST /api/habilitacion/set-pruebas/aprobaciones
 *
 * Paso 3 (ACECF): sube el Excel de Aprobaciones Comerciales (hoja
 * ACEECF_Generadas) y procesa el batch SÍNCRONO contra DGII. El RNCComprador
 * se deriva del Excel; la API key master autoriza.
 *
 * Versión team-scoped de app/api/admin/empresas/[id]/set-pruebas/aprobaciones.
 * Body: multipart/form-data { file: .xlsx, secShift?, secShiftEncfs? }
 * Response: { total, ok, failed, rows[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { ensureContribuyente, ContribuyenteCamposFaltantesError } from '@/lib/ecf-api/contribuyente';
import { contribuyentes, setPruebas, EcfApiError, type SetPruebasAmbiente } from '@/lib/ecf-api/client';

function mapAmbiente(ambiente: string | undefined): SetPruebasAmbiente | null {
  switch (ambiente) {
    case 'TesteCF': return 'testecf';
    case 'CerteCF': return 'certecf';
    default:        return null;
  }
}

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

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
    console.error('[habilitacion/set-pruebas/aprobaciones POST] resolver ambiente', err);
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

  const secShiftRaw   = (incoming?.get('secShift') as string | null)?.trim();
  const secShiftEncfs = (incoming?.get('secShiftEncfs') as string | null)?.trim() || undefined;
  const secShift       = secShiftRaw ? Number(secShiftRaw) : undefined;

  const forward = new FormData();
  forward.append('file', file, file.name);

  console.log(`[aprobaciones] team ${teamId} subiendo "${file.name}" · ambiente=${ambiente}`);

  try {
    const result = await setPruebas.startAprobaciones(ambiente, forward, {
      secShift: Number.isFinite(secShift) ? secShift : undefined,
      secShiftEncfs,
    });
    console.log(`[aprobaciones] team ${teamId} resultado: total=${result.total} ok=${result.ok} failed=${result.failed}`);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof EcfApiError) {
      console.error('[habilitacion/set-pruebas/aprobaciones POST]', err.status, err.humanMessage);
      return NextResponse.json(
        { error: err.humanMessage || 'Error al procesar las aprobaciones', code: err.code },
        { status: err.status === 404 || err.status === 422 ? err.status : 502 },
      );
    }
    console.error('[habilitacion/set-pruebas/aprobaciones POST] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

/**
 * GET /api/ecf/urls-dgii
 *
 * Devuelve la webhookBaseUrl que ecf-api asigna al contribuyente.
 * Esa URL es la que el usuario registra en el portal DGII para
 * recepción, autenticación y aprobación comercial.
 *
 * Siempre se consulta en tiempo real desde ecf-api (nunca se persiste).
 */

import { NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { contribuyentes, EcfApiError } from '@/lib/ecf-api/client';
import { ensureContribuyente, ContribuyenteCamposFaltantesError } from '@/lib/ecf-api/contribuyente';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

  let codigoPublico: string;
  try {
    codigoPublico = await ensureContribuyente(teamId);
  } catch (err) {
    if (err instanceof ContribuyenteCamposFaltantesError) {
      return NextResponse.json({ error: 'Perfil incompleto', camposFaltantes: err.faltantes }, { status: 422 });
    }
    console.error('[GET /api/ecf/urls-dgii] ensureContribuyente', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }

  try {
    const contribuyente = await contribuyentes.get(codigoPublico);
    const webhookBaseUrl = contribuyente.urlsDgii?.webhookBaseUrl ?? '';

    return NextResponse.json({ webhookBaseUrl });
  } catch (err) {
    if (err instanceof EcfApiError) {
      console.error('[GET /api/ecf/urls-dgii] ecf-api', err.status, err.message);
    } else {
      console.error('[GET /api/ecf/urls-dgii]', err);
    }
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

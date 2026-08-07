/**
 * GET /api/habilitacion/contexto
 *
 * Datos que necesita el stepper de habilitación de 15 pasos para el team
 * propio: codigoPublico, rnc, ambiente, webhookBaseUrl y el software
 * registrado en ecf-api. Equivalente a lo que app/admin/empresas/[id]/page.tsx
 * ya resuelve para el platform-admin, pero acotado al team del usuario.
 */

import { NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { contribuyentes, me, EcfApiError } from '@/lib/ecf-api/client';
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
    console.error('[GET /api/habilitacion/contexto] ensureContribuyente', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }

  try {
    const contrib = await contribuyentes.get(codigoPublico);

    // `/me` es solo metadata de software para mostrar en pantalla — si esa
    // instancia de ecf-api no la implementa (404) u otro error, no bloquea
    // el resto del contexto, que es lo que realmente hace falta.
    let software: { nombre: string; version: string; ambienteDefault: string } | null = null;
    try {
      software = (await me()).software;
    } catch (err) {
      console.error('[GET /api/habilitacion/contexto] me() falló (no bloqueante)', err);
    }

    // ecf-api cachea el dominio en `urlsDgii.webhookBaseUrl` al crear el
    // contribuyente — si ECF_API_URL cambió de dominio después, el valor
    // queda desactualizado. Reconstruimos con el dominio ACTUAL de
    // ECF_API_URL, conservando el resto del path que ecf-api arma (ej. "/fe/{cp}").
    let webhookBaseUrl = contrib.urlsDgii?.webhookBaseUrl ?? null;
    if (webhookBaseUrl) {
      const dominioActual = new URL(process.env.ECF_API_URL!).host;
      const path = webhookBaseUrl.replace(/^[^/]+/, ''); // quita el dominio viejo, deja "/fe/{cp}"
      webhookBaseUrl = `${dominioActual}${path}`;
    }

    return NextResponse.json({
      teamId,
      codigoPublico: contrib.codigoPublico,
      rnc:           contrib.rnc,
      ambiente:      contrib.ambiente,
      webhookBaseUrl,
      software,
    });
  } catch (err) {
    if (err instanceof EcfApiError) {
      console.error('[GET /api/habilitacion/contexto] ecf-api', err.status, err.humanMessage);
      return NextResponse.json(
        { error: err.humanMessage || 'Error al consultar ecf-api', code: err.code },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error('[GET /api/habilitacion/contexto] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

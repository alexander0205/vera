import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { SigerdClient } from '@/lib/sigerd/client';
import {
  catalogoPuestos,
  contextoCentroSesion,
  personalDeCentro,
} from '@/lib/sigerd/personal';
import { conSesionSigerd } from '@/lib/sigerd/ruta';

export const dynamic = 'force-dynamic';

/**
 * Personal del centro de la sesión SIGERD.
 *
 * `GET /api/sigerd/personal`                  → empleados del centro
 * `GET /api/sigerd/personal?idCargo=1`        → filtrado por cargo
 * `GET /api/sigerd/personal?nombre=...`       → filtrado por nombre
 * `GET /api/sigerd/personal?catalogo=puestos` → los 168 cargos, sin datos personales
 *
 * SIEMPRE acotado al centro del Digitador: el trío regional/distrito/centro se
 * lee de la sesión del portal, no se acepta del cliente. Sin ese trío el grid
 * del MINERD devolvería el padrón nacional, así que no hay forma de pedir "otro
 * centro" ni "todos" por esta ruta — es intencional.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;

  if (sp.get('catalogo') === 'puestos') {
    return conSesionSigerd((cli) => catalogoPuestos(cli));
  }

  const idCargo = Number(sp.get('idCargo')) || undefined;
  const nombre = sp.get('nombre') ?? undefined;
  const cedula = sp.get('cedula') ?? undefined;

  return conSesionSigerd(async (cli: SigerdClient) => {
    const ctx = await contextoCentroSesion(cli);
    const empleados = await personalDeCentro(cli, ctx, { idCargo, nombre, cedula });
    return { centro: ctx.idCentro, total: empleados.length, empleados };
  });
}

/**
 * GET /api/administracion-escolar/comprobantes?estado=pendiente
 *   → { comprobantes, cuentasBanco }
 *
 * `cuentasBanco` son las cuentas activas del colegio, para el selector «Banco
 * donde entró el dinero» de la pantalla de aprobar. Van aquí y no en
 * `/api/cuentas-banco` porque aquel pide el permiso de ver pagos y esta pantalla
 * pide el de administración escolar: quien aprueba comprobantes tiene que poder
 * ver sus propios bancos sin depender de un permiso más.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { listarComprobantes } from '@/lib/administracion-escolar/comprobantes';
import { cuentasBancoActivas } from '@/lib/pagos/cuentas-banco';

const ESTADOS = ['pendiente', 'aprobado', 'rechazado'] as const;
type Estado = (typeof ESTADOS)[number];

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const crudo = req.nextUrl.searchParams.get('estado');
  const estado = ESTADOS.includes(crudo as Estado) ? (crudo as Estado) : undefined;

  const [comprobantes, cuentasBanco] = await Promise.all([
    listarComprobantes(auth.teamId, estado),
    cuentasBancoActivas(auth.teamId),
  ]);
  return NextResponse.json({ comprobantes, cuentasBanco });
}

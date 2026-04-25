/**
 * GET /api/secuencias/proximo?tipo=31
 *
 * Devuelve el próximo e-NCF disponible para el equipo sin consumirlo.
 * Usa ecf-api como fuente de verdad (NcfRango.siguienteENCF).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { ncfRangos } from '@/lib/ecf-api/client';
import {
  ensureContribuyente,
  ContribuyenteCamposFaltantesError,
} from '@/lib/ecf-api/contribuyente';

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const tipo = req.nextUrl.searchParams.get('tipo') ?? '31';

  if (tipo === 'sin-ncf') {
    return NextResponse.json({ encf: null, sinNcf: true, disponibles: -1, agotada: false });
  }

  try {
    const codigoPublico = await ensureContribuyente(teamId);
    const rangos = await ncfRangos.list(codigoPublico);

    const now = new Date();
    const activos = rangos.filter(
      r =>
        r.tipoComprobante === tipo &&
        r.activo &&
        r.capacidadDisponible > 0 &&
        new Date(r.fechaVencimiento) >= now,
    );

    if (activos.length === 0) {
      const hayDelTipo = rangos.some(r => r.tipoComprobante === tipo);
      return NextResponse.json({
        encf:         null,
        disponibles:  0,
        agotada:      hayDelTipo,
        sinSecuencia: !hayDelTipo,
        mensaje:      hayDelTipo
          ? `El rango para tipo ${tipo} está agotado o vencido`
          : `No hay rangos registrados para tipo ${tipo}`,
      });
    }

    // Preferir el que más disponibles tenga
    const mejor = activos.sort((a, b) => b.capacidadDisponible - a.capacidadDisponible)[0];

    return NextResponse.json({
      id:               mejor.id,
      encf:             mejor.siguienteENCF,
      numero:           mejor.siguiente,
      hasta:            mejor.hasta,
      disponibles:      mejor.capacidadDisponible,
      agotada:          false,
      vencida:          false,
      fechaVencimiento: mejor.fechaVencimiento,
    });
  } catch (err) {
    if (err instanceof ContribuyenteCamposFaltantesError) {
      return NextResponse.json(
        { error: 'campos_faltantes', faltantes: err.faltantes },
        { status: 422 },
      );
    }
    console.error('[secuencias/proximo GET]', err);
    return NextResponse.json({ error: 'Error al obtener próximo e-NCF' }, { status: 500 });
  }
}

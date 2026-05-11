/**
 * POST /api/ecf/preview
 *
 * Modo debug: recibe el mismo body que /api/ecf/emitir pero
 * solo corre el mapper y devuelve el DTO exacto que se enviaría
 * a ecf-api — sin firmar, sin enviar a DGII.
 *
 * Útil para verificar el payload antes de emitir.
 */

import { NextRequest, NextResponse } from 'next/server';
import { calcularTotales } from '@/lib/ecf/types';
import { mapToEcfApiDto } from '@/lib/ecf-api/emision-mapper';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const {
    tipoEcf,
    items = [],
    rncComprador,
    razonSocialComprador,
    emailComprador,
    tipoPago = 1,
    fechaLimitePago,
    ncfModificado,
    codigoModificacion,
    encfOverride,
    skipRangeValidation,
  } = body;

  if (!tipoEcf || !items.length) {
    return NextResponse.json({ error: 'tipoEcf e items son requeridos' }, { status: 400 });
  }

  const totales = calcularTotales(items);

  const { tipo, esRfce, dto } = mapToEcfApiDto({
    tipoEcf,
    items,
    totales,
    rncComprador,
    razonSocialComprador,
    emailComprador,
    tipoPago,
    fechaLimitePago,
    ncfModificado,
    codigoModificacion,
    encfOverride,
    skipRangeValidation,
  });

  return NextResponse.json({
    tipo,
    esRfce,
    endpoint: esRfce
      ? `/contribuyentes/{cp}/emision/rfce32`
      : `/contribuyentes/{cp}/emision/ecf${tipo}`,
    dto,
    totales,
  });
}

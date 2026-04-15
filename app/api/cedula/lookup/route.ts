/**
 * GET /api/cedula/lookup?cedula=XXXXXXXXXXX
 *
 * Consulta la API pública de OGTIC (Gobierno Digital RD) para obtener
 * el nombre del titular de una cédula dominicana.
 *
 * API: https://api.digital.gob.do/v3/cedulas/{cedula}
 * No requiere API key — es pública.
 */

import { NextRequest, NextResponse } from 'next/server';

// Limpia la cédula: quita guiones y espacios, deja solo dígitos
function limpiarCedula(raw: string): string {
  return raw.replace(/[-\s]/g, '');
}

// Formatea: 40221145045 → 402-2114504-5
function formatearCedula(digits: string): string {
  if (digits.length !== 11) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`;
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('cedula')?.trim() ?? '';
  const cedula = limpiarCedula(raw);

  if (!/^\d{11}$/.test(cedula)) {
    return NextResponse.json({ error: 'Cédula inválida (debe tener 11 dígitos)' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.digital.gob.do/v3/cedulas/${cedula}`, {
      headers: { 'Accept': 'application/json' },
      // 5 segundos de timeout
      signal: AbortSignal.timeout(5000),
    });

    if (res.status === 404) {
      // Cédula no encontrada en OGTIC — devolvemos solo el número formateado
      return NextResponse.json({
        cedula:    formatearCedula(cedula),
        cedulaRaw: cedula,
        nombre:    null,
        encontrado: false,
      });
    }

    if (!res.ok) {
      throw new Error(`OGTIC API error: ${res.status}`);
    }

    const data = await res.json();

    // La respuesta trae: nombres, primerApellido, segundoApellido, cedula
    const nombres    = [data.nombres, data.primerApellido, data.segundoApellido]
      .filter(Boolean)
      .join(' ')
      .trim();

    return NextResponse.json({
      cedula:     formatearCedula(cedula),
      cedulaRaw:  cedula,
      nombre:     nombres || null,
      encontrado: true,
    });
  } catch (err: unknown) {
    // Si la API de OGTIC falla, devolvemos el número sin nombre
    console.warn('[/api/cedula/lookup] OGTIC unavailable:', err);
    return NextResponse.json({
      cedula:     formatearCedula(cedula),
      cedulaRaw:  cedula,
      nombre:     null,
      encontrado: false,
    });
  }
}

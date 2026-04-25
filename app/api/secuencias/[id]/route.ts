/**
 * Las secuencias ahora viven en ecf-api.
 * Editar/eliminar rangos no está soportado via API key de cliente.
 */
import { NextResponse } from 'next/server';

export async function PATCH() {
  return NextResponse.json(
    { error: 'Los rangos no pueden editarse. Gestiónalos directamente en ecf-api.' },
    { status: 405 },
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Los rangos no pueden editarse. Gestiónalos directamente en ecf-api.' },
    { status: 405 },
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Los rangos no pueden eliminarse. Gestiónalos directamente en ecf-api.' },
    { status: 405 },
  );
}

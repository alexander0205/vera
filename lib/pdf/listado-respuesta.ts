/**
 * Lo que comparten las rutas que exportan un listado a PDF: el nombre de la
 * empresa para el encabezado y la respuesta HTTP (descarga o visor).
 */
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { ListadoPDF, type ListadoPDFData } from './ListadoPDF';

export async function empresaParaPdf(teamId: number): Promise<{ empresa: string; rnc: string | null }> {
  const [t] = await db.select({ name: teams.name, razonSocial: teams.razonSocial, rnc: teams.rnc })
    .from(teams).where(eq(teams.id, teamId)).limit(1);
  return { empresa: t?.razonSocial || t?.name || 'Empresa', rnc: t?.rnc ?? null };
}

/** `inline` abre el PDF en el visor del navegador (botón «Imprimir»); si no, se descarga. */
export async function respuestaListadoPdf(data: ListadoPDFData, filename: string, inline: boolean): Promise<NextResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(createElement(ListadoPDF, { data }) as any);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

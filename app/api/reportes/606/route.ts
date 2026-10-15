/**
 * Formato 606 — Compras de bienes y servicios (Norma General 07-2018, DGII).
 *
 * Reúne dos fuentes del período:
 *
 *   1. Los comprobantes de proveedores registrados en Compras y Gastos
 *      (compras_locales, no anulados), con su tipo de bienes, montos de
 *      servicios y bienes, ITBIS al costo y retenciones. Los de consumo (B02/E32)
 *      no se reportan.
 *   2. Los comprobantes que emite la propia empresa: compras a informales (e41),
 *      gastos menores (e43, con el RNC de la empresa y sin adelanto de ITBIS) y
 *      pagos al exterior (e47), solo si ya se emitieron a la DGII.
 *
 * La lectura está en lib/compras/cargar606.ts. Las líneas se arman en lib/compras/fiscal.ts (lineaFormato606) y el archivo en
 * lib/compras/formato606.ts. Archivo: DGII_F_606_{RNC}_{AAAAMM}.TXT, CRLF.
 */
import { NextRequest } from 'next/server';
import { getTeamIdForUser, getTeamProfile } from '@/lib/db/queries';
import { cargarCompras606 } from '@/lib/compras/cargar606';
import { construirFormato606 } from '@/lib/compras/formato606';
import { rangoDelMes } from '@/lib/nomina/periodos';

export async function GET(req: NextRequest) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return new Response('No autorizado', { status: 401 });

  const sp = req.nextUrl.searchParams;
  const anio = sp.get('anio') ?? String(new Date().getFullYear());
  const mes = (sp.get('mes') ?? String(new Date().getMonth() + 1)).padStart(2, '0');
  if (!/^\d{4}$/.test(anio) || !/^(0[1-9]|1[0-2])$/.test(mes)) return new Response('Período inválido', { status: 400 });
  const { inicio, fin } = rangoDelMes(`${anio}-${mes}`);

  const [team, compras] = await Promise.all([
    getTeamProfile(teamId),
    cargarCompras606(teamId, inicio, fin),
  ]);

  const archivo = construirFormato606({ rncEmpresa: team?.rnc ?? '', periodo: `${anio}${mes}`, compras });

  return new Response(archivo.contenido, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${archivo.nombreArchivo}"`,
    },
  });
}

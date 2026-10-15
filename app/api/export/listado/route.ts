/**
 * POST /api/export/listado — pinta a PDF o Excel un listado que manda la
 * pantalla, con las filas tal como se ven (filtradas, ordenadas, agrupadas).
 *
 * Lo usa `DataTable` con su prop `exportar`. No lee datos del negocio: solo el
 * nombre de la empresa para el encabezado. Lo que se exporta es lo que el
 * usuario ya tiene en pantalla, así que basta con que haya sesión.
 * Contrato y validación: `lib/export/listado`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { validarEnvio, totalesEnvio, anchosPorcentaje, type CeldaEnvio } from '@/lib/export/listado';
import { DOP, nuevaHoja, estilarEncabezado, respuestaXlsx } from '@/lib/contabilidad/export-xlsx';
import { empresaParaPdf, respuestaListadoPdf } from '@/lib/pdf/listado-respuesta';
import type { CeldaPDF } from '@/lib/pdf/ListadoPDF';
import { fmtDOP, fmtFechaCorta, hoyRD } from '@/lib/utils/format';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 });

  const e = validarEnvio(await req.json().catch(() => null));
  if (!e) return NextResponse.json({ error: 'Listado inválido o demasiado grande' }, { status: 400 });

  const hoy = hoyRD();
  const todas = e.grupos.flatMap((g) => g.filas);
  const totales = totalesEnvio(e, todas);
  const hayTotales = Object.keys(totales).length > 0;
  const vivas = todas.filter((f) => !f.tachada).length;
  const agrupado = e.grupos.some((g) => g.titulo);

  if (e.formato === 'pdf') {
    const anchos = anchosPorcentaje(e.columnas);
    const fmt = (v: CeldaEnvio, tipo: string | undefined): CeldaPDF => {
      if (v == null) return '—';
      if (typeof v === 'object') return v;
      if (tipo === 'moneda') return fmtDOP(Number(v));
      if (tipo === 'numero') return Number(v).toLocaleString('es-DO');
      return String(v);
    };
    const resumenGrupo = (filas: typeof todas) => {
      const t = totalesEnvio(e, filas);
      const montos = Object.entries(t).map(([i, v]) => (e.columnas[+i].tipo === 'moneda' ? fmtDOP(v) : v.toLocaleString('es-DO')));
      return [`${filas.length} registro${filas.length === 1 ? '' : 's'}`, ...montos].join(' · ');
    };
    const { empresa, rnc } = await empresaParaPdf(teamId);
    return respuestaListadoPdf({
      empresa, rnc,
      titulo: e.titulo,
      filtroTexto: e.filtroTexto,
      generado: fmtFechaCorta(hoy),
      kpis: e.kpis ?? [],
      columnas: e.columnas.map((c, i) => ({
        titulo: c.titulo, ancho: anchos[i], alinear: c.tipo === 'texto' ? 'left' : 'right', negrita: c.total,
      })),
      grupos: e.grupos.map((g) => ({
        titulo: g.titulo ?? undefined,
        resumen: g.titulo ? resumenGrupo(g.filas) : undefined,
        filas: g.filas.map((f) => ({ tachada: f.tachada, celdas: f.celdas.map((v, i) => fmt(v, e.columnas[i].tipo)) })),
      })),
      totales: {
        etiqueta: `Total · ${vivas} registro${vivas === 1 ? '' : 's'}${todas.length > vivas ? ' (sin anulados)' : ''}`,
        valores: Object.fromEntries(Object.entries(totales).map(([i, v]) => [i, e.columnas[+i].tipo === 'moneda' ? fmtDOP(v) : v.toLocaleString('es-DO')])),
      },
    }, `${e.archivo}_${hoy}.pdf`, e.inline === true);
  }

  const { wb, ws } = nuevaHoja(e.titulo.slice(0, 31));
  // Celdas con segunda línea (el RNC bajo el nombre…) van en su propia columna.
  const conSub = e.columnas.map((_, i) => todas.some((f) => {
    const c = f.celdas[i];
    return c != null && typeof c === 'object' && !!c.sub;
  }));
  ws.columns = e.columnas.flatMap((c, i) => [
    { header: c.titulo, key: `c${i}`, width: Math.round(10 + (c.ancho ?? 1) * 8), ...(c.tipo === 'moneda' ? { style: { numFmt: DOP } } : {}) },
    ...(conSub[i] ? [{ header: `${c.titulo} (detalle)`, key: `s${i}`, width: 18 }] : []),
  ]);
  estilarEncabezado(ws);
  const valorXlsx = (v: CeldaEnvio, tipo: string | undefined) => {
    if (v == null) return '';
    if (typeof v === 'object') return v.texto;
    if (tipo === 'moneda') return Number(v) / 100;
    return v;
  };
  for (const g of e.grupos) {
    if (g.titulo) {
      const t = totalesEnvio(e, g.filas);
      const cab = ws.addRow({ c0: `${g.titulo} · ${g.filas.length}`, ...Object.fromEntries(Object.entries(t).map(([i, v]) => [`c${i}`, e.columnas[+i].tipo === 'moneda' ? v / 100 : v])) });
      cab.font = { bold: true };
      cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    }
    for (const f of g.filas) {
      const row: Record<string, unknown> = {};
      f.celdas.forEach((v, i) => {
        row[`c${i}`] = valorXlsx(v, e.columnas[i].tipo);
        if (conSub[i] && v != null && typeof v === 'object') row[`s${i}`] = v.sub ?? '';
      });
      const r = ws.addRow(row);
      if (f.tachada) r.font = { color: { argb: 'FF9CA3AF' }, strike: true };
    }
  }
  ws.addRow({});
  if (hayTotales || todas.length) {
    const tot = ws.addRow({
      c0: `Total · ${vivas} registro${vivas === 1 ? '' : 's'}${todas.length > vivas ? ' (sin anulados)' : ''}`,
      ...Object.fromEntries(Object.entries(totales).map(([i, v]) => [`c${i}`, e.columnas[+i].tipo === 'moneda' ? v / 100 : v])),
    });
    tot.font = { bold: true };
  }
  for (const k of e.kpis ?? []) ws.addRow({ c0: `${k.label}: ${k.valor}${k.sub ? ` (${k.sub})` : ''}` });
  ws.addRow({ c0: e.filtroTexto });
  if (agrupado) ws.addRow({ c0: 'Agrupado como en pantalla; los subtotales van en la fila de cada grupo.' });

  return respuestaXlsx(wb, `${e.archivo}_${hoy}.xlsx`);
}

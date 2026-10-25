/**
 * La hoja de carga de «Servicios por alumno».
 *
 *   GET  → la cuadrícula en Excel: una fila por alumno matriculado y una
 *          columna por concepto, con X en lo que cobra. Es la que se le manda
 *          al colegio para que la complete.
 *   POST (multipart `archivo`) → lee la hoja completada y devuelve los cambios
 *          que pide, SIN guardarlos: la pantalla los enseña en la cuadrícula
 *          para revisarlos antes de «Guardar cambios».
 */
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { leerServiciosAlumnos } from '@/lib/administracion-escolar/servicios-alumnos-datos';
import { COLUMNAS_FIJAS, cambiosDesdeHoja } from '@/lib/administracion-escolar/servicios-alumnos';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const datos = await leerServiciosAlumnos(auth.teamId, Number(new URL(req.url).searchParams.get('periodoId')) || 0);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Servicios');
  ws.columns = [
    ...COLUMNAS_FIJAS.map((h) => ({ header: h, width: h === 'Alumno' ? 36 : h === 'ID matrícula' ? 12 : 16 })),
    ...datos.conceptos.map((c) => ({ header: c.nombre, width: Math.max(12, Math.min(28, c.nombre.length + 2)) })),
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { wrapText: true, vertical: 'middle' };
  ws.views = [{ state: 'frozen', xSplit: COLUMNAS_FIJAS.length, ySplit: 1 }];
  for (const f of datos.filas) {
    const row = ws.addRow([
      f.matriculaId, f.codigo ?? '', f.nombre, f.grado, f.seccion,
      ...datos.conceptos.map((c) => (f.conceptosIds.includes(c.id) ? 'X' : f.conTarifa.includes(c.id) ? '' : '—')),
    ]);
    datos.conceptos.forEach((c, i) => {
      const cell = row.getCell(COLUMNAS_FIJAS.length + 1 + i);
      cell.alignment = { horizontal: 'center' };
      // Sin precio en su sección: gris, para que no lo marquen esperando que cobre.
      if (!f.conTarifa.includes(c.id)) cell.font = { color: { argb: 'FFB0B0B0' } };
    });
  }
  const ayuda = wb.addWorksheet('Cómo llenarla');
  [
    'Pon una X en cada concepto que el alumno paga y bórrala en el que no.',
    'No cambies la columna «ID matrícula»: con ella se reconoce a cada alumno.',
    '«—» = su sección no tiene precio para ese concepto; aunque la marques, no se cobra.',
    'Después, en Zero: Matriculación › Servicios por alumno › Subir Excel. Antes de guardar se ve todo lo que cambia.',
  ].forEach((t) => ayuda.addRow([t]));
  ayuda.getColumn(1).width = 110;

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="servicios-por-alumno${datos.periodo ? `-${datos.periodo.nombre}` : ''}.xlsx"`,
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const form = await req.formData().catch(() => null);
  const archivo = form?.get('archivo');
  if (!(archivo instanceof File)) return NextResponse.json({ error: 'Sube el archivo de Excel.' }, { status: 400 });
  if (archivo.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'El archivo es demasiado grande (máximo 4 MB).' }, { status: 400 });

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await archivo.arrayBuffer());
  } catch {
    return NextResponse.json({ error: 'No se pudo leer: tiene que ser un .xlsx.' }, { status: 400 });
  }
  const ws = wb.worksheets[0];
  if (!ws) return NextResponse.json({ error: 'La hoja está vacía.' }, { status: 400 });

  const valor = (v: ExcelJS.CellValue): unknown => (v && typeof v === 'object' && 'result' in v ? v.result
    : v && typeof v === 'object' && 'richText' in v ? v.richText.map((t) => t.text).join('') : v);
  const encabezados: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { encabezados[col - 1] = String(valor(cell.value) ?? ''); });
  const filas: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const f: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => { f[col - 1] = valor(cell.value); });
    filas.push(f);
  });

  const datos = await leerServiciosAlumnos(auth.teamId, 0);
  return NextResponse.json(cambiosDesdeHoja({ encabezados, filas }, datos.filas, datos.conceptos));
}

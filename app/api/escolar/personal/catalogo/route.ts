import { NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { sigerdImportaciones, sigerdPersonal } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

/**
 * Catálogo de cargos para el formulario de personal manual. Sale de la MISMA
 * data que bajamos de SIGERD: el catálogo nacional de puestos guardado en el
 * dump (`dump->'puestos'`, ~168 puestos). Se usa como SUGERENCIAS (datalist),
 * no como lista cerrada — el cargo sigue siendo texto libre.
 *
 * Fallback si el colegio aún no ha sincronizado: los cargos que ya existan en
 * `sigerd_personal`. Si no hay nada, lista vacía (el campo queda libre igual).
 *
 * Solo proyecta `dump->'puestos'` (no el dump entero) para no arrastrar los 2-5
 * MB de fichas; y corre solo al abrir el formulario, no en cada carga.
 */
export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  // Catálogo nacional desde el último dump completado.
  const [imp] = await db
    .select({ puestos: sql<unknown>`${sigerdImportaciones.dump} -> 'puestos'` })
    .from(sigerdImportaciones)
    .where(and(eq(sigerdImportaciones.teamId, auth.teamId), eq(sigerdImportaciones.estado, 'completado')))
    .orderBy(desc(sigerdImportaciones.updatedAt))
    .limit(1);

  const nacional = new Set<string>();
  if (Array.isArray(imp?.puestos)) {
    for (const p of imp.puestos as Array<{ Nombre?: string }>) {
      const n = p?.Nombre?.trim();
      if (n) nacional.add(n);
    }
  }

  // Cargos ya usados en el colegio: son los más probables, van primero.
  const usadosRows = await db
    .selectDistinct({ cargo: sigerdPersonal.cargo })
    .from(sigerdPersonal)
    .where(eq(sigerdPersonal.teamId, auth.teamId));
  const usados = usadosRows.map((r) => r.cargo?.trim()).filter((c): c is string => !!c);

  // El catálogo trae muchos puestos de oficinas REGIONAL/DISTRITAL que un centro
  // no asigna: se dejan (fiel a SIGERD) pero al final.
  const esOficina = (c: string) => /\((?:REGIONAL|DISTRITAL)\)/i.test(c);
  const ordEs = (a: string, b: string) => a.localeCompare(b, 'es');

  const restantes = [...nacional].filter((c) => !usados.includes(c));
  const centro = restantes.filter((c) => !esOficina(c)).sort(ordEs);
  const oficinas = restantes.filter(esOficina).sort(ordEs);

  // usados (primero) → centro → oficinas. Set final para dedupe conservando orden.
  const cargos = [...new Set([...usados.sort(ordEs), ...centro, ...oficinas])];

  return NextResponse.json({ cargos });
}

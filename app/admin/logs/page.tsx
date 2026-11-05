import { asc, eq } from 'drizzle-orm';
import { exigirAdmin } from '@/lib/auth/admin-guard';
import { db } from '@/lib/db/drizzle';
import { systemLogs, teams } from '@/lib/db/schema';
import { leerConsulta } from '@/lib/admin/consulta-tabla';
import { consultarLogs, DEF_LOGS } from '@/lib/admin/tablas';
import { EncabezadoPagina } from '@/components/admin/piezas';
import { TablaLogs } from './_tabla';

export const dynamic = 'force-dynamic';

export default async function AdminLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirAdmin();   // antes de tocar la base: ver lib/auth/admin-guard.ts
  const c = leerConsulta(await searchParams, DEF_LOGS);
  const [{ filas, total }, colegios] = await Promise.all([
    consultarLogs(c),
    // Solo las empresas que tienen algún registro: el selector no lista las 33 si 5 han fallado.
    db.selectDistinct({ id: teams.id, nombre: teams.name }).from(systemLogs)
      .innerJoin(teams, eq(systemLogs.teamId, teams.id)).orderBy(asc(teams.name)),
  ]);

  return (
    <>
      <EncabezadoPagina
        titulo="Registros del sistema"
        descripcion={`${total.toLocaleString('es-DO')} ${total === 1 ? 'registro' : 'registros'}. Filtra por nivel, empresa o fechas; toca una fila para ver el detalle completo.`}
      />
      <TablaLogs filas={filas} total={total} estado={c} colegios={colegios} />
    </>
  );
}

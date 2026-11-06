import { exigirAdmin } from '@/lib/auth/admin-guard';
import { leerConsulta } from '@/lib/admin/consulta-tabla';
import { colegiosConTareas, consultarTareas, DEF_TAREAS, resumenDeTareas } from '@/lib/admin/tablas';
import { EncabezadoPagina, RejillaDeTarjetas, TarjetaDato } from '@/components/admin/piezas';
import { TablaTareas } from './_tabla';

export const dynamic = 'force-dynamic';

export default async function AdminTareasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const yo = await exigirAdmin();   // antes de tocar la base: ver lib/auth/admin-guard.ts
  const sp = await searchParams;

  // `?tarea=` es el enlace de una notificación: resalta esa tarea, pero no
  // recorta la lista (si no, quien llega desde la campana no vería nada más).
  const { tarea, ...resto } = sp;
  const c = leerConsulta(resto, DEF_TAREAS);
  const idResaltada = typeof tarea === 'string' && /^\d{1,9}$/.test(tarea) ? Number(tarea) : null;

  const [lista, colegios, resumen, resaltada] = await Promise.all([
    consultarTareas(c, false, yo.id),
    colegiosConTareas(),
    resumenDeTareas(),
    idResaltada
      ? consultarTareas({ ...c, pagina: 1, tamano: 10, filtros: { tarea: String(idResaltada), estado: 'todas' } }, false, yo.id).then((r) => r.filas[0] ?? null)
      : Promise.resolve(null),
  ]);

  return (
    <>
      <EncabezadoPagina
        titulo="Tareas de los colegios"
        descripcion="Todo lo que los colegios tienen por revisar, en un solo lugar. Las de Soporte son las que le tocan a Zero responder."
      />
      <RejillaDeTarjetas>
        <TarjetaDato etiqueta="Pendientes" valor={resumen.pendientes} nota="abiertas, en proceso o en revisión" href="/admin/tareas" />
        <TarjetaDato etiqueta="Le tocan a Soporte" valor={resumen.deSoporte} tono={resumen.deSoporte ? 'azul' : 'neutro'} nota="asignadas a Soporte IT · Zero" href="/admin/tareas?asignada=soporte" />
        <TarjetaDato etiqueta="Vencidas" valor={resumen.vencidas} tono={resumen.vencidas ? 'peligro' : 'neutro'} nota="pasó su fecha" href="/admin/tareas?vence=vencidas" />
        <TarjetaDato etiqueta="Sin mover 24 h+" valor={resumen.sinMover24h} tono={resumen.sinMover24h ? 'alerta' : 'neutro'} nota="pendientes sin respuesta" />
      </RejillaDeTarjetas>
      <TablaTareas filas={lista.filas} total={lista.total} estado={c} colegios={colegios} resaltada={resaltada} />
    </>
  );
}

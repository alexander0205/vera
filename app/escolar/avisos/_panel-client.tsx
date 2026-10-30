'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import {
  AlertTriangle, BellRing, CheckCheck, Clock, Loader2, Mail,
  MessageCircle, RefreshCw, Settings, Smartphone, Users, Wrench, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn, type ExportTabla } from '@/components/data-table';
import { fmtDOP, hoyRD } from '@/lib/utils/format';
import {
  AVISO_TEXTO, CANAL_TEXTO, contarMensajes, ENTREGA_TEXTO, type Entrega,
} from '@/lib/administracion-escolar/avisos-etiquetas';
import type { FilaHistorial, LineaPanel, ResumenAvisos } from '@/lib/administracion-escolar/panel-avisos';

/**
 * El panel de recordatorios: si el colegio está avisando de verdad o solo lo
 * parece, y qué pasó con cada aviso.
 *
 * Arriba, lo de hoy: el modo simulacro, un cuadro por canal y —en rojo, porque
 * es lo único que pide hacer algo— cuántos avisos de hoy no van a llegar.
 * Abajo, tres tablas que se filtran, se ordenan y se exportan:
 *
 *  · «Enviados»: lo que ya salió en un rango de días, con si WhatsApp dijo que
 *    llegó. Es la constancia cuando una familia dice que no le avisaron, y lo
 *    que se analiza (cuántos, a quién, por qué canal, cuántos se leyeron).
 *  · «Por salir hoy»: lo calculado para la próxima tanda.
 *  · «No les llega»: a quién no le va a llegar y por qué, con el arreglo a un
 *    clic. Se calcula en vivo: en cuanto alguien le pone el correo al padre,
 *    la fila desaparece sola.
 *
 * La pestaña vive en la URL (`?vista=no-llega`) para poder enlazarla.
 */

interface Resumen extends ResumenAvisos {
  credenciales: {
    sms: 'sin-credenciales' | null;
    whatsapp: 'sin-enlazar' | 'sin-conectar' | null;
  };
}

interface Historial { filas: FilaHistorial[]; total: number; truncado: boolean }

type Vista = 'enviados' | 'por-salir' | 'no-llega';

const traer = (u: string) => fetch(u).then((r) => {
  if (!r.ok) throw new Error('No se pudo leer el estado de los avisos');
  return r.json();
});

const CANAL_ICONO = { correo: Mail, whatsapp: MessageCircle, sms: Smartphone } as const;

const ENTREGA_CLASE: Record<Entrega, string> = {
  leido: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  entregado: 'border-sky-200 bg-sky-50 text-sky-700',
  enviado: 'border-gray-200 bg-gray-50 text-gray-600',
  fallido: 'border-red-200 bg-red-50 text-red-700',
  'sin-acuse': 'border-gray-200 bg-white text-gray-400',
};

/** Para ordenar por entrega: lo que falló primero, lo leído al final. */
const ENTREGA_ORDEN: Record<Entrega, number> = { fallido: 0, 'sin-acuse': 1, enviado: 2, entregado: 3, leido: 4 };

const opciones = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));
const OPC_CANAL = opciones(CANAL_TEXTO);
// En el orden en que le llegan a una familia; los del expediente al final.
const OPC_AVISO = opciones(AVISO_TEXTO);
const OPC_ENTREGA = opciones(ENTREGA_TEXTO);

/** La hora, sin la fecha: el panel ya dice que es de hoy. */
function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
}

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-DO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** El día de hace `n` días, en RD: el rango con que abre «Enviados». */
function haceDias(n: number): string {
  const d = new Date(`${hoyRD()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const contiene = (q: string, ...textos: (string | null | undefined)[]) =>
  textos.some((t) => (t ?? '').toLowerCase().includes(q));

export default function PanelAvisosClient() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const vista: Vista = sp.get('vista') === 'por-salir' ? 'por-salir' : sp.get('vista') === 'no-llega' ? 'no-llega' : 'enviados';
  const irA = (v: Vista) => {
    const q = new URLSearchParams(sp.toString());
    if (v === 'enviados') q.delete('vista'); else q.set('vista', v);
    router.replace(q.size ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const { data, error, isLoading, mutate, isValidating } =
    useSWR<Resumen>('/api/administracion-escolar/avisos', traer);

  if (isLoading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-zero-600" /></div>;
  }
  if (error || !data) {
    return (
      <section className="p-6">
        <p className="text-sm text-red-600">No se pudo leer el estado de los avisos.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => mutate()}>Reintentar</Button>
      </section>
    );
  }

  const pestañas: { clave: Vista; etiqueta: string; n: number | null; roja?: boolean }[] = [
    { clave: 'enviados', etiqueta: 'Enviados', n: null },
    { clave: 'por-salir', etiqueta: 'Por salir hoy', n: data.porSalir.length },
    { clave: 'no-llega', etiqueta: 'No les llega', n: data.problemas.length, roja: data.problemas.length > 0 },
  ];

  return (
    <section className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Avisos de cobro</h1>
          <p className="mt-1 text-sm text-gray-500">
            Qué se le mandó a las familias, si les llegó, qué sale hoy y a quién no le va a llegar.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isValidating}>
            {isValidating
              ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Calculando…</>
              : <><RefreshCw className="mr-1.5 h-4 w-4" />Ver qué sale hoy</>}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/escolar/configuracion/avisos">
              <Settings className="mr-1.5 h-4 w-4" />Configurar canales
            </Link>
          </Button>
        </div>
      </div>

      {/* Lo primero, porque cambia el significado de todo lo demás: con el
          envío apagado estos números son un ensayo, no un registro. */}
      {!data.envioReal && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Modo simulacro: no se está mandando nada</p>
            <p className="mt-0.5 text-sm text-amber-800">
              Todo lo de abajo está calculado, pero ningún mensaje sale de verdad hasta que
              la plataforma encienda el envío. Se enciende a propósito, no por despliegue.
            </p>
          </div>
        </div>
      )}

      {/* Un cuadro por canal: apagado, sin credenciales, o cuántos van hoy. */}
      <div className="grid gap-4 sm:grid-cols-3">
        {(['correo', 'whatsapp', 'sms'] as const).map((canal) => {
          const Icono = CANAL_ICONO[canal];
          const n = data.porCanal[canal];
          const encendido = data.canales[canal];
          const falla = canal === 'sms' ? data.credenciales.sms
            : canal === 'whatsapp' ? data.credenciales.whatsapp : null;
          return (
            <div key={canal} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <Icono className="h-4 w-4 text-gray-400" />{CANAL_TEXTO[canal]}
                </span>
                {!encendido ? (
                  <Badge variant="outline" className="text-gray-500">Apagado</Badge>
                ) : falla ? (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                    {falla === 'sin-credenciales' ? 'Sin configurar'
                      : falla === 'sin-enlazar' ? 'Sin enlazar' : 'Sin conectar'}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    Activo
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-400">Hoy</p>
              <div className="mt-1 flex items-baseline gap-4 text-sm">
                <span className="text-gray-900"><b className="text-lg font-bold">{n.enviados}</b> salieron</span>
                <span className="text-gray-500">{n.porSalir} por salir</span>
                {n.bloqueados > 0 && <span className="text-red-600">{n.bloqueados} sin poder</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Lo único accionable de la pantalla no se esconde detrás de una pestaña. */}
      {data.problemas.length > 0 && vista !== 'no-llega' && (
        <button type="button" onClick={() => irA('no-llega')}
          className="flex w-full items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left hover:bg-red-100">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
          <span className="text-sm text-red-900">
            <b>{data.problemas.length}</b> {data.problemas.length === 1 ? 'aviso de hoy no va a llegar' : 'avisos de hoy no van a llegar'}:
            al responsable le falta el correo o el celular. <span className="font-semibold underline">Ver y arreglar</span>
          </span>
        </button>
      )}

      <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1 sm:w-fit">
        {pestañas.map((p) => (
          <button key={p.clave} type="button" onClick={() => irA(p.clave)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              vista === p.clave ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}>
            {p.etiqueta}
            {p.n != null && (
              <span className={`ml-1.5 tabular-nums ${p.roja ? 'font-semibold text-red-600' : 'text-gray-400'}`}>{p.n}</span>
            )}
          </button>
        ))}
      </div>

      {vista === 'enviados' && <TablaEnviados />}
      {vista === 'por-salir' && (
        <TablaDeHoy filas={data.porSalir} tipo="por-salir"
          descripcion={`${data.totales.porSalir} por salir en la próxima tanda${data.ultimaSalida ? ` · última salida ${hora(data.ultimaSalida)}` : ''}`}
          vacio={data.totales.enviados > 0 ? 'Ya salió todo lo de hoy.' : 'Hoy no le toca ningún aviso a nadie.'} />
      )}
      {vista === 'no-llega' && (
        <TablaDeHoy filas={data.problemas} tipo="no-llega"
          descripcion="Avisos de hoy sin a dónde ir. El arreglo está en el contacto que paga."
          vacio="Todos los avisos de hoy tienen a dónde ir." />
      )}
    </section>
  );
}

// ── Enviados ───────────────────────────────────────────────────────────────

const EXPORTAR_ENVIADOS: ExportTabla<FilaHistorial> = {
  titulo: 'Avisos enviados',
  archivo: 'avisos-enviados',
  columnas: [
    { titulo: 'Cuándo', valor: (r) => fechaHora(r.enviadoAt), ancho: 1.2 },
    { titulo: 'Alumno', valor: (r) => r.estudiante, sub: (r) => r.concepto, ancho: 1.8 },
    { titulo: 'Aviso', valor: (r) => AVISO_TEXTO[r.tipo] ?? r.tipo, ancho: 1.1 },
    { titulo: 'Canal', valor: (r) => CANAL_TEXTO[r.canal] ?? r.canal, ancho: 0.8 },
    { titulo: 'Entrega', valor: (r) => ENTREGA_TEXTO[r.entrega], sub: (r) => r.errorEntrega, ancho: 0.9 },
    { titulo: 'A dónde fue', valor: (r) => r.destino, ancho: 1.6 },
    { titulo: 'Monto', valor: (r) => r.montoCentavos, tipo: 'moneda', ancho: 1 },
  ],
  kpis: (rows) => [
    { label: 'Avisos', valor: String(rows.length), sub: `${contarMensajes(rows)} mensajes` },
    { label: 'Alumnos', valor: String(new Set(rows.map((r) => r.estudianteId)).size) },
    { label: 'Leídos', valor: String(rows.filter((r) => r.entrega === 'leido').length) },
    { label: 'Fallaron', valor: String(rows.filter((r) => r.entrega === 'fallido').length) },
  ],
};

function TablaEnviados() {
  const [filtros, setFiltros] = useState<Record<string, string>>(() => ({
    fecha_desde: haceDias(29), fecha_hasta: hoyRD(),
  }));
  const desde = filtros.fecha_desde ?? '';
  const hasta = filtros.fecha_hasta ?? '';
  const { data, error, isLoading } = useSWR<Historial>(
    `/api/administracion-escolar/avisos/historial?desde=${desde}&hasta=${hasta}`, traer, { keepPreviousData: true },
  );

  const filas = useMemo(() => {
    const q = (filtros.q ?? '').trim().toLowerCase();
    return (data?.filas ?? []).filter((f) =>
      (!filtros.canal || f.canal === filtros.canal)
      && (!filtros.tipo || f.tipo === filtros.tipo)
      && (!filtros.entrega || f.entrega === filtros.entrega)
      && (!q || contiene(q, f.estudiante, f.concepto, f.destino)));
  }, [data, filtros]);

  // Los números se cuentan sobre lo filtrado: es lo que se está mirando.
  const kpi = useMemo(() => {
    const wa = filas.filter((f) => f.canal === 'whatsapp');
    const llegaron = wa.filter((f) => f.entrega === 'leido' || f.entrega === 'entregado').length;
    return {
      avisos: filas.length,
      mensajes: contarMensajes(filas),
      alumnos: new Set(filas.map((f) => f.estudianteId)).size,
      wa: wa.length,
      llegaron,
      leidos: wa.filter((f) => f.entrega === 'leido').length,
      fallaron: filas.filter((f) => f.entrega === 'fallido').length,
    };
  }, [filas]);
  const pct = (n: number, de: number) => (de ? `${Math.round((n / de) * 100)} %` : '—');

  const columnas: DataTableColumn<FilaHistorial>[] = [
    {
      id: 'enviadoAt', header: 'Cuándo', sortable: true, sortAccessor: (r) => r.enviadoAt,
      render: (r) => <span className="whitespace-nowrap text-sm text-gray-600">{fechaHora(r.enviadoAt)}</span>,
    },
    {
      id: 'estudiante', header: 'Alumno', sortable: true, sortAccessor: (r) => r.estudiante.toLowerCase(),
      render: (r) => (
        <div className="min-w-0">
          {r.estudianteId
            ? <Link href={`/escolar/estudiantes/${r.estudianteId}`} onClick={(e) => e.stopPropagation()}
                className="text-sm font-medium text-gray-900 hover:text-zero-600">{r.estudiante}</Link>
            : <span className="text-sm text-gray-500">{r.estudiante}</span>}
          {r.concepto && <span className="block text-xs text-gray-400">{r.concepto}</span>}
        </div>
      ),
    },
    {
      id: 'tipo', header: 'Aviso', sortable: true, sortAccessor: (r) => AVISO_TEXTO[r.tipo] ?? r.tipo,
      render: (r) => (
        <div>
          <span className="text-sm text-gray-700">{AVISO_TEXTO[r.tipo] ?? r.tipo}</span>
          {r.detalle && <span className="block max-w-[220px] text-xs text-gray-400">{r.detalle}</span>}
        </div>
      ),
    },
    {
      id: 'canal', header: 'Canal', sortable: true, sortAccessor: (r) => r.canal,
      render: (r) => <CanalChip canal={r.canal} />,
    },
    {
      id: 'entrega', header: 'Entrega', sortable: true, sortAccessor: (r) => ENTREGA_ORDEN[r.entrega],
      render: (r) => <EntregaChip entrega={r.entrega} error={r.errorEntrega} />,
    },
    {
      // El destino tal como estaba ese día: el teléfono de hoy puede ser otro,
      // y la constancia es de entonces.
      id: 'destino', header: 'A dónde fue', visibleAt: 'md', sortable: true, sortAccessor: (r) => r.destino ?? '',
      render: (r) => <span className="text-sm text-gray-500">{r.destino ?? '—'}</span>,
    },
    {
      id: 'monto', header: 'Monto', align: 'right', visibleAt: 'lg', sortable: true, sortAccessor: (r) => r.montoCentavos,
      render: (r) => <span className="whitespace-nowrap text-sm tabular-nums text-gray-700">{r.montoCentavos == null ? '—' : fmtDOP(r.montoCentavos)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icono={BellRing} titulo="Avisos" valor={kpi.avisos.toLocaleString('es-DO')}
          sub={`${kpi.mensajes.toLocaleString('es-DO')} mensajes · varios cobros de una familia van juntos`} />
        <Kpi icono={Users} titulo="Alumnos avisados" valor={kpi.alumnos.toLocaleString('es-DO')} />
        <Kpi icono={CheckCheck} titulo="WhatsApp que llegaron" valor={pct(kpi.llegaron, kpi.wa)}
          sub={kpi.wa ? `${kpi.llegaron} de ${kpi.wa} · ${kpi.leidos} leídos` : 'Ningún WhatsApp en el rango'} tono="verde" />
        <Kpi icono={XCircle} titulo="Fallaron" valor={kpi.fallaron.toLocaleString('es-DO')}
          sub="WhatsApp que Meta no entregó" tono={kpi.fallaron > 0 ? 'rojo' : undefined} />
      </div>

      {data?.truncado && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          En este rango hay {data.total.toLocaleString('es-DO')} avisos y se muestran los {data.filas.length.toLocaleString('es-DO')} más
          recientes. Acorta las fechas para verlos todos.
        </p>
      )}

      <DataTable<FilaHistorial>
        data={filas}
        columns={columnas}
        loading={isLoading}
        error={error ? 'No se pudo leer el historial de avisos.' : null}
        title="Enviados"
        description="La constancia de cada aviso: cuándo, a quién, por dónde y si llegó. Solo WhatsApp confirma la entrega."
        defaultSort={{ columnId: 'enviadoAt', dir: 'desc' }}
        filters={[
          { type: 'search', id: 'q', placeholder: 'Alumno, concepto, correo o teléfono…' },
          { type: 'select', id: 'canal', label: 'Canal', options: OPC_CANAL, placeholder: 'Todos los canales' },
          { type: 'select', id: 'tipo', label: 'Aviso', options: OPC_AVISO, placeholder: 'Todos los avisos' },
          { type: 'select', id: 'entrega', label: 'Entrega', options: OPC_ENTREGA, placeholder: 'Cualquier entrega' },
          { type: 'daterange', id: 'fecha' },
        ]}
        filterValues={filtros}
        onFilterChange={setFiltros}
        exportar={EXPORTAR_ENVIADOS}
        mostrarCsv
        emptyState={{
          icon: BellRing,
          title: (data?.filas.length ?? 0) > 0 ? 'Nada con esos filtros' : 'No salió ningún aviso en estas fechas',
          hint: (data?.filas.length ?? 0) > 0 ? 'Quita algún filtro para ver más.' : 'Amplía el rango de fechas.',
        }}
      />
    </div>
  );
}

// ── Lo de hoy: por salir y no les llega ─────────────────────────────────────

function TablaDeHoy({ filas, tipo, descripcion, vacio }: {
  filas: LineaPanel[]; tipo: 'por-salir' | 'no-llega'; descripcion: string; vacio: string;
}) {
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const visibles = useMemo(() => {
    const q = (filtros.q ?? '').trim().toLowerCase();
    return filas.filter((f) =>
      (!filtros.canal || f.canal === filtros.canal)
      && (!filtros.tipo || f.aviso === filtros.tipo)
      && (!q || contiene(q, f.estudiante, f.responsable, f.concepto, f.destino)));
  }, [filas, filtros]);

  const columnas: DataTableColumn<LineaPanel>[] = [
    {
      id: 'estudiante', header: 'Alumno', sortable: true, sortAccessor: (r) => r.estudiante.toLowerCase(),
      render: (r) => (
        <div className="min-w-0">
          <Link href={`/escolar/estudiantes/${r.estudianteId}`} onClick={(e) => e.stopPropagation()}
            className="text-sm font-medium text-gray-900 hover:text-zero-600">{r.estudiante}</Link>
          <span className="block text-xs text-gray-400">{r.responsable ?? 'Sin responsable de pago'}</span>
        </div>
      ),
    },
    {
      id: 'concepto', header: 'Cuota', sortable: true, sortAccessor: (r) => r.concepto.toLowerCase(),
      render: (r) => <span className="text-sm text-gray-700">{r.concepto}</span>,
    },
    {
      id: 'monto', header: 'Saldo', align: 'right', sortable: true, sortAccessor: (r) => r.montoCentavos,
      render: (r) => <span className="whitespace-nowrap text-sm tabular-nums text-gray-700">{fmtDOP(r.montoCentavos)}</span>,
    },
    {
      id: 'aviso', header: 'Aviso', sortable: true, visibleAt: 'md', sortAccessor: (r) => AVISO_TEXTO[r.aviso] ?? r.aviso,
      render: (r) => <span className="text-sm text-gray-600">{AVISO_TEXTO[r.aviso] ?? r.aviso}</span>,
    },
    {
      id: 'canal', header: 'Canal', sortable: true, sortAccessor: (r) => r.canal,
      render: (r) => <CanalChip canal={r.canal} />,
    },
    tipo === 'no-llega'
      ? {
          id: 'motivo', header: 'Por qué no llega', sortable: true, sortAccessor: (r) => r.motivo ?? '',
          render: (r) => <span className="text-sm font-medium text-red-600">{r.motivo}</span>,
        }
      : {
          id: 'destino', header: 'A dónde va', visibleAt: 'md', sortable: true, sortAccessor: (r) => r.destino ?? '',
          render: (r) => <span className="text-sm text-gray-500">{r.destino ?? '—'}</span>,
        },
  ];

  const exportar: ExportTabla<LineaPanel> = {
    titulo: tipo === 'no-llega' ? 'Avisos de hoy que no llegan' : 'Avisos por salir hoy',
    archivo: tipo === 'no-llega' ? 'avisos-no-llegan' : 'avisos-por-salir',
    columnas: [
      { titulo: 'Alumno', valor: (r) => r.estudiante, sub: (r) => r.responsable, ancho: 1.8 },
      { titulo: 'Cuota', valor: (r) => r.concepto, ancho: 1.4 },
      { titulo: 'Saldo', valor: (r) => r.montoCentavos, tipo: 'moneda', total: true, ancho: 1 },
      { titulo: 'Aviso', valor: (r) => AVISO_TEXTO[r.aviso] ?? r.aviso, ancho: 1 },
      { titulo: 'Canal', valor: (r) => CANAL_TEXTO[r.canal] ?? r.canal, ancho: 0.8 },
      tipo === 'no-llega'
        ? { titulo: 'Por qué no llega', valor: (r) => r.motivo, ancho: 1.8 }
        : { titulo: 'A dónde va', valor: (r) => r.destino, ancho: 1.6 },
    ],
  };

  return (
    <DataTable<LineaPanel>
      data={visibles}
      columns={columnas}
      rowId={(r) => `${r.cargoId}-${r.aviso}-${r.canal}`}
      title={tipo === 'no-llega' ? 'No les llega' : 'Por salir hoy'}
      description={descripcion}
      defaultSort={{ columnId: 'estudiante', dir: 'asc' }}
      filters={[
        { type: 'search', id: 'q', placeholder: 'Alumno, responsable, cuota…' },
        { type: 'select', id: 'canal', label: 'Canal', options: OPC_CANAL, placeholder: 'Todos los canales' },
        { type: 'select', id: 'tipo', label: 'Aviso', options: OPC_AVISO.slice(0, 3), placeholder: 'Todos los avisos' },
      ]}
      filterValues={filtros}
      onFilterChange={setFiltros}
      // El arreglo está en el contacto que paga, no en el alumno: es ahí donde
      // vive el correo que falta. Sin responsable asignado, en cambio, lo que
      // hay que abrir es la ficha del alumno.
      rowActions={tipo === 'no-llega' ? (r) => [{
        icon: Wrench, title: 'Arreglar', primary: true,
        href: r.clientId ? `/dashboard/clientes/${r.clientId}/editar` : `/escolar/estudiantes/${r.estudianteId}`,
      }] : undefined}
      exportar={exportar}
      emptyState={{
        icon: tipo === 'no-llega' ? CheckCheck : Clock,
        title: filas.length > 0 ? 'Nada con esos filtros' : vacio,
      }}
    />
  );
}

// ── Piezas ─────────────────────────────────────────────────────────────────

function Kpi({ icono: Icono, titulo, valor, sub, tono }: {
  icono: typeof BellRing; titulo: string; valor: string; sub?: string; tono?: 'verde' | 'rojo';
}) {
  const color = tono === 'rojo' ? 'text-red-600' : tono === 'verde' ? 'text-emerald-700' : 'text-gray-900';
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
        <Icono className="h-3.5 w-3.5 text-gray-400" />{titulo}
      </p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function CanalChip({ canal }: { canal: string }) {
  const Icono = CANAL_ICONO[canal as keyof typeof CANAL_ICONO];
  if (!Icono) return <span className="text-xs text-gray-500">{canal}</span>;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">
      <Icono className="h-3 w-3" />{CANAL_TEXTO[canal]}
    </span>
  );
}

function EntregaChip({ entrega, error }: { entrega: Entrega; error: string | null }) {
  return (
    <span title={error ?? (entrega === 'sin-acuse' ? 'El correo y el SMS no confirman la entrega.' : undefined)}
      className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${ENTREGA_CLASE[entrega]}`}>
      {ENTREGA_TEXTO[entrega]}
    </span>
  );
}

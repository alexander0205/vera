'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  AlertTriangle, BellRing, CheckCircle2, Clock, Loader2, Mail,
  MessageCircle, RefreshCw, Settings, Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fmtDOP } from '@/lib/utils/format';
import type { LineaPanel, ResumenAvisos } from '@/lib/administracion-escolar/panel-avisos';

/**
 * El panel de recordatorios: si el colegio está avisando de verdad o solo lo
 * parece.
 *
 * Lo que manda la pantalla es el bloque «No les va a llegar». Los contadores
 * tranquilizan y el historial sirve de constancia, pero el único que pide
 * hacer algo es ese, y por eso va arriba y en rojo. Antes esto no existía en
 * ninguna parte: los fallos terminaban en el log del servidor y la secretaria
 * veía silencio, que se lee igual que «todo bien».
 */

interface Resumen extends ResumenAvisos {
  credenciales: {
    sms: 'sin-credenciales' | null;
    whatsapp: 'sin-enlazar' | 'sin-conectar' | null;
  };
}

interface Historial {
  filas: {
    id: number; enviadoAt: string; canal: string; tipo: string;
    destino: string | null; estudiante: string; estudianteId: number; concepto: string | null;
  }[];
  total: number;
}

const traer = (u: string) => fetch(u).then((r) => {
  if (!r.ok) throw new Error('No se pudo leer el estado de los avisos');
  return r.json();
});

const CANAL_META = {
  correo:   { label: 'Correo',   icon: Mail },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  sms:      { label: 'SMS',      icon: Smartphone },
} as const;

const AVISO_TEXTO: Record<string, string> = {
  'al-emitir': 'factura nueva',
  'al-vencer': 'venció hoy',
  'antes-mora': 'antes del recargo',
};

/** La hora, sin la fecha: el panel ya dice que es de hoy. */
function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
}

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-DO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function PanelAvisosClient() {
  const { data, error, isLoading, mutate, isValidating } =
    useSWR<Resumen>('/api/administracion-escolar/avisos', traer);
  const { data: historial } = useSWR<Historial>(
    '/api/administracion-escolar/avisos/historial?limit=25', traer,
  );

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

  return (
    <section className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Avisos de cobro</h1>
          <p className="mt-1 text-sm text-gray-500">
            Qué se le manda hoy a las familias, qué ya salió y a quién no le va a llegar.
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

      {/* Un cuadro por canal: apagado, sin credenciales, o cuántos van. */}
      <div className="grid gap-4 sm:grid-cols-3">
        {(['correo', 'whatsapp', 'sms'] as const).map((canal) => {
          const meta = CANAL_META[canal];
          const n = data.porCanal[canal];
          const encendido = data.canales[canal];
          const falla = canal === 'sms' ? data.credenciales.sms
            : canal === 'whatsapp' ? data.credenciales.whatsapp : null;
          return (
            <div key={canal} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <meta.icon className="h-4 w-4 text-gray-400" />{meta.label}
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
              <div className="mt-3 flex items-baseline gap-4 text-sm">
                <span className="text-gray-900"><b className="text-lg font-bold">{n.enviados}</b> salieron</span>
                <span className="text-gray-500">{n.porSalir} por salir</span>
                {n.bloqueados > 0 && <span className="text-red-600">{n.bloqueados} sin poder</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── No les va a llegar ─────────────────────────────────────────────
          El bloque por el que existe esta pantalla. Se calcula en vivo y no de
          una tabla de errores: en cuanto alguien le pone el correo al padre,
          la fila desaparece sola. */}
      <div className={`rounded-xl border bg-white ${
        data.problemas.length > 0 ? 'border-red-200' : 'border-gray-200'
      }`}>
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            {data.problemas.length > 0
              ? <AlertTriangle className="h-4 w-4 text-red-500" />
              : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            No les va a llegar
          </h2>
          <span className="text-xs text-gray-500">{data.problemas.length} de hoy</span>
        </div>
        {data.problemas.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            Todos los avisos de hoy tienen a dónde ir.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.problemas.map((p, i) => <FilaProblema key={`${p.cargoId}-${p.canal}-${i}`} p={p} />)}
          </div>
        )}
      </div>

      {/* ── Por salir ── */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Clock className="h-4 w-4 text-gray-400" />Pendiente de la próxima tanda
          </h2>
          <span className="text-xs text-gray-500">
            {data.totales.porSalir} por salir
            {data.ultimaSalida ? ` · última salida ${hora(data.ultimaSalida)}` : ''}
          </span>
        </div>
        {data.porSalir.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            {data.totales.enviados > 0
              ? 'Ya salió todo lo de hoy.'
              : 'Hoy no le toca ningún aviso a nadie.'}
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.porSalir.slice(0, 25).map((p, i) => (
              <div key={`${p.cargoId}-${p.canal}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <CanalChip canal={p.canal} />
                <Link href={`/escolar/estudiantes/${p.estudianteId}`}
                  className="text-sm font-medium text-gray-900 hover:text-zero-600">
                  {p.estudiante}
                </Link>
                <span className="text-xs text-gray-500">
                  {p.concepto} · {fmtDOP(p.montoCentavos)} · {AVISO_TEXTO[p.aviso] ?? p.aviso}
                </span>
                <span className="ml-auto truncate text-xs text-gray-400">{p.destino}</span>
              </div>
            ))}
            {data.porSalir.length > 25 && (
              <p className="px-4 py-2 text-xs text-gray-400">
                y {data.porSalir.length - 25} más
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Historial ── La constancia cuando la familia dice que no le avisaron. */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <BellRing className="h-4 w-4 text-gray-400" />Historial
          </h2>
          <span className="text-xs text-gray-500">{historial?.total ?? 0} en total</span>
        </div>
        {!historial ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">Cargando…</p>
        ) : historial.filas.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            Todavía no se ha mandado ningún aviso.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <th className="px-4 py-2 font-medium">Cuándo</th>
                  <th className="px-4 py-2 font-medium">Alumno</th>
                  <th className="px-4 py-2 font-medium">Aviso</th>
                  <th className="px-4 py-2 font-medium">Canal</th>
                  <th className="px-4 py-2 font-medium">A dónde fue</th>
                </tr>
              </thead>
              <tbody>
                {historial.filas.map((f) => (
                  <tr key={f.id} className="border-t border-gray-100">
                    <td className="whitespace-nowrap px-4 py-2 text-gray-600">{fechaHora(f.enviadoAt)}</td>
                    <td className="px-4 py-2">
                      <Link href={`/escolar/estudiantes/${f.estudianteId}`}
                        className="font-medium text-gray-900 hover:text-zero-600">
                        {f.estudiante}
                      </Link>
                      {f.concepto && <span className="block text-xs text-gray-400">{f.concepto}</span>}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{AVISO_TEXTO[f.tipo] ?? f.tipo}</td>
                    <td className="px-4 py-2"><CanalChip canal={f.canal} /></td>
                    {/* El destino tal como estaba ese día: el teléfono de hoy
                        puede ser otro, y la constancia es de entonces. */}
                    <td className="px-4 py-2 text-gray-500">{f.destino ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function CanalChip({ canal }: { canal: string }) {
  const meta = CANAL_META[canal as keyof typeof CANAL_META];
  if (!meta) return <span className="text-xs text-gray-500">{canal}</span>;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">
      <meta.icon className="h-3 w-3" />{meta.label}
    </span>
  );
}

function FilaProblema({ p }: { p: LineaPanel }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
      <CanalChip canal={p.canal} />
      <Link href={`/escolar/estudiantes/${p.estudianteId}`}
        className="text-sm font-medium text-gray-900 hover:text-zero-600">
        {p.estudiante}
      </Link>
      <span className="text-xs text-gray-500">
        {p.concepto} · {fmtDOP(p.montoCentavos)}
      </span>
      <span className="text-xs font-medium text-red-600">{p.motivo}</span>
      {/* El arreglo está en el contacto que paga, no en el alumno: es ahí
          donde vive el correo que falta. Sin responsable asignado, en cambio,
          lo que hay que abrir es la ficha del alumno. */}
      <Button asChild size="sm" variant="outline" className="ml-auto shrink-0">
        <Link href={p.clientId
          ? `/dashboard/clientes/${p.clientId}/editar`
          : `/escolar/estudiantes/${p.estudianteId}`}>
          Arreglar
        </Link>
      </Button>
    </div>
  );
}

'use client';

import { Fragment, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronRight, ChevronDown, RefreshCw, AlertTriangle,
  FileText, Banknote, Undo2, Ban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AsientoResumen, LineaDetalle } from '@/lib/contabilidad/libro-diario';

function dop(cents: number) {
  return (cents / 100).toLocaleString('es-DO', {
    style: 'currency', currency: 'DOP', minimumFractionDigits: 2,
  });
}

function fecha(f: string) {
  // `f` ya viene 'YYYY-MM-DD' desde SQL, sin componente horario: se parte a mano
  // en vez de pasar por Date, que lo interpretaría como UTC y podría restar un
  // día al mostrarlo en hora RD.
  const [a, m, d] = f.split('-');
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d} ${meses[Number(m) - 1]} ${a}`;
}

/**
 * Los cuatro orígenes de un asiento. La nota de crédito y la anulación se
 * colorean distinto a propósito: son los que RESTAN, y conviene distinguirlos de
 * un vistazo al leer el libro.
 */
const ORIGEN: Record<string, { label: string; icono: React.ReactNode; cls: string }> = {
  factura:   { label: 'Factura',   icono: <FileText className="h-3 w-3" />,
               cls: 'border-gray-200 bg-gray-50 text-gray-600' },
  pago:      { label: 'Cobro',     icono: <Banknote className="h-3 w-3" />,
               cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  nota:      { label: 'Nota de crédito', icono: <Undo2 className="h-3 w-3" />,
               cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  anulacion: { label: 'Anulación', icono: <Ban className="h-3 w-3" />,
               cls: 'border-red-200 bg-red-50 text-red-700' },
};

/** Los motivos que devuelve el barrido, en lenguaje de usuario. */
const MOTIVO_TEXTO: Record<string, string> = {
  'contabilidad-apagada':    'la contabilidad automática está apagada',
  'ya-tiene-asiento':        'ya tenían asiento',
  'no-es-venta':             'no son ventas emitidas',
  'sin-monto':               'no tienen monto',
  'sin-cuenta-por-cobrar':   'falta configurar la cuenta por cobrar',
  'sin-cuenta-itbis':        'falta configurar la cuenta de ITBIS',
  'sin-cuenta-ingresos':     'falta configurar la cuenta de ingresos',
  'sin-cuenta-cobro':        'falta configurar la cuenta de esa forma de cobro',
  'sin-cuenta-mora':         'falta configurar la cuenta de ingresos por mora',
  'sin-cuenta-descuentos':   'falta configurar la cuenta de descuentos',
  'sin-cuenta-saldos-favor': 'falta configurar la cuenta de saldos a favor',
  'sin-cuenta-retenciones':  'falta configurar la cuenta de retenciones por cobrar',
  'sin-asiento-que-reversar':'se anularon antes de tener asiento, así que no hay nada que reversar',
  'no-esta-anulado':         'no están anulados',
  'nc-solo-texto':           'solo corrigen texto, sin efecto monetario',
};

export function LibroDiarioClient({
  asientosIniciales, total, pendientes, descuadrados, activa, puedeGenerar,
}: {
  asientosIniciales: AsientoResumen[];
  total:        number;
  pendientes:   number;
  descuadrados: { id: number; concepto: string; debe: number; haber: number }[];
  activa:       boolean;
  puedeGenerar: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [abierto, setAbierto] = useState<number | null>(null);
  const [lineas, setLineas] = useState<Record<number, LineaDetalle[]>>({});
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function alternar(id: number) {
    if (abierto === id) { setAbierto(null); return; }
    setAbierto(id);
    if (lineas[id]) return;

    const res = await fetch(`/api/contabilidad/libro-diario/${id}`);
    if (!res.ok) { setError('No se pudieron cargar los apuntes.'); return; }
    const { lineas: ls } = await res.json();
    setLineas((prev) => ({ ...prev, [id]: ls }));
  }

  async function generar() {
    setGenerando(true);
    setError(null);
    setAviso(null);

    const res = await fetch('/api/contabilidad/libro-diario', { method: 'POST' });
    setGenerando(false);

    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? 'No se pudieron generar los asientos.');
      return;
    }

    const r = await res.json();
    const partes: string[] = [];
    if (r.creados > 0) partes.push(`Se generaron ${r.creados} asiento(s).`);
    else partes.push('No había nada nuevo que asentar.');

    // Los motivos importan: "saltó 8" sin decir por qué no sirve de nada.
    const motivos = Object.entries(r.motivos ?? {}) as [string, number][];
    if (motivos.length > 0) {
      partes.push(
        'Se saltaron: ' +
        motivos.map(([m, n]) => `${n} porque ${MOTIVO_TEXTO[m] ?? m}`).join('; ') + '.',
      );
    }
    if (r.hayMas) partes.push('Quedan más pendientes: vuelve a pulsar para seguir.');

    setAviso(partes.join(' '));
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {aviso && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {aviso}
        </div>
      )}

      {/* Si esto aparece alguna vez, hay un bug: la aplicación impide guardar
          asientos descuadrados. Se muestra para que se vea antes de que
          contamine un reporte, no para que el usuario lo arregle. */}
      {descuadrados.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            {descuadrados.length} asiento(s) descuadrado(s)
          </div>
          <p className="mt-1 text-xs">
            Esto no debería poder pasar. Repórtalo antes de usar estos números
            para declarar.
          </p>
          <ul className="mt-2 space-y-0.5 text-xs">
            {descuadrados.slice(0, 5).map((d) => (
              <li key={d.id}>
                #{d.id} {d.concepto}: debe {dop(d.debe)} · haber {dop(d.haber)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          {total} asiento(s)
          {pendientes > 0 && (
            <span className="ml-2 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
              {pendientes} sin asentar
            </span>
          )}
        </p>

        {puedeGenerar && (
          <Button size="sm" onClick={generar} disabled={generando || !activa}>
            <RefreshCw className={`mr-2 h-4 w-4 ${generando ? 'animate-spin' : ''}`} />
            {generando ? 'Generando…' : 'Generar asientos pendientes'}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Concepto</th>
              <th className="px-4 py-3 font-medium">Origen</th>
              <th className="px-4 py-3 font-medium text-right">Importe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {asientosIniciales.map((a) => (
              // Fragment con key: el elemento externo del map es el que React
              // necesita identificar, no los <tr> de dentro.
              <Fragment key={a.id}>
                <tr
                  onClick={() => alternar(a.id)}
                  className="cursor-pointer hover:bg-gray-50"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">
                    <div className="flex items-center gap-1.5">
                      {abierto === a.id
                        ? <ChevronDown className="h-4 w-4 text-gray-400" />
                        : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      {fecha(a.fecha)}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-900">{a.concepto}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs ${ORIGEN[a.origenTipo]?.cls ?? 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                      {ORIGEN[a.origenTipo]?.icono}
                      {ORIGEN[a.origenTipo]?.label ?? a.origenTipo}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-gray-900">
                    {dop(a.totalCents)}
                  </td>
                </tr>

                {abierto === a.id && (
                  <tr className="bg-gray-50/60">
                    <td colSpan={4} className="px-4 py-3">
                      {!lineas[a.id] ? (
                        <p className="text-xs text-gray-500">Cargando apuntes…</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead className="text-left text-gray-500">
                            <tr>
                              <th className="pb-1.5 font-medium">Cuenta</th>
                              <th className="pb-1.5 font-medium">Descripción</th>
                              <th className="pb-1.5 text-right font-medium">Debe</th>
                              <th className="pb-1.5 text-right font-medium">Haber</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lineas[a.id].map((l, i) => (
                              <tr key={i} className="border-t border-gray-200/70">
                                <td className="py-1.5 text-gray-700">
                                  <span className="font-mono text-gray-500">{l.cuentaCodigo}</span>
                                  {' '}{l.cuentaNombre}
                                </td>
                                <td className="py-1.5 text-gray-500">{l.descripcion}</td>
                                <td className="py-1.5 text-right tabular-nums text-gray-900">
                                  {l.debeCents > 0 ? dop(l.debeCents) : ''}
                                </td>
                                <td className="py-1.5 text-right tabular-nums text-gray-900">
                                  {l.haberCents > 0 ? dop(l.haberCents) : ''}
                                </td>
                              </tr>
                            ))}
                            <tr className="border-t-2 border-gray-300 font-medium">
                              <td className="py-1.5" />
                              <td className="py-1.5 text-gray-500">Totales</td>
                              <td className="py-1.5 text-right tabular-nums">
                                {dop(lineas[a.id].reduce((s, l) => s + l.debeCents, 0))}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {dop(lineas[a.id].reduce((s, l) => s + l.haberCents, 0))}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}

            {asientosIniciales.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500">
                  Todavía no hay asientos.
                  {activa && pendientes > 0 && ' Pulsa "Generar asientos pendientes".'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Los asientos se generan cuando pulsas el botón, no automáticamente al
        facturar. Se asientan facturas, cobros, notas de crédito, recargos por mora
        y retenciones. Un documento anulado no borra su asiento: genera uno reverso,
        para que el historial contable quede completo.
      </p>
    </div>
  );
}

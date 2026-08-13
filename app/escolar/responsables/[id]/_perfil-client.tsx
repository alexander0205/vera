'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  AlertTriangle, ArrowLeft, CalendarDays, Download, HandCoins, Loader2, Mail,
  MessageCircle, Pencil, Receipt, Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { useVolver } from '@/lib/hooks/useVolver';
import { useTabUrl } from '@/lib/hooks/useUrlEstado';
import type { DetalleResponsable } from '@/lib/administracion-escolar/responsables';

/**
 * La ficha completa de una familia.
 *
 * La primera versión volcaba las cinco tablas una debajo de otra: quince
 * renglones repitiendo el mismo nombre de alumno, sin un total por hijo, sin
 * saber qué está vencido y sin poder sacar nada de ahí. Se leía como un dump
 * de la base, no como el estado de cuenta de una familia.
 *
 * Ahora: las cifras arriba, un reparto visual de dónde está la deuda, y el
 * detalle en pestañas —cada una con su exportación—. El estado de cuenta va
 * AGRUPADO POR HIJO, que es como se cobra y como se discute por teléfono.
 */

const traer = (u: string) => fetch(u).then((r) => {
  if (!r.ok) throw new Error('No se pudo cargar');
  return r.json();
});

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const AVISO_TEXTO: Record<string, string> = {
  'al-emitir': 'Factura nueva',
  'al-vencer': 'Venció hoy',
  'antes-mora': 'Antes del recargo',
};

const VISTAS = ['cuenta', 'pagos', 'facturas', 'avisos'] as const;

/** Descarga en el navegador, sin pasar por el servidor. */
function descargarCsv(nombre: string, filas: (string | number)[][]) {
  // Punto y coma y BOM: Excel en español abre así el archivo en columnas. Con
  // coma, un importe «RD$1,200.00» partía la fila.
  const csv = filas.map((f) => f.map((v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FamiliaPerfilClient({ clientId }: { clientId: number }) {
  const volver = useVolver('/escolar/responsables');
  const [vista, setVista] = useTabUrl('v', VISTAS, 'cuenta');
  const [hijoAbierto, setHijoAbierto] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR<DetalleResponsable>(
    `/api/administracion-escolar/responsables/${clientId}`, traer,
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  const hoy = new Date().toISOString().slice(0, 10);

  /**
   * El estado de cuenta agrupado por hijo.
   *
   * Es el orden en que se habla con la familia: «de Alisa debes esto, de
   * Samil esto otro». Una lista plana de quince renglones con el mismo nombre
   * repetido no permite ni ver el subtotal de cada uno.
   */
  const porHijo = useMemo(() => {
    const m = new Map<string, {
      alumno: string; total: number; pendiente: number; vencido: number;
      cargos: NonNullable<DetalleResponsable['cargos']>;
    }>();
    for (const g of data?.cargos ?? []) {
      const k = g.alumno || 'Sin alumno';
      const e = m.get(k) ?? { alumno: k, total: 0, pendiente: 0, vencido: 0, cargos: [] };
      e.total += g.montoCentavos;
      e.pendiente += g.saldoCentavos;
      if (g.saldoCentavos > 0 && g.fechaVencimiento && g.fechaVencimiento < hoy) {
        e.vencido += g.saldoCentavos;
      }
      e.cargos.push(g);
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.pendiente - a.pendiente);
  }, [data?.cargos, hoy]);

  if (isLoading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-zero-600" /></div>;
  }
  if (error || !data?.contacto) {
    return (
      <section className="mx-auto max-w-4xl p-6">
        <p className="text-sm text-gray-500">Esa familia no existe o no pertenece a este colegio.</p>
        <button type="button" onClick={volver} className="mt-3 inline-flex items-center gap-1 text-sm text-zero-600">
          <ArrowLeft className="h-4 w-4" />Volver a responsables
        </button>
      </section>
    );
  }

  const c = data.contacto;
  const facturado = data.cargos.reduce((s, g) => s + g.montoCentavos, 0);
  const pendiente = data.cargos.reduce((s, g) => s + g.saldoCentavos, 0);
  const cobrado = facturado - pendiente;
  const vencido = porHijo.reduce((s, h) => s + h.vencido, 0);
  const porVencer = pendiente - vencido;
  const deudaFacturas = data.facturas.reduce(
    (s, f) => s + Math.max(0, f.montoTotal - f.pagadoCentavos), 0);
  const totalPagado = data.pagos.reduce((s, p) => s + p.montoCentavos, 0);
  const sinFacturar = data.cargos.filter((g) => g.ecfDocumentId == null);

  const canales = [
    { icon: Mail, label: 'Correo', valor: c.email?.trim() || null },
    { icon: MessageCircle, label: 'WhatsApp', valor: c.whatsapp?.trim() || c.celular?.trim() || null },
    { icon: Smartphone, label: 'SMS', valor: c.celular?.trim() || c.whatsapp?.trim() || null },
  ];
  const sinCanal = canales.every((x) => !x.valor);

  return (
    <section className="space-y-5 p-6">
      <button type="button" onClick={volver}
        className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-zero-600">
        <ArrowLeft className="h-4 w-4" />Volver a responsables
      </button>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-zero-100 text-lg font-semibold text-zero-700">
              {c.razonSocial.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-gray-900">{c.razonSocial}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Chip k="RNC / Cédula" v={c.rnc ?? '—'} />
                <Chip k="Hijos" v={String(data.hijos.length)} />
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                  pendiente + deudaFacturas > 0
                    ? 'border-red-200 bg-red-50 text-red-600'
                    : 'border-zero-200 bg-zero-50 text-zero-700'}`}>
                  <span className="text-[11px] opacity-70">Debe</span>
                  <b className="font-semibold">
                    {pendiente + deudaFacturas > 0 ? fmtDOP(pendiente + deudaFacturas) : 'Al día'}
                  </b>
                </span>
              </div>
            </div>
          </div>

          <div className="shrink-0 md:min-w-[200px] md:border-l md:border-gray-100 md:pl-4">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Se le puede avisar por</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {canales.map((x) => (
                <span key={x.label} title={x.valor ? `${x.label}: ${x.valor}` : `Sin ${x.label}`}>
                  <x.icon className={`h-4 w-4 ${x.valor ? 'text-zero-600' : 'text-red-500'}`} />
                </span>
              ))}
              {sinCanal && <span className="text-[11px] font-medium text-red-600">No se le puede avisar</span>}
            </div>
          </div>

          <Button asChild variant="outline" size="sm" className="shrink-0 self-start md:self-center">
            <Link href={`/dashboard/clientes/${clientId}/editar`}>
              <Pencil className="mr-1.5 h-4 w-4" />Editar contacto
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Cifra icon={Receipt} label="Facturado" valor={fmtDOP(facturado)}
          detalle={`${data.cargos.length} cargo(s)`} />
        <Cifra icon={HandCoins} label="Cobrado" valor={fmtDOP(cobrado)}
          detalle={`${data.pagos.length} pago(s)`} />
        <Cifra icon={AlertTriangle} label="Pendiente" valor={fmtDOP(pendiente + deudaFacturas)}
          detalle={deudaFacturas > 0 ? `con ${fmtDOP(deudaFacturas)} de facturas sueltas` : 'Del plan de cobro'}
          tono={pendiente + deudaFacturas > 0 ? 'red' : 'gris'} />
        <Cifra icon={CalendarDays} label="Vencido" valor={fmtDOP(vencido)}
          detalle="Ya pasó su fecha" tono={vencido > 0 ? 'red' : 'gris'} />
      </div>

      {/* Dónde está la deuda: por hijo y por antigüedad. Dos barras dicen en un
          vistazo lo que quince renglones no dicen leídos uno a uno. */}
      {pendiente > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel titulo="Deuda por hijo">
            <div className="space-y-2.5 p-4">
              {porHijo.map((h) => (
                <Barra key={h.alumno} etiqueta={h.alumno} valor={h.pendiente} total={pendiente}
                  detalle={h.vencido > 0 ? `${fmtDOP(h.vencido)} vencido` : undefined} />
              ))}
            </div>
          </Panel>

          <Panel titulo="Cómo está esa deuda">
            <div className="space-y-2.5 p-4">
              <Barra etiqueta="Vencido" valor={vencido} total={pendiente} tono="red"
                detalle="ya pasó su fecha de pago" />
              <Barra etiqueta="Por vencer" valor={porVencer} total={pendiente}
                detalle="todavía en plazo" />
              {sinFacturar.length > 0 && (
                <Barra etiqueta="Sin factura emitida"
                  valor={sinFacturar.reduce((s, g) => s + g.saldoCentavos, 0)} total={pendiente}
                  tono="ambar" detalle="la familia no ha recibido comprobante" />
              )}
            </div>
          </Panel>
        </div>
      )}

      {/* Los hijos, SIEMPRE a la vista.
          Al pasar el detalle a pestañas se quedaron dentro del estado de
          cuenta, agrupados por sus cargos — y una familia al día, sin cargos,
          se quedaba sin ellos: la cabecera decía «Hijos 1» y no había forma de
          saber quién era. */}
      <Panel titulo={`Hijos · ${data.hijos.length}`}>
        {data.hijos.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            Ninguno de sus beneficiarios tiene ficha escolar todavía.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.hijos.map((h) => (
              <Link key={h.estudianteId} href={`/escolar/estudiantes/${h.estudianteId}`}
                className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zero-100 text-[11px] font-semibold text-zero-700">
                  {h.nombre.trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{h.nombre}</span>
                <span className="shrink-0 text-xs text-gray-500">{h.curso ?? 'sin matrícula'}</span>
                <Badge variant="outline" className="shrink-0 capitalize text-gray-600">
                  {h.estado ?? '—'}
                </Badge>
                <span className={`shrink-0 text-sm font-semibold ${
                  h.deudaCentavos > 0 ? 'text-red-600' : 'text-zero-700'}`}>
                  {h.deudaCentavos > 0 ? fmtDOP(h.deudaCentavos) : 'Al día'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      {/* La mensualidad automática: es lo que explica por qué aparecen cargos
          sin que nadie los cree — y, sobre todo, por qué DEJAN de aparecer.
          Un plan pausado no avisa a nadie; la familia simplemente deja de
          recibir facturas. */}
      {data.recurrentes.length > 0 && (
        <Panel titulo="Mensualidad automática">
          <div className="divide-y divide-gray-100">
            {data.recurrentes.map((r) => (
              <div key={r.matriculaId} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className="font-medium text-gray-900">{r.alumno}</span>
                <span className="text-xs text-gray-500">{r.periodo ?? 'sin período'}</span>
                {!r.facturaRecurrenteId ? (
                  <span className="ml-auto text-xs text-amber-700">
                    Sin plan: sus mensualidades no se facturan solas
                  </span>
                ) : (
                  <>
                    <Badge className={r.estado === 'activa'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'}>
                      {r.estado === 'activa' ? 'Activa' : (r.estado ?? 'pausada')}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {r.diaCobro ? `cobra el día ${r.diaCobro}` : 'sin día de cobro'}
                    </span>
                    <span className="ml-auto text-xs text-gray-600">
                      {r.proximaEmision
                        ? `próxima ${fmtFechaCorta(r.proximaEmision)}`
                        : 'sin próxima emisión'}
                    </span>
                    <Link href={`/dashboard/facturas-recurrentes/${r.facturaRecurrenteId}`}
                      className="shrink-0 text-xs text-zero-600 hover:underline">
                      Ver plan
                    </Link>
                  </>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* El detalle, en pestañas: cinco tablas apiladas eran una pared. */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 px-2">
          {([['cuenta', `Estado de cuenta (${data.cargos.length})`],
             ['pagos', `Pagos (${data.pagos.length})`],
             ['facturas', `Facturas sueltas (${data.facturas.length})`],
             ['avisos', `Recordatorios (${data.avisosProgramados.length + data.avisos.length})`]] as const)
            .map(([v, etiqueta]) => (
            <button key={v} type="button" onClick={() => setVista(v)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                vista === v ? 'border-zero-600 text-zero-700' : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}>
              {etiqueta}
            </button>
          ))}
          <div className="ml-auto py-1.5">
            <Button size="sm" variant="outline" onClick={() => exportar(vista, data)}>
              <Download className="mr-1.5 h-4 w-4" />Exportar
            </Button>
          </div>
        </div>

        <div className="p-4">
          {vista === 'cuenta' && (
            porHijo.length === 0 ? <Vacio texto="Sin cargos registrados." /> : (
              <div className="space-y-3">
                {porHijo.map((h) => {
                  const abierto = hijoAbierto === h.alumno || porHijo.length === 1;
                  return (
                    <div key={h.alumno} className="overflow-hidden rounded-lg border border-gray-200">
                      <button type="button"
                        onClick={() => setHijoAbierto(abierto && porHijo.length > 1 ? null : h.alumno)}
                        className="flex w-full flex-wrap items-center gap-3 bg-gray-50 px-3 py-2.5 text-left hover:bg-gray-100">
                        <span className="font-medium text-gray-900">{h.alumno}</span>
                        <span className="text-xs text-gray-500">{h.cargos.length} cargo(s)</span>
                        {h.vencido > 0 && (
                          <Badge className="border-red-200 bg-red-50 text-red-700">
                            {fmtDOP(h.vencido)} vencido
                          </Badge>
                        )}
                        <span className="ml-auto text-sm">
                          <span className="text-gray-500">de {fmtDOP(h.total)} debe </span>
                          <b className={h.pendiente > 0 ? 'text-red-600' : 'text-zero-700'}>
                            {fmtDOP(h.pendiente)}
                          </b>
                        </span>
                      </button>

                      {abierto && (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-t border-gray-100 text-left text-xs uppercase text-gray-500">
                              <th className="px-3 py-2 font-medium">Concepto</th>
                              <th className="px-3 py-2 font-medium">Mes</th>
                              <th className="px-3 py-2 font-medium">Vence</th>
                              <th className="px-3 py-2 font-medium">Factura</th>
                              <th className="px-3 py-2 text-right font-medium">Monto</th>
                              <th className="px-3 py-2 text-right font-medium">Pendiente</th>
                            </tr>
                          </thead>
                          <tbody>
                            {h.cargos.map((g) => {
                              const atrasado = g.saldoCentavos > 0 && !!g.fechaVencimiento
                                && g.fechaVencimiento < hoy;
                              return (
                                <tr key={g.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                                  <td className="px-3 py-2 text-gray-900">{g.concepto ?? 'Sin concepto'}</td>
                                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                                    {g.mes ? `${MESES[g.mes]} ${g.anio}` : g.anio}
                                  </td>
                                  <td className={`whitespace-nowrap px-3 py-2 ${atrasado ? 'font-medium text-red-600' : 'text-gray-500'}`}>
                                    {g.fechaVencimiento ? fmtFechaCorta(g.fechaVencimiento) : '—'}
                                  </td>
                                  <td className="px-3 py-2">
                                    {g.ecfDocumentId ? (
                                      <Link href={`/dashboard/facturas/${g.ecfDocumentId}`}
                                        className="text-xs text-zero-600 hover:underline">
                                        {g.encf || g.codigo || 'Ver'}
                                      </Link>
                                    ) : <span className="text-xs text-amber-700">Sin facturar</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right text-gray-800">{fmtDOP(g.montoCentavos)}</td>
                                  <td className="px-3 py-2 text-right">
                                    <span className={g.saldoCentavos > 0 ? 'font-medium text-red-600' : 'text-zero-700'}>
                                      {fmtDOP(g.saldoCentavos)}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {vista === 'pagos' && (
            data.pagos.length === 0 ? <Vacio texto="Todavía no ha pagado nada." /> : (
              <Tabla cabeceras={['Fecha', 'Alumno', 'Factura', 'Método', 'Referencia', 'Monto']} numericas={[5]}>
                {data.pagos.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">{fmtFechaCorta(p.fechaPago)}</td>
                    <td className="px-3 py-2 text-gray-700">{p.alumno ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Link href={`/dashboard/facturas/${p.ecfDocumentId}`}
                        className="text-xs text-zero-600 hover:underline">
                        {p.encf || p.codigo || `#${p.ecfDocumentId}`}
                      </Link>
                    </td>
                    <td className="px-3 py-2 capitalize text-gray-600">{p.metodo ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{p.referencia ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">{fmtDOP(p.montoCentavos)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-3 py-2" colSpan={5}>Total cobrado</td>
                  <td className="px-3 py-2 text-right">{fmtDOP(totalPagado)}</td>
                </tr>
              </Tabla>
            )
          )}

          {vista === 'facturas' && (
            data.facturas.length === 0 ? (
              <Vacio texto="Ninguna factura fuera del plan de cobro." />
            ) : (
              <Tabla cabeceras={['Fecha', 'Comprobante', 'Monto', 'Pagado', 'Pendiente']} numericas={[2, 3, 4]}>
                {data.facturas.map((f) => {
                  const saldo = Math.max(0, f.montoTotal - f.pagadoCentavos);
                  return (
                    <tr key={f.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">{fmtFechaCorta(f.fecha)}</td>
                      <td className="px-3 py-2">
                        <Link href={`/dashboard/facturas/${f.id}`} className="text-zero-600 hover:underline">
                          {f.encf || f.codigo || `#${f.id}`}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-800">{fmtDOP(f.montoTotal)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {f.pagadoCentavos > 0 ? fmtDOP(f.pagadoCentavos) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={saldo > 0 ? 'font-medium text-red-600' : 'text-zero-700'}>
                          {fmtDOP(saldo)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </Tabla>
            )
          )}

          {vista === 'avisos' && (
            <div className="space-y-4">
              {/* Lo que le VA a salir, con la misma cuenta que usa el cron:
                  si aquí no aparece, el motor tampoco lo va a mandar. */}
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Programados
                </p>
                {data.avisosProgramados.length === 0 ? (
                  <Vacio texto="No le toca ningún recordatorio: sus cargos no tienen avisos encendidos." />
                ) : (
                  <Tabla cabeceras={['Cuándo sale', 'Alumno', 'Aviso', 'Canales', 'Monto']} numericas={[4]}>
                    {data.avisosProgramados.map((a, i) => (
                      <tr key={`${a.estudianteId}-${a.tipo}-${i}`} className="border-t border-gray-100">
                        <td className="whitespace-nowrap px-3 py-2 text-gray-600">{fmtFechaCorta(a.fecha)}</td>
                        <td className="px-3 py-2 text-gray-900">{a.alumno}</td>
                        <td className="px-3 py-2 text-gray-700">
                          {AVISO_TEXTO[a.tipo] ?? a.tipo}
                          {a.concepto && <span className="block text-xs text-gray-400">{a.concepto}</span>}
                        </td>
                        <td className="px-3 py-2 capitalize text-gray-600">{a.canales.join(', ')}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{fmtDOP(a.montoCentavos)}</td>
                      </tr>
                    ))}
                  </Tabla>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Ya enviados
                </p>
            {data.avisos.length === 0 ? (
              <Vacio texto="Todavía no se le ha mandado ningún recordatorio." />
            ) : (
              <Tabla cabeceras={['Cuándo', 'Alumno', 'Aviso', 'Canal', 'A dónde fue']}>
                {data.avisos.map((a) => (
                  <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">{fmtFechaCorta(a.enviadoAt)}</td>
                    <td className="px-3 py-2 text-gray-900">{a.alumno}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {AVISO_TEXTO[a.tipo] ?? a.tipo}
                      {a.concepto && <span className="block text-xs text-gray-400">{a.concepto}</span>}
                    </td>
                    <td className="px-3 py-2 capitalize text-gray-600">{a.canal}</td>
                    {/* El destino de ese día, no el de hoy: eso es lo que lo
                        convierte en constancia. */}
                    <td className="px-3 py-2 text-gray-500">{a.destino ?? '—'}</td>
                  </tr>
                ))}
              </Tabla>
            )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** Saca a CSV lo que se está mirando, no la ficha entera. */
function exportar(vista: (typeof VISTAS)[number], d: DetalleResponsable) {
  const nombre = (d.contacto?.razonSocial ?? 'familia').replace(/[^\w]+/g, '-').toLowerCase();
  if (vista === 'cuenta') {
    descargarCsv(`estado-de-cuenta-${nombre}.csv`, [
      ['Alumno', 'Concepto', 'Mes', 'Año', 'Vence', 'Factura', 'Monto', 'Pendiente', 'Estado'],
      ...d.cargos.map((g) => [
        g.alumno, g.concepto ?? '', g.mes ? MESES[g.mes] : '', g.anio,
        g.fechaVencimiento ?? '', g.encf || g.codigo || '',
        (g.montoCentavos / 100).toFixed(2), (g.saldoCentavos / 100).toFixed(2), g.estado,
      ]),
    ]);
  } else if (vista === 'pagos') {
    descargarCsv(`pagos-${nombre}.csv`, [
      ['Fecha', 'Alumno', 'Factura', 'Método', 'Referencia', 'Monto'],
      ...d.pagos.map((p) => [
        p.fechaPago.slice(0, 10), p.alumno ?? '', p.encf || p.codigo || '',
        p.metodo ?? '', p.referencia ?? '', (p.montoCentavos / 100).toFixed(2),
      ]),
    ]);
  } else if (vista === 'facturas') {
    descargarCsv(`facturas-${nombre}.csv`, [
      ['Fecha', 'Comprobante', 'Monto', 'Pagado', 'Pendiente'],
      ...d.facturas.map((f) => [
        f.fecha.slice(0, 10), f.encf || f.codigo || '',
        (f.montoTotal / 100).toFixed(2), (f.pagadoCentavos / 100).toFixed(2),
        (Math.max(0, f.montoTotal - f.pagadoCentavos) / 100).toFixed(2),
      ]),
    ]);
  } else {
    descargarCsv(`recordatorios-${nombre}.csv`, [
      ['Cuándo', 'Alumno', 'Aviso', 'Canal', 'Destino'],
      ...d.avisos.map((a) => [
        a.enviadoAt.slice(0, 16).replace('T', ' '), a.alumno,
        AVISO_TEXTO[a.tipo] ?? a.tipo, a.canal, a.destino ?? '',
      ]),
    ]);
  }
}

function Chip({ k, v }: { k: string; v: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs">
      <span className="text-gray-400">{k}</span>
      <b className="font-semibold text-gray-800">{v}</b>
    </span>
  );
}

const TONOS = {
  gris:  'text-gray-900',
  red:   'text-red-600',
  ambar: 'text-amber-700',
} as const;

function Cifra({ icon: Icon, label, valor, detalle, tono = 'gris' }: {
  icon: typeof Receipt; label: string; valor: string; detalle: string;
  tono?: keyof typeof TONOS;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        <Icon className="h-3.5 w-3.5" />{label}
      </div>
      <p className={`mt-1 truncate text-2xl font-bold ${TONOS[tono]}`}>{valor}</p>
      <p className="truncate text-xs text-gray-400">{detalle}</p>
    </div>
  );
}

function Panel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
      </div>
      {children}
    </div>
  );
}

const BARRA = {
  zero:  'bg-zero-500',
  red:   'bg-red-500',
  ambar: 'bg-amber-500',
} as const;

/**
 * Una barra con su cifra. Sin librería: son tres barras y una regla de tres,
 * y la CSP de la app no deja cargar nada de fuera.
 */
function Barra({ etiqueta, valor, total, detalle, tono = 'zero' }: {
  etiqueta: string; valor: number; total: number; detalle?: string;
  tono?: keyof typeof BARRA;
}) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 truncate text-gray-700">{etiqueta}</span>
        <span className="shrink-0 font-medium text-gray-900">{fmtDOP(valor)}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${BARRA[tono]}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-0.5 text-xs text-gray-400">
        {pct}%{detalle ? ` · ${detalle}` : ''}
      </p>
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <p className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
      {texto}
    </p>
  );
}

function Tabla({ cabeceras, numericas = [], children }: {
  cabeceras: string[]; numericas?: number[]; children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            {cabeceras.map((c, i) => (
              <th key={c} className={`px-3 py-2 font-medium ${numericas.includes(i) ? 'text-right' : ''}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

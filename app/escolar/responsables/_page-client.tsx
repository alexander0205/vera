'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  AlertTriangle, FileText, Loader2, Mail, MessageCircle, Receipt, Search,
  Smartphone, Users, Wallet, X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Paginador } from '@/components/ui/paginador';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { useUrlParams } from '@/lib/hooks/useUrlEstado';
import type { FilaResponsable } from '@/lib/administracion-escolar/responsables';

/**
 * Las familias que pagan.
 *
 * La deuda del colegio se veía alumno por alumno, y el que paga no es el
 * alumno: es el padre, que muchas veces tiene tres hijos en el mismo colegio.
 * Nadie podía contestar «¿cuánto deben los Abreu?» sin abrir tres fichas y
 * sumar a mano.
 *
 * El segundo motivo es más grave: en esta base 303 de 306 familias no tienen
 * ni correo, ni celular, ni WhatsApp. Ningún recordatorio les puede llegar, y
 * eso solo se descubría cuando el envío fallaba —dentro de otra pantalla—.
 * Aquí es una columna, y el filtro «Sin contacto» las junta todas.
 */

interface Resp {
  filas: FilaResponsable[];
  total: number;
  incontactables: number;
  sinFicha: number;
  stats: {
    familias: number; conDeuda: number;
    deudaTotalCentavos: number; incontactables: number;
  };
}

interface Detalle {
  hijos: { estudianteId: number | null; nombre: string; curso: string | null;
    estado: string | null; deudaCentavos: number; cargos: number }[];
  facturas: { id: number; codigo: string | null; encf: string | null; fecha: string;
    montoTotal: number; pagadoCentavos: number }[];
  avisos: { id: number; enviadoAt: string; tipo: string; canal: string;
    destino: string | null; alumno: string; concepto: string | null }[];
}

const traer = (u: string) => fetch(u).then((r) => {
  if (!r.ok) throw new Error('No se pudo cargar');
  return r.json();
});

const POR_PAGINA = 25;

export default function ResponsablesClient() {
  const { params, setParams } = useUrlParams();
  const filtro = params.get('filtro') ?? 'todos';
  const pagina = Number(params.get('p')) || 1;

  // Lo que se teclea va aparte de lo que viaja: una consulta por tecla sobre
  // seiscientos contactos no adelanta nada.
  const [texto, setTexto] = useState(params.get('q') ?? '');
  const q = params.get('q') ?? '';

  const url = `/api/administracion-escolar/responsables?filtro=${filtro}`
    + `&limit=${POR_PAGINA}&offset=${(pagina - 1) * POR_PAGINA}`
    + (q ? `&q=${encodeURIComponent(q)}` : '');
  /**
   * `keepPreviousData` para que cambiar de página no parpadee a vacío, y
   * `dedupingInterval` para que volver de la ficha de una familia no repita la
   * consulta pesada del listado: son cuatro LATERAL por contacto.
   */
  const { data, isLoading, error } = useSWR<Resp>(url, traer, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });

  // La familia abierta vive en la URL: se puede enlazar, y volver del contacto
  // no pierde a quién estabas mirando.
  const abierta = Number(params.get('familia')) || null;
  const { data: detalle } = useSWR<Detalle>(
    abierta ? `/api/administracion-escolar/responsables/${abierta}` : null,
    traer, { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );
  /**
   * El aviso de las familias sin contacto se puede cerrar, y no vuelve.
   *
   * Es un dato que se lee una vez y después estorba: quien ya sabe que tiene
   * trescientas familias sin teléfono no necesita que se lo repitan cada vez
   * que abre la pantalla. Se guarda en el navegador porque es una preferencia
   * de quien mira, no del colegio.
   */
  const [avisoCerrado, setAvisoCerrado] = useState(false);
  useEffect(() => {
    setAvisoCerrado(localStorage.getItem('escolar.responsables.avisoSinContacto') === 'oculto');
  }, []);
  const cerrarAviso = () => {
    localStorage.setItem('escolar.responsables.avisoSinContacto', 'oculto');
    setAvisoCerrado(true);
  };

  const filas = data?.filas ?? [];
  const filaAbierta = filas.find((f) => f.clientId === abierta) ?? null;
  const total = data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <section className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Responsables de pago</h1>
          <p className="mt-1 text-sm text-gray-500">
            Las familias que pagan, con sus hijos y su deuda junta.
          </p>
        </div>
      </div>

      {/* Las cifras del colegio, como en Estudiantes: del team entero, no de
          la página ni del filtro. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Users} label="Familias" value={data ? String(data.stats.familias) : '—'} />
        <StatCard icon={Wallet} label="Deuda total"
          value={data ? fmtDOP(data.stats.deudaTotalCentavos) : '—'}
          accent={(data?.stats.deudaTotalCentavos ?? 0) > 0} />
        <StatCard icon={AlertTriangle} label="Con deuda"
          value={data ? String(data.stats.conDeuda) : '—'}
          accent={(data?.stats.conDeuda ?? 0) > 0} />
        <StatCard icon={MessageCircle} label="Sin contacto"
          value={data ? String(data.stats.incontactables) : '—'}
          accent={(data?.stats.incontactables ?? 0) > 0} />
      </div>

      {/* Un renglón discreto y que se puede cerrar, no un bloque rojo: el dato
          importa pero se lee una vez, y en rojo grande sobre la pantalla
          entera acababa siendo ruido. Para verlas está el filtro «Sin
          contacto», que es donde se busca cuando se quiere actuar. */}
      {(data?.incontactables ?? 0) > 0 && !avisoCerrado && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="flex-1 text-xs text-amber-900">
            {data?.incontactables} de {data?.stats.familias} familias no tienen correo, celular ni WhatsApp:
            a esas no les llega ningún recordatorio.
          </p>
          <button type="button" onClick={cerrarAviso}
            className="shrink-0 rounded p-0.5 text-amber-700/70 hover:bg-amber-100 hover:text-amber-900"
            aria-label="Ocultar el aviso">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Tabla y ficha al lado, igual que en Estudiantes: se recorre a la
          izquierda y se mira el detalle a la derecha sin perder el sitio en la
          lista. Sin nadie abierto, la tabla ocupa el ancho entero. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className={filaAbierta ? 'lg:col-span-2' : 'lg:col-span-3'}>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Directorio de familias</h2>
            <Badge variant="outline" className="border-zero-200 bg-zero-50 text-zero-700">
              {total} registro{total !== 1 ? 's' : ''}
            </Badge>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input className="pl-8" placeholder="Buscar por nombre o RNC…"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') setParams({ q: texto || null, p: null }); }} />
            </div>
            {([['todos', 'Todas'], ['con-deuda', 'Con deuda'], ['sin-contacto', 'Sin contacto'],
               ['sin-ficha', `Falta traerlas${data?.sinFicha ? ` (${data.sinFicha})` : ''}`]] as const)
              .map(([v, etiqueta]) => (
                <button key={v} type="button"
                  onClick={() => setParams({ filtro: v === 'todos' ? null : v, p: null })}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    filtro === v
                      ? 'border-zero-600 bg-zero-600 font-medium text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}>
                  {etiqueta}
                </button>
              ))}
          </div>

          {error ? (
            <p className="py-10 text-center text-sm text-red-600">No se pudo cargar la lista.</p>
          ) : isLoading && filas.length === 0 ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-zero-600" /></div>
          ) : filas.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="font-medium text-gray-500">
                {filtro === 'sin-contacto'
                  ? 'Todas las familias tienen por dónde recibir avisos.'
                  : 'Ninguna familia coincide.'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[52rem] text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                      <th className="px-3 py-2 font-medium">Familia</th>
                      <th className="px-3 py-2 font-medium">Hijos</th>
                      <th className="px-3 py-2 font-medium">Avisos</th>
                      <th className="px-3 py-2 text-right font-medium">Deuda escolar</th>
                      <th className="px-3 py-2 text-right font-medium">Otras facturas</th>
                      <th className="px-3 py-2 font-medium">Más viejo sin pagar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.clientId}
                        onClick={() => setParams({ familia: String(f.clientId) })}
                        className={`cursor-pointer border-t border-gray-100 transition-colors ${
                          f.clientId === abierta ? 'bg-zero-50' : 'hover:bg-gray-50/60'
                        }`}>
                        <td className="px-3 py-2.5">
                          <span className="font-medium text-gray-900">{f.razonSocial}</span>
                          <span className="block text-xs text-gray-400">{f.rnc ?? 'sin documento'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">
                          {/* Alumnos del módulo y beneficiarios de Contactos son
                              dos cuentas distintas: el colegio puede facturarle
                              por tres hijos y tener solo uno con ficha escolar. */}
                          {f.alumnos > 0 ? `${f.alumnos} con ficha` : 'sin ficha'}
                          {f.beneficiarios > f.alumnos && (
                            <span className="block text-xs text-gray-400">
                              {f.beneficiarios} en Contactos
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5"><Canales fila={f} /></td>
                        <td className="px-3 py-2.5 text-right">
                          {f.deudaEscolarCentavos > 0
                            ? <span className="font-medium text-red-600">{fmtDOP(f.deudaEscolarCentavos)}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {f.deudaFacturasCentavos > 0
                            ? <span className="font-medium text-amber-700">{fmtDOP(f.deudaFacturasCentavos)}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-gray-500">
                          {f.venceMasViejo ? fmtFechaCorta(f.venceMasViejo) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Paginador
                  pagina={pagina}
                  paginas={paginas}
                  total={total}
                  porPagina={POR_PAGINA}
                  cargando={isLoading}
                  onCambiar={(p) => setParams({ p: p === 1 ? null : String(p) })} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {filaAbierta && (
        <div>
          <FamiliaFicha
            fila={filaAbierta}
            detalle={detalle}
            onCerrar={() => setParams({ familia: null })}
          />
        </div>
      )}
      </div>
    </section>
  );
}

/**
 * La familia abierta: sus hijos, lo que debe cada uno y qué se le ha mandado.
 *
 * Es la pregunta que no se podía contestar sin abrir tres fichas y sumar a
 * mano: «¿cuánto deben los Abreu y por qué?».
 */
function FamiliaFicha({ fila, detalle, onCerrar }: {
  fila: FilaResponsable;
  detalle: Detalle | undefined;
  onCerrar: () => void;
}) {
  const deuda = fila.deudaEscolarCentavos + fila.deudaFacturasCentavos;
  const hijos = detalle?.hijos ?? [];
  const facturasPendientes = (detalle?.facturas ?? [])
    .filter((f) => f.montoTotal - f.pagadoCentavos > 0).length;

  return (
    // Misma tarjeta que la ficha del estudiante: encabezado con iniciales,
    // cuatro datos en cuadrícula, los contactos como filas y el dinero abajo
    // con sus iconos. Dos fichas laterales del mismo módulo con dibujos
    // distintos obligan a aprender dos pantallas para lo mismo.
    <div className="sticky top-4 space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zero-100 font-semibold text-zero-700">
          {inicialesDe(fila.razonSocial)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-gray-900">{fila.razonSocial}</p>
          <p className="text-xs text-gray-500">
            {fila.rnc ?? 'Sin documento'} · {fila.alumnos} alumno{fila.alumnos === 1 ? '' : 's'}
          </p>
        </div>
        <button type="button" onClick={onCerrar}
          className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Cerrar la ficha">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MiniCard label="Hijos con ficha" value={String(fila.alumnos)} />
        <MiniCard label="En Contactos" value={String(fila.beneficiarios)} />
        <MiniCard label="Más viejo sin pagar"
          value={fila.venceMasViejo ? fmtFechaCorta(fila.venceMasViejo) : '—'}
          accent={!!fila.venceMasViejo} />
        <MiniCard label="Facturas por cobrar" value={String(facturasPendientes)}
          accent={facturasPendientes > 0} />
      </div>

      {/* Por dónde se le escribe. Lo que falta, en rojo. */}
      <div className="space-y-1.5 border-t border-gray-100 pt-3 text-sm">
        <Row label="Correo" value={fila.email || 'Falta'} falta={!fila.email} />
        <Row label="WhatsApp" value={fila.whatsapp || fila.celular || 'Falta'}
          falta={!(fila.whatsapp || fila.celular)} />
        <Row label="Celular (SMS)" value={fila.celular || fila.whatsapp || 'Falta'}
          falta={!(fila.celular || fila.whatsapp)} />
      </div>

      <div className="space-y-2 border-t border-gray-100 pt-3">
        <TotalRow icon={Receipt} tone="gray" label="Deuda escolar"
          value={fmtDOP(fila.deudaEscolarCentavos)} muted={fila.deudaEscolarCentavos === 0} />
        <TotalRow icon={FileText} tone="amber" label="Otras facturas"
          value={fmtDOP(fila.deudaFacturasCentavos)} muted={fila.deudaFacturasCentavos === 0} />
        <TotalRow icon={AlertTriangle} tone="red" label="Debe en total"
          value={fmtDOP(deuda)} muted={deuda === 0} />
      </div>

      {/* Los hijos, con lo que debe cada uno: es lo que se mira antes de
          llamar, y con la familia delante hace falta saber por cuál. */}
      <div className="border-t border-gray-100 pt-3">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">Hijos</p>
        {!detalle ? (
          <div className="flex justify-center py-3"><Loader2 className="h-5 w-5 animate-spin text-zero-600" /></div>
        ) : hijos.length === 0 ? (
          <p className="text-sm text-gray-500">Sin alumnos con ficha escolar.</p>
        ) : (
          <div className="space-y-1.5">
            {hijos.map((h) => (
              <Link key={h.estudianteId} href={`/escolar/estudiantes/${h.estudianteId}`}
                className="flex items-baseline gap-2 rounded-md px-1 py-1 text-sm hover:bg-gray-50">
                <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{h.nombre}</span>
                <span className="shrink-0 text-xs text-gray-500">{h.curso ?? 'sin matrícula'}</span>
                <span className={`shrink-0 font-semibold ${h.deudaCentavos > 0 ? 'text-red-600' : 'text-zero-700'}`}>
                  {h.deudaCentavos > 0 ? fmtDOP(h.deudaCentavos) : 'Al día'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Lo último que se le mandó: la constancia cuando dice que no le avisaron. */}
      {detalle && detalle.avisos.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Último recordatorio
          </p>
          <p className="text-sm text-gray-900">{detalle.avisos[0].alumno}</p>
          <p className="text-xs text-gray-500">
            {fmtFechaCorta(detalle.avisos[0].enviadoAt)} · {detalle.avisos[0].canal}
            {detalle.avisos[0].destino ? ` · ${detalle.avisos[0].destino}` : ''}
          </p>
        </div>
      )}

      <div className="space-y-2 border-t border-gray-100 pt-3">
        <Button asChild className="w-full bg-zero-600 hover:bg-zero-700">
          <Link href={`/escolar/responsables/${fila.clientId}`}>Abrir ficha completa</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href={`/dashboard/clientes/${fila.clientId}/editar`}>Editar contacto</Link>
        </Button>
      </div>
    </div>
  );
}

/** Misma tarjeta que en Estudiantes: la cifra del colegio, no de la página. */
function StatCard({ icon: Icon, label, value, accent }: {
  icon: typeof Users; label: string; value: string; accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
          <Icon className="h-3.5 w-3.5" />{label}
        </div>
        <p className={`mt-1 truncate text-2xl font-bold ${accent ? 'text-red-600' : 'text-gray-900'}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

/** Las iniciales de la familia, para el avatar. */
function inicialesDe(nombre: string): string {
  return nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '—';
}

function MiniCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 p-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`truncate text-sm font-semibold ${accent ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

const TONES = {
  gray:  { box: 'bg-gray-100 text-gray-600',  val: 'text-gray-900' },
  amber: { box: 'bg-amber-100 text-amber-700', val: 'text-amber-700' },
  red:   { box: 'bg-red-100 text-red-600',    val: 'text-red-600' },
} as const;

function TotalRow({ icon: Icon, tone, label, value, muted }: {
  icon: typeof Receipt; tone: keyof typeof TONES; label: string; value: string; muted?: boolean;
}) {
  const t = TONES[tone];
  return (
    <div className="flex items-center gap-2.5">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${muted ? 'bg-gray-100 text-gray-400' : t.box}`}>
        <Icon className="h-4 w-4" />
      </div>
      <span className="flex-1 text-sm text-gray-500">{label}</span>
      <span className={`text-sm font-semibold ${muted ? 'text-gray-400' : t.val}`}>{value}</span>
    </div>
  );
}

/** Fila etiqueta/valor. Lo que falta va en rojo, no en gris. */
function Row({ label, value, falta }: { label: string; value: string; falta?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className={`truncate text-right ${falta ? 'font-medium text-red-600' : 'text-gray-700'}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * Por dónde se le puede escribir a esta familia.
 *
 * Rojo = ese canal no existe. El mismo orden de preferencia que usa el motor
 * de avisos: WhatsApp cae al celular y el SMS al celular antes que al fijo,
 * que no recibe nada.
 */
function Canales({ fila }: { fila: FilaResponsable }) {
  const canales = [
    { icon: Mail, label: 'Correo', valor: fila.email?.trim() || null },
    { icon: MessageCircle, label: 'WhatsApp', valor: fila.whatsapp?.trim() || fila.celular?.trim() || null },
    { icon: Smartphone, label: 'SMS', valor: fila.celular?.trim() || fila.whatsapp?.trim() || null },
  ];
  const faltan = canales.filter((c) => !c.valor).length;

  return (
    <span className="inline-flex items-center gap-1.5">
      {canales.map((c) => (
        <span key={c.label} title={c.valor ? `${c.label}: ${c.valor}` : `Sin ${c.label}`}>
          <c.icon className={`h-4 w-4 ${c.valor ? 'text-zero-600' : 'text-red-500'}`}
            aria-label={c.valor ? `${c.label} puesto` : `Sin ${c.label}`} />
        </span>
      ))}
      {faltan === canales.length && (
        <Badge variant="outline" className="border-red-200 bg-red-50 text-[10px] text-red-700">
          No se le puede avisar
        </Badge>
      )}
    </span>
  );
}

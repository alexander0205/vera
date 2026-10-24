'use client';

import { Tooltip } from '@/components/ui/tooltip';

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { Check, ExternalLink, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDOP, fmtFechaCorta, hoyRD, parseDOPaCentavos } from '@/lib/utils/format';
import { vencimientoDe } from '@/lib/administracion-escolar/calendario';
import {
  alQuitarConcepto, cadaCuanto, conceptosParaAgregar, cuantos, filasDeConceptos, listaEfectiva,
  otraMensualidadQueYaTiene, precioCambiable, resumenDeConcepto, seAgregaComo,
  type CargoDeMatricula, type FilaDeConcepto,
} from '@/lib/administracion-escolar/cobros-matricula';

/**
 * «Lo que se le cobra»: la cuenta de una matrícula, un renglón por concepto.
 *
 * Aquí había dos tarjetas —los conceptos que el sistema le carga solo y,
 * debajo, los cargos del año mes por mes, cada uno con su lápiz—. Se pidió
 * dejar UNA lista de conceptos desde la que se cambia el monto, se quita o se
 * agrega otro; el detalle mes por mes se quedó en la ficha del estudiante.
 *
 * Todo lo de esta tarjeta se aplica EN EL ACTO, no al pulsar «Guardar
 * cambios» (ese botón guarda el curso, la fecha y el estado). Cada acción dice
 * antes qué va a pasar, con el dinero en pesos, y avisa al terminar.
 *
 * Tres cosas que esta tarjeta NO hace, a propósito, porque costaron dinero en
 * la revisión:
 *  - No toca un cargo con factura ni uno con pagos (`libresIds`).
 *  - Quitar NO perdona deuda por sí solo: «dejar de cobrárselo» y «perdonarle
 *    lo que debe» son dos botones, y el segundo dice cuánto.
 *  - No promete un precio para lo que el sistema genere después: aquí se
 *    cambia el monto de los cargos que ya existen.
 *
 * No hay ruta nueva: cada cosa usa la que ya existía y sus mismas guardas.
 *  - Monto: `PATCH cargos/[id]`, cargo por cargo.
 *  - Dejar de cobrar: `PATCH matriculas/[id]` con la lista sin el concepto.
 *  - Perdonar: `DELETE cargos/[id]` (anula, no borra) de los cargos libres.
 *  - Agregar: `PATCH matriculas/[id]` si se repite, o `POST cargos` si es de
 *    una sola vez.
 *
 * HTML nativo: en este proyecto los estilos de MUI ganan a las utilidades de
 * Tailwind, y con sus componentes los tamaños de aquí no se dejan fijar.
 */

interface ConceptoDelCatalogo {
  id: number;
  nombre: string;
  tipo: string;
  activo?: boolean;
  frecuencia?: unknown;
  /** Días para pagar desde que nace el cargo. `null` = sin fecha límite. */
  diasParaPago?: number | null;
}

type Carga = 'cargando' | 'lista' | 'fallo';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** El mensaje del servidor, o el de respaldo si la respuesta no se pudo leer. */
async function pedir(ruta: string, init: RequestInit, respaldo: string): Promise<Record<string, unknown>> {
  const res = await fetch(ruta, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : respaldo);
  return data;
}

const cargosDe = (n: number) => cuantos(n, 'cargo', 'cargos');

export function ConceptosDeLaMatricula({
  matriculaId, estudianteId, periodoId, alumno, inscritoDesde, estado,
  catalogo, automaticos, carga, cargos, cargosCargando, cargosIncompletos, editable,
  onAutomaticos, recargarCargos, onCambio, generacionId = null,
}: {
  matriculaId: number;
  estudianteId: number;
  periodoId: number;
  /** De quién es: va en el título y en cada confirmación. */
  alumno: string | null;
  /** La fecha de inscripción GUARDADA: desde ahí arma el sistema lo que le carga. */
  inscritoDesde: string | null;
  /** El estado GUARDADO de la matrícula. */
  estado: string;
  catalogo: ConceptoDelCatalogo[];
  /** Lo que el sistema le carga solo, tal como está guardado. */
  automaticos: number[];
  /** Cómo va la petición de esa lista: vacía porque no llegó no es «no tiene». */
  carga: Carga;
  cargos: CargoDeMatricula[];
  cargosCargando: boolean;
  /** La matrícula tiene más cargos de los que llegaron: no se puede operar a ciegas. */
  cargosIncompletos: boolean;
  editable: boolean;
  /** La lista ya se guardó en el servidor con estos conceptos. */
  onAutomaticos: (ids: number[]) => void;
  /** La generación (concepto de mensualidad) de la matrícula, si tiene. */
  generacionId?: number | null;
  /** Vuelve a pedir los cargos de la matrícula. */
  recargarCargos: () => Promise<void>;
  /** La cuenta cambió: la ficha del estudiante tiene que volver a pedirla. */
  onCambio: () => void;
}) {
  // Lo que el sistema le carga DE VERDAD: una matrícula antigua puede tener la
  // lista vacía y seguir cobrando por las cuotas que ya tenía.
  const efectivos = useMemo(() => listaEfectiva(automaticos, cargos), [automaticos, cargos]);
  const filas = useMemo(() => filasDeConceptos(cargos, efectivos, catalogo), [cargos, efectivos, catalogo]);
  const paraAgregar = useMemo(() => conceptosParaAgregar(catalogo, filas), [catalogo, filas]);
  const pendiente = filas.reduce((s, f) => s + f.pendienteCentavos, 0);
  const activa = estado === 'activa';
  const deQuien = alumno ? ` de ${alumno}` : '';
  const aQuien = alumno ? ` a ${alumno}` : '';

  /** Qué renglón tiene abierto algo debajo, y qué. */
  const [abierto, setAbierto] = useState<{ id: number; que: 'precio' | 'quitar' } | null>(null);
  const [valor, setValor] = useState('');
  /** El concepto que se está agregando, ya elegido en el desplegable. */
  const [nuevo, setNuevo] = useState<ConceptoDelCatalogo | null>(null);
  const [montoNuevo, setMontoNuevo] = useState('');
  /** Hay una acción en marcha: nada más se deja pulsar hasta que termine. */
  const [ocupado, setOcupado] = useState(false);
  /**
   * La misma guarda, pero que llega a tiempo entre dos teclas: el estado tarda
   * un pintado en enterarse, y un Enter repetido mandaba dos veces el mismo
   * cargo.
   */
  const enMarcha = useRef(false);

  async function unaALaVez(tarea: () => Promise<void>) {
    if (enMarcha.current) return;
    enMarcha.current = true;
    setOcupado(true);
    try { await tarea(); } finally { enMarcha.current = false; setOcupado(false); }
  }

  function cerrarTodo() {
    setAbierto(null); setNuevo(null); setMontoNuevo('');
  }

  /** Enter confirma una sola vez (la tecla apretada no cuenta) y Escape cierra. */
  function teclas(confirmar: () => void, cerrar: () => void) {
    return (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) confirmar(); }
      if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
    };
  }

  async function guardarLista(ids: number[]) {
    await pedir(`/api/administracion-escolar/matriculas/${matriculaId}`, {
      method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ conceptosIds: ids }),
    }, 'No se pudo guardar el cambio en la matrícula');
    onAutomaticos(ids);
  }

  /**
   * El monto nuevo va a TODOS los cargos libres del concepto. Si uno falla se
   * para ahí y se dice cuántos sí cambiaron: seguir dejaría la cuenta con dos
   * montos sin que nadie supiera cuáles.
   */
  function cambiarPrecio(f: FilaDeConcepto) {
    const centavos = parseDOPaCentavos(valor);
    if (centavos == null) { toast.error('Escribe un monto válido'); return; }
    if (centavos === 0) {
      toast.error('El monto tiene que ser mayor que cero. Si no se le va a cobrar, quítale el concepto.');
      return;
    }
    if (f.montosLibres.length === 1 && f.montosLibres[0] === centavos) { setAbierto(null); return; }
    if (generacionId != null && f.conceptoId === generacionId) { cambiarMensualidad(f, centavos); return; }
    void unaALaVez(async () => {
      let hechos = 0;
      let fallo: string | null = null;
      for (const id of f.libresIds) {
        try {
          await pedir(`/api/administracion-escolar/cargos/${id}`, {
            method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ montoCentavos: centavos }),
          }, 'No se pudo cambiar el monto');
          hechos += 1;
        } catch (e: unknown) {
          fallo = e instanceof Error ? e.message : 'No se pudo cambiar el monto';
          break;
        }
      }
      // Se vuelve a pedir también si falló: puede haber cambiado alguno.
      await recargarCargos();
      if (hechos > 0) onCambio();
      if (fallo) {
        toast.error(hechos > 0
          ? `El monto cambió en ${hechos} de ${f.libresIds.length} cargos y ahí se detuvo: ${fallo}`
          : fallo);
      } else {
        toast.success(`«${f.nombre}»: ${cargosDe(hechos)} a ${fmtDOP(centavos)}`);
        setAbierto(null);
      }
    });
  }

  /**
   * La colegiatura no se cambia cargo a cargo: eso dejaba el precio guardado y
   * la facturación automática con el monto viejo, y el cron volvía a emitirlo
   * (revisión del PR #126). Se guarda como su monto propio —lo mismo que
   * «Configuración mensual»— y se ponen al día los cargos sin factura y el
   * plan recurrente.
   */
  function cambiarMensualidad(f: FilaDeConcepto, centavos: number) {
    void unaALaVez(async () => {
      try {
        await pedir(`/api/administracion-escolar/matriculas/${matriculaId}`, {
          method: 'PATCH', headers: JSON_HEADERS,
          body: JSON.stringify({ becaTipo: 'monto', becaValor: centavos, becaMotivo: 'Precio cambiado al editar la matrícula' }),
        }, 'No se pudo guardar el precio');
        const r = await pedir(`/api/administracion-escolar/matriculas/${matriculaId}/generar-mensualidades`, {
          method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({}),
        }, 'Se guardó el precio, pero no se pudieron poner al día los cargos') as {
          monto?: number; sinRecurrente?: boolean; recurrente?: string;
        };
        if (r.monto != null && r.monto !== centavos) {
          // El concepto no admite beca: el monto propio no lo toca.
          toast.warning(`«${f.nombre}» no admite monto propio y sigue a ${fmtDOP(r.monto)}. Cambia su precio en Configuración → Tarifas.`);
        } else if (r.sinRecurrente) {
          // Sin recurrente no hay calendario al que alinear: el monto va a los cargos libres.
          for (const id of f.libresIds) {
            await pedir(`/api/administracion-escolar/cargos/${id}`, {
              method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ montoCentavos: centavos }),
            }, 'No se pudo cambiar el monto');
          }
          toast.success(`«${f.nombre}» queda a ${fmtDOP(centavos)} al mes.`);
        } else {
          toast.success(`«${f.nombre}» queda a ${fmtDOP(centavos)} al mes, también en la facturación automática. Los meses ya facturados no cambian.`);
        }
        setAbierto(null);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el precio');
      }
      await recargarCargos();
      onCambio();
    });
  }

  /**
   * `perdonar` = además de dejar de cobrárselo, anular lo que debe.
   *
   * Primero se saca de lo que el sistema le carga, y después se anula. En ese
   * orden: si lo segundo falla a medias, el concepto ya no le genera nada
   * nuevo y lo que quede se quita desde su mismo renglón.
   */
  function quitar(f: FilaDeConcepto, perdonar: boolean) {
    void unaALaVez(async () => {
      let hechos = 0;
      try {
        if (f.automatico) await guardarLista(efectivos.filter((id) => id !== f.conceptoId));
        if (perdonar) {
          for (const id of f.libresIds) {
            await pedir(`/api/administracion-escolar/cargos/${id}`, { method: 'DELETE' }, 'No se pudo quitar el cargo');
            hechos += 1;
          }
        }
        toast.success(perdonar && hechos > 0
          ? `Se quitó «${f.nombre}»: ${cargosDe(hechos)} anulados (${fmtDOP(f.debeCentavos)})`
          : `El sistema ya no le carga «${f.nombre}»`);
        setAbierto(null);
      } catch (e: unknown) {
        const porque = e instanceof Error ? e.message : 'No se pudo quitar';
        toast.error(hechos > 0
          ? `Se anularon ${hechos} de ${f.libresIds.length} cargos y ahí se detuvo: ${porque}`
          : porque);
      }
      await recargarCargos();
      onCambio();
    });
  }

  function agregar(c: ConceptoDelCatalogo) {
    // Vacío = el precio que el colegio le tiene puesto; lo resuelve el servidor.
    const escrito = montoNuevo.trim();
    const centavos = escrito ? parseDOPaCentavos(escrito) : null;
    const comoCargo = seAgregaComo(c) === 'cargo';
    if (comoCargo && escrito && (centavos == null || centavos <= 0)) {
      toast.error('Escribe un monto válido, o deja el campo vacío para usar el del colegio.');
      return;
    }
    void unaALaVez(async () => {
      try {
        if (!comoCargo) {
          await guardarLista([...efectivos, c.id]);
          toast.success(`El sistema empieza a cargarle «${c.nombre}». Sus cargos salen cuando llegue su fecha.`);
        } else {
          const hoy = hoyRD();
          await pedir('/api/administracion-escolar/cargos', {
            method: 'POST', headers: JSON_HEADERS,
            body: JSON.stringify({
              estudianteId, matriculaId, periodoId, conceptoId: c.id,
              mes: null, anio: Number(hoy.slice(0, 4)),
              ...(centavos != null ? { montoCentavos: centavos } : {}),
              // El plazo que el colegio le puso al concepto, no «vence hoy».
              fechaVencimiento: vencimientoDe(hoy, c.diasParaPago ?? null),
            }),
          }, 'No se pudo agregar el cargo');
          toast.success(`Se agregó «${c.nombre}»`);
        }
        setNuevo(null); setMontoNuevo('');
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'No se pudo agregar');
      }
      // También si falló: el cargo pudo crearse y perderse la respuesta, y sin
      // volver a pedir la cuenta el concepto seguiría ofrecido.
      await recargarCargos();
      onCambio();
    });
  }

  // Una lista vacía porque todavía no ha vuelto, o porque falló, no es una
  // matrícula sin conceptos.
  const cargando = carga === 'cargando' || cargosCargando;
  const fichaDelAlumno = `/escolar/estudiantes/${estudianteId}`;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-gray-100 px-3 py-2">
        <span className="text-sm font-medium text-gray-900">Lo que se le cobra{aQuien}</span>
        {!cargando && carga === 'lista' && !cargosIncompletos && (
          <span className="text-xs text-gray-500">{cuantos(filas.length, 'concepto', 'conceptos')}</span>
        )}
      </div>

      {carga === 'fallo' ? (
        <p role="alert" className="px-3 py-4 text-sm text-red-700">
          No se pudo cargar lo que se le cobra. Recarga la página antes de cambiar nada.
        </p>
      ) : cargando ? (
        <p className="flex items-center gap-2 px-3 py-4 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />Cargando…
        </p>
      ) : cargosIncompletos ? (
        <p role="alert" className="px-3 py-4 text-sm text-amber-800">
          Esta matrícula tiene más cargos de los que esta lista alcanza a leer. Para no dejar ninguno
          fuera, cámbiala desde{' '}
          <Link href={fichaDelAlumno} target="_blank" className="font-medium underline">la ficha del estudiante</Link>.
        </p>
      ) : (
        <>
          <div className="border-b border-gray-100 px-3 py-2 text-xs text-gray-500">
            <p>
              Un renglón por concepto. {editable
                ? 'El lápiz cambia el monto de sus cargos que aún no tienen factura; la papelera deja de cobrárselo. Todo se aplica en el momento, no al pulsar «Guardar cambios».'
                : 'No tienes permiso para cambiarlo.'}
            </p>
            <p className="mt-1">
              Para cambiar o quitar un solo mes,{' '}
              <Link href={fichaDelAlumno} target="_blank"
                className="inline-flex items-center gap-0.5 font-medium text-zero-700 underline">
                abre la ficha del estudiante<ExternalLink className="h-3 w-3" aria-hidden />
              </Link>.
            </p>
          </div>

          {filas.length === 0 && (
            <p className="border-b border-gray-100 px-3 py-4 text-sm text-gray-500">
              Todavía no se le cobra nada. Agrégale un concepto aquí abajo.
            </p>
          )}

          {filas.map((f) => {
            const puedePrecio = precioCambiable(f, editable);
            const plan = alQuitarConcepto(f, efectivos, editable);
            const conPrecio = abierto?.id === f.conceptoId && abierto.que === 'precio';
            const conQuitar = abierto?.id === f.conceptoId && abierto.que === 'quitar';
            const nuevoMonto = conPrecio ? parseDOPaCentavos(valor) : null;
            const noCambian = f.facturados + f.conAbono;
            // El ritmo solo se promete si de verdad se le va a cargar.
            const ritmo = !f.automatico ? null
              : f.deBaja ? 'el colegio retiró este concepto: ya no se le genera'
              : !activa ? 'no se le carga: la matrícula no está activa'
              : `el sistema se lo carga ${cadaCuanto(f.frecuencia) ?? 'solo'}`;
            return (
              <div key={f.conceptoId}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-gray-100 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium text-gray-900">{f.nombre}</span>
                  <span className="block text-xs text-gray-500">
                    {ritmo ? `${ritmo} · ` : ''}{resumenDeConcepto(f)}
                    {!f.automatico && f.deBaja ? ' · el colegio retiró este concepto' : ''}
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-1">
                  <span className="text-right text-sm font-medium tabular-nums text-gray-900">
                    {f.precio == null ? <span className="text-gray-300">—</span>
                      : f.precio.clase === 'varios' ? <span className="text-gray-600">varios montos</span>
                      : fmtDOP(f.precio.centavos)}
                    {f.precio?.clase === 'uno' && f.cargos > 1 && (
                      <span className="block text-[11px] font-normal text-gray-500">cada cargo</span>
                    )}
                  </span>
                  {editable && (
                    <>
                      {/* No se apaga cuando no se puede: se deja pulsar y lo
                          explica en el renglón, igual que la papelera. Un botón
                          apagado no dice por qué en un teléfono ni a un lector. */}
                      <Tooltip text="Cambia el monto de este concepto para este alumno"><button type="button" disabled={ocupado} aria-disabled={!puedePrecio}
                        onClick={() => {
                          cerrarTodo();
                          setValor(f.montosLibres.length === 1 ? (f.montosLibres[0] / 100).toFixed(2) : '');
                          setAbierto({ id: f.conceptoId, que: 'precio' });
                        }}
                        aria-label={`Cambiar el monto de ${f.nombre}`}
                        className={`rounded p-1.5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed ${
                          puedePrecio ? 'text-gray-500 hover:text-zero-700' : 'text-gray-300'}`}>
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button></Tooltip>
                      <Tooltip text="Quita este concepto del alumno; te preguntará qué hacer con sus cargos"><button type="button" disabled={ocupado}
                        onClick={() => { cerrarTodo(); setAbierto({ id: f.conceptoId, que: 'quitar' }); }}
                        aria-label={`Quitar ${f.nombre}`}
                        className="rounded p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:text-gray-300">
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button></Tooltip>
                    </>
                  )}
                </span>

                {conPrecio && !puedePrecio && (
                  <Explicacion onCerrar={() => setAbierto(null)}>
                    {f.cargos === 0
                      ? 'Todavía no tiene cargos de este concepto. Cuando el sistema los genere, saldrán al precio del colegio.'
                      : 'Sus cargos ya tienen factura o pagos, y esos no se cambian desde aquí: el monto se corrige en la factura, desde la ficha del estudiante.'}
                  </Explicacion>
                )}

                {conPrecio && puedePrecio && (
                  <div className="basis-full rounded-lg border border-zero-200 bg-zero-50/60 p-2.5">
                    <p className="text-xs font-medium text-gray-800">
                      Monto de CADA cargo de «{f.nombre}»{deQuien}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-600">
                      Se cambia en {f.libresIds.length === 1 ? 'el cargo' : `los ${f.libresIds.length} cargos`} que
                      aún no {f.libresIds.length === 1 ? 'tiene' : 'tienen'} factura.
                      {noCambian > 0 && ` Lo que ya tiene factura o pagos (${noCambian}) no cambia.`}
                    </p>
                    {f.montosLibres.length > 1 && (
                      <p className="mt-1.5 text-xs text-amber-800">
                        Hoy no valen todos lo mismo ({f.montosLibres.map((m) => fmtDOP(m)).join(', ')}). Si guardas,
                        todos quedarán iguales. Para cambiar solo un mes, hazlo en la ficha.
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-gray-500" aria-hidden>RD$</span>
                      <input autoFocus type="text" inputMode="decimal" autoComplete="off" value={valor}
                        disabled={ocupado}
                        onChange={(e) => setValor(e.target.value)}
                        onKeyDown={teclas(() => cambiarPrecio(f), () => setAbierto(null))}
                        aria-label={`Monto nuevo de cada cargo de ${f.nombre}`}
                        className="h-9 w-32 rounded-md border border-gray-300 bg-white px-2 text-right text-sm tabular-nums text-gray-900 outline-none focus:ring-2 focus:ring-zero-500 disabled:bg-gray-100" />
                      {/* La cuenta ya hecha: quien escribe el total del año
                          creyendo que es por mes lo ve antes de guardar. */}
                      {nuevoMonto != null && nuevoMonto > 0 && f.libresIds.length > 1 && (
                        <span className="text-xs tabular-nums text-gray-700">
                          {f.libresIds.length} × {fmtDOP(nuevoMonto)} = <b>{fmtDOP(nuevoMonto * f.libresIds.length)}</b>
                        </span>
                      )}
                    </div>
                    {f.automatico && (
                      <p className="mt-2 text-xs text-gray-600">
                        Esto cambia los cargos que ya tiene. Los que el sistema genere más adelante saldrán al
                        precio del colegio; para fijarle un precio propio usa «Configuración mensual» en la ficha.
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button type="button" disabled={ocupado} onClick={() => cambiarPrecio(f)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-zero-600 px-3 text-sm font-medium text-white transition-colors hover:bg-zero-700 disabled:opacity-60">
                        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                        Guardar monto
                      </button>
                      <BotonGris ocupado={ocupado} onClick={() => setAbierto(null)}>Cancelar</BotonGris>
                    </div>
                  </div>
                )}

                {conQuitar && plan.se === 'puede' && (
                  <div role="alert" className="basis-full space-y-2 rounded-lg border border-red-200 bg-red-50 p-2.5"
                    onKeyDown={(e) => { if (e.key === 'Escape') setAbierto(null); }}>
                    <p className="text-xs font-medium text-red-900">Quitar «{f.nombre}»{deQuien}</p>

                    {/* Dos cosas distintas, dos botones. Dejar de cobrárselo no
                        toca lo que ya debe; perdonárselo es dinero, y se dice
                        cuánto. */}
                    {plan.dejaDeCargarse && (
                      <div>
                        <BotonGris ocupado={ocupado} onClick={() => quitar(f, false)}>Solo dejar de cobrárselo</BotonGris>
                        <p className="mt-1 text-xs text-red-900/80">
                          El sistema no le carga más. Lo que ya tiene en su cuenta se queda como está
                          {plan.perdona > 0 ? `: sigue debiendo ${fmtDOP(plan.perdona)}.` : '.'}
                        </p>
                      </div>
                    )}

                    {plan.anula > 0 && (
                      <div>
                        <button type="button" disabled={ocupado} onClick={() => quitar(f, true)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-left text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60">
                          {ocupado ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4 shrink-0" aria-hidden />}
                          {plan.dejaDeCargarse
                            ? `Dejar de cobrárselo y perdonarle ${fmtDOP(plan.perdona)}`
                            : `Quitarlo: se le perdonan ${fmtDOP(plan.perdona)}`}
                        </button>
                        <p className="mt-1 text-xs text-red-900/80">
                          Anula {plan.anula === 1 ? 'el cargo' : `los ${plan.anula} cargos`} sin factura: deja de
                          deber ese dinero. No se deshace con «Cancelar», y si después lo vuelves a agregar esos
                          cargos no regresan solos.
                          {plan.seQueda > 0 && ` Lo que ya tiene factura o pagos (${plan.seQueda}) se queda.`}
                        </p>
                      </div>
                    )}

                    <BotonGris ocupado={ocupado} onClick={() => setAbierto(null)}>No, dejarlo como está</BotonGris>
                  </div>
                )}

                {conQuitar && plan.se === 'no' && (
                  <Explicacion onCerrar={() => setAbierto(null)}>
                    {plan.porque === 'ultimo-automatico'
                      ? 'Es lo único que el sistema le carga y no se puede quitar. Si ya no se le va a cobrar, cambia el estado de la matrícula a Retirada o Anulada.'
                      : plan.porque === 'nada-que-quitar'
                        ? 'Sus cargos ya tienen factura o pagos: no se quitan desde aquí. Se corrige en la factura, desde la ficha del estudiante.'
                        : 'No tienes permiso para quitarlo.'}
                  </Explicacion>
                )}
              </div>
            );
          })}

          {editable && (
            <div className="border-b border-gray-100 px-3 py-2.5">
              {paraAgregar.length === 0 ? (
                <p className="text-xs text-gray-500">No queda ningún concepto del colegio por agregarle.</p>
              ) : (
                <label className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                  <Plus className="h-4 w-4 text-gray-500" aria-hidden />
                  <span className="sr-only">Agregar un concepto</span>
                  <select value={nuevo ? String(nuevo.id) : ''} disabled={ocupado}
                    onChange={(e) => {
                      const elegido = catalogo.find((c) => String(c.id) === e.target.value) ?? null;
                      cerrarTodo();
                      setNuevo(elegido);
                    }}
                    className="h-9 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-zero-500">
                    <option value="">Agregar un concepto…</option>
                    {paraAgregar.map((g) => (
                      <optgroup key={g.titulo} label={g.titulo}>
                        {g.conceptos.map((c) => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>
              )}

              {nuevo && seAgregaComo(nuevo) === 'automatico' && (() => {
                const otra = otraMensualidadQueYaTiene(nuevo, filas);
                const leQuitaron = cargos.some((c) => c.estado === 'anulado' && c.conceptoId === nuevo.id);
                return (
                  <div className="mt-2 rounded-lg border border-zero-200 bg-zero-50/60 p-2.5">
                    {!activa ? (
                      <p className="text-xs text-amber-800">
                        Esta matrícula no está activa, y el sistema solo le carga a las activas: agregar
                        «{nuevo.nombre}» no le cobraría nada. Actívala primero.
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-gray-700">
                          El sistema empieza a cargarle «{nuevo.nombre}»{aQuien}, él solo. No se le pone nada en
                          este momento: cada cargo sale cuando llega su fecha y al precio que tenga para el
                          alumno (sin precio no sale nada).
                        </p>
                        {otra && (
                          <p className="mt-1.5 text-xs text-amber-800">
                            Ya se le carga «{otra}». Con esta serán DOS mensualidades a la vez. Si lo que
                            quieres es cambiarlo de una a otra, quita después la que no corresponda.
                          </p>
                        )}
                        {/* El sistema arma lo que le carga desde la inscripción,
                            no desde hoy: quien ya se lo cobró a mano lo vería repetido. */}
                        {!!inscritoDesde && inscritoDesde < hoyRD() && (
                          <p className="mt-1.5 text-xs text-amber-800">
                            No se cobra solo de hoy en adelante: el sistema le cargará también lo que ya salió
                            desde su inscripción ({fmtFechaCorta(inscritoDesde)}), aunque ya se lo hayas cobrado
                            a mano. Revísalo al día siguiente y quita en la ficha los meses que no correspondan
                            (la papelera de aquí lo quita todo).
                          </p>
                        )}
                        {leQuitaron && (
                          <p className="mt-1.5 text-xs text-amber-800">
                            A este alumno ya se le quitaron cargos de «{nuevo.nombre}»: esos no vuelven a salir
                            solos. Si hacen falta, ponlos en la ficha.
                          </p>
                        )}
                      </>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {activa && <BotonAgregar ocupado={ocupado} onClick={() => agregar(nuevo)} />}
                      <BotonGris ocupado={ocupado} onClick={() => setNuevo(null)}>Cancelar</BotonGris>
                    </div>
                  </div>
                );
              })()}

              {nuevo && seAgregaComo(nuevo) === 'cargo' && (() => {
                const vence = vencimientoDe(hoyRD(), nuevo.diasParaPago ?? null);
                return (
                  <div className="mt-2 rounded-lg border border-zero-200 bg-zero-50/60 p-2.5">
                    <p className="text-xs text-gray-700">
                      «{nuevo.nombre}» se le pone ahora{aQuien}, una sola vez, como un cargo pendiente
                      {vence ? ` que vence el ${fmtFechaCorta(vence)}` : ' sin fecha límite'}. ¿Cuánto se le cobra?
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-gray-500" aria-hidden>RD$</span>
                      <input autoFocus type="text" inputMode="decimal" autoComplete="off" value={montoNuevo}
                        disabled={ocupado}
                        onChange={(e) => setMontoNuevo(e.target.value)}
                        onKeyDown={teclas(() => agregar(nuevo), () => setNuevo(null))}
                        placeholder="El del colegio"
                        aria-label={`Monto de ${nuevo.nombre}`}
                        className="h-9 w-32 rounded-md border border-gray-300 bg-white px-2 text-right text-sm tabular-nums text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-zero-500 disabled:bg-gray-100" />
                      <span className="text-xs text-gray-500">Vacío = el precio que el colegio le tiene puesto.</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <BotonAgregar ocupado={ocupado} onClick={() => agregar(nuevo)} />
                      <BotonGris ocupado={ocupado} onClick={() => setNuevo(null)}>Cancelar</BotonGris>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="flex items-baseline justify-between bg-gray-50 px-3 py-2.5">
            <span className="text-sm font-medium text-gray-900">Pendiente de pago</span>
            <span className="text-base font-semibold tabular-nums text-gray-900">{fmtDOP(pendiente)}</span>
          </div>
        </>
      )}
    </div>
  );
}

/** Por qué no se puede, dicho en el renglón (y anunciado a un lector de pantalla). */
function Explicacion({ children, onCerrar }: { children: React.ReactNode; onCerrar: () => void }) {
  return (
    <div role="status"
      className="flex basis-full items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
      <p className="text-xs text-amber-900">{children}</p>
      <Tooltip text="Cierra esta ventana"><button type="button" onClick={onCerrar} aria-label="Cerrar"
        className="rounded p-1 text-amber-700 hover:bg-amber-100">
        <X className="h-4 w-4" aria-hidden />
      </button></Tooltip>
    </div>
  );
}

function BotonGris({ ocupado, onClick, children }: { ocupado: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" disabled={ocupado} onClick={onClick}
      className="inline-flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-60">
      {children}
    </button>
  );
}

function BotonAgregar({ ocupado, onClick }: { ocupado: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={ocupado} onClick={onClick}
      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-zero-600 px-3 text-sm font-medium text-white transition-colors hover:bg-zero-700 disabled:opacity-60">
      {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
      Agregar
    </button>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { fmtDOP } from '@/lib/utils/format';
import { referenciaServicio } from '@/lib/administracion-escolar/referencia-servicio';
import {
  Loader2, Plus, X, Layers, Tag, Repeat, CalendarDays,
  FileText, DoorOpen, AlertTriangle, Eye, User, UserRound, GraduationCap, Check,
} from 'lucide-react';
import { Fila, Nombre, Plegador, Resumen, Tanda, plural, porOrden } from './arbol';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ETIQUETA_FRECUENCIA, type Frecuencia } from '@/lib/administracion-escolar/calendario';

/**
 * Segunda línea de una fila: con qué producto del catálogo se factura.
 *
 * Va como fila aparte y no dentro de la de arriba porque el árbol alinea todo
 * en una sola línea; meterle un renglón debajo descuadraba la sangría.
 */
function FilaProducto({ sangria, producto }: {
  sangria: number; producto: { id: number; nombre: string; referencia: string | null };
}) {
  return (
    <Fila sangria={sangria}>
      <span className="w-[18px] shrink-0" aria-hidden />
      <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
      <span className="shrink-0 text-xs text-gray-500">Se factura como</span>
      {/* Nombre Y referencia, no uno u otro. Antes salía solo la referencia, y
          cuando no la tiene caía al nombre — con treinta servicios llamados
          "Pago de colegiatura" eso no identifica ninguno. La referencia es lo
          único que los distingue; sin ella queda el número interno, que al
          menos permite decir "ese, el 192" al buscarlo en Productos. */}
      <span className="min-w-0 flex-1 truncate text-xs text-gray-500" title={producto.nombre}>
        {producto.nombre}
      </span>
      <span className="shrink-0 font-mono text-xs text-gray-400">
        {producto.referencia ?? `#${producto.id}`}
      </span>
    </Fila>
  );
}

interface Periodo { id: number; nombre: string; activo: boolean }
interface Servicio { id: number; nombre: string; tanda: string | null; orden: number }
interface Grado { id: number; servicioId: number; nombre: string; orden: number }
interface Seccion { id: number; gradoId: number; nombre: string; orden: number }
interface Concepto { id: number; nombre: string; tipo: string; frecuencia: Frecuencia; orden: number }
interface Producto { id: number; nombre: string; referencia: string | null; precio: number }
interface Precio {
  id: number; conceptoId: number; objetivoTipo: string; objetivoId: number;
  montoCentavos: number; productId: number | null;
}
interface Data {
  periodos: Periodo[]; periodo: Periodo | null;
  servicios: Servicio[]; grados: Grado[]; secciones: Seccion[];
  conceptos: Concepto[]; precios: Precio[]; productos: Producto[];
}

type ObjTipo = 'servicio' | 'grado' | 'seccion';

const jsonReq = (url: string, method: string, body: unknown) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Nodo del árbol al que se le está poniendo tarifa. */
interface Objetivo {
  tipo: ObjTipo;
  id: number;
  /** Nombre del grado; ausente cuando la tarifa es del servicio entero. */
  grado?: string;
  /** Nombre de la sección; solo cuando el aula cobra distinto que su grado. */
  seccion?: string;
  servicio: string;
  tanda: string | null;
}

/**
 * Conceptos de pago y sus tarifas por año escolar.
 *
 * El precio se pone en el servicio y los grados lo heredan; solo se toca un
 * grado cuando es la excepción. Las secciones no llevan tarifa: son el mismo
 * curso repartido en aulas. La beca tampoco se configura aquí — es un acuerdo
 * con la familia y vive en la matrícula del estudiante.
 */
export function ConceptosPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const [conceptoSel, setConceptoSel] = useState<number | null>(null);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<Objetivo | null>(null);
  const [porBorrar, setPorBorrar] = useState<Concepto | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);

  const cargar = useCallback(async (pid?: number | null) => {
    setLoading(true);
    try {
      const url = pid
        ? `/api/administracion-escolar/concepto-precios?periodoId=${pid}`
        : '/api/administracion-escolar/concepto-precios';
      // `no-store` en la lectura: el servidor ya cachea por etiqueta y la
      // invalida al escribir, pero el navegador tiene su propio caché HTTP y
      // ahí se quedaba la estructura vieja después de reordenar.
      const d: Data = await fetch(url, { cache: 'no-store' }).then((r) => r.json());
      setData(d);
      setConceptoSel((prev) => (prev && d.conceptos.some((c) => c.id === prev) ? prev : d.conceptos[0]?.id ?? null));
      // Cerrado de entrada. Se probó al revés —todo abierto, para ver de un
      // golpe qué grado no tiene precio— y con cuatro servicios y veinte grados
      // la pantalla arrancaba con cincuenta filas y había que buscar el
      // concepto entre ellas. El aviso ámbar del servicio ya dice que algo de
      // dentro está sin precio, así que se abre lo que haga falta.
      //
      // `prev` y no un `Set` nuevo: al guardar un precio ya no se recarga, pero
      // cambiar de año escolar sí pasa por aquí y no tiene por qué cerrarte lo
      // que tenías abierto.
      setAbiertos((prev) => prev);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  /**
   * Igual que en el catálogo: confirmación propia, no `window.confirm`. En el
   * navegador embebido de la app devuelve `false` sin enseñar nada y el borrado
   * se quedaba sin hacer, en silencio.
   */
  async function confirmarBorrado() {
    const c = porBorrar;
    if (!c) return;
    setBorrando(true);
    try {
      const r = await fetch(`/api/administracion-escolar/conceptos/${c.id}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErrorBorrado(j.error ?? 'No se pudo eliminar.');
        return;
      }
      setPorBorrar(null);
      setErrorBorrado(null);
      await cargar(data?.periodo?.id);
    } finally { setBorrando(false); }
  }

  async function quitarPrecio(precioId: number) {
    const r = await fetch(`/api/administracion-escolar/concepto-precios?id=${precioId}`, { method: 'DELETE' });
    if (!r.ok) return;
    setData((d) => d && ({ ...d, precios: d.precios.filter((p) => p.id !== precioId) }));
  }

  const concepto = data?.conceptos.find((c) => c.id === conceptoSel) ?? null;

  const precioDe = useCallback(
    (tipo: ObjTipo, id: number) =>
      data?.precios.find((p) => p.conceptoId === conceptoSel && p.objetivoTipo === tipo && p.objetivoId === id) ?? null,
    [data, conceptoSel],
  );

  const productoDe = useCallback(
    (precio: Precio | null) => (precio?.productId ? data?.productos.find((p) => p.id === precio.productId) ?? null : null),
    [data],
  );

  if (loading || !data) {
    return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>;
  }

  /** Mismas claves que el árbol de Estructura: `s:5` servicio, `g:27` grado. */
  const esta = (clave: string) => abiertos.has(clave);
  const alternar = (clave: string) => setAbiertos((s) => {
    const n = new Set(s);
    if (!n.delete(clave)) n.add(clave);
    return n;
  });

  return (
    <div className="space-y-4">
      {/* Año escolar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <CalendarDays className="h-4 w-4 shrink-0 text-zero-600" />
        <span className="text-sm text-gray-600">Año escolar</span>
        <NativeSelect className="min-w-44" value={data.periodo?.id ?? ''} onChange={(e) => void cargar(Number(e.target.value))}>
          {data.periodos.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.activo ? ' (activo)' : ''}</option>)}
        </NativeSelect>
        <span className="text-xs text-gray-400">Las tarifas del año pasado se conservan.</span>
      </div>

      {/* Conceptos */}
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs text-gray-500"><Tag className="h-3.5 w-3.5" /> Concepto</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {data.conceptos.length === 0 && <span className="text-sm text-gray-400">Sin conceptos aún.</span>}
          {data.conceptos.map((c) => {
            const on = c.id === conceptoSel;
            return (
              <span key={c.id}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors ${
                  on ? 'border-zero-500 bg-zero-50 font-medium text-zero-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                <button onClick={() => setConceptoSel(c.id)}>{c.nombre}</button>
                {c.frecuencia !== 'unico' && <Repeat className="h-3 w-3 opacity-60" aria-label={ETIQUETA_FRECUENCIA[c.frecuencia]} />}
                <button onClick={() => setPorBorrar(c)} className="text-gray-300 hover:text-red-500" title="Eliminar concepto">
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>

        {/* El alta y la configuración del concepto viven en la pestaña
            Conceptos: aquí solo se le pone precio a lo que ya existe. Cuando
            no hay ninguno, esta pantalla no tiene nada que hacer. */}
        {data.conceptos.length === 0 && (
          <p className="mt-3 border-t border-gray-100 pt-3 text-sm text-gray-500">
            Todavía no hay conceptos. Créalos en la pestaña <b>Conceptos</b> y vuelve aquí a ponerles precio.
          </p>
        )}
      </div>

      {/* Tarifas del concepto elegido */}
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
        {!concepto ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Crea un concepto para ponerle precio.</p>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-900">Precio de {concepto.nombre}</p>
            <p className="mb-3 text-xs text-gray-500">
              {`Se cobra ${ETIQUETA_FRECUENCIA[concepto.frecuencia].toLowerCase()}. `}
              El precio va en el servicio; los grados lo heredan.
            </p>

            {data.servicios.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Este año escolar no tiene servicios. Créalos en la pestaña Estructura.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200">
                {data.servicios.slice().sort(porOrden).map((sv) => {
                  const pSv = precioDe('servicio', sv.id);
                  const prodSv = productoDe(pSv);
                  const grados = data.grados.filter((g) => g.servicioId === sv.id).slice().sort(porOrden);
                  const nSecciones = data.secciones.filter((s) => grados.some((g) => g.id === s.gradoId)).length;
                  const abierto = esta(`s:${sv.id}`);
                  const falta = !pSv;

                  return (
                    <div key={sv.id}>
                      {/* Servicio */}
                      <Fila sangria={0} tono={falta ? 'aviso' : 'cabecera'}>
                        <Plegador abierto={abierto} vacio={grados.length === 0} onClick={() => alternar(`s:${sv.id}`)} />
                        <Layers className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <Nombre className={`text-sm font-medium ${falta ? 'text-amber-800' : 'text-gray-900'}`}
                          onClick={grados.length ? () => alternar(`s:${sv.id}`) : undefined}>{sv.nombre}</Nombre>
                        {sv.tanda && <Tanda>{sv.tanda}</Tanda>}
                        <Resumen tono={falta ? 'aviso' : 'normal'}
                          partes={[plural(grados.length, 'grado', 'grados'), plural(nSecciones, 'sección', 'secciones')]} />
                        {pSv ? (
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className="rounded-md border border-zero-200 bg-zero-50 px-2 py-0.5 text-sm font-semibold text-zero-800">{fmtDOP(pSv.montoCentavos)}</span>
                            <button onClick={() => quitarPrecio(pSv.id)} className="text-gray-300 hover:text-red-500" title="Quitar precio"><X className="h-3.5 w-3.5" /></button>
                          </span>
                        ) : (
                          <button onClick={() => setModal({ tipo: 'servicio', id: sv.id, servicio: sv.nombre, tanda: sv.tanda })}
                            className="shrink-0 rounded-md border border-dashed border-amber-400 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100">
                            <AlertTriangle className="mr-1 inline h-3 w-3" />Falta el precio
                          </button>
                        )}
                      </Fila>

                      {/* Fuera del `abierto`: es la respuesta a "¿con cuál de
                          mis servicios se está facturando esto?", y con el
                          árbol cerrado no se podía ver sin desplegarlo todo. */}
                      {prodSv && <FilaProducto sangria={1} producto={prodSv} />}

                      {abierto && (
                        <>

                          {grados.map((g) => {
                            const pG = precioDe('grado', g.id);
                            const prodG = productoDe(pG);
                            // Lo que le toca al grado si no tiene precio propio.
                            const heredaG = pG ?? pSv;
                            // Mismo criterio que el resto del árbol: el orden que puso el
                            // colegio en Estructura, y el nombre solo desempata.
                            const secciones = data.secciones.filter((s) => s.gradoId === g.id).slice().sort(porOrden);
                            const abiertoG = esta(`g:${g.id}`);
                            return (
                              <div key={g.id}>
                                <Fila sangria={1} tono={pG ? 'cabecera' : 'normal'}>
                                  <Plegador abierto={abiertoG} vacio={secciones.length === 0} onClick={() => alternar(`g:${g.id}`)} />
                                  <GraduationCap className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                  <Nombre className={`text-sm ${pG ? 'font-medium text-gray-900' : 'text-gray-600'}`}
                                    onClick={secciones.length ? () => alternar(`g:${g.id}`) : undefined}>{g.nombre}</Nombre>
                                  {!abiertoG && secciones.length > 0 && (
                                    <Resumen partes={[`Secciones ${secciones.map((s) => s.nombre).join(', ')}`]} />
                                  )}
                                  {pG ? (
                                    <>
                                      <span className="shrink-0 rounded-md border border-zero-200 bg-zero-50 px-2 py-0.5 text-sm font-semibold text-zero-800">{fmtDOP(pG.montoCentavos)}</span>
                                      <button onClick={() => quitarPrecio(pG.id)} className="shrink-0 text-gray-300 hover:text-red-500" title="Quitar excepción"><X className="h-3.5 w-3.5" /></button>
                                    </>
                                  ) : (
                                    <>
                                      {pSv && <span className="shrink-0 text-sm text-gray-400">hereda {fmtDOP(pSv.montoCentavos)}</span>}
                                      <button onClick={() => setModal({ tipo: 'grado', id: g.id, grado: g.nombre, servicio: sv.nombre, tanda: sv.tanda })}
                                        className="shrink-0 rounded-md border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:border-zero-400 hover:text-zero-600">
                                        {pSv ? 'Excepción' : 'Precio'}
                                      </button>
                                    </>
                                  )}
                                </Fila>
                                {prodG && <FilaProducto sangria={2} producto={prodG} />}

                                {abiertoG && secciones.map((s) => {
                                  const pS = precioDe('seccion', s.id);
                                  const prodS = productoDe(pS);
                                  return (
                                    <div key={s.id}>
                                      <Fila sangria={2} tono={pS ? 'cabecera' : 'normal'}>
                                        <span className="w-[18px] shrink-0" aria-hidden />
                                        <DoorOpen className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                                        <Nombre className={`text-sm ${pS ? 'font-medium text-gray-900' : 'text-gray-500'}`}>{`Sección ${s.nombre}`}</Nombre>
                                        {pS ? (
                                          <>
                                            <span className="shrink-0 rounded-md border border-zero-200 bg-zero-50 px-2 py-0.5 text-sm font-semibold text-zero-800">{fmtDOP(pS.montoCentavos)}</span>
                                            <button onClick={() => quitarPrecio(pS.id)} className="shrink-0 text-gray-300 hover:text-red-500" title="Quitar excepción"><X className="h-3.5 w-3.5" /></button>
                                          </>
                                        ) : (
                                          <>
                                            {heredaG && <span className="shrink-0 text-sm text-gray-400">hereda {fmtDOP(heredaG.montoCentavos)}</span>}
                                            <button onClick={() => setModal({ tipo: 'seccion', id: s.id, seccion: s.nombre, grado: g.nombre, servicio: sv.nombre, tanda: sv.tanda })}
                                              className="shrink-0 rounded-md border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-400 hover:border-zero-400 hover:text-zero-600">
                                              {heredaG ? 'Excepción' : 'Precio'}
                                            </button>
                                          </>
                                        )}
                                      </Fila>
                                      {prodS && <FilaProducto sangria={3} producto={prodS} />}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {modal && concepto && data.periodo && (
        <ModalTarifa
          objetivo={modal}
          concepto={concepto}
          periodo={data.periodo}
          productos={data.productos}
          usados={data.precios.filter((p) => p.conceptoId === concepto.id && p.productId).map((p) => p.productId!)}
          onCerrar={() => setModal(null)}
          /* Se mete el precio en el estado en vez de recargar la pantalla
             entera: la recarga volvía a pedir período, estructura, conceptos y
             tarifas para una fila que ya se sabe cómo quedó, y de paso reabría
             todas las ramas del árbol y perdía dónde estabas mirando. */
          onGuardado={(precio) => {
            setModal(null);
            setData((d) => d && ({
              ...d,
              // Puede ser alta o cambio: se quita el que hubiera para ese mismo
              // concepto y nodo antes de meter el nuevo, o al editar un precio
              // saldría dos veces.
              precios: [
                ...d.precios.filter((p) => !(
                  p.conceptoId === precio.conceptoId
                  && p.objetivoTipo === precio.objetivoTipo
                  && p.objetivoId === precio.objetivoId
                )),
                precio,
              ],
            }));
          }}
        />
      )}

      <ConfirmDialog
        open={porBorrar !== null}
        onOpenChange={(o: boolean) => { if (!o) { setPorBorrar(null); setErrorBorrado(null); } }}
        title={`Eliminar "${porBorrar?.nombre ?? ''}"`}
        description={
          <>
            Se va con él su calendario de cuotas y las tarifas de cada grado. Si ya
            se le cobró a algún alumno, no se puede borrar.
            {errorBorrado && (
              <span className="mt-2 block rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                {errorBorrado}
              </span>
            )}
          </>
        }
        confirmLabel="Eliminar"
        destructive
        loading={borrando}
        onConfirm={() => void confirmarBorrado()} />
    </div>
  );
}

/**
 * Alta de tarifa. Se elige el servicio de facturación existente o se crea uno
 * nuevo con la referencia ya armada; el precio sale de ahí y se ve, antes de
 * guardar, tal como le llegará al padre en la factura.
 */
function ModalTarifa({
  objetivo, concepto, periodo, productos, usados, onCerrar, onGuardado,
}: {
  objetivo: Objetivo;
  concepto: Concepto;
  periodo: Periodo;
  productos: Producto[];
  usados: number[];
  onCerrar: () => void;
  onGuardado: (precio: Precio) => void;
}) {
  const [busca, setBusca] = useState('');
  const [elegido, setElegido] = useState<Producto | null>(null);
  const [creando, setCreando] = useState(false);
  const [refNueva, setRefNueva] = useState('');
  // El nombre del concepto sirve de punto de partida, no de jaula: es lo que
  // acaba impreso en la factura, y ahí el colegio puede querer decirlo de otra
  // manera.
  const [nombreNuevo, setNombreNuevo] = useState(concepto.nombre);
  const [precio, setPrecio] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const referenciaSugerida = useMemo(() => referenciaServicio({
    concepto: concepto.nombre,
    grado: objetivo.grado ?? null,
    seccion: objetivo.seccion ?? null,
    servicio: objetivo.servicio,
    tanda: objetivo.tanda,
    periodo: periodo.nombre,
  }), [concepto, objetivo, periodo]);

  useEffect(() => { setRefNueva(referenciaSugerida); }, [referenciaSugerida]);
  useEffect(() => { setNombreNuevo(concepto.nombre); }, [concepto.nombre]);

  // Solo lo que puede ser este concepto: el resto del catálogo (camisetas,
  // materiales) no tiene nada que hacer en una tarifa de colegiatura.
  const candidatos = useMemo(() => {
    const clave = concepto.nombre.toLowerCase().split(/\s+/)[0];
    const q = busca.trim().toLowerCase();
    return productos
      .filter((p) => `${p.nombre} ${p.referencia ?? ''}`.toLowerCase().includes(clave)
        || (!!q && `${p.nombre} ${p.referencia ?? ''}`.toLowerCase().includes(q)))
      .filter((p) => !q || `${p.nombre} ${p.referencia ?? ''}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [productos, concepto, busca]);

  const montoPreview = creando ? Math.round(Number(precio) * 100) : elegido?.precio ?? 0;
  const lugar = [objetivo.seccion ? `Sección ${objetivo.seccion}` : null, objetivo.grado, objetivo.servicio]
    .filter(Boolean).join(' de ');

  async function guardar() {
    setOcupado(true);
    try {
      const body: Record<string, unknown> = {
        conceptoId: concepto.id, periodoId: periodo.id,
        objetivoTipo: objetivo.tipo, objetivoId: objetivo.id,
      };
      if (creando) {
        const p = Number(precio);
        if (!(p >= 0)) { alert('Pon un precio.'); return; }
        body.nuevoProducto = { nombre: nombreNuevo.trim() || concepto.nombre, referencia: refNueva.trim(), precio: p };
      } else if (elegido) {
        body.productId = elegido.id;
      } else { alert('Elige un servicio de facturación o crea uno.'); return; }

      const r = await jsonReq('/api/administracion-escolar/concepto-precios', 'POST', body);
      if (r.status === 401) {
        // La página sigue pintada aunque la sesión haya caducado, así que sin
        // este aviso el botón parece roto.
        alert('Tu sesión caducó. Recarga la página y vuelve a entrar.');
        return;
      }
      if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error ?? 'No se pudo guardar.'); return; }
      // `guardado` y no `precio`: aquí `precio` ya es el importe que se teclea
      // en el formulario, y reusar el nombre lo tapaba.
      const { precio: guardado } = await r.json();
      onGuardado(guardado as Precio);
    } finally { setOcupado(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        <div className="flex items-start gap-3 border-b border-gray-100 px-7 py-5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zero-50">
            <Layers className="h-4.5 w-4.5 text-zero-600" />
          </span>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">Precio de {concepto.nombre}</h3>
            <p className="mt-0.5 text-sm text-gray-500">
              {lugar} · {periodo.nombre}{objetivo.tanda ? ` · ${objetivo.tanda}` : ''}
            </p>
          </div>
          <button onClick={onCerrar} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-7 py-6">
          {!creando ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Servicio de facturación</label>
                <p className="mb-2.5 text-xs text-gray-500">Con cuál de tus servicios se cobrará este precio.</p>
                <Input autoFocus className="h-10" placeholder="Buscar por nombre o referencia…" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200">
                {candidatos.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-gray-400">Nada que se parezca. Crea uno nuevo abajo.</p>
                )}
                {candidatos.map((p) => {
                  // Informativo, no un impedimento: la inscripción que cuesta
                  // lo mismo en todos los servicios debe poder ser UN producto
                  // usado en los cuatro, no cuatro productos idénticos.
                  const yaUsado = usados.includes(p.id) && elegido?.id !== p.id;
                  const on = elegido?.id === p.id;
                  return (
                    <button key={p.id} onClick={() => setElegido(p)}
                      className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left last:border-0 ${
                        on ? 'bg-zero-50' : 'hover:bg-gray-50'}`}>
                      {on
                        ? <Check className="h-4 w-4 shrink-0 text-zero-600" />
                        : <FileText className="h-4 w-4 shrink-0 text-gray-300" />}
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${on ? 'font-medium text-zero-800' : 'text-gray-800'}`}>{p.nombre}</p>
                        <p className="mt-0.5 break-all font-mono text-xs text-gray-400">{p.referencia ?? '—'}</p>
                      </div>
                      {yaUsado && (
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          en uso
                        </span>
                      )}
                      <span className={`shrink-0 text-sm ${on ? 'font-semibold text-zero-800' : 'text-gray-500'}`}>{fmtDOP(p.precio)}</span>
                    </button>
                  );
                })}
                <button onClick={() => setCreando(true)} className="flex w-full items-center gap-3 bg-gray-50 px-4 py-3 text-left hover:bg-gray-100">
                  <Plus className="h-4 w-4 shrink-0 text-zero-600" />
                  <span className="shrink-0 text-sm font-medium text-zero-700">Crear servicio nuevo</span>
                  <span className="min-w-0 flex-1 truncate text-right font-mono text-xs text-gray-400">{referenciaSugerida}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Nombre</label>
                  <Input className="h-10" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} />
                  <p className="mt-1.5 text-xs text-gray-400">
                    Es lo que el padre lee en su factura. Empieza por el del concepto.
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Precio</label>
                  <div className="flex items-center gap-2">
                    <Input autoFocus type="number" step="0.01" className="h-10 flex-1 font-mono" placeholder="0.00" value={precio} onChange={(e) => setPrecio(e.target.value)} />
                    <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">Itbis exento</span>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400">La enseñanza no lleva itbis.</p>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Referencia</label>
                <Input className="h-10 font-mono text-sm" value={refNueva} onChange={(e) => setRefNueva(e.target.value)} />
                <p className="mt-1.5 text-xs text-gray-400">
                  Armada con el concepto, el grado, el servicio, la tanda y el año. Puedes cambiarla.
                </p>
              </div>

              <button onClick={() => setCreando(false)} className="text-sm text-gray-500 hover:text-gray-900">
                ← Elegir uno que ya existe
              </button>
            </div>
          )}

          {/* Vista previa */}
          <div className="border-t border-gray-100 pt-5">
            <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <Eye className="h-4 w-4 text-gray-400" /> Así saldrá en la factura
            </p>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4">
              {/* A quién se le cobra. La factura va a nombre del padre o tutor,
                  que es el cliente; el estudiante aparece en la línea como
                  beneficiario. Sin esta cabecera la vista previa daba a
                  entender que se le factura al alumno. */}
              <div className="flex items-center gap-2 border-b border-gray-200 pb-3 text-sm">
                <span className="text-gray-500">Facturado a</span>
                <span className="flex items-center gap-1.5 font-medium text-gray-900">
                  <UserRound className="h-3.5 w-3.5 text-gray-400" />
                  Nombre del padre o tutor
                </span>
              </div>

              <div className="flex gap-4 border-b border-gray-200 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{creando ? (nombreNuevo || concepto.nombre) : concepto.nombre}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                    <User className="h-3.5 w-3.5" /> Nombre del estudiante · {lugar}
                  </p>
                  <p className="mt-1.5 break-all font-mono text-xs text-gray-400">
                    {creando ? refNueva : elegido?.referencia ?? referenciaSugerida}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm text-gray-900">{fmtDOP(montoPreview || 0)}</span>
              </div>
              <div className="flex justify-between pt-3">
                <span className="text-sm text-gray-500">Exento</span>
                <span className="font-mono text-sm font-medium text-gray-900">{fmtDOP(montoPreview || 0)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50/60 px-7 py-4">
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button className="bg-zero-600 px-6 hover:bg-zero-700" onClick={guardar} disabled={ocupado || (!creando && !elegido) || (creando && (precio === '' || !nombreNuevo.trim()))}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : creando ? 'Crear y atar' : 'Atar'}
          </Button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { fmtDOP } from '@/lib/utils/format';
import { referenciaServicio } from '@/lib/administracion-escolar/referencia-servicio';
import { CONCEPTOS_BASE, pareceMensual } from '@/lib/administracion-escolar/conceptos-base';
import {
  Loader2, Plus, X, Layers, Tag, Repeat, CalendarDays, Wand2, ChevronRight, ChevronDown,
  FileText, DoorOpen, AlertTriangle, Eye, User, UserRound, GraduationCap, Check,
} from 'lucide-react';

interface Periodo { id: number; nombre: string; activo: boolean }
interface Servicio { id: number; nombre: string; tanda: string | null; orden: number }
interface Grado { id: number; servicioId: number; nombre: string; orden: number }
interface Seccion { id: number; gradoId: number; nombre: string }
interface Concepto { id: number; nombre: string; tipo: string; recurrente: boolean }
interface Producto { id: number; nombre: string; referencia: string | null; precio: number }
interface Precio {
  id: number; conceptoId: number; objetivoTipo: string; objetivoId: number;
  montoCentavos: number; productId: number | null;
}
interface Sugerencia { nombre: string; productos: number }
interface Data {
  periodos: Periodo[]; periodo: Periodo | null;
  servicios: Servicio[]; grados: Grado[]; secciones: Seccion[];
  conceptos: Concepto[]; precios: Precio[]; productos: Producto[]; sugerencias: Sugerencia[];
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
  const [ocupado, setOcupado] = useState(false);

  const [conceptoSel, setConceptoSel] = useState<number | null>(null);
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const [ncNombre, setNcNombre] = useState('');
  const [ncMensual, setNcMensual] = useState(false);
  const [modal, setModal] = useState<Objetivo | null>(null);

  const cargar = useCallback(async (pid?: number | null) => {
    setLoading(true);
    try {
      const url = pid
        ? `/api/administracion-escolar/concepto-precios?periodoId=${pid}`
        : '/api/administracion-escolar/concepto-precios';
      const d: Data = await fetch(url).then((r) => r.json());
      setData(d);
      setConceptoSel((prev) => (prev && d.conceptos.some((c) => c.id === prev) ? prev : d.conceptos[0]?.id ?? null));
      // Todo abierto de entrada: lo que se viene a ver aquí es qué grado tiene
      // precio y cuál no, y eso no se ve con los servicios cerrados. Quien
      // tenga muchos grados puede cerrar lo que no esté tocando.
      setAbiertos(new Set(d.servicios.map((s) => s.id)));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function traerSugerencias() {
    if (!data?.sugerencias.length) return;
    setOcupado(true);
    try {
      const r = await jsonReq('/api/administracion-escolar/concepto-precios', 'PUT', {
        nombres: data.sugerencias.map((s) => s.nombre),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error ?? 'No se pudo traer.'); return; }
      await cargar(data.periodo?.id);
    } finally { setOcupado(false); }
  }

  async function crearConcepto() {
    if (!ncNombre.trim()) return;
    setOcupado(true);
    try {
      const r = await jsonReq('/api/administracion-escolar/conceptos', 'POST', {
        nombre: ncNombre.trim(),
        tipo: ncMensual ? 'mensualidad' : 'otro',
        recurrente: ncMensual,
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error ?? 'No se pudo crear.'); return; }
      setNcNombre(''); setNcMensual(false);
      await cargar(data?.periodo?.id);
    } finally { setOcupado(false); }
  }

  /** Siembra los conceptos con los que arranca cualquier colegio. */
  async function sembrarBase() {
    setOcupado(true);
    try {
      for (const c of CONCEPTOS_BASE) {
        await jsonReq('/api/administracion-escolar/conceptos', 'POST', c);
      }
      await cargar(data?.periodo?.id);
    } finally { setOcupado(false); }
  }

  async function borrarConcepto(c: Concepto) {
    if (!confirm(`¿Eliminar el concepto "${c.nombre}" y sus precios?`)) return;
    const r = await fetch(`/api/administracion-escolar/conceptos/${c.id}`, { method: 'DELETE' });
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error ?? 'No se pudo eliminar.'); return; }
    await cargar(data?.periodo?.id);
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

  function toggle(id: number) {
    setAbiertos((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

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

      {/* Asistente: lo que ya factura y todavía no es concepto */}
      {data.sugerencias.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg bg-zero-50 px-4 py-3">
          <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-zero-700" />
          <div className="flex-1 text-sm text-zero-800">
            Tienes {data.sugerencias.reduce((n, s) => n + s.productos, 0)} servicios de facturación sin usar aquí.
            Se agrupan en {data.sugerencias.length} concepto{data.sugerencias.length === 1 ? '' : 's'}:{' '}
            <span className="font-medium">{data.sugerencias.slice(0, 4).map((s) => s.nombre).join(', ')}</span>
            {data.sugerencias.length > 4 && '…'}
          </div>
          <Button size="sm" variant="outline" className="h-7 shrink-0 border-zero-300 text-zero-700" onClick={traerSugerencias} disabled={ocupado}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Traerlos'}
          </Button>
        </div>
      )}

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
                {c.recurrente && <Repeat className="h-3 w-3 opacity-60" aria-label="mensual" />}
                <button onClick={() => borrarConcepto(c)} className="text-gray-300 hover:text-red-500" title="Eliminar concepto">
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>

        {/* Alta: la recurrencia se elige, no se adivina — de ella depende que se
            generen diez cuotas o una sola. */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <Input className="h-8 w-52" placeholder="Nuevo concepto" value={ncNombre}
            onChange={(e) => { setNcNombre(e.target.value); setNcMensual(pareceMensual(e.target.value)); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void crearConcepto(); } }} />

          <div className="inline-flex overflow-hidden rounded-md border border-gray-200">
            <button onClick={() => setNcMensual(true)}
              className={`px-2.5 py-1 text-xs ${ncMensual ? 'bg-zero-50 font-medium text-zero-800' : 'text-gray-500 hover:bg-gray-50'}`}>
              <Repeat className="mr-1 inline h-3 w-3" />Cada mes
            </button>
            <button onClick={() => setNcMensual(false)}
              className={`border-l border-gray-200 px-2.5 py-1 text-xs ${!ncMensual ? 'bg-zero-50 font-medium text-zero-800' : 'text-gray-500 hover:bg-gray-50'}`}>
              Una sola vez
            </button>
          </div>

          <Button size="sm" variant="outline" className="h-8" onClick={crearConcepto} disabled={ocupado || !ncNombre.trim()}>
            <Plus className="mr-1 h-4 w-4" />Crear
          </Button>

          {data.conceptos.length === 0 && (
            <Button size="sm" variant="outline" className="h-8" onClick={sembrarBase} disabled={ocupado}>
              Usar los de siempre
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-gray-400">
          «Cada mes» genera una cuota por cada mes del año escolar y es lo único que admite beca.
          Inscripción, materiales y uniformes van una sola vez.
        </p>
      </div>

      {/* Tarifas del concepto elegido */}
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
        {!concepto ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Crea un concepto para ponerle precio.</p>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-900">Precio de {concepto.nombre}</p>
            <p className="mb-3 text-xs text-gray-500">
              {concepto.recurrente ? 'Se cobra cada mes. ' : 'Se cobra una sola vez. '}
              El precio va en el servicio; los grados lo heredan.
            </p>

            {data.servicios.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Este año escolar no tiene servicios. Créalos en la pestaña Estructura.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200">
                {data.servicios.map((sv) => {
                  const pSv = precioDe('servicio', sv.id);
                  const prodSv = productoDe(pSv);
                  const grados = data.grados.filter((g) => g.servicioId === sv.id);
                  const nSecciones = data.secciones.filter((s) => grados.some((g) => g.id === s.gradoId)).length;
                  const abierto = abiertos.has(sv.id);
                  const falta = !pSv;

                  return (
                    <div key={sv.id}>
                      {/* Servicio */}
                      <div className={`flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2 ${falta ? 'bg-amber-50' : 'bg-gray-50'}`}>
                        <button onClick={() => toggle(sv.id)} className="shrink-0 text-gray-400 hover:text-gray-700" aria-label={abierto ? 'Cerrar' : 'Abrir'}>
                          {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <span className={`text-sm font-medium ${falta ? 'text-amber-800' : 'text-gray-900'}`}>{sv.nombre}</span>
                        {sv.tanda && <span className="rounded-full bg-zero-100 px-2 py-0.5 text-xs font-medium text-zero-700">{sv.tanda}</span>}
                        <span className={`text-xs ${falta ? 'text-amber-700' : 'text-gray-400'}`}>{grados.length} grado{grados.length === 1 ? '' : 's'}</span>
                        <div className="flex-1" />
                        {pSv ? (
                          <span className="flex items-center gap-1.5">
                            <span className="rounded-md border border-zero-200 bg-zero-50 px-2 py-0.5 text-sm font-semibold text-zero-800">{fmtDOP(pSv.montoCentavos)}</span>
                            <button onClick={() => quitarPrecio(pSv.id)} className="text-gray-300 hover:text-red-500" title="Quitar precio"><X className="h-3.5 w-3.5" /></button>
                          </span>
                        ) : (
                          <button onClick={() => setModal({ tipo: 'servicio', id: sv.id, servicio: sv.nombre, tanda: sv.tanda })}
                            className="rounded-md border border-dashed border-amber-400 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100">
                            <AlertTriangle className="mr-1 inline h-3 w-3" />Falta el precio
                          </button>
                        )}
                      </div>

                      {abierto && (
                        <>
                          {prodSv && (
                            <div className="flex items-center gap-2 border-b border-gray-100 py-1.5 pl-9 pr-3">
                              <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                              <span className="text-xs text-gray-500">Se factura como</span>
                              <span className="break-all font-mono text-xs text-gray-400">{prodSv.referencia ?? prodSv.nombre}</span>
                            </div>
                          )}

                          {grados.map((g) => {
                            const pG = precioDe('grado', g.id);
                            const prodG = productoDe(pG);
                            // Lo que le toca al grado si no tiene precio propio.
                            const heredaG = pG ?? pSv;
                            const secciones = data.secciones.filter((s) => s.gradoId === g.id);
                            return (
                              <div key={g.id}>
                                <div className={`border-b border-gray-100 px-3 py-1.5 pl-9 ${pG ? 'bg-gray-50/60' : ''}`}>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <GraduationCap className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                    <span className={`text-sm ${pG ? 'font-medium text-gray-900' : 'text-gray-600'}`}>{g.nombre}</span>
                                    <div className="flex-1" />
                                    {pG ? (
                                      <>
                                        <span className="rounded-md border border-zero-200 bg-zero-50 px-2 py-0.5 text-sm font-semibold text-zero-800">{fmtDOP(pG.montoCentavos)}</span>
                                        <button onClick={() => quitarPrecio(pG.id)} className="text-gray-300 hover:text-red-500" title="Quitar excepción"><X className="h-3.5 w-3.5" /></button>
                                      </>
                                    ) : (
                                      <>
                                        {pSv && <span className="text-sm text-gray-400">hereda {fmtDOP(pSv.montoCentavos)}</span>}
                                        <button onClick={() => setModal({ tipo: 'grado', id: g.id, grado: g.nombre, servicio: sv.nombre, tanda: sv.tanda })}
                                          className="rounded-md border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:border-zero-400 hover:text-zero-600">
                                          {pSv ? 'Excepción' : 'Precio'}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                  {prodG && (
                                    <div className="mt-1 flex items-center gap-2">
                                      <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                      <span className="text-xs text-gray-500">Se factura como</span>
                                      <span className="break-all font-mono text-xs text-gray-400">{prodG.referencia ?? prodG.nombre}</span>
                                    </div>
                                  )}
                                </div>

                                {secciones.map((s) => {
                                  const pS = precioDe('seccion', s.id);
                                  const prodS = productoDe(pS);
                                  return (
                                    <div key={s.id} className={`border-b border-gray-100 px-3 py-1.5 pl-16 ${pS ? 'bg-gray-50/60' : ''}`}>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <DoorOpen className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                                        <span className={`text-sm ${pS ? 'font-medium text-gray-900' : 'text-gray-500'}`}>Sección {s.nombre}</span>
                                        <div className="flex-1" />
                                        {pS ? (
                                          <>
                                            <span className="rounded-md border border-zero-200 bg-zero-50 px-2 py-0.5 text-sm font-semibold text-zero-800">{fmtDOP(pS.montoCentavos)}</span>
                                            <button onClick={() => quitarPrecio(pS.id)} className="text-gray-300 hover:text-red-500" title="Quitar excepción"><X className="h-3.5 w-3.5" /></button>
                                          </>
                                        ) : (
                                          <>
                                            {heredaG && <span className="text-sm text-gray-400">hereda {fmtDOP(heredaG.montoCentavos)}</span>}
                                            <button onClick={() => setModal({ tipo: 'seccion', id: s.id, seccion: s.nombre, grado: g.nombre, servicio: sv.nombre, tanda: sv.tanda })}
                                              className="rounded-md border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-400 hover:border-zero-400 hover:text-zero-600">
                                              {heredaG ? 'Excepción' : 'Precio'}
                                            </button>
                                          </>
                                        )}
                                      </div>
                                      {prodS && (
                                        <div className="mt-1 flex items-center gap-2">
                                          <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                          <span className="text-xs text-gray-500">Se factura como</span>
                                          <span className="break-all font-mono text-xs text-gray-400">{prodS.referencia ?? prodS.nombre}</span>
                                        </div>
                                      )}
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
          onGuardado={() => { setModal(null); void cargar(data.periodo?.id); }}
        />
      )}
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
  onGuardado: () => void;
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
      onGuardado();
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

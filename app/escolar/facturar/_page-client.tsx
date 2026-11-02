'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { ArrowLeft, Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import Link from 'next/link';
import { PasoLote } from '@/components/administracion-escolar/cargo-lote/PasoLote';
import { PasoAlumnosLote } from '@/components/administracion-escolar/facturar-lote/PasoAlumnosLote';
import { PasoConceptosLote, type SeleccionMeses } from '@/components/administracion-escolar/facturar-lote/PasoConceptosLote';
import { RevisionLote } from '@/components/administracion-escolar/facturar-lote/RevisionLote';
import { ConfirmarFacturasDialog } from '@/components/administracion-escolar/facturar-lote/ConfirmarFacturasDialog';
import { ResultadoFacturasLote } from '@/components/administracion-escolar/facturar-lote/ResultadoFacturasLote';
import {
  crearPorTandas, facturasEnLetras, hastaParaMeses, listaDeMeses, textoCrear,
  type AlumnoCatalogo, type ConceptoCatalogo, type FacturaCreada, type FacturaFallida,
  type CuotaCalendario, type OmitidoPlan, type PendienteMes, type PlanLote,
} from '@/lib/administracion-escolar/facturar-lote';
import { fmtDOP } from '@/lib/utils/format';

/**
 * El cajón de «Ver factura» monta la pantalla entera de una factura, de las más
 * pesadas del sistema: no viaja en el paquete de esta página hasta que hace falta.
 */
const VerFacturaDrawer = dynamic(
  () => import('@/components/administracion-escolar/VerFacturaDrawer').then((m) => m.VerFacturaDrawer),
  { ssr: false },
);

const API = '/api/administracion-escolar/cargos/facturar-lote';

/**
 * Facturar por lote: «selecciona un montón de estudiantes, selecciona conceptos
 * y agrégale una factura a cada uno».
 *
 * Son tres preguntas, una a la vez y en el orden en que la secretaria lo piensa
 * (la misma forma de «Cobrar a un grupo», que es la otra mitad de cobrar):
 *
 *   1. A quiénes — los alumnos, con filtros y «seleccionar todos los filtrados».
 *   2. Qué — los conceptos, los meses y si se juntan hermanos.
 *   3. Revisa y crea — una fila por factura futura, y aparte los que se quedan
 *      sin factura con su razón. Hasta aquí no se ha escrito NADA.
 *
 * «Todo lo pendiente» se salta las dos primeras: marca a todos los alumnos y
 * todos los conceptos con corte hoy, y va directo a la vista previa.
 *
 * Lo que no se puede romper:
 *  - la creación manda el PEDIDO con que se calculó la vista previa
 *    (`vista.pedido`), no lo que haya ahora en los campos: la lista que se vio es
 *    la que se crea. Cambiar cualquier dato tira la vista previa;
 *  - el servidor vuelve a calcular el plan al crear, así que un cargo que
 *    mientras tanto se facturó se omite, no se factura dos veces;
 *  - las facturas se mandan en tandas y, si una tanda se pierde, repetir la
 *    revisión dice qué falta: lo ya facturado nunca vuelve a entrar;
 *  - nunca se envía nada a la DGII: son borradores.
 *
 * Las reglas viven en `lib/administracion-escolar/facturar-lote.ts`, donde se
 * prueban sin pantalla.
 */

interface Catalogo {
  periodo: { id: number; nombre: string };
  periodos: { id: number; nombre: string; activo: boolean }[];
  hoy: string;
  /** Los meses del año escolar, para «¿Qué meses?». */
  meses: { valor: string; texto: string }[];
  /** Lo pendiente por alumno, concepto y mes: los números de cada mes. */
  pendientes: PendienteMes[];
  /** El calendario de cada concepto en el año: qué meses cobra. */
  calendario: CuotaCalendario[];
  maxPorPeticion: number;
  alumnos: AlumnoCatalogo[];
  conceptos: ConceptoCatalogo[];
}

/** Con qué se calculó la vista previa. La creación manda esto. */
interface Pedido {
  periodoId: number;
  conceptoIds: number[];
  hasta: string;
  /** Los meses elegidos ('YYYY-MM'), o null: todo lo pendiente hasta hoy. */
  meses: string[] | null;
  juntarHermanos: boolean;
}

interface Vista { pedido: Pedido; periodo: string; plan: PlanLote }

interface Resultado {
  creadas: FacturaCreada[];
  fallidas: FacturaFallida[];
  omitidos: OmitidoPlan[];
  interrumpido: string | null;
}

const ERROR_RED = 'No se pudo conectar. Revisa tu internet e inténtalo de nuevo.';

export default function FacturarLoteClient() {
  const { mutate: mutarCache } = useSWRConfig();

  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [alumnosSel, setAlumnosSel] = useState<Set<number>>(new Set());
  const [conceptosSel, setConceptosSel] = useState<Set<number>>(new Set());
  /** Por defecto, todo lo pendiente hasta hoy (lo de siempre). */
  const [mesesSel, setMesesSel] = useState<SeleccionMeses>('todo');
  const [juntar, setJuntar] = useState(false);

  const [vista, setVista] = useState<Vista | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [errorRevision, setErrorRevision] = useState<string | null>(null);
  /** Cada revisión lleva su número: la respuesta de una que ya no es la vigente no se pinta. */
  const peticion = useRef(0);

  const [confirmando, setConfirmando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);
  const [deteniendo, setDeteniendo] = useState(false);
  const detener = useRef(false);
  /**
   * Un segundo clic en el mismo instante pasa el `if (creando)` —el estado aún
   * no se ha repintado— y lanzaría dos rondas. La referencia sí cambia en el
   * acto. (El servidor tampoco dejaría facturar dos veces, pero la segunda ronda
   * solo traería ruido: «ya estaban hechas» por cada factura.)
   */
  const enCurso = useRef(false);
  const [errorCrear, setErrorCrear] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const [facturaEnCajon, setFacturaEnCajon] = useState<number | null>(null);

  /** Lee los alumnos y conceptos de un año escolar. `reiniciar` suelta lo marcado. */
  const cargar = useCallback(async (periodoId?: number, reiniciar = true) => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const r = await fetch(periodoId ? `${API}?periodoId=${periodoId}` : API, { cache: 'no-store' });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d) throw new Error(d?.error ?? 'No se pudieron leer los alumnos.');
      const nuevo = d as Catalogo;
      setCatalogo(nuevo);
      if (reiniciar) {
        setAlumnosSel(new Set());
        setConceptosSel(new Set());
        setMesesSel('todo');
        setPaso(1);
      }
    } catch (e) {
      setErrorCarga(e instanceof Error && e.message ? e.message : ERROR_RED);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  /** Tira la vista previa: cambió algo de lo que la calculó. */
  const limpiarVista = useCallback(() => {
    peticion.current += 1;
    setVista(null);
    setRevisando(false);
    setErrorRevision(null);
  }, []);

  const cambiarAlumnos = useCallback((s: Set<number>) => { setAlumnosSel(s); limpiarVista(); }, [limpiarVista]);
  const cambiarConceptos = useCallback((s: Set<number>) => { setConceptosSel(s); limpiarVista(); }, [limpiarVista]);
  const cambiarMeses = useCallback((m: SeleccionMeses) => { setMesesSel(m); limpiarVista(); }, [limpiarVista]);
  const cambiarJuntar = useCallback((j: boolean) => { setJuntar(j); limpiarVista(); }, [limpiarVista]);

  /** Pide el plan al servidor. No escribe nada. */
  const revisar = useCallback(async (sobre?: { alumnos: number[]; conceptos: number[]; meses: SeleccionMeses }) => {
    if (!catalogo) return;
    // El corte sale de los meses: el último día del mes más tardío (o hoy).
    const sel = sobre?.meses ?? mesesSel;
    const meses = sel === 'todo' ? null : [...sel].sort();
    const pedido: Pedido = {
      periodoId: catalogo.periodo.id,
      conceptoIds: sobre?.conceptos ?? [...conceptosSel],
      hasta: meses ? hastaParaMeses(meses, catalogo.hoy) : catalogo.hoy,
      meses,
      juntarHermanos: juntar,
    };
    const estudianteIds = sobre?.alumnos ?? [...alumnosSel];
    const mio = ++peticion.current;
    setRevisando(true);
    setErrorRevision(null);
    setVista(null);
    try {
      const r = await fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pedido, estudianteIds, confirmar: false }),
      });
      const d = await r.json().catch(() => null);
      if (mio !== peticion.current) return;
      if (!r.ok || !d?.plan) {
        setErrorRevision(d?.error ?? 'No se pudo calcular la vista previa. Inténtalo de nuevo.');
        return;
      }
      setVista({ pedido, periodo: d.periodo, plan: d.plan as PlanLote });
      setPaso(3);
    } catch {
      if (mio === peticion.current) setErrorRevision(ERROR_RED);
    } finally {
      if (mio === peticion.current) setRevisando(false);
    }
  }, [catalogo, conceptosSel, mesesSel, juntar, alumnosSel]);

  /** «Todo lo pendiente»: todos los alumnos, todos los conceptos, corte hoy. */
  const todoLoPendiente = () => {
    if (!catalogo) return;
    const alumnos = catalogo.alumnos.map((a) => a.estudianteId);
    const conceptos = catalogo.conceptos.map((c) => c.id);
    setAlumnosSel(new Set(alumnos));
    setConceptosSel(new Set(conceptos));
    setMesesSel('todo');
    void revisar({ alumnos, conceptos, meses: 'todo' });
  };

  /** Crea las facturas del plan que se vio, de tanda en tanda. */
  const crear = async () => {
    if (!vista || enCurso.current) return;
    enCurso.current = true;
    setCreando(true);
    setErrorCrear(null);
    setDeteniendo(false);
    detener.current = false;

    const { creadas, fallidas, procesadas, interrumpido } = await crearPorTandas({
      facturas: vista.plan.facturas,
      debeDetenerse: () => detener.current,
      alAvanzar: (hechas, total) => setProgreso({ hechas, total }),
      enviar: async (estudianteIds) => {
        const r = await fetch(API, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...vista.pedido, estudianteIds, confirmar: true }),
        });
        const d = await r.json().catch(() => null);
        if (!r.ok || !d) {
          return {
            ok: false,
            error: d?.error
              ?? 'La respuesta del servidor no llegó. Lo ya creado se conserva y no se duplica: revisa de nuevo para ver lo que falta.',
          };
        }
        return { ok: true, creadas: (d.creadas ?? []) as FacturaCreada[], fallidas: (d.fallidas ?? []) as FacturaFallida[] };
      },
    });

    enCurso.current = false;
    setCreando(false);
    setProgreso(null);

    // Nada se llegó a procesar: no hay resultado que enseñar. Se queda el
    // diálogo con el motivo y la posibilidad de reintentar.
    if (procesadas === 0 && interrumpido) {
      setErrorCrear(interrumpido);
      return;
    }

    setConfirmando(false);
    setResultado({ creadas, fallidas, omitidos: vista.plan.omitidos, interrumpido });
    // Lo que había en las pantallas de Responsables, Estudiantes y el Panorama
    // (cuánto está «por facturar») ya no es verdad.
    if (creadas.length > 0) {
      void mutarCache((k) => typeof k === 'string' && k.startsWith('/api/administracion-escolar'));
    }
  };

  // Al terminar, el foco va al título del resultado: es lo primero que tiene que
  // oír quien no ve la pantalla.
  useEffect(() => {
    if (!resultado) return;
    window.scrollTo({ top: 0 });
    document.getElementById('facturar-lote-resultado')?.focus();
  }, [resultado]);

  const otroLote = () => {
    setResultado(null);
    limpiarVista();
    setErrorCrear(null);
    void cargar(catalogo?.periodo.id);
  };

  const revisarDeNuevo = () => {
    setResultado(null);
    // Los conteos de pendientes cambiaron: se leen otra vez, SIN soltar lo marcado.
    void cargar(catalogo?.periodo.id, false);
    void revisar();
  };

  const alumnosMarcados = alumnosSel.size;
  const conceptosMarcados = conceptosSel.size;
  const mesesOk = mesesSel === 'todo' || mesesSel.size > 0;
  const textoMeses = mesesSel === 'todo' ? 'todo lo pendiente hasta hoy' : listaDeMeses([...mesesSel]);

  const resumen1 = alumnosMarcados === 1 ? '1 alumno' : `${alumnosMarcados} alumnos`;
  const resumen2 = useMemo(() => {
    const nConceptos = conceptosMarcados === 1 ? '1 concepto' : `${conceptosMarcados} conceptos`;
    return `${nConceptos} · ${textoMeses} · ${juntar ? 'una factura por responsable' : 'una factura por alumno'}`;
  }, [conceptosMarcados, textoMeses, juntar]);

  const totalPendiente = useMemo(() => {
    if (!catalogo) return { cargos: 0, centavos: 0, alumnos: 0 };
    // Sumado por alumno, que es lo que «Todo lo pendiente» va a marcar.
    return {
      cargos: catalogo.alumnos.reduce((n, a) => n + a.sinFactura, 0),
      centavos: catalogo.alumnos.reduce((n, a) => n + a.sinFacturaCentavos, 0),
      alumnos: catalogo.alumnos.filter((a) => a.sinFactura > 0).length,
    };
  }, [catalogo]);

  return (
    <section className="mx-auto max-w-[1600px] space-y-5 p-6">
      <div>
        <Link href="/escolar/responsables" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" aria-hidden />Responsables
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Facturar por lote</h1>
        <p className="mt-1 text-sm text-gray-500">
          Elige los alumnos y los conceptos, y se crea una factura en borrador para cada uno.
          Nada se envía a la DGII ni a las familias.
        </p>
      </div>

      {cargando && !catalogo && (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Cargando alumnos…</p>
      )}

      {errorCarga && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorCarga}{' '}
          <button type="button" className="font-medium underline" onClick={() => void cargar(catalogo?.periodo.id)}>
            Intentar otra vez
          </button>
        </div>
      )}

      {catalogo && resultado && (
        <ResultadoFacturasLote
          creadas={resultado.creadas}
          fallidas={resultado.fallidas}
          omitidos={resultado.omitidos}
          interrumpido={resultado.interrumpido}
          onVer={setFacturaEnCajon}
          onOtroLote={otroLote}
          onRevisarDeNuevo={revisarDeNuevo}
        />
      )}

      {catalogo && !resultado && (
        <>
          {catalogo.periodos.length > 1 && (
            <div className="flex items-center gap-2">
              <label htmlFor="facturar-lote-periodo" className="text-sm font-medium text-gray-700">Año escolar</label>
              <NativeSelect id="facturar-lote-periodo" className="sm:!w-60" value={catalogo.periodo.id}
                disabled={cargando || revisando || creando}
                onChange={(e) => { limpiarVista(); void cargar(Number(e.target.value)); }}>
                {catalogo.periodos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}{p.activo ? ' (en curso)' : ''}</option>
                ))}
              </NativeSelect>
            </div>
          )}

          {/* El atajo: lo que casi siempre se quiere el día que se factura. */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zero-200 bg-zero-50 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zero-900">¿Facturar todo lo que está pendiente?</p>
              <p className="text-xs text-zero-800">
                {totalPendiente.cargos === 0
                  ? 'Ahora mismo no hay ningún cargo sin factura.'
                  : `Hay ${totalPendiente.cargos} ${totalPendiente.cargos === 1 ? 'cargo' : 'cargos'} sin factura (${fmtDOP(totalPendiente.centavos)}) de ${totalPendiente.alumnos} ${totalPendiente.alumnos === 1 ? 'alumno' : 'alumnos'}. Marca a todos los alumnos y todos los conceptos, con todo lo pendiente hasta hoy, y te muestra la vista previa.`}
              </p>
            </div>
            <Button variant="outline" className="bg-white" onClick={todoLoPendiente}
              disabled={revisando || creando || totalPendiente.cargos === 0}>
              {revisando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Zap className="mr-1.5 h-4 w-4" aria-hidden />}
              Todo lo pendiente
            </Button>
          </div>

          {errorRevision && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {errorRevision}
            </div>
          )}

          {/* ── 1. A quiénes ── */}
          {paso === 1 ? (
            <PasoLote numero={1} titulo="¿A quiénes les vas a facturar?" estado="abierto">
              {/* `key` por año: el filtro de grado vive dentro del paso, y al
                  cambiar de año se quedaba con un grado del anterior — la lista
                  salía vacía con el desplegable diciendo «Todos los grados». */}
              <PasoAlumnosLote key={catalogo.periodo.id} alumnos={catalogo.alumnos} seleccion={alumnosSel} onCambiar={cambiarAlumnos} />
              <div className="flex justify-end border-t border-gray-100 px-4 py-3 sm:px-5">
                <Button className="bg-zero-600 hover:bg-zero-700" disabled={alumnosMarcados === 0}
                  onClick={() => setPaso(2)}>
                  {alumnosMarcados === 0 ? 'Marca al menos un alumno' : `Continuar con ${resumen1}`}
                </Button>
              </div>
            </PasoLote>
          ) : (
            <PasoLote numero={1} titulo="A quiénes" estado="contestado" resumen={resumen1} onCambiar={() => setPaso(1)} />
          )}

          {/* ── 2. Qué ── */}
          {paso === 2 ? (
            <PasoLote numero={2} titulo="¿Qué se factura?" estado="abierto">
              <PasoConceptosLote
                conceptos={catalogo.conceptos} seleccionados={conceptosSel} onConceptos={cambiarConceptos}
                alumnos={alumnosSel} pendientes={catalogo.pendientes ?? []} calendario={catalogo.calendario ?? []}
                meses={catalogo.meses ?? []}
                hoy={catalogo.hoy} mesesSel={mesesSel} onMeses={cambiarMeses}
                juntar={juntar} onJuntar={cambiarJuntar} />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 sm:px-5">
                <Button variant="outline" onClick={() => setPaso(1)}>Atrás</Button>
                <Button className="bg-zero-600 hover:bg-zero-700"
                  disabled={conceptosMarcados === 0 || !mesesOk || revisando}
                  onClick={() => void revisar()}>
                  {revisando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                  {conceptosMarcados === 0 ? 'Marca al menos un concepto' : 'Revisar las facturas'}
                </Button>
              </div>
            </PasoLote>
          ) : paso === 3 ? (
            <PasoLote numero={2} titulo="Qué se factura" estado="contestado" resumen={resumen2} onCambiar={() => setPaso(2)} />
          ) : (
            <PasoLote numero={2} titulo="Qué se factura" estado="pendiente" />
          )}

          {/* ── 3. Revisa y crea ── */}
          {paso === 3 ? (
            <PasoLote numero={3} titulo="Revisa y crea" estado="abierto">
              {revisando && !vista && (
                <p className="flex items-center gap-2 px-5 py-6 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />Calculando las facturas…
                </p>
              )}
              {/* Se llegó aquí y la vista previa no salió (falló al volver a
                  revisar): sin esto el paso quedaba abierto y vacío. */}
              {!revisando && !vista && (
                <div className="flex flex-wrap items-center gap-3 px-5 py-6">
                  <p className="text-sm text-gray-600">No hay una vista previa calculada.</p>
                  <Button variant="outline" onClick={() => void revisar()}>Calcular de nuevo</Button>
                </div>
              )}
              {vista && (
                <>
                  <RevisionLote plan={vista.plan} juntar={vista.pedido.juntarHermanos} periodo={vista.periodo} />
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 sm:px-5">
                    <div className="text-sm text-gray-600">
                      <span className="font-semibold text-gray-900">{facturasEnLetras(vista.plan.facturas.length)}</span>
                      {' · '}{vista.plan.totalCargos} {vista.plan.totalCargos === 1 ? 'cargo' : 'cargos'}
                      {' · '}<span className="tabular-nums">{fmtDOP(vista.plan.totalCentavos)}</span>
                    </div>
                    <Button className="bg-zero-600 hover:bg-zero-700" disabled={vista.plan.facturas.length === 0}
                      onClick={() => { setErrorCrear(null); setConfirmando(true); }}>
                      {vista.plan.facturas.length === 0 ? 'No hay nada que crear' : textoCrear(vista.plan.facturas.length)}
                    </Button>
                  </div>
                </>
              )}
            </PasoLote>
          ) : (
            <PasoLote numero={3} titulo="Revisa y crea" estado="pendiente" />
          )}
        </>
      )}

      <ConfirmarFacturasDialog
        abierto={confirmando && !!vista}
        facturas={vista?.plan.facturas.length ?? 0}
        cargos={vista?.plan.totalCargos ?? 0}
        totalCentavos={vista?.plan.totalCentavos ?? 0}
        juntar={vista?.pedido.juntarHermanos ?? false}
        meses={vista?.pedido.meses ? listaDeMeses(vista.pedido.meses) : 'todo lo pendiente hasta hoy'}
        creando={creando}
        progreso={progreso}
        deteniendo={deteniendo}
        error={errorCrear}
        onCerrar={() => setConfirmando(false)}
        onConfirmar={() => void crear()}
        onDetener={() => { detener.current = true; setDeteniendo(true); }}
      />

      <VerFacturaDrawer documentoId={facturaEnCajon} onCerrar={() => setFacturaEnCajon(null)} />
    </section>
  );
}

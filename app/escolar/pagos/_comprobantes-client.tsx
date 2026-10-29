'use client';

/**
 * La cola de comprobantes que suben los padres.
 *
 * Es una cola de trabajo, no un listado: lo pendiente arriba, el archivo a un
 * clic y las dos decisiones —aprobar o rechazar— siempre a la vista. Quien
 * revisa esto tiene la pantalla del banco abierta al lado y va comparando.
 *
 * Aprobar registra el cobro contra la factura del cargo. Lo que no tiene
 * factura no se puede cobrar, y eso se dice DESPUÉS de aprobar, con el detalle
 * de qué quedó fuera: esconderlo haría creer que la deuda bajó cuando no bajó.
 *
 * El botón de aprobar no cobra: abre el diálogo donde se ve el reparto, se
 * corrige el monto y se elige el banco donde entró el dinero. Rechazar sí
 * decide en el sitio — no mueve dinero, solo necesita el motivo que el padre va
 * a leer.
 *
 * Cada tarjeta muestra lo que la IA leyó del papel (rotulado «Leído por IA —
 * revísalo»: propone, no decide) y, si el comprobante se parece a otro de la
 * misma familia, un aviso de posible duplicado con un enlace al original.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AprobarComprobanteDialog } from '@/components/administracion-escolar/AprobarComprobanteDialog';
import { AvisoDuplicadoComprobante } from '@/components/administracion-escolar/AvisoDuplicadoComprobante';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import type { CuentaBancoOpcion } from '@/lib/pagos/bancos';
import type { Duplicado, LecturaComprobanteIa } from '@/lib/administracion-escolar/comprobante-lectura';
import {
  CheckCircle2, Clock, FileText, Landmark, Loader2, Paperclip, Sparkles, XCircle, AlertTriangle, ExternalLink, Search,
} from 'lucide-react';

interface CargoSnapshot {
  cargoId: number;
  estudiante: string;
  concepto: string;
  montoCentavos: number;
  fechaVencimiento: string | null;
}

interface Comprobante {
  id: number;
  estado: string;
  montoCentavos: number;
  referencia: string | null;
  bancoOrigen: string | null;
  nota: string | null;
  responsable: string | null;
  responsableEmail: string | null;
  archivoNombre: string | null;
  archivoMime: string;
  archivoBytes: number;
  cargos: CargoSnapshot[];
  motivoRechazo: string | null;
  creadoEn: string;
  revisadoEn: string | null;
  lectura: LecturaComprobanteIa | null;
  cuentaBanco: { id: number; etiqueta: string } | null;
  duplicado: Duplicado | null;
}

/** Mientras sea más reciente que esto, un comprobante sin lectura es «la IA aún lo está leyendo». */
const VENTANA_LECTURA_MS = 3 * 60 * 1000;
/** Cada cuánto se vuelve a pedir la lista mientras se espera una lectura, y cuántas veces como máximo. */
const ESPERA_LECTURA_MS = 6_000;
const MAX_REINTENTOS_LECTURA = 8;

/**
 * El estado va en un `<span>` y no en `<Badge>` a propósito.
 *
 * `Badge` es un Chip de MUI y su `sx` pisa las clases de Tailwind: pendiente y
 * aprobado salían los dos del mismo azul, que en una cola de revisión es el
 * peor error posible — no se distingue lo hecho de lo que falta.
 */
const ESTADO: Record<string, { label: string; clase: string; borde: string; icono: typeof Clock }> = {
  pendiente: { label: 'Pendiente', clase: 'bg-amber-50 text-amber-800 ring-amber-200',     borde: 'border-l-amber-400',   icono: Clock },
  aprobado:  { label: 'Aprobado',  clase: 'bg-emerald-50 text-emerald-800 ring-emerald-200', borde: 'border-l-emerald-400', icono: CheckCircle2 },
  rechazado: { label: 'Rechazado', clase: 'bg-red-50 text-red-800 ring-red-200',           borde: 'border-l-red-400',     icono: XCircle },
};

/** Los cargos llegan repetidos por estudiante; agrupados se leen de un vistazo. */
function porEstudiante(cargos: CargoSnapshot[]): Array<{ estudiante: string; lineas: CargoSnapshot[]; total: number }> {
  const mapa = new Map<string, CargoSnapshot[]>();
  for (const c of cargos) {
    const k = c.estudiante || 'Sin estudiante';
    (mapa.get(k) ?? mapa.set(k, []).get(k)!).push(c);
  }
  return [...mapa.entries()].map(([estudiante, lineas]) => ({
    estudiante, lineas, total: lineas.reduce((t, l) => t + l.montoCentavos, 0),
  }));
}

function cuando(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-DO', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

/**
 * Lo que la IA leyó del papel, en una línea, para decidir de un vistazo si vale
 * la pena abrir el diálogo. Siempre rotulado: es una propuesta, no un dato.
 */
function ResumenLectura({ c }: { c: Comprobante }) {
  const l = c.lectura;
  if (!l) {
    const reciente = Date.now() - new Date(c.creadoEn).getTime() < VENTANA_LECTURA_MS;
    return reciente ? (
      <p className="flex items-center gap-1.5 text-xs text-sky-700">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> La IA está leyendo el comprobante…
      </p>
    ) : null;
  }
  if (!l.esComprobante) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
        La IA no reconoce esta imagen como un comprobante de pago. Revísala.
      </p>
    );
  }

  const datos = [
    l.bancoDestino && `Banco: ${l.bancoDestino}`,
    l.montoCentavos != null && fmtDOP(l.montoCentavos),
    l.fecha && fmtFechaCorta(l.fecha),
    l.referencia && `ref. ${l.referencia}`,
  ].filter(Boolean);
  // El papel dice una cosa y la familia declaró otra: eso es lo que más importa.
  const difiere = l.montoCentavos != null && l.montoCentavos !== c.montoCentavos;

  return (
    <div className="space-y-1.5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1 font-semibold text-sky-700">
          <Sparkles className="h-3.5 w-3.5" /> Leído por IA — revísalo
        </span>
        <span>{datos.length ? datos.join(' · ') : 'No se pudo leer nada con seguridad'}</span>
      </p>
      {difiere && (
        <p className="flex items-start gap-1.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          El papel dice {fmtDOP(l.montoCentavos!)} y la familia declaró {fmtDOP(c.montoCentavos)}.
        </p>
      )}
    </div>
  );
}

export function ComprobantesClient() {
  const [filas, setFilas] = useState<Comprobante[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [viendo, setViendo] = useState<Comprobante | null>(null);
  const [cuentasBanco, setCuentasBanco] = useState<CuentaBancoOpcion[]>([]);
  // Se guarda el id y no la fila: la lista se recarga sola (para traer la lectura
  // de la IA) y el diálogo tiene que ver la fila nueva, no una copia vieja.
  const [aprobandoId, setAprobandoId] = useState<number | null>(null);
  const [rechazando, setRechazando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'pendiente' | 'aprobado' | 'rechazado'>('todos');
  const [busca, setBusca] = useState('');
  // El comprobante al que lleva la campana de notificaciones (`?comprobante=12`):
  // se resalta y se baja hasta él. Se lee una vez; no es estado de la pantalla.
  const [resaltado, setResaltado] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const v = new URLSearchParams(window.location.search).get('comprobante');
    return v && /^\d+$/.test(v) ? Number(v) : null;
  });

  /**
   * `silenciosa` recarga sin el spinner de pantalla completa: se usa para traer
   * la lectura de la IA, y un spinner desmontaría el diálogo que el revisor
   * tiene abierto.
   */
  const cargar = useCallback(async (silenciosa = false) => {
    if (!silenciosa) { setCargando(true); setError(null); }
    try {
      const r = await fetch('/api/administracion-escolar/comprobantes');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error cargando comprobantes');
      setFilas(d.comprobantes ?? []);
      setCuentasBanco(d.cuentasBanco ?? []);
    } catch (e) {
      if (!silenciosa) setError(e instanceof Error ? e.message : 'Error cargando comprobantes');
    } finally {
      if (!silenciosa) setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Llegar desde la campana: bajar hasta el comprobante que avisó. Solo cuando
  // la lista ya pintó, y una vez — después de aprobar se recarga y no debe
  // volver a saltar.
  const yaBajo = useRef(false);
  useEffect(() => {
    if (cargando || resaltado == null || yaBajo.current) return;
    yaBajo.current = true;
    document.getElementById(`comprobante-${resaltado}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [cargando, resaltado]);

  // La IA lee el papel unos segundos DESPUÉS de que la familia lo sube. Si hay
  // pendientes recién llegados sin lectura, se vuelve a pedir la lista cada pocos
  // segundos (pocas veces): quien abrió la pantalla al instante, por la campana,
  // ve aparecer la lectura sin recargar. Sin llave de IA no hay lectura nunca, y
  // por eso el tope de reintentos: pasada la ventana, se deja de preguntar.
  const reintentos = useRef(0);
  useEffect(() => {
    const esperando = filas.some((f) =>
      f.estado === 'pendiente' && !f.lectura && Date.now() - new Date(f.creadoEn).getTime() < VENTANA_LECTURA_MS);
    if (!esperando || reintentos.current >= MAX_REINTENTOS_LECTURA) return;
    const t = setTimeout(() => { reintentos.current += 1; void cargar(true); }, ESPERA_LECTURA_MS);
    return () => clearTimeout(t);
  }, [filas, cargar]);

  /**
   * Ir al comprobante del que este es posible duplicado: se quitan los filtros
   * (el original puede estar aprobado y escondido), se resalta y se baja hasta él.
   */
  const irA = useCallback((id: number) => {
    setAprobandoId(null);
    setFiltroEstado('todos'); setBusca('');
    setResaltado(id);
    setTimeout(() => {
      document.getElementById(`comprobante-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 60);
  }, []);

  async function rechazar(id: number, motivoTexto: string) {
    setOcupado(id); setAviso(null); setError(null);
    try {
      const r = await fetch(`/api/administracion-escolar/comprobantes/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'rechazar', motivo: motivoTexto }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'No se pudo procesar'); return; }

      setRechazando(null); setMotivo('');
      await cargar();
    } catch {
      setError('Error de red');
    } finally {
      setOcupado(null);
    }
  }

  /**
   * El resultado lo cuenta el SERVIDOR, no el diálogo: entre la previa y el
   * clic pudo cobrarse una de esas facturas en caja, y lo que hay que leer es
   * lo que acabó entrando, no lo que se prometió.
   */
  const trasAprobar = useCallback(async (r: {
    aplicadoCentavos: number; sinAplicarCentavos: number; cargosSinFactura: string[];
  }) => {
    setError(null);
    const partes = [`Cobro registrado: ${fmtDOP(r.aplicadoCentavos)}`];
    if (r.sinAplicarCentavos > 0) {
      partes.push(
        `Quedaron ${fmtDOP(r.sinAplicarCentavos)} sin aplicar` +
        (r.cargosSinFactura.length
          ? `: ${r.cargosSinFactura.join(', ')} todavía no está facturado. Factura el cargo y registra el cobro en la factura.`
          : ' porque las facturas ya estaban saldadas.'),
      );
    }
    setAviso(partes.join('. '));
    await cargar();
  }, [cargar]);

  const aprobando = aprobandoId == null ? null : filas.find((f) => f.id === aprobandoId) ?? null;
  const pendientes = filas.filter((f) => f.estado === 'pendiente');
  const montoPendiente = pendientes.reduce((s, f) => s + f.montoCentavos, 0);

  // El aviso de arriba cuenta SIEMPRE sobre el total, no sobre lo filtrado:
  // esconder pendientes con un filtro no los hace desaparecer de la cola.
  const cuenta = {
    todos: filas.length,
    pendiente: pendientes.length,
    aprobado: filas.filter((f) => f.estado === 'aprobado').length,
    rechazado: filas.filter((f) => f.estado === 'rechazado').length,
  };

  const q = busca.trim().toLowerCase();
  const visibles = filas.filter((f) => {
    if (filtroEstado !== 'todos' && f.estado !== filtroEstado) return false;
    if (!q) return true;
    // Se busca por lo que alguien tiene delante cuando compara con el banco:
    // el nombre del padre, la referencia, el banco y el nombre de los hijos.
    return [
      f.responsable, f.referencia, f.bancoOrigen,
      ...f.cargos.map((c) => c.estudiante),
    ].some((t) => (t ?? '').toLowerCase().includes(q));
  });

  if (cargando) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pendientes.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <Clock className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-900">
            <b>{pendientes.length}</b> {pendientes.length === 1 ? 'comprobante' : 'comprobantes'} por revisar
            {' · '}{fmtDOP(montoPendiente)}. Mientras no los apruebes, la deuda sigue abierta y a la
            familia le seguirán saliendo los avisos.
          </p>
        </div>
      )}

      {aviso && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <p className="text-sm text-emerald-900">{aviso}</p>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      {filas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
            {([
              ['todos', 'Todos'], ['pendiente', 'Por revisar'],
              ['aprobado', 'Aprobados'], ['rechazado', 'Rechazados'],
            ] as const).map(([clave, etiqueta]) => (
              <button
                key={clave}
                type="button"
                onClick={() => setFiltroEstado(clave)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  filtroEstado === clave
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {etiqueta}
                <span className={`ml-1.5 tabular-nums ${filtroEstado === clave ? 'text-gray-400' : 'text-gray-400'}`}>
                  {cuenta[clave]}
                </span>
              </button>
            ))}
          </div>

          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Familia, estudiante, referencia o banco…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-gray-400 focus:border-zero-500 focus:ring-1 focus:ring-zero-500"
            />
          </div>
        </div>
      )}

      {filas.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Paperclip className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p className="font-medium text-gray-900">Todavía no hay comprobantes</p>
            <p className="mt-1 text-sm text-gray-500">
              Aparecerán aquí cuando una familia suba el suyo desde su enlace de pago.
            </p>
          </CardContent>
        </Card>
      ) : visibles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="mx-auto mb-3 h-9 w-9 text-gray-300" />
            <p className="font-medium text-gray-900">Nada con ese filtro</p>
            <p className="mt-1 text-sm text-gray-500">
              Hay {filas.length} {filas.length === 1 ? 'comprobante' : 'comprobantes'} en total.
            </p>
            <button
              type="button"
              onClick={() => { setFiltroEstado('todos'); setBusca(''); }}
              className="mt-3 text-sm font-medium text-zero-600 hover:underline"
            >
              Quitar los filtros
            </button>
          </CardContent>
        </Card>
      ) : (
        visibles.map((c) => {
          const e = ESTADO[c.estado] ?? ESTADO.pendiente;
          const Icono = e.icono;
          const esImagen = c.archivoMime.startsWith('image/');
          return (
            <Card key={c.id} id={`comprobante-${c.id}`} className={`border-l-4 ${e.borde}`}
              style={c.id === resaltado ? { outline: '2px solid #3658e1', outlineOffset: 2 } : undefined}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{c.responsable ?? 'Responsable eliminado'}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${e.clase}`}>
                        <Icono className="h-3 w-3" />{e.label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {cuando(c.creadoEn)}
                      {c.referencia && <> · ref. <span className="font-mono">{c.referencia}</span></>}
                      {c.bancoOrigen && <> · {c.bancoOrigen}</>}
                    </p>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{fmtDOP(c.montoCentavos)}</p>
                </div>

                {c.cargos.length > 0 && (
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Lo que debía al subirlo
                    </p>
                    <div className="space-y-2.5">
                      {porEstudiante(c.cargos).map((g) => (
                        <div key={g.estudiante}>
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-sm font-semibold text-gray-900">{g.estudiante}</span>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{fmtDOP(g.total)}</span>
                          </div>
                          <ul className="mt-0.5 space-y-0.5 text-sm text-gray-600">
                            {g.lineas.map((x) => (
                              <li key={x.cargoId} className="flex justify-between gap-3 pl-3">
                                <span className="truncate">{x.concepto}</span>
                                <span className="shrink-0 tabular-nums">{fmtDOP(x.montoCentavos)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lo primero que hay que ver si este pago ya se registró antes. */}
                {c.duplicado && <AvisoDuplicadoComprobante duplicado={c.duplicado} onVer={irA} />}

                {c.estado === 'pendiente' && <ResumenLectura c={c} />}

                {c.estado === 'aprobado' && c.cuentaBanco && (
                  <p className="flex items-center gap-1.5 text-sm text-gray-700">
                    <Landmark className="h-4 w-4 text-gray-400" />
                    Entró en <span className="font-medium text-gray-900">{c.cuentaBanco.etiqueta}</span>
                  </p>
                )}

                {c.nota && <p className="text-sm italic text-gray-600">«{c.nota}»</p>}
                {c.motivoRechazo && (
                  <p className="text-sm text-red-700">Rechazado: {c.motivoRechazo}</p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setViendo(c)}>
                    <FileText className="mr-1.5 h-4 w-4" /> Ver comprobante
                  </Button>
                  <a href={`/api/administracion-escolar/comprobantes/${c.id}/archivo`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
                    <ExternalLink className="h-3.5 w-3.5" />
                    {esImagen ? 'Abrir imagen' : 'Abrir PDF'}
                    <span className="text-gray-400">({Math.round(c.archivoBytes / 1024)} KB)</span>
                  </a>

                  {c.estado === 'pendiente' && (
                    <div className="ml-auto flex gap-2">
                      <Button variant="outline" size="sm" disabled={ocupado === c.id}
                        onClick={() => { setRechazando(c.id); setMotivo(''); }}>
                        Rechazar
                      </Button>
                      <Button size="sm" disabled={ocupado === c.id}
                        onClick={() => setAprobandoId(c.id)}>
                        {ocupado === c.id
                          ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                        Aprobar y registrar cobro
                      </Button>
                    </div>
                  )}
                </div>

                {rechazando === c.id && (
                  <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                    <label className="block text-sm font-medium text-red-900">
                      ¿Por qué lo rechazas? La familia lo va a leer en su pantalla.
                    </label>
                    <textarea rows={2} value={motivo} onChange={(ev) => setMotivo(ev.target.value)}
                      placeholder="Ej.: el comprobante no muestra el monto, o la transferencia no aparece en la cuenta."
                      className="w-full rounded-md border border-red-200 p-2 text-sm" />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm"
                        onClick={() => { setRechazando(null); setMotivo(''); }}>Cancelar</Button>
                      <Button size="sm" disabled={!motivo.trim() || ocupado === c.id}
                        onClick={() => rechazar(c.id, motivo)}>
                        Confirmar rechazo
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      <AprobarComprobanteDialog
        comprobante={aprobando}
        cuentas={cuentasBanco}
        abierto={aprobando !== null}
        onCerrar={() => setAprobandoId(null)}
        onVerDuplicado={irA}
        onAprobado={trasAprobar}
      />

      {/* Ver el archivo sin salir de la cola. */}
      {viendo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setViendo(null)}>
          <div className="max-h-full w-full max-w-3xl overflow-auto rounded-lg bg-white p-4"
            onClick={(ev) => ev.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{viendo.responsable}</p>
                <p className="text-sm text-gray-500">
                  {fmtDOP(viendo.montoCentavos)} · {viendo.archivoNombre}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setViendo(null)}>Cerrar</Button>
            </div>
            {viendo.archivoMime.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/administracion-escolar/comprobantes/${viendo.id}/archivo`}
                alt="Comprobante" className="mx-auto max-w-full rounded" />
            ) : (
              <iframe src={`/api/administracion-escolar/comprobantes/${viendo.id}/archivo`}
                className="h-[70vh] w-full rounded border" title="Comprobante" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

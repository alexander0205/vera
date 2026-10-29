'use client';

/**
 * Ver a dónde va el dinero ANTES de registrarlo.
 *
 * «Aprobar y registrar cobro» era un clic a ciegas: repartía contra las facturas
 * y contaba el resultado DESPUÉS. Dos cosas hacen que eso no valga:
 *
 *  · el monto que trae el comprobante es el que el padre ESCRIBIÓ, y el papel
 *    del banco a veces dice otra cosa — declaró RD$5,000 y transfirió RD$4,800.
 *    Sin poder corregirlo, la única salida era rechazar y pedirle que lo
 *    subiera otra vez, con la transferencia ya hecha;
 *  · lo que no tiene factura no se puede cobrar, y enterarse después de aprobar
 *    es enterarse cuando ya no hay nada que decidir.
 *
 * Así que el papel y los números se miran juntos, en la misma pantalla, y el
 * reparto se recalcula con el monto corregido antes de confirmar.
 *
 * Dos cosas más viven aquí, las dos de decisión humana:
 *
 *  · El banco donde entró el dinero. Con una sola cuenta en el colegio viene
 *    marcada; con varias, si la IA leyó el banco en el papel y casa con una
 *    cuenta, viene marcada esa; si no, hay que elegir antes de registrar. Es el
 *    mismo `cuentaBancoId` del cobro manual, no un dato aparte.
 *  · Lo que la IA leyó del papel (banco, monto, fecha, referencia), con el
 *    rótulo «Leído por IA — revísalo». Propone y el revisor decide: cada valor
 *    se copia a mano con «Usar», nada se pisa solo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ModalHeader } from '@/components/ui/modal-header';
import { METODOS_PAGO } from '@/lib/pagos/metodos';
import {
  bancoObligatorio, casarCuentaBanco, cuentaInicial, mismoBanco, type CuentaBancoOpcion,
} from '@/lib/pagos/bancos';
import {
  compararMonto, type Duplicado, type LecturaComprobanteIa,
} from '@/lib/administracion-escolar/comprobante-lectura';
import { AvisoDuplicadoComprobante } from './AvisoDuplicadoComprobante';
import { fmtCodigoCorto, fmtDOP, fmtFechaCorta, hoyRD } from '@/lib/utils/format';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Sparkles } from 'lucide-react';

/** Lo justo que hace falta de la fila; el cliente pasa la suya entera. */
export interface ComprobantePorAprobar {
  id: number;
  montoCentavos: number;
  referencia: string | null;
  responsable: string | null;
  archivoMime: string;
  archivoNombre: string | null;
  /** Cuándo se subió: dice si la IA todavía puede estar leyéndolo. */
  creadoEn: string;
  /** Lo que la IA leyó; null = no hay lectura (todavía, o nunca). */
  lectura: LecturaComprobanteIa | null;
  /** A cuál se parece, si es un posible duplicado. */
  duplicado: Duplicado | null;
}

interface Destino {
  facturaId: number;
  encf: string | null;
  codigo: string | null;
  montoCentavos: number;
  detalle: string;
}

interface Previa {
  montoCentavos: number;
  destinos: Destino[];
  aplicadoCentavos: number;
  sinAplicarCentavos: number;
  cargosSinFactura: string[];
  declaradoCentavos: number;
  referencia: string | null;
  estado: string;
}

/**
 * Lo tecleado → centavos. `null` si no es un número que se pueda cobrar.
 *
 * Las comas se van porque el revisor copia el monto del papel tal cual lo ve
 * —«4,800.00»— y `Number('4,800.00')` es `NaN`: el botón se quedaba apagado sin
 * decir por qué. En RD la coma es separador de miles, nunca decimal.
 */
/**
 * Cómo se nombra la factura debajo del concepto.
 *
 * Con `??` no bastaba: una factura en borrador guarda el e-NCF como cadena
 * VACÍA, no como nulo, así que la línea salía en blanco justo en el caso más
 * común de un colegio —cobrar antes de emitir a la DGII.
 */
function nombreFactura(d: Destino): string {
  return d.encf?.trim() || fmtCodigoCorto(d.codigo) || `Factura #${d.facturaId}`;
}

function aCentavos(texto: string): number | null {
  const limpio = texto.replace(/,/g, '').trim();
  if (limpio === '') return null;
  const pesos = Number(limpio);
  if (!Number.isFinite(pesos) || pesos <= 0) return null;
  return Math.round(pesos * 100);
}

/** Una línea de «Leído por IA»: etiqueta, valor y, si se puede, «Usar» para copiarlo al formulario. */
function FilaLectura({ etiqueta, valor, mono, onUsar }: {
  etiqueta: string; valor: string | null; mono?: boolean; onUsar?: () => void;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-gray-500">{etiqueta}</dt>
      <dd className="flex min-w-0 items-baseline gap-2">
        <span className={`truncate text-right ${mono ? 'font-mono text-xs' : ''} ${valor ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
          {valor ?? 'No se ve'}
        </span>
        {onUsar && (
          <button type="button" onClick={onUsar}
            className="shrink-0 text-xs font-semibold text-sky-700 hover:underline">
            Usar
          </button>
        )}
      </dd>
    </div>
  );
}

/** Mientras sea más reciente que esto, la falta de lectura es «todavía la está leyendo», no «no hay». */
const VENTANA_LECTURA_MS = 3 * 60 * 1000;

export function AprobarComprobanteDialog({ comprobante, cuentas, abierto, onCerrar, onVerDuplicado, onAprobado }: {
  comprobante: ComprobantePorAprobar | null;
  /** Las cuentas activas del colegio, para «Banco donde entró el dinero». */
  cuentas: CuentaBancoOpcion[];
  abierto: boolean;
  onCerrar: () => void;
  /** Lleva a otro comprobante de la lista (el duplicado). Cierra el diálogo. */
  onVerDuplicado?: (id: number) => void;
  /** Le devuelve al listado lo que contó el servidor, para el aviso de arriba. */
  onAprobado: (resultado: {
    aplicadoCentavos: number;
    sinAplicarCentavos: number;
    cargosSinFactura: string[];
  }) => void;
}) {
  const [monto, setMonto] = useState('');
  const [fechaPago, setFechaPago] = useState('');
  const [metodo, setMetodo] = useState('transferencia');
  const [referencia, setReferencia] = useState('');
  // Vacío = sin elegir. Es un string porque es el `value` de un <select>.
  const [cuentaId, setCuentaId] = useState('');

  const [previa, setPrevia] = useState<Previa | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const id = comprobante?.id ?? null;
  /**
   * De aquí abajo se trabaja con los valores sueltos, no con el objeto.
   *
   * El efecto que rellena los campos depende de ellos, y con el objeto entero
   * bastaba con que el listado se recargara —cosa que hace sola— para que
   * llegara otro objeto igual, el efecto volviera a correr y le borrara al
   * revisor el monto que acababa de corregir.
   */
  const declaradoCentavos = comprobante?.montoCentavos ?? 0;
  const referenciaDelPadre = comprobante?.referencia ?? '';

  // Los campos arrancan de cero en cada comprobante: si se quedaran del
  // anterior, el revisor aprobaría el segundo con el monto corregido del primero.
  useEffect(() => {
    if (!abierto || id == null) return;
    setMonto((declaradoCentavos / 100).toFixed(2));
    // Hoy en hora RD, no la del navegador: es la fecha con la que el cobro entra
    // en los reportes fiscales, y de noche el UTC ya va por el día siguiente.
    setFechaPago(hoyRD());
    setMetodo('transferencia');
    setReferencia(referenciaDelPadre);
    setPrevia(null);
    setError(null);
  }, [abierto, id, declaradoCentavos, referenciaDelPadre]);

  /**
   * El banco que viene marcado. Se recalcula cuando llega la lectura de la IA
   * (puede tardar unos segundos después de subirse, con el diálogo ya abierto),
   * pero SOLO mientras el revisor no haya tocado el desplegable: lo que él
   * elige no se lo pisa una lectura tardía.
   */
  const lectura = comprobante?.lectura?.esComprobante ? comprobante.lectura : null;
  const bancoLeido = lectura?.bancoDestino ?? null;
  const finLeido = lectura?.cuentaDestinoUltimos4 ?? null;
  const sugerida = useMemo(
    () => cuentaInicial(cuentas, { banco: bancoLeido, ultimos4: finLeido }),
    [cuentas, bancoLeido, finLeido],
  );
  const bancoTocado = useRef(false);
  useEffect(() => { if (abierto) bancoTocado.current = false; }, [abierto, id]);
  useEffect(() => {
    if (!abierto || id == null || bancoTocado.current) return;
    setCuentaId(sugerida != null ? String(sugerida) : '');
  }, [abierto, id, sugerida]);

  // El efectivo no pasa por un banco; cualquier otro método sí puede, y en
  // transferencia o depósito con varias cuentas es obligatorio elegir.
  const pideBanco = cuentas.length > 0 && metodo !== 'efectivo';
  const bancoFalta = pideBanco && bancoObligatorio(metodo, cuentas.length) && cuentaId === '';

  /**
   * La previa se pide al servidor, nunca se calcula aquí: el reparto depende del
   * saldo REAL de cada factura —lo cobrado en caja, las notas de crédito— y el
   * navegador no lo sabe. Es además la misma función que ejecuta la aprobación,
   * así que lo que se enseña no puede diferir de lo que se escribe.
   */
  const centavos = aCentavos(monto);
  const primeraVez = useRef(true);

  useEffect(() => {
    if (!abierto || id == null) { primeraVez.current = true; return; }
    if (centavos == null) { setPrevia(null); return; }

    let vivo = true;
    setCargando(true);
    // Al abrir no hay nada que esperar; después sí, porque cada tecla del monto
    // sería una consulta a la base y llegarían desordenadas.
    const espera = primeraVez.current ? 0 : 400;
    primeraVez.current = false;

    const t = setTimeout(() => {
      fetch(`/api/administracion-escolar/comprobantes/${id}?monto=${centavos / 100}`)
        .then(async (r) => {
          const d = await r.json();
          if (!vivo) return;
          if (!r.ok) { setError(d.error ?? 'No se pudo calcular el reparto'); setPrevia(null); return; }
          setError(null);
          setPrevia(d);
        })
        .catch(() => { if (vivo) { setError('No se pudo calcular el reparto'); setPrevia(null); } })
        .finally(() => { if (vivo) setCargando(false); });
    }, espera);

    return () => { vivo = false; clearTimeout(t); };
  }, [abierto, id, centavos]);

  const confirmar = useCallback(async () => {
    if (id == null || centavos == null) return;
    setEnviando(true); setError(null);
    try {
      const r = await fetch(`/api/administracion-escolar/comprobantes/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'aprobar',
          montoCentavos: centavos,
          fechaPago,
          metodo,
          referencia,
          cuentaBancoId: pideBanco && cuentaId ? Number(cuentaId) : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'No se pudo registrar el cobro'); return; }
      onAprobado({
        aplicadoCentavos: d.aplicadoCentavos ?? 0,
        sinAplicarCentavos: d.sinAplicarCentavos ?? 0,
        cargosSinFactura: d.cargosSinFactura ?? [],
      });
      onCerrar();
    } catch {
      setError('Error de red');
    } finally {
      setEnviando(false);
    }
  }, [id, centavos, fechaPago, metodo, referencia, pideBanco, cuentaId, onAprobado, onCerrar]);

  if (!comprobante) return null;

  const archivoUrl = `/api/administracion-escolar/comprobantes/${comprobante.id}/archivo`;
  const esImagen = comprobante.archivoMime.startsWith('image/');
  const diferencia = centavos == null ? 0 : centavos - comprobante.montoCentavos;
  const nadaQueAplicar = !previa || previa.aplicadoCentavos <= 0;

  // La lectura de la IA llega unos segundos después de subirse: si es reciente y
  // todavía no está, se dice que la está leyendo en vez de callar.
  const esperandoLectura = !comprobante.lectura
    && Date.now() - new Date(comprobante.creadoEn).getTime() < VENTANA_LECTURA_MS;
  const comparacion = compararMonto(lectura?.montoCentavos, centavos);
  const elegida = cuentas.find((c) => String(c.id) === cuentaId) ?? null;
  const bancoCoincide = bancoLeido && elegida ? mismoBanco(bancoLeido, elegida.banco) : null;
  const cuentaCasada = bancoLeido || finLeido
    ? casarCuentaBanco({ banco: bancoLeido, ultimos4: finLeido }, cuentas)
    : null;

  return (
    <Dialog open={abierto} onOpenChange={(o) => { if (!o && !enviando) onCerrar(); }}>
      <DialogContent className="max-w-4xl">
        <ModalHeader
          title="Aprobar y registrar cobro"
          subtitle={comprobante.responsable ?? undefined}
        />

        {comprobante.duplicado && (
          <div className="px-6 pt-3.5">
            <AvisoDuplicadoComprobante duplicado={comprobante.duplicado} onVer={onVerDuplicado} />
          </div>
        )}

        <div className="grid gap-4 px-6 py-3.5 md:grid-cols-2">
          {/* El papel del banco. Es la razón de ser de la pantalla: se compara
              contra los números de al lado sin tener que salir a otra pestaña.

              `min-w-0` en las dos columnas: sin él, el `truncate` del detalle
              de cada factura —que lleva `white-space: nowrap`— cuenta como
              ancho mínimo de la rejilla y estira el diálogo hasta el largo del
              texto más largo, que se sale del panel. */}
          <div className="min-w-0 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Lo que subió la familia
            </p>
            {esImagen ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={archivoUrl} alt="Comprobante de la transferencia"
                className="max-h-[46vh] w-full rounded-lg border border-gray-200 bg-gray-50 object-contain" />
            ) : (
              // Un PDF dentro de un diálogo se ve en un recuadro donde no se lee
              // nada: mejor mandarlo a la pestaña, que trae el visor entero.
              <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center">
                <p className="text-sm text-gray-600">{comprobante.archivoNombre ?? 'Comprobante en PDF'}</p>
                <a href={archivoUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-zero-600 hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir el PDF
                </a>
              </div>
            )}
            {esImagen && (
              <a href={archivoUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900">
                <ExternalLink className="h-3 w-3" /> Verla en grande
              </a>
            )}

            {/* Lo que la IA leyó de ese papel, justo debajo de él. Se copia a
                mano con «Usar»: la IA propone, quien revisa decide. */}
            {lectura ? (
              <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sky-800">
                    <Sparkles className="h-3.5 w-3.5" /> Leído por IA — revísalo
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    lectura.confianza >= 0.6 ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {lectura.confianza >= 0.6 ? 'Confianza' : 'Poco segura'} {Math.round(lectura.confianza * 100)} %
                  </span>
                </div>
                <dl className="space-y-1 text-sm">
                  <FilaLectura etiqueta="Banco que recibió" valor={lectura.bancoDestino
                    ? `${lectura.bancoDestino}${lectura.cuentaDestinoUltimos4 ? ` ····${lectura.cuentaDestinoUltimos4}` : ''}`
                    : null} />
                  <FilaLectura etiqueta="Monto" valor={lectura.montoCentavos != null ? fmtDOP(lectura.montoCentavos) : null}
                    onUsar={lectura.montoCentavos != null && lectura.montoCentavos !== centavos
                      ? () => setMonto((lectura.montoCentavos! / 100).toFixed(2)) : undefined} />
                  <FilaLectura etiqueta="Fecha" valor={lectura.fecha ? fmtFechaCorta(lectura.fecha) : null}
                    onUsar={lectura.fecha && lectura.fecha !== fechaPago ? () => setFechaPago(lectura.fecha!) : undefined} />
                  <FilaLectura etiqueta="Referencia" valor={lectura.referencia} mono
                    onUsar={lectura.referencia && lectura.referencia !== referencia ? () => setReferencia(lectura.referencia!) : undefined} />
                  {(lectura.ordenante || lectura.bancoOrigen) && (
                    <FilaLectura etiqueta="Lo envió"
                      valor={[lectura.ordenante, lectura.bancoOrigen].filter(Boolean).join(' · ')} />
                  )}
                </dl>
                {comparacion.estado === 'difiere' && centavos != null && (
                  <p className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <span>
                      El papel dice <b>{fmtDOP(lectura.montoCentavos!)}</b> y vas a registrar <b>{fmtDOP(centavos)}</b>
                      {' '}({comparacion.diferenciaCentavos > 0 ? 'faltan' : 'sobran'} {fmtDOP(Math.abs(comparacion.diferenciaCentavos))}).
                      Mira el papel antes de registrar.
                    </span>
                  </p>
                )}
              </div>
            ) : comprobante.lectura ? (
              <p className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                La IA no reconoce esta imagen como un comprobante de pago bancario. Mírala tú antes de seguir.
              </p>
            ) : esperandoLectura ? (
              <p className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs text-sky-800">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> La IA está leyendo el comprobante… se actualiza sola.
              </p>
            ) : null}
          </div>

          <div className="min-w-0 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Monto que entró al banco
              </label>
              <Input value={monto} inputMode="decimal" error={centavos == null}
                onChange={(e) => setMonto(e.target.value)} />
              {/* Que el monto corregido no cuadre con el declarado es lo normal,
                  no un fallo. Pero registrar una cifra distinta de la que el
                  padre verá en su pantalla tiene que ser una decisión mirada. */}
              {centavos == null ? (
                <p className="mt-1 text-xs text-red-600">Escribe cuánto entró, en pesos.</p>
              ) : diferencia !== 0 ? (
                <p className="mt-1 text-xs text-amber-700">
                  La familia declaró {fmtDOP(comprobante.montoCentavos)} ·
                  {' '}vas a registrar {fmtDOP(diferencia > 0 ? diferencia : -diferencia)}
                  {' '}{diferencia > 0 ? 'de más' : 'de menos'}.
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Fecha del pago</label>
                <Input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Método</label>
                <NativeSelect value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                  {METODOS_PAGO.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Referencia</label>
              <Input value={referencia} onChange={(e) => setReferencia(e.target.value)}
                placeholder="La del banco, si el papel trae otra" />
            </div>

            {/* A qué cuenta del colegio entró. Es lo que pidió el colegio: en la
                aprobación tiene que quedar dicho en cuál banco se depositó. */}
            {pideBanco && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Banco donde entró el dinero
                  {bancoObligatorio(metodo, cuentas.length) && <span className="text-red-500"> *</span>}
                </label>
                <NativeSelect value={cuentaId}
                  onChange={(e) => { bancoTocado.current = true; setCuentaId(e.target.value); }}>
                  <option value="">
                    {bancoObligatorio(metodo, cuentas.length) ? 'Elige el banco…' : 'Sin indicar'}
                  </option>
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>{c.etiqueta}</option>
                  ))}
                </NativeSelect>
                {bancoFalta ? (
                  <p className="mt-1 text-xs text-red-600">
                    Elige en qué banco entró: el colegio tiene {cuentas.length} cuentas
                    {bancoLeido && cuentaCasada == null && <> (la IA leyó «{bancoLeido}», pero no encaja con una sola)</>}.
                  </p>
                ) : bancoLeido && elegida && bancoCoincide ? (
                  <p className="mt-1 text-xs text-sky-700">
                    {cuentaCasada === elegida.id ? 'Coincide con' : 'Del mismo banco que'} lo que leyó la IA en el papel.
                  </p>
                ) : bancoLeido && elegida && !bancoCoincide ? (
                  <p className="mt-1 text-xs text-amber-700">
                    La IA leyó «{bancoLeido}» en el papel y elegiste otra cuenta. Confírmalo mirando el comprobante.
                  </p>
                ) : null}
              </div>
            )}

            {/* A dónde va cada peso, con el nombre que el colegio reconoce. */}
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                A qué facturas se aplica
              </p>

              {cargando ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : !previa ? (
                <p className="py-2 text-sm text-gray-500">—</p>
              ) : previa.destinos.length === 0 ? (
                <p className="py-2 text-sm text-gray-600">
                  Nada de este comprobante se puede aplicar ahora mismo.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {previa.destinos.map((d) => (
                    <li key={d.facturaId} className="flex justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-gray-800">{d.detalle || 'Factura'}</span>
                        <span className="block truncate font-mono text-[11px] text-gray-400">
                          {nombreFactura(d)}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums font-medium text-gray-900">
                        {fmtDOP(d.montoCentavos)}
                      </span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-3 border-t border-gray-200 pt-1.5 font-semibold text-gray-900">
                    <span>Total a registrar</span>
                    <span className="tabular-nums">{fmtDOP(previa.aplicadoCentavos)}</span>
                  </li>
                </ul>
              )}

              {/* Lo que sobra y POR QUÉ sobra. Callarlo haría creer que la deuda
                  bajó entera cuando una parte se quedó fuera. */}
              {previa && previa.sinAplicarCentavos > 0 && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-xs text-amber-900">
                    {fmtDOP(previa.sinAplicarCentavos)} quedan sin aplicar
                    {previa.cargosSinFactura.length > 0 ? (
                      <>
                        : <b>{previa.cargosSinFactura.join(', ')}</b> todavía no está facturado.
                        En este sistema el cobro entra contra una factura, así que hay que
                        facturar esos cargos antes de poder cobrarlos.
                      </>
                    ) : (
                      <> porque las facturas de estos cargos no deben tanto. Corrige el monto,
                        o registra la diferencia aparte como saldo a favor de la familia.</>
                    )}
                  </p>
                </div>
              )}
            </div>

            {previa && previa.estado !== 'pendiente' && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Este comprobante ya está {previa.estado}. Refresca la lista.
              </p>
            )}

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          {/* En pantalla estrecha se va: los dos botones son lo que no puede
              faltar, y la fecha ya está en su campo unos centímetros arriba. */}
          <span className="mr-auto hidden pl-1 text-xs text-gray-500 sm:inline">
            Se registra con fecha {fmtFechaCorta(fechaPago)}
          </span>
          <Button variant="outline" onClick={onCerrar} disabled={enviando}>Cancelar</Button>
          <Button onClick={confirmar} disabled={enviando || cargando || nadaQueAplicar || bancoFalta}>
            {enviando
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
            {/* La cifra en el botón para que lo último que se lea antes de
                pulsar sea lo que va a entrar. Sin nada que aplicar diría
                «Registrar RD$0.00», que suena a que va a hacer algo. */}
            Registrar {nadaQueAplicar ? 'cobro' : fmtDOP(previa!.aplicadoCentavos)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import useSWR from 'swr';
import {
  CheckCircle2, Loader2, Mail, MessageCircle, PiggyBank, Receipt, Smartphone, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  DIA_EMISION_MAX, ETIQUETA_FRECUENCIA, FRECUENCIAS, fechaDeEmision, sumarDias,
  type Frecuencia,
} from '@/lib/administracion-escolar/calendario';
import { CANALES_DEL_AVISO, type Aviso, type Canal } from '@/lib/administracion-escolar/ciclo-cobro';
import { CalendarioCuotas, type ApiCalendario } from './CalendarioCuotas';

/**
 * Configurar un concepto: qué es, cuándo sale la factura y cuándo se avisa.
 *
 * Está montado como pasos numerados con un ejemplo al lado que se recalcula
 * mientras se escribe. La razón es que aquí hay números —día de emisión, días
 * para vencer, dos plazos de aviso— que solo tienen sentido en relación unos
 * con otros: por separado nadie nota que ha pedido avisar tres días antes del
 * vencimiento en un concepto que vence el mismo día que se emite. El ejemplo
 * pone fechas concretas de un mes cualquiera y ahí el error se ve.
 *
 * Todo cuelga de la EMISIÓN. El colegio no decide cuándo vence: decide qué día
 * sale la factura, y el vencimiento es una consecuencia del plazo que dé.
 */

export interface Concepto {
  id: number;
  nombre: string;
  tipo: string;
  frecuencia: Frecuencia;
  activo: boolean;
  admiteBeca: boolean;
  cobraMora: boolean;
  diaEmision: number | null;
  diasParaPago: number | null;
  avisosActivos: boolean;
  avisoDiaEmision: boolean;
  avisoDiaVencimiento: boolean;
  avisoAntesMoraDias: number | null;
  /** Días entre vencer y que entre el recargo. 0 = el mismo día. */
  moraDiasGracia: number;
  avisoCorreo: boolean;
  avisoWhatsapp: boolean;
  avisoSms: boolean;
  descuentoAdelantoPct: number | null;
  /** Posición en la lista. La manda el colegio con las flechas, no el alfabeto. */
  orden: number;
}

/** Lo que devuelve `GET /api/whatsapp/estado`: número ya enmascarado. */
interface EstadoWhatsApp {
  configurado: boolean;
  conectado: boolean;
  numeroWhatsapp: string | null;
}

/**
 * Lo que devuelve `GET /api/sms/estado`.
 *
 * El SMS no se enlaza como WhatsApp: la cuenta de SNS es una sola, de la
 * plataforma. Que el canal esté disponible no se decide aquí ni por colegio —
 * depende de que las credenciales estén puestas—; lo que sí se decide aquí es
 * si ESTE concepto lo usa, con `avisoSms`.
 */
interface EstadoSms {
  habilitado: boolean;
  /** `null` cuando sí se puede mandar; ausente si la ruta todavía no existe. */
  motivo?: 'sin-credenciales' | null;
}

// Sin conexión configurada el endpoint responde 200 con `conectado:false`; un
// fallo de red se trata igual, para no ofrecer un canal que no se sabe si va.
const traerEstado = (u: string): Promise<EstadoWhatsApp> =>
  fetch(u).then((r) => (r.ok ? r.json() : { configurado: false, conectado: false, numeroWhatsapp: null }));

// El SMS se habilita en la configuración del colegio. Mientras la ruta no
// exista, el 404 cae aquí y el canal queda apagado en vez de romper la
// pantalla: es preferible no ofrecerlo a ofrecer un envío que no sale.
const traerSms = (u: string): Promise<EstadoSms> =>
  fetch(u).then((r) => (r.ok ? r.json() : { habilitado: false })).catch(() => ({ habilitado: false }));

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** El mes del ejemplo. Fijo a propósito: ver abajo. */
const EJEMPLO_ANIO = 2026;
const EJEMPLO_MES = 9;

/**
 * Una fecha del ejemplo, contada en días desde la emisión de septiembre.
 *
 * Se usa un mes fijo y no la fecha de hoy porque el ejemplo tiene que ser el
 * mismo cada vez que se abre la pantalla: si cambiara con el día, dos personas
 * mirando la misma configuración verían cosas distintas. Septiembre además
 * tiene 30 días, así que enseña el recorte del día 31 sin casos raros.
 */
function fechaEjemplo(diasDesdeEmision: number, diaEmision: number): string {
  const emision = fechaDeEmision(EJEMPLO_ANIO, EJEMPLO_MES, diaEmision);
  const [a, m, d] = sumarDias(emision, diasDesdeEmision).split('-').map(Number);
  return `${d} de ${MESES[m - 1]}${a !== EJEMPLO_ANIO ? ` de ${a}` : ''}`;
}

const ICONO_CANAL: Record<Canal, typeof Mail> = {
  correo: Mail, whatsapp: MessageCircle, sms: Smartphone,
};
const NOMBRE_CANAL: Record<Canal, string> = {
  correo: 'correo', whatsapp: 'WhatsApp', sms: 'SMS',
};

/**
 * Por dónde sale un aviso. El ruteo no se elige: se enseña.
 *
 * Los canales apagados se pintan igual, en gris: quien busca por qué no le
 * llega el SMS al padre tiene que poder ver que ese aviso sí sale por SMS y
 * que lo que falta es encender el canal, no cambiar el aviso.
 */
function Canales({ aviso, activos }: { aviso: Aviso; activos: Record<Canal, boolean> }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {CANALES_DEL_AVISO[aviso].map((c) => {
        const Icono = ICONO_CANAL[c];
        return (
          <Icono key={c} aria-label={NOMBRE_CANAL[c]}
            className={`h-3.5 w-3.5 ${activos[c] ? 'text-zero-600' : 'text-gray-300'}`} />
        );
      })}
    </span>
  );
}

/** Una fila del ejemplo: un hito con su fecha y su explicación. */
function Hito({ dia, titulo, detalle, tono = 'normal' }: {
  dia: string; titulo: string; detalle: string;
  tono?: 'normal' | 'aviso' | 'mora';
}) {
  const color = tono === 'mora' ? 'text-red-700' : tono === 'aviso' ? 'text-amber-700' : 'text-zero-800';
  const punto = tono === 'mora' ? 'bg-red-500' : tono === 'aviso' ? 'bg-amber-500' : 'bg-zero-500';
  return (
    <div className="relative flex gap-3 pb-3 last:pb-0">
      <span className="relative flex w-3 shrink-0 justify-center">
        <span className={`mt-1.5 h-2 w-2 rounded-full ${punto}`} />
        <span className="absolute top-3.5 h-full w-px bg-gray-200 last:hidden" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-xs font-medium ${color}`}>{dia}</span>
        <span className="block text-sm text-gray-900">{titulo}</span>
        <span className="block text-xs text-gray-500">{detalle}</span>
      </span>
    </div>
  );
}

/** El interruptor de encender/apagar, que ya se repite varias veces. */
function Interruptor({ activo, onCambiar, etiqueta, disabled }: {
  activo: boolean; onCambiar: (v: boolean) => void; etiqueta: string; disabled?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta}
      disabled={disabled} onClick={() => onCambiar(!activo)}
      className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
        disabled ? 'cursor-not-allowed bg-gray-200' : activo ? 'bg-zero-600' : 'bg-gray-300'
      }`}>
      <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
        activo ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  );
}

/**
 * Una fila de aviso: casilla, explicación, canales y, si lleva, los días.
 *
 * `disponible` en falso la deja visible pero apagada con el motivo escrito, en
 * vez de esconderla: si desapareciera, quien busca "el aviso de que se vence"
 * creería que no existe.
 */
function FilaAviso({
  activo, onCambiar, titulo, detalle, aviso, canales,
  dias, onDias, sufijo, disponible = true,
}: {
  activo: boolean; onCambiar: (v: boolean) => void;
  titulo: string; detalle: string;
  aviso: Aviso; canales: Record<Canal, boolean>;
  dias?: number | null; onDias?: (n: number) => void; sufijo?: string;
  disponible?: boolean;
}) {
  return (
    <label className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 ${disponible ? '' : 'opacity-50'}`}>
      <input type="checkbox" className="h-4 w-4 shrink-0 accent-zero-600"
        disabled={!disponible} checked={activo}
        onChange={(e) => onCambiar(e.target.checked)} />
      <span className="min-w-[10rem] flex-1 text-sm text-gray-900">
        {titulo}
        <span className="block text-xs text-gray-500">{detalle}</span>
      </span>
      <Canales aviso={aviso} activos={canales} />
      {activo && disponible && dias != null && onDias && (
        <span className="flex shrink-0 items-center gap-1.5">
          <Input type="number" min={0} max={60} className="h-8 w-16" value={dias}
            onChange={(e) => onDias(Number(e.target.value) || 0)} />
          <span className="text-xs text-gray-500">{sufijo ?? 'días antes'}</span>
        </span>
      )}
    </label>
  );
}

/** Encabezado de paso: el número y el título. */
function Paso({ n, titulo, extra }: { n: number; titulo: string; extra?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zero-100 text-xs font-semibold text-zero-700">
        {n}
      </span>
      <span className="text-sm font-semibold text-gray-900">{titulo}</span>
      {extra}
    </div>
  );
}

export function ConceptoDetalle({
  borrador, setBorrador, guardando, error, onGuardar, onBorrar, calendario,
}: {
  borrador: Concepto;
  setBorrador: (f: (b: Concepto | null) => Concepto | null) => void;
  guardando: boolean;
  error: string | null;
  onGuardar: () => void;
  onBorrar: () => void;
  /**
   * Buzón del calendario. Lo crea el catálogo, que es quien guarda, para poder
   * mandarle el PUT de las cuotas dentro del mismo «Guardar cambios».
   */
  calendario: React.MutableRefObject<ApiCalendario | null>;
}) {
  const editar = <K extends keyof Concepto>(campo: K, valor: Concepto[K]) =>
    setBorrador((b) => (b ? { ...b, [campo]: valor } : b));

  // Estado de los canales que dependen de una cuenta enlazada. Solo hace falta
  // saber si se pueden ofrecer, no reconciliar nada.
  const { data: whatsapp } = useSWR<EstadoWhatsApp>('/api/whatsapp/estado', traerEstado);
  const { data: sms } = useSWR<EstadoSms>('/api/sms/estado', traerSms);
  const whatsappListo = whatsapp?.conectado === true;
  const smsListo = sms?.habilitado === true;

  const periodico = borrador.frecuencia !== 'unico';
  const diaEmision = borrador.diaEmision ?? 1;
  /**
   * Numeración de los pasos, contada y no escrita a mano.
   *
   * Sin recurrencia se caen dos pasos —el calendario y el descuento por
   * adelantar—, y con los números fijos el asistente saltaba del 1 al 3: quien
   * lo mira busca el 2 que no está y cree que se le olvidó algo.
   */
  const paso = (() => {
    let n = 1;                                   // 1 · Qué es y cada cuánto
    const calendario     = periodico ? ++n : 0;
    const vence          = ++n;
    const descuento      = periodico ? ++n : 0;
    const recordatorios  = ++n;
    return { calendario, vence, descuento, recordatorios };
  })();
  /**
   * Cómo se nombra un hito en el panel de la derecha.
   *
   * Con frecuencia periódica se enseña un septiembre de ejemplo, que es lo que
   * hace entendible "el día 5 de cada mes". En un pago único no hay mes que
   * poner: la fecha la fija el calendario de arriba, y estampar "6 de
   * septiembre" haría creer que se cobra en septiembre. Ahí se cuenta respecto
   * a la factura, que es lo único cierto sin mirar el calendario.
   */
  const rotuloDia = (d: number): string => {
    if (periodico) return fechaEjemplo(d, diaEmision);
    if (d === 0) return 'El día de la factura';
    return d < 0 ? `${-d} día(s) antes` : `${d} día(s) después`;
  };
  // `diasParaPago` en nulo es "no vence": el interruptor lo pone y lo quita.
  const tieneVencimiento = borrador.diasParaPago != null;
  const vence = borrador.diasParaPago ?? 0;
  // El vencimiento solo es un momento aparte si cae después de emitir; con
  // cero días son el mismo día y avisar "antes de vencer" no cabe.
  const venceDespues = tieneVencimiento && vence > 0;
  // Días entre vencer y que entre el recargo, y el día (contado desde la
  // emisión) en que eso pasa. Sin recargo no hay fecha de mora que dibujar.
  const gracia = borrador.moraDiasGracia ?? 0;
  const diaMora = vence + gracia;
  const hayMora = borrador.cobraMora && tieneVencimiento;
  const avisoMora = borrador.avisoAntesMoraDias;
  /**
   * El aviso «antes del recargo» solo cabe si hay días de gracia.
   *
   * Con gracia 0 el recargo entra el mismo día del vencimiento, así que el
   * único hueco sería antes de vencer — y ahí ya está el aviso del
   * vencimiento. Pedirlo con más días que la gracia lo pondría antes de que la
   * factura venciera siquiera.
   */
  const avisoMoraCabe = hayMora && gracia > 0;
  const avisoMoraImposible = avisoMora != null && avisoMora > gracia;

  const canales: Record<Canal, boolean> = {
    correo:   borrador.avisoCorreo,
    whatsapp: whatsappListo && borrador.avisoWhatsapp,
    sms:      smsListo && borrador.avisoSms,
  };
  const algunCanal = canales.correo || canales.whatsapp || canales.sms;

  /**
   * Los días en que sale algún aviso, para detectar los que se pisan.
   *
   * Dos mensajes el mismo día al mismo tutor es el fallo más fácil de cometer
   * aquí —"el día que se emite" y "N días antes de vencer" caen juntos en
   * cuanto el plazo y el aviso coinciden— y el más difícil de ver mirando los
   * campos por separado.
   */
  const diasConAviso = borrador.avisosActivos ? [
    borrador.avisoDiaEmision ? 0 : null,
    borrador.avisoDiaVencimiento && tieneVencimiento ? vence : null,
    avisoMoraCabe && avisoMora != null && !avisoMoraImposible ? diaMora - avisoMora : null,
  ].filter((d): d is number => d != null) : [];
  const diaRepetido = diasConAviso.find((d, i) => diasConAviso.indexOf(d) !== i);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
      <div className="space-y-0 rounded-lg border border-gray-200 bg-white">

        {/* ── 1. Qué es y cada cuánto ───────────────────────────────────── */}
        <div className="border-b border-gray-100 p-4">
          <Paso n={1} titulo="¿Qué es y cada cuánto se cobra?" />
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label>Nombre</Label>
              <Input value={borrador.nombre} onChange={(e) => editar('nombre', e.target.value)} />
            </div>
            <Button variant="ghost" size="sm" aria-label="Eliminar concepto" onClick={onBorrar}
              className="mt-6 h-9 w-9 shrink-0 p-0 text-gray-400 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* La recurrencia es un sí/no antes de un cada-cuánto, y no una
              opción más de la lista, porque son dos preguntas distintas: si el
              cobro se repite, y con qué ritmo. Metidas en un solo desplegable,
              "una sola vez" quedaba de hermana de "cada mes" y arrastraba
              consigo un calendario y un día de emisión que no significan nada
              para un cobro que ocurre una vez. */}
          <div className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <Interruptor activo={periodico} etiqueta="Se cobra varias veces al año"
                onCambiar={(v) => setBorrador((b) => b && ({
                  ...b,
                  frecuencia: v ? 'mensual' : 'unico',
                  tipo: v ? 'mensualidad' : (b.tipo === 'mensualidad' ? 'otro' : b.tipo),
                  // La beca escolar rebaja lo que se paga a lo largo del año;
                  // la inscripción y los materiales se cobran completos. Se
                  // deriva en vez de preguntarse: era una casilla que nadie
                  // entendía.
                  admiteBeca: v,
                  // Un cobro de una sola vez no tiene nada que adelantar.
                  descuentoAdelantoPct: v ? b.descuentoAdelantoPct : null,
                }))} />
              <span className="min-w-[10rem] flex-1 text-sm">
                <span className="block text-gray-900">Se cobra varias veces al año</span>
                <span className="block text-xs text-gray-500">
                  {periodico
                    ? 'Se reparte en cuotas con fecha, y de ahí sale el calendario.'
                    : 'Se cobra entero el día que se matricule el alumno. Sin cuotas ni fechas.'}
                </span>
              </span>
            </div>

            {periodico && (
              <div className="grid gap-3 px-3 py-2.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Cada cuánto se cobra</Label>
                  <NativeSelect value={borrador.frecuencia}
                    onChange={(e) => editar('frecuencia', e.target.value as Frecuencia)}>
                    {/* Sin 'unico': eso ya lo decide el interruptor de arriba. */}
                    {FRECUENCIAS.filter((f) => f !== 'unico').map((f) => (
                      <option key={f} value={f}>{ETIQUETA_FRECUENCIA[f]}</option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="space-y-1.5">
                  <Label>Se factura el día</Label>
                  <NativeSelect value={String(diaEmision)}
                    onChange={(e) => editar('diaEmision', Number(e.target.value))}>
                    {Array.from({ length: DIA_EMISION_MAX }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>{d} de cada mes</option>
                    ))}
                  </NativeSelect>
                  {/* El 31 no está en la lista: medio calendario no lo tiene. */}
                  {diaEmision > 28 && (
                    <p className="text-xs text-gray-500">
                      En febrero se emite el 28 (o el 29 en año bisiesto).
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 2. El calendario que genera ───────────────────────────────────
            Solo si se repite. Un cobro de una sola vez no tiene calendario que
            enseñar: su fecha es el día que el alumno se matricula, y no se
            sabe aquí. */}
        {periodico && (
          <div className="border-b border-gray-100 p-4">
            <Paso n={paso.calendario} titulo="El calendario que genera" />
            <CalendarioCuotas conceptoId={borrador.id} nombre={borrador.nombre}
              frecuencia={borrador.frecuencia} api={calendario}
              diaEmision={diaEmision} diasParaPago={borrador.diasParaPago} />
          </div>
        )}

        {/* ── 3. Cuándo vence ───────────────────────────────────────────── */}
        <div className="border-b border-gray-100 p-4">
          <Paso n={paso.vence} titulo="¿Cuándo vence?" />

          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <Interruptor activo={tieneVencimiento} etiqueta="Tiene fecha de vencimiento"
                onCambiar={(v) => setBorrador((b) => b && ({
                  ...b,
                  diasParaPago: v ? 5 : null,
                  // Sin fecha de vencimiento no hay desde cuándo contar el
                  // atraso, así que la mora y su aviso se apagan con ella.
                  ...(v ? {} : { cobraMora: false, avisoAntesVencerDias: null }),
                }))} />
              <span className="min-w-[10rem] flex-1 text-sm">
                <span className="block text-gray-900">Tiene fecha de vencimiento</span>
                <span className="block text-xs text-gray-500">
                  {tieneVencimiento
                    ? 'Se cuentan desde el día en que sale la factura.'
                    : 'Se puede pagar cuando sea; nunca aparece como vencido.'}
                </span>
              </span>
              {tieneVencimiento && (
                <span className="flex shrink-0 items-center gap-1.5">
                  <Input type="number" min={0} max={90} className="h-8 w-16"
                    value={borrador.diasParaPago ?? 0}
                    onChange={(e) => editar('diasParaPago', Number(e.target.value) || 0)} />
                  <span className="text-xs text-gray-500">días después</span>
                </span>
              )}
            </div>

            {/* Los días de gracia se cuentan DESDE EL VENCIMIENTO, no desde la
                emisión. Es la distinción que antes se leía mal: con 5 días para
                pagar y 3 de gracia, el padre tiene 8 días en total, y la
                pantalla tiene que decirlo así o alguien configura 5 creyendo
                que da 5 y está dando 8. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <Interruptor activo={borrador.cobraMora} etiqueta="Cobrar recargo por mora"
                disabled={!tieneVencimiento}
                onCambiar={(v) => setBorrador((b) => b && ({
                  ...b,
                  cobraMora: v,
                  // Sin recargo no hay fecha de mora, y sin fecha de mora ese
                  // aviso no cuelga de nada.
                  ...(v ? {} : { avisoAntesMoraDias: null }),
                }))} />
              <span className={`min-w-[10rem] flex-1 text-sm ${tieneVencimiento ? '' : 'opacity-50'}`}>
                <span className="block text-gray-900">Cobrar recargo por mora</span>
                <span className="block text-xs text-gray-500">
                  {!tieneVencimiento
                    ? 'Hace falta una fecha de vencimiento para saber desde cuándo se atrasa.'
                    : !borrador.cobraMora
                      ? 'No se le cobra nada de más aunque se atrase.'
                      : gracia === 0
                        ? 'Entra el mismo día del vencimiento, sin margen.'
                        : `Entra ${gracia} día(s) después de vencer: en total tiene ${diaMora} día(s) desde que sale la factura.`}
                </span>
              </span>
              {hayMora && (
                <span className="flex shrink-0 items-center gap-2">
                  <Input type="number" min={0} max={60} className="h-8 w-20"
                    value={gracia}
                    onChange={(e) => {
                      const n = Math.max(0, Math.min(60, Number(e.target.value) || 0));
                      setBorrador((b) => b && ({
                        ...b,
                        moraDiasGracia: n,
                        // Un aviso que ya no cabe en la gracia nueva se apaga en
                        // vez de quedarse guardado apuntando a una fecha que no
                        // existe: reaparecería solo al volver a subir los días.
                        ...(b.avisoAntesMoraDias != null && b.avisoAntesMoraDias > n
                          ? { avisoAntesMoraDias: n > 0 ? n : null }
                          : {}),
                      }));
                    }} />
                  <span className="whitespace-nowrap text-xs text-gray-500">días<br />después</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── 4. Descuento por adelantar ────────────────────────────────── */}
        {/* No existe en el pago único: no hay nada que adelantar. */}
        {periodico && (
          <div className="border-b border-gray-100 p-4">
            <Paso n={paso.descuento} titulo="Descuento por pago adelantado" />
            <div className="rounded-lg border border-gray-200">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                <Interruptor activo={borrador.descuentoAdelantoPct != null}
                  etiqueta="Descuento por pago adelantado"
                  onCambiar={(v) => editar('descuentoAdelantoPct', v ? 5 : null)} />
                <span className="min-w-[10rem] flex-1 text-sm">
                  <span className="flex items-center gap-1.5 text-gray-900">
                    <PiggyBank className="h-3.5 w-3.5 text-gray-400" />
                    Rebajar si salda todo de una vez
                  </span>
                  <span className="block text-xs text-gray-500">
                    {borrador.descuentoAdelantoPct != null
                      ? 'Solo si paga TODO lo que le queda pendiente. No hay mínimo de cuotas.'
                      : 'El que quiera adelantar paga lo mismo que el que va al día.'}
                  </span>
                </span>
                {borrador.descuentoAdelantoPct != null && (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Input type="number" min={1} max={100} className="h-8 w-16"
                      value={borrador.descuentoAdelantoPct}
                      onChange={(e) => editar('descuentoAdelantoPct',
                        Math.min(100, Math.max(1, Number(e.target.value) || 1)))} />
                    <span className="text-xs text-gray-500">%</span>
                  </span>
                )}
              </div>
            </div>
            {borrador.descuentoAdelantoPct != null && (
              <p className="mt-2 text-xs text-gray-500">
                Se registra como línea propia del estado de cuenta, no rebajando cada cuota: así se ve
                cuánto se le perdonó, sale en el recibo, y si el pago se reversa el descuento se va con él.
              </p>
            )}
          </div>
        )}

        {/* ── 5. Recordatorios ──────────────────────────────────────────── */}
        <div className="p-4">
          <Paso n={paso.recordatorios} titulo="Recordatorios automáticos"
            extra={
              <span className="ml-auto">
                <Interruptor activo={borrador.avisosActivos} etiqueta="Activar recordatorios automáticos"
                  onCambiar={(v) => editar('avisosActivos', v)} />
              </span>
            } />

          {!borrador.avisosActivos ? (
            <p className="text-sm text-gray-500">
              Apagado. Nadie recibe avisos de este concepto; hay que cobrarlo llamando o escribiendo a mano.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Le llegan al tutor marcado como responsable de pago.
              </p>

              {/* En el orden en que le pasan al padre, y los tres colgados de
                  la FACTURA: el día que sale, unos días antes de que le entre
                  el recargo, y el día que le entra. */}
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                <FilaAviso
                  aviso="al-emitir" canales={canales}
                  activo={borrador.avisoDiaEmision}
                  onCambiar={(v) => editar('avisoDiaEmision', v)}
                  titulo="El día que se le genera la factura"
                  detalle="«Ya tienes tu factura, este es el monto y hasta cuándo pagar»." />

                {/* Habla en pasado: decir "está por vencer" el día en que ya
                    venció hace creer al padre que todavía llega a tiempo. */}
                <FilaAviso
                  aviso="al-vencer" canales={canales}
                  activo={borrador.avisoDiaVencimiento}
                  onCambiar={(v) => editar('avisoDiaVencimiento', v)}
                  titulo="El día que se le vence la factura"
                  detalle={!tieneVencimiento
                    ? 'Este concepto no vence, así que no hay día que avisar.'
                    : hayMora && gracia > 0
                      ? `«Hoy venció tu factura, tienes ${gracia} día(s) antes del recargo».`
                      : hayMora
                        ? '«Hoy venció tu factura y ya se le aplicó el recargo».'
                        : '«Hoy venció tu factura». Para que sepa que está atrasado.'}
                  disponible={tieneVencimiento} />

                {/* Cuelga de la fecha del RECARGO, no de la del vencimiento: si
                    colgara del vencimiento, cambiar los días de gracia movería
                    el aviso sin que nadie lo hubiera pedido. */}
                <FilaAviso
                  aviso="antes-mora" canales={canales}
                  activo={avisoMora != null}
                  onCambiar={(v) => editar('avisoAntesMoraDias', v ? Math.min(1, gracia) : null)}
                  titulo="Antes de que le entre el recargo"
                  detalle={!hayMora
                    ? 'Este concepto no cobra recargo, así que no hay mora de la que avisar.'
                    : gracia === 0
                      ? 'El recargo entra el mismo día que vence, así que no hay hueco entre una cosa y otra. Dale días de margen arriba.'
                      : '«Paga antes del día X para no pagar recargo». Es el que más hace pagar.'}
                  disponible={avisoMoraCabe}
                  dias={avisoMora}
                  onDias={(n) => editar('avisoAntesMoraDias', n)} />
              </div>

              {diaRepetido != null && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {periodico
                    ? `El ${fechaEjemplo(diaRepetido, diaEmision)} le salen dos avisos al mismo tutor.`
                    : 'Hay dos avisos que le caen el mismo día al mismo tutor.'}
                  {' '}Mira la línea de la derecha y quita uno, o cámbiale los días.
                </p>
              )}

              {avisoMoraImposible && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Avisar {avisoMora} días antes del recargo cae antes de que la factura venza siquiera,
                  porque solo hay {gracia} día(s) de gracia. Baja el aviso o sube los días de margen.
                </p>
              )}

              {/* El ruteo por canal es fijo y no se elige. Explicarlo aquí
                  evita la pregunta de por qué el SMS no sale en los tres. */}
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5">
                  <input type="checkbox" className="h-4 w-4 accent-zero-600" checked={borrador.avisoCorreo}
                    onChange={(e) => editar('avisoCorreo', e.target.checked)} />
                  <Mail className="h-4 w-4 text-gray-400" />
                  <span className="min-w-0 flex-1 text-sm text-gray-900">
                    Enviar por correo
                    <span className="block text-xs text-gray-500">Sale en los tres avisos.</span>
                  </span>
                </label>

                {/* WhatsApp solo se deja encender con la cuenta enlazada: un
                    interruptor que se marca y luego no manda nada es peor que
                    no tenerlo. */}
                <label className={`flex items-center gap-2.5 px-3 py-2.5 ${
                  whatsappListo ? 'cursor-pointer' : 'opacity-60'}`}>
                  <input type="checkbox" className="h-4 w-4 accent-zero-600"
                    disabled={!whatsappListo}
                    checked={whatsappListo && borrador.avisoWhatsapp}
                    onChange={(e) => editar('avisoWhatsapp', e.target.checked)} />
                  <MessageCircle className="h-4 w-4 text-gray-400" />
                  <span className="min-w-0 flex-1 text-sm text-gray-900">
                    Enviar por WhatsApp
                    <span className="block text-xs text-gray-500">
                      {whatsappListo
                        ? `Solo los dos primeros avisos${whatsapp?.numeroWhatsapp ? ` · ${whatsapp.numeroWhatsapp}` : ''}`
                        : (
                          <>
                            Falta conectar la cuenta en{' '}
                            <a href="/escolar/configuracion" className="underline hover:text-zero-600">
                              Configuración escolar › Avisos
                            </a>.
                          </>
                        )}
                    </span>
                  </span>
                </label>

                <label className={`flex items-center gap-2.5 px-3 py-2.5 ${
                  smsListo ? 'cursor-pointer' : 'opacity-60'}`}>
                  <input type="checkbox" className="h-4 w-4 accent-zero-600"
                    disabled={!smsListo}
                    checked={smsListo && borrador.avisoSms}
                    onChange={(e) => editar('avisoSms', e.target.checked)} />
                  <Smartphone className="h-4 w-4 text-gray-400" />
                  <span className="min-w-0 flex-1 text-sm text-gray-900">
                    Enviar por SMS
                    {/* Sin link, a diferencia de WhatsApp: aquí no hay nada
                        que la secretaria pueda pulsar. El SMS lo autoriza la
                        plataforma por colegio, así que mandarla a Avisos sería
                        mandarla a leer el mismo estado otra vez. */}
                    <span className="block text-xs text-gray-500">
                      {smsListo
                          ? 'Falta autorizar a este colegio para enviar SMS. Lo habilita Zero, no se activa desde aquí.'
                          : 'Todavía no está disponible. Lo habilita Zero, no se activa desde aquí.'}
                    </span>
                  </span>
                </label>
              </div>

              <p className="text-xs text-gray-500">
                Por qué no se elige el canal de cada aviso: WhatsApp solo deja escribir dentro de las 24 horas
                siguientes a la última respuesta del tutor, así que el aviso del que depende que no pague
                recargo no puede salir por ahí. El SMS llega siempre pero se cobra por mensaje, y se reserva
                justo para ese.
              </p>

              {!algunCanal && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Los recordatorios están encendidos pero no hay ningún canal activo, así que no saldrá nada.
                </p>
              )}

              {/* Si se desconectó la cuenta después de dejarlo marcado, el
                  concepto sigue diciendo que manda por WhatsApp y no manda. */}
              {borrador.avisoWhatsapp && !whatsappListo && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Este concepto tiene WhatsApp encendido, pero la cuenta no está conectada. No saldrá por ahí
                  hasta enlazarla en Configuración escolar › Avisos.
                </p>
              )}

              {avisoMora != null && avisoMoraCabe && !borrador.avisoCorreo && !canales.sms && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  El aviso de antes del recargo solo sale por correo o SMS, y no hay ninguno de los dos
                  encendido. Es justo el que le ahorra el recargo al padre.
                </p>
              )}
            </div>
          )}
        </div>

        {error && (
          <p className="mx-4 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end border-t border-gray-100 p-3">
          <Button className="bg-zero-600 hover:bg-zero-700" onClick={onGuardar} disabled={guardando}>
            {guardando ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Guardando…</> : 'Guardar cambios'}
          </Button>
        </div>
      </div>

      {/* ── 6. La línea de tiempo ─────────────────────────────────────────
          Va al lado y no debajo a propósito: es el paso que revisa a los otros
          cinco, y tiene que estar a la vista mientras se escriben.

          Y se queda pegada al hacer scroll: con el calendario de once cuotas
          abierto, los avisos quedan tan abajo que el ejemplo se salía de la
          pantalla justo cuando se estaban tocando los días que lo cambian.

          `self-start` es lo que lo hace posible: un hijo de grid se estira a lo
          alto de la fila por defecto, y un elemento tan alto como su contenedor
          nunca tiene de dónde despegarse. Solo desde `xl`, que es donde hay dos
          columnas — apilado debajo, pegarlo no ayuda a nadie.

          El `max-h` con scroll propio es el seguro para el ejemplo largo: si
          los hitos no caben, se desplazan dentro en vez de cortarse. */}
      <div className="h-fit rounded-lg border border-zero-200 bg-zero-50/50 p-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-7rem)] xl:self-start xl:overflow-y-auto">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-zero-900">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zero-100 text-xs font-semibold text-zero-700">
            {paso.recordatorios + 1}
          </span>
          <Receipt className="h-4 w-4" />Así le llega al padre
        </p>

        <div className="mb-3 rounded-lg border border-zero-200 bg-white px-3 py-2 text-xs">
          <p className="font-medium text-gray-900">{borrador.nombre || 'Este concepto'}</p>
          <p className="text-gray-500">
            {/* El ejemplo se ancla en septiembre solo cuando hay meses que
                recorrer; en un pago único la fecha la fija el calendario y
                nombrar un mes cualquiera hace pensar que se cobra en ése. */}
            {ETIQUETA_FRECUENCIA[borrador.frecuencia]}
            {periodico ? ' · ejemplo de septiembre' : ' · días relativos a la factura'}
          </p>
        </div>

        {/* Los hitos se ordenan por la fecha en que ocurren, no por el orden en
            que están escritos: el aviso del plazo puede caer antes o después
            del vencimiento según los días, y verlo fuera de sitio hace ilegible
            justamente lo que este panel viene a explicar. */}
        <div className="space-y-0">
          {(() => {
            const hitos: { d: number; tono?: 'aviso' | 'mora'; titulo: string; detalle: string }[] = [];
            const av = borrador.avisosActivos;

            hitos.push({
              d: 0,
              titulo: 'Se le genera la factura',
              detalle: periodico
                ? `El día ${diaEmision} del mes que toque.`
                : 'En la fecha que diga el calendario.',
            });

            if (av && borrador.avisoDiaEmision) hitos.push({
              d: 0, tono: 'aviso',
              titulo: 'Aviso: ya tienes tu factura',
              detalle: 'Con el monto y hasta cuándo puede pagar.',
            });

            if (venceDespues) hitos.push({
              d: vence, titulo: 'Vence',
              detalle: `${vence} día(s) después de la factura.`,
            });

            if (av && borrador.avisoDiaVencimiento && tieneVencimiento) hitos.push({
              d: vence, tono: 'aviso',
              titulo: 'Aviso: hoy venció tu factura',
              detalle: hayMora && gracia > 0
                ? `Con ${gracia} día(s) todavía antes del recargo.`
                : 'El mismo día del vencimiento.',
            });

            if (av && avisoMoraCabe && avisoMora != null && !avisoMoraImposible) hitos.push({
              d: diaMora - avisoMora, tono: 'aviso',
              titulo: 'Aviso: paga para evitar el recargo',
              detalle: `${avisoMora} día(s) antes de la mora.`,
            });

            if (hayMora) hitos.push({
              d: diaMora, tono: 'mora',
              titulo: 'Se le aplica el recargo',
              detalle: gracia === 0
                ? 'El mismo día que vence, sin margen.'
                : `${gracia} día(s) después de vencer.`,
            });

            // Estable: a igualdad de día se conserva el orden de arriba, que ya
            // es el natural (primero ocurre el hecho, después el aviso de él).
            return hitos
              .map((h, i) => ({ ...h, i }))
              .sort((a, b) => (a.d - b.d) || (a.i - b.i))
              .map((h) => (
                <Hito key={`${h.d}-${h.i}`} tono={h.tono} dia={rotuloDia(h.d)}
                  titulo={h.titulo} detalle={h.detalle} />
              ));
          })()}

          {!tieneVencimiento && (
            <Hito titulo="Sin fecha límite" dia="Cuando pueda"
              detalle="El cargo queda pendiente hasta que se pague." />
          )}
        </div>

        <div className="mt-3 border-t border-zero-200 pt-3">
          <p className="flex items-start gap-2 text-xs text-gray-600">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zero-600" />
            <span>
              {borrador.avisosActivos
                ? (() => {
                    const puestos = [
                      borrador.avisoDiaEmision && 'al generarla',
                      borrador.avisoDiaVencimiento && tieneVencimiento && 'al vencer',
                      avisoMoraCabe && avisoMora != null && !avisoMoraImposible && 'antes del recargo',
                    ].filter(Boolean) as string[];
                    return `${puestos.length} aviso(s): ${puestos.join(', ') || 'ninguno elegido'}.`;
                  })()
                : 'Sin recordatorios: hay que cobrar a mano.'}
            </span>
          </p>
          {periodico && borrador.descuentoAdelantoPct != null && (
            <p className="mt-2 flex items-start gap-2 text-xs text-gray-600">
              <PiggyBank className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zero-600" />
              <span>{borrador.descuentoAdelantoPct}% de rebaja si salda de una vez todo lo pendiente.</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

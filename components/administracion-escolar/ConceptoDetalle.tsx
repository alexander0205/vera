'use client';

import { Bell, CalendarClock, CheckCircle2, Loader2, Mail, MessageCircle, Receipt, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';

/**
 * Configurar un concepto: qué es, cuándo se cobra y cuándo se avisa.
 *
 * Está montado como pasos numerados con un ejemplo al lado que se recalcula
 * mientras se escribe. La razón es que aquí hay cinco números —día de cobro,
 * días para vencer, gracia de la mora, aviso previo, aviso antes de la mora—
 * que solo tienen sentido en relación unos con otros: por separado nadie nota
 * que ha puesto el aviso de la mora para un día en que la mora ya entró. El
 * ejemplo pone fechas concretas de un mes cualquiera y ahí el error se ve.
 */

export interface Concepto {
  id: number;
  nombre: string;
  tipo: string;
  recurrente: boolean;
  activo: boolean;
  aplicaPorDefecto: boolean;
  admiteBeca: boolean;
  cobraMora: boolean;
  diaCobro: number | null;
  diasParaPago: number | null;
  moraDiasGracia: number | null;
  avisosActivos: boolean;
  avisoAntesEmisionDias: number | null;
  avisoDiaEmision: boolean;
  avisoPrevioDias: number | null;
  avisoDiaCobro: boolean;
  avisoAntesMoraDias: number | null;
  avisoVencidoDias: number[];
  avisoCorreo: boolean;
  avisoWhatsapp: boolean;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Una lista escrita a mano ("3, 15") pasada a números limpios y ordenados. */
export function leerDias(texto: string): number[] {
  return [...new Set(
    texto.split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 180),
  )].sort((a, b) => a - b);
}

/**
 * Una fecha del ejemplo, contada en días desde el 1 de septiembre.
 *
 * Se usa septiembre y no la fecha de hoy porque el ejemplo tiene que ser el
 * mismo cada vez que se abre la pantalla: si cambiara con el día, dos personas
 * mirando la misma configuración verían cosas distintas.
 */
function fechaEjemplo(diasDesdeEmision: number, diaCobro: number): string {
  const base = new Date(Date.UTC(2026, 8, diaCobro === 0 ? 30 : diaCobro));
  base.setUTCDate(base.getUTCDate() + diasDesdeEmision);
  return `${base.getUTCDate()} de ${MESES[base.getUTCMonth()]}`;
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

/** El interruptor de encender/apagar, que ya se repite tres veces. */
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
 * Una fila de aviso: casilla, explicación y, si lleva, el número de días.
 *
 * Se repiten seis veces con la misma forma. `disponible` en falso la deja
 * visible pero apagada con el motivo escrito, en vez de esconderla: si
 * desaparecieran, quien busca "el aviso de la mora" creería que no existe.
 */
function FilaAviso({ activo, onCambiar, titulo, detalle, dias, onDias, sufijo, disponible = true }: {
  activo: boolean; onCambiar: (v: boolean) => void;
  titulo: string; detalle: string;
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
  borrador, setBorrador, diasTexto, setDiasTexto,
  guardando, error, onGuardar, onBorrar,
}: {
  borrador: Concepto;
  setBorrador: (f: (b: Concepto | null) => Concepto | null) => void;
  diasTexto: string;
  setDiasTexto: (v: string) => void;
  guardando: boolean;
  error: string | null;
  onGuardar: () => void;
  onBorrar: () => void;
}) {
  const editar = <K extends keyof Concepto>(campo: K, valor: Concepto[K]) =>
    setBorrador((b) => (b ? { ...b, [campo]: valor } : b));

  const mensual = borrador.recurrente;
  const diaCobro = borrador.diaCobro ?? 1;
  // `diasParaPago` en nulo es "no vence": el interruptor lo pone y lo quita.
  const tieneVencimiento = borrador.diasParaPago != null;
  const vence = borrador.diasParaPago ?? 0;
  const gracia = borrador.moraDiasGracia ?? 0;
  const vencidos = leerDias(diasTexto);

  // El aviso de la mora se cuenta hacia atrás desde el día en que entra. Si se
  // pide con más días de los que hay de gracia, caería antes del vencimiento
  // —o incluso antes de emitir— y ahí deja de significar lo que dice.
  // El vencimiento solo es un momento aparte si cae después de emitir; con
  // cero días son el mismo día y ofrecer dos avisos para él sobra.
  const venceDespues = tieneVencimiento && vence > 0;
  const hayMora = tieneVencimiento && borrador.cobraMora;
  const diaMora = vence + gracia;
  const avisoMora = hayMora ? borrador.avisoAntesMoraDias : null;
  const avisoMoraImposible = avisoMora != null && avisoMora > gracia;

  /**
   * Los días en que sale algún aviso, para detectar los que se pisan.
   *
   * Dos correos el mismo día al mismo padre es el fallo más fácil de cometer
   * aquí —"antes de la mora" y "a los 3 días de vencido" caen juntos en cuanto
   * la gracia y el primer recordatorio de atraso coinciden— y el más difícil
   * de ver mirando los campos por separado.
   */
  const diasConAviso = borrador.avisosActivos ? [
    borrador.avisoAntesEmisionDias != null ? -borrador.avisoAntesEmisionDias : null,
    borrador.avisoDiaEmision ? 0 : null,
    venceDespues && borrador.avisoPrevioDias != null ? vence - borrador.avisoPrevioDias : null,
    venceDespues && borrador.avisoDiaCobro ? vence : null,
    avisoMora != null && !avisoMoraImposible ? diaMora - avisoMora : null,
    ...(tieneVencimiento ? vencidos.map((d) => vence + d) : []),
  ].filter((d): d is number => d != null) : [];
  const diaRepetido = diasConAviso.find((d, i) => diasConAviso.indexOf(d) !== i);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
      <div className="space-y-0 rounded-lg border border-gray-200 bg-white">

        {/* ── 1. Qué es ─────────────────────────────────────────────────── */}
        <div className="border-b border-gray-100 p-4">
          <Paso n={1} titulo="¿Qué es este concepto?" />
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

          <div className="mt-3 space-y-2.5">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-zero-600" checked={mensual}
                onChange={(e) => setBorrador((b) => b && ({
                  ...b,
                  recurrente: e.target.checked,
                  tipo: e.target.checked ? 'mensualidad' : (b.tipo === 'mensualidad' ? 'otro' : b.tipo),
                  // La beca escolar rebaja lo que se paga cada mes; la
                  // inscripción y los materiales se cobran completos. Se deriva
                  // en vez de preguntarse: era una casilla que nadie entendía.
                  admiteBeca: e.target.checked,
                }))} />
              <span className="text-sm">
                <span className="block text-gray-900">Se cobra todos los meses</span>
                <span className="block text-xs text-gray-500">
                  {mensual
                    ? 'Se le cobrará al alumno una vez cada mes durante todo el año escolar. Al matricularlo se le crea una factura recurrente.'
                    : 'Se cobra una sola vez, o en las cuotas que le pongas en el calendario. Marca esta casilla para colegiatura o transporte.'}
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-zero-600"
                checked={borrador.aplicaPorDefecto}
                onChange={(e) => editar('aplicaPorDefecto', e.target.checked)} />
              <span className="text-sm">
                <span className="block text-gray-900">Se le cobra a todos los alumnos</span>
                <span className="block text-xs text-gray-500">
                  Llega ya marcado al matricular. Si a un alumno no le toca, se desmarca ahí mismo.
                </span>
              </span>
            </label>

          </div>
        </div>

        {/* ── 2. Cuándo se cobra ────────────────────────────────────────── */}
        <div className="border-b border-gray-100 p-4">
          <Paso n={2} titulo="¿Cuándo se cobra?" />

          {mensual && (
            <div className="mb-3 max-w-xs space-y-1.5">
              <Label>Se factura el día</Label>
              <NativeSelect value={String(diaCobro)}
                onChange={(e) => editar('diaCobro', Number(e.target.value))}>
                <option value="0">Último del mes</option>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d} de cada mes</option>
                ))}
              </NativeSelect>
            </div>
          )}

          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <Interruptor activo={tieneVencimiento} etiqueta="Tiene fecha de vencimiento"
                onCambiar={(v) => setBorrador((b) => b && ({
                  ...b,
                  diasParaPago: v ? 5 : null,
                  // Sin fecha de vencimiento no hay desde cuándo contar el
                  // atraso, así que la mora se apaga con ella.
                  ...(v ? {} : { cobraMora: false, moraDiasGracia: null }),
                }))} />
              <span className="min-w-[10rem] flex-1 text-sm">
                <span className="block text-gray-900">Tiene fecha de vencimiento</span>
                <span className="block text-xs text-gray-500">
                  {tieneVencimiento
                    ? 'Pasada esa fecha el cargo cuenta como atrasado.'
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

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <Interruptor activo={borrador.cobraMora} etiqueta="Cobrar recargo por atraso"
                disabled={!tieneVencimiento}
                onCambiar={(v) => setBorrador((b) => b && ({
                  ...b, cobraMora: v, moraDiasGracia: v ? (b.moraDiasGracia ?? 3) : null,
                }))} />
              <span className={`min-w-[10rem] flex-1 text-sm ${tieneVencimiento ? '' : 'opacity-50'}`}>
                <span className="block text-gray-900">Cobrar recargo por atraso</span>
                <span className="block text-xs text-gray-500">
                  {!tieneVencimiento
                    ? 'Hace falta una fecha de vencimiento para saber desde cuándo se atrasa.'
                    : borrador.cobraMora
                      ? 'Se le suma un recargo al saldo si no paga a tiempo.'
                      : 'No se le cobra nada de más aunque se atrase.'}
                </span>
              </span>
              {borrador.cobraMora && tieneVencimiento && (
                <span className="flex shrink-0 items-center gap-1.5">
                  <Input type="number" min={0} max={90} className="h-8 w-16"
                    value={borrador.moraDiasGracia ?? 0}
                    onChange={(e) => editar('moraDiasGracia', Number(e.target.value) || 0)} />
                  <span className="text-xs text-gray-500">días de gracia</span>
                </span>
              )}
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            {mensual
              ? 'Los días se cuentan desde que se emite la factura; la gracia, desde que vence.'
              : 'La fecha de emisión la pone el calendario de cuotas.'}
          </p>
        </div>

        {/* ── 3. Recordatorios ──────────────────────────────────────────── */}
        <div className="p-4">
          <Paso n={3} titulo="Recordatorios automáticos"
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

              {/* En el orden en que le pasan al padre: primero se le avisa
                  de que viene la factura, luego que ya salió, luego que vence,
                  luego que va a haber recargo, y por último que está atrasado. */}
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                <FilaAviso
                  activo={borrador.avisoAntesEmisionDias != null}
                  onCambiar={(v) => editar('avisoAntesEmisionDias', v ? 5 : null)}
                  titulo="Antes de generarle la factura"
                  detalle="«Se acerca tu pago de septiembre». Le da tiempo de prepararse."
                  dias={borrador.avisoAntesEmisionDias}
                  onDias={(n) => editar('avisoAntesEmisionDias', n)} />

                <FilaAviso
                  activo={borrador.avisoDiaEmision}
                  onCambiar={(v) => editar('avisoDiaEmision', v)}
                  titulo="El día que se le genera la factura"
                  detalle="«Ya tienes tu factura, este es el monto y hasta cuándo pagar»." />

                <FilaAviso
                  activo={borrador.avisoPrevioDias != null}
                  onCambiar={(v) => editar('avisoPrevioDias', v ? Math.min(3, vence) : null)}
                  titulo="Antes de que venza"
                  detalle={venceDespues
                    ? 'Un recordatorio entre la factura y la fecha límite.'
                    : 'Aquí la factura vence el mismo día que sale, así que no hay hueco.'}
                  disponible={venceDespues}
                  dias={borrador.avisoPrevioDias}
                  onDias={(n) => editar('avisoPrevioDias', n)} />

                <FilaAviso
                  activo={borrador.avisoDiaCobro}
                  onCambiar={(v) => editar('avisoDiaCobro', v)}
                  titulo="El día que vence"
                  detalle={venceDespues
                    ? 'Último aviso todavía sin recargo.'
                    : 'Sería el mismo aviso que el día de la factura.'}
                  disponible={venceDespues} />

                <FilaAviso
                  activo={avisoMora != null}
                  onCambiar={(v) => editar('avisoAntesMoraDias', v ? Math.min(2, gracia || 2) : null)}
                  titulo="Antes de que le entre la mora"
                  detalle={hayMora
                    ? '«Paga antes del día X para no pagar recargo». Es el que más hace pagar.'
                    : 'Este concepto no cobra recargo, así que no hay de qué avisar.'}
                  disponible={hayMora}
                  dias={avisoMora}
                  onDias={(n) => editar('avisoAntesMoraDias', n)} />

                <label className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 ${tieneVencimiento ? '' : 'opacity-50'}`}>
                  <input type="checkbox" className="h-4 w-4 shrink-0 accent-zero-600"
                    disabled={!tieneVencimiento}
                    checked={vencidos.length > 0}
                    onChange={(e) => setDiasTexto(e.target.checked ? '3, 15' : '')} />
                  <span className="min-w-[10rem] flex-1 text-sm text-gray-900">
                    Cuando ya está atrasado
                    <span className="block text-xs text-gray-500">
                      {tieneVencimiento
                        ? 'Se insiste a los días que pongas, separados por coma.'
                        : 'Sin fecha de vencimiento no hay atraso que reclamar.'}
                    </span>
                  </span>
                  {vencidos.length > 0 && tieneVencimiento && (
                    <Input className="h-8 w-24 shrink-0" value={diasTexto} placeholder="3, 15"
                      onChange={(e) => setDiasTexto(e.target.value)} />
                  )}
                </label>
              </div>

              {diaRepetido != null && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  El {fechaEjemplo(diaRepetido, diaCobro)} le salen dos avisos al mismo tutor.
                  Mira la línea de la derecha y quita uno, o cámbiale los días.
                </p>
              )}

              {avisoMoraImposible && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Avisar {avisoMora} días antes de la mora cae antes del vencimiento, porque solo hay{' '}
                  {gracia} día(s) de gracia. Baja el aviso o sube la gracia.
                </p>
              )}

              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5">
                  <input type="checkbox" className="h-4 w-4 accent-zero-600" checked={borrador.avisoCorreo}
                    onChange={(e) => editar('avisoCorreo', e.target.checked)} />
                  <Mail className="h-4 w-4 text-gray-400" />
                  <span className="min-w-0 flex-1 text-sm text-gray-900">Enviar por correo</span>
                </label>
                {/* WhatsApp no se puede encender mientras la cuenta no esté
                    enlazada: un interruptor que se deja marcar y luego no manda
                    nada es peor que no tenerlo. */}
                <label className="flex items-center gap-2.5 px-3 py-2.5 opacity-60">
                  <input type="checkbox" className="h-4 w-4" disabled checked={false} />
                  <MessageCircle className="h-4 w-4 text-gray-400" />
                  <span className="min-w-0 flex-1 text-sm text-gray-900">
                    Enviar por WhatsApp
                    <span className="block text-xs text-gray-500">Falta conectar la cuenta en Configuración.</span>
                  </span>
                </label>
              </div>

              {borrador.avisosActivos && !borrador.avisoCorreo && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Los recordatorios están encendidos pero no hay ningún canal activo, así que no saldrá nada.
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

      {/* ── Ejemplo en vivo ─────────────────────────────────────────────── */}
      <div className="h-fit rounded-lg border border-zero-200 bg-zero-50/50 p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-zero-900">
          <Receipt className="h-4 w-4" />Así le llega al padre
        </p>

        <div className="mb-3 rounded-lg border border-zero-200 bg-white px-3 py-2 text-xs">
          <p className="font-medium text-gray-900">{borrador.nombre || 'Este concepto'}</p>
          <p className="text-gray-500">
            {mensual ? 'Se cobra cada mes · ejemplo de septiembre' : 'Cobro único · ejemplo'}
          </p>
        </div>

        {/* Los hitos se ordenan por la fecha en que ocurren, no por el orden
            en que están escritos: el aviso de atraso a los 3 días puede caer
            antes que la mora si hay gracia, y verlo debajo hace ilegible
            justamente lo que este panel viene a explicar. */}
        <div className="space-y-0">
          {(() => {
            const hitos: { d: number; tono?: 'aviso' | 'mora'; titulo: string; detalle: string }[] = [];
            const av = borrador.avisosActivos;

            if (av && borrador.avisoAntesEmisionDias != null) hitos.push({
              d: -borrador.avisoAntesEmisionDias, tono: 'aviso',
              titulo: 'Aviso: se acerca tu pago',
              detalle: `${borrador.avisoAntesEmisionDias} día(s) antes de la factura.`,
            });

            hitos.push({
              d: 0,
              titulo: 'Se le genera la factura',
              detalle: mensual
                ? (diaCobro === 0 ? 'El último día de cada mes.' : `El día ${diaCobro} de cada mes.`)
                : 'El día que diga el calendario de cuotas.',
            });

            if (av && borrador.avisoDiaEmision) hitos.push({
              d: 0, tono: 'aviso',
              titulo: 'Aviso: ya tienes tu factura',
              detalle: 'Con el monto y hasta cuándo puede pagar.',
            });

            if (av && venceDespues && borrador.avisoPrevioDias != null) hitos.push({
              d: vence - borrador.avisoPrevioDias, tono: 'aviso',
              titulo: 'Aviso: se acerca la fecha límite',
              detalle: `${borrador.avisoPrevioDias} día(s) antes de vencer.`,
            });

            if (venceDespues) hitos.push({
              d: vence, titulo: 'Vence',
              detalle: `${vence} día(s) después de la factura.`,
            });

            if (av && borrador.avisoDiaCobro && venceDespues) hitos.push({
              d: vence, tono: 'aviso',
              titulo: 'Aviso: hoy vence', detalle: 'Último recordatorio sin recargo.',
            });

            if (av && avisoMora != null && !avisoMoraImposible) hitos.push({
              d: diaMora - avisoMora, tono: 'aviso',
              titulo: 'Aviso: paga para evitar el recargo',
              detalle: `${avisoMora} día(s) antes de la mora.`,
            });

            if (hayMora) hitos.push({
              d: diaMora, tono: 'mora',
              titulo: 'Se le aplica la mora',
              detalle: gracia === 0
                ? 'Al día siguiente de vencer.'
                : `${gracia} día(s) después de la fecha límite.`,
            });

            if (av && tieneVencimiento) for (const d of vencidos) hitos.push({
              d: vence + d, tono: 'aviso',
              titulo: 'Aviso de atraso',
              detalle: `${d} día(s) después de la fecha límite.`,
            });

            // Estable: a igualdad de día se conserva el orden de arriba, que ya
            // es el natural (primero ocurre el hecho, después el aviso de él).
            return hitos
              .map((h, i) => ({ ...h, i }))
              .sort((a, b) => (a.d - b.d) || (a.i - b.i))
              .map((h) => (
                <Hito key={`${h.d}-${h.i}`} tono={h.tono} dia={fechaEjemplo(h.d, diaCobro)}
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
                ? `${[
                    borrador.avisoAntesEmisionDias != null && 'antes de la factura',
                    borrador.avisoDiaEmision && 'al generarla',
                    venceDespues && borrador.avisoPrevioDias != null && 'antes de vencer',
                    venceDespues && borrador.avisoDiaCobro && 'el día que vence',
                    avisoMora != null && !avisoMoraImposible && 'antes de la mora',
                    vencidos.length > 0 && tieneVencimiento && `${vencidos.length} de atraso`,
                  ].filter(Boolean).length} aviso(s): ${[
                    borrador.avisoAntesEmisionDias != null && 'antes de la factura',
                    borrador.avisoDiaEmision && 'al generarla',
                    venceDespues && borrador.avisoPrevioDias != null && 'antes de vencer',
                    venceDespues && borrador.avisoDiaCobro && 'el día que vence',
                    avisoMora != null && !avisoMoraImposible && 'antes de la mora',
                    vencidos.length > 0 && tieneVencimiento && `${vencidos.length} de atraso`,
                  ].filter(Boolean).join(', ') || 'ninguno elegido'}.`
                : 'Sin recordatorios: hay que cobrar a mano.'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

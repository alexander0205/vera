'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Receipt, HandCoins, AlertTriangle, Pencil, Trash2, History } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';

/**
 * La ficha de una matrícula: el mismo patrón que la de estudiante, pero
 * contando lo del PERÍODO.
 *
 * El estudiante es la cuenta —acumula deuda año tras año— y la matrícula es el
 * contrato de un año. Los dos números viven en la misma tabla `cargos`, que
 * lleva `estudiante_id` y `matricula_id` a la vez; aquí se separan.
 *
 * Y se enseñan SEPARADOS, no sumados: si a un padre le queda deuda del año
 * pasado, juntarla con la de este año esconde justo la conversación que la caja
 * necesita tener. El total del alumno va debajo, como suma explícita.
 */

export interface MatriculaFila {
  id: number;
  estudianteId: number;
  estudiante: string | null;
  estudianteApellidos: string | null;
  periodo: string | null;
  curso: string | null;
  grado: string | null;
  servicio: string | null;
  tanda: string | null;
  codigoMatricula: string | null;
  fechaInscripcion: string | null;
  estado: string;
  notas: string | null;
}

interface CargoRow {
  id: number;
  matriculaId: number | null;
  montoCentavos: number;
  saldoCentavos: number;
  estado: string;
}

function iniciales(nombres: string | null, apellidos: string | null): string {
  return `${nombres?.[0] ?? ''}${apellidos?.[0] ?? ''}`.toUpperCase() || '—';
}

/**
 * El estado de la matrícula, en color. Vive aquí y lo usa también el listado:
 * una sola definición para que la fila y la ficha no digan lo mismo de dos
 * maneras distintas.
 */
export function EstadoMatriculaBadge({ estado }: { estado: string }) {
  const estilo =
    estado === 'activa'     ? 'bg-zero-50 text-zero-700 border-zero-200'
    : estado === 'retirada'   ? 'bg-amber-50 text-amber-700 border-amber-200'
    : estado === 'finalizada' ? 'bg-blue-50 text-blue-700 border-blue-200'
    : estado === 'anulada'    ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-gray-50 text-gray-600 border-gray-200';
  return <Badge className={`shrink-0 capitalize ${estilo}`}>{estado}</Badge>;
}

// Genérica sobre la fila: la ficha solo lee los campos de `MatriculaFila`, pero
// devuelve al padre la fila COMPLETA que recibió. Si aceptara y devolviera
// `MatriculaFila` a secas, el diálogo de edición perdería `periodoId` y
// `cursoId` por el camino.
export function MatriculaFicha<T extends MatriculaFila>({ matricula: m, onEditar, onBorrar }: {
  matricula: T;
  onEditar: (m: T) => void;
  onBorrar: (m: T) => void;
}) {
  const router = useRouter();
  const { permissions } = usePermissions();
  const puedeGestionar = permissions.includes('administracion-escolar:gestionar');

  const [cargos, setCargos] = useState<CargoRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Se piden los cargos del ALUMNO, no los de la matrícula: la misma respuesta
  // trae `matriculaId`, así que una sola llamada da las dos cifras —lo de este
  // período y el arrastre— en vez de dos.
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch(`/api/administracion-escolar/estudiantes/${m.estudianteId}/cargos`)
      .then((r) => r.json())
      .then((d) => { if (!cancel) { setCargos((d.cargos ?? []) as CargoRow[]); setLoading(false); } })
      .catch(() => { if (!cancel) { setCargos([]); setLoading(false); } });
    return () => { cancel = true; };
  }, [m.estudianteId]);

  const totales = useMemo(() => {
    // Los anulados no son deuda: el cargo sigue en la tabla como rastro, pero
    // ya nadie lo debe.
    const vivos = cargos.filter((c) => c.estado !== 'anulado');
    const deEste = vivos.filter((c) => c.matriculaId === m.id);
    const facturado = deEste.reduce((s, c) => s + c.montoCentavos, 0);
    const pendiente = deEste.reduce((s, c) => s + c.saldoCentavos, 0);
    const arrastre = vivos
      .filter((c) => c.matriculaId !== m.id)
      .reduce((s, c) => s + c.saldoCentavos, 0);
    return {
      facturado, pendiente, pagado: facturado - pendiente, arrastre,
      cargos: deEste.length,
      totalAlumno: pendiente + arrastre,
    };
  }, [cargos, m.id]);

  const curso = [m.grado, m.curso].filter(Boolean).join(' — ') || '—';
  const servicio = m.servicio ? (m.tanda ? `${m.servicio} · ${m.tanda}` : m.servicio) : '—';

  return (
    <div className="sticky top-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Encabezado — el alumno, porque es a quien se busca con los ojos. Va
          sobre fondo tintado para separarlo de los datos sin una línea más. */}
      <div className="flex items-start gap-3 border-b border-gray-100 bg-gray-50/70 px-5 py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zero-100 text-sm font-semibold text-zero-700">
          {iniciales(m.estudiante, m.estudianteApellidos)}
        </div>
        <div className="min-w-0 flex-1">
          {/* Sin truncar: el nombre completo es la razón de mirar esta ficha. */}
          <p className="font-semibold leading-snug text-gray-900">
            {m.estudiante} {m.estudianteApellidos}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <EstadoMatriculaBadge estado={m.estado} />
            {m.codigoMatricula && (
              <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-gray-500 ring-1 ring-gray-200">
                {m.codigoMatricula}
              </span>
            )}
          </div>
        </div>

        {/* Editar y borrar viven aquí, como iconos.
         *
         * Abajo eran dos botones enmarcados debajo del principal: "Editar"
         * estirado a todo lo ancho y la papelera colgando al lado, y los tres
         * pesaban lo mismo aunque uno abre una pantalla, otro corrige un dato y
         * el tercero destruye. Arriba y en pequeño quedan al alcance sin
         * competir con la única acción que de verdad se repite.
         */}
        {puedeGestionar && (
          <div className="flex shrink-0 items-center gap-0.5">
            <button type="button" aria-label="Editar matrícula" title="Editar matrícula"
              onClick={() => onEditar(m)}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white hover:text-zero-600">
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Borrar matrícula" title="Borrar matrícula"
              onClick={() => onBorrar(m)}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4 px-5 py-4">
        {/* Filas y no tarjetas: "Primer grado (7mo Nivel Básico) — A" no cabe en
            media columna, y truncarlo borra justo lo que distingue una matrícula
            de otra. En fila el valor dispone del ancho entero y parte solo. */}
        <dl className="space-y-2.5 text-sm">
          <Dato label="Período"     valor={m.periodo ?? '—'} />
          <Dato label="Curso"       valor={curso} destacado />
          <Dato label="Servicio"    valor={servicio} />
          <Dato label="Inscripción" valor={m.fechaInscripcion ? fmtFechaCorta(m.fechaInscripcion) : '—'} />
        </dl>

        {m.notas && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">{m.notas}</p>
        )}

        {/* Cuentas de ESTE período */}
        <div className="border-t border-gray-100 pt-4">
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-zero-600" /></div>
          ) : totales.cargos === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center">
              <p className="text-sm font-medium text-gray-600">Sin cargos en este período</p>
              <p className="mt-0.5 text-xs text-gray-400">Se generan al llegar la fecha de cada cuota.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                Este período · {totales.cargos} cargo{totales.cargos !== 1 ? 's' : ''}
              </p>
              <TotalRow icon={Receipt} tone="gray" label="Facturado" value={fmtDOP(totales.facturado)} />
              <TotalRow icon={HandCoins} tone="verde" label="Pagado" value={fmtDOP(totales.pagado)} />
              <TotalRow icon={AlertTriangle} tone="red" label="Pendiente" value={fmtDOP(totales.pendiente)}
                muted={totales.pendiente === 0} />
            </div>
          )}
        </div>

        {/* El arrastre solo aparece si existe: un cero permanente es ruido, pero
            esconderlo cuando lo hay deja a la caja cobrando de menos. */}
        {!loading && totales.arrastre > 0 && (
          <div className="space-y-2.5 border-t border-gray-100 pt-4">
            <TotalRow icon={History} tone="amber" label="Arrastre de otros períodos"
              value={fmtDOP(totales.arrastre)} />
            <div className="flex items-baseline justify-between rounded-lg bg-gray-50 px-3 py-2">
              <span className="text-sm font-medium text-gray-900">Total del estudiante</span>
              <span className="text-base font-semibold text-gray-900">{fmtDOP(totales.totalAlumno)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Una sola acción al pie: la que se repite todo el día. Editar y borrar
          están arriba, en la cabecera. */}
      <div className="border-t border-gray-100 bg-gray-50/70 px-5 py-4">
        <Button className="w-full bg-zero-600 hover:bg-zero-700"
          onClick={() => router.push(`/escolar/estudiantes/${m.estudianteId}`)}>
          Abrir perfil del estudiante
        </Button>
      </div>
    </div>
  );
}

/** Etiqueta a la izquierda, valor a la derecha con sitio para partirse. */
function Dato({ label, valor, destacado }: { label: string; valor: string; destacado?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd className={`min-w-0 text-right ${destacado ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
        {valor}
      </dd>
    </div>
  );
}

const TONES = {
  gray:  { box: 'bg-gray-100 text-gray-600',  val: 'text-gray-900' },
  verde:  { box: 'bg-zero-100 text-zero-700',  val: 'text-zero-700' },
  red:   { box: 'bg-red-100 text-red-600',    val: 'text-red-600' },
  amber: { box: 'bg-amber-100 text-amber-700', val: 'text-amber-700' },
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

'use client';

import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDOP, parseDOPaCentavos } from '@/lib/utils/format';

/**
 * El monto de un cargo, corregible en su misma celda.
 *
 * Para cambiar un monto había que abrir «Editar matrícula» y buscar el cargo
 * en otra lista. Aquí el lápiz va al lado de la cifra, en la tabla donde ya se
 * está mirando la cuenta.
 *
 * Qué cargos lo llevan lo decide `montoCorregible` (acciones-cargo.ts): los
 * facturados y los anulados no, y el servidor lo vuelve a comprobar.
 *
 * Todo es HTML nativo: en este proyecto los estilos de MUI ganan a las
 * utilidades de Tailwind, y un `Input` de 96 px no se deja medir así.
 *
 * Los errores salen en el aviso flotante y no debajo del campo: la celda vive
 * dentro de una tabla con desplazamiento propio, y un texto colgando de la
 * última fila se quedaba cortado.
 */
/**
 * El sitio del lápiz, vacío, para las cifras que no se pueden corregir.
 *
 * Sin él, los montos con lápiz quedaban un poco más a la izquierda que los que
 * no lo llevan, y la columna dejaba de leerse de arriba abajo. Va DETRÁS del
 * texto y no envolviéndolo: un cargo anulado sale tachado desde su celda, y el
 * tachado no entra en una caja `inline-flex`.
 */
export function HuecoDelLapiz() {
  return <span aria-hidden className="inline-block w-[26px]" />;
}

export function MontoEditable({ cargoId, montoCentavos, editable, concepto, onGuardado }: {
  cargoId: number;
  montoCentavos: number;
  /** `false` = solo se pinta la cifra, como siempre. */
  editable: boolean;
  /** Para decir de qué es el lápiz a quien no lo ve. */
  concepto?: string | null;
  /** El monto ya cambió en el servidor: toca volver a pedir la cuenta. */
  onGuardado: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [malo, setMalo] = useState(false);

  if (!editable) return <>{fmtDOP(montoCentavos)}<HuecoDelLapiz /></>;

  // La fila del mes se despliega al pulsarla: nada de aquí debe abrirla.
  const quieto = (e: MouseEvent) => e.stopPropagation();

  function abrir(e: MouseEvent) {
    e.stopPropagation();
    setValor((montoCentavos / 100).toFixed(2));
    setMalo(false);
    setEditando(true);
  }

  async function guardar() {
    const centavos = parseDOPaCentavos(valor);
    if (centavos == null) { setMalo(true); toast.error('Escribe un monto válido'); return; }
    // Cero no es corregir un precio: el cargo quedaría saldado sin que entrara
    // un peso. El servidor también lo rechaza; aquí se dice con el consejo.
    if (centavos === 0) {
      setMalo(true);
      toast.error('El monto tiene que ser mayor que cero. Si no se va a cobrar, anula el cargo.');
      return;
    }
    if (centavos === montoCentavos) { setEditando(false); return; }
    setGuardando(true);
    try {
      const res = await fetch(`/api/administracion-escolar/cargos/${cargoId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montoCentavos: centavos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo cambiar el monto');
      toast.success('Monto actualizado');
      setEditando(false);
      onGuardado();
    } catch (e: unknown) {
      setMalo(true);
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el monto');
    } finally {
      setGuardando(false);
    }
  }

  function alTeclear(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); void guardar(); }
    if (e.key === 'Escape') { e.preventDefault(); setEditando(false); }
  }

  if (!editando) {
    return (
      <span className="inline-flex items-center justify-end gap-1">
        <span>{fmtDOP(montoCentavos)}</span>
        <button type="button" onClick={abrir}
          title="Cambiar el monto"
          aria-label={`Cambiar el monto de ${concepto ?? 'este cargo'}`}
          className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-zero-700">
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
      </span>
    );
  }

  return (
    <span className="relative inline-flex justify-end" onClick={quieto}>
      {/* La cifra se queda, invisible, para que la celda no cambie de alto. */}
      <span className="invisible">{fmtDOP(montoCentavos)}</span>
      {/* El editor no cabe en la columna: flota sobre las de su izquierda. */}
      <span className="absolute right-0 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1 rounded-lg border border-zero-200 bg-white p-1 shadow-md">
        <span className="pl-1 text-xs text-gray-500" aria-hidden>RD$</span>
        <input autoFocus type="text" inputMode="decimal" autoComplete="off"
          value={valor}
          onChange={(e) => { setValor(e.target.value); setMalo(false); }}
          onKeyDown={alTeclear}
          aria-invalid={malo}
          aria-label={`Monto nuevo de ${concepto ?? 'este cargo'}`}
          className={`h-8 w-24 rounded-md border px-2 text-right text-sm tabular-nums text-gray-900 outline-none focus:ring-2 focus:ring-zero-500 ${
            malo ? 'border-red-400' : 'border-gray-300'}`} />
        <button type="button" onClick={() => void guardar()} disabled={guardando}
          title="Guardar" aria-label="Guardar el monto"
          className="flex h-8 w-8 items-center justify-center rounded-md bg-zero-600 text-white transition-colors hover:bg-zero-700 disabled:opacity-60">
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
        </button>
        <button type="button" onClick={() => setEditando(false)} disabled={guardando}
          title="Cancelar" aria-label="Cancelar el cambio de monto"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </span>
    </span>
  );
}

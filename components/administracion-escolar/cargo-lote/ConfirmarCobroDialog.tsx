'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { alumnosEnLetras, type FraseDelCobro } from '@/lib/administracion-escolar/cargo-lote';
import { fmtDOP } from '@/lib/utils/format';

/**
 * El último «¿seguro?» antes de crear los cargos.
 *
 * Existe porque esto no tiene deshacer: un cargo mal puesto se anula alumno por
 * alumno, desde la ficha de cada uno. Y porque el botón que cobra queda donde
 * un momento antes estaba «Continuar»: quien venía pulsando seguido no puede
 * terminar creándole una deuda a ciento cincuenta familias por inercia.
 *
 * No calcula nada. La frase y el total son EL MISMO objeto que pinta la barra
 * de cobrar, que a su vez sale de lo que se le preguntó al servidor: lo que se
 * lee aquí es lo que viaja.
 *
 * Se arma con las piezas sueltas del diálogo (cabecera, título y pie) porque el
 * contenedor reconoce cabecera y pie por su tipo: así los botones se quedan
 * abajo y el cuerpo es lo único que desplaza si el teléfono es bajito.
 *
 * Ningún botón recibe el foco al abrirse: un Enter de más no cobra. Y mientras
 * se está creando no se cierra ni con Escape ni pinchando fuera, para que la
 * respuesta no llegue a una pantalla que ya no está.
 *
 * En el teléfono los dos botones van uno encima del otro y a todo el ancho: en
 * fila, «Sí, cobrar a 12 alumnos» no cabía al lado de «No, volver» y el texto
 * se partía dentro del botón que crea la deuda.
 */
export function ConfirmarCobroDialog({
  abierto, frase, marcados, notas, avisos, creando, error, onCerrar, onConfirmar,
  avisarFamilias, onAvisarFamilias,
}: {
  /**
   * Avisar a las familias del cobro nuevo (correo y WhatsApp con la plantilla
   * aprobada; SMS si no hay WhatsApp). Va aquí, junto al «Sí», porque es parte
   * de lo que se confirma: a cuántas familias les va a llegar un mensaje.
   */
  avisarFamilias: boolean;
  onAvisarFamilias: (v: boolean) => void;
  abierto: boolean;
  /** La misma frase de la barra de cobrar. `null` si no hay nada revisado. */
  frase: FraseDelCobro | null;
  /** A cuántos alumnos se les crea el cargo. */
  marcados: number;
  /**
   * A quién sí y a quién no, con nombres: a quiénes marcó uno por uno, a quién
   * le quitó la marca, cuántos ya lo tienen. Las mismas líneas de la barra.
   */
  notas: string[];
  /** Lo que conviene repetir en ámbar: todo el colegio, otro año, un monto alto. */
  avisos: string[];
  creando: boolean;
  /** Por qué no se pudo crear, ya en palabras de la oficina. */
  error: string | null;
  onCerrar: () => void;
  onConfirmar: () => void;
}) {
  if (!frase || frase.principal === null) return null;

  return (
    <Dialog open={abierto} onOpenChange={(o) => { if (!o && !creando) onCerrar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>¿Confirmas este cobro?</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="break-words text-lg font-semibold leading-snug text-gray-900">{frase.principal}</p>

          <div className="flex items-baseline justify-between gap-3 rounded-lg bg-gray-50 px-4 py-3">
            <span className="text-sm font-medium text-gray-700">Total</span>
            <span className="text-2xl font-bold tabular-nums text-gray-900">{fmtDOP(frase.totalCentavos)}</span>
          </div>

          <p className="text-sm text-gray-600">{frase.plazo}</p>

          {notas.map((nota) => (
            <p key={nota} className="break-words text-sm text-gray-600">{nota}</p>
          ))}

          {avisos.map((aviso) => (
            <p key={aviso} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {aviso}
            </p>
          ))}

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-zero-600"
              checked={avisarFamilias} disabled={creando}
              onChange={(e) => onAvisarFamilias(e.target.checked)} />
            <span>
              <span className="block text-sm font-medium text-gray-900">Avisar a las familias</span>
              <span className="block text-xs text-gray-500">
                Por correo y WhatsApp; por SMS a quien no tenga WhatsApp. Sale en la tanda de avisos de la
                mañana (8:00 a 11:45): hoy si cobras antes de las 11:30, si no, mañana.
              </span>
            </span>
          </label>

          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
            <li>Se crea un cargo pendiente en la cuenta de cada alumno. Nadie ha pagado todavía.</li>
            <li>No se deshace de un golpe: si te equivocas, hay que anular el cargo alumno por alumno.</li>
          </ul>

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        {/* Apilados en el teléfono, con el «Sí» arriba; en fila desde `sm`. */}
        <DialogFooter className="flex-col-reverse sm:flex-row">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onCerrar} disabled={creando}>
            No, volver
          </Button>
          <Button className="w-full sm:w-auto bg-zero-600 hover:bg-zero-700" onClick={onConfirmar} disabled={creando}>
            {creando
              ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />Creando…</>
              : `Sí, cobrar a ${alumnosEnLetras(marcados)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

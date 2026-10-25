'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { facturasEnLetras } from '@/lib/administracion-escolar/facturar-lote';
import { fmtDOP } from '@/lib/utils/format';

/**
 * El último «¿seguro?» antes de crear las facturas, y el avance mientras se
 * crean.
 *
 * Crear 80 facturas tarda minutos (cada una resuelve tarifa y producto de sus
 * líneas), así que se mandan de a tandas y aquí se ve cuántas van. Mientras
 * corre, el diálogo no se cierra ni con Escape ni pinchando fuera: la respuesta
 * no puede llegar a una pantalla que ya no está. Lo único que se puede hacer es
 * «Detener después de esta tanda», que respeta la que está en marcha.
 *
 * Dice lo que NO pasa tanto como lo que pasa: son borradores y no se envía nada
 * a la DGII. Es lo que más tranquiliza a quien va a crear cien documentos.
 */
export function ConfirmarFacturasDialog({
  abierto, facturas, cargos, totalCentavos, juntar, meses, creando, progreso, deteniendo, error,
  onCerrar, onConfirmar, onDetener,
}: {
  abierto: boolean;
  facturas: number;
  cargos: number;
  /** Qué meses se facturan, en una frase: «octubre y noviembre 2026». */
  meses: string;
  /** La suma de los cargos (ver la nota de ITBIS en la revisión). */
  totalCentavos: number;
  juntar: boolean;
  creando: boolean;
  /** Facturas ya procesadas de las que se pidieron. */
  progreso: { hechas: number; total: number } | null;
  deteniendo: boolean;
  error: string | null;
  onCerrar: () => void;
  onConfirmar: () => void;
  onDetener: () => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={(o) => { if (!o && !creando) onCerrar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{creando ? 'Creando las facturas…' : '¿Crear estas facturas?'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-lg font-semibold leading-snug text-gray-900">
            {facturasEnLetras(facturas)} en borrador
            <span className="block text-sm font-normal text-gray-600">
              {juntar ? 'Una por responsable de pago' : 'Una por alumno'} · {cargos} {cargos === 1 ? 'cargo' : 'cargos'}
            </span>
          </p>

          <p className="rounded-lg border border-zero-200 bg-zero-50 px-4 py-2.5 text-sm text-zero-900">
            Meses que se facturan: <strong className="font-semibold">{meses}</strong>
          </p>

          <div className="flex items-baseline justify-between gap-3 rounded-lg bg-gray-50 px-4 py-3">
            <span className="text-sm font-medium text-gray-700">Suma de los cargos</span>
            <span className="text-2xl font-bold tabular-nums text-gray-900">{fmtDOP(totalCentavos)}</span>
          </div>

          {creando && progreso && (
            <div role="status" aria-live="polite">
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-zero-600 transition-all"
                  style={{ width: `${progreso.total ? Math.round((progreso.hechas / progreso.total) * 100) : 0}%` }} />
              </div>
              <p className="mt-1.5 flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                {deteniendo
                  ? `Deteniendo después de esta tanda… ${progreso.hechas} de ${progreso.total} revisadas.`
                  : `${progreso.hechas} de ${progreso.total} revisadas. No cierres esta ventana.`}
              </p>
            </div>
          )}

          {!creando && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
              <li>Nacen como <strong className="font-medium text-gray-800">borrador</strong>: no se envía nada a la DGII ni a las familias.</li>
              <li>Cada cargo queda enlazado a su factura; uno que ya la tenga no se factura otra vez.</li>
              <li>Si algo falla en una factura, las demás se siguen creando y al final ves cuáles no salieron.</li>
            </ul>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row">
          {creando ? (
            <Button variant="outline" className="w-full sm:w-auto" onClick={onDetener} disabled={deteniendo}>
              {deteniendo ? 'Deteniendo…' : 'Detener después de esta tanda'}
            </Button>
          ) : (
            <>
              <Button variant="outline" className="w-full sm:w-auto" onClick={onCerrar}>
                No, volver
              </Button>
              <Button className="w-full bg-zero-600 hover:bg-zero-700 sm:w-auto" onClick={onConfirmar}>
                {error ? 'Reintentar' : `Sí, crear ${facturasEnLetras(facturas)}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

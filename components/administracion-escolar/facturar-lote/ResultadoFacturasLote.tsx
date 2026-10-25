'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  agruparOmitidos, facturasEnLetras,
  type FacturaCreada, type FacturaFallida, type OmitidoPlan,
} from '@/lib/administracion-escolar/facturar-lote';
import { fmtDOP } from '@/lib/utils/format';

/**
 * Lo que se acaba de hacer, y a dónde ir después.
 *
 * Ocupa el sitio de los tres pasos: con el formulario todavía lleno al lado, no
 * se sabría si ya se crearon las facturas o no.
 *
 * Todo sale de lo que contestó el servidor, no de lo que se vio en la vista
 * previa: el total es el REAL de cada factura (con el ITBIS que llevara), y si
 * entre la revisión y el clic otra persona ya facturó algo, aquí sale como tal
 * y no como un error.
 *
 * Cada factura creada abre su borrador en un cajón, sin salir del colegio. Es
 * ahí donde se revisa, se edita el RNC del comprador si hace falta o se envía a
 * la DGII — desde aquí no se envía nada.
 */

const A_LA_VISTA = 15;

export function ResultadoFacturasLote({
  creadas, fallidas, omitidos, interrumpido, onVer, onOtroLote, onRevisarDeNuevo,
}: {
  creadas: FacturaCreada[];
  fallidas: FacturaFallida[];
  /** Los alumnos que ya estaban fuera en la vista previa. */
  omitidos: OmitidoPlan[];
  /** Por qué se paró antes de terminar, si no terminó. */
  interrumpido: string | null;
  onVer: (documentoId: number) => void;
  onOtroLote: () => void;
  onRevisarDeNuevo: () => void;
}) {
  const [todas, setTodas] = useState(false);
  const total = creadas.reduce((n, f) => n + f.montoCentavos, 0);
  const cargos = creadas.reduce((n, f) => n + f.cargos, 0);
  const filas = todas ? creadas : creadas.slice(0, A_LA_VISTA);
  const yaFacturadas = fallidas.filter((f) => f.yaFacturados);
  const conError = fallidas.filter((f) => !f.yaFacturados);
  const seCreo = creadas.length > 0;
  const grupos = agruparOmitidos(omitidos);

  return (
    <div className="space-y-5">
      <div role="status" className="rounded-xl border border-gray-200 bg-white p-6 text-center sm:p-8">
        <div className="flex justify-center">
          {seCreo
            ? <CheckCircle2 className="h-12 w-12 text-emerald-500" aria-hidden />
            : <AlertTriangle className="h-10 w-10 text-amber-500" aria-hidden />}
        </div>
        <h2 id="facturar-lote-resultado" tabIndex={-1} className="mt-3 text-lg font-semibold text-gray-900 outline-none">
          {seCreo
            ? `Listo: ${facturasEnLetras(creadas.length)} creadas en borrador`
            : 'No se creó ninguna factura'}
        </h2>
        {seCreo && (
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">
            {cargos} {cargos === 1 ? 'cargo' : 'cargos'} facturados por{' '}
            <span className="font-medium tabular-nums text-gray-900">{fmtDOP(total)}</span>.
            Revísalas y envíalas a la DGII cuando quieras: desde aquí no se envió nada.
          </p>
        )}

        {interrumpido && (
          <p role="alert" className="mx-auto mt-3 max-w-md rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {interrumpido}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {interrumpido && (
            <Button className="bg-zero-600 hover:bg-zero-700" onClick={onRevisarDeNuevo}>Revisar lo que falta</Button>
          )}
          <Button variant={interrumpido ? 'outline' : 'default'}
            className={interrumpido ? '' : 'bg-zero-600 hover:bg-zero-700'} onClick={onOtroLote}>
            Facturar otro lote
          </Button>
        </div>
      </div>

      {conError.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
          <h3 className="text-sm font-semibold text-red-900">
            {conError.length === 1 ? '1 factura no se pudo crear' : `${conError.length} facturas no se pudieron crear`}
          </h3>
          <p className="mt-0.5 text-xs text-red-800">
            Sus cargos siguen sin factura. Arregla lo que dice cada una y vuelve a revisar.
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-red-900">
            {conError.map((f) => (
              <li key={f.clave}>
                <span className="font-medium">{f.estudiantes.map((e) => e.nombre).join(', ')}</span>
                <span> — {f.detalle}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {yaFacturadas.length > 0 && (
        <div className="rounded-xl border border-zero-200 bg-zero-50 p-4 text-sm text-zero-900">
          <p className="font-semibold">
            {yaFacturadas.length === 1 ? 'Otra factura ya estaba hecha' : `${yaFacturadas.length} facturas ya estaban hechas`}
          </p>
          <p className="mt-0.5 text-xs">
            Mientras revisabas, alguien (o el cierre automático) facturó esos cargos. No se duplicó nada:{' '}
            {yaFacturadas.map((f) => f.estudiantes.map((e) => e.nombre).join(', ')).join('; ')}.
          </p>
        </div>
      )}

      {seCreo && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600">
            <FileText className="h-4 w-4" aria-hidden />
            <span className="flex-1">Facturas creadas</span>
            <span>Total</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {filas.map((f) => (
              <li key={f.documentoId}>
                <button type="button" onClick={() => onVer(f.documentoId)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zero-500">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {f.estudiantes.map((e) => e.nombre).join(', ')}
                    </span>
                    <span className="block truncate text-xs text-gray-500">
                      {f.codigo}{f.responsable ? ` · ${f.responsable}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900">{fmtDOP(f.montoCentavos)}</span>
                  <span className="shrink-0 text-sm font-medium text-zero-600">Ver</span>
                </button>
              </li>
            ))}
          </ul>
          {creadas.length > A_LA_VISTA && (
            <button type="button" onClick={() => setTodas((t) => !t)}
              className="w-full border-t border-gray-100 px-4 py-2 text-center text-sm font-medium text-zero-600 hover:bg-gray-50">
              {todas ? 'Ver menos' : `Ver las ${creadas.length} facturas`}
            </button>
          )}
        </div>
      )}

      {grupos.length > 0 && (
        <p className="text-xs text-gray-500">
          Sin factura desde el principio:{' '}
          {grupos.map((g) => `${g.alumnos.length} — ${g.titulo.replace(/ \(.*\)$/, '').toLowerCase()}`).join(' · ')}.
        </p>
      )}
    </div>
  );
}

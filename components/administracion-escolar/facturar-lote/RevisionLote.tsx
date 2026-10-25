'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import {
  agruparOmitidos, facturasEnLetras, periodoDeLinea,
  type FacturaPlan, type PlanLote,
} from '@/lib/administracion-escolar/facturar-lote';
import { fmtDOP } from '@/lib/utils/format';

/**
 * Paso 3 de «Facturar por lote»: lo que va a pasar, antes de que pase.
 *
 * Una fila por factura futura —alumno (o familia), responsable, cuántas líneas
 * y cuánto suman— y, aparte, los alumnos que se quedan sin factura con su
 * razón. Nada de esto existe todavía: es el plan que calculó el servidor, y es
 * el mismo que se le entrega a quien crea las facturas.
 *
 * La suma es la de los cargos, no el total de la factura: si el producto de un
 * concepto lleva ITBIS, la factura lo añade encima al crearse. Se dice, porque
 * un total que luego no coincide es una pregunta al colegio.
 */

/** Hasta 30 filas se ven abiertas; más, y el botón de crear se va fuera de la pantalla. */
const FILAS_A_LA_VISTA = 30;

function FilaFactura({ f, porFamilia }: { f: FacturaPlan; porFamilia: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const alumnos = f.estudiantes.map((e) => e.nombre).join(', ');
  return (
    <li>
      <button type="button" aria-expanded={abierta} onClick={() => setAbierta((a) => !a)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zero-500 sm:py-2.5">
        {abierta
          ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
          : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-900">
            {porFamilia && f.responsable ? f.responsable : alumnos}
          </span>
          <span className="block truncate text-xs text-gray-500">
            {porFamilia
              ? `${f.estudiantes.length === 1 ? '1 hijo' : `${f.estudiantes.length} hijos`}: ${alumnos}`
              : `A nombre de ${f.responsable ?? 'su responsable'}`}
          </span>
        </span>
        <span className="shrink-0 text-xs text-gray-500">
          {f.lineas.length} {f.lineas.length === 1 ? 'línea' : 'líneas'}
        </span>
        <span className="w-28 shrink-0 text-right text-sm font-medium tabular-nums text-gray-900">
          {fmtDOP(f.totalCentavos)}
        </span>
      </button>
      {abierta && (
        <ul className="space-y-1 border-t border-gray-100 bg-gray-50 px-3 py-2 pl-10 text-xs text-gray-700">
          {f.lineas.map((l) => (
            <li key={l.cargoId} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">
                {l.concepto} · {periodoDeLinea(l.mes, l.anio)}
                {f.estudiantes.length > 1 && <span className="text-gray-500"> — {l.estudiante}</span>}
              </span>
              <span className="shrink-0 tabular-nums">{fmtDOP(l.saldoCentavos)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function RevisionLote({ plan, juntar, periodo }: {
  plan: PlanLote;
  juntar: boolean;
  periodo: string;
}) {
  const [verTodas, setVerTodas] = useState(false);
  const [omitidosAbiertos, setOmitidosAbiertos] = useState<string | null>(null);
  const filas = verTodas ? plan.facturas : plan.facturas.slice(0, FILAS_A_LA_VISTA);
  const grupos = agruparOmitidos(plan.omitidos);

  return (
    <div className="space-y-4 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
      {plan.facturas.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">No hay ninguna factura que crear con esta selección.</p>
          <p className="mt-0.5 text-sm text-amber-800">
            Abajo está el motivo de cada alumno. Cambia los alumnos, los conceptos o los meses y vuelve a revisar.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            Se van a crear <strong className="font-semibold text-gray-900">{facturasEnLetras(plan.facturas.length)}</strong>{' '}
            en borrador ({juntar ? 'una por responsable' : 'una por alumno'}) con{' '}
            <strong className="font-semibold text-gray-900">{plan.totalCargos} {plan.totalCargos === 1 ? 'cargo' : 'cargos'}</strong> de{' '}
            {periodo}. Toca una fila para ver sus líneas.
          </p>

          <div className="overflow-hidden rounded-lg border border-gray-200">
            <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
              <FileText className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1">{juntar ? 'Familia' : 'Alumno'}</span>
              <span className="w-28 text-right">Suma de cargos</span>
            </div>
            <ul className="divide-y divide-gray-100">
              {filas.map((f) => <FilaFactura key={f.clave} f={f} porFamilia={juntar} />)}
            </ul>
            {plan.facturas.length > FILAS_A_LA_VISTA && (
              <button type="button" onClick={() => setVerTodas((v) => !v)}
                className="w-full border-t border-gray-100 px-3 py-2 text-center text-sm font-medium text-zero-600 hover:bg-gray-50">
                {verTodas ? 'Ver menos' : `Ver las ${plan.facturas.length} facturas`}
              </button>
            )}
          </div>

          <p className="text-xs text-gray-500">
            La suma es la de los cargos. Si el producto de un concepto lleva ITBIS, la factura lo añade al crearse.
            Quedan en borrador: nada se envía a la DGII hasta que lo hagas.
          </p>
        </>
      )}

      {grupos.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">
            Sin factura ({plan.omitidos.length} {plan.omitidos.length === 1 ? 'alumno' : 'alumnos'})
          </h3>
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
            {grupos.map((g) => {
              const abierto = omitidosAbiertos === g.motivo;
              return (
                <li key={g.motivo}>
                  <button type="button" aria-expanded={abierto}
                    onClick={() => setOmitidosAbiertos(abierto ? null : g.motivo)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zero-500 ${
                      g.motivo === 'sin-responsable' ? 'bg-amber-50/60' : ''}`}>
                    {abierto
                      ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                      : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />}
                    <span className="min-w-0 flex-1 text-sm text-gray-800">{g.titulo}</span>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900">{g.alumnos.length}</span>
                  </button>
                  {abierto && (
                    <ul className="max-h-64 space-y-1 overflow-y-auto border-t border-gray-100 bg-gray-50 px-3 py-2 pl-10 text-xs text-gray-700">
                      {g.alumnos.map((o) => (
                        <li key={o.estudianteId}>
                          <span className="font-medium text-gray-900">{o.nombre}</span>
                          <span className="text-gray-600"> — {o.detalle}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

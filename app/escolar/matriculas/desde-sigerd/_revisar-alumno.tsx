'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { LineaPlan } from '@/components/administracion-escolar/PlanCobroSelector';
import type { TutorVinculo } from '@/components/administracion-escolar/TutoresPanel';
import { aplicarPreciosPropios } from '@/components/administracion-escolar/PlanCobroSelector';
import { conBeca, cuentaDe, type BecaAlumno } from '@/lib/administracion-escolar/matricular-sigerd-plan';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { esMatriculado, precioDeLinea, type Ajuste, type Alumno, type PasoAlumno } from './_compartido';

/**
 * El último paso del formulario: cómo queda la cuenta del alumno en Zero antes
 * de darlo por completado. Lee lo guardado (familia, cargos y pagos) cada vez
 * que se entra, para enseñar lo que hay de verdad y no lo de hace un rato.
 */

interface Cargo {
  id: number; conceptoId: number; concepto: string; matriculaId: number | null; mes: number | null; anio: number | null;
  montoCentavos: number; saldoCentavos: number; estado: string; moraSaldoCentavos: number;
  fechaVencimiento: string | null; ecfDocumentId: number | null;
}

const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function RevisarAlumno({ alumno, periodoId, lineas, conceptos, precios, beca, corte, sinGuardar, conCambios, onPaso }: {
  alumno: Alumno;
  /** Para leer qué meses se marcaron «Debe todo»: se facturan al guardar. */
  periodoId: number;
  /** Lo que cobra su sección y lo de otros grados («Ver más»); `null` mientras llega. */
  lineas: LineaPlan[] | null;
  conceptos: number[];
  precios: Ajuste['precios'];
  /** La beca que se le pone al matricularlo. La del ya matriculado se lee de su matrícula. */
  beca?: BecaAlumno | null;
  corte: string;
  /** En «Cargos del año» hay cambios sin «Guardar». */
  sinGuardar: boolean;
  /** Su plan cambió y espera al botón de abajo («Matricular» o «Guardar cambios»). */
  conCambios: boolean;
  onPaso: (p: PasoAlumno) => void;
}) {
  const [responsable, setResponsable] = useState<{ nombre: string; rnc: string | null } | null | undefined>(undefined);
  const [tutores, setTutores] = useState<TutorVinculo[] | null>(null);
  const [cargos, setCargos] = useState<Cargo[] | null>(null);
  const [debe, setDebe] = useState<Set<number>>(new Set());
  const [moraPrevia, setMoraPrevia] = useState<Record<string, number>>({});
  /** La beca guardada en su matrícula (solo ya matriculados). */
  const [becaMatricula, setBecaMatricula] = useState<{ tipo: 'porcentaje' | 'monto'; valor: number; motivo: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    const base = `/api/administracion-escolar/estudiantes/${alumno.id}`;
    Promise.all([
      fetch(base).then((r) => r.json()),
      fetch(`${base}/tutores`).then((r) => r.json()),
      esMatriculado(alumno) ? fetch(`${base}/cargos`).then((r) => r.json()) : Promise.resolve(null),
      fetch(`/api/administracion-escolar/matriculas/desde-sigerd/completados?periodoId=${periodoId}`)
        .then((r) => (r.ok ? r.json() : { debe: [] })).catch(() => ({ debe: [] })),
      esMatriculado(alumno) && alumno.matriculaId
        ? fetch(`/api/administracion-escolar/matriculas/${alumno.matriculaId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null),
    ]).then(([e, t, c, d, m]) => {
      if (!vigente) return;
      const r = e.estudiante?.responsable;
      setResponsable(r ? { nombre: r.razonSocial, rnc: r.rnc } : null);
      setTutores(t.tutores ?? []);
      setCargos(c ? ((c.cargos ?? []) as Cargo[]).filter((x) => x.matriculaId === alumno.matriculaId) : null);
      setDebe(new Set((d.debe ?? []) as number[]));
      setMoraPrevia((d.moraPrevia ?? {}) as Record<string, number>);
      const mat = m?.matricula;
      setBecaMatricula((mat?.becaTipo === 'porcentaje' || mat?.becaTipo === 'monto') && Number(mat.becaValor) > 0
        ? { tipo: mat.becaTipo, valor: Number(mat.becaValor), motivo: mat.becaMotivo ?? null } : null);
    }).catch(() => { if (vigente) setError('No se pudo leer la cuenta del alumno'); });
    return () => { vigente = false; };
  }, [alumno, periodoId]);

  // La beca que vale aquí: la que se le va a poner, o la que ya tiene su matrícula.
  // Solo la de porcentaje cambia el precio de cada línea; la de monto se dice aparte.
  const porcentajeBeca = esMatriculado(alumno)
    ? (becaMatricula?.tipo === 'porcentaje' ? becaMatricula.valor : null)
    : beca?.porcentaje ?? null;
  const elegidas = useMemo(() => {
    const propios = new Map(precios.map((p) => [p.conceptoId, p.montoCentavos]));
    // Como en el plan del paso anterior y en sus cargos: precio propio y, encima, la beca.
    const conTodo = conBeca(aplicarPreciosPropios(lineas ?? [], propios), porcentajeBeca ? { porcentaje: porcentajeBeca } : null);
    return conTodo.filter((l) => conceptos.includes(l.conceptoId))
      .map((l) => ({ l, propio: propios.has(l.conceptoId), conBeca: l.origen === 'beca' }));
  }, [lineas, conceptos, precios, porcentajeBeca]);
  const cuenta = lineas && !esMatriculado(alumno) ? cuentaDe(lineas, conceptos, precios, corte, beca) : null;

  const pagos = useMemo(() => {
    if (!cargos) return null;
    const porConcepto = new Map<number, { nombre: string; pagado: number; debe: number; mora: number; meses: string[] }>();
    const t = { pagado: 0, debe: 0, mora: 0, noCobra: 0 };
    for (const c of cargos) {
      if (c.estado === 'anulado') { t.noCobra++; continue; }
      const p = porConcepto.get(c.conceptoId) ?? { nombre: c.concepto, pagado: 0, debe: 0, mora: 0, meses: [] };
      const saldo = Math.max(0, c.saldoCentavos);
      p.pagado += c.montoCentavos - saldo;
      p.debe += saldo;
      p.mora += c.moraSaldoCentavos ?? 0;
      if (saldo > 0) p.meses.push(c.mes ? MESES[c.mes - 1] : 'Único');
      porConcepto.set(c.conceptoId, p);
      t.pagado += c.montoCentavos - saldo; t.debe += saldo; t.mora += c.moraSaldoCentavos ?? 0;
    }
    return { t, filas: [...porConcepto.values()] };
  }, [cargos]);

  // Los «Debe todo» que siguen sin factura: se facturan al guardar, uno por mes.
  const porFacturar = useMemo(() => {
    const m = new Map<string, { mes: string; total: number; conceptos: string[]; vence: string | null; moraPrevia: number }>();
    for (const c of cargos ?? []) {
      if (!debe.has(c.id) || c.ecfDocumentId != null || c.estado === 'anulado' || c.saldoCentavos !== c.montoCentavos) continue;
      const clave = c.mes ? `${c.anio}-${String(c.mes).padStart(2, '0')}` : `0-${c.id}`;
      const g = m.get(clave) ?? { mes: c.mes ? `${MESES_LARGOS[c.mes - 1]}${c.anio ? ` ${c.anio}` : ''}` : 'Pago único', total: 0, conceptos: [], vence: null, moraPrevia: 0 };
      g.total += c.montoCentavos;
      g.moraPrevia += moraPrevia[String(c.id)] ?? 0;
      g.conceptos.push(c.concepto);
      if (c.fechaVencimiento && (!g.vence || c.fechaVencimiento > g.vence)) g.vence = c.fechaVencimiento;
      m.set(clave, g);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g);
  }, [cargos, debe, moraPrevia]);

  const avisos: Array<{ texto: string; paso?: PasoAlumno }> = [];
  if (responsable === null && porFacturar.length > 0) {
    avisos.push({
      texto: 'Sin responsable de pago no se pueden facturar los meses que debe: se quedarían como cargo pendiente, sin factura y sin mora.',
      paso: 'familia',
    });
  }
  if (responsable === null) avisos.push({ texto: 'No tiene responsable de pago: sus cargos no se facturan ni le llegan avisos.', paso: 'familia' });
  if (tutores && tutores.length === 0) avisos.push({ texto: 'No tiene padres ni tutores anotados.', paso: 'familia' });
  if (sinGuardar) avisos.push({ texto: 'Cambiaste sus cargos y no los guardaste.', paso: 'conceptos' });
  if (conceptos.length === 0 && lineas) avisos.push({ texto: 'No lleva ningún concepto.', paso: 'conceptos' });

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (responsable === undefined || tutores == null) {
    return <p className="flex items-center gap-2 py-4 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Leyendo su cuenta…</p>;
  }

  const de = (rel: string) => tutores.filter((t) => t.relacion.toLowerCase() === rel).map((t) => t.nombre).join(', ');
  const otros = tutores.filter((t) => !['madre', 'padre'].includes(t.relacion.toLowerCase()));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Revise antes de completar</h3>
        <p className="text-sm text-gray-500">Así queda la cuenta del estudiante en Zero.</p>
      </div>

      <dl className="grid gap-3 rounded-xl border border-gray-200 p-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Dato t="Responsable de pago" v={responsable?.nombre ?? 'Sin responsable'} malo={!responsable} />
        <Dato t="Cédula o RNC" v={responsable?.rnc || 'No indicada'} />
        <Dato t="Madre" v={de('madre') || 'No anotada'} />
        <Dato t="Padre" v={de('padre') || 'No anotado'} />
        {otros.length > 0 && <Dato t="Otros tutores" v={otros.map((o) => `${o.nombre} (${o.relacion})`).join(', ')} />}
      </dl>

      {avisos.length > 0 && (
        <ul className="space-y-1.5">
          {avisos.map((a) => (
            <li key={a.texto} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span className="flex-1">{a.texto} Puede completarlo igual y corregirlo después.</span>
              {a.paso && (
                <button type="button" onClick={() => onPaso(a.paso!)} className="shrink-0 text-xs font-medium underline">Ir</button>
              )}
            </li>
          ))}
        </ul>
      )}

      <section>
        <h4 className="mb-1.5 text-sm font-semibold text-gray-900">Lo que se le cobra este año</h4>
        {!lineas ? (
          <p className="text-sm text-gray-500">Calculando su plan…</p>
        ) : elegidas.length === 0 ? (
          <p className="text-sm text-gray-500">Ningún concepto.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
            {elegidas.map(({ l, propio, conBeca: becada }) => (
              <li key={l.conceptoId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-gray-900">
                  {l.nombre}
                  {l.fueraDeSeccion && <span className="ml-1.5 rounded bg-zero-50 px-1.5 py-0.5 text-[11px] text-zero-700">de otros grados</span>}
                  {propio && <span className="ml-1.5 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-700">precio propio</span>}
                  {becada && <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">con beca</span>}
                </span>
                <span className="shrink-0 tabular-nums text-gray-600">{precioDeLinea(l)}</span>
              </li>
            ))}
          </ul>
        )}
        {beca && !esMatriculado(alumno) && (
          <p className="mt-1.5 text-xs font-medium text-zero-700">
            Con beca del {beca.porcentaje} %{beca.motivo ? ` (${beca.motivo})` : ''}: se descuenta de lo que admite beca.
          </p>
        )}
        {becaMatricula && esMatriculado(alumno) && (
          <p className="mt-1.5 text-xs font-medium text-zero-700">
            {becaMatricula.tipo === 'porcentaje'
              ? `Su matrícula tiene beca del ${becaMatricula.valor} %: los precios de arriba ya la descuentan.`
              : `Su matrícula tiene una beca de ${fmtDOP(becaMatricula.valor)} en la mensualidad.`}
            {becaMatricula.motivo ? ` (${becaMatricula.motivo})` : ''}
          </p>
        )}
        {cuenta && (
          <p className="mt-1.5 text-xs text-gray-500">
            Al matricularlo se le carga {fmtDOP(cuenta.hoy)} de lo ya vencido ({cuenta.cargos} cargo(s)) · {fmtDOP(cuenta.anio)} en el año.
          </p>
        )}
        {conCambios && (
          <p className="mt-1.5 text-xs font-medium text-zero-700">
            {esMatriculado(alumno)
              ? 'El cambio de cargos se guarda en su matrícula con «Guardar cambios», abajo.'
              : 'Se matricula con «Matricular», abajo, junto con los demás.'}
          </p>
        )}
      </section>

      <section>
        <h4 className="mb-1.5 text-sm font-semibold text-gray-900">Pagos</h4>
        {!esMatriculado(alumno) ? (
          <p className="text-sm text-gray-500">
            Todavía no está matriculado: lo que ya pagó se anota en «Pagos» después de matricularlo.
          </p>
        ) : !pagos ? (
          <p className="text-sm text-gray-500">Leyendo sus cargos…</p>
        ) : (
          <>
            <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Stat t="Pagado" v={fmtDOP(pagos.t.pagado)} tono="text-emerald-700" />
              <Stat t="Debe" v={fmtDOP(pagos.t.debe)} tono={pagos.t.debe ? 'text-orange-700' : undefined} />
              <Stat t="Mora" v={fmtDOP(pagos.t.mora)} tono={pagos.t.mora ? 'text-red-700' : undefined} />
              <Stat t="Balance a migrar" v={fmtDOP(pagos.t.debe + pagos.t.mora)} fuerte />
            </div>
            {pagos.filas.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500">
                    <tr><th className="px-3 py-2 font-medium">Concepto</th><th className="px-3 py-2 font-medium">Meses con deuda</th>
                      <th className="px-3 py-2 text-right font-medium">Pagado</th><th className="px-3 py-2 text-right font-medium">Debe</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagos.filas.map((f) => (
                      <tr key={f.nombre}>
                        <td className="px-3 py-2 text-gray-900">{f.nombre}</td>
                        <td className="px-3 py-2">{f.meses.length ? f.meses.join(', ') : <span className="text-emerald-700">Al día</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtDOP(f.pagado)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${f.debe ? 'text-orange-700' : ''}`}>{fmtDOP(f.debe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {pagos.t.noCobra > 0 && <p className="mt-1.5 text-xs text-gray-500">{pagos.t.noCobra} mes(es) marcados «No se cobra».</p>}
          </>
        )}
      </section>

      {porFacturar.length > 0 && (
        <section className="rounded-xl border border-orange-200 bg-orange-50/50 p-3.5">
          <h4 className="text-sm font-semibold text-gray-900">Al guardar el estudiante se facturan los meses que debe</h4>
          <p className="mt-0.5 text-xs text-gray-600">
            Su cargo ya existe desde que se matriculó, pero sin factura no está en cuentas por cobrar ni lleva mora.
            Se crea una factura por mes, en <b>borrador y sin NCF</b> (no va a la DGII; si la quieren fiscal, se edita
            y se emite desde Facturación), con el <b>vencimiento original</b> del mes, y se le pone de una vez la
            mora ya vencida en los conceptos que la cobran: la que calcula el sistema o, donde se anotó, la que ya
            traía. Lo que venga después lo pone el sistema, como a cualquier factura vencida.
          </p>
          <ul className="mt-2 divide-y divide-orange-100 rounded-lg border border-orange-100 bg-white">
            {porFacturar.map((g) => (
              <li key={g.mes} className="flex flex-wrap items-center justify-between gap-x-3 px-3 py-1.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-gray-900">{g.mes}</span>
                  <span className="ml-1.5 text-xs text-gray-500">{g.conceptos.join(', ')}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-gray-600">
                  {fmtDOP(g.total)}{g.vence && <> · vence {fmtFechaCorta(g.vence)}</>}
                  {g.moraPrevia > 0 && <> · mora que traía {fmtDOP(g.moraPrevia)}</>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Dato({ t, v, malo }: { t: string; v: string; malo?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{t}</dt>
      <dd className={`truncate text-sm font-medium ${malo ? 'text-amber-700' : 'text-gray-900'}`} title={v}>{v}</dd>
    </div>
  );
}

function Stat({ t, v, tono, fuerte }: { t: string; v: string; tono?: string; fuerte?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${fuerte ? 'border-zero-600 bg-zero-600 text-white' : 'border-gray-200'}`}>
      <span className={`block text-xs ${fuerte ? 'text-white/80' : 'text-gray-500'}`}>{t}</span>
      <b className={`text-base font-semibold tabular-nums ${fuerte ? '' : tono ?? 'text-gray-900'}`}>{v}</b>
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import type { Ficha } from '@/lib/administracion-escolar/ficha-estudiante';

/**
 * El récord financiero, tal como se entrega en el mostrador.
 *
 * Todo el documento vive dentro de `.print-area`, que es lo que el CSS de
 * impresión deja visible: sin esa clase, imprimir sacaba también el menú, las
 * pestañas y los botones. Los controles quedan fuera a propósito.
 *
 * Se enseña TODO el historial, no solo el período abierto: quien pide el
 * récord suele estar discutiendo algo de hace dos años, y un documento que
 * empieza en septiembre no le sirve para eso.
 */

interface Colegio {
  nombre: string;
  rnc: string | null;
  telefono: string | null;
  direccion: string | null;
}

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  parcial: 'Parcial',
  vencido: 'Vencido',
  pagado: 'Pagado',
  anulado: 'Anulado',
};

export default function RecordFinancieroClient({ ficha, colegio }: {
  ficha: Ficha;
  colegio: Colegio | null;
}) {
  const { estudiante, matriculas, cargos, pagos } = ficha;

  // La fecha del documento se pone en el navegador y no en el servidor: el
  // servidor corre en UTC y el papel llevaría la fecha de mañana desde las 8
  // de la noche de RD.
  useEffect(() => {
    const el = document.getElementById('emitido-el');
    if (el) el.textContent = new Date().toLocaleString('es-DO', {
      day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }, []);

  // Los anulados se listan pero no suman: existen en el historial —alguien los
  // creó y alguien los anuló— y esconderlos hace que el papel no cuadre con lo
  // que la familia recuerda haber recibido.
  const vivos = cargos.filter((c) => c.estado !== 'anulado');
  const total = vivos.reduce((s, c) => s + c.montoCentavos, 0);
  const pendiente = vivos.reduce((s, c) => s + c.saldoCentavos, 0);
  const cobrado = total - pendiente;
  // «Facturado» es solo lo que tiene e-CF; el resto es deuda cargada sin
  // factura (se detalla en el aviso ámbar de abajo).
  const facturado = vivos.filter((c) => c.ecfDocumentId != null).reduce((s, c) => s + c.montoCentavos, 0);

  const totalPagos = pagos.reduce((s, p) => s + p.montoCentavos, 0);

  // Un cargo sin factura es deuda que existe pero de la que el padre nunca
  // recibió documento. Se dice aparte porque es lo primero que reclama.
  const sinFacturar = vivos.filter((c) => c.ecfDocumentId == null);
  const sinFacturarTotal = sinFacturar.reduce((s, c) => s + c.saldoCentavos, 0);

  const hoy = new Date().toISOString().slice(0, 10);
  const vencido = vivos
    .filter((c) => c.saldoCentavos > 0 && c.fechaVencimiento && c.fechaVencimiento < hoy)
    .reduce((s, c) => s + c.saldoCentavos, 0);

  const porMatricula = new Map(matriculas.map((m) => [m.id, m]));

  return (
    <section className="mx-auto max-w-5xl space-y-4 p-6">
      {/* Controles: fuera del área imprimible. */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="outline" size="sm">
          <Link href={`/escolar/estudiantes/${estudiante.id}`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />Volver a la ficha
          </Link>
        </Button>
        <Button size="sm" className="bg-zero-600 hover:bg-zero-700" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" />Imprimir
        </Button>
      </div>

      <div className="print-area space-y-5 rounded-xl border border-gray-200 bg-white p-6 text-[13px] text-gray-900">
        {/* Encabezado: quién lo emite y de quién es. */}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-lg font-bold">{colegio?.nombre ?? 'Colegio'}</h1>
            <p className="text-xs text-gray-500">
              {colegio?.rnc ? `RNC ${colegio.rnc}` : ''}
              {colegio?.telefono ? ` · ${colegio.telefono}` : ''}
            </p>
            {colegio?.direccion && <p className="text-xs text-gray-500">{colegio.direccion}</p>}
          </div>
          <div className="text-right">
            <p className="text-base font-semibold">Récord financiero</p>
            <p className="text-xs text-gray-500">Emitido el <span id="emitido-el">—</span></p>
          </div>
        </header>

        {/* De quién es y a quién se le cobra. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Bloque titulo="Estudiante">
            <Dato k="Nombre" v={`${estudiante.nombres} ${estudiante.apellidos}`} />
            <Dato k="Código" v={estudiante.codigo ?? '—'} />
            <Dato k="Estado" v={estudiante.estado} />
          </Bloque>
          <Bloque titulo="Responsable de pago">
            <Dato k="Nombre" v={estudiante.responsable?.razonSocial ?? 'Sin asignar'} />
            <Dato k="RNC / Cédula" v={estudiante.responsable?.rnc ?? '—'} />
            <Dato k="Contacto" v={estudiante.responsable?.email
              ?? estudiante.responsable?.telefono ?? '—'} />
          </Bloque>
        </div>

        {/* El resumen: las cuatro cifras por las que se pide el papel. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Cifra label="Facturado" valor={fmtDOP(facturado)} />
          <Cifra label="Cobrado" valor={fmtDOP(cobrado)} />
          <Cifra label="Pendiente" valor={fmtDOP(pendiente)} destacado={pendiente > 0} />
          <Cifra label="Vencido" valor={fmtDOP(vencido)} destacado={vencido > 0} />
        </div>

        {sinFacturar.length > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {sinFacturar.length} cargo(s) por {fmtDOP(sinFacturarTotal)} todavía no tienen factura
            emitida: son deuda registrada de la que aún no se ha entregado comprobante.
          </p>
        )}

        {/* Matrículas: en qué curso estuvo cada año. */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">Matrículas</h2>
          {matriculas.length === 0 ? (
            <p className="text-xs text-gray-500">Sin matrículas registradas.</p>
          ) : (
            <Tabla cabeceras={['Período', 'Curso', 'Inscripción', 'Código', 'Estado']}>
              {matriculas.map((m) => (
                <tr key={m.id} className="border-t border-gray-100">
                  <td className="py-1.5 pr-3">{m.periodo ?? '—'}</td>
                  <td className="py-1.5 pr-3">{m.curso ?? '—'}</td>
                  <td className="py-1.5 pr-3">{m.fechaInscripcion ? fmtFechaCorta(String(m.fechaInscripcion)) : '—'}</td>
                  <td className="py-1.5 pr-3">{m.codigoMatricula ?? '—'}</td>
                  <td className="py-1.5 capitalize">{m.estado}</td>
                </tr>
              ))}
            </Tabla>
          )}
        </section>

        {/* Cargo por cargo, que es el detalle que se discute. */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">Cargos</h2>
          {cargos.length === 0 ? (
            <p className="text-xs text-gray-500">Sin cargos registrados.</p>
          ) : (
            <Tabla cabeceras={['Período', 'Concepto', 'Mes', 'Vence', 'Factura', 'Monto', 'Pagado', 'Saldo', 'Estado']}
              numericas={[5, 6, 7]}>
              {cargos.map((c) => {
                const anulado = c.estado === 'anulado';
                const m = c.matriculaId != null ? porMatricula.get(c.matriculaId) : null;
                return (
                  <tr key={c.id} className={`border-t border-gray-100 ${anulado ? 'text-gray-400 line-through' : ''}`}>
                    <td className="py-1.5 pr-3">{m?.periodo ?? '—'}</td>
                    <td className="py-1.5 pr-3">{c.concepto ?? 'Sin concepto'}</td>
                    <td className="py-1.5 pr-3">{c.mes ? `${MESES[c.mes]} ${c.anio}` : c.anio}</td>
                    <td className="py-1.5 pr-3">{c.fechaVencimiento ? fmtFechaCorta(String(c.fechaVencimiento)) : '—'}</td>
                    {/* El e-NCF es lo que la familia tiene en la mano; sin él,
                        el código interno al menos permite encontrarla. */}
                    <td className="py-1.5 pr-3">{c.facturaEncf || c.facturaCodigo || '—'}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtDOP(c.montoCentavos)}</td>
                    <td className="py-1.5 pr-3 text-right">
                      {fmtDOP(Math.max(0, c.montoCentavos - c.saldoCentavos))}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{fmtDOP(c.saldoCentavos)}</td>
                    <td className="py-1.5">{ESTADO_LABEL[c.estado] ?? c.estado}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-gray-300 font-semibold">
                <td className="py-2 pr-3" colSpan={5}>Total (sin anulados)</td>
                <td className="py-2 pr-3 text-right">{fmtDOP(facturado)}</td>
                <td className="py-2 pr-3 text-right">{fmtDOP(cobrado)}</td>
                <td className="py-2 pr-3 text-right">{fmtDOP(pendiente)}</td>
                <td />
              </tr>
            </Tabla>
          )}
        </section>

        {/* Los pagos, con su referencia: es lo que prueba que se pagó. */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">Pagos recibidos</h2>
          {pagos.length === 0 ? (
            <p className="text-xs text-gray-500">Sin pagos registrados.</p>
          ) : (
            <Tabla cabeceras={['Fecha', 'Método', 'Referencia', 'Monto']} numericas={[3]}>
              {pagos.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="py-1.5 pr-3">{fmtFechaCorta(String(p.fechaPago))}</td>
                  <td className="py-1.5 pr-3 capitalize">{p.metodo ?? '—'}</td>
                  <td className="py-1.5 pr-3">{p.referencia ?? '—'}</td>
                  <td className="py-1.5 text-right">{fmtDOP(p.montoCentavos)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-300 font-semibold">
                <td className="py-2 pr-3" colSpan={3}>Total cobrado</td>
                <td className="py-2 text-right">{fmtDOP(totalPagos)}</td>
              </tr>
            </Tabla>
          )}
        </section>

        <footer className="border-t border-gray-200 pt-3 text-[11px] text-gray-500">
          Documento generado por el sistema a partir de los cargos y pagos registrados.
          No es un comprobante fiscal: las facturas con su e-NCF se entregan aparte.
        </footer>
      </div>
    </section>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{titulo}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <p className="flex gap-2 text-xs">
      <span className="w-28 shrink-0 text-gray-500">{k}</span>
      <span className="min-w-0 break-words font-medium capitalize-first">{v}</span>
    </p>
  );
}

function Cifra({ label, valor, destacado }: { label: string; valor: string; destacado?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-base font-bold ${destacado ? 'text-red-600' : 'text-gray-900'}`}>{valor}</p>
    </div>
  );
}

function Tabla({ cabeceras, numericas = [], children }: {
  cabeceras: string[];
  /** Índices de columna que van alineadas a la derecha (importes). */
  numericas?: number[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
            {cabeceras.map((c, i) => (
              <th key={c} className={`pb-1.5 pr-3 font-medium ${numericas.includes(i) ? 'text-right' : ''}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

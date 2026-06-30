/**
 * /dashboard/facturas/[id]/editar
 * Carga un documento sin e-CF existente y abre el formulario pre-relleno.
 * Permite editar documentos en estado BORRADOR o HISTORICA (no emitidos a DGII).
 */
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Loader2, AlertTriangle, ShieldX } from 'lucide-react';
import Link from 'next/link';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teams, clients, pagosRecibidos } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { getTeamIdForUser } from '@/lib/db/queries';
import EditarBorradorClient from './_editar-client';
import type { EmpresaPerfil } from '../../nueva/page';
import { hasPermission } from '@/lib/auth/page-guard';

export default async function EditarBorradorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Gate: solo roles con facturas:editar (bloquea al rol `user` y `lector`).
  // Usamos hasPermission en lugar de requirePermission para mostrar un mensaje
  // inline en vez de redirigir silenciosamente al dashboard.
  const canEdit = await hasPermission('facturas:editar');
  if (!canEdit) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-5 p-6 text-center">
        <div className="h-14 w-14 rounded-full bg-red-50 flex items-center justify-center">
          <ShieldX className="h-7 w-7 text-red-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sin permisos para editar</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-sm">
            Tu rol no tiene acceso para editar facturas. Contacta al administrador si necesitas realizar cambios.
          </p>
        </div>
        <Link
          href="/dashboard/facturas"
          className="text-sm px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
        >
          Volver a facturas
        </Link>
      </div>
    );
  }

  const { id } = await params;
  const docId  = parseInt(id);
  if (isNaN(docId)) notFound();

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  // Cargar el documento y el perfil de empresa en paralelo
  const [[row], [team]] = await Promise.all([
    db
      .select({ doc: ecfDocuments })
      .from(ecfDocuments)
      .where(and(eq(ecfDocuments.id, docId), eq(ecfDocuments.teamId, teamId)))
      .limit(1),
    db
      .select({
        razonSocial:     teams.razonSocial,
        nombreComercial: teams.nombreComercial,
        logo:            teams.logo,
        rnc:             teams.rnc,
        firma:           teams.firma,
        recargoMoraActivo:     teams.recargoMoraActivo,
        recargoMoraPorcentaje: teams.recargoMoraPorcentaje,
        recargoMoraDiasGracia: teams.recargoMoraDiasGracia,
        plazoPagoDefaultDias:  teams.plazoPagoDefaultDias,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1),
  ]);

  if (!row) notFound();
  // Editables: documentos sin e-CF real (borrador, histórica de Alegra).
  // Los ya emitidos a DGII / anulados no se editan.
  if (!['BORRADOR', 'HISTORICA'].includes(row.doc.estado)) {
    redirect(`/dashboard/facturas`);
  }

  const { doc } = row;

  // Cargar pagos del ledger (para restaurar el split al editar)
  const pagosRows = await db
    .select({
      metodo:        pagosRecibidos.metodo,
      montoCentavos: pagosRecibidos.montoCentavos,
      cuenta:        pagosRecibidos.cuenta,
      referencia:    pagosRecibidos.referencia,
      fechaPago:     pagosRecibidos.fechaPago,
    })
    .from(pagosRecibidos)
    .where(and(eq(pagosRecibidos.ecfDocumentId, docId), eq(pagosRecibidos.teamId, teamId)))
    .orderBy(asc(pagosRecibidos.id));

  // Preferir el ledger (pagosRecibidos) para restaurar el split.
  // Cuando no hay filas (pago marcado sin valor), caer a las columnas inline
  // de ecfDocuments para recuperar al menos el método elegido.
  const pagoLineas = pagosRows.length > 0
    ? pagosRows.map(p => ({
        metodo:     p.metodo,
        valor:      (p.montoCentavos / 100).toFixed(2),
        cuenta:     p.cuenta ?? undefined,
        referencia: p.referencia ?? undefined,
      }))
    : doc.pagoRecibido === 'true' && doc.pagoMetodo
      ? [{ metodo: doc.pagoMetodo, valor: '', cuenta: doc.pagoCuenta ?? undefined }]
      : [];

  // Si hay clientId, cargar el teléfono del cliente
  let telefonoComprador: string | null = null;
  if (doc.clientId) {
    const [cl] = await db
      .select({ telefono: clients.telefono })
      .from(clients)
      .where(eq(clients.id, doc.clientId))
      .limit(1);
    telefonoComprador = cl?.telefono ?? null;
  }

  const perfil: EmpresaPerfil = team ?? {
    razonSocial: null, nombreComercial: null, logo: null, rnc: null, firma: null,
  };

  const initialData = {
    id:                   doc.id,
    tipoEcf:              doc.tipoEcf,
    clientId:             doc.clientId,
    rncComprador:         doc.rncComprador,
    razonSocialComprador: doc.razonSocialComprador,
    emailComprador:       doc.emailComprador,
    telefonoComprador,
    tipoPago:             doc.tipoPago,
    fechaLimitePago:      doc.fechaLimitePago,
    ncfModificado:        doc.ncfModificado,
    notas:                doc.notas,
    terminosCondiciones:  doc.terminosCondiciones,
    pieFactura:           doc.pieFactura,
    retenciones:          doc.retenciones,
    comentario:           doc.comentario,
    lineasJson:           doc.lineasJson,
    dependienteId:        doc.dependienteId   ?? null,
    dependienteNombre:    doc.dependienteNombre ?? null,
    almacenId:            doc.almacenId        ?? null,
    vendedorId:           doc.vendedorId       ?? null,
    listaPreciosId:       doc.listaPreciosId   ?? null,
    // Pago — restaurar split al editar
    pagoRecibido:         pagoLineas.length > 0,
    pagoFecha:            doc.pagoFecha ?? null,
    pagoLineas:           pagoLineas.length > 0 ? pagoLineas : undefined,
  };

  const sinItems = !doc.lineasJson;

  return (
    <div>
      {/* Aviso cuando el borrador fue guardado sin ítems (formato anterior) */}
      {sinItems && (
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
            <p>
              Este borrador fue guardado antes de que el sistema almacenara los ítems.
              <strong className="ml-1">Agrega los productos/servicios nuevamente</strong> y haz Vista previa para continuar.
            </p>
          </div>
        </div>
      )}
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        </div>
      }>
        <EditarBorradorClient initialPerfil={perfil} initialData={initialData} />
      </Suspense>
    </div>
  );
}

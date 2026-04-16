/**
 * /dashboard/facturas/[id]/editar
 * Carga un borrador existente y abre el formulario pre-relleno.
 * Solo permite editar documentos en estado BORRADOR.
 */
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teams, clients } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getTeamIdForUser } from '@/lib/db/queries';
import EditarBorradorClient from './_editar-client';
import type { EmpresaPerfil } from '../../nueva/page';

export default async function EditarBorradorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1),
  ]);

  if (!row) notFound();
  if (row.doc.estado !== 'BORRADOR') {
    // No es borrador — redirigir al detalle
    redirect(`/dashboard/facturas`);
  }

  const { doc } = row;

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

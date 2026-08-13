/**
 * /dashboard/facturas/[id]/editar
 * Carga un documento sin e-CF existente y abre el formulario pre-relleno.
 * Permite editar documentos en estado BORRADOR o HISTORICA (no emitidos a DGII).
 */
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Loader2, AlertTriangle, ShieldX } from 'lucide-react';
import Link from 'next/link';
import { Box, Typography, Button } from '@mui/material';
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
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 400,
          gap: 2.5,
          p: 3,
          textAlign: 'center',
        }}
      >
        <Box
          sx={{
            height: 56,
            width: 56,
            borderRadius: '50%',
            bgcolor: '#fef2f2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ShieldX style={{ width: 28, height: 28, color: '#ef4444' }} />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#111827' }}>
            Sin permisos para editar
          </Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5, maxWidth: 384 }}>
            Tu rol no tiene acceso para editar facturas. Contacta al administrador si necesitas realizar cambios.
          </Typography>
        </Box>
        <Button
          component="a"
          href="/dashboard/facturas"
          nativeButton={false}
          variant="contained"
          disableElevation
          sx={{
            textTransform: 'none',
            fontSize: '0.875rem',
            px: 2,
            py: 1,
            borderRadius: '8px',
            bgcolor: '#3658e1',
            '&:hover': { bgcolor: '#2a45c4' },
          }}
        >
          Volver a facturas
        </Button>
      </Box>
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
  // Editables: documentos sin e-CF real (borrador, histórica importada).
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
    // Fecha de emisión guardada — restaurarla en el form (evita que un
    // re-guardado la pise con la fecha de hoy). Custom se guarda a las 12:00,
    // así que toISOString().slice(0,10) es estable.
    fechaEmision:         doc.fechaEmision ? doc.fechaEmision.toISOString().slice(0, 10) : null,
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
      {sinItems && (
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '16px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', fontSize: '0.875rem', color: '#92400e' }}>
            <AlertTriangle style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, color: '#f59e0b' }} />
            <p style={{ margin: 0 }}>
              Esta factura fue guardada antes de que el sistema almacenara los ítems.
              <strong style={{ marginLeft: 4 }}>Agrega los productos/servicios nuevamente</strong> y haz Vista previa para continuar.
            </p>
          </div>
        </div>
      )}
      <Suspense fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
          <Loader2 style={{ width: 32, height: 32, color: '#3658e1', animation: 'spin 1s linear infinite' }} />
        </div>
      }>
        <EditarBorradorClient initialPerfil={perfil} initialData={initialData} />
      </Suspense>
    </div>
  );
}

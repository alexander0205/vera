/**
 * Server component — carga el perfil de la empresa activa.
 * Igual que /facturas/nueva — al cambiar de empresa el form refleja los datos.
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import {
  teams, adminEscolarMatriculas, adminEscolarPeriodos, adminEscolarEstudiantes,
  adminEscolarConceptosPago, adminEscolarEstudianteTutores, adminEscolarTutores, clients,
  dependientes, products,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import NuevaFacturaRecurrenteForm, { type ContextoEscolar } from './NuevaFacturaRecurrenteForm';
import type { EmpresaPerfil } from '../../facturas/nueva/page';

async function getEmpresaPerfil(): Promise<EmpresaPerfil | null> {
  const teamId = await getTeamIdForUser();
  if (!teamId) return null;
  const [team] = await db
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
    .limit(1);
  return team ?? null;
}

export default async function NuevaFacturaRecurrentePage({ searchParams }: { searchParams: Promise<{ matriculaId?: string }> }) {
  const perfil = await getEmpresaPerfil();
  const { matriculaId } = await searchParams;
  const id = Number(matriculaId);
  const solicitudEscolar = Number.isInteger(id) && id > 0;
  let contextoEscolar: ContextoEscolar | undefined;

  if (Number.isInteger(id) && id > 0) {
    const teamId = await getTeamIdForUser();
    if (teamId) {
      const [matricula] = await db.select({
        id: adminEscolarMatriculas.id,
        estudianteId: adminEscolarMatriculas.estudianteId,
        facturaRecurrenteId: adminEscolarMatriculas.facturaRecurrenteId,
        estado: adminEscolarMatriculas.estado,
        estudianteNombre: adminEscolarEstudiantes.nombres,
        estudianteApellidos: adminEscolarEstudiantes.apellidos,
        dependienteId: adminEscolarEstudiantes.dependienteId,
        periodo: adminEscolarPeriodos.nombre,
        fechaInicio: adminEscolarPeriodos.fechaInicio,
        fechaFin: adminEscolarPeriodos.fechaFin,
      })
        .from(adminEscolarMatriculas)
        .innerJoin(adminEscolarEstudiantes, eq(adminEscolarMatriculas.estudianteId, adminEscolarEstudiantes.id))
        .innerJoin(adminEscolarPeriodos, eq(adminEscolarMatriculas.periodoId, adminEscolarPeriodos.id))
        .where(and(eq(adminEscolarMatriculas.id, id), eq(adminEscolarMatriculas.teamId, teamId)))
        .limit(1);
      const [concepto] = await db.select({
        id: adminEscolarConceptosPago.id,
        nombre: adminEscolarConceptosPago.nombre,
        productoId: products.id,
        productoNombre: products.nombre,
        productoDescripcion: products.descripcion,
        productoReferencia: products.referencia,
        productoPrecio: products.precio,
        productoTasaItbis: products.tasaItbis,
        productoTipo: products.tipo,
        productoUnidadMedida: products.unidadMedida,
      })
        .from(adminEscolarConceptosPago)
        .leftJoin(products, eq(adminEscolarConceptosPago.productId, products.id))
        .where(and(
          eq(adminEscolarConceptosPago.teamId, teamId),
          eq(adminEscolarConceptosPago.tipo, 'mensualidad'),
          eq(adminEscolarConceptosPago.activo, true),
        ))
        .limit(1);
      if (matricula && concepto && matricula.estado === 'activa' && !matricula.facturaRecurrenteId &&
          matricula.fechaInicio && matricula.fechaFin) {
        const [tutor] = await db.select({
          nombre: adminEscolarTutores.nombre,
          clientId: adminEscolarTutores.clientId,
          clienteRazonSocial: clients.razonSocial,
        })
          .from(adminEscolarEstudianteTutores)
          .innerJoin(adminEscolarTutores, eq(adminEscolarEstudianteTutores.tutorId, adminEscolarTutores.id))
          .innerJoin(clients, eq(adminEscolarTutores.clientId, clients.id))
          .where(and(
            eq(adminEscolarEstudianteTutores.teamId, teamId),
            eq(adminEscolarEstudianteTutores.estudianteId, matricula.estudianteId),
            eq(adminEscolarEstudianteTutores.responsablePago, true),
          ))
          .limit(1);
        if (tutor?.clientId) {
          const [beneficiario] = matricula.dependienteId
            ? await db.select({ id: dependientes.id, nombre: dependientes.nombre, apellido: dependientes.apellido })
              .from(dependientes)
              .where(and(
                eq(dependientes.id, matricula.dependienteId),
                eq(dependientes.teamId, teamId),
                eq(dependientes.clientId, tutor.clientId),
              ))
              .limit(1)
            : [];
          contextoEscolar = {
            matriculaId: matricula.id, conceptoId: concepto.id, conceptoNombre: concepto.nombre,
            estudianteNombre: `${matricula.estudianteNombre} ${matricula.estudianteApellidos}`,
            tutorNombre: tutor.nombre, clientId: tutor.clientId,
            clienteRazonSocial: tutor.clienteRazonSocial ?? tutor.nombre,
            periodo: matricula.periodo, fechaInicio: matricula.fechaInicio, fechaFin: matricula.fechaFin,
            beneficiario: beneficiario ? { id: beneficiario.id, nombre: `${beneficiario.nombre} ${beneficiario.apellido}` } : null,
            producto: concepto.productoId && concepto.productoNombre && concepto.productoPrecio != null ? {
              id: concepto.productoId,
              nombre: concepto.productoNombre,
              descripcion: concepto.productoDescripcion,
              referencia: concepto.productoReferencia,
              precioDOP: concepto.productoPrecio / 100,
              tasaItbis: concepto.productoTasaItbis as 'exento' | '0.18' | '0.16' | '0',
              tipo: concepto.productoTipo as 'bien' | 'servicio',
              unidadMedida: concepto.productoUnidadMedida,
            } : null,
          };
        }
      }
    }
  }

  // Un enlace escolar nunca debe degradarse a un plan genérico sin vínculo.
  // Evita facturas huérfanas si faltan calendario, tutor o concepto mensual.
  if (solicitudEscolar && !contextoEscolar) {
    return (
      <section className="p-6 space-y-3">
        <h1 className="text-xl font-semibold text-gray-900">No se puede configurar la mensualidad</h1>
        <p className="text-sm text-gray-600">
          La matrícula requiere período con fechas, concepto activo de mensualidad y tutor responsable vinculado a un contacto.
        </p>
        <Link href="/dashboard/administracion-escolar/estudiantes" className="text-sm text-teal-700 hover:underline">
          Volver a estudiantes
        </Link>
      </section>
    );
  }
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    }>
      <NuevaFacturaRecurrenteForm initialPerfil={perfil} contextoEscolar={contextoEscolar} />
    </Suspense>
  );
}

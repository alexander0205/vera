import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos,
  adminEscolarConceptosPago,
  adminEscolarEstudiantes,
  adminEscolarEstudianteTutores,
  adminEscolarTutores,
  products,
  clients,
  dependientes,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

/**
 * Prefill para crear una factura A PARTIR de un cargo escolar.
 *
 * NO crea ni emite nada: solo resuelve, en un payload, los datos que el
 * formulario de nueva factura necesita para autocompletarse (cliente = tutor
 * responsable, dependiente = estudiante, línea = producto del concepto). El
 * usuario decide luego borrador vs emitir. El monto viene del CARGO (saldo
 * pendiente), no del producto — el producto solo aporta nombre/ITBIS/tipo.
 *
 * Enlace unidireccional (admin_escolar → products/clients/dependientes); las
 * entidades genéricas no saben nada de este flujo. Ver regla de Alex.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // 'pagos' y no 'ver': el prefill devuelve los datos fiscales del tutor
  // responsable (RNC, email, teléfono) para armar la factura del cargo.
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:pagos');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const cargoId = parseInt(id, 10);
  if (!Number.isInteger(cargoId) || cargoId <= 0) {
    return NextResponse.json({ error: 'Cargo inválido' }, { status: 400 });
  }

  // Cargo + concepto + producto (si el concepto está vinculado a uno).
  const [row] = await db
    .select({
      cargoId:        adminEscolarCargos.id,
      estudianteId:   adminEscolarCargos.estudianteId,
      montoCentavos:  adminEscolarCargos.montoCentavos,
      saldoCentavos:  adminEscolarCargos.saldoCentavos,
      estado:         adminEscolarCargos.estado,
      conceptoNombre: adminEscolarConceptosPago.nombre,
      productId:      adminEscolarConceptosPago.productId,
      productNombre:  products.nombre,
      productTasa:    products.tasaItbis,
      productTipo:    products.tipo,
    })
    .from(adminEscolarCargos)
    .leftJoin(adminEscolarConceptosPago, and(
      eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id),
      eq(adminEscolarConceptosPago.teamId, teamId),
    ))
    .leftJoin(products, eq(adminEscolarConceptosPago.productId, products.id))
    .where(and(eq(adminEscolarCargos.id, cargoId), eq(adminEscolarCargos.teamId, teamId)))
    .limit(1);

  if (!row) return NextResponse.json({ error: 'Cargo no encontrado' }, { status: 404 });

  const advertencias: string[] = [];

  if (!['pendiente', 'parcial', 'vencido'].includes(row.estado)) {
    advertencias.push(`El cargo está en estado "${row.estado}" — puede que no requiera facturación.`);
  }

  // Estudiante → dependiente (beneficiario de la línea).
  const [est] = await db
    .select({
      dependienteId:      adminEscolarEstudiantes.dependienteId,
      dependienteNombre:  dependientes.nombre,
      dependienteApellido: dependientes.apellido,
    })
    .from(adminEscolarEstudiantes)
    .leftJoin(dependientes, eq(adminEscolarEstudiantes.dependienteId, dependientes.id))
    .where(and(eq(adminEscolarEstudiantes.id, row.estudianteId), eq(adminEscolarEstudiantes.teamId, teamId)))
    .limit(1);

  const dependiente = est?.dependienteId
    ? { id: est.dependienteId, nombre: `${est.dependienteNombre ?? ''} ${est.dependienteApellido ?? ''}`.trim() }
    : null;
  if (!dependiente) {
    advertencias.push('El estudiante no está vinculado a un dependiente de Contactos; la línea quedará sin beneficiario.');
  }

  // Tutor responsable de pago → cliente (comprador de la factura).
  const [tut] = await db
    .select({
      clientId:    adminEscolarTutores.clientId,
      razonSocial: clients.razonSocial,
      rnc:         clients.rnc,
      email:       clients.email,
      telefono:    clients.telefono,
    })
    .from(adminEscolarEstudianteTutores)
    .innerJoin(adminEscolarTutores, and(
      eq(adminEscolarEstudianteTutores.tutorId, adminEscolarTutores.id),
      eq(adminEscolarTutores.teamId, teamId),
    ))
    .leftJoin(clients, eq(adminEscolarTutores.clientId, clients.id))
    .where(and(
      eq(adminEscolarEstudianteTutores.estudianteId, row.estudianteId),
      eq(adminEscolarEstudianteTutores.teamId, teamId),
      eq(adminEscolarEstudianteTutores.responsablePago, true),
    ))
    .limit(1);

  const comprador = tut?.clientId
    ? {
        clienteId:   tut.clientId,
        razonSocial: tut.razonSocial ?? '',
        rnc:         tut.rnc ?? null,
        email:       tut.email ?? null,
        telefono:    tut.telefono ?? null,
      }
    : null;
  if (!comprador) {
    advertencias.push('El tutor responsable no está vinculado a un cliente de Contactos; deberás elegir el cliente manualmente.');
  }

  // Línea: nombre/ITBIS/tipo del producto si existe; si no, texto libre con el
  // nombre del concepto. El precio SIEMPRE viene del cargo (saldo pendiente).
  const tasasValidas = ['0.18', '0.16', '0', 'exento'];
  const tasaItbis = row.productId && row.productTasa && tasasValidas.includes(row.productTasa)
    ? row.productTasa
    : 'exento';
  if (!row.productId) {
    advertencias.push('El concepto no tiene un producto/servicio vinculado; la línea usará el nombre del concepto e ITBIS exento (verifícalo).');
  }

  const linea = {
    productoId:             row.productId ?? null,
    nombreItem:             row.productNombre ?? row.conceptoNombre ?? 'Cargo escolar',
    cantidadItem:           1,
    // El form trabaja en PESOS (precioDOP). saldoCentavos/100.
    precioUnitarioItem:     row.saldoCentavos / 100,
    tasaItbis,
    indicadorBienoServicio: row.productTipo === 'bien' ? '1' : '2',
    dependienteId:          dependiente?.id ?? null,
    dependienteNombre:      dependiente?.nombre ?? '',
  };

  return NextResponse.json({
    cargo: {
      id:            row.cargoId,
      conceptoNombre: row.conceptoNombre,
      montoCentavos: row.montoCentavos,
      saldoCentavos: row.saldoCentavos,
    },
    comprador,
    dependiente,
    linea,
    advertencias,
  });
}

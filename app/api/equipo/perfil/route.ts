/**
 * POST /api/equipo/perfil
 * Guarda logo, firma, colores y datos de contacto del equipo.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teams, teamMembers, users } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { METODO_PAGO_VALUES } from '@/lib/pagos/metodos';

const MAX_IMG_SIZE = 1_000_000; // 1 MB en base64

const schema = z.object({
  razonSocial:       z.string().min(1).max(255).optional(),
  nombreComercial:   z.string().max(255).optional(),
  rnc:               z.string()
                       .regex(/^\d{9}$|^\d{11}$/, 'RNC debe tener 9 dígitos (empresa) u 11 dígitos (cédula)')
                       .optional(),
  direccion:         z.string().max(500).optional(),
  provincia:         z.string().max(100).optional().or(z.literal('')),
  municipio:         z.string().max(100).optional().or(z.literal('')),
  telefono:          z.string().max(30).optional(),
  sitioWeb:          z.string().max(200).optional(),
  emailFacturacion:  z.string().email().max(255).optional().or(z.literal('')),
  colorPrimario:     z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color debe ser hex de 3 o 6 dígitos (#fff o #ffffff)').optional(),
  logo:              z.string().max(MAX_IMG_SIZE).optional().or(z.literal('')),
  firma:             z.string().max(MAX_IMG_SIZE).optional().or(z.literal('')),
  // Recargo por mora (cobranza — no modifica XML fiscal)
  recargoMoraActivo:     z.boolean().optional(),
  recargoMoraPorcentaje: z.number().int().min(0).max(10000).optional(),  // 0–100% en bps (0 = desactivado)
  recargoMoraDiasGracia: z.number().int().min(0).max(365).optional(),
  // Módulo cuadre de caja
  cajaHabilitada:        z.boolean().optional(),
  // Módulo punto de venta (POS)
  posHabilitado:         z.boolean().optional(),
  posEscolarHabilitado:  z.boolean().optional(),
  // Plazo de pago por defecto. null = de contado; N = crédito a N días.
  plazoPagoDefaultDias:  z.number().int().min(1).max(365).nullable().optional(),
  // Métodos de pago que obligan emisión a la DGII (no permiten borrador).
  metodosObligaDgii:     z.array(z.enum(METODO_PAGO_VALUES)).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 422 });
  }

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  // RBAC: solo el owner del team (o platform admin) puede modificar el perfil de empresa.
  // Editar RNC / razón social / dirección afecta el e-CF — debe quedar restringido.
  const [u] = await db
    .select({ platformRole: users.platformRole })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const isPlatformAdmin = u?.platformRole === 'admin';

  if (!isPlatformAdmin) {
    const [member] = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
      .limit(1);

    if (!member || member.role !== 'owner') {
      return NextResponse.json(
        { error: 'Solo el owner del equipo puede modificar el perfil de la empresa.' },
        { status: 403 },
      );
    }
  }

  const data = parsed.data;
  await db.update(teams).set({
    ...(data.razonSocial       !== undefined && { razonSocial: data.razonSocial }),
    ...(data.nombreComercial   !== undefined && { nombreComercial: data.nombreComercial }),
    ...(data.rnc               !== undefined && { rnc: data.rnc }),
    ...(data.direccion         !== undefined && { direccion: data.direccion }),
    ...(data.provincia         !== undefined && { provincia: data.provincia || null }),
    ...(data.municipio         !== undefined && { municipio: data.municipio || null }),
    ...(data.telefono          !== undefined && { telefono: data.telefono } as any),
    ...(data.sitioWeb          !== undefined && { sitioWeb: data.sitioWeb } as any),
    ...(data.emailFacturacion  !== undefined && { emailFacturacion: data.emailFacturacion } as any),
    ...(data.colorPrimario     !== undefined && { colorPrimario: data.colorPrimario } as any),
    ...(data.logo              !== undefined && { logo: data.logo } as any),
    ...(data.firma             !== undefined && { firma: data.firma } as any),
    // Recargo por mora
    ...(data.recargoMoraActivo     !== undefined && { recargoMoraActivo: data.recargoMoraActivo }),
    ...(data.recargoMoraPorcentaje !== undefined && { recargoMoraPorcentaje: data.recargoMoraPorcentaje }),
    ...(data.recargoMoraDiasGracia !== undefined && { recargoMoraDiasGracia: data.recargoMoraDiasGracia }),
    // Módulo caja
    ...(data.cajaHabilitada !== undefined && { cajaHabilitada: data.cajaHabilitada }),
    // Módulo POS
    ...(data.posHabilitado        !== undefined && { posHabilitado: data.posHabilitado }),
    ...(data.posEscolarHabilitado !== undefined && { posEscolarHabilitado: data.posEscolarHabilitado }),
    ...(data.plazoPagoDefaultDias  !== undefined && { plazoPagoDefaultDias: data.plazoPagoDefaultDias }),
    ...(data.metodosObligaDgii     !== undefined && { metodosObligaDgii: data.metodosObligaDgii }),
    updatedAt: new Date(),
  }).where(eq(teams.id, teamId));

  return NextResponse.json({ ok: true });
}

export async function GET(_req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const [[team], [member]] = await Promise.all([
    db.select().from(teams).where(eq(teams.id, teamId)).limit(1),
    db.select({ role: teamMembers.role }).from(teamMembers)
      .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
      .limit(1),
  ]);

  return NextResponse.json({
    razonSocial:       team.razonSocial,
    nombreComercial:   team.nombreComercial,
    rnc:               team.rnc,
    direccion:         team.direccion,
    provincia:         team.provincia,
    municipio:         team.municipio,
    telefono:          (team as any).telefono,
    sitioWeb:          (team as any).sitioWeb,
    emailFacturacion:  (team as any).emailFacturacion,
    colorPrimario:     (team as any).colorPrimario ?? '#1e40af',
    logo:              (team as any).logo,
    firma:             (team as any).firma,
    // Token de enrutamiento DGII — va en la URL que el cliente copia al portal
    dgiiRoutingToken:  team.dgiiRoutingToken,
    // Recargo por mora (cobranza)
    recargoMoraActivo:     team.recargoMoraActivo,
    recargoMoraPorcentaje: team.recargoMoraPorcentaje,
    recargoMoraDiasGracia: team.recargoMoraDiasGracia,
    // Módulo caja
    cajaHabilitada:        team.cajaHabilitada,
    // Módulo POS
    posHabilitado:         team.posHabilitado,
    posEscolarHabilitado:  team.posEscolarHabilitado,
    plazoPagoDefaultDias:  team.plazoPagoDefaultDias,
    // Métodos que obligan emisión a la DGII (bloquean borrador)
    metodosObligaDgii:     (team.metodosObligaDgii as string[] | null) ?? [],
    // Rol del usuario en este team (para gating en el cliente)
    role:              member?.role ?? null,
  });
}

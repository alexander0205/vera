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
import { getTeamModules } from '@/lib/auth/modules';
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
  recargoMoraModo:       z.enum(['porcentaje', 'fijo']).optional(),
  recargoMoraMontoCents: z.number().int().min(0).max(100_000_00).optional(),
  // 0 = una sola vez; si no, cada cuántos días se recobra (tope 1 año).
  recargoMoraPeriodicidadDias: z.number().int().min(0).max(365).optional(),
  recargoMoraCompuesta:  z.boolean().optional(),
  // Tope de mora acumulada como % del documento, en bps. 0 = sin tope.
  recargoMoraTopeBps:    z.number().int().min(0).max(100_000).optional(),
  recargoMoraMaxPeriodos: z.number().int().min(0).max(120).optional(),
  // Alerta double-check del método de pago (toggle por-empresa)
  alertaMetodoPagoActivo: z.boolean().optional(),
  // Módulo cuadre de caja
  cajaHabilitada:        z.boolean().optional(),
  // Límite de duración del turno (horas). null = sin límite.
  cajaLimiteHoras:       z.number().int().min(1).max(24).nullable().optional(),
  // Minutos antes del límite en que aparece el contador y empiezan los avisos.
  cajaAvisoMinutos:      z.number().int().min(5).max(240).optional(),
  // Horas de gracia tras el límite antes de bloquear. null/0 = nunca bloquea.
  cajaGraciaHoras:       z.number().int().min(0).max(12).nullable().optional(),
  // Módulo punto de venta (POS)
  posHabilitado:         z.boolean().optional(),
  posEscolarHabilitado:  z.boolean().optional(),
  // Plazo de pago por defecto. null = de contado; N = crédito a N días.
  plazoPagoDefaultDias:  z.number().int().min(1).max(365).nullable().optional(),
  // Métodos de pago que obligan emisión a la DGII (no permiten borrador).
  metodosObligaDgii:     z.array(z.enum(METODO_PAGO_VALUES)).optional(),
  // Métodos de pago que exigen adjuntar el comprobante al cobrar.
  metodosExigeComprobante: z.array(z.enum(METODO_PAGO_VALUES)).optional(),
  // Términos y condiciones que se precargan en cada comprobante nuevo.
  terminosCondicionesDefault: z.string().max(2000).nullable().optional(),
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
    ...(data.recargoMoraModo       !== undefined && { recargoMoraModo: data.recargoMoraModo }),
    ...(data.recargoMoraMontoCents !== undefined && { recargoMoraMontoCents: data.recargoMoraMontoCents }),
    ...(data.recargoMoraPeriodicidadDias !== undefined && { recargoMoraPeriodicidadDias: data.recargoMoraPeriodicidadDias }),
    ...(data.recargoMoraCompuesta  !== undefined && { recargoMoraCompuesta: data.recargoMoraCompuesta }),
    ...(data.recargoMoraTopeBps    !== undefined && { recargoMoraTopeBps: data.recargoMoraTopeBps }),
    ...(data.recargoMoraMaxPeriodos !== undefined && { recargoMoraMaxPeriodos: data.recargoMoraMaxPeriodos }),
    ...(data.alertaMetodoPagoActivo !== undefined && { alertaMetodoPagoActivo: data.alertaMetodoPagoActivo }),
    // Módulo caja
    ...(data.cajaHabilitada !== undefined && { cajaHabilitada: data.cajaHabilitada }),
    ...(data.cajaLimiteHoras  !== undefined && { cajaLimiteHoras: data.cajaLimiteHoras }),
    ...(data.cajaAvisoMinutos !== undefined && { cajaAvisoMinutos: data.cajaAvisoMinutos }),
    ...(data.cajaGraciaHoras  !== undefined && { cajaGraciaHoras: data.cajaGraciaHoras }),
    // Módulo POS
    ...(data.posHabilitado        !== undefined && { posHabilitado: data.posHabilitado }),
    ...(data.posEscolarHabilitado !== undefined && { posEscolarHabilitado: data.posEscolarHabilitado }),
    ...(data.plazoPagoDefaultDias  !== undefined && { plazoPagoDefaultDias: data.plazoPagoDefaultDias }),
    ...(data.metodosObligaDgii     !== undefined && { metodosObligaDgii: data.metodosObligaDgii }),
    ...(data.metodosExigeComprobante !== undefined && { metodosExigeComprobante: data.metodosExigeComprobante }),
    // Texto vacío = sin plantilla; se guarda como NULL para no precargar comillas sueltas.
    ...(data.terminosCondicionesDefault !== undefined && {
      terminosCondicionesDefault: data.terminosCondicionesDefault?.trim() || null,
    }),
    updatedAt: new Date(),
  }).where(eq(teams.id, teamId));

  // Sync legacy → módulos: el toggle self-service de POS también actualiza
  // modulosHabilitados (fuente que lee lib/auth/modules.ts) durante la
  // transición. Cuando el billing por módulo mande, este toggle desaparece.
  if (data.posHabilitado !== undefined) {
    const [t] = await db.select({ mods: teams.modulosHabilitados }).from(teams).where(eq(teams.id, teamId)).limit(1);
    const current = Array.isArray(t?.mods) ? (t!.mods as string[]) : [];
    const next = data.posHabilitado
      ? Array.from(new Set([...current, 'pos']))
      : current.filter(m => m !== 'pos');
    await db.update(teams).set({ modulosHabilitados: next }).where(eq(teams.id, teamId));
  }

  return NextResponse.json({ ok: true });
}

export async function GET(_req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const [[team], [member], modulosEfectivos] = await Promise.all([
    db.select().from(teams).where(eq(teams.id, teamId)).limit(1),
    db.select({ role: teamMembers.role }).from(teamMembers)
      .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
      .limit(1),
    // El toggle POS de esta pantalla lee la columna legacy `pos_habilitado`, que
    // el onboarding nunca escribe: cuando el plan elegido ya incluye POS el
    // acceso a /pos sale de `getTeamModules` (plan → módulos), no de esa columna,
    // así que el toggle salía apagado con el módulo activo. Reflejar el estado
    // efectivo: encendido si lo enciende la columna legacy O el plan.
    getTeamModules(teamId),
  ]);
  const posEfectivo = team.posHabilitado || modulosEfectivos.includes('pos');

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
    recargoMoraModo:       team.recargoMoraModo,
    recargoMoraMontoCents: team.recargoMoraMontoCents,
    recargoMoraPeriodicidadDias: team.recargoMoraPeriodicidadDias,
    recargoMoraCompuesta:  team.recargoMoraCompuesta,
    recargoMoraTopeBps:    team.recargoMoraTopeBps,
    recargoMoraMaxPeriodos: team.recargoMoraMaxPeriodos,
    // Alerta double-check del método de pago
    alertaMetodoPagoActivo: team.alertaMetodoPagoActivo,
    // Módulo caja
    cajaHabilitada:        team.cajaHabilitada,
    cajaLimiteHoras:       team.cajaLimiteHoras,
    cajaAvisoMinutos:      team.cajaAvisoMinutos,
    cajaGraciaHoras:       team.cajaGraciaHoras,
    // Módulo POS — estado efectivo (columna legacy o módulo del plan)
    posHabilitado:         posEfectivo,
    // ¿Tiene la empresa el módulo POS? Es lo que decide si la tarjeta POS de la
    // configuración se muestra: un plan sin POS no debe ver ese interruptor.
    posDisponible:         posEfectivo,
    posEscolarHabilitado:  team.posEscolarHabilitado,
    plazoPagoDefaultDias:  team.plazoPagoDefaultDias,
    // Métodos que obligan emisión a la DGII (bloquean borrador)
    metodosObligaDgii:     (team.metodosObligaDgii as string[] | null) ?? [],
    // Métodos que exigen comprobante adjunto al registrar el cobro
    metodosExigeComprobante: (team.metodosExigeComprobante as string[] | null) ?? [],
    // Plantilla de términos y condiciones para comprobantes nuevos
    terminosCondicionesDefault: team.terminosCondicionesDefault ?? '',
    // Rol del usuario en este team (para gating en el cliente)
    role:              member?.role ?? null,
  });
}

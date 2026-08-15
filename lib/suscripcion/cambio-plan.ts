/**
 * Qué se rompe si esta empresa se cambia a ese plan.
 *
 * Stripe acepta cualquier cambio de precio sin preguntar: para él son dos
 * números. Lo que no sabe es que el colegio que baja de tramo tiene 442
 * estudiantes contra un tope de 300, o que apagarle el POS deja un turno de
 * caja abierto con dinero contado a medias.
 *
 * Dos gravedades y no una:
 *  · BLOQUEA — el cambio dejaría datos huérfanos o una operación a medio
 *    hacer. Hay que resolverlo antes.
 *  · AVISA   — el cambio es válido pero pierde algo que conviene saber. Se le
 *    muestra y sigue.
 *
 * La diferencia importa: bloquear de más convierte cada bajada en una llamada
 * a soporte, y avisar de menos convierte cada bajada en una sorpresa el lunes
 * por la mañana.
 */

import 'server-only';
import { and, count, eq, gte, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarEstudiantes,
  cajaTurnos,
  ecfDocuments,
  facturasRecurrentes,
  teamMembers,
} from '@/lib/db/schema';
import { getPlan, type PlanDef } from '@/lib/config/plans';
import { MODULES_BASE, MODULE_LABELS, type ModuleKey } from '@/lib/config/modules';
import {
  CAMBIO_PLAN,
  type MotivoCambio, type NivelDeCambio, type RiesgoDeCambio,
} from '@/lib/config/suscripcion';

// Los tipos viven en lib/config/suscripcion (client-safe) porque la pantalla de
// planes también los necesita y este archivo es server-only.
export type { MotivoCambio, NivelDeCambio, RiesgoDeCambio };

export interface Veredicto {
  /** ¿Se puede proceder? False solo si hay al menos un bloqueo. */
  permitido: boolean;
  /** ¿Hace falta que confirme explícitamente? */
  requiereConfirmacion: boolean;
  bloqueos: MotivoCambio[];
  avisos: MotivoCambio[];
  /** Módulos que se pierden con el cambio. Vacío si no pierde ninguno. */
  modulosQueSePierden: ModuleKey[];
}

/** Módulos del plan A que no están en el plan B. Los base nunca se pierden. */
function modulosPerdidos(actual: PlanDef, nuevo: PlanDef): ModuleKey[] {
  const base = new Set<ModuleKey>(MODULES_BASE);
  const destino = new Set(nuevo.modulos);
  return actual.modulos.filter(m => !destino.has(m) && !base.has(m));
}

/** Primer instante del mes en curso. */
function inicioDelMes(ahora = new Date()): Date {
  return new Date(ahora.getFullYear(), ahora.getMonth(), 1);
}

/**
 * ¿El tope B es más estrecho que el A? Con la convención -1 = ilimitado.
 *
 * Sin esto, subir de Emprendedor a Negocio pediría confirmación por «tienes
 * recurrentes activas» — un aviso cierto pero irrelevante cuando el cupo
 * SUBE. Solo se avisa de lo que de verdad se estrecha.
 */
function seEstrecha(actual: number, nuevo: number): boolean {
  if (nuevo < 0) return false;   // el destino es ilimitado: nunca aprieta
  if (actual < 0) return true;   // venía de ilimitado y ahora hay tope
  return nuevo < actual;
}

/**
 * @param adicionalesActuales Los que ya tiene contratados. Un colegio que baja
 *        a la línea e-CF conserva el POS solo si lo compra aparte — en su
 *        tramo venía incluido y por eso no figura como adicional.
 */
export async function validarCambioDePlan(
  teamId: number,
  planActualKey: string | null | undefined,
  planNuevoKey: string,
  adicionalesActuales: string[] = [],
): Promise<Veredicto> {
  const actual = getPlan(planActualKey);
  const nuevo  = getPlan(planNuevoKey);

  const bloqueos: MotivoCambio[] = [];
  const avisos:   MotivoCambio[] = [];

  // Los adicionales contratados viajan con el cliente: si paga el POS aparte,
  // no lo pierde por cambiar de plan.
  const conservaPorAdicional = new Set<ModuleKey>(
    adicionalesActuales.includes('pos') ? ['pos'] : [],
  );
  const perdidos = modulosPerdidos(actual, nuevo)
    .filter(m => !conservaPorAdicional.has(m));

  // ── Cambio de familia ─────────────────────────────────────────────────────
  //
  // El bloqueo es DIRECCIONAL, y antes no lo era. `permiteCambiarDeFamilia`
  // era un booleano que cerraba los dos sentidos, y solo uno es peligroso:
  //
  //   colegio → e-CF   se apaga el módulo escolar CON LOS ESTUDIANTES DENTRO,
  //                    sus cuentas por cobrar y sus avisos. Eso no se hace con
  //                    un botón.
  //   e-CF → colegio   se GANA el módulo escolar y el POS de la cafetería. No
  //                    se pierde nada: el tramo lo marcan los estudiantes, y
  //                    quien viene de e-CF tiene cero.
  //
  // Cerrar los dos dejaba a un colegio que factura con nosotros sin forma de
  // contratar el producto para colegios desde su propia pantalla: veía el plan
  // marcado «No disponible» y ahí se acababa. `familiasOfrecibles()` en
  // plans.ts ya describía esta asimetría; esto es la otra mitad, que faltaba.
  const bajaDeColegio = actual.familia === 'colegio' && nuevo.familia !== 'colegio';
  if (actual.familia !== nuevo.familia && bajaDeColegio && !CAMBIO_PLAN.permiteCambiarDeFamilia) {
    bloqueos.push({
      gravedad: 'bloquea',
      clave: 'cambio-de-familia',
      mensaje: `No se puede pasar de ${actual.familia === 'colegio' ? 'un plan de colegio' : 'un plan de facturación'} a ${nuevo.familia === 'colegio' ? 'uno de colegio' : 'uno de facturación'} por autoservicio.`,
      comoResolver: 'Escríbenos y lo hacemos contigo: hay que mover los datos, no solo el precio.',
    });
  }

  // ── Estudiantes por encima del tramo ──────────────────────────────────────
  // Solo cuando el destino TIENE tope: al pasar a un plan de e-CF el tope es
  // -1 y quien manda es la pérdida del módulo, que se evalúa más abajo.
  if (nuevo.limits.estudiantes >= 0) {
    const [fila] = await db
      .select({ n: count() })
      .from(adminEscolarEstudiantes)
      .where(and(
        eq(adminEscolarEstudiantes.teamId, teamId),
        eq(adminEscolarEstudiantes.estado, 'activo'),
      ));
    const activos = fila?.n ?? 0;

    if (activos > nuevo.limits.estudiantes) {
      bloqueos.push({
        gravedad: 'bloquea',
        clave: 'estudiantes-sobre-el-tramo',
        mensaje: `Tienes ${activos} estudiantes activos y el tramo ${nuevo.name} llega hasta ${nuevo.limits.estudiantes}.`,
        comoResolver: `Da de baja a los que ya no estén, o quédate en ${actual.name}.`,
      });
    }
  }

  // ── Módulos que se pierden, y si tienen algo dentro ───────────────────────
  for (const mod of perdidos) {
    const habitantes = await datosDentroDelModulo(teamId, mod);
    if (habitantes > 0) {
      bloqueos.push({
        gravedad: 'bloquea',
        clave: `modulo-con-datos:${mod}`,
        mensaje: `El plan ${nuevo.name} no incluye ${MODULE_LABELS[mod]}, y ahí tienes ${habitantes} ${mod === 'escolar' ? 'estudiantes' : 'registros'}.`,
        comoResolver: mod === 'pos'
          ? 'Puedes contratar el Punto de Venta como adicional y conservarlo.'
          : 'Escríbenos para mover esa información antes de bajar de plan.',
      });
    } else {
      avisos.push({
        gravedad: 'avisa',
        clave: `modulo-se-apaga:${mod}`,
        mensaje: `Perderás el acceso a ${MODULE_LABELS[mod]}.`,
        comoResolver: null,
      });
    }
  }

  // ── Turno de caja abierto ─────────────────────────────────────────────────
  // Solo si se pierde el POS. Apagar el módulo con un turno vivo deja dinero
  // contado a medias y sin forma de cuadrarlo: el cierre necesita la pantalla
  // que el cambio de plan se llevaría.
  if (perdidos.includes('pos')) {
    const [fila] = await db
      .select({ n: count() })
      .from(cajaTurnos)
      .where(and(
        eq(cajaTurnos.teamId, teamId),
        ne(cajaTurnos.estado, 'CERRADO'),
      ));
    if ((fila?.n ?? 0) > 0) {
      bloqueos.push({
        gravedad: 'bloquea',
        clave: 'turno-de-caja-abierto',
        mensaje: `Hay ${fila!.n} ${fila!.n === 1 ? 'turno de caja abierto' : 'turnos de caja abiertos'}.`,
        comoResolver: 'Cierra los turnos y vuelve a intentarlo.',
      });
    }
  }

  // ── Usuarios de más ───────────────────────────────────────────────────────
  // Avisa, no bloquea: la regla del negocio es que a nadie se le expulsa por
  // un cambio de plan. Se quedan los que están y no se puede agregar más.
  if (seEstrecha(actual.limits.users, nuevo.limits.users)) {
    const [fila] = await db
      .select({ n: count() })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId));
    const miembros = fila?.n ?? 0;

    if (miembros > nuevo.limits.users) {
      avisos.push({
        gravedad: 'avisa',
        clave: 'usuarios-de-mas',
        mensaje: `Tienes ${miembros} usuarios y ${nuevo.name} incluye ${nuevo.limits.users}. Nadie pierde el acceso, pero no podrás agregar más hasta bajar de ${nuevo.limits.users}.`,
        comoResolver: null,
      });
    }
  }

  // ── Comprobantes ya emitidos este mes ─────────────────────────────────────
  // Si ya emitió más de lo que el plan nuevo permite, el mes en que entre el
  // cambio arranca con el cupo agotado. Vale la pena decirlo antes.
  if (seEstrecha(actual.limits.docs, nuevo.limits.docs)) {
    const [fila] = await db
      .select({ n: count() })
      .from(ecfDocuments)
      .where(and(
        eq(ecfDocuments.teamId, teamId),
        gte(ecfDocuments.createdAt, inicioDelMes()),
        sql`${ecfDocuments.estado} != 'BORRADOR'`,
      ));
    const emitidos = fila?.n ?? 0;

    if (emitidos > nuevo.limits.docs) {
      avisos.push({
        gravedad: 'avisa',
        clave: 'comprobantes-sobre-el-tope',
        mensaje: `Este mes llevas ${emitidos} comprobantes y ${nuevo.name} incluye ${nuevo.limits.docs} al mes.`,
        comoResolver: null,
      });
    }
  }

  // ── Recurrentes activas ───────────────────────────────────────────────────
  // Emiten solas todos los meses. Con un tope menor, las de fin de mes se
  // quedan sin poder salir y el colegio se entera cuando el padre reclama.
  if (seEstrecha(actual.limits.docs, nuevo.limits.docs)) {
    const [fila] = await db
      .select({ n: count() })
      .from(facturasRecurrentes)
      .where(and(
        eq(facturasRecurrentes.teamId, teamId),
        eq(facturasRecurrentes.estado, 'activa'),
      ));
    if ((fila?.n ?? 0) > 0) {
      avisos.push({
        gravedad: 'avisa',
        clave: 'recurrentes-activas',
        mensaje: `Tienes ${fila!.n} facturas recurrentes activas que seguirán emitiéndose y consumirán tu cupo mensual.`,
        comoResolver: null,
      });
    }
  }

  return {
    permitido: bloqueos.length === 0,
    requiereConfirmacion:
      CAMBIO_PLAN.confirmacionCuandoBloquea && (bloqueos.length > 0 || avisos.length > 0),
    bloqueos,
    avisos,
    modulosQueSePierden: perdidos,
  };
}

/**
 * Cuántos registros vivos hay dentro de un módulo.
 *
 * Es la pregunta «¿apagar esto deja algo huérfano?». Cuenta la entidad que
 * define al módulo, no todo lo que cuelga de él: en escolar son los
 * estudiantes activos, en el POS las terminales configuradas. Un módulo
 * encendido y vacío se apaga sin drama.
 */
async function datosDentroDelModulo(teamId: number, mod: ModuleKey): Promise<number> {
  if (mod === 'escolar') {
    const [fila] = await db
      .select({ n: count() })
      .from(adminEscolarEstudiantes)
      .where(and(
        eq(adminEscolarEstudiantes.teamId, teamId),
        eq(adminEscolarEstudiantes.estado, 'activo'),
      ));
    return fila?.n ?? 0;
  }

  if (mod === 'pos') {
    // Las terminales y no las ventas: las ventas ya son facturas y siguen
    // consultándose desde Facturación aunque el POS se apague. Lo que se
    // quedaría sin casa es la configuración de cada caja.
    const { posTerminales } = await import('@/lib/db/schema');
    const [fila] = await db
      .select({ n: count() })
      .from(posTerminales)
      .where(eq(posTerminales.teamId, teamId));
    return fila?.n ?? 0;
  }

  return 0;
}

// ─── El riesgo, para pintarlo ANTES del clic ─────────────────────────────────

/**
 * El riesgo de cambiarse a CADA plan que se le ofrece, calculado de una vez.
 *
 * Esto existía ya, pero solo se consultaba al pulsar «Contratar»: el usuario
 * descubría que perdería 442 estudiantes cuando ya había decidido. Calcularlo
 * para todos los planes de la lista permite enseñarlo en la propia tarjeta —
 * un chip y una línea— y dejar el detalle largo para el diálogo.
 *
 * Es una consulta por plan y son cuatro u ocho. Se lanzan a la vez y cada una
 * son unos pocos COUNT sobre índices; es más barato que la ida y vuelta que se
 * ahorraba antes haciéndolo tarde.
 */
export async function riesgosDeCambio(
  teamId: number,
  planActualKey: string | null | undefined,
  planesDestino: readonly PlanDef[],
  adicionalesActuales: string[] = [],
  /**
   * ¿Marcar como «actual» el plan que coincide en clave con el contratado?
   *
   * Falso cuando los destinos pertenecen a OTRA línea comercial. «Negocio» sin
   * el Punto de Venta comparte clave con «Negocio» con él —son el mismo plan
   * del catálogo— pero no son lo mismo para el cliente: US$19 contra US$28 y
   * un módulo de diferencia. Pintar ahí «Plan actual» escondería justo lo que
   * cambiaría si se pasa a esa línea.
   */
  marcarActual = true,
): Promise<Record<string, RiesgoDeCambio>> {
  const actual = getPlan(planActualKey);

  const veredictos = await Promise.all(
    planesDestino.map(async p => {
      if (marcarActual && p.key === actual.key) return [p.key, null] as const;
      return [p.key, await validarCambioDePlan(teamId, planActualKey, p.key, adicionalesActuales)] as const;
    }),
  );

  const salida: Record<string, RiesgoDeCambio> = {};
  for (const [clave, v] of veredictos) {
    if (!v) {
      salida[clave] = {
        nivel: 'actual', resumen: 'Es lo que tienes contratado hoy.',
        bloqueos: [], avisos: [], modulosQueSePierden: [],
      };
      continue;
    }
    // El resumen es el motivo MÁS GRAVE, no una lista. En una tarjeta solo
    // cabe una línea, y si se resume «3 avisos» el usuario tiene que abrir para
    // saber si le importa — que es justo el clic que esto viene a evitar.
    const peor = v.bloqueos[0] ?? v.avisos[0] ?? null;
    salida[clave] = {
      nivel: v.bloqueos.length > 0 ? 'bloquea' : v.avisos.length > 0 ? 'avisa' : 'ok',
      resumen: peor?.mensaje ?? 'Solo sumas. No se pierde nada.',
      bloqueos: v.bloqueos,
      avisos: v.avisos,
      modulosQueSePierden: v.modulosQueSePierden,
    };
  }
  return salida;
}

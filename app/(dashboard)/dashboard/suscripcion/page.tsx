/**
 * Mi suscripción — lo que el cliente ve de su plan, y lo que ya le cobramos.
 *
 * Dos vistas en una ruta: «Suscripción» (plan, consumo, cambio de plan) e
 * «Historial de pagos». Van por `?vista=` y no por estado de cliente para que
 * el enlace se pueda compartir, el botón de atrás funcione y la tabla de
 * cobros no obligue a mandar la pantalla entera al navegador.
 *
 * TODO sale del catálogo (lib/config/plans.ts) y del estado real de la
 * suscripción. Nada escrito a mano: la versión de hace dos meses tenía la
 * comparativa y la lista de planes en literales y se quedó ofreciendo «Starter
 * $15» y «Business $35» —planes que ya no existían— mientras marcaba como
 * no-pagador a cualquiera con un plan de verdad.
 *
 * Es una pantalla de AJUSTES, no de venta. Trae el lenguaje visual de
 * zero.com.do/precios —las tarjetas se reconocen, el lazo ∞ significa lo
 * mismo— pero sin el peso de portada ni el «MÁS ELEGIDO»: quien entra aquí ya
 * compró.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { count, eq, and, gte } from 'drizzle-orm';

import { BILLING_ENABLED } from '@/lib/config/billing';
import { enlaceWhatsapp, enlaceCorreo } from '@/lib/config/soporte';
import {
  getTeamIdForUser, getTeamProfile, getMonthlyEcfCount, getPlanLimit,
} from '@/lib/db/queries';
import {
  getPlan, PLANS, FREE_PLAN, getPlanPriceId, getPlanUserLimit, planesDeFamilia, precioTotal,
  ADDONS, addonIncluido, familiasOfrecibles, limiteTexto,
  LINEAS_PRODUCTO, type PlanDef, type LineaProducto, type FamiliaPlan, type AddonDef,
} from '@/lib/config/plans';
import {
  evaluarLimite, SOLO_LECTURA, MORA, PRUEBA,
  type RiesgoDeCambio, type MotivoCambio,
} from '@/lib/config/suscripcion';
import { getSuscripcion } from '@/lib/suscripcion/queries';
import { riesgosDeCambio } from '@/lib/suscripcion/cambio-plan';
import { cuotaAvisos } from '@/lib/suscripcion/cuota-avisos';
import { estadoDelTramo } from '@/lib/suscripcion/tramo';
import { checkoutAction, empezarPruebaAction } from '@/lib/payments/actions';
import { stripe, tieneMetodoDePago, historialDeCobros } from '@/lib/payments/stripe';
import { ecfDocuments, teamMembers } from '@/lib/db/schema';
import { db } from '@/lib/db/drizzle';
import { TIPOS_ECF } from '@/lib/ecf/types';

import { ChangePlan, type LineaVista, type AvisoLinea } from './_change-plan';
import { Historial, type CobroVista, type TarjetaResumen } from './_historial';
import {
  BannerEstado, TarjetaPlan, Comparativa, UsoDelMes, BloqueCobro,
  type DatosBanner, type Medidor,
} from './_piezas';
import {
  AZUL, NAVY, GRIS, ROJO, AMBAR, VERDE, TINTA, BORDE, usd, numero, fechaLarga, fechaCorta,
} from './_paleta';

export default async function SuscripcionPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  // Producto en desarrollo: planes y suscripción no se le muestran al usuario;
  // los módulos y límites los administramos desde /admin. Ver lib/config/billing.
  if (!BILLING_ENABLED) notFound();

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const esHistorial = (await searchParams).vista === 'historial';

  const ahora = new Date();
  const inicioDeMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  const [team, suscripcion] = await Promise.all([
    getTeamProfile(teamId),
    getSuscripcion(teamId),
  ]);
  if (!team) redirect('/sign-in');

  // Nunca tuvo suscripción. A esta empresa NO se le enseña «tu plan» —no lo
  // tiene, aunque la columna cargue un nombre viejo—: se le enseña el selector
  // y elegir le abre la prueba de su familia, sin tarjeta.
  const sinPlan = suscripcion.estado === 'sin-plan';

  // Sin plan, TODO se calcula desde cero. Leer aquí `team.planName` es dejar
  // que una columna sembrada a mano marque «Plan actual» en la rejilla y cuelgue
  // «Tu línea» de una pestaña, para una empresa cuyo estado dice que no tiene
  // nada. La columna es una etiqueta en caché; la verdad es la suscripción.
  const planDef     = sinPlan ? FREE_PLAN : getPlan(team.planName);
  const adicionales = sinPlan ? [] : adicionalesDe(team);
  const linea       = lineaDe(planDef, adicionales);
  const total       = precioTotal(planDef.key, adicionales);

  const tieneCliente     = Boolean(team.stripeCustomerId);
  const tieneSuscripcion = Boolean(team.stripeSubscriptionId);
  // `sin-billing` dentro de esta pantalla solo puede ser una cuenta interna: con
  // el billing apagado la página ya devolvió 404 arriba.
  const esInterna = suscripcion.estado === 'sin-billing';

  // `null` = no se pudo preguntar a Stripe. Se trata como «no tiene», que es el
  // lado seguro: enseñar el botón de más se arregla con un clic; esconderlo deja
  // a alguien sin saber cómo pagar.
  const tieneTarjeta = (await tieneMetodoDePago(team.stripeCustomerId)) === true;

  const cabecera = (
    <Cabecera esHistorial={esHistorial} />
  );

  // ── Historial de pagos ────────────────────────────────────────────────────
  // Se separa entero: no tiene sentido pagar los ocho veredictos de cambio de
  // plan ni los COUNT de consumo para pintar una tabla de facturas.
  if (esHistorial) {
    const cobros = await historialDeCobros(team.stripeCustomerId);
    return (
      <Contenedor>
        {cabecera}
        <Historial
          cobros={cobros.map(vistaDeCobro)}
          resumen={resumenDeCobros(cobros, {
            esInterna, tieneSuscripcion, total,
            periodoFin: team.periodoFin ?? null,
            anio: ahora.getFullYear(),
          })}
          sinCliente={!tieneCliente}
        />
      </Contenedor>
    );
  }

  // ── Suscripción ───────────────────────────────────────────────────────────

  const planesOfrecidos = planesDeFamilia(planDef.familia);

  const [usadoEsteMes, usoPorTipo, miembros, tramo, lineas, pendingPlan] = await Promise.all([
    getMonthlyEcfCount(teamId),
    db
      .select({ tipoEcf: ecfDocuments.tipoEcf, total: count() })
      .from(ecfDocuments)
      .where(and(eq(ecfDocuments.teamId, teamId), gte(ecfDocuments.createdAt, inicioDeMes)))
      .groupBy(ecfDocuments.tipoEcf),
    db.select({ n: count() }).from(teamMembers).where(eq(teamMembers.teamId, teamId)),
    estadoDelTramo(teamId),
    // Sin plan no hay «tu línea»: FREE_PLAN cae en la familia e-CF y sin esto
    // la pestaña Zero ERP saldría marcada como suya sin haber contratado nada.
    construirLineas({ teamId, planDef, adicionales, lineaActual: sinPlan ? null : linea, tieneSuscripcion }),
    downgradeProgramado(team),
  ]);

  // Los avisos solo se consultan si el plan los tarifa: preguntar por ellos en
  // un plan de e-CF sería un COUNT sobre una tabla escolar que no le importa.
  const cuota = planDef.limits.whatsappMensajes >= 0 || planDef.limits.smsMensajes >= 0
    ? await cuotaAvisos(teamId)
    : null;

  // Price IDs para el cliente: las env vars solo se leen en el servidor.
  const priceIds = Object.fromEntries(PLANS.map(p => [p.key, getPlanPriceId(p.key)]));

  // El tope de comprobantes sale de `getPlanLimit`, la MISMA función que usa
  // /api/ecf/emitir para dejar pasar o no. Es lo que impide que la barra diga
  // «37 / 200» en una cuenta interna, donde esa función devuelve -1 y el
  // sistema no corta a nadie a los 200.
  const topeDocs = getPlanLimit(team.planName, team.subscriptionStatus);

  // POR QUÉ no hay tope, cuando no lo hay. Son cuatro motivos distintos y no
  // dan el mismo mensaje:
  //
  //  · interna       — `getPlanLimit` exime a las cuentas 'admin'.
  //  · prueba        — el tope que aplica es `trialDocs`, que es -1 en todos
  //                    los planes. Decir «sin tope en tu plan» aquí es falso:
  //                    Negocio sí tiene tope (200), y quien lo lea contrata
  //                    creyendo que sigue sin él.
  //  · solo lectura  — `getPlanLimit` sigue devolviendo -1 porque el estado de
  //                    Stripe sigue siendo 'trialing' aunque la prueba venciera.
  //                    No es un tope infinito: es que no puede emitir nada. El
  //                    corte lo hace el guard de escritura, no el tope.
  //  · plan sin tope — el único caso en que la palabra es literal.
  const enPrueba = suscripcion.estado === 'prueba' || suscripcion.estado === 'prueba-por-vencer';
  const soloLectura = !suscripcion.puedeEscribir;
  const sinTopePorque = soloLectura
    ? 'Tu cuenta no puede emitir comprobantes nuevos ahora mismo.'
    : esInterna
      ? 'Tu cuenta es interna: no se te aplica tope de comprobantes.'
      : enPrueba
        ? 'Durante la prueba no hay tope. Al contratar aplica el de tu plan.'
        : 'Sin tope en tu plan.';

  const medidores = construirMedidores({
    planDef, topeDocs, sinTopePorque, soloLectura,
    docs: usadoEsteMes,
    usuarios: miembros[0]?.n ?? 0,
    estudiantes: tramo?.estudiantes ?? 0,
    whatsapp: cuota?.porCanal.whatsapp.usado ?? 0,
    sms: cuota?.porCanal.sms.usado ?? 0,
  });

  const desglose = [
    { concepto: planDef.name, monto: planDef.price },
    ...ADDONS
      .filter(a => adicionales.includes(a.key) && !addonIncluido(planDef.key, a.key))
      .map(a => ({ concepto: a.name, monto: a.price })),
  ];

  return (
    <Contenedor>
      {cabecera}

      <BannerEstado datos={datosDelBanner({ suscripcion, team, tieneTarjeta, tieneCliente, tieneSuscripcion, total, esInterna })} />

      {/* Sin plan no hay tarjeta «TU PLAN»: pintarla con lo que diga la
          columna es enseñar un contrato que no existe — fue exactamente lo que
          hizo a esta pantalla decir «Ilimitado US$74» y «no tienes plan» a la
          vez. La pantalla ES el selector. */}
      {!sinPlan && (
        <TarjetaPlan
          plan={planDef}
          linea={linea}
          suscripcion={suscripcion}
          total={total}
          desglose={desglose}
          medidores={medidores}
          alerta={alertaDeTopes({ planDef, usado: usadoEsteMes, tope: topeDocs, tramo })}
          notaDeCobro={notaDeCobro({ suscripcion, team, tieneTarjeta, tieneSuscripcion, esInterna })}
        />
      )}

      <Box id="planes">
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
          <Typography component="h2" sx={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '-.2px', color: TINTA }}>
            {sinPlan ? 'Elige tu plan' : tieneSuscripcion ? 'Cambiar de plan' : 'Planes disponibles'}
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: GRIS }}>
            {sinPlan
              ? `Todos empiezan con prueba gratis: ${PRUEBA.diasPorFamilia.ecf} días en facturación, ${PRUEBA.diasPorFamilia.colegio} en colegios. Sin tarjeta.`
              : planDef.familia === 'colegio'
                ? 'El tramo lo define la cantidad de estudiantes activos.'
                : 'Cada tarjeta dice lo que te pasa a ti antes de que la toques.'}
          </Typography>
        </Box>

        <ChangePlan
          lineas={lineas}
          planActual={planDef}
          priceIds={priceIds}
          pendingPlan={pendingPlan}
          tieneSuscripcion={tieneSuscripcion}
          checkoutAction={sinPlan ? empezarPruebaAction : checkoutAction}
          pruebaPorFamilia={sinPlan ? PRUEBA.diasPorFamilia : null}
        />
      </Box>

      {/* La comparativa se queda en la línea CONTRATADA, no sigue al selector
          de arriba. Es la referencia contra la que el usuario mide: si cambiara
          con la pestaña, al volver de mirar los tramos de colegio ya no tendría
          contra qué comparar lo suyo. */}
      <Comparativa
        planes={planesOfrecidos}
        actual={planDef}
        precios={Object.fromEntries(planesOfrecidos.map(p => [p.key, precioTotal(p.key, adicionales)]))}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: sinPlan ? '1fr' : '1.15fr 1fr' }, gap: 2 }}>
        <UsoDelMes
          tipos={usoPorTipo.map(u => ({
            etiqueta: TIPOS_ECF[u.tipoEcf as keyof typeof TIPOS_ECF] ?? `Tipo ${u.tipoEcf}`,
            total: u.total,
          }))}
          pie={topeDocs < 0
            ? `${numero(usadoEsteMes)} ${usadoEsteMes === 1 ? 'comprobante emitido' : 'comprobantes emitidos'} este mes. ${sinTopePorque}`
            : `${numero(usadoEsteMes)} de ${numero(topeDocs)} comprobantes de tu plan. El contador vuelve a cero el día 1.`}
        />
        {/* Sin plan no hay bloque de cobro: no existe suscripción que cobrar
            ni tarjeta que mantener. Lo que le toca está arriba: elegir. */}
        {!sinPlan && (
          <BloqueCobro
            tieneTarjeta={tieneTarjeta}
            tieneCliente={tieneCliente}
            esInterna={esInterna}
            legal={esInterna
              ? 'Esta cuenta la administramos nosotros y no pasa por Stripe, así que no hay cobros ni método de pago que mantener.'
              : tieneSuscripcion
                ? 'Se cobra una vez al mes. Puedes cambiar o cancelar el plan cuando quieras; al cancelar conservas el acceso hasta el final del período ya pagado.'
                : 'Tu plan de hoy no tiene cobro automático. Al contratar uno, la facturación pasa a ser mensual por tarjeta.'}
          />
        )}
      </Box>
    </Contenedor>
  );
}

// ─── Armazón ─────────────────────────────────────────────────────────────────

function Contenedor({ children }: { children: React.ReactNode }) {
  // 980px y no 800: con cuatro tramos de colegio en una fila, a 800 cada
  // tarjeta se queda sin sitio para su línea de riesgo, que es lo que hace
  // útil la rejilla. Centrada, porque es una pantalla de ajustes.
  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 980, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {children}
    </Box>
  );
}

function Cabecera({ esHistorial }: { esHistorial: boolean }) {
  return (
    <Box>
      <Typography component="h1" sx={{ fontSize: '1.625rem', fontWeight: 700, letterSpacing: '-.4px', color: TINTA }}>
        {esHistorial ? 'Historial de pagos' : 'Suscripción'}
      </Typography>
      <Typography sx={{ color: GRIS, fontSize: '0.8125rem', mt: 0.5 }}>
        {esHistorial
          ? 'Todos los cobros de tu suscripción a Zero, tal como los registró Stripe.'
          : 'Tu plan, tu consumo del mes y tu facturación.'}
      </Typography>

      {/* Pestañas como enlaces de verdad, no `<Tabs>` de MUI.
          La vista vive en la URL: se puede compartir y el botón de atrás del
          navegador hace lo que se espera. `Tabs` habría obligado a un
          componente cliente entero —o a pasarle `component={Link}` desde el
          servidor, que Next rechaza— para pintar dos enlaces.

          Los href van RELATIVOS (solo query) a propósito: esta misma pantalla
          se sirve en /dashboard/suscripcion y en /cuenta/plan, y una ruta
          absoluta echaría al usuario del módulo en el que está. */}
      {/* Los estilos van en el contenedor y apuntan a `a`, no en cada enlace:
          `component={Link}` sobre un Box es pasarle una función a un componente
          cliente desde el servidor, y Next lo rechaza. */}
      <Box component="nav" sx={{
        display: 'flex', gap: 3, mt: 1.5, borderBottom: `1px solid ${BORDE}`,
        '& a': {
          display: 'flex', alignItems: 'center', height: 40, textDecoration: 'none',
          fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '.1px', color: GRIS,
          borderBottom: '2px solid transparent', mb: '-1px',
          '&:hover': { color: TINTA },
        },
        '& a[aria-current="page"]': { color: AZUL, borderBottomColor: AZUL },
      }}>
        <Link href="?vista=suscripcion" aria-current={esHistorial ? undefined : 'page'}>
          Suscripción
        </Link>
        <Link href="?vista=historial" aria-current={esHistorial ? 'page' : undefined}>
          Historial de pagos
        </Link>
      </Box>
    </Box>
  );
}

// ─── Catálogo → pantalla ─────────────────────────────────────────────────────

function adicionalesDe(team: { adicionales?: unknown }): string[] {
  return Array.isArray(team.adicionales)
    ? team.adicionales.filter((a): a is string => typeof a === 'string')
    : [];
}

/**
 * La línea comercial que le corresponde a este plan con sus adicionales.
 *
 * «Zero POS + ERP» no es una familia en los datos: es la familia `ecf` con el
 * adicional de POS sumado (ver LINEAS_PRODUCTO). De más adicionales a menos,
 * para que quien tenga el POS lea «Ilimitado · Zero POS + ERP» y no el «Zero
 * ERP» pelado, que también encaja pero describe menos de lo que paga.
 */
function lineaDe(plan: PlanDef, adicionales: string[]): LineaProducto | null {
  const tiene = (a: string) => addonIncluido(plan.key, a) || adicionales.includes(a);
  return [...LINEAS_PRODUCTO]
    .filter(l => l.familia === plan.familia)
    .sort((a, b) => b.addons.length - a.addons.length)
    .find(l => l.addons.every(tiene)) ?? null;
}

/**
 * Los medidores que tienen sentido para este plan.
 *
 * Comprobantes y usuarios van siempre —son las dos dimensiones que todo plan
 * tarifa— y el resto solo si el plan les pone precio: a una ferretería no le
 * importa un tope de estudiantes, y a un colegio no le importa un tope de
 * avisos que su tramo no limita.
 *
 * El tope de comprobantes llega de fuera y no de `planDef.limits.docs` a
 * propósito: quien decide de verdad es `getPlanLimit`, que exime a las cuentas
 * internas. Leer el catálogo aquí pintaría un tope que el sistema no aplica.
 */
function construirMedidores(d: {
  planDef: PlanDef;
  topeDocs: number;
  /** Qué se dice cuando `topeDocs` es -1. Lo decide quien sabe por qué. */
  sinTopePorque: string;
  /** La cuenta no puede crear nada. Ahí el ∞ mentiría. */
  soloLectura: boolean;
  docs: number; usuarios: number; estudiantes: number; whatsapp: number; sms: number;
}): Medidor[] {
  const L = d.planDef.limits;
  const topeUsuarios = getPlanUserLimit(d.planDef.key);

  const docs: Medidor = {
    clave: 'docs', etiqueta: 'Comprobantes este mes',
    usado: d.docs, tope: d.topeDocs,
    sinLazo: d.soloLectura,
    nota: d.topeDocs < 0
      ? d.sinTopePorque
      : d.soloLectura
        ? 'Tu cuenta no puede emitir comprobantes nuevos ahora mismo.'
        : d.docs >= d.topeDocs
          ? 'Llegaste al tope. Para seguir emitiendo este mes hay que subir de plan.'
          : `Quedan ${numero(d.topeDocs - d.docs)} este mes.`,
  };

  const usuarios: Medidor = {
    clave: 'usuarios', etiqueta: 'Usuarios',
    usado: d.usuarios, tope: topeUsuarios,
    // Nunca se expulsa a nadie por un cambio de plan: lo que se corta es
    // agregar. Ver puedeAgregarUsuario en lib/config/plans.ts.
    //
    // En solo lectura no se ofrece agregar: la API de invitaciones pasa por el
    // guard de escritura y devolvería 402. «Puedes agregar 7 más» junto a un
    // botón que rechaza es la pantalla prometiendo lo que el sistema niega.
    nota: d.soloLectura
      ? 'Tu cuenta no puede agregar usuarios ahora mismo.'
      : topeUsuarios < 0
        ? 'Sin tope en tu plan.'
        : d.usuarios >= topeUsuarios
          ? 'Para agregar más necesitas un plan mayor. Los actuales se quedan.'
          : `Puedes agregar ${numero(topeUsuarios - d.usuarios)} más.`,
  };

  const tarifados: Medidor[] = [
    {
      clave: 'estudiantes', etiqueta: 'Estudiantes activos',
      usado: d.estudiantes, tope: L.estudiantes,
      nota: 'El tramo se elige por cuántos estudiantes tienes.',
    },
    {
      clave: 'whatsapp', etiqueta: 'Avisos por WhatsApp',
      usado: d.whatsapp, tope: L.whatsappMensajes,
      nota: 'Se reinicia el día 1 de cada mes.',
    },
    {
      clave: 'sms', etiqueta: 'Avisos por SMS',
      usado: d.sms, tope: L.smsMensajes,
      nota: 'Se reinicia el día 1. El correo no tiene tope.',
    },
  ].filter(m => m.tope >= 0);

  return [...tarifados, docs, usuarios];
}

/** El siguiente plan con más cupo de comprobantes. null si ya está en el tope. */
function siguientePlan(actual: PlanDef): PlanDef | null {
  return planesDeFamilia(actual.familia).find(
    p => p.limits.docs < 0 || p.limits.docs > actual.limits.docs,
  ) ?? null;
}

/**
 * El tope que aprieta, si alguno aprieta.
 *
 * Uno solo, el más urgente: quedarse sin poder emitir es peor que crecer de
 * tramo, y dos franjas ámbar seguidas dejan de leerse como una advertencia.
 */
function alertaDeTopes(d: {
  planDef: PlanDef;
  usado: number;
  tope: number;
  tramo: { avisar: boolean; estudiantes: number; tope: number; mensaje: string | null } | null;
}): { titulo: string; texto: string } | null {
  const docs = evaluarLimite('docs', d.usado, d.tope, 0);
  if (docs.advertir) {
    const siguiente = siguientePlan(d.planDef);
    const lleno = d.usado >= d.tope;
    return {
      titulo: lleno
        ? `Llegaste a los ${numero(d.tope)} comprobantes de tu plan este mes`
        : `Llevas ${numero(d.usado)} de ${numero(d.tope)} comprobantes este mes`,
      texto: siguiente
        ? `Con ${siguiente.name} emites ${limiteTexto(siguiente.limits.docs)} al mes.${lleno ? '' : ' El contador vuelve a cero el día 1.'}`
        : 'Escríbenos para ajustar tu plan.',
    };
  }

  if (d.tramo?.avisar && d.tramo.mensaje) {
    return {
      titulo: `${numero(d.tramo.estudiantes)} de ${numero(d.tramo.tope)} estudiantes`,
      texto: d.tramo.mensaje,
    };
  }

  return null;
}

/** Cuándo y cómo se cobra, en una línea, junto al precio. */
function notaDeCobro(d: {
  suscripcion: { estado: string };
  team: { periodoFin?: Date | null; trialEnd?: Date | null };
  tieneTarjeta: boolean;
  tieneSuscripcion: boolean;
  esInterna: boolean;
}): string {
  if (d.esInterna) return 'Cuenta interna: no se cobra.';
  if (d.suscripcion.estado === 'mora') return 'El último cobro no pasó.';
  if (!d.tieneSuscripcion) return 'Sin cobro automático configurado.';
  if (!d.tieneTarjeta) return 'Falta el método de pago.';

  const cuando = d.suscripcion.estado === 'prueba' || d.suscripcion.estado === 'prueba-por-vencer'
    ? d.team.trialEnd
    : d.team.periodoFin;
  if (!cuando) return 'Se cobra una vez al mes.';

  const primero = d.suscripcion.estado.startsWith('prueba');
  return `${primero ? 'Primer cobro' : 'Próximo cobro'} el ${fechaLarga(cuando)}.`;
}

// ─── Banner ──────────────────────────────────────────────────────────────────

/**
 * Qué le toca leer a esta empresa arriba del todo.
 *
 * En los estados de corte (mora, solo lectura, cerrada, cancelación
 * programada) el texto ES `suscripcion.mensaje`: sale del mismo objeto que usa
 * el guard del servidor, así que lo que el cliente lee y lo que el sistema
 * hace no pueden contradecirse.
 *
 * Los estados de prueba son la excepción y se escriben aquí: `evaluarSuscripcion`
 * no sabe si hay tarjeta guardada, y le dice «agrega tu método de pago» a quien
 * ya lo hizo. Con ese dato delante se puede decir lo que de verdad va a pasar.
 */
function datosDelBanner(d: {
  suscripcion: {
    estado: string; diasRestantes: number | null; mensaje: string | null;
    cancelacionPendiente: boolean;
  };
  team: { trialEnd?: Date | null; periodoFin?: Date | null; morosoDesde?: Date | null };
  tieneTarjeta: boolean;
  tieneCliente: boolean;
  tieneSuscripcion: boolean;
  total: number;
  esInterna: boolean;
}): DatosBanner {
  const { suscripcion: s } = d;
  const dias = s.diasRestantes ?? 0;
  const plazo = (n: number) => (n === 1 ? '1 día' : `${n} días`);
  /** Al portal solo se puede mandar a quien tenga cliente en Stripe. */
  const alPortal = (texto: string) =>
    d.tieneCliente ? { texto, portal: true } : { texto: 'Ver los planes', portal: false, href: '#planes' };

  if (d.esInterna) {
    return {
      // «Acceso abierto» estaba mal, y el sitio donde iba lo empeoraba: la
      // `cifra` es el hueco de la cifra GRANDE —«12 días» en una prueba, la
      // fecha del corte en una mora—, así que una cuenta sin número acababa
      // con esas dos palabras solas a cuerpo de titular. Leído así no dice
      // «no te restringimos nada», dice «esta cuenta está abierta a
      // cualquiera», que es una frase de seguridad y da un susto que no toca.
      //
      // «No se te cobra» es el hecho, y es el único que el dueño de la cuenta
      // necesita de esta pantalla.
      etiqueta: 'Cuenta interna Zero', cifra: 'No se te cobra', pie: 'Esta cuenta no pasa por Stripe',
      color: NAVY, fondo: '#f7f9ff', borde: '#dce4fa',
      titulo: 'Esta cuenta no se cobra',
      // Lo del tope de comprobantes no es un detalle: `getPlanLimit` devuelve
      // -1 para las cuentas internas, así que /api/ecf/emitir no corta. El de
      // usuarios sí se aplica, porque `puedeAgregarUsuario` no mira el estado.
      texto: 'La marcamos como interna, por eso no ves estados de prueba ni de cobro. Tampoco se te aplica el tope de comprobantes del plan; el de usuarios sí.',
      cta: null,
    };
  }

  if (s.estado === 'prueba' || s.estado === 'prueba-por-vencer') {
    const urgente = s.estado === 'prueba-por-vencer';
    return {
      etiqueta: 'Prueba gratis', cifra: plazo(dias),
      pie: d.team.trialEnd ? `Termina el ${fechaLarga(d.team.trialEnd)}` : null,
      color: urgente ? AMBAR : NAVY,
      fondo: urgente ? '#fffaf0' : '#f7f9ff',
      borde: urgente ? '#f5e6c8' : '#dce4fa',
      titulo: d.tieneTarjeta
        ? 'Todo listo: al terminar, se cobra solo'
        : 'Cuando termine, la cuenta pasa a solo lectura',
      texto: d.tieneTarjeta
        ? `Al terminar la prueba se cobran ${usd(d.total)} y sigues sin interrupción. No tienes que hacer nada.`
        : `Podrás consultar y descargar todo lo emitido durante ${plazo(SOLO_LECTURA.diasTrasPrueba)} más, pero no emitir comprobantes nuevos ni cobrar en caja. Agrega una tarjeta y no se interrumpe nada.`,
      cta: d.tieneTarjeta ? alPortal('Tarjeta y facturas') : alPortal('Agregar método de pago'),
    };
  }

  if (s.estado === 'mora') {
    return {
      etiqueta: 'Pago pendiente', cifra: plazo(dias),
      pie: d.team.morosoDesde ? `En mora desde el ${fechaCorta(d.team.morosoDesde)}` : null,
      color: ROJO, fondo: '#fdf3f3', borde: '#f6dcdc',
      titulo: 'No pudimos cobrar tu suscripción',
      texto: s.mensaje ?? `Sigues emitiendo con normalidad durante la gracia de ${plazo(MORA.diasGracia)}. Después la cuenta pasa a solo lectura.`,
      cta: alPortal('Actualizar mi tarjeta'),
    };
  }

  if (s.estado === 'sin-plan') {
    return {
      // Sin rojo: no es un castigo ni una avería, es el primer paso. El rojo
      // se reserva para quien PERDIÓ algo (mora, solo lectura, cierre).
      etiqueta: 'Primer paso', cifra: 'Elige tu plan',
      pie: 'Prueba gratis, sin tarjeta',
      color: NAVY, fondo: '#f7f9ff', borde: '#dce4fa',
      titulo: 'Tu empresa aún no tiene un plan',
      texto: `Elige uno para empezar a emitir: ${PRUEBA.diasPorFamilia.ecf} días de prueba en facturación y ${PRUEBA.diasPorFamilia.colegio} en colegios. Todo lo que tu empresa ya tiene registrado se conserva tal cual.`,
      cta: { texto: 'Ver los planes', portal: false, href: '#planes' },
    };
  }

  if (s.estado === 'solo-lectura') {
    return {
      etiqueta: 'Cuenta limitada', cifra: 'Solo lectura',
      pie: s.diasRestantes ? `Quedan ${plazo(dias)} así` : null,
      color: ROJO, fondo: '#fdf3f3', borde: '#f6dcdc',
      titulo: 'No puedes emitir comprobantes ni cobrar en caja',
      texto: s.mensaje ?? 'Todo lo emitido sigue disponible para consultar y descargar.',
      cta: alPortal('Reactivar mi cuenta'),
    };
  }

  if (s.estado === 'cerrada') {
    return {
      etiqueta: 'Sin acceso', cifra: 'Cerrada', pie: null,
      color: ROJO, fondo: '#fdf3f3', borde: '#f6dcdc',
      titulo: 'Tu cuenta está cerrada',
      texto: s.mensaje ?? 'Tus datos no se borran: se conservan por si vuelves y porque son comprobantes fiscales con retención legal.',
      cta: alPortal('Reactivar mi cuenta'),
    };
  }

  if (s.cancelacionPendiente) {
    return {
      etiqueta: 'Suscripción', cifra: plazo(dias),
      pie: d.team.periodoFin ? `Hasta el ${fechaLarga(d.team.periodoFin)}` : null,
      color: AMBAR, fondo: '#fffaf0', borde: '#f5e6c8',
      titulo: 'Tu suscripción termina pronto',
      texto: s.mensaje ?? 'Puedes reactivarla antes de esa fecha y no se interrumpe nada.',
      cta: alPortal('Reactivar mi suscripción'),
    };
  }

  // ── Activa ────────────────────────────────────────────────────────────────
  // Tres situaciones que NO se pueden contar igual:
  //
  //  1. Suscripción viva y tarjeta → la cifra es lo único que quiere saber
  //     quien ya paga: cuánto y cuándo.
  //  2. Suscripción viva SIN tarjeta → el próximo cobro va a fallar. Decirle
  //     «no hay cobro automático» sería tranquilizarlo antes de una mora.
  //  3. Sin suscripción (plan puesto por nosotros) → no hay cobro que anunciar,
  //     y anunciar una fecha igualmente sería inventársela.
  if (d.team.periodoFin && d.tieneTarjeta) {
    return {
      etiqueta: 'Próximo cobro', cifra: usd(d.total),
      pie: `El ${fechaLarga(d.team.periodoFin)}`,
      color: VERDE, fondo: '#f4fbf7', borde: '#d7ede1',
      titulo: 'Todo al día',
      texto: 'Se cobra solo, una vez al mes. Puedes cambiar de plan o cancelar cuando quieras; al cancelar conservas el acceso hasta el final del período ya pagado.',
      cta: null,
    };
  }

  if (d.tieneSuscripcion) {
    return {
      etiqueta: 'Suscripción', cifra: 'Falta la tarjeta',
      pie: d.team.periodoFin ? `Se cobra el ${fechaCorta(d.team.periodoFin)}` : null,
      color: AMBAR, fondo: '#fffaf0', borde: '#f5e6c8',
      titulo: 'No encontramos tu método de pago',
      // Sin acusar: `tieneMetodoDePago` devuelve null cuando no se pudo
      // preguntar a Stripe, y eso se trata como «no tiene». Decir «no tienes
      // tarjeta» a quien sí la tiene, porque Stripe tardó, es peor que pedirle
      // que lo revise.
      texto: 'Tu plan está activo, pero no vemos una tarjeta con la que cobrarlo. Revísala para que el próximo cobro no falle.',
      cta: alPortal('Revisar mi método de pago'),
    };
  }

  return {
    etiqueta: 'Suscripción', cifra: 'Activa', pie: null,
    color: VERDE, fondo: '#f4fbf7', borde: '#d7ede1',
    titulo: 'Tu plan está activo',
    texto: 'No hay un cobro automático configurado, así que no se te cobrará nada hasta que contrates uno.',
    cta: null,
  };
}

// ─── Las tres líneas comerciales ─────────────────────────────────────────────

/**
 * Cada línea con sus planes, sus precios, sus riesgos y su veredicto.
 *
 * Las TRES se devuelven siempre, incluso las que este cliente no puede
 * contratar: la pantalla las pinta apagadas con el motivo. Esconderlas —que es
 * lo que hacía `familiasOfrecibles` filtrando la lista— deja al usuario sin
 * saber si la opción no existe o si él no la encuentra, y las dos preguntas
 * acaban en soporte. Aquí `familiasOfrecibles` decide qué se puede PULSAR.
 *
 * `erp` y `pos-erp` son la MISMA familia (`ecf`) con los mismos cuatro planes;
 * lo único que cambia es si el precio lleva dentro el adicional del Punto de
 * Venta. Por eso el precio sale de `precioTotal(plan, addons)` y los riesgos se
 * calculan una vez POR LÍNEA: perder el POS no es lo mismo que conservarlo, y
 * un solo cálculo para las dos daría el veredicto equivocado en una.
 */
async function construirLineas(d: {
  teamId: number;
  planDef: PlanDef;
  adicionales: string[];
  lineaActual: LineaProducto | null;
  tieneSuscripcion: boolean;
}): Promise<LineaVista[]> {
  const ofrecibles = familiasOfrecibles(d.planDef.familia);

  const base = await Promise.all(LINEAS_PRODUCTO.map(async linea => {
    const planes  = planesDeFamilia(linea.familia);
    const esLaMia = linea.key === d.lineaActual?.key;

    const riesgos = await riesgosDeCambio(
      d.teamId, d.planDef.key, planes, linea.addons,
      // Fuera de su línea ningún plan es «el actual»: «Negocio» sin el POS
      // comparte clave con «Negocio» con él, y marcarlo «Plan actual» taparía
      // los nueve dólares y el módulo de diferencia.
      esLaMia,
    );

    return {
      linea, planes, riesgos, esLaMia,
      veto: vetoDeLinea({ ...d, linea, esLaMia, ofrecibles, riesgos, planes }),
    };
  }));

  // El aviso de la línea propia necesita saber qué pasa con LAS OTRAS, así que
  // se arma en una segunda pasada. Sin esto, quien está en un plan de colegio
  // ve dos pestañas apagadas y ni una palabra de por qué: la explicación vive
  // en el banner, y el banner solo se pinta para la línea seleccionada.
  const vetadas = base.filter(b => b.veto && !b.esLaMia);

  return base.map(b => ({
    key: b.linea.key,
    nombre: b.linea.nombre,
    planes: b.planes,
    addons: [...b.linea.addons],
    precios: Object.fromEntries(b.planes.map(p => [p.key, precioTotal(p.key, b.linea.addons)])),
    riesgos: conElAdicionalQueSePierde(
      b.veto ? b.riesgos : sinVetoDeFamilia(b.riesgos),
      adicionalesQuePierde(b.linea, d.planDef, d.adicionales),
    ),
    esLaMia: b.esLaMia,
    pulsable: !b.veto,
    veto: b.veto,
    aviso: b.veto
      ? null
      : b.esLaMia
        ? avisoDeLasApagadas(vetadas.map(v => ({ nombre: v.linea.nombre, veto: v.veto! })))
        : avisoDeLinea({ linea: b.linea, esLaMia: b.esLaMia, planDef: d.planDef, adicionales: d.adicionales }),
  } satisfies LineaVista));
}

/**
 * Adicionales que el cliente PAGA hoy y que esta línea no lleva dentro.
 *
 * Los que el plan de destino ya incluye no cuentan: al tramo de colegio el POS
 * le viene puesto, así que pasar ahí no lo pierde aunque la línea no lo declare
 * como adicional.
 */
function adicionalesQuePierde(
  linea: LineaProducto,
  planActual: PlanDef,
  adicionales: string[],
): AddonDef[] {
  const planDestino = planesDeFamilia(linea.familia)[0];
  return ADDONS.filter(a =>
    adicionales.includes(a.key)
    && !addonIncluido(planActual.key, a.key)
    && !linea.addons.includes(a.key)
    && !(planDestino && addonIncluido(planDestino.key, a.key)),
  );
}

/**
 * Mete «pierdes el Punto de Venta» dentro del riesgo de cada plan de la línea.
 *
 * `validarCambioDePlan` NO lo detecta, y no es un descuido suyo: compara los
 * módulos del PLAN (`modulosPerdidos`), y en la familia e-CF el POS no viene
 * del plan sino del adicional, así que entre esos ocho planes siempre da vacío.
 * Su parámetro `adicionalesActuales` solo sirve para CONSERVAR un módulo, nunca
 * para quitarlo.
 *
 * Sin esto la tarjeta dice «Solo sumas. No se pierde nada.» tres centímetros
 * debajo de un banner rojo que avisa de que se apaga la caja — y la tarjeta,
 * que es la que lleva el botón, es la que se lee.
 *
 * Va como AVISO y no como bloqueo: el módulo se apaga, pero las ventas ya
 * hechas son facturas y se siguen consultando desde Facturación. Lo que sí
 * debería bloquear —un turno de caja abierto— no se puede afirmar desde aquí
 * sin repetir la consulta que ya vive en `datosDentroDelModulo`, y duplicarla
 * es exactamente cómo las dos copias dejan de coincidir. Queda anotado.
 */
function conElAdicionalQueSePierde(
  riesgos: Record<string, RiesgoDeCambio>,
  perdidos: AddonDef[],
): Record<string, RiesgoDeCambio> {
  if (perdidos.length === 0) return riesgos;

  const motivos: MotivoCambio[] = perdidos.map(a => ({
    gravedad: 'avisa',
    clave: `adicional-se-apaga:${a.key}`,
    mensaje: `Dejas de pagar ${a.name} (US$${a.price}/mes) y el módulo se apaga.`,
    comoResolver: null,
  }));

  return Object.fromEntries(
    Object.entries(riesgos).map(([clave, r]) => {
      if (r.nivel === 'actual') return [clave, r];
      const avisos = [...motivos, ...r.avisos];
      return [clave, {
        ...r,
        avisos,
        nivel: r.bloqueos.length > 0 ? 'bloquea' : 'avisa',
        // El resumen sigue siendo el motivo más grave: un bloqueo real manda
        // sobre esto, y si no lo hay, lo que se pierde es el adicional.
        resumen: r.bloqueos[0]?.mensaje ?? avisos[0]!.mensaje,
      } satisfies RiesgoDeCambio];
    }),
  );
}

/**
 * Por qué las OTRAS pestañas están apagadas, leído desde la propia.
 *
 * Las líneas vetadas no se pueden seleccionar —así lo pide el diseño— y su
 * motivo vive en el banner de la línea seleccionada. Sin esto, la única
 * pantalla donde ese motivo se podría leer es justo la que no se puede abrir.
 *
 * Se agrupa por motivo: dos líneas apagadas por lo mismo se cuentan una vez.
 */
function avisoDeLasApagadas(
  vetadas: { nombre: string; veto: AvisoLinea }[],
): AvisoLinea | null {
  if (vetadas.length === 0) return null;

  const porMotivo = new Map<string, string[]>();
  for (const v of vetadas) {
    porMotivo.set(v.veto.texto, [...(porMotivo.get(v.veto.texto) ?? []), v.nombre]);
  }

  const frases = [...porMotivo.entries()].map(([motivo, nombres]) => {
    const lista = nombres.length > 1
      ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
      : nombres[0];
    return `${lista}: ${motivo}`;
  });

  return {
    tono: 'info',
    titulo: vetadas.length === 1
      ? 'Hay una línea que no puedes contratar desde aquí'
      : 'Hay líneas que no puedes contratar desde aquí',
    texto: frases.join(' '),
  };
}

/**
 * Por qué esta línea no se puede contratar desde aquí. null = sí se puede.
 *
 * Son dos vetos y ninguno es capricho de diseño: los dos salen de lo que el
 * sistema SABE hacer.
 */
function vetoDeLinea(d: {
  linea: LineaProducto;
  esLaMia: boolean;
  planDef: PlanDef;
  adicionales: string[];
  ofrecibles: FamiliaPlan[];
  tieneSuscripcion: boolean;
  riesgos: Record<string, RiesgoDeCambio>;
  planes: PlanDef[];
}): AvisoLinea | null {
  if (d.esLaMia) return null;

  // ── 1. Salto de familia que no va por autoservicio ────────────────────────
  // El motivo se toma del veredicto real y no se escribe aquí: así el texto y
  // el «cómo lo resuelvo» son los mismos que devolvería la API si lo intentara.
  const cambiaDeFamilia = d.linea.familia !== d.planDef.familia;
  if (cambiaDeFamilia) {
    const motivo = d.riesgos[d.planes[0]!.key]?.bloqueos.find(b => b.clave === 'cambio-de-familia');
    // `familiasOfrecibles` dice que el salto es seguro (e-CF → colegio no
    // pierde nada) pero `CAMBIO_PLAN.permiteCambiarDeFamilia` cierra las dos
    // direcciones, y por ahí pasa /api/stripe/change-plan. Con suscripción
    // viva el cambio se rechaza de verdad; sin ella el botón va al checkout,
    // que no valida, y la compra se completa.
    //
    // OJO — esa contradicción vive en lib/, no aquí. Lo que hace esta pantalla
    // es DECIRLA, no arreglarla: abrir el salto e-CF → colegio por
    // autoservicio es decisión del negocio y se toma en
    // lib/config/suscripcion.ts, no en un componente.
    const seLePuedeOfrecer = d.ofrecibles.includes(d.linea.familia) && !d.tieneSuscripcion;
    if (!seLePuedeOfrecer) {
      return {
        tono: 'alerta',
        titulo: `${d.linea.nombre} se contrata con nosotros`,
        texto: [
          motivo?.mensaje ?? `No se puede pasar a ${d.linea.nombre} por autoservicio.`,
          motivo?.comoResolver ?? 'Escríbenos y lo hacemos contigo.',
        ].join(' '),
        // Sin esto, «escríbenos» era una instrucción sin destinatario: la
        // pantalla decía que no y no decía por dónde. Un camino cerrado sin
        // salida se convierte en un correo a soporte preguntando cómo, que es
        // el trabajo que este aviso venía a ahorrar.
        contacto: contactoDeLinea(`Quiero pasar a ${d.linea.nombre}`),
      };
    }
    return null;
  }

  // ── 2. Misma familia, otros adicionales, con suscripción viva ─────────────
  // /api/stripe/change-plan cambia el PRECIO DEL PLAN y nada más: no toca los
  // items de adicionales de la suscripción. Así que a quien ya paga por Stripe
  // no se le puede quitar ni poner el Punto de Venta desde aquí — el cobro
  // seguiría igual y el módulo también. Enseñarle el precio de la otra línea
  // como si fuera contratable sería ofrecerle algo que el botón no hace.
  const mismosAdicionales =
    d.linea.addons.length === d.adicionales.filter(a => !addonIncluido(d.planDef.key, a)).length &&
    d.linea.addons.every(a => d.adicionales.includes(a));
  if (d.tieneSuscripcion && !mismosAdicionales) {
    return {
      tono: 'alerta',
      titulo: 'El Punto de Venta se agrega o se quita con nosotros',
      texto: 'Tu suscripción ya está activa en Stripe y desde esta pantalla solo se cambia el plan, no los adicionales. Escríbenos y lo ajustamos contigo.',
      contacto: contactoDeLinea('Quiero cambiar el Punto de Venta de mi suscripción'),
    };
  }

  return null;
}

/**
 * Lo que hay que saber al elegir una línea que SÍ se puede contratar.
 *
 * Es información de LÍNEA: vale igual para sus cuatro tramos. Lo que cambia de
 * un tramo a otro se queda en la tarjeta de cada uno.
 */
/**
 * Los dos canales por los que se sigue cuando la pantalla dice que no.
 *
 * El asunto va escrito de antemano para que quien reciba el mensaje no tenga
 * que preguntar de qué va: «Quiero pasar a Zero ERP Colegio» es media
 * conversación resuelta antes de empezarla.
 *
 * El WhatsApp puede venir vacío —sale del entorno y no tiene valor por
 * defecto, a propósito: un número inventado es peor que ninguno— y por eso el
 * correo va siempre.
 */
function contactoDeLinea(asunto: string) {
  return {
    whatsapp: enlaceWhatsapp(`Hola, soy de ${'{empresa}'}. ${asunto}.`.replace('{empresa}', 'una empresa en Zero')),
    correo: enlaceCorreo(asunto, `Hola,\n\n${asunto}.\n\nGracias.`),
  };
}

function avisoDeLinea(d: {
  linea: LineaProducto;
  esLaMia: boolean;
  planDef: PlanDef;
  adicionales: string[];
}): AvisoLinea | null {
  if (d.esLaMia) return null;

  if (d.linea.familia !== d.planDef.familia) {
    return {
      tono: 'info',
      titulo: `${d.linea.nombre} incluye lo que ya usas`,
      texto: `${d.linea.descripcion} No es un cambio de sistema: conservas tus clientes, comprobantes, inventario y contabilidad, y encima se abre lo del colegio. El tramo lo marca la cantidad de estudiantes activos.`,
    };
  }

  // Misma familia y menos adicionales: se deja de pagar el POS y el módulo se
  // apaga. Se dice aquí porque `validarCambioDePlan` NO lo detecta: compara los
  // módulos del PLAN, y en la familia e-CF el POS no viene del plan sino del
  // adicional, así que entre esos ocho planes `modulosPerdidos` siempre da
  // vacío. Sin esta línea, cambiarse de «Zero POS + ERP» a «Zero ERP» apagaría
  // la caja sin un solo aviso.
  const pierdeElPos = d.adicionales.includes('pos')
    && !d.linea.addons.includes('pos')
    && !addonIncluido(d.planDef.key, 'pos');
  if (pierdeElPos) {
    const pos = ADDONS.find(a => a.key === 'pos');
    return {
      tono: 'alerta',
      titulo: `${d.linea.nombre} no incluye el Punto de Venta`,
      texto: `Al cambiarte a esta línea dejas de pagar los US$${pos?.price ?? 0} del Punto de Venta y el módulo se apaga: ${pos?.descripcion ?? ''} Tus ventas ya hechas siguen siendo facturas y se consultan desde Facturación.`,
    };
  }

  const ganaElPos = !d.adicionales.includes('pos')
    && d.linea.addons.includes('pos')
    && !addonIncluido(d.planDef.key, 'pos');
  if (ganaElPos) {
    const pos = ADDONS.find(a => a.key === 'pos');
    return {
      tono: 'info',
      titulo: `${d.linea.nombre} suma el Punto de Venta`,
      texto: `Son US$${pos?.price ?? 0} más al mes sobre el plan que elijas. ${pos?.descripcion ?? ''} Todo lo que ya tienes se queda como está.`,
    };
  }

  return null;
}

/**
 * Quita el veto de «cambio de familia» de cada riesgo.
 *
 * Se aplica SOLO cuando la línea se ha declarado contratable (ver
 * `vetoDeLinea`): ahí el botón va al checkout, que no valida, y la compra se
 * completa de verdad. Dejar el bloqueo pintaría «No disponible» encima de un
 * botón que sí funciona.
 *
 * Los demás motivos —estudiantes de más, un módulo con datos dentro, un turno
 * de caja abierto— se quedan: son ciertos vaya el cambio por donde vaya.
 */
function sinVetoDeFamilia(
  riesgos: Record<string, RiesgoDeCambio>,
): Record<string, RiesgoDeCambio> {
  return Object.fromEntries(
    Object.entries(riesgos).map(([clave, r]) => {
      const bloqueos = r.bloqueos.filter(b => b.clave !== 'cambio-de-familia');
      if (bloqueos.length === r.bloqueos.length) return [clave, r];

      const peor = bloqueos[0] ?? r.avisos[0] ?? null;
      return [clave, {
        ...r,
        bloqueos,
        nivel: r.nivel === 'actual' ? 'actual'
          : bloqueos.length > 0 ? 'bloquea'
          : r.avisos.length > 0 ? 'avisa'
          : 'ok',
        resumen: peor?.mensaje ?? 'Solo sumas. No se pierde nada.',
      } satisfies RiesgoDeCambio];
    }),
  );
}

// ─── Historial ───────────────────────────────────────────────────────────────

/** Centavos + código ISO → «US$74.00». Sin decimales inventados. */
function dinero(centavos: number, moneda: string): string {
  try {
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency: moneda }).format(centavos / 100);
  } catch {
    // Un código de moneda que Intl no conoce no puede tumbar la tabla entera.
    return `${moneda} ${(centavos / 100).toFixed(2)}`;
  }
}

function vistaDeCobro(c: Awaited<ReturnType<typeof historialDeCobros>>[number]): CobroVista {
  return {
    id: c.id,
    fecha: fechaCorta(new Date(c.fecha * 1000)),
    concepto: c.concepto,
    detalle: c.detalle,
    monto: dinero(c.montoCentavos, c.moneda),
    estado: c.estado,
    pdfUrl: c.pdfUrl,
    urlDePago: c.urlDePago,
  };
}

/**
 * Las tres cifras de arriba del historial.
 *
 * Se calculan de las facturas REALES, no de la suscripción: «pagado este año»
 * tiene que ser la suma de lo que Stripe cobró, no el precio del plan por los
 * meses transcurridos. Si no hay ni cobros ni suscripción no se pintan: tres
 * tarjetas en cero no informan de nada.
 */
function resumenDeCobros(
  cobros: Awaited<ReturnType<typeof historialDeCobros>>,
  d: { esInterna: boolean; tieneSuscripcion: boolean; total: number; periodoFin: Date | null; anio: number },
): TarjetaResumen[] {
  if (cobros.length === 0 && !d.tieneSuscripcion) return [];

  const delAnio = cobros.filter(
    c => c.estado === 'pagada' && new Date(c.fecha * 1000).getFullYear() === d.anio,
  );
  const pagado = delAnio.reduce((s, c) => s + c.montoCentavos, 0);
  const moneda = delAnio[0]?.moneda ?? cobros[0]?.moneda ?? 'USD';
  const fallidos = cobros.filter(c => c.estado === 'fallida').length;

  return [
    {
      etiqueta: `Pagado en ${d.anio}`,
      valor: dinero(pagado, moneda),
      pie: delAnio.length === 1 ? '1 cobro' : `${delAnio.length} cobros`,
    },
    {
      etiqueta: 'Próximo cobro',
      valor: d.esInterna ? 'Sin cobro' : d.tieneSuscripcion && d.periodoFin ? usd(d.total) : '—',
      pie: d.esInterna
        ? 'Cuenta interna Zero'
        : d.tieneSuscripcion && d.periodoFin
          ? `El ${fechaLarga(d.periodoFin)}`
          : 'Sin cobro automático configurado',
    },
    {
      etiqueta: 'Cobros rechazados',
      valor: numero(fallidos),
      alerta: fallidos > 0,
      pie: fallidos > 0 ? 'Revisa tu método de pago' : 'Ninguno en tu historial',
    },
  ];
}

// ─── Downgrade programado en Stripe ──────────────────────────────────────────

/**
 * Si hay una bajada de plan esperando al fin del período, cuál y cuándo.
 *
 * Si falla se devuelve null y la pantalla se pinta igual: no poder decir
 * «tienes un cambio programado» no justifica dejar al cliente sin ver su plan.
 */
async function downgradeProgramado(
  team: { stripeCustomerId?: string | null; stripeSubscriptionId?: string | null },
): Promise<{ name: string; effectiveDate: string } | null> {
  if (!team.stripeCustomerId || !team.stripeSubscriptionId) return null;

  try {
    const schedules = await stripe.subscriptionSchedules.list({ customer: team.stripeCustomerId });
    const schedule = schedules.data.find(s => {
      const subId = typeof s.subscription === 'string' ? s.subscription : s.subscription?.id;
      return subId === team.stripeSubscriptionId && s.status === 'active';
    });
    if (!schedule || schedule.phases.length < 2) return null;

    const nextPhase   = schedule.phases[schedule.phases.length - 1];
    const nextPriceId = typeof nextPhase.items[0]?.price === 'string'
      ? nextPhase.items[0].price
      : (nextPhase.items[0]?.price as { id: string } | null)?.id ?? '';
    const nextPlanDef = getPlan(
      PLANS.find(p => p.priceEnvKey && process.env[p.priceEnvKey] === nextPriceId)?.key ?? '',
    );
    const endDate = schedule.phases[0]?.end_date;
    if (nextPlanDef.key === 'free' || !endDate) return null;

    return { name: nextPlanDef.name, effectiveDate: new Date(endDate * 1000).toISOString() };
  } catch {
    return null;
  }
}

/**
 * Mi suscripción — lo que el cliente ve de su plan.
 *
 * TODO sale del catálogo (lib/config/plans.ts) y del estado real de la
 * suscripción. Nada escrito a mano: la versión anterior tenía la tabla
 * comparativa y la lista de planes en literales, y se quedó meses ofreciendo
 * «Starter $15» y «Business $35» —planes que ya no existían— mientras marcaba
 * como no-pagador a cualquiera con un plan de verdad.
 *
 * Se muestran los límites que APLICAN a este plan, no una rejilla fija: a una
 * ferretería no le importa el tope de estudiantes y a un colegio no le importa
 * un tope de comprobantes que tiene en ilimitado.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { CreditCard, Zap, AlertCircle, TrendingUp, Users, GraduationCap, MessageSquare, Smartphone } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MuiButton from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import Divider from '@mui/material/Divider';
import { count, eq, and, gte } from 'drizzle-orm';

import { BILLING_ENABLED } from '@/lib/config/billing';
import { getTeamIdForUser, getTeamProfile, getMonthlyEcfCount } from '@/lib/db/queries';
import {
  getPlan, PLANS, getPlanPriceId, planesDeFamilia, precioTotal, type PlanDef,
  ADDONS, addonIncluido, familiasOfrecibles, LINEAS_PRODUCTO,
} from '@/lib/config/plans';
import { evaluarLimite, PRUEBA } from '@/lib/config/suscripcion';
import { getSuscripcion } from '@/lib/suscripcion/queries';
import { cuotaAvisos } from '@/lib/suscripcion/cuota-avisos';
import { estadoDelTramo } from '@/lib/suscripcion/tramo';
import { customerPortalAction, checkoutAction } from '@/lib/payments/actions';
import { stripe, tieneMetodoDePago } from '@/lib/payments/stripe';
import { ecfDocuments, teamMembers } from '@/lib/db/schema';
import { db } from '@/lib/db/drizzle';
import { TIPOS_ECF } from '@/lib/ecf/types';
import { ChangePlan } from './_change-plan';

// ─── Un límite, listo para pintar ─────────────────────────────────────────────

interface Medidor {
  clave: string;
  etiqueta: string;
  icono: React.ReactNode;
  usado: number;
  /** -1 = sin tope. */
  tope: number;
  /** Qué se dice debajo de la barra. */
  nota: string;
}

const ICONO = { width: 14, height: 14 } as const;

export default async function SuscripcionPage() {
  // Producto en desarrollo: planes y suscripción no se le muestran al usuario;
  // los módulos y límites los administramos desde /admin. Ver lib/config/billing.
  if (!BILLING_ENABLED) notFound();

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [team, usadoEsteMes, usagePorTipo, suscripcion, miembros, tramo] = await Promise.all([
    getTeamProfile(teamId),
    getMonthlyEcfCount(teamId),
    db
      .select({ tipoEcf: ecfDocuments.tipoEcf, total: count() })
      .from(ecfDocuments)
      .where(and(eq(ecfDocuments.teamId, teamId), gte(ecfDocuments.createdAt, startOfMonth)))
      .groupBy(ecfDocuments.tipoEcf),
    getSuscripcion(teamId),
    db.select({ n: count() }).from(teamMembers).where(eq(teamMembers.teamId, teamId)),
    estadoDelTramo(teamId),
  ]);

  if (!team) redirect('/sign-in');

  const planDef = getPlan(team.planName);
  const sinPlan = planDef.key === 'free';

  // Los avisos solo se consultan si el plan los tarifa: preguntar por ellos en
  // un plan de e-CF sería un COUNT sobre una tabla escolar que no le importa.
  const cuota = planDef.limits.whatsappMensajes >= 0 || planDef.limits.smsMensajes >= 0
    ? await cuotaAvisos(teamId)
    : null;

  const pendingPlan = await downgradeProgramado(team);

  // Price IDs para el cliente (las env vars solo se leen en el servidor).
  const priceIds = Object.fromEntries(PLANS.map(p => [p.key, getPlanPriceId(p.key)]));

  // Solo los planes de SU línea. Ofrecerle a una ferretería el tramo escolar
  // de US$500 no es vender más, es ruido; y el cambio de familia no va por
  // autoservicio de todos modos (CAMBIO_PLAN.permiteCambiarDeFamilia).
  const planesOfrecidos = planesDeFamilia(planDef.familia);

  const medidores = construirMedidores({
    planDef,
    docs: usadoEsteMes,
    usuarios: miembros[0]?.n ?? 0,
    estudiantes: tramo?.estudiantes ?? 0,
    whatsapp: cuota?.porCanal.whatsapp.usado ?? 0,
    sms: cuota?.porCanal.sms.usado ?? 0,
  });

  const docsLim = evaluarLimite('docs', usadoEsteMes, planDef.limits.docs, 0);

  // Adicionales que SE COBRAN aparte. Los que el plan ya incluye —el POS en
  // los tramos de colegio— no suman al precio y listarlos sería mentir sobre
  // la factura.
  const extrasFacturados = ADDONS.filter(
    a => adicionalesDe(team).includes(a.key) && !addonIncluido(planDef.key, a.key),
  );

  const enPrueba = suscripcion.estado === 'prueba' || suscripcion.estado === 'prueba-por-vencer';
  const diasDePrueba = suscripcion.diasRestantes ?? 0;
  const urgente = suscripcion.estado === 'prueba-por-vencer';
  // `null` = no se pudo preguntar a Stripe. Se trata como «no tiene», que es
  // el lado seguro: enseñar el botón de más se arregla con un clic; esconderlo
  // deja a alguien sin saber cómo pagar.
  const tieneTarjeta = (await tieneMetodoDePago(team.stripeCustomerId)) === true;

  // La otra línea comercial, solo si el salto es seguro (ver familiasOfrecibles).
  const otrasLineas = familiasOfrecibles(planDef.familia)
    .map(fam => ({ fam, planes: planesDeFamilia(fam) }))
    .filter(l => l.planes.length > 0);

  return (
    // mx auto: con la columna de 800px anclada a la izquierda quedaba medio
    // viewport vacío en pantallas anchas. Centrada se lee como página de ajustes.
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 800, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
          Suscripción
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Tu plan, tu consumo del mes y tu facturación.
        </Typography>
      </Box>

      {/* Estado del ciclo de vida — lo mismo que dice el banner del sistema.
          Sale del mismo objeto que usa el guard del servidor, así que lo que
          el cliente lee y lo que el sistema hace no pueden contradecirse. */}
      {suscripcion.avisar && suscripcion.mensaje && (
        <Alert
          severity={suscripcion.puedeEscribir ? 'warning' : 'error'}
          sx={{ borderRadius: '12px', mb: 2 }}
        >
          {suscripcion.mensaje}
        </Alert>
      )}

      {/* Plan actual */}
      <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', mb: 2 }}>
        <CardContent sx={{ p: '20px !important', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
            <CreditCard style={{ width: 16, height: 16, color: '#3658e1' }} />
            Plan actual
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
                {sinPlan ? 'Sin plan' : planDef.name}
              </Typography>
              <EstadoChip estado={suscripcion.estado} dias={suscripcion.diasRestantes} />
            </Box>
            {!sinPlan && (
              /* El total y de qué está hecho.
                 Antes solo se veía «US$74/mes» junto a un plan que la lista de
                 abajo marca a US$65. La diferencia son los adicionales, y sin
                 decirlo la pantalla se contradice a sí misma a nueve dólares de
                 distancia — que es justo el tipo de duda que acaba en soporte. */
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                  US${precioTotal(planDef.key, adicionalesDe(team))}/mes
                </Typography>
                {extrasFacturados.length > 0 && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                    US${planDef.price} {planDef.name}
                    {extrasFacturados.map(a => ` + US$${a.price} ${a.name}`)}
                  </Typography>
                )}
              </Box>
            )}
          </Box>

          {/* La prueba, con su reloj a la vista.
              El chip de al lado del nombre decía «Prueba · 12 días» y con eso
              se daba por informado al usuario. No basta: en una pastilla de 22
              píxeles no cabe lo único que de verdad quiere saber —qué pasa el
              día que se acabe— y por eso preguntaba. Aquí se dice entero, y el
              botón de poner la tarjeta queda al lado de la frase que explica
              por qué hace falta, no perdido entre acciones. */}
          {enPrueba && (
            <Box sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 1.5, p: 2, borderRadius: '10px',
              bgcolor: urgente ? '#fffbeb' : '#f5f8ff',
              border: `1px solid ${urgente ? '#fde68a' : '#dbe4fe'}`,
            }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: urgente ? '#92400e' : '#1e40af' }}>
                  {diasDePrueba === 1
                    ? 'Te queda 1 día de prueba'
                    : `Te quedan ${diasDePrueba} días de prueba`}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                  {tieneTarjeta
                    ? `Cuando termine, se cobra US$${precioTotal(planDef.key, adicionalesDe(team))} al mes. Puedes cambiar de plan o cancelar antes.`
                    : 'Al terminar podrás consultar y descargar tu información, pero no emitir. Agrega tu tarjeta para seguir sin cortes.'}
                </Typography>
              </Box>
              {!tieneTarjeta && (
                <form action={customerPortalAction}>
                  <MuiButton type="submit" variant="contained" color="primary" disableElevation
                    startIcon={<CreditCard style={{ width: 15, height: 15 }} />}
                    sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    Agregar tarjeta
                  </MuiButton>
                </form>
              )}
            </Box>
          )}

          {/* Medidores — uno por límite que APLICA a este plan. */}
          {medidores.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {medidores.map(m => <Barra key={m.clave} medidor={m} />)}
            </Box>
          )}

          {/* Acciones */}
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            {!sinPlan && team.stripeCustomerId ? (
              <>
                {/* Cuando ya NO puede escribir, pagar es lo único que importa
                    en esta pantalla, y tiene que verse como tal.
                    «Tarjeta y facturas» en botón secundario se lee como un
                    ajuste, no como «paga aquí»: a alguien cuya prueba acaba de
                    vencer le queda la sensación de que no hay forma de pagar,
                    aunque el botón esté delante. Mismo destino, otro peso. */}
                <form action={customerPortalAction}>
                  <MuiButton
                    type="submit"
                    variant={suscripcion.puedeEscribir ? 'outlined' : 'contained'}
                    color="primary"
                    disableElevation
                    startIcon={suscripcion.puedeEscribir ? undefined : <CreditCard style={{ width: 16, height: 16 }} />}
                    sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
                    {suscripcion.puedeEscribir ? 'Tarjeta y facturas' : 'Agregar mi método de pago'}
                  </MuiButton>
                </form>
                {/* Cancelar VISIBLE, aunque lleve al mismo sitio.
                    La cancelación vive dentro del portal de Stripe, y con el
                    botón de arriba como única puerta nadie que quiera irse la
                    encuentra: «tarjeta y facturas» no se lee como «darme de
                    baja». Esconder la salida no retiene a nadie — solo hace
                    que escriban a soporte, molestos, para preguntar cómo. */}
                <form action={customerPortalAction}>
                  <MuiButton type="submit" variant="text"
                    sx={{ textTransform: 'none', fontWeight: 500, color: 'text.secondary', fontSize: '0.8125rem' }}>
                    Cancelar suscripción
                  </MuiButton>
                </form>
              </>
            ) : sinPlan ? (
              // Sin plan sí tiene sentido mandarlo a /pricing: no hay nada que
              // gestionar todavía. Con plan, los planes están justo abajo y un
              // botón que se lleva al usuario fuera solo estorba.
              <Link href="/pricing" style={{ textDecoration: 'none' }}>
                <MuiButton variant="contained" color="primary" disableElevation
                  startIcon={<Zap style={{ width: 16, height: 16 }} />}
                  sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
                  Ver planes — desde US${precioMinimo()}/mes
                </MuiButton>
              </Link>
            ) : null}
          </Box>
        </CardContent>
      </Card>

      {/* Cambiar plan — SIEMPRE visible.
          Antes solo salía con una suscripción viva en Stripe, así que a quien
          tuviera el plan asignado por nosotros —o a quien nunca compró— la
          pantalla de su plan no le ofrecía cambiarlo: solo un botón que lo
          echaba a /pricing. Sin suscripción cada plan lleva a contratar; con
          ella, a subir o bajar. */}
      <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', mb: 2 }}>
        <CardContent sx={{ p: '20px !important' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <TrendingUp style={{ width: 16, height: 16, color: '#3658e1' }} />
            {team.stripeSubscriptionId ? 'Cambiar plan' : 'Planes disponibles'}
          </Typography>
          <ChangePlan
            plans={planesOfrecidos}
            currentPlan={planDef}
            priceIds={priceIds}
            pendingPlan={pendingPlan}
            tieneSuscripcion={Boolean(team.stripeSubscriptionId)}
            checkoutAction={checkoutAction}
          />
        </CardContent>
      </Card>

      {/* La OTRA línea comercial.
          Va en su propia tarjeta y no mezclada con los cuatro de arriba: no es
          un plan más caro, es otro producto. Un comercio que abre un colegio
          antes no tenía por dónde enterarse de que esto existe —veía cuatro
          planes de facturación y ninguna señal— y la venta se perdía por
          proteger un caso que no era el suyo (ver `familiasOfrecibles`). */}
      {otrasLineas.map(({ fam, planes }) => {
        const linea = LINEAS_PRODUCTO.find(l => l.familia === fam);
        const desde = Math.min(...planes.map(p => p.price));
        return (
          <Card key={fam} elevation={0} sx={{ border: '1px solid #dbe4fe', bgcolor: '#f8faff', borderRadius: '12px', mb: 2 }}>
            <CardContent sx={{ p: '20px !important' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                <GraduationCap style={{ width: 16, height: 16, color: '#3658e1' }} />
                {linea?.nombre ?? 'Otra línea'}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, mb: 2 }}>
                {linea?.descripcion} Desde US${desde}/mes, según cuántos estudiantes tengas.
              </Typography>
              <ChangePlan
                plans={planes}
                currentPlan={planDef}
                priceIds={priceIds}
                pendingPlan={pendingPlan}
                tieneSuscripcion={Boolean(team.stripeSubscriptionId)}
                checkoutAction={checkoutAction}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1.5 }}>
                Al contratarlo se te abren la gobernanza del colegio y el punto
                de venta de la cafetería, y conservas todo lo que ya tienes.
              </Typography>
            </CardContent>
          </Card>
        );
      })}

      {/* Comparativa — generada del catálogo, con una columna por plan de su
          línea. Antes era una tabla a mano y por eso envejeció mal. */}
      <Comparativa planes={planesOfrecidos} actual={planDef} />

      {/* Uso por tipo */}
      {usagePorTipo.length > 0 && (
        <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', mb: 2 }}>
          <CardContent sx={{ p: '20px !important', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
              Uso por tipo este mes
            </Typography>
            {usagePorTipo.map(u => (
              <Box key={u.tipoEcf} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {TIPOS_ECF[u.tipoEcf as keyof typeof TIPOS_ECF] ?? `Tipo ${u.tipoEcf}`}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>{u.total}</Typography>
              </Box>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tope de comprobantes alcanzado */}
      {docsLim.bloqueado && (
        <Alert
          severity="error"
          icon={<AlertCircle style={{ width: 18, height: 18 }} />}
          sx={{ borderRadius: '12px' }}
          action={siguientePlan(planDef) ? (
            <Link href="#cambiar-plan" style={{ textDecoration: 'none' }}>
              <MuiButton size="small" color="error" startIcon={<Zap style={{ width: 12, height: 12 }} />}
                sx={{ textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>
                Ver planes →
              </MuiButton>
            </Link>
          ) : undefined}
        >
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Llegaste a los {planDef.limits.docs} comprobantes de tu plan este mes
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>
            {siguientePlan(planDef)
              ? `Con ${siguientePlan(planDef)!.name} emites ${limiteTexto(siguientePlan(planDef)!.limits.docs)}.`
              : 'Escríbenos para ajustar tu plan.'}
          </Typography>
        </Alert>
      )}
    </Box>
  );
}

// ─── Piezas ───────────────────────────────────────────────────────────────────

function limiteTexto(n: number): string {
  return n < 0 ? 'ilimitados' : String(n);
}

/** El más barato del catálogo. Se calcula para que no envejezca al cambiar precios. */
function precioMinimo(): number {
  return Math.min(...PLANS.map(p => p.price));
}

/** El siguiente plan con más cupo de comprobantes. null si ya está en el tope. */
function siguientePlan(actual: PlanDef): PlanDef | null {
  return planesDeFamilia(actual.familia).find(
    p => p.limits.docs < 0 || p.limits.docs > actual.limits.docs,
  ) ?? null;
}

function adicionalesDe(team: { adicionales?: unknown }): string[] {
  return Array.isArray(team.adicionales)
    ? team.adicionales.filter((a): a is string => typeof a === 'string')
    : [];
}

/**
 * Los medidores que tienen sentido para este plan. Un tope en -1 no se pinta:
 * una barra de progreso sobre algo ilimitado no informa de nada.
 */
function construirMedidores(d: {
  planDef: PlanDef;
  docs: number; usuarios: number; estudiantes: number; whatsapp: number; sms: number;
}): Medidor[] {
  const L = d.planDef.limits;
  const todos: Medidor[] = [
    {
      clave: 'docs', etiqueta: 'Comprobantes este mes', icono: <TrendingUp style={ICONO} />,
      usado: d.docs, tope: L.docs,
      nota: `Quedan ${Math.max(0, L.docs - d.docs)} este mes.`,
    },
    {
      clave: 'usuarios', etiqueta: 'Usuarios', icono: <Users style={ICONO} />,
      usado: d.usuarios, tope: L.users,
      // Nunca se expulsa a nadie por un cambio de plan: lo que se corta es
      // agregar. Ver puedeAgregarUsuario.
      nota: d.usuarios >= L.users
        ? 'Para agregar más necesitas un plan mayor. Los actuales se quedan.'
        : `Puedes agregar ${L.users - d.usuarios} más.`,
    },
    {
      clave: 'estudiantes', etiqueta: 'Estudiantes activos', icono: <GraduationCap style={ICONO} />,
      usado: d.estudiantes, tope: L.estudiantes,
      nota: 'El tramo se elige por cuántos estudiantes tienes.',
    },
    {
      clave: 'whatsapp', etiqueta: 'Avisos por WhatsApp', icono: <MessageSquare style={ICONO} />,
      usado: d.whatsapp, tope: L.whatsappMensajes,
      nota: 'Se reinicia el día 1 de cada mes.',
    },
    {
      clave: 'sms', etiqueta: 'Avisos por SMS', icono: <Smartphone style={ICONO} />,
      usado: d.sms, tope: L.smsMensajes,
      nota: 'Se reinicia el día 1 de cada mes. El correo no tiene tope.',
    },
  ];
  return todos.filter(m => m.tope >= 0);
}

function Barra({ medidor }: { medidor: Medidor }) {
  const { usado, tope } = medidor;
  const pct = tope > 0 ? Math.min(100, Math.round((usado / tope) * 100)) : 100;
  const color = pct >= 100 ? 'error.main' : pct >= 80 ? 'warning.main' : '#3658e1';

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {medidor.icono}
          {medidor.etiqueta}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 700, color: pct >= 100 ? 'error.main' : 'text.primary' }}>
          {usado} / {tope}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 8, borderRadius: 4, bgcolor: 'grey.100',
          '& .MuiLinearProgress-bar': { borderRadius: 4, bgcolor: color },
        }}
      />
      <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.75 }}>
        {medidor.nota}
      </Typography>
    </Box>
  );
}

function EstadoChip({ estado, dias }: { estado: string; dias: number | null }) {
  const mapa: Record<string, { label: string; bgcolor: string; color: string }> = {
    'activa':            { label: 'Activa',                          bgcolor: '#ecfdf5', color: '#065f46' },
    'prueba':            { label: `Prueba · ${dias ?? PRUEBA.dias} días`, bgcolor: '#eff6ff', color: '#1e40af' },
    'prueba-por-vencer': { label: `Prueba · ${dias} ${dias === 1 ? 'día' : 'días'}`, bgcolor: '#fffbeb', color: '#92400e' },
    'mora':              { label: 'Pago pendiente',                   bgcolor: '#fff7ed', color: '#9a3412' },
    'solo-lectura':      { label: 'Solo lectura',                     bgcolor: '#fef2f2', color: '#991b1b' },
    'cerrada':           { label: 'Sin acceso',                       bgcolor: '#fef2f2', color: '#991b1b' },
    'sin-billing':       { label: 'Activa',                           bgcolor: '#ecfdf5', color: '#065f46' },
  };
  const info = mapa[estado];
  if (!info) return null;
  return (
    <Chip
      label={info.label}
      size="small"
      sx={{ bgcolor: info.bgcolor, color: info.color, fontWeight: 600, height: 22, fontSize: '0.6875rem', '& .MuiChip-label': { px: 1.25 } }}
    />
  );
}

/**
 * Tabla comparativa generada del catálogo.
 *
 * Las filas son los límites del modelo, no una lista de funciones: todos los
 * planes traen todas las funciones (decisión del negocio), así que una fila de
 * palomitas idénticas no diría nada. Lo que cambia entre planes son los topes.
 */
function Comparativa({ planes, actual }: { planes: PlanDef[]; actual: PlanDef }) {
  const filas: { etiqueta: string; valor: (p: PlanDef) => string }[] = [
    { etiqueta: 'Comprobantes/mes', valor: p => limiteTexto(p.limits.docs) },
    { etiqueta: 'Usuarios',         valor: p => limiteTexto(p.limits.users) },
    ...(planes.some(p => p.limits.estudiantes >= 0)
      ? [{ etiqueta: 'Estudiantes', valor: (p: PlanDef) => limiteTexto(p.limits.estudiantes) }]
      : []),
    ...(planes.some(p => p.limits.whatsappMensajes >= 0)
      ? [{ etiqueta: 'Avisos WhatsApp/mes', valor: (p: PlanDef) => limiteTexto(p.limits.whatsappMensajes) }]
      : []),
    ...(planes.some(p => p.limits.smsMensajes >= 0)
      ? [{ etiqueta: 'Avisos SMS/mes', valor: (p: PlanDef) => limiteTexto(p.limits.smsMensajes) }]
      : []),
    { etiqueta: 'Precio/mes', valor: p => `US$${p.price}` },
  ];

  return (
    <Card id="cambiar-plan" elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', mb: 2 }}>
      <CardContent sx={{ p: '20px !important' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', mb: 2 }}>
          Comparativa de planes
        </Typography>

        {/* La tabla scrollea sola: con cuatro tramos de colegio no entra en un
            teléfono, y sin esto el que se desplazaba era el body entero. */}
        <Box sx={{ overflowX: 'auto' }}>
          <Box sx={{ minWidth: 420 }}>
            <Box sx={{ display: 'flex', mb: 0.5 }}>
              <Box sx={{ flex: 1, minWidth: 130 }} />
              {planes.map(p => (
                <Typography key={p.key} variant="caption"
                  sx={{ width: 80, textAlign: 'center', fontWeight: 700, color: p.key === actual.key ? 'primary.main' : 'text.secondary' }}>
                  {p.name}
                </Typography>
              ))}
            </Box>
            <Divider />
            {filas.map((fila, i) => (
              <Box key={fila.etiqueta}>
                <Box sx={{ display: 'flex', alignItems: 'center', py: 1.25 }}>
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 130, color: 'text.secondary' }}>
                    {fila.etiqueta}
                  </Typography>
                  {planes.map(p => (
                    <Typography key={p.key} variant="caption"
                      sx={{ width: 80, textAlign: 'center', fontWeight: p.key === actual.key ? 700 : 400, color: p.key === actual.key ? 'primary.main' : 'text.secondary' }}>
                      {fila.valor(p)}
                    </Typography>
                  ))}
                </Box>
                {i < filas.length - 1 && <Divider />}
              </Box>
            ))}
          </Box>
        </Box>

        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 2 }}>
          Todos los planes incluyen el sistema completo: contabilidad, inventario,
          caja, roles y reportes 606/607.
        </Typography>
      </CardContent>
    </Card>
  );
}

// ─── Downgrade programado en Stripe ───────────────────────────────────────────

/**
 * Si hay una bajada de plan esperando al fin del período, cuál y cuándo.
 *
 * Es la única consulta a Stripe de la página. Si falla se devuelve null y la
 * pantalla se pinta igual: no poder decir «tienes un cambio programado» no
 * justifica dejar al cliente sin ver su plan.
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

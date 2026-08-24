/**
 * Las piezas que se pintan en el servidor: el banner de estado, la tarjeta del
 * plan con sus medidores, la comparativa y el bloque de cobro.
 *
 * Ninguna tiene estado, así que ninguna necesita ser cliente. La única que
 * "se abre" es la comparativa, y lo hace con <details>: plegar una tabla no
 * justifica mandar un componente entero al navegador.
 *
 * Todo lo que se lee aquí sale del catálogo o del estado real de la
 * suscripción. Si un número de esta pantalla estuviera escrito a mano, sería
 * el número que se queda viejo.
 */

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ChevronDown, CreditCard, TriangleAlert } from 'lucide-react';

import { LazoZero } from '@/lib/marca/isotipo';
import { limiteTexto, type PlanDef } from '@/lib/config/plans';
import type { Suscripcion } from '@/lib/suscripcion/estado';
import { customerPortalAction } from '@/lib/payments/actions';
import {
  AZUL, NAVY, GRIS, ROJO, AMBAR, TINTA, BORDE, BORDE_TENUE, FILA_BORDE,
  TEXTO_MEDIO, TEXTO_SUAVE, RADIO, TONO_ESTADO, usd, numero,
} from './_paleta';

// ─── Banner de estado ────────────────────────────────────────────────────────

export interface DatosBanner {
  /** Encima de la cifra, en versalitas. */
  etiqueta: string;
  /** Lo grande. Un plazo, un monto o una palabra. */
  cifra: string;
  pie: string | null;
  titulo: string;
  texto: string;
  color: string;
  fondo: string;
  borde: string;
  /** Botón principal. `null` cuando no hay nada que el usuario pueda hacer. */
  cta: { texto: string; portal: boolean; href?: string } | null;
}

export function BannerEstado({ datos }: { datos: DatosBanner }) {
  return (
    <Box sx={{
      borderRadius: RADIO, border: `1px solid ${datos.borde}`, bgcolor: datos.fondo,
      p: { xs: '18px 18px', sm: '22px 24px' }, display: 'flex',
      flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 2, sm: 3.25 },
      alignItems: { sm: 'center' },
    }}>
      <Box sx={{ flex: '0 0 auto', minWidth: { sm: 132 } }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: datos.color, opacity: 0.85 }}>
          {datos.etiqueta}
        </Typography>
        <Typography sx={{
          fontSize: datos.cifra.length > 10 ? '1.75rem' : '2.5rem',
          fontWeight: 700, letterSpacing: '-1.4px', lineHeight: 1.05, mt: 0.75, color: datos.color,
        }}>
          {datos.cifra}
        </Typography>
        {datos.pie && (
          <Typography sx={{ fontSize: '0.75rem', color: datos.color, opacity: 0.8, mt: 0.5 }}>
            {datos.pie}
          </Typography>
        )}
      </Box>

      <Box sx={{ width: { sm: '1px' }, height: { xs: '1px', sm: 'auto' }, alignSelf: 'stretch', bgcolor: datos.borde }} />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '1.03rem', fontWeight: 700, letterSpacing: '-.2px', color: datos.color }}>
          {datos.titulo}
        </Typography>
        <Typography sx={{ fontSize: '0.85rem', color: TEXTO_MEDIO, lineHeight: 1.55, mt: 0.75, maxWidth: 560 }}>
          {datos.texto}
        </Typography>
        {datos.cta && (
          <Box sx={{ mt: 1.75 }}>
            {datos.cta.portal ? (
              <Box component="form" action={customerPortalAction}>
                <Button type="submit" variant="contained" disableElevation
                  startIcon={<CreditCard size={15} />}
                  sx={{ height: 38, borderRadius: '10px', textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem', bgcolor: datos.color, '&:hover': { bgcolor: datos.color, filter: 'brightness(.9)' } }}>
                  {datos.cta.texto}
                </Button>
              </Box>
            ) : (
              // `component="a"` y no `component={Link}`: pasar el componente
              // Link desde el servidor a un Button de MUI es pasarle una
              // función a un componente cliente, y Next lo rechaza. El destino
              // es un ancla de la misma página, así que no hace falta Link.
              <Button component="a" href={datos.cta.href ?? '#planes'} variant="contained" disableElevation
                sx={{ height: 38, borderRadius: '10px', textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem', bgcolor: datos.color, '&:hover': { bgcolor: datos.color, filter: 'brightness(.9)' } }}>
                {datos.cta.texto}
              </Button>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

// ─── Medidores ───────────────────────────────────────────────────────────────

export interface Medidor {
  clave: string;
  etiqueta: string;
  usado: number;
  /** -1 = sin tope. */
  tope: number;
  nota: string;
  /**
   * No dibujar el ∞ aunque no haya tope.
   *
   * Existe para el caso de la cuenta en solo lectura: ahí `getPlanLimit`
   * devuelve -1 —el tope de la prueba— pero quien no puede emitir nada no
   * tiene «comprobantes ilimitados», y el lazo diría justo eso.
   */
  sinLazo?: boolean;
}

/**
 * Un medidor.
 *
 * Sin tope NO se pinta una barra llena. La maqueta la pintaba al 100% en azul,
 * y una barra completa dice «llegaste al límite» — exactamente lo contrario de
 * lo que pasa. Se deja el carril vacío y el lazo ∞ al lado del número, que es
 * como la página pública ya dice «esto no se acaba».
 */
function Barra({ medidor }: { medidor: Medidor }) {
  const sinTope = medidor.tope < 0;
  const pct = sinTope || medidor.tope === 0
    ? 0
    : Math.min(100, Math.round((medidor.usado / medidor.tope) * 100));
  const color = sinTope ? AZUL : pct >= 100 ? ROJO : pct >= 80 ? AMBAR : AZUL;

  return (
    // Sin bordes propios: las separaciones las dibuja el gap de 1px de la
    // rejilla que lo contiene. Con `borderRight` por celda, la última de cada
    // fila pintaba una raya justo encima del borde de la tarjeta, y con cinco
    // medidores en tres columnas quedaba a mitad del ancho.
    <Box sx={{ p: '16px 20px', bgcolor: '#fff' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.25 }}>
        <Typography sx={{ fontSize: '0.78rem', color: TEXTO_SUAVE, fontWeight: 500 }}>
          {medidor.etiqueta}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.625, flexShrink: 0 }}>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color }}>
            {sinTope ? numero(medidor.usado) : `${numero(medidor.usado)} / ${numero(medidor.tope)}`}
          </Typography>
          {sinTope && !medidor.sinLazo && <LazoZero alto={13} titulo="Sin tope" />}
        </Box>
      </Box>
      <Box sx={{ height: 6, borderRadius: '4px', bgcolor: BORDE_TENUE, mt: 1.125, overflow: 'hidden' }}>
        <Box sx={{ height: '100%', width: `${pct}%`, bgcolor: color, borderRadius: '4px' }} />
      </Box>
      <Typography sx={{ fontSize: '0.72rem', color: GRIS, mt: 0.875, lineHeight: 1.45 }}>
        {medidor.nota}
      </Typography>
    </Box>
  );
}

// ─── Tarjeta del plan actual ─────────────────────────────────────────────────

export function TarjetaPlan({
  plan, linea, suscripcion, total, desglose, medidores, alerta, notaDeCobro,
}: {
  plan: PlanDef;
  /** Cómo se le vende la combinación plan+adicionales («Zero POS + ERP»). */
  linea: { nombre: string; descripcion: string } | null;
  suscripcion: Suscripcion;
  total: number;
  /** De qué está hecho el total. Vacío cuando el plan va solo. */
  desglose: { concepto: string; monto: number }[];
  medidores: Medidor[];
  /** Un tope cerca o pasado. null cuando no hay nada que advertir. */
  alerta: { titulo: string; texto: string } | null;
  /** Cuándo y cómo se cobra. Una línea. */
  notaDeCobro: string;
}) {
  const estado = TONO_ESTADO[suscripcion.estado];
  const sinPlan = plan.key === 'free';

  return (
    <Box sx={{ borderRadius: RADIO, border: `1px solid ${BORDE}`, bgcolor: '#fff', overflow: 'hidden' }}>
      <Box sx={{ p: { xs: '18px 20px', sm: '20px 24px 18px' }, display: 'flex', alignItems: 'flex-start', gap: 3, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 240 }}>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: GRIS }}>
            Tu plan
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mt: 0.875, flexWrap: 'wrap' }}>
            <Typography component="h2" sx={{ fontSize: '1.4375rem', fontWeight: 700, letterSpacing: '-.5px', color: TINTA }}>
              {sinPlan ? 'Sin plan' : linea ? `${plan.name} · ${linea.nombre}` : plan.name}
            </Typography>
            <Box component="span" sx={{
              fontSize: '0.72rem', fontWeight: 700, color: estado.color, bgcolor: estado.fondo,
              borderRadius: '7px', px: 1.125, py: 0.375, whiteSpace: 'nowrap',
            }}>
              {estado.texto}
            </Box>
          </Box>
          <Typography sx={{ color: GRIS, fontSize: '0.8125rem', mt: 0.75, lineHeight: 1.5, maxWidth: 440 }}>
            {sinPlan
              ? 'Tu empresa no tiene un plan contratado. Elige uno abajo para empezar a emitir.'
              : `${linea?.descripcion ?? ''} ${plan.ui.description}.`.trim()}
          </Typography>
        </Box>

        {!sinPlan && (
          <Box sx={{ textAlign: { sm: 'right' } }}>
            <Typography sx={{ fontSize: '1.625rem', fontWeight: 700, letterSpacing: '-.6px', color: TINTA }}>
              {usd(total)}
              <Box component="span" sx={{ fontSize: '0.875rem', color: GRIS, fontWeight: 500 }}>/mes</Box>
            </Typography>

            {/* De qué está hecho el total.
                Sin esto la pantalla se contradice a nueve dólares de distancia:
                arriba «US$74/mes» y abajo un plan que la rejilla marca a US$65.
                La diferencia son los adicionales, y callarla es justo el tipo
                de duda que acaba en soporte. */}
            {desglose.length > 1 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.375, mt: 1, alignItems: { sm: 'flex-end' } }}>
                {desglose.map(d => (
                  <Typography key={d.concepto} sx={{ fontSize: '0.78rem', color: TEXTO_SUAVE, fontVariantNumeric: 'tabular-nums' }}>
                    <Box component="span" sx={{ color: GRIS }}>{d.concepto}</Box>{' '}
                    <Box component="strong" sx={{ fontWeight: 600 }}>{usd(d.monto)}</Box>
                  </Typography>
                ))}
              </Box>
            )}

            <Typography sx={{ fontSize: '0.75rem', color: GRIS, mt: 1.125, maxWidth: 260 }}>
              {notaDeCobro}
            </Typography>
          </Box>
        )}
      </Box>

      {medidores.length > 0 && (
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: `repeat(${Math.min(medidores.length, 3)}, 1fr)` },
          gap: '1px', bgcolor: BORDE_TENUE, borderTop: `1px solid ${BORDE_TENUE}`,
        }}>
          {medidores.map(m => <Barra key={m.clave} medidor={m} />)}
        </Box>
      )}

      {alerta && (
        <Box sx={{ display: 'flex', gap: 1.375, alignItems: 'flex-start', p: '14px 24px', bgcolor: '#fffaf0', borderTop: '1px solid #f5e6c8' }}>
          <TriangleAlert size={17} color={AMBAR} style={{ flexShrink: 0, marginTop: 1 }} />
          <Box>
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: AMBAR }}>{alerta.titulo}</Typography>
            <Typography sx={{ fontSize: '0.78rem', color: TEXTO_MEDIO, mt: 0.375, lineHeight: 1.5 }}>{alerta.texto}</Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ─── Comparativa ─────────────────────────────────────────────────────────────

/**
 * Los topes de cada plan, uno al lado del otro.
 *
 * Las filas son LÍMITES y no funcionalidades: todos los planes traen todas las
 * funciones (decisión del negocio), así que una rejilla de palomitas idénticas
 * no ayudaría a elegir. Lo que cambia entre planes son los topes.
 *
 * Va plegada porque esta pantalla es de ajustes: quien entra ya compró y casi
 * nunca viene a comparar. Cuando sí viene, la quiere entera.
 */
export function Comparativa({
  planes, actual, precios,
}: {
  planes: PlanDef[];
  actual: PlanDef;
  /**
   * El precio real de cada plan, adicionales de la línea incluidos, o `null`
   * cuando su familia se cotiza. Sin respaldo a `p.price`: ese respaldo es
   * justo el que devolvería la cifra que se acaba de retirar.
   */
  precios: Record<string, number | null>;
}) {
  type Celda = { texto: string } | { sinTope: true };
  const filas: { etiqueta: string; valor: (p: PlanDef) => Celda }[] = [
    ...(planes.some(p => p.limits.estudiantes >= 0)
      ? [{ etiqueta: 'Estudiantes', valor: (p: PlanDef): Celda => ({ texto: limiteTexto(p.limits.estudiantes) }) }]
      : []),
    {
      etiqueta: 'Comprobantes/mes',
      valor: (p): Celda => p.limits.docs < 0 ? { sinTope: true } : { texto: numero(p.limits.docs) },
    },
    { etiqueta: 'Usuarios', valor: (p): Celda => ({ texto: numero(p.limits.users) }) },
    ...(planes.some(p => p.limits.whatsappMensajes >= 0)
      ? [{ etiqueta: 'Avisos WhatsApp/mes', valor: (p: PlanDef): Celda => ({ texto: limiteTexto(p.limits.whatsappMensajes) }) }]
      : []),
    ...(planes.some(p => p.limits.smsMensajes >= 0)
      ? [{ etiqueta: 'Avisos SMS/mes', valor: (p: PlanDef): Celda => ({ texto: limiteTexto(p.limits.smsMensajes) }) }]
      : []),
    // La fila del precio desaparece entera cuando ninguno de los planes que se
    // comparan publica cifra: una columna de «Bajo cotización» repetida cuatro
    // veces no compara nada y ocupa el sitio de lo que sí distingue un plan de
    // otro. El aviso de que el precio se cotiza ya está arriba, en la rejilla.
    ...(planes.some(p => precios[p.key] !== null)
      ? [{
        etiqueta: 'Precio/mes',
        valor: (p: PlanDef): Celda => {
          const v = precios[p.key];
          return { texto: v === null || v === undefined ? 'Bajo cotización' : usd(v) };
        },
      }]
      : []),
  ];

  return (
    <Box component="details" sx={{
      borderRadius: RADIO, border: `1px solid ${BORDE}`, bgcolor: '#fff', overflow: 'hidden',
      '&[open] .chevron': { transform: 'rotate(180deg)' },
    }}>
      <Box component="summary" sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5,
        p: '16px 24px', cursor: 'pointer', listStyle: 'none',
        '&::-webkit-details-marker': { display: 'none' },
        '&:hover': { bgcolor: '#fafbfe' },
      }}>
        <Box>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, color: TINTA }}>Comparar los planes</Typography>
          <Typography sx={{ fontSize: '0.78rem', color: GRIS, mt: 0.375 }}>
            {/* No se anuncia una fila de precios que puede no existir: la
                tabla de una familia que se cotiza no la lleva. */}
            {planes.some(p => precios[p.key] !== null)
              ? 'Topes, usuarios y precio de cada plan, uno al lado del otro.'
              : 'Topes y usuarios de cada plan, uno al lado del otro.'}
          </Typography>
        </Box>
        <Box className="chevron" sx={{ display: 'grid', placeItems: 'center', transition: 'transform .22s', flexShrink: 0 }}>
          <ChevronDown size={17} color={TEXTO_SUAVE} />
        </Box>
      </Box>

      {/* La tabla scrollea sola: con cuatro tramos no entra en un teléfono, y
          sin esto el que se desplazaba era el body entero. */}
      <Box sx={{ p: '0 24px 20px', overflowX: 'auto' }}>
        <Box component="table" sx={{ width: '100%', minWidth: 420, borderCollapse: 'collapse' }}>
          <Box component="thead">
            <Box component="tr">
              <Box component="th" sx={{ borderBottom: `1px solid ${BORDE_TENUE}`, p: '10px 0' }} />
              {planes.map(p => (
                <Box component="th" key={p.key} sx={{
                  textAlign: 'right', p: '10px 0 10px 14px', fontSize: '0.78rem', fontWeight: 700,
                  whiteSpace: 'nowrap', borderBottom: `1px solid ${BORDE_TENUE}`,
                  color: p.key === actual.key ? AZUL : TEXTO_MEDIO,
                }}>
                  {p.name}
                </Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {filas.map(fila => (
              <Box component="tr" key={fila.etiqueta}>
                <Box component="td" sx={{ p: '11px 0', fontSize: '0.8125rem', color: TEXTO_MEDIO, borderBottom: `1px solid ${FILA_BORDE}` }}>
                  {fila.etiqueta}
                </Box>
                {planes.map(p => {
                  const celda = fila.valor(p);
                  const mio = p.key === actual.key;
                  return (
                    <Box component="td" key={p.key} sx={{
                      p: '11px 0 11px 14px', textAlign: 'right', fontSize: '0.8125rem',
                      fontVariantNumeric: 'tabular-nums', borderBottom: `1px solid ${FILA_BORDE}`,
                      fontWeight: mio ? 700 : 400, color: mio ? AZUL : TEXTO_MEDIO,
                    }}>
                      {'sinTope' in celda
                        ? <Box sx={{ display: 'inline-flex', verticalAlign: '-2px' }}><LazoZero alto={14} titulo="Sin tope" /></Box>
                        : celda.texto}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.75 }}>
          <LazoZero alto={12} />
          <Typography sx={{ fontSize: '0.75rem', color: GRIS, lineHeight: 1.5 }}>
            = sin tope. Todos los planes incluyen el sistema completo: contabilidad,
            inventario, caja, roles y reportes 606/607.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

// ─── Uso del mes ─────────────────────────────────────────────────────────────

export function UsoDelMes({
  tipos, pie,
}: {
  tipos: { etiqueta: string; total: number }[];
  pie: string;
}) {
  const mayor = Math.max(1, ...tipos.map(t => t.total));
  const mes = new Date().toLocaleDateString('es-DO', { month: 'long' });

  return (
    <Box sx={{ borderRadius: RADIO, border: `1px solid ${BORDE}`, bgcolor: '#fff', p: '18px 22px' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5 }}>
        <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, color: TINTA }}>Uso de este mes</Typography>
        <Typography sx={{ fontSize: '0.75rem', color: GRIS, textTransform: 'capitalize' }}>{mes}</Typography>
      </Box>

      {tipos.length === 0 ? (
        <Typography sx={{ fontSize: '0.8125rem', color: GRIS, mt: 1.5, lineHeight: 1.55 }}>
          Todavía no has emitido comprobantes este mes.
        </Typography>
      ) : (
        <Box sx={{ mt: 1.5 }}>
          {tipos.map(t => (
            <Box key={t.etiqueta} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.125, borderBottom: `1px solid ${FILA_BORDE}` }}>
              <Typography sx={{ flex: 1, fontSize: '0.8125rem', color: TEXTO_MEDIO, minWidth: 0 }}>{t.etiqueta}</Typography>
              <Box sx={{ width: 90, height: 5, borderRadius: '3px', bgcolor: BORDE_TENUE, overflow: 'hidden', flexShrink: 0 }}>
                <Box sx={{ height: '100%', width: `${Math.round((t.total / mayor) * 100)}%`, bgcolor: AZUL, borderRadius: '3px' }} />
              </Box>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: TINTA }}>
                {numero(t.total)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      <Typography sx={{ fontSize: '0.75rem', color: GRIS, mt: 1.5, lineHeight: 1.5 }}>{pie}</Typography>
    </Box>
  );
}

// ─── Cobro ───────────────────────────────────────────────────────────────────

/**
 * Método de pago y salida.
 *
 * NO se enseña «Visa ···4242» como en la maqueta: `tieneMetodoDePago` devuelve
 * un booleano y llegar a la marca y los últimos cuatro dígitos son dos
 * expansiones más contra Stripe en cada carga. Inventarse la marca sería peor
 * que no ponerla; los datos de la tarjeta se ven y se cambian en el portal,
 * que es donde viven.
 */
export function BloqueCobro({
  tieneTarjeta, tieneCliente, legal, esInterna,
}: {
  tieneTarjeta: boolean;
  /** Sin cliente en Stripe no hay portal al que ir. */
  tieneCliente: boolean;
  legal: string;
  /** Cuenta con acceso concedido por nosotros: no hay nada que cobrar. */
  esInterna: boolean;
}) {
  return (
    <Box sx={{ borderRadius: RADIO, border: `1px solid ${BORDE}`, bgcolor: '#fff', p: '18px 22px', display: 'flex', flexDirection: 'column' }}>
      <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, color: TINTA }}>Cobro</Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.75, p: 1.5, border: `1px solid ${BORDE}`, borderRadius: '11px', bgcolor: '#fafbfe' }}>
        <Box sx={{
          width: 38, height: 26, borderRadius: '5px', display: 'grid', placeItems: 'center',
          bgcolor: tieneTarjeta ? NAVY : '#9aa0ac', color: '#fff', flexShrink: 0,
        }}>
          <CreditCard size={15} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: TINTA }}>
            {tieneTarjeta ? 'Método de pago registrado' : 'Sin método de pago'}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: GRIS, mt: 0.25, lineHeight: 1.45 }}>
            {esInterna
              ? 'Cuenta interna: no se cobra.'
              : tieneTarjeta
                ? 'Los datos de la tarjeta se ven y se cambian en Stripe.'
                : 'Hace falta para que la suscripción se cobre sola.'}
          </Typography>
        </Box>
      </Box>

      {tieneCliente ? (
        <>
          <Box component="form" action={customerPortalAction} sx={{ mt: 1.25 }}>
            <Button type="submit" fullWidth variant="outlined"
              sx={{ height: 36, borderRadius: '9px', textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', borderColor: '#d7dae5', color: TINTA, '&:hover': { borderColor: NAVY, bgcolor: '#f7f9ff' } }}>
              {tieneTarjeta ? 'Cambiar tarjeta' : 'Agregar tarjeta'}
            </Button>
          </Box>

          <Box sx={{ flex: 1, minHeight: 10 }} />
          <Typography sx={{ fontSize: '0.75rem', color: GRIS, lineHeight: 1.55, borderTop: `1px solid ${FILA_BORDE}`, pt: 1.5, mt: 1.5 }}>
            {legal}
          </Typography>

          {/* Cancelar VISIBLE, aunque lleve al mismo portal.
              La cancelación vive dentro de Stripe, y con «cambiar tarjeta»
              como única puerta nadie que quiera irse la encuentra. Esconder la
              salida no retiene a nadie: solo hace que escriban a soporte,
              molestos, para preguntar cómo. */}
          <Box component="form" action={customerPortalAction} sx={{ mt: 1.25 }}>
            <Button type="submit" variant="text"
              sx={{ p: 0, minWidth: 0, textTransform: 'none', fontWeight: 500, fontSize: '0.75rem', color: GRIS, textDecoration: 'underline', '&:hover': { bgcolor: 'transparent', color: TINTA } }}>
              Cancelar la suscripción
            </Button>
          </Box>
        </>
      ) : (
        <>
          <Box sx={{ flex: 1, minHeight: 10 }} />
          <Typography sx={{ fontSize: '0.75rem', color: GRIS, lineHeight: 1.55, borderTop: `1px solid ${FILA_BORDE}`, pt: 1.5, mt: 1.5 }}>
            {legal}
          </Typography>
        </>
      )}
    </Box>
  );
}

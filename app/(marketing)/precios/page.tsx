/**
 * Planes y precios — armados desde el catálogo, nunca escritos a mano.
 *
 * Todo lo que se ve aquí (los ocho planes, sus precios, sus topes, qué módulos
 * traen y qué funcionalidades incluyen) sale de `lib/config/plans.ts`, que es
 * el mismo archivo del que salen el checkout de Stripe y los límites que se
 * aplican dentro del sistema. Una tabla de precios copiada a mano se
 * desincroniza del cobro real el día que suba un plan, y esto factura.
 *
 * Server Component: se limita a transformar constantes en datos de vista. No
 * lee sesión ni base de datos —es una página pública— así que Next puede
 * servirla sin trabajo por petición.
 */

import type { Metadata } from 'next';
import {
  ADDONS, LINEAS_PRODUCTO, planesDeLinea, type Feature, type PlanDef,
} from '@/lib/config/plans';
import { MODULE_LABELS, type ModuleKey } from '@/lib/config/modules';
import { PRUEBA, diasDePrueba } from '@/lib/config/suscripcion';
import { Contenedor, IconoWhatsApp, Iconos, LazoDeFondo, LlamadoFinal, TarjetasContacto } from '../_piezas';
import { Acordeon, type Pregunta } from '../_acordeon';
import { Planes, type Celda, type Grupo, type LineaVista, type PlanVista } from './_planes';

export const metadata: Metadata = {
  title: 'Planes y precios',
  description:
    'Los ocho planes de Zero con sus precios, topes y funcionalidades: facturación electrónica, punto de venta y colegios. Sin contrato mínimo.',
};

// ─── Traductores de catálogo a celda ─────────────────────────────────────────

const num = (n: number) => n.toLocaleString('es-DO');

/** Tope por el que SÍ se cobra: -1 significa que no hay techo. */
function celdaTope(n: number, sufijo = ''): Celda {
  if (n < 0) return { tipo: 'infinito' };
  return { tipo: 'texto', texto: `${num(n)}${sufijo}` };
}

/** Tope que puede no aplicar en esta línea (-1 = el plan ni siquiera lo tiene). */
function celdaOpcional(n: number, sufijo = ''): Celda {
  if (n < 0) return { tipo: 'vacio' };
  return { tipo: 'texto', texto: `${num(n)}${sufijo}` };
}

const celdaFeature = (p: PlanDef, f: Feature): Celda =>
  p.features.includes(f) ? { tipo: 'check' } : { tipo: 'vacio' };

const celdaModulo = (p: PlanDef, m: ModuleKey): Celda =>
  p.modulos.includes(m) ? { tipo: 'check' } : { tipo: 'vacio' };

/** Fila cuyo valor es el mismo para todos los planes de la línea. */
const filaFija = (planes: PlanDef[], celda: Celda) => planes.map(() => celda);

// ─── Construcción de la tabla comparativa ────────────────────────────────────

function gruposDeLinea(planes: PlanDef[], conPos: boolean, esColegio: boolean): Grupo[] {
  const posAddon = ADDONS.find(a => a.key === 'pos');
  const check: Celda = { tipo: 'check' };

  const grupos: Grupo[] = [
    {
      titulo: 'Facturación y documentos',
      resumen: 'Facturas, cotizaciones, notas de crédito y más',
      icono: 'factura',
      celdas: planes.map(p => celdaTope(p.limits.docs)),
      filas: [
        { nombre: 'Comprobantes e-CF por mes', celdas: planes.map(p => celdaTope(p.limits.docs)) },
        { nombre: 'Facturas de venta y consumo', celdas: filaFija(planes, check) },
        { nombre: 'Notas de crédito y débito', celdas: filaFija(planes, check) },
        { nombre: 'Anulación de rangos (ANECF)', celdas: filaFija(planes, check) },
        { nombre: 'Cotizaciones', celdas: planes.map(p => celdaFeature(p, 'cotizaciones')) },
        { nombre: 'Facturas recurrentes', celdas: planes.map(p => celdaFeature(p, 'facturas-recurrentes')) },
        { nombre: 'Impresoras fiscales', celdas: planes.map(p => celdaFeature(p, 'impresoras')) },
      ],
    },
    {
      titulo: 'Cobros y caja',
      resumen: 'Cuentas por cobrar, links de pago y cuadre de caja',
      icono: 'tarjeta',
      celdas: planes.map(p => celdaFeature(p, 'caja')),
      filas: [
        { nombre: 'Cuentas por cobrar', celdas: filaFija(planes, check) },
        { nombre: 'Pagos recibidos y conciliación', celdas: filaFija(planes, check) },
        { nombre: 'Links de pago (CardNet, Azul)', celdas: filaFija(planes, check) },
        { nombre: 'Turnos de caja', celdas: planes.map(p => celdaFeature(p, 'caja')) },
        { nombre: 'Cuadre y cierre de caja', celdas: planes.map(p => celdaFeature(p, 'caja')) },
      ],
    },
    {
      titulo: 'Clientes, inventario y compras',
      resumen: 'Clientes, productos, stock y gastos',
      icono: 'administracion',
      celdas: planes.map(p => celdaFeature(p, 'inventario-avanzado')),
      filas: [
        { nombre: 'Clientes y contactos', celdas: planes.map(p => celdaFeature(p, 'clientes')) },
        { nombre: 'Productos y existencias', celdas: planes.map(p => celdaFeature(p, 'productos')) },
        { nombre: 'Almacenes, listas de precios y vendedores', celdas: planes.map(p => celdaFeature(p, 'inventario-avanzado')) },
        { nombre: 'Facturas recibidas y gastos', celdas: filaFija(planes, check) },
        { nombre: 'Registro de actividad', celdas: planes.map(p => celdaFeature(p, 'actividad')) },
      ],
    },
    {
      titulo: 'Contabilidad',
      resumen: 'Libro diario, balances y reportes fiscales',
      icono: 'contabilidad',
      celdas: planes.map(p => celdaFeature(p, 'contabilidad-avanzada')),
      filas: [
        { nombre: 'Catálogo de cuentas', celdas: planes.map(p => celdaFeature(p, 'contabilidad-avanzada')) },
        { nombre: 'Libro diario y asientos', celdas: planes.map(p => celdaFeature(p, 'contabilidad-avanzada')) },
        { nombre: 'Mayor general y balance de comprobación', celdas: planes.map(p => celdaFeature(p, 'contabilidad-avanzada')) },
        { nombre: 'Estado de resultados y balance general', celdas: planes.map(p => celdaFeature(p, 'contabilidad-avanzada')) },
        { nombre: 'Activos fijos y cierre de ejercicio', celdas: planes.map(p => celdaFeature(p, 'contabilidad-avanzada')) },
        { nombre: 'Reportes 606 y 607', celdas: filaFija(planes, check) },
      ],
    },
    {
      titulo: 'Usuarios y permisos',
      resumen: 'Cuántos entran y qué puede tocar cada uno',
      icono: 'usuarios',
      celdas: planes.map(p => celdaTope(p.limits.users)),
      filas: [
        { nombre: 'Usuarios incluidos', celdas: planes.map(p => celdaTope(p.limits.users)) },
        { nombre: 'Roles a medida', celdas: planes.map(p => celdaFeature(p, 'roles-usuarios')) },
        { nombre: 'Permisos por usuario', celdas: planes.map(p => celdaFeature(p, 'roles-usuarios')) },
        { nombre: 'Reportes y tableros', celdas: planes.map(p => celdaFeature(p, 'reportes')) },
      ],
    },
    {
      titulo: 'Módulos',
      resumen: 'Qué espacios del sistema se abren',
      icono: 'cuadros',
      celdas: planes.map(p => ({ tipo: 'texto', texto: `${p.modulos.length} módulos` }) as Celda),
      filas: [
        { nombre: MODULE_LABELS.facturacion, celdas: planes.map(p => celdaModulo(p, 'facturacion')) },
        { nombre: MODULE_LABELS.administracion, celdas: planes.map(p => celdaModulo(p, 'administracion')) },
        {
          // En la línea con POS ya viene sumado en el precio de arriba; en la
          // línea sin él se dice cuánto cuesta, que es la pregunta real.
          nombre: MODULE_LABELS.pos,
          celdas: planes.map(p =>
            p.modulos.includes('pos') || conPos
              ? check
              : ({ tipo: 'texto', texto: `+US$${posAddon?.price ?? 0}` } as Celda),
          ),
        },
        { nombre: MODULE_LABELS.escolar, celdas: planes.map(p => celdaModulo(p, 'escolar')) },
      ],
    },
  ];

  // El bloque de colegio solo se enseña en la línea que lo vende. En las otras
  // sería una columna de guiones ocupando media pantalla.
  if (esColegio) {
    grupos.push({
      titulo: 'Colegio',
      resumen: 'Estudiantes, cuotas, portal de padres y avisos',
      icono: 'colegio',
      celdas: planes.map(p => celdaOpcional(p.limits.estudiantes)),
      filas: [
        { nombre: 'Estudiantes del tramo', celdas: planes.map(p => celdaOpcional(p.limits.estudiantes)) },
        { nombre: 'Matrículas, cursos y cargos por estudiante', celdas: planes.map(p => celdaModulo(p, 'escolar')) },
        { nombre: 'Portal de padres con links de pago', celdas: planes.map(p => celdaModulo(p, 'escolar')) },
        { nombre: 'Recargo por mora automático', celdas: planes.map(p => celdaModulo(p, 'escolar')) },
        { nombre: 'Avisos por WhatsApp al mes', celdas: planes.map(p => celdaOpcional(p.limits.whatsappMensajes)) },
        { nombre: 'Avisos por SMS al mes', celdas: planes.map(p => celdaOpcional(p.limits.smsMensajes)) },
        { nombre: 'Avisos por correo', celdas: planes.map(p => (p.modulos.includes('escolar') ? ({ tipo: 'texto', texto: 'Sin límite' } as Celda) : { tipo: 'vacio' })) },
      ],
    });
  }

  return grupos;
}

// ─── Vista de cada línea comercial ───────────────────────────────────────────

function vistaDeLinea(lineaKey: string): LineaVista | null {
  const linea = LINEAS_PRODUCTO.find(l => l.key === lineaKey);
  if (!linea) return null;

  const conPrecio = planesDeLinea(linea.key);
  const defs = conPrecio.map(x => x.plan);
  const esColegio = linea.familia === 'colegio';
  const conPos = linea.addons.includes('pos') || esColegio;

  const planes: PlanVista[] = conPrecio.map(({ plan, precio }, i) => {
    // `-1` es el «sin tope» del catálogo. La tarjeta lo pinta con el lazo.
    const comprobantes = plan.limits.docs < 0
      ? { etiqueta: 'Comprobantes/mes', valor: 'Sin tope', sinTope: true }
      : { etiqueta: 'Comprobantes/mes', valor: num(plan.limits.docs) };

    const topes: PlanVista['topes'] = esColegio
      ? [
          { etiqueta: 'Estudiantes', valor: `Hasta ${num(plan.limits.estudiantes)}` },
          { etiqueta: 'Usuarios', valor: num(plan.limits.users) },
          { etiqueta: 'Avisos WhatsApp/mes', valor: num(plan.limits.whatsappMensajes) },
          comprobantes,
        ]
      : [
          comprobantes,
          { etiqueta: 'Usuarios', valor: num(plan.limits.users) },
          { etiqueta: 'Punto de venta', valor: conPos ? 'Incluido' : 'No incluido' },
        ];

    return {
      key: plan.key,
      nombre: plan.name,
      descripcion: plan.ui.description,
      precio,
      destacado: plan.ui.highlighted,
      topes,
      // «Todo X, más» sale del plan anterior de la misma línea, no de un texto
      // fijo: si mañana se reordena el catálogo, la escalera se reordena sola.
      incluyeTitulo: i === 0 ? 'Incluye' : `Todo ${defs[i - 1].name}, más`,
      incluye: plan.ui.marketingFeatures,
      docs: plan.limits.docs,
      usuarios: plan.limits.users,
      estudiantes: plan.limits.estudiantes,
    };
  });

  return {
    key: linea.key,
    nombre: linea.nombre,
    descripcion: linea.descripcion,
    gancho: linea.gancho,
    esColegio,
    // De la familia de la línea: 15 en e-CF, 30 en colegio. Es el mismo número
    // que `crearSuscripcionDePrueba` le pasa a Stripe como `trial_period_days`,
    // así que la página no puede prometer una cosa y el cobro contar otra.
    diasPrueba: diasDePrueba(linea.familia),
    conPos,
    planes,
    grupos: gruposDeLinea(defs, conPos, esColegio),
  };
}

// ─── Preguntas frecuentes ────────────────────────────────────────────────────
// Escritas contra lo que el sistema HACE (lib/config/suscripcion.ts), no contra
// lo que quedaría bonito. La maqueta prometía que el excedente de comprobantes
// se factura por paquetes y que nunca se bloquea la emisión: hoy `LIMITES.docs`
// tiene efecto «bloquea», así que esa respuesta se cambió por la verdadera.

const FAQS: Pregunta[] = [
  {
    pregunta: '¿Los precios incluyen ITBIS?',
    respuesta:
      'No. Todos los precios están en dólares estadounidenses y sin ITBIS. En la factura se aplica el impuesto que corresponda según tu condición fiscal.',
  },
  {
    pregunta: '¿Qué pasa si supero los comprobantes de mi plan?',
    respuesta:
      'Te avisamos al llegar al 80% del tope. Si lo agotas, ese mes no se emiten más comprobantes hasta que subas de plan — y subir surte efecto en el momento, con el prorrateo cobrado ahí mismo, así que sigues facturando el mismo día.',
  },
  {
    pregunta: '¿Y si mi colegio pasa del tope de estudiantes?',
    respuesta:
      'No se bloquea nada. El tope de estudiantes es cómo se elige el tramo, no un cupo que se consume: si lo pasas te avisamos y ajustamos el plan, pero puedes seguir matriculando. Bloquear una inscripción en pleno agosto por una diferencia de precio no le sirve a nadie.',
  },
  {
    pregunta: '¿El cuadre de caja está en todos los planes?',
    respuesta:
      'Sí. El cuadre y cierre de caja, junto con los turnos, viene en los ocho planes. Lo mismo la contabilidad completa y los reportes 606 y 607: no son un módulo aparte que se cobre después.',
  },
  {
    pregunta: '¿Cómo funcionan los recordatorios de cobro?',
    respuesta:
      'Se configuran una vez por colegio y salen solos en tres momentos: el día que se emite la factura, el día que vence y unos días antes de que entre el recargo por mora. WhatsApp y SMS tienen tope mensual según el plan; el correo no tiene límite.',
  },
  {
    pregunta: '¿Los padres y estudiantes cuentan como usuarios?',
    respuesta:
      'No. El tope de usuarios cuenta solo a quien entra al sistema administrativo. Las familias usan el portal de padres sin costo adicional y sin ocupar un puesto.',
  },
  {
    pregunta: '¿Puedo cambiar de plan cuando quiera?',
    respuesta:
      'Sí. Subir surte efecto de inmediato, con el prorrateo cobrado en el momento. Bajar aplica al terminar el período que ya pagaste, sin penalidad — antes te avisamos qué pierdes con el cambio.',
  },
  {
    pregunta: '¿Hay período de prueba?',
    respuesta: `Sí: ${diasDePrueba('ecf')} días en los planes de facturación y ${diasDePrueba('colegio')} en los de colegio. Un colegio necesita ver un ciclo de cobro entero —la mensualidad que se emite sola, la mora que entra el día que toca y los avisos colgados de esas fechas— y en dos semanas no cabe. Si al terminar no se activa la suscripción, la empresa entra en solo lectura durante unos días —puedes entrar, consultar y exportar todo— antes de cerrarse. Nunca se corta en seco.`,
  },
  {
    pregunta: '¿Mis datos son míos?',
    respuesta:
      'Siempre. Puedes exportar tu histórico cuando quieras, y si decides irte te entregamos un respaldo sin cargo.',
  },
];

const MOMENTOS = [
  { paso: '1', titulo: 'Al emitir', detalle: 'El padre recibe la factura del mes con su link de pago.' },
  { paso: '2', titulo: 'Al vencer', detalle: 'Aviso el día del vencimiento con el saldo pendiente.' },
  { paso: '3', titulo: 'Antes del recargo', detalle: 'Se avisa unos días antes de que entre la mora, con tiempo para pagar.' },
];

// ─── Página ──────────────────────────────────────────────────────────────────

export default function PreciosPage() {
  const lineas = LINEAS_PRODUCTO.map(l => vistaDeLinea(l.key)).filter((l): l is LineaVista => l !== null);
  const addonPos = ADDONS.find(a => a.key === 'pos');
  const lineaColegio = lineas.find(l => l.esColegio);

  const canales = [
    { nombre: 'WhatsApp', tope: 'Con tope mensual por plan', icono: IconoWhatsApp, fondo: 'bg-[#e8f6ee]', color: 'text-[#25a366]' },
    { nombre: 'SMS', tope: 'Con tope mensual por plan', icono: Iconos.sms, fondo: 'bg-[#edf1fe]', color: 'text-[#2a48c4]' },
    { nombre: 'Correo', tope: 'Sin límite', icono: Iconos.correo, fondo: 'bg-[#edf1fe]', color: 'text-[#2a48c4]' },
  ];

  return (
    <>
      {/* Sin `overflow-hidden`, por lo mismo que en la portada: recortaba el
          lazo de fondo con una línea recta. El desborde horizontal lo tapa el
          layout. */}
      <section className="relative bg-gradient-to-b from-[#f5f7fe] to-white to-[58%] pt-14">
        <LazoDeFondo arriba={470} />
        <Planes lineas={lineas} />
      </section>

      {/* ── Adicionales ───────────────────────────────────────────────────── */}
      <section>
        <Contenedor className="pt-16">
          <h2 className="m-0 font-[family-name:var(--font-display)] text-[clamp(1.3rem,3.5vw,1.5rem)] font-semibold tracking-[-.8px]">
            Adicionales
          </h2>
          <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {addonPos && (
              <div className="rounded-2xl border border-[#e9ebf3] bg-white p-5">
                <div className="font-[family-name:var(--font-display)] text-sm font-semibold">{addonPos.name}</div>
                <div className="mt-1 font-[family-name:var(--font-display)] text-[13px] font-semibold text-zero-600">
                  +US${addonPos.price} / mes
                </div>
                <p className="mt-2.5 text-pretty text-xs leading-relaxed text-gray-500">
                  {addonPos.descripcion} Se contrata sobre cualquier plan de facturación.
                </p>
              </div>
            )}
            <div className="rounded-2xl border border-[#e9ebf3] bg-white p-5">
              <div className="font-[family-name:var(--font-display)] text-sm font-semibold">Migración de tus datos</div>
              <div className="mt-1 font-[family-name:var(--font-display)] text-[13px] font-semibold text-zero-600">
                Incluida en los planes Colegio
              </div>
              <p className="mt-2.5 text-pretty text-xs leading-relaxed text-gray-500">
                Cada tramo de colegio trae sus horas de implementación —las verás en la tarjeta del
                plan—. Para pymes la cotizamos según el volumen: escríbenos y te decimos.
              </p>
            </div>
          </div>
        </Contenedor>
      </section>

      {/* ── Recordatorios ─────────────────────────────────────────────────── */}
      {lineaColegio && (
        <section>
          <Contenedor className="pt-16">
            <div className="grid grid-cols-1 items-start gap-8 rounded-2xl border border-[#e7ebfa] bg-[#fafbfe] p-6 sm:p-7 lg:grid-cols-[.72fr_1.28fr]">
              <div>
                <span className="inline-flex h-[26px] items-center rounded-full bg-[#edf1fe] px-3 text-[11px] font-semibold uppercase tracking-[.5px] text-[#2a48c4]">
                  Solo en {lineaColegio.nombre}
                </span>
                <h2 className="mt-3.5 font-[family-name:var(--font-display)] text-[clamp(1.3rem,3.5vw,1.5rem)] font-semibold leading-tight tracking-[-.8px]">
                  Recordatorios automáticos de cobro
                </h2>
                <p className="mt-3 text-pretty text-[13px] leading-relaxed text-[#5c6373]">
                  Se configuran una vez por colegio y salen solos en los tres momentos del ciclo de
                  cobro. El padre recibe el aviso sin que nadie lo escriba.
                </p>
              </div>
              <div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {MOMENTOS.map(m => (
                    <div key={m.paso} className="rounded-xl border border-[#e9ebf3] bg-white p-4">
                      <div className="grid size-7 place-items-center rounded-[9px] bg-[#edf1fe] font-[family-name:var(--font-display)] text-xs font-semibold text-[#2a48c4]">
                        {m.paso}
                      </div>
                      <div className="mt-2.5 text-[12.5px] font-semibold">{m.titulo}</div>
                      <div className="mt-1 text-pretty text-[11.5px] leading-relaxed text-gray-500">{m.detalle}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {canales.map(c => (
                    <div key={c.nombre} className="flex items-center gap-3 rounded-xl border border-[#e9ebf3] bg-white p-3.5">
                      <span className={`grid size-[30px] shrink-0 place-items-center rounded-[9px] ${c.fondo} ${c.color}`}>
                        <c.icono tamano={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-semibold">{c.nombre}</span>
                        <span className="mt-0.5 block text-pretty text-[11px] text-gray-500">{c.tope}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Contenedor>
        </section>
      )}

      {/* ── Preguntas ─────────────────────────────────────────────────────── */}
      <section id="faq">
        <Contenedor className="pt-16">
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[.6fr_1.4fr] lg:gap-11">
            <div>
              <h2 className="m-0 font-[family-name:var(--font-display)] text-[clamp(1.5rem,4vw,1.75rem)] font-semibold leading-tight tracking-[-1px]">
                Preguntas<br className="hidden lg:block" /> frecuentes
              </h2>
              <p className="mt-3.5 text-pretty text-[13.5px] leading-relaxed text-[#5c6373]">
                ¿Te quedó alguna duda? Escríbenos y te contestamos el mismo día.
              </p>
            </div>
            <Acordeon preguntas={FAQS} />
          </div>
        </Contenedor>
      </section>

      {/* ── Contacto y cierre ─────────────────────────────────────────────── */}
      <section id="contacto">
        <Contenedor className="pt-14">
          <TarjetasContacto />
        </Contenedor>
        <Contenedor className="py-14">
          <LlamadoFinal
            titulo="Armemos tu plan juntos"
            detalle="30 minutos con un especialista: vemos tu operación y te dejamos el presupuesto por escrito."
            accion="Solicitar demo"
            href="/contacto"
          />
        </Contenedor>
      </section>
    </>
  );
}

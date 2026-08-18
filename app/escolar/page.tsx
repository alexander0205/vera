import { redirect } from 'next/navigation';
import Link from 'next/link';
import { GraduationCap, MessageCircle, Mail, ArrowRight, Check } from 'lucide-react';
import { getUser, getTeamForUser } from '@/lib/db/queries';
import { getPlan } from '@/lib/config/plans';
import { estadoConfiguracion } from '@/lib/administracion-escolar/configurado';
import { SOPORTE, enlaceWhatsapp, enlaceCorreo } from '@/lib/config/soporte';

/**
 * Puerta del módulo escolar.
 *
 * Antes redirigía siempre al listado de estudiantes. Para un colegio que
 * acaba de contratar eso significaba caer en una tabla vacía con un botón de
 * «Nuevo estudiante» que no lleva a ninguna parte: no se puede matricular sin
 * año escolar, sin grados y sin conceptos de cobro. La única salida era un
 * aviso mandándolo a Configuración a adivinar por dónde empezar.
 *
 * Ahora, si está en blanco, se le dice qué falta y se le ofrece que lo
 * montemos nosotros. Montar un colegio —estructura, conceptos y tarifas— es
 * trabajo de acompañamiento, no de que el director se pelee solo con un
 * formulario el primer día.
 *
 * En cuanto tenga algo cargado, esta pantalla desaparece y no vuelve: quien ya
 * está a medio migrar necesita llegar a sus datos, no toparse con una
 * bienvenida que se los tape.
 */

export const metadata = { title: 'Bienvenido · Zero Colegios' };

/**
 * El orden NO es arbitrario y no se puede reordenar por gusto.
 *
 * Lo fiscal va primero porque sin certificado y sin secuencias de e-NCF no
 * sale ni una factura, y todo el cobro del colegio se factura. Montar
 * conceptos y tarifas antes de eso deja un sistema que calcula perfectamente
 * cargos que después no puede emitir.
 */
const PASOS = [
  {
    titulo: 'Activar tu facturación electrónica',
    detalle: 'Certificado digital y secuencias de e-NCF ante la DGII, más tus datos fiscales y tus contactos. Sin esto no sale ninguna factura, y todo el cobro del colegio se factura.',
  },
  {
    titulo: 'El año escolar y su estructura',
    detalle: 'Período, tandas, grados y secciones. Es donde se matricula.',
  },
  {
    titulo: 'Los conceptos y sus tarifas',
    detalle: 'Inscripción, mensualidades, seguro, uniformes — con su calendario de cuotas, su mora y su precio, igual para todos o distinto por grado.',
  },
  {
    titulo: 'Los avisos a las familias',
    detalle: 'Los mensajes de WhatsApp, SMS y correo: qué dicen y cuándo salen — antes de vencer, el día del vencimiento y antes del recargo.',
  },
  {
    titulo: 'Tus estudiantes actuales',
    detalle: 'Traemos al sistema los que ya tienes, con sus tutores y sus responsables de pago. No hay que teclearlos uno por uno.',
  },
];

export default async function EscolarPage() {
  const equipo = await getTeamForUser();
  /**
   * A `/sign-in` solo quien no tiene sesión.
   *
   * Antes iba aquí cualquiera cuyo team no se pudiera resolver, y eso es otra
   * cosa: la sesión está viva y la pantalla de entrar le dice que no. Se lee
   * como un deslogueo, se reporta como un deslogueo, y se busca en el sitio
   * equivocado. `/sin-acceso` dice lo que pasa de verdad.
   */
  if (!equipo) {
    redirect(await getUser() ? '/sin-acceso' : '/sign-in');
  }

  const estado = await estadoConfiguracion(equipo.id);

  // Ya hay algo cargado: a trabajar, que es a lo que se entra.
  if (!estado.enBlanco) redirect('/escolar/estudiantes');

  // Las horas de implementación salen del plan que tiene contratado, no de un
  // número escrito aquí: cada tramo de colegio trae las suyas (8, 10.5, 14 y
  // 19) y prometerle a un Básico las horas de un Institucional es de las
  // promesas que se cobran caras.
  const plan = getPlan(equipo.planName);
  const implementacion = plan.ui.marketingFeatures.find(f => /implementaci/i.test(f));

  // Días que le quedan de prueba, si está en una. Null cuando ya paga o
  // cuando el billing está apagado: en esos casos no hay reloj que enseñar.
  const diasDePrueba = equipo.subscriptionStatus === 'trialing' && equipo.trialEnd
    ? Math.max(0, Math.ceil((new Date(equipo.trialEnd).getTime() - Date.now()) / 86_400_000))
    : null;

  const mensaje =
    'Hola, acabo de activar Zero Colegios y quiero que me ayuden a configurar el colegio.';
  const wa = enlaceWhatsapp(mensaje);

  return (
    <div className="mx-auto max-w-2xl px-6 py-14">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zero-50">
        <GraduationCap className="h-6 w-6 text-zero-600" />
      </div>

      <h1 className="mt-6 font-[family-name:var(--font-display)] text-[30px] font-semibold tracking-[-0.02em] text-gray-950">
        Vamos a montar tu colegio
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-gray-500">
        Antes de matricular al primer alumno hay que dejar todo montado. No lo
        haces solo: <strong className="font-semibold text-gray-700">tu plan
        {plan.name ? ` ${plan.name}` : ''} incluye la implementación
        {implementacion ? ` — ${implementacion.toLowerCase()}` : ''}</strong>, así
        que lo configuramos nosotros contigo.
      </p>

      <ol className="mt-8 space-y-4">
        {PASOS.map((p, i) => (
          <li key={p.titulo} className="flex gap-3.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold tabular-nums text-gray-500">
              {i + 1}
            </span>
            <div>
              <p className="text-[15px] font-semibold text-gray-900">{p.titulo}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-gray-500">{p.detalle}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-9 rounded-2xl border border-gray-200 bg-white p-6">
        <p className="text-[15px] font-semibold text-gray-900">
          Escríbenos y lo dejamos andando
        </p>
        <p className="mt-1 text-sm leading-relaxed text-gray-500">
          Ten a mano tu lista de grados y tu tabla de tarifas — con eso basta.
        </p>

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          {/* El botón de WhatsApp solo existe si hay número configurado. Un
              enlace a un número inventado es peor que no ofrecerlo: el cliente
              escribe, no le contesta nadie, y concluye que no atendemos. */}
          {wa && (
            <a
              href={wa} target="_blank" rel="noopener noreferrer"
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-zero-600 text-[15px] font-semibold text-white transition hover:bg-zero-700"
            >
              <MessageCircle className="h-[18px] w-[18px]" />
              Escribir por WhatsApp
            </a>
          )}
          <a
            href={enlaceCorreo(
              'Configurar mi colegio en Zero',
              `${mensaje}\n\n`,
            )}
            className={[
              'flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition',
              wa
                ? 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                : 'bg-zero-600 text-white hover:bg-zero-700',
            ].join(' ')}
          >
            <Mail className="h-[18px] w-[18px]" />
            {wa ? 'Escribir por correo' : `Escribir a ${SOPORTE.correo}`}
          </a>
        </div>
      </div>

      {/* Discreto a propósito: se puede hacer solo, pero no es el camino que
          recomendamos el primer día. */}
      <p className="mt-6 text-sm text-gray-500">
        ¿Prefieres montarlo tú?{' '}
        <Link
          href="/escolar/configuracion"
          className="inline-flex items-center gap-1 font-semibold text-zero-600 transition hover:text-zero-700"
        >
          Ir a Configuración <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </p>

      {/* Aquí decía «tu prueba no corre mientras configuramos». Sonaba bien y
          era MENTIRA: los días arrancan al terminar el onboarding y siguen
          corriendo. Se cambia por el dato real — que además es el argumento
          para llamar hoy y no la semana que viene. */}
      {diasDePrueba !== null && (
        <p className="mt-10 flex items-start gap-2 border-t border-gray-100 pt-6 text-sm leading-relaxed text-gray-400">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          {diasDePrueba > 0
            ? `Te ${diasDePrueba === 1 ? 'queda 1 día' : `quedan ${diasDePrueba} días`} de prueba. Cuanto antes lo montemos, más tiempo tienes para verlo funcionando de verdad.`
            : 'Tu prueba terminó. Escríbenos y lo dejamos andando.'}
        </p>
      )}
    </div>
  );
}

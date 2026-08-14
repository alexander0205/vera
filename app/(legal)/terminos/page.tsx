/**
 * Términos y Condiciones.
 *
 * Los plazos del punto 4 NO son redondeos comerciales: salen de
 * `lib/config/suscripcion.ts` (prueba 15 días, 8 de gracia por mora, 7 hasta
 * solo lectura). Si alguien cambia esas perillas, este texto miente y hay que
 * cambiarlo con ellas.
 *
 * El punto 6 —qué pasa con tus datos cuando dejas de pagar— es el que más
 * cuesta encontrar en la competencia y el que más pregunta la gente.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Cabecera, Seccion, Definiciones } from '../_piezas';
import { PRUEBA, MORA, SOLO_LECTURA } from '@/lib/config/suscripcion';

export const metadata: Metadata = {
  title: 'Términos y Condiciones · Zero',
  description: 'Las reglas del servicio: cuenta, planes, cobro, cancelación y responsabilidades.',
};

const CORREO = 'soporte@zero.com.do';

export default function TerminosPage() {
  return (
    <article>
      <Cabecera titulo="Términos y Condiciones" actualizado="14 de agosto de 2026">
        <p>
          Estas son las reglas de uso de Zero, operado por <strong>Yisrael Technology
          LLC</strong>. Al crear una cuenta las aceptas. Están escritas para que se
          entiendan de una lectura; si algo no te cuadra, escríbenos antes de registrarte.
        </p>
      </Cabecera>

      <Seccion n={1} titulo="Qué es Zero">
        <p>
          Un sistema en la nube para emitir comprobantes fiscales electrónicos ante la
          DGII, vender en punto de venta, llevar inventario y administrar colegios. Se
          contrata por planes mensuales y se usa desde el navegador.
        </p>
      </Seccion>

      <Seccion n={2} titulo="Tu cuenta">
        <p>
          Necesitas datos reales y un correo al que tengas acceso: por ahí van los avisos
          de cobro y la recuperación de contraseña.
        </p>
        <p>
          <strong>La contraseña es tuya y su custodia también.</strong> Todo lo que se haga
          desde tu sesión se considera hecho por ti. Si crees que alguien más entró,
          cámbiala y avísanos.
        </p>
        <p>
          Puedes invitar usuarios de tu empresa, hasta el límite de tu plan. Respondes por
          lo que hagan.
        </p>
      </Seccion>

      <Seccion n={3} titulo="Prueba gratis">
        <p>
          La prueba dura <strong>{PRUEBA.dias} días</strong> y{' '}
          {PRUEBA.pideTarjeta ? 'pide tarjeta al empezar' : <strong>no pide tarjeta</strong>}.
          Durante ese tiempo tienes el plan completo. Te avisamos antes de que se acabe.
        </p>
        <p>
          Si al terminar no contratas, la cuenta pasa a solo lectura según el punto 6. No se
          te cobra nada por no haber contratado.
        </p>
      </Seccion>

      <Seccion n={4} titulo="Planes y cobro">
        <Definiciones items={[
          {
            que: 'Cobro mensual y por adelantado',
            detalle: 'Cada plan tiene su precio publicado y sus límites: comprobantes, usuarios, estudiantes y mensajes de WhatsApp y SMS. Los límites son del plan, no negociables por fuera de él.',
          },
          {
            que: 'Si un cobro falla',
            detalle: `Tienes ${MORA.diasGracia} días de gracia con el servicio funcionando igual, mientras se reintenta el cobro. Te avisamos por correo.`,
          },
          {
            que: 'Cambiar de plan',
            detalle: 'Subir aplica de inmediato. Bajar se valida antes: si lo que ya tienes cargado no cabe en el plano más pequeño, te decimos exactamente qué no cabe y cómo resolverlo, en vez de dejarte a medias.',
          },
          {
            que: 'Cambios de precio',
            detalle: 'Se avisan con antelación razonable y nunca aplican al periodo ya pagado.',
          },
        ]} />
        <p>
          Los impuestos aplicables van por tu cuenta cuando corresponda.
        </p>
      </Seccion>

      <Seccion n={5} titulo="Cancelar">
        <p>
          Puedes cancelar cuando quieras, desde la pantalla de suscripción, sin llamar a
          nadie ni dar explicaciones. La cancelación surte efecto{' '}
          <strong>al final del periodo que ya pagaste</strong>: sigues usando el servicio
          hasta esa fecha.
        </p>
        <p>
          Mientras la cancelación esté pendiente puedes revertirla. No devolvemos el periodo
          en curso.
        </p>
      </Seccion>

      <Seccion n={6} titulo="Qué pasa con tus datos si dejas de pagar">
        <p>
          Esto lo escribimos claro porque es lo que más se pregunta.
        </p>
        <p>
          Pasados los plazos —{SOLO_LECTURA.diasTrasPrueba} días tras el fin de la prueba,
          o {SOLO_LECTURA.diasTrasMora} tras agotarse la gracia por mora— la cuenta entra en{' '}
          <strong>solo lectura</strong>. Eso significa que dejas de emitir comprobantes,
          matricular y facturar, y que se paran los procesos automáticos: las facturas
          recurrentes, los avisos a familias y el portal de documentos.
        </p>
        <p>
          <strong>Pero sigues entrando, leyendo, imprimiendo y exportando tu
          información.</strong> No borramos tus datos por falta de pago ni te los retenemos
          como palanca de cobro. Si vuelves a pagar, todo se reanuda tal como estaba, sin
          paso de restauración.
        </p>
        <p>
          Tus datos son tuyos. Exportarlos no requiere permiso nuestro.
        </p>
      </Seccion>

      <Seccion n={7} titulo="La responsabilidad fiscal es tuya">
        <p>
          Zero es la herramienta con la que emites; el contribuyente ante la DGII eres tú.
          Respondes por la veracidad de lo que factures, por tus secuencias de e-NCF, por
          tu certificado digital y por presentar lo que la ley te exija.
        </p>
        <p>
          Ponemos los medios para que lo que se transmita a la DGII sea exactamente lo que
          registraste, pero no somos tu asesor fiscal ni sustituimos a tu contador.
        </p>
      </Seccion>

      <Seccion n={8} titulo="Uso aceptable">
        <p>
          No puedes usar Zero para emitir comprobantes falsos o de operaciones inexistentes,
          suplantar a otro contribuyente, intentar acceder a datos de otra empresa, forzar o
          sondear la seguridad del sistema, ni revenderlo como si fuera tuyo sin acuerdo
          escrito.
        </p>
        <p>
          Si detectamos algo de esto podemos suspender la cuenta. Si la suspensión afecta a
          terceros —por ejemplo, familias de un colegio— procuraremos avisar antes, salvo
          que hacerlo agrave el daño.
        </p>
      </Seccion>

      <Seccion n={9} titulo="Disponibilidad">
        <p>
          Trabajamos para que Zero esté disponible siempre, pero no prometemos que nunca
          falle. Hay mantenimientos, y hay servicios de terceros de los que dependemos —la
          propia DGII, entre ellos— que se caen sin avisarnos.
        </p>
        <p>
          Los mantenimientos programados se avisan con antelación y se hacen fuera del
          horario de mayor uso siempre que se pueda.
        </p>
      </Seccion>

      <Seccion n={10} titulo="Límites de responsabilidad">
        <p>
          Zero se presta tal como está. No respondemos por lucro cesante, pérdida de
          oportunidad o daños indirectos.
        </p>
        <p>
          Cuando la ley permita limitar la responsabilidad, la nuestra no excederá lo que
          hayas pagado por el servicio en los doce meses anteriores al hecho.
        </p>
        <p>
          Nada de esto excluye la responsabilidad que la ley no deja excluir, ni la que
          venga de dolo o negligencia grave nuestra.
        </p>
      </Seccion>

      <Seccion n={11} titulo="Propiedad">
        <p>
          El software, la marca y el diseño de Zero son nuestros. Contratar el servicio te
          da derecho a usarlo, no a copiarlo, descompilarlo ni derivar productos de él.
        </p>
        <p>
          <strong>Lo que tú cargas sigue siendo tuyo.</strong> No adquirimos derechos sobre
          tus datos ni sobre tu contenido.
        </p>
      </Seccion>

      <Seccion n={12} titulo="Datos personales">
        <p>
          Cómo tratamos los datos está en la{' '}
          <Link href="/privacidad" className="font-medium text-zero-600 hover:text-zero-700">
            Política de Privacidad
          </Link>
          , que forma parte de estos Términos. Si usas el módulo escolar, presta atención a
          su punto 6: ahí hay datos de menores y tú eres el responsable de ellos.
        </p>
      </Seccion>

      <Seccion n={13} titulo="Cambios en estos Términos">
        <p>
          Podemos actualizarlos. Si el cambio es relevante te avisamos antes de que aplique,
          y seguir usando el servicio después de esa fecha cuenta como aceptación. Si no
          estás de acuerdo, puedes cancelar según el punto 5.
        </p>
      </Seccion>

      <Seccion n={14} titulo="Ley aplicable">
        <p>
          Estos Términos se rigen por las leyes de la República Dominicana, y cualquier
          controversia se somete a sus tribunales competentes.
        </p>
      </Seccion>

      <Seccion n={15} titulo="Contacto">
        <p>
          Yisrael Technology LLC · 1309 Coffeen Avenue STE 18941, Sheridan, WY 82801,
          Estados Unidos.
        </p>
        <p>
          <a href={`mailto:${CORREO}`} className="font-medium text-zero-600 hover:text-zero-700">{CORREO}</a>
        </p>
      </Seccion>

      <p className="mt-12 border-t border-gray-100 pt-6 text-sm text-gray-500">
        Ver también la{' '}
        <Link href="/privacidad" className="font-medium text-zero-600 hover:text-zero-700">
          Política de Privacidad
        </Link>.
      </p>
    </article>
  );
}

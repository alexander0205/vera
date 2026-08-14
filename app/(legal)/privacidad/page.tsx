/**
 * Política de Privacidad.
 *
 * Escrita contra lo que el sistema HACE, no contra una plantilla: cada tercero
 * que aparece en el punto 5 está porque hay código que le manda datos, y los
 * plazos del punto 8 son los de `lib/config/suscripcion.ts`. Si mañana se
 * añade un proveedor o cambia un plazo, esto se actualiza con ello — un
 * documento que promete algo distinto de lo que pasa es peor que no tenerlo.
 *
 * Google la exige como URL pública para poner el logo en la pantalla de
 * consentimiento (ver el layout de este grupo de rutas).
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Cabecera, Seccion, Definiciones } from '../_piezas';

export const metadata: Metadata = {
  title: 'Política de Privacidad · Zero',
  description: 'Qué datos guarda Zero, para qué, con quién se comparten y cómo ejercer tus derechos.',
};

const CORREO = 'soporte@zero.com.do';

export default function PrivacidadPage() {
  return (
    <article>
      <Cabecera titulo="Política de Privacidad" actualizado="14 de agosto de 2026">
        <p>
          Zero es un sistema de facturación electrónica, punto de venta y administración
          escolar para la República Dominicana, operado por <strong>Yisrael Technology LLC</strong>.
          Este documento explica qué datos personales tratamos, por qué, con quién los
          compartimos y qué puedes exigirnos.
        </p>
        <p>
          Se rige por la <strong>Ley 172-13</strong> de Protección de Datos de Carácter
          Personal de la República Dominicana.
        </p>
      </Cabecera>

      <Seccion n={1} titulo="Zero cumple dos papeles distintos, y conviene no confundirlos">
        <p>
          Casi todo lo que se malinterpreta de una política de privacidad sale de aquí, así
          que va primero.
        </p>
        <Definiciones items={[
          {
            que: 'Con los datos de tu cuenta somos responsables',
            detalle: 'Tu nombre, tu correo, los datos de tu empresa y lo que pagas por la suscripción los tratamos por decisión nuestra, para prestarte el servicio y cobrarlo.',
          },
          {
            que: 'Con los datos que tú cargas somos encargados',
            detalle: 'Tus clientes, tus facturas, tus alumnos y sus documentos son tuyos. Los guardamos y procesamos por cuenta tuya y siguiendo tus instrucciones. No los usamos para nada nuestro, no los vendemos y no los cedemos a nadie fuera de lo que dice el punto 5.',
          },
        ]} />
        <p>
          Si eres cliente de una empresa que factura con Zero, o familia de un colegio que
          usa Zero, tu interlocutor es esa empresa o ese colegio, no nosotros. Nosotros
          guardamos esos datos por cuenta de ellos.
        </p>
      </Seccion>

      <Seccion n={2} titulo="Qué datos guardamos">
        <Definiciones items={[
          {
            que: 'De tu cuenta',
            detalle: 'Nombre, correo electrónico, contraseña (cifrada, nunca en claro), fecha del último acceso y la fecha en que aceptaste estos documentos. Si entras con Google, además tu identificador de Google y tu foto de perfil.',
          },
          {
            que: 'De tu empresa',
            detalle: 'RNC, razón social, nombre comercial, dirección, teléfono, logo y la configuración fiscal con la que emites.',
          },
          {
            que: 'Lo que registras trabajando',
            detalle: 'Tus clientes (nombre, RNC o cédula, dirección, teléfono, correo), tus facturas y cotizaciones, tus cobros, y las imágenes de comprobantes de pago que adjuntes.',
          },
          {
            que: 'Si usas el módulo escolar',
            detalle: 'Datos de estudiantes —incluidos menores de edad—: nombres, apellidos, fecha de nacimiento, sexo, matrícula y los documentos que suba la familia, que típicamente incluyen actas de nacimiento y cédulas. Y de los responsables de pago: nombre, teléfono, WhatsApp y correo.',
          },
          {
            que: 'De uso',
            detalle: 'Registros técnicos de acceso y de acciones sensibles (quién anuló una factura, quién cambió un precio), para poder auditar y para tu propia seguridad.',
          },
        ]} />
        <p>
          <strong>No guardamos números de tarjeta.</strong> Los datos de pago se introducen
          directamente en Stripe y nosotros solo conservamos un identificador y los últimos
          cuatro dígitos que Stripe nos devuelve.
        </p>
      </Seccion>

      <Seccion n={3} titulo="Para qué los usamos">
        <p>
          Para prestarte el servicio: emitir tus comprobantes ante la DGII, calcular tus
          cobros, mandar los correos y avisos que tú dispares, y cobrarte la suscripción.
        </p>
        <p>
          También para avisarte de cosas de tu cuenta —que la prueba se acaba, que un cobro
          falló, que la suscripción se canceló—, para dar soporte cuando lo pides, y para
          cumplir obligaciones legales y fiscales.
        </p>
        <p>
          <strong>No vendemos datos personales, ni los cedemos a terceros con fines
          publicitarios, ni los usamos para entrenar modelos.</strong>
        </p>
      </Seccion>

      <Seccion n={4} titulo="La base legal">
        <p>
          Tratamos tus datos porque hace falta para ejecutar el contrato que tienes con
          nosotros; porque una ley nos obliga, como pasa con todo lo fiscal; y, cuando así
          lo pedimos expresamente, porque nos diste tu consentimiento —que puedes retirar
          cuando quieras, sin que eso afecte a lo hecho antes.
        </p>
      </Seccion>

      <Seccion n={5} titulo="Con quién los compartimos">
        <p>Solo con quien hace falta para que el servicio funcione, y solo lo que hace falta:</p>
        <Definiciones items={[
          {
            que: 'DGII',
            detalle: 'Los comprobantes fiscales electrónicos que emites. Es una obligación legal tuya y el sistema existe para cumplirla.',
          },
          {
            que: 'Stripe',
            detalle: 'Cobro de la suscripción. Recibe tu correo y los datos de pago que tú le entregues directamente.',
          },
          {
            que: 'Resend',
            detalle: 'Envío de los correos del sistema: facturas a tus clientes, avisos a familias, recuperación de contraseña.',
          },
          {
            que: 'Amazon Web Services',
            detalle: 'Almacenamiento de archivos —comprobantes de pago, documentos escolares, fotos— en un bucket privado, sin acceso público.',
          },
          {
            que: 'Neon y Vercel',
            detalle: 'La base de datos y el alojamiento sobre los que corre Zero.',
          },
          {
            que: 'Google',
            detalle: 'Solo si eliges entrar con Google. Recibimos de ellos tu nombre, correo y foto; no les mandamos nada tuyo.',
          },
          {
            que: 'SIGERD (MINERD)',
            detalle: 'Solo si tu colegio activa la importación de datos oficiales. Los datos vienen de ellos hacia Zero.',
          },
          {
            que: 'CRM Zero',
            detalle: 'Envío de WhatsApp y mensajes de texto a las familias, cuando el colegio los tiene encendidos.',
          },
        ]} />
        <p>
          Algunos de estos proveedores están fuera de la República Dominicana. Al usar Zero
          aceptas esa transferencia internacional, que se limita a lo necesario para prestar
          el servicio.
        </p>
        <p>
          Además entregaremos datos si nos lo ordena una autoridad competente por la vía
          legal correspondiente.
        </p>
      </Seccion>

      <Seccion n={6} titulo="Datos de menores de edad">
        <p>
          El módulo escolar trata datos de menores. Quien decide qué se pide y para qué es
          el colegio: él es el responsable y nosotros el encargado. Las familias que suben
          documentos lo hacen por un enlace del colegio, y ese enlace <strong>caduca, se
          puede revocar y solo abre los documentos de esa matrícula</strong>.
        </p>
        <p>
          Lo que sube una familia entra siempre como <em>recibido</em>, nunca como aprobado:
          darlo por bueno es un acto del colegio. Y si el colegio deja de tener cuenta
          activa con nosotros, el portal deja de recibir documentos, para que no sigan
          entrando papeles de menores que nadie del otro lado va a revisar.
        </p>
        <p>
          Si eres madre, padre o tutor y quieres saber qué tenemos de tu hijo, o que se
          borre, pídeselo al colegio: es quien puede decidirlo. Si no obtienes respuesta,
          escríbenos y te ayudamos a canalizarlo.
        </p>
      </Seccion>

      <Seccion n={7} titulo="Cuánto tiempo los guardamos">
        <p>
          Mientras tu cuenta esté activa. Si la cierras, conservamos lo necesario para
          cumplir la ley —los comprobantes fiscales tienen plazos de conservación que no
          dependen de nosotros ni de ti— y eliminamos el resto.
        </p>
        <p>
          Dejar de pagar no borra nada. Una cuenta impagada pasa a solo lectura: puedes
          seguir entrando, leyendo, imprimiendo y exportando tu información. No te
          secuestramos tus datos para cobrarte.
        </p>
      </Seccion>

      <Seccion n={8} titulo="Tus derechos">
        <p>
          La Ley 172-13 te da derecho a <strong>acceder</strong> a tus datos,
          <strong> rectificarlos</strong> si están mal, <strong>pedir que se
          supriman</strong> y <strong>oponerte</strong> a determinados tratamientos.
        </p>
        <p>
          Buena parte la ejerces tú solo desde el sistema: los datos de tu cuenta y de tu
          empresa se editan desde Configuración, y tu información se exporta desde las
          pantallas de reportes. Para lo demás, escribe a{' '}
          <a href={`mailto:${CORREO}`} className="font-medium text-zero-600 hover:text-zero-700">{CORREO}</a>{' '}
          desde el correo de tu cuenta. Respondemos en un plazo máximo de quince días
          hábiles.
        </p>
        <p>
          Si crees que no te atendimos como corresponde, puedes acudir a la autoridad de
          protección de datos competente.
        </p>
      </Seccion>

      <Seccion n={9} titulo="Cómo los protegemos">
        <p>
          Las contraseñas se guardan cifradas y no las conocemos ni podemos recuperarlas,
          solo restablecerlas. El tráfico va cifrado. Los archivos viven en almacenamiento
          privado, sin URLs públicas. Cada empresa está aislada de las demás, y dentro de
          cada una hay permisos por rol para que no todo el mundo vea todo.
        </p>
        <p>
          Ningún sistema es infalible. Si ocurre una brecha que afecte a tus datos
          personales, te lo comunicaremos.
        </p>
      </Seccion>

      <Seccion n={10} titulo="Cookies">
        <p>
          Usamos las cookies imprescindibles para mantener tu sesión abierta y para
          recordar preferencias tuyas dentro del sistema, como la empresa con la que estás
          trabajando. <strong>No usamos cookies de publicidad ni de seguimiento entre
          sitios.</strong>
        </p>
      </Seccion>

      <Seccion n={11} titulo="Cambios">
        <p>
          Si esto cambia de forma relevante te avisaremos por correo o dentro del sistema
          antes de que aplique. La fecha de arriba dice cuándo se actualizó por última vez.
        </p>
      </Seccion>

      <Seccion n={12} titulo="Contacto">
        <p>
          Yisrael Technology LLC · 1309 Coffeen Avenue STE 18941, Sheridan, WY 82801,
          Estados Unidos.
        </p>
        <p>
          <a href={`mailto:${CORREO}`} className="font-medium text-zero-600 hover:text-zero-700">{CORREO}</a>
        </p>
      </Seccion>

      <p className="mt-12 border-t border-gray-100 pt-6 text-sm text-gray-500">
        Ver también los{' '}
        <Link href="/terminos" className="font-medium text-zero-600 hover:text-zero-700">
          Términos y Condiciones
        </Link>.
      </p>
    </article>
  );
}

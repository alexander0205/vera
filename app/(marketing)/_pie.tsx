/**
 * Pie del sitio público.
 *
 * La maqueta traía una caja de «Novedades» que pedía el correo y respondía
 * «listo, te sumamos a la lista» con un `setState`. No hay lista: se quitó. Un
 * campo que finge suscribir es peor que no tenerlo, porque el que lo usa deja
 * de esperar noticias por otro lado.
 *
 * Los enlaces legales apuntan a `/terminos` y `/privacidad`, que existen. Los
 * de «Seguridad» y «Estado del servicio» de la maqueta no tienen página detrás
 * y por eso tampoco están.
 */

import Link from 'next/link';
import { CONTACTO, Contenedor } from './_piezas';

/**
 * Las cinco líneas de «Producto» —facturación, punto de venta, administración,
 * contabilidad, colegio— apuntaban las cinco a `/#modulos`: el mismo destino
 * escrito cinco veces, y desde la propia portada ni siquiera bajaba, devolvía
 * arriba. Ahora cada enlace lleva a un sitio distinto y que existe. El precio
 * por línea vive en `/precios`, que enseña una línea a la vez con su selector:
 * no hay ancla por producto a la que apuntar.
 */
const COLUMNAS = [
  {
    titulo: 'Navegación',
    enlaces: [
      { texto: 'Inicio', href: '/' },
      { texto: 'Precios', href: '/precios' },
      { texto: 'Contacto', href: '/contacto' },
      { texto: 'Iniciar sesión', href: '/sign-in' },
    ],
  },
  {
    titulo: 'Productos',
    enlaces: [
      { texto: 'Zero ERP', href: '/productos/erp' },
      { texto: 'Punto de venta', href: '/productos/punto-de-venta' },
      { texto: 'Nómina', href: '/productos/nomina' },
      { texto: 'Zero CRM', href: '/productos/crm' },
      { texto: 'Colegios', href: '/colegios' },
    ],
  },
] as const;

export function PieMarketing() {
  return (
    <footer className="bg-[#0f1118] pt-12">
      <Contenedor>
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.1fr]">
          <div>
            {/* Las medidas van en el atributo, no solo en la clase: sin ellas
                el navegador no conoce la proporción hasta que el SVG termina de
                bajar y el logotipo ocupa cero de ancho mientras tanto, moviendo
                el pie entero cuando aparece. `h-6 w-auto` manda al final. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca/zero-horizontal-blanco.svg" alt="Zero" width={300} height={62} className="h-6 w-auto" />
            <p className="mt-4 max-w-[260px] text-[12.5px] leading-relaxed text-white/50">
              Facturación electrónica, administración y colegio en un solo sistema.
            </p>
          </div>

          {COLUMNAS.map(col => (
            <div key={col.titulo}>
              <p className="text-[12.5px] font-semibold text-white">{col.titulo}</p>
              <div className="mt-4 flex flex-col gap-2.5">
                {/* Los que llevan ancla van en `a` y no en `Link`: estando ya
                    en la portada, el Link de Next cambia la URL pero deja la
                    página arriba del todo, así que el enlace parecía roto. */}
                {col.enlaces.map(l => (l.href.includes('#') ? (
                  <a key={l.texto} href={l.href} className="text-[12.5px] text-white/55 transition hover:text-white">
                    {l.texto}
                  </a>
                ) : (
                  <Link key={l.texto} href={l.href} className="text-[12.5px] text-white/55 transition hover:text-white">
                    {l.texto}
                  </Link>
                )))}
              </div>
            </div>
          ))}

          <div>
            <p className="text-[12.5px] font-semibold text-white">Contacto</p>
            <div className="mt-4 flex flex-col gap-2.5">
              <a href={`mailto:${CONTACTO.ventas}`} className="text-[12.5px] text-white/55 transition hover:text-white">{CONTACTO.ventas}</a>
              <a href={`mailto:${CONTACTO.soporte}`} className="text-[12.5px] text-white/55 transition hover:text-white">{CONTACTO.soporte}</a>
              <a href={CONTACTO.telefonoHref} className="text-[12.5px] tabular-nums text-white/55 transition hover:text-white">{CONTACTO.telefono}</a>
              <a
                href={CONTACTO.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12.5px] tabular-nums text-white/55 transition hover:text-white"
              >
                WhatsApp {CONTACTO.whatsapp}
              </a>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/10 py-5">
          <span className="text-[11.5px] text-white/40">
            © {new Date().getFullYear()} Zero · Yisrael Technology LLC
          </span>
          <span className="text-[11.5px] text-white/40">
            Ventas: lun a vie 8:00–17:00 · Soporte: 7:00–24:00
          </span>
          <span className="flex-1" />
          <Link href="/privacidad" className="text-[11.5px] text-white/40 transition hover:text-white">Privacidad</Link>
          <Link href="/terminos" className="text-[11.5px] text-white/40 transition hover:text-white">Términos</Link>
        </div>
      </Contenedor>
    </footer>
  );
}

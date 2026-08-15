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

const COLUMNAS = [
  {
    titulo: 'Navegación',
    enlaces: [
      { texto: 'Inicio', href: '/' },
      { texto: 'Planes', href: '/precios' },
      { texto: 'Contacto', href: '/contacto' },
      { texto: 'Iniciar sesión', href: '/sign-in' },
    ],
  },
  {
    titulo: 'Producto',
    enlaces: [
      { texto: 'Facturación electrónica', href: '/#modulos' },
      { texto: 'Punto de venta', href: '/#modulos' },
      { texto: 'Administración', href: '/#modulos' },
      { texto: 'Contabilidad', href: '/#modulos' },
      { texto: 'Colegio', href: '/#modulos' },
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
                {col.enlaces.map(l => (
                  <Link key={l.texto} href={l.href} className="text-[12.5px] text-white/55 transition hover:text-white">
                    {l.texto}
                  </Link>
                ))}
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

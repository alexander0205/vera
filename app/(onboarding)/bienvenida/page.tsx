/**
 * El onboarding del usuario nuevo.
 *
 * UNA sola ruta para los tres pasos, y el paso sale de la base, no de la URL.
 * Esa decisión es la que sostiene las dos reglas del producto: no se puede
 * saltar —escribir otra cosa en la barra de direcciones no adelanta nada— y se
 * puede retomar, porque quien cierra el navegador vuelve donde iba.
 *
 * La idea de fondo: en vez de interrogar al usuario, se le reconoce. Da su RNC
 * y el sistema le dice quién es, a qué se dedica y si la DGII lo tiene activo.
 * Lo que en otros sistemas son cinco pantallas de preguntas, aquí son tres de
 * confirmar.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { planSugerido, preguntaDeTamano, type LineaKey } from '@/lib/onboarding/deducir';
import { LogoZero } from '@/components/marca-zero';
import { PasoEmpresa } from './_paso-empresa';
import { PasoTamano } from './_paso-tamano';
import { PasoPlan } from './_paso-plan';

export const metadata = { title: 'Bienvenido a Zero' };

type Datos = { linea?: LineaKey; tamano?: number; rncManual?: boolean };

const TITULOS = ['Tu empresa', 'Tu tamaño', 'Tu plan'];

export default async function BienvenidaPage({
  searchParams,
}: {
  searchParams: Promise<{ paso?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  // El onboarding vive fuera de los layouts que llevan el muro, así que la
  // puerta del correo se repite aquí. Sin esto, quien se registra con
  // contraseña llegaría a configurar su empresa sin haber demostrado que la
  // dirección es suya.
  if (!user.emailVerified) redirect('/verifica-tu-correo');

  const equipo = await getTeamForUser();
  if (!equipo) redirect('/sign-in');

  // Ya lo hizo: no se repite. Volver aquí a mano no rehace nada.
  if (equipo.onboardingCompletadoEn) redirect('/dashboard');

  const datos = (equipo.onboardingDatos as Datos) ?? {};
  const paso = equipo.onboardingPaso ?? 1;

  // Un paso avanzado sin los datos del anterior solo puede venir de una fila a
  // medio escribir. Se retrocede en vez de pintar una pantalla sin sentido.
  // `efectivo` es lo MÁS lejos que llegó: el tope hasta donde puede navegar.
  const efectivo = paso >= 4 && datos.linea && datos.tamano ? 4
    : paso >= 3 && datos.linea ? 3
    : 2;

  // La respuesta del plan no se firma: se puede volver atrás a cambiar la línea
  // o el tamaño y ver qué plan conviene, como en la competencia. El paso que se
  // MUESTRA sale de la URL (`?paso=`), acotado a lo ya alcanzado —nunca deja
  // saltar hacia adelante—; sin parámetro se muestra donde iba.
  const sp = await searchParams;
  const pedido = Number(sp?.paso);
  const vista = Number.isInteger(pedido) && pedido >= 2 && pedido <= efectivo
    ? pedido
    : efectivo;

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-6">
          <LogoZero alto={26} />
          <p className="text-sm text-gray-400">{user.email}</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        {/* Tres puntos y no una barra de porcentaje: son tres, se cuentan de un
            vistazo, y saber cuántos faltan es justo lo que evita el abandono.
            Los pasos ya alcanzados son enlaces: se puede volver a cualquiera. */}
        <ol className="mb-10 flex items-center gap-3">
          {TITULOS.map((titulo, i) => {
            const n = i + 2;                       // los pasos van 2, 3, 4
            const hecho = efectivo > n;
            const actual = vista === n;
            const navegable = n <= efectivo && n !== vista;
            const punto = (
              <>
                <span
                  className={[
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums transition',
                    hecho || actual ? 'bg-zero-600 text-white' : 'bg-gray-200 text-gray-500',
                  ].join(' ')}
                >
                  {hecho ? '✓' : i + 1}
                </span>
                <span className={`text-sm font-medium ${actual ? 'text-gray-900' : 'text-gray-400'} ${navegable ? 'group-hover:text-gray-700' : ''}`}>
                  {titulo}
                </span>
              </>
            );
            return (
              <li key={titulo} className="flex flex-1 items-center gap-2.5">
                {navegable
                  ? <Link href={`/bienvenida?paso=${n}`} className="group flex items-center gap-2.5">{punto}</Link>
                  : <span className="flex items-center gap-2.5">{punto}</span>}
                {i < TITULOS.length - 1 && <span className="hidden h-px flex-1 bg-gray-200 sm:block" />}
              </li>
            );
          })}
        </ol>

        {/* Volver un paso: solo cuando hay a dónde volver. */}
        {vista > 2 && (
          <Link
            href={`/bienvenida?paso=${vista - 1}`}
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-gray-800"
          >
            <ArrowLeft className="h-4 w-4" /> Atrás
          </Link>
        )}

        {vista === 2 && (
          <PasoEmpresa
            rncActual={equipo.rnc}
            razonSocialActual={equipo.razonSocial}
            nombreComercialActual={equipo.nombreComercial}
            lineaActual={datos.linea ?? null}
            rncManualActual={datos.rncManual ?? false}
            volviendo={efectivo > 2}
          />
        )}

        {vista === 3 && (
          <PasoTamano
            razonSocial={equipo.razonSocial ?? equipo.name}
            pregunta={preguntaDeTamano(datos.linea!)}
            tamanoActual={datos.tamano ?? null}
          />
        )}

        {vista === 4 && (
          <PasoPlan
            plan={planSugerido(datos.linea!, datos.tamano!)}
            linea={datos.linea!}
            tamano={datos.tamano!}
            razonSocial={equipo.razonSocial ?? equipo.name}
          />
        )}
      </main>
    </div>
  );
}

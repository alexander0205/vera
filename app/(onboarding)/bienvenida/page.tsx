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

import { redirect } from 'next/navigation';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { planSugerido, preguntaDeTamano, type LineaKey } from '@/lib/onboarding/deducir';
import { LogoZero } from '@/components/marca-zero';
import { PasoEmpresa } from './_paso-empresa';
import { PasoTamano } from './_paso-tamano';
import { PasoPlan } from './_paso-plan';

export const metadata = { title: 'Bienvenido a Zero' };

type Datos = { linea?: LineaKey; tamano?: number; rncManual?: boolean };

const TITULOS = ['Tu empresa', 'Tu tamaño', 'Tu plan'];

export default async function BienvenidaPage() {
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
  const efectivo = paso >= 4 && datos.linea && datos.tamano ? 4
    : paso >= 3 && datos.linea ? 3
    : 2;

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
            vistazo, y saber cuántos faltan es justo lo que evita el abandono. */}
        <ol className="mb-10 flex items-center gap-3">
          {TITULOS.map((titulo, i) => {
            const n = i + 2;                       // los pasos van 2, 3, 4
            const hecho = efectivo > n;
            const actual = efectivo === n;
            return (
              <li key={titulo} className="flex flex-1 items-center gap-2.5">
                <span
                  className={[
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums transition',
                    hecho  ? 'bg-zero-600 text-white'
                    : actual ? 'bg-zero-600 text-white'
                    : 'bg-gray-200 text-gray-500',
                  ].join(' ')}
                >
                  {hecho ? '✓' : i + 1}
                </span>
                <span className={`text-sm font-medium ${actual ? 'text-gray-900' : 'text-gray-400'}`}>
                  {titulo}
                </span>
                {i < TITULOS.length - 1 && <span className="hidden h-px flex-1 bg-gray-200 sm:block" />}
              </li>
            );
          })}
        </ol>

        {efectivo === 2 && (
          <PasoEmpresa
            rncActual={equipo.rnc}
            razonSocialActual={equipo.razonSocial}
          />
        )}

        {efectivo === 3 && (
          <PasoTamano
            razonSocial={equipo.razonSocial ?? equipo.name}
            pregunta={preguntaDeTamano(datos.linea!)}
          />
        )}

        {efectivo === 4 && (
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

/**
 * El muro del onboarding.
 *
 * Quien no lo ha terminado no entra a ninguna parte del sistema. Es una
 * decisión de producto —el onboarding es obligatorio— pero tiene un filo muy
 * peligroso: si el muro se aplicara a TODAS las empresas, las que ya existen y
 * están facturando hoy amanecerían encerradas fuera de su propia cuenta, sin
 * haber hecho nada mal.
 *
 * Lo que lo evita no está aquí sino en la migración 0138, que marca a todas las
 * empresas anteriores como completadas. Este archivo confía en eso. Si algún
 * día se reescribe esa migración sin el UPDATE, esto se convierte en un
 * apagón para todos los clientes.
 *
 * Se llama desde los layouts de cada zona autenticada y NO desde un middleware
 * porque el proyecto no tiene middleware de rutas: la sesión se resuelve por
 * layout.
 */

import { redirect } from 'next/navigation';
import { getTeamForUser, getUser } from '@/lib/db/queries';

/**
 * Las dos puertas de entrada, en este orden.
 *
 * Primero el correo y después el onboarding, no al revés: alguien que todavía
 * no ha demostrado que su dirección es suya no tiene por qué estar
 * configurando una empresa con su RNC.
 *
 * Quien entra por Google cruza la primera puerta sin enterarse: llega con
 * `emailVerified` en true porque Google ya lo comprobó.
 */
export async function exigirOnboarding() {
  const user = await getUser();

  // Sin usuario no hay nada que decidir aquí: de eso se ocupa el guard de
  // sesión de cada zona. Bloquear también aquí acabaría en dos redirecciones
  // peleándose.
  if (!user) return;

  if (!user.emailVerified) redirect('/verifica-tu-correo');

  const equipo = await getTeamForUser();
  if (!equipo) return;

  if (!equipo.onboardingCompletadoEn) redirect('/bienvenida');
}

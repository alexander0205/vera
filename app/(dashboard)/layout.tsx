/**
 * Layout (dashboard) — sin gating por plan.
 * Todos los usuarios autenticados acceden libremente.
 *
 * Lo único que se exige aquí es haber terminado el onboarding: una empresa a
 * medio configurar —sin RNC, sin plan, sin saber siquiera si la DGII la tiene
 * activa— no puede empezar a facturar.
 */
import { exigirOnboarding } from '@/lib/onboarding/muro';

export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirOnboarding();
  return children;
}

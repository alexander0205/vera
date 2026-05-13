import { type PlanFeature } from '@/lib/plans';

/**
 * PlanGate — sin gating activo.
 * Todos los usuarios acceden a todas las features.
 * Para reactivar gating, restaurar el check de planHasFeature.
 */
export async function PlanGate({ feature: _feature }: { feature: PlanFeature }) {
  return null;
}

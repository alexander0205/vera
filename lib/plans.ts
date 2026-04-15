/**
 * @deprecated Importa desde '@/lib/config' en código nuevo.
 * Este archivo existe solo para compatibilidad con imports existentes.
 */
export type { Feature as PlanFeature } from '@/lib/config/plans';
export {
  planHasFeature,
  getPlanUserLimit as planUserLimit,
  PLANS,
  FREE_PLAN,
  getPlan,
} from '@/lib/config/plans';

// Keep PLAN_USER_LIMITS for any code that references it directly
export { getPlanUserLimit } from '@/lib/config/plans';

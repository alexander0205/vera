'use client';

import { useTransition } from 'react';
import { switchPlanAction } from './actions';
import { Loader2 } from 'lucide-react';

const PLANS = [
  { key: 'starter',  label: 'Starter',  price: '$15' },
  { key: 'business', label: 'Business', price: '$35' },
  { key: 'pro',      label: 'Pro',      price: '$65' },
] as const;

export function PlanSwitcher({ currentPlan }: { currentPlan: string }) {
  const [pending, startTransition] = useTransition();
  const currentKey = currentPlan.toLowerCase();

  function handleSwitch(planKey: string) {
    const fd = new FormData();
    fd.set('plan', planKey);
    startTransition(() => switchPlanAction(fd));
  }

  return (
    <div className="border border-dashed border-amber-300 bg-amber-50 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
        Cambiar plan (dev)
      </p>
      <div className="flex gap-2 flex-wrap">
        {PLANS.map(({ key, label, price }) => (
          <button
            key={key}
            onClick={() => handleSwitch(key)}
            disabled={pending || key === currentKey}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              key === currentKey
                ? 'bg-teal-600 text-white border-teal-600 cursor-default'
                : 'bg-white text-gray-700 border-gray-300 hover:border-teal-500 hover:text-teal-700'
            } disabled:opacity-50`}
          >
            {pending && key !== currentKey && <Loader2 className="h-3 w-3 animate-spin" />}
            {label} <span className="text-xs opacity-70">{price}/mes</span>
          </button>
        ))}
      </div>
    </div>
  );
}

import { checkoutAction } from '@/lib/payments/actions';
import { Check, AlertCircle } from 'lucide-react';
import { SubmitButton } from './submit-button';
import { PLANS, getPlanPriceId, type PlanDef } from '@/lib/config/plans';
import { SiteHeader } from '@/components/site-header';

export default function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; welcome?: string; new_company?: string }>;
}) {
  return <PricingPageInner searchParams={searchParams} />;
}

async function PricingPageInner({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; welcome?: string; new_company?: string }>;
}) {
  const { reason, welcome, new_company } = await searchParams;
  const noPlan      = reason === 'no-plan';
  const isNew       = welcome === '1';
  const isNewCompany = new_company === '1';

  return (
    <main>
      <SiteHeader />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

        {/* Banner: nueva empresa */}
        {isNewCompany && (
          <div className="mb-8 flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
            <div className="text-2xl">🏢</div>
            <div>
              <p className="text-sm font-semibold text-blue-800">
                Empresa creada — elige su plan
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                Cada empresa tiene su propio plan. Todos incluyen <strong>15 días de prueba gratis</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Banner: bienvenida después del sign-up */}
        {isNew && (
          <div className="mb-8 flex items-start gap-3 bg-teal-50 border border-teal-200 rounded-xl px-5 py-4">
            <div className="text-2xl">🎉</div>
            <div>
              <p className="text-sm font-semibold text-teal-800">
                ¡Cuenta creada! Elige tu plan para empezar
              </p>
              <p className="text-xs text-teal-700 mt-0.5">
                Todos los planes incluyen <strong>15 días de prueba gratis</strong>. Cancela cuando quieras.
              </p>
            </div>
          </div>
        )}

        {/* Banner: sin plan activo */}
        {noPlan && (
          <div className="mb-8 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                Necesitas un plan para acceder al dashboard
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Elige un plan y empieza con 15 días de prueba gratis.
              </p>
            </div>
          </div>
        )}

        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Planes y precios
          </h1>
          <p className="text-gray-500 text-lg">
            Precios en dólares (USD). Prueba 15 días gratis. Sin contratos. Cancela cuando quieras.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLANS.map((plan) => (
            <PricingCard key={plan.key} plan={plan} />
          ))}
        </div>

        <div className="text-center mt-10 space-y-2">
          <p className="text-sm text-gray-500 font-medium">
            ✓ 15 días de prueba gratis en todos los planes — sin tarjeta de crédito
          </p>
          <p className="text-sm text-gray-400">
            ¿Necesitas más de 800 comprobantes o integración personalizada?{' '}
            <a href="mailto:hola@emitedo.com" className="text-teal-600 underline">
              Contáctanos
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}


function PricingCard({ plan }: { plan: PlanDef }) {
  const priceId  = getPlanPriceId(plan.key);
  const destacado = plan.ui.highlighted;

  return (
    <div
      className={`relative flex flex-col p-8 rounded-2xl border ${
        destacado
          ? 'border-teal-600 bg-teal-600 text-white shadow-xl'
          : 'border-gray-200 bg-white'
      }`}
    >
      {destacado && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
          Más popular
        </span>
      )}

      <div className="mb-6">
        <h2 className={`text-xl font-bold mb-1 ${destacado ? 'text-white' : 'text-gray-900'}`}>
          {plan.name}
        </h2>
        <p className={`text-sm mb-4 ${destacado ? 'text-teal-100' : 'text-gray-500'}`}>
          {plan.ui.description}
        </p>
        <div className="flex items-baseline gap-1">
          <span className={`text-4xl font-bold ${destacado ? 'text-white' : 'text-gray-900'}`}>
            ${plan.price}
          </span>
          <span className={`text-sm ${destacado ? 'text-teal-100' : 'text-gray-500'}`}>
            USD/mes
          </span>
        </div>
        <p className={`text-xs mt-1 ${destacado ? 'text-teal-100' : 'text-gray-400'}`}>
          15 días gratis, luego ${plan.price}/mes
        </p>
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {plan.ui.marketingFeatures.map((feature, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check
              className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                destacado ? 'text-teal-100' : 'text-teal-600'
              }`}
            />
            <span className={`text-sm ${destacado ? 'text-teal-50' : 'text-gray-600'}`}>
              {feature}
            </span>
          </li>
        ))}
      </ul>

      {priceId ? (
        <form action={checkoutAction}>
          <input type="hidden" name="priceId" value={priceId} />
          <SubmitButton destacado={destacado} label="Empezar prueba gratis" />
        </form>
      ) : (
        <a
          href="/sign-up"
          className={`block text-center py-2.5 px-4 rounded-full text-sm font-medium transition-colors ${
            destacado
              ? 'bg-white text-teal-700 hover:bg-teal-50'
              : 'bg-teal-600 text-white hover:bg-teal-700'
          }`}
        >
          Empezar prueba gratis
        </a>
      )}
    </div>
  );
}

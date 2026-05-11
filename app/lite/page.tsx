/**
 * Página principal de Lite — un único archivo con 3 tabs:
 *   • Nueva factura  (default)
 *   • Facturas       (listado)
 *   • Mi empresa     (configuración)
 *
 * Tabs vía URL: ?tab=facturas | ?tab=empresa
 * Sin tab → "factura" por defecto.
 */

import Link from 'next/link';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teams } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { eq, desc } from 'drizzle-orm';
import {
  FacturaProvider,
  FacturaHeader, FacturaItems, FacturaFooter, FacturaMessages, FacturaPreview,
  FacturasList,
} from '@/components/factura';
import { EmpresaForm } from '@/components/empresa';

export const dynamic = 'force-dynamic';

type Tab = 'factura' | 'facturas' | 'empresa';

function isTab(v: string | undefined): v is Tab {
  return v === 'factura' || v === 'facturas' || v === 'empresa';
}

export default async function LitePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp     = await searchParams;
  const tab: Tab = isTab(sp.tab) ? sp.tab : 'factura';

  const teamId = await getTeamIdForUser();

  // Carga selectiva: solo lo que necesita la tab activa
  const facturas = teamId && (tab === 'facturas' || tab === 'factura')
    ? await db
        .select({
          id:                   ecfDocuments.id,
          encf:                 ecfDocuments.encf,
          tipoEcf:              ecfDocuments.tipoEcf,
          estado:               ecfDocuments.estado,
          razonSocialComprador: ecfDocuments.razonSocialComprador,
          montoTotal:           ecfDocuments.montoTotal,
          createdAt:            ecfDocuments.createdAt,
        })
        .from(ecfDocuments)
        .where(eq(ecfDocuments.teamId, teamId))
        .orderBy(desc(ecfDocuments.createdAt))
        .limit(20)
    : [];

  const empresa = teamId && tab === 'empresa'
    ? (await db.select().from(teams).where(eq(teams.id, teamId)).limit(1))[0]
    : null;

  return (
    <div className="space-y-6">
      <Tabs active={tab} />

      {tab === 'factura' && (
        <div className="space-y-6 sm:space-y-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Nueva factura</h1>
            <p className="text-sm text-gray-600 mt-1">
              Llena los datos y emite una factura de consumo electrónica.
            </p>
          </div>

          <FacturaProvider defaults={{ tipoEcf: '32' }}>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 sm:p-6 space-y-6">
              <FacturaHeader />
              <FacturaItems />
              <FacturaFooter />
              <FacturaMessages />
            </div>
            <FacturaPreview />
          </FacturaProvider>

          {facturas.length > 0 && (
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">
                Últimas facturas
              </h2>
              <FacturasList facturas={facturas.slice(0, 5)} />
            </div>
          )}
        </div>
      )}

      {tab === 'facturas' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Facturas</h1>
            <p className="text-sm text-gray-600 mt-1">
              Todas las facturas que has emitido.
            </p>
          </div>
          <FacturasList facturas={facturas} />
        </div>
      )}

      {tab === 'empresa' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Mi empresa</h1>
            <p className="text-sm text-gray-600 mt-1">
              Datos que aparecerán en cada factura emitida.
            </p>
          </div>
          {empresa ? (
            <EmpresaForm
              initial={{
                razonSocial:      empresa.razonSocial,
                nombreComercial:  empresa.nombreComercial,
                rnc:              empresa.rnc,
                direccion:        empresa.direccion,
                telefono:         empresa.telefono,
                emailFacturacion: empresa.emailFacturacion,
                sitioWeb:         empresa.sitioWeb,
              }}
            />
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-sm text-gray-500">
              No se encontró información de la empresa.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

function Tabs({ active }: { active: Tab }) {
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'factura',  label: 'Nueva factura' },
    { id: 'facturas', label: 'Facturas' },
    { id: 'empresa',  label: 'Mi empresa' },
  ];

  return (
    <div className="border-b border-gray-200">
      <nav className="flex gap-1 -mb-px overflow-x-auto">
        {tabs.map(t => {
          const isActive = active === t.id;
          const href     = t.id === 'factura' ? '/lite' : `/lite?tab=${t.id}`;
          return (
            <Link
              key={t.id}
              href={href}
              className={
                'px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ' +
                (isActive
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300')
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

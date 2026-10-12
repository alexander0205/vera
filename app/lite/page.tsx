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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <LiteTabs active={tab} />

      {tab === 'factura' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 3, sm: 4 } }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>Nueva factura</Typography>
            <Typography sx={{ fontSize: '0.875rem', color: '#4b5563', mt: 0.5 }}>
              Llena los datos y emite una factura de consumo electrónica.
            </Typography>
          </Box>

          <FacturaProvider defaults={{ tipoEcf: '32' }}>
            <Box sx={{ bgcolor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <FacturaHeader />
              <FacturaItems />
              <FacturaFooter />
              <FacturaMessages />
            </Box>
            <FacturaPreview />
          </FacturaProvider>

          {facturas.length > 0 && (
            <Box>
              <Typography sx={{ fontSize: { xs: '1rem', sm: '1.125rem' }, fontWeight: 600, color: '#111827', mb: 1.5 }}>
                Últimas facturas
              </Typography>
              <FacturasList facturas={facturas.slice(0, 5)} />
            </Box>
          )}
        </Box>
      )}

      {tab === 'facturas' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>Facturas</Typography>
            <Typography sx={{ fontSize: '0.875rem', color: '#4b5563', mt: 0.5 }}>
              Todas las facturas que has emitido.
            </Typography>
          </Box>
          <FacturasList facturas={facturas} />
        </Box>
      )}

      {tab === 'empresa' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>Mi empresa</Typography>
            <Typography sx={{ fontSize: '0.875rem', color: '#4b5563', mt: 0.5 }}>
              Datos que aparecerán en cada factura emitida.
            </Typography>
          </Box>
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
            <Box sx={{ bgcolor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', p: 3, textAlign: 'center' }}>
              <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>
                No se encontró información de la empresa.
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

function LiteTabs({ active }: { active: Tab }) {
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'factura',  label: 'Nueva factura' },
    { id: 'facturas', label: 'Facturas' },
    { id: 'empresa',  label: 'Mi empresa' },
  ];

  return (
    <Box sx={{ borderBottom: '1px solid #e5e7eb' }}>
      <Box component="nav" sx={{ display: 'flex', gap: 0.5, mb: '-1px', overflowX: 'auto' }}>
        {tabs.map(t => {
          const isActive = active === t.id;
          const href = t.id === 'factura' ? '/lite' : `/lite?tab=${t.id}`;
          return (
            <Box
              key={t.id}
              component="a"
              href={href}
              sx={{
                px: { xs: 1.5, sm: 2 },
                py: 1.25,
                fontSize: '0.875rem',
                fontWeight: 500,
                borderBottom: '2px solid',
                whiteSpace: 'nowrap',
                textDecoration: 'none',
                transition: 'color 0.15s',
                ...(isActive
                  ? { borderColor: '#ea580c', color: '#ea580c' }
                  : { borderColor: 'transparent', color: '#6b7280', '&:hover': { color: '#374151', borderColor: '#d1d5db' } }),
              }}
            >
              {t.label}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

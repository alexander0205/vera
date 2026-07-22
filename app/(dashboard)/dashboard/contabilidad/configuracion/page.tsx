import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser, getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers, categorias, products } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import { listarCuentas } from '@/lib/contabilidad/cuentas';
import {
  getConfig, getMetodosConfigurados, getOverridesIngreso,
} from '@/lib/contabilidad/config';
import { getEstadoConfiguracion } from '@/lib/contabilidad/validacion';
import { ConfigClient } from './_client';
import { ChevronRight } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';

export const dynamic = 'force-dynamic';

/**
 * Configuración contable — Paso 3 del plan.
 *
 * Le dice al sistema qué cuenta usar para cada cosa, para que el Paso 4 pueda
 * generar asientos sin preguntar en cada factura.
 */
export default async function ConfiguracionContablePage() {
  await requirePermission('contabilidad:ver');

  const teamId = await getTeamIdForUser();
  const user = await getUser();
  if (!teamId || !user) redirect('/sign-in');

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  const puedeConfigurar = await userCanForTeam(
    teamId, user.platformRole, member?.role, 'contabilidad:configurar',
  );

  const [config, metodos, overrides, estado, cuentas, cats, prods] = await Promise.all([
    getConfig(teamId),
    getMetodosConfigurados(teamId),
    getOverridesIngreso(teamId),
    getEstadoConfiguracion(teamId),
    // Solo las imputables: apuntar la configuración a una cuenta de agrupación
    // produciría asientos sobre una cuenta que no los recibe.
    listarCuentas(teamId).then((cs) => cs.filter((c) => c.imputable && c.activa)),
    db.select({ id: categorias.id, nombre: categorias.nombre })
      .from(categorias).where(eq(categorias.teamId, teamId)).orderBy(asc(categorias.nombre)),
    db.select({ id: products.id, nombre: products.nombre })
      .from(products).where(eq(products.teamId, teamId)).orderBy(asc(products.nombre)).limit(500),
  ]);

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Contabilidad</Typography>
        <ChevronRight style={{ width: 14, height: 14, color: '#6b7280' }} />
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#0d9488', fontWeight: 500 }}>Configuración contable</Typography>
      </Box>

      <Box>
        <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
          Configuración contable
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
          Qué cuenta usar para cada cosa, para que el sistema no te lo pregunte en
          cada factura. Todavía no se generan asientos — eso llega en el siguiente paso.
        </Typography>
      </Box>

      {cuentas.length === 0 ? (
        <Alert severity="warning">
          Todavía no hay cuentas en el catálogo.{' '}
          <Box component="a" href="/dashboard/contabilidad/cuentas" sx={{ fontWeight: 500, textDecoration: 'underline', color: 'inherit' }}>
            Abre el catálogo de cuentas
          </Box>{' '}
          primero: se creará solo con la estructura estándar.
        </Alert>
      ) : (
        <ConfigClient
          configInicial={config}
          metodosIniciales={metodos}
          overridesIniciales={overrides}
          estadoInicial={estado}
          cuentas={cuentas}
          categorias={cats}
          productos={prods}
          puedeConfigurar={puedeConfigurar}
        />
      )}
    </Box>
  );
}

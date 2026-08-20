import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser, getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import { getConfig } from '@/lib/contabilidad/config';
import {
  listarAsientos, contarPendientes, verificarCuadre, cuentasConMovimientos,
  ORIGENES, type OrigenTipo,
} from '@/lib/contabilidad/libro-diario';
import { fechaValidaISO } from '@/lib/utils/format';
import { LibroDiarioClient } from './_client';
import { ChevronRight } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';

export const dynamic = 'force-dynamic';

// 25 en vez de 50: páginas más ligeras y menos filas por consulta — el patrón
// de la rama perf/db-optimization, mismo tamaño que la cartera.
const PAGE_SIZE = 25;

/**
 * Libro diario — Paso 4 del plan, con los filtros del Paso 6.
 *
 * Los asientos NO se generan al abrir esta página: hacerlo convertiría un GET en
 * una escritura contable, que se dispararía con cada recarga o prefetch. El
 * barrido es un botón explícito.
 *
 * **Los filtros viven en la URL, no en estado del cliente.** Así el servidor
 * hace el filtrado y la paginación (el libro puede tener miles de asientos y
 * traerlos todos al navegador para filtrarlos ahí es el bug que se arregló en
 * la cartera), y de paso una vista filtrada se puede compartir o guardar.
 */
export default async function LibroDiarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission('contabilidad:ver');

  const teamId = await getTeamIdForUser();
  const user = await getUser();
  if (!teamId || !user) redirect('/sign-in');

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  const puedeGenerar = await userCanForTeam(
    teamId, user.platformRole, member?.role, 'contabilidad:gestionar',
  );

  const sp = await searchParams;

  const origenTipo = ORIGENES.includes(sp.origenTipo as OrigenTipo)
    ? (sp.origenTipo as OrigenTipo)
    : undefined;
  const desde = fechaValidaISO(sp.desde);
  const hasta = fechaValidaISO(sp.hasta);
  const cuentaNum = Number(sp.cuentaId);
  const cuentaId = Number.isInteger(cuentaNum) && cuentaNum > 0 ? cuentaNum : undefined;
  const paginaNum = Number(sp.pagina);
  const pagina = Number.isInteger(paginaNum) && paginaNum > 0 ? paginaNum : 1;

  const filtros = { origenTipo, desde, hasta, cuentaId };

  const [cfg, primera, pendientes, cuadre, cuentas] = await Promise.all([
    getConfig(teamId),
    listarAsientos(teamId, { ...filtros, limit: PAGE_SIZE, offset: (pagina - 1) * PAGE_SIZE }),
    contarPendientes(teamId),
    verificarCuadre(teamId),
    cuentasConMovimientos(teamId),
  ]);

  // Una página fuera de rango (`?pagina=999` a mano, o un enlace viejo tras
  // borrarse asientos) devuelve cero filas sobre un libro que sí tiene datos, y
  // la pantalla acaba diciendo "todavía no hay asientos" — que es falso y
  // asusta. Se cae a la última página real.
  //
  // La consulta extra solo ocurre en ese caso anómalo: el camino normal sigue
  // siendo una sola, en paralelo con las demás.
  const paginaMax = Math.max(1, Math.ceil(primera.total / PAGE_SIZE));
  const paginaReal = Math.min(pagina, paginaMax);

  const { asientos, total, sumaCents } = paginaReal === pagina
    ? primera
    : await listarAsientos(teamId, {
        ...filtros, limit: PAGE_SIZE, offset: (paginaReal - 1) * PAGE_SIZE,
      });

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Contabilidad</Typography>
        <ChevronRight style={{ width: 14, height: 14, color: '#6b7280' }} />
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#3658e1', fontWeight: 500 }}>Libro diario</Typography>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
            Libro diario
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
            El registro contable que se genera solo a partir de tus facturas y cobros.
            Cada asiento tiene que cuadrar: lo que entra por un lado sale por el otro.
          </Typography>
        </Box>
        {total > 0 && (
          <Box component="a"
            href={`/api/contabilidad/libro-diario/export?${new URLSearchParams({
              ...(origenTipo ? { origenTipo } : {}),
              ...(desde ? { desde } : {}),
              ...(hasta ? { hasta } : {}),
              ...(cuentaId ? { cuentaId: String(cuentaId) } : {}),
            })}`}
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: '0.8125rem', fontWeight: 500,
              px: 1.75, py: 1, borderRadius: '8px', textDecoration: 'none',
              color: '#2a45c4', bgcolor: '#eef2fe', border: '1px solid #c7d2fc',
              '&:hover': { bgcolor: '#e0e7fd' } }}
          >
            Exportar a Excel
          </Box>
        )}
      </Box>

      {!cfg.activa && (
        <Alert severity="warning">
          <strong>La contabilidad automática está apagada</strong>, así que no se
          genera ningún asiento.{' '}
          <Box component="a" href="/dashboard/contabilidad/configuracion" sx={{ fontWeight: 500, textDecoration: 'underline', color: 'inherit' }}>
            Ve a la configuración
          </Box>{' '}
          para completarla y encenderla.
        </Alert>
      )}

      <LibroDiarioClient
        asientosIniciales={asientos}
        total={total}
        sumaCents={sumaCents}
        pendientes={pendientes}
        descuadrados={cuadre.asientosDescuadrados}
        activa={cfg.activa}
        puedeGenerar={puedeGenerar}
        cuentas={cuentas}
        filtros={{ ...filtros, pagina: paginaReal }}
        pageSize={PAGE_SIZE}
      />
    </Box>
  );
}

import { redirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { requirePermission, hasPermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { hoyRD } from '@/lib/utils/format';
import { listarActivosFijos } from '@/lib/contabilidad/depreciacion';
import { cuentasDeSalida, catalogoImputable, getConfig } from '@/lib/contabilidad/config';
import { esCuentaCajaBanco, esCuentaDeActivoFijo, CATEGORIAS_ACTIVO } from '@/lib/contabilidad/activos-fijos';
import Link from 'next/link';
import { listarEspacios } from '@/lib/escolar/inventario-aula-db';
import { ActivosFijosClient } from './_client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export const dynamic = 'force-dynamic';

/**
 * Activos fijos y depreciación (Nivel 4.2).
 *
 * Listar exige `contabilidad:ver`; registrar y generar depreciaciones, además,
 * `contabilidad:gestionar` — la API lo vuelve a exigir, la pantalla solo esconde
 * los controles a quien no puede. La depreciación se genera sola por el cron; el
 * botón es para "quiero verlo ahora".
 */
export default async function ActivosFijosPage() {
  await requirePermission('contabilidad:ver');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const [activos, puedeGestionar, salida, catalogo, cfg] = await Promise.all([
    listarActivosFijos(teamId),
    hasPermission('contabilidad:gestionar'),
    cuentasDeSalida(teamId),
    catalogoImputable(teamId),
    getConfig(teamId),
  ]);
  const nombresCuenta: Record<string, string> = {};
  for (const c of ['1201', ...CATEGORIAS_ACTIVO.map((k) => k.cuentaActivo)]) {
    const f = catalogo.porCodigo.get(c);
    if (f) nombresCuenta[c] = f.nombre;
  }

  // Las aulas, para ponerle una a cada ficha. Sin la migración 0236 no hay lista y no se ofrece nada.
  const espacios = await listarEspacios(teamId).then((l) => l.map((e) => ({ id: e.id, nombre: e.nombre }))).catch(() => []);

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1240, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Contabilidad</Typography>
        <ChevronRight style={{ width: 14, height: 14, color: '#6b7280' }} />
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#3658e1', fontWeight: 500 }}>Activos fijos</Typography>
      </Box>

      <Box>
        <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
          Activos fijos
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
          Los bienes de larga vida (edificio, equipo, mobiliario) con su costo y vida útil.
          Zero calcula cada mes la depreciación (método lineal) y hace su asiento.
        </Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280', mt: 0.5 }}>
          De dónde salen: de las compras con categoría «Compra de activo fijo» en{' '}
          <Link href="/dashboard/compras/registrar" style={{ color: '#3658e1', fontWeight: 500 }}>Compras</Link>{' '}
          (la ficha se abre sola; tú confirmas su categoría y vida útil) o del botón «Registrar activo».
        </Typography>
      </Box>

      <ActivosFijosClient activos={activos} hoy={hoyRD()} puedeGestionar={puedeGestionar} cuentasCobro={salida.cuentas.filter((c) => esCuentaCajaBanco(c.codigo)).map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre }))}
        espacios={espacios} contabilidadActiva={cfg.activa} nombresCuenta={nombresCuenta}
        cuentasActivo={[...catalogo.imputables.values()].filter((c) => esCuentaDeActivoFijo(c.codigo)).map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre }))} />
    </Box>
  );
}

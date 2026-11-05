import Link from 'next/link';
import Button from '@mui/material/Button';
import { Plus } from 'lucide-react';
import { exigirAdmin } from '@/lib/auth/admin-guard';
import { leerConsulta } from '@/lib/admin/consulta-tabla';
import { consultarEmpresas, DEF_EMPRESAS, opcionesDeEmpresas } from '@/lib/admin/tablas';
import { EncabezadoPagina } from '@/components/admin/piezas';
import { TablaEmpresas } from './_tabla';

export const dynamic = 'force-dynamic';

export default async function AdminEmpresasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirAdmin();   // antes de tocar la base: ver lib/auth/admin-guard.ts
  const c = leerConsulta(await searchParams, DEF_EMPRESAS);
  const [{ filas, total }, opciones] = await Promise.all([consultarEmpresas(c), opcionesDeEmpresas()]);

  return (
    <>
      <EncabezadoPagina
        titulo="Empresas"
        descripcion={`${total.toLocaleString('es-DO')} ${total === 1 ? 'empresa' : 'empresas'}${c.q || Object.keys(c.filtros).length ? ' con estos filtros' : ' en la plataforma'}. Busca, ordena y entra a una para administrarla.`}
        acciones={
          <Link href="/admin/empresas/nueva" style={{ textDecoration: 'none' }}>
            <Button variant="contained" disableElevation startIcon={<Plus size={16} />}
              sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}>
              Nueva empresa
            </Button>
          </Link>
        }
      />
      <TablaEmpresas filas={filas} total={total} estado={c} planes={opciones.planes} estados={opciones.estados} />
    </>
  );
}

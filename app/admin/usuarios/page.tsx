import Link from 'next/link';
import Button from '@mui/material/Button';
import { UserCog } from 'lucide-react';
import { exigirAdmin } from '@/lib/auth/admin-guard';
import { leerConsulta } from '@/lib/admin/consulta-tabla';
import { consultarUsuarios, DEF_USUARIOS } from '@/lib/admin/tablas';
import { EncabezadoPagina } from '@/components/admin/piezas';
import { TablaUsuarios } from './_tabla';

export const dynamic = 'force-dynamic';

export default async function AdminUsuariosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirAdmin();   // antes de tocar la base: ver lib/auth/admin-guard.ts
  const c = leerConsulta(await searchParams, DEF_USUARIOS);
  const { filas, total } = await consultarUsuarios(c);

  return (
    <>
      <EncabezadoPagina
        titulo="Usuarios"
        descripcion={`${total.toLocaleString('es-DO')} ${total === 1 ? 'cuenta' : 'cuentas'}${c.q || Object.keys(c.filtros).length ? ' con estos filtros' : ' registradas en la plataforma'}.`}
        acciones={
          <Link href="/admin/equipo" style={{ textDecoration: 'none' }}>
            <Button variant="outlined" startIcon={<UserCog size={16} />} sx={{ borderRadius: '8px', textTransform: 'none' }}>
              Equipo Zero
            </Button>
          </Link>
        }
      />
      <TablaUsuarios filas={filas} total={total} estado={c} />
    </>
  );
}

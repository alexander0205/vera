import { exigirAdmin } from '@/lib/auth/admin-guard';
import { esDuenoDePlataforma, listarEquipo } from '@/lib/auth/equipo-zero';
import { EncabezadoPagina } from '@/components/admin/piezas';
import { urlFotoEquipo } from '@/lib/auth/equipo-zero-perfil-reglas';
import { EquipoClient, type MiembroVista } from './_equipo-client';

export const dynamic = 'force-dynamic';

export default async function AdminEquipoPage({ searchParams }: { searchParams: Promise<{ perfil?: string }> }) {
  const yo = await exigirAdmin();   // antes de tocar la base: ver lib/auth/admin-guard.ts
  const { perfil } = await searchParams;
  const [equipo, esDueno] = await Promise.all([listarEquipo(), esDuenoDePlataforma(yo.id)]);

  const miembros: MiembroVista[] = equipo.miembros.map((m) => ({
    id: m.id, nombre: m.nombre, email: m.email, esDueno: m.esDueno, dosFactores: m.dosFactores,
    emailVerificado: m.emailVerificado, creadoEn: m.creadoEn.toISOString(),
    enlacePendienteHasta: m.enlacePendienteHasta?.toISOString() ?? null,
    cargo: m.cargo, fotoUrl: m.fotoVersion === null ? null : urlFotoEquipo(m.id, m.fotoVersion),
  }));

  return (
    <>
      <EncabezadoPagina
        titulo="Equipo Zero"
        descripcion="Las personas con acceso de administrador a la plataforma: ven y crean empresas y usan todo el panel. Cada cambio queda registrado con quién lo hizo."
      />
      <EquipoClient key={perfil === '1' ? 'perfil' : 'lista'} miembros={miembros} yoId={yo.id} esDueno={esDueno} migracionPendiente={equipo.migracionPendiente} abrirMiPerfil={perfil === '1'} />
    </>
  );
}

import { redirect } from 'next/navigation';

/**
 * Roles y permisos viven en Administración (/cuenta/roles), junto a Usuarios y
 * Mi empresa. Esta dirección se queda para los enlaces y marcadores viejos.
 */
export default function PermisosPage() {
  redirect('/cuenta/roles');
}

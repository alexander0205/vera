import { PaginaPantallaOculta } from '@/components/gobernanza/PaginaPantallaOculta';

/** La sirve el proxy en lugar de una pantalla oculta para el rol (lib/auth/pantallas-proxy.ts). */
export default function Page({ searchParams }: { searchParams: Promise<{ pantalla?: string | string[] }> }) {
  return <PaginaPantallaOculta searchParams={searchParams} />;
}

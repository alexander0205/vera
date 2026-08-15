'use client';

/**
 * La franja que avisa que a la suscripción le pasa algo.
 *
 * Se pinta arriba del contenido, en todos los módulos, y solo cuando hay algo
 * que decir: `avisar: false` no renderiza nada. Sale del mismo objeto que usa
 * el guard del servidor (lib/suscripcion/estado.ts), así que lo que el
 * usuario lee y lo que el sistema hace no pueden contradecirse.
 *
 * Es informativa, no un bloqueo. Quien está en solo-lectura puede seguir
 * navegando; lo que se le corta es crear, y eso lo dice el error de la acción
 * que intente.
 */

import { useEffect } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import { AlertTriangle, Clock, CreditCard } from 'lucide-react';
import { BILLING_ENABLED } from '@/lib/config/billing';
import type { EstadoSuscripcion } from '@/lib/suscripcion/estado';

interface Estado {
  estado: EstadoSuscripcion;
  avisar: boolean;
  mensaje: string | null;
  diasRestantes: number | null;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

/**
 * Tres tonos, no cinco. El color aquí codifica urgencia, y con más matices
 * dejan de distinguirse: azul es "entérate", ámbar es "hazlo esta semana",
 * rojo es "ya no puedes trabajar".
 */
const TONOS: Record<string, { fondo: string; borde: string; texto: string; icono: typeof Clock }> = {
  aviso:   { fondo: '#eff6ff', borde: '#bfdbfe', texto: '#1e40af', icono: Clock },
  urgente: { fondo: '#fffbeb', borde: '#fde68a', texto: '#92400e', icono: CreditCard },
  cortado: { fondo: '#fef2f2', borde: '#fecaca', texto: '#991b1b', icono: AlertTriangle },
};

function tonoDe(estado: EstadoSuscripcion): keyof typeof TONOS {
  if (estado === 'solo-lectura' || estado === 'cerrada' || estado === 'sin-plan') return 'cortado';
  if (estado === 'mora' || estado === 'prueba-por-vencer') return 'urgente';
  return 'aviso';
}

/**
 * Adonde SÍ se puede estar sin plan: la pantalla donde se elige, la
 * comparación de precios y la cuenta. Todo lo demás redirige al selector —
 * sin plan no hay con qué trabajar, y dejarlo pasear por un dashboard que le
 * va a rechazar cada acción es peor que llevarlo directo a resolverlo.
 */
const RUTAS_SIN_PLAN = ['/dashboard/suscripcion', '/pricing', '/cuenta'];

export function BannerSuscripcion() {
  // Con el billing apagado no se pide nada: ni el request suelto por página.
  const { data } = useSWR<Estado>(
    BILLING_ENABLED ? '/api/suscripcion/estado' : null,
    fetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false, refreshInterval: 0 },
  );

  const pathname = usePathname();
  const router = useRouter();
  const debeElegirPlan =
    data?.estado === 'sin-plan' && !RUTAS_SIN_PLAN.some(r => pathname.startsWith(r));

  useEffect(() => {
    if (debeElegirPlan) router.replace('/dashboard/suscripcion');
  }, [debeElegirPlan, router]);

  if (!data?.avisar || !data.mensaje) return null;

  const tono = TONOS[tonoDe(data.estado)];
  const Icono = tono.icono;

  return (
    <Box
      role="status"
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5,
        px: { xs: 2, md: 3 }, py: 1.25,
        bgcolor: tono.fondo,
        borderBottom: `1px solid ${tono.borde}`,
        color: tono.texto,
        fontSize: '0.875rem',
      }}
    >
      <Icono aria-hidden style={{ width: 16, height: 16, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>{data.mensaje}</Box>
      <Link
        href="/dashboard/suscripcion"
        style={{ fontWeight: 600, textDecoration: 'underline', whiteSpace: 'nowrap' }}
      >
        Ver mi plan
      </Link>
    </Box>
  );
}

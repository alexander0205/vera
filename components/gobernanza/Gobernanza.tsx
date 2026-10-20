'use client';

/**
 * Mostrar u ocultar por rol las portadas de Gobernanza (Panorama) y de
 * Facturación (Dashboard). Catálogo en lib/config/pantallas.ts.
 *
 *  - `PantallasDelRol`     → dos interruptores dentro del editor de un rol
 *    (Equipo → Permisos → el rol).
 *  - `AtajoPantallaRoles`  → el «comando»: Alt+Shift+R en Panorama o en el
 *    Dashboard abre la lista de roles con un interruptor cada uno. Solo lo
 *    monta el layout para quien gestiona el equipo.
 *  - `GuardPantalla`       → si la pantalla en la que se está quedó oculta para
 *    el rol, enseña «no está disponible para ti». Cubre también la llegada por URL.
 *
 * El menú se filtra por lo mismo (server en /escolar, /api/user en
 * Facturación). Tras cada cambio se refresca la ruta para que lo tome al
 * momento.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import CircularProgress from '@mui/material/CircularProgress';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { pantallaDeRuta, veLaPantalla, type PantallaDef } from '@/lib/config/pantallas';

interface RolPantallas { id: number; key: string; label: string; ocultas: string[] }
interface Datos { pantallas: PantallaDef[]; roles: RolPantallas[] }

const URL_API = '/api/equipo/pantallas';
const fetcher = (url: string) => fetch(url).then(r => (r.ok ? r.json() : Promise.reject(r)));

/** Lee las pantallas por rol y devuelve con qué cambiarlas. */
function usePantallasPorRol(activo = true) {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<Datos>(activo ? URL_API : null, fetcher);
  const [guardando, setGuardando] = useState<string | null>(null);

  const fijar = useCallback(async (rol: RolPantallas, pantalla: string, visible: boolean) => {
    setGuardando(`${rol.id}:${pantalla}`);
    // Optimista: el interruptor responde ya; si el servidor dice que no, se revierte.
    const ocultas = visible ? rol.ocultas.filter(p => p !== pantalla) : [...rol.ocultas, pantalla];
    mutate(d => d && { ...d, roles: d.roles.map(r => (r.id === rol.id ? { ...r, ocultas } : r)) }, false);
    try {
      const res = await fetch(URL_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: rol.id, pantalla, visible }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No se pudo guardar');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(null);
      mutate();
    }
  }, [mutate, router]);

  return { data, isLoading, fijar, guardando };
}

// ─── Bloqueo ──────────────────────────────────────────────────────────────────

export function GuardPantalla({ ocultas, children }: { ocultas: string[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const pantalla = ocultas.length ? pantallaDeRuta(pathname) : null;
  if (!pantalla || !ocultas.includes(pantalla.id)) return <>{children}</>;

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', p: { xs: 2, sm: 6 } }}>
      <Box sx={{ maxWidth: 420, textAlign: 'center' }}>
        <Box sx={{ width: 48, height: 48, borderRadius: '14px', bgcolor: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
          <Lock size={22} aria-hidden />
        </Box>
        <Typography sx={{ fontWeight: 600, fontSize: '1.125rem', color: '#111827' }}>
          {pantalla.label} no está disponible para ti
        </Typography>
        <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: '#6b7280' }}>
          El administrador la desactivó para tu rol. Si la necesitas, pídele que te la habilite.
        </Typography>
        <Box sx={{ mt: 3 }}>
          <Button asChild variant="outline" size="sm">
            <Link href={pantalla.alternativa.href}>{pantalla.alternativa.label}</Link>
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

// ─── Interruptor de una pantalla para un rol ─────────────────────────────────

function Interruptor({ visible, disabled, etiqueta, onChange }: {
  visible: boolean;
  disabled?: boolean;
  etiqueta: string;
  onChange: (visible: boolean) => void;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Typography sx={{ fontSize: '0.75rem', color: visible ? '#047857' : '#6b7280', fontWeight: 500, width: 50, textAlign: 'right' }}>
        {visible ? 'La ve' : 'Oculta'}
      </Typography>
      <Switch
        size="small"
        checked={visible}
        disabled={disabled}
        onChange={(_, v) => onChange(v)}
        slotProps={{ input: { 'aria-label': etiqueta } }}
      />
    </Box>
  );
}

// ─── Dentro del editor de un rol ──────────────────────────────────────────────

/**
 * Las portadas que este rol ve, con un interruptor cada una. Solo las de los
 * módulos que tiene la empresa. Cambia al instante (no pasa por «Guardar
 * cambios», que es de los permisos), y lo dice.
 */
export function PantallasDelRol({ roleId }: { roleId: number }) {
  const { modules } = usePermissions();
  const { data, isLoading, fijar, guardando } = usePantallasPorRol();
  const rol = data?.roles.find(r => r.id === roleId);
  const pantallas = (data?.pantallas ?? []).filter(p => (modules as string[]).includes(p.modulo));
  if (isLoading || !rol || pantallas.length === 0) return null;

  const esOwner = rol.key === 'owner';
  return (
    <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #f3f4f6' }}>
        <Typography component="h2" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>
          Pantallas de inicio
        </Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>
          Muestra u oculta la portada de cada módulo para este rol. Se guarda al instante.
        </Typography>
      </Box>
      {pantallas.map((p, i) => (
        <Box
          key={p.id}
          component="label"
          sx={{
            display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1,
            borderTop: i === 0 ? 'none' : '1px solid #f9fafb',
            cursor: esOwner ? 'default' : 'pointer',
            '&:hover': esOwner ? undefined : { bgcolor: '#f9fafb' },
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
              {p.label} <Box component="span" sx={{ color: '#6b7280', fontWeight: 400 }}>· {p.moduloLabel}</Box>
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{p.descripcion}</Typography>
          </Box>
          <Interruptor
            visible={veLaPantalla(rol, p.id)}
            disabled={esOwner || guardando === `${rol.id}:${p.id}`}
            etiqueta={`${p.label} (${p.moduloLabel})`}
            onChange={v => fijar(rol, p.id, v)}
          />
        </Box>
      ))}
      {esOwner && (
        <Box sx={{ px: 2, py: 1, borderTop: '1px solid #f3f4f6', fontSize: '0.75rem', color: '#6b7280' }}>
          El Propietario siempre ve todas las pantallas.
        </Box>
      )}
    </Paper>
  );
}

// ─── Atajo Alt+Shift+R ────────────────────────────────────────────────────────

/** `e.code` y no `e.key`: con Alt, en Mac la R escribe «®» y en otros teclados cambia. */
function esAtajo(e: KeyboardEvent) {
  return e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyR';
}

export function AtajoPantallaRoles() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const { data, isLoading, fijar, guardando } = usePantallasPorRol(abierto);
  const pantalla = pantallaDeRuta(pathname);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!esAtajo(e)) return;
      e.preventDefault();
      setAbierto(a => !a);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Dialog open={abierto} onClose={() => setAbierto(false)} fullWidth maxWidth="xs" aria-labelledby="atajo-pantalla-titulo">
      <DialogTitle id="atajo-pantalla-titulo" sx={{ pb: 0.5 }}>
        <Typography component="span" sx={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}>
          ¿Quién ve esta pantalla?
        </Typography>
        <Typography component="span" sx={{ display: 'block', fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
          {pantalla ? `${pantalla.label} · ${pantalla.moduloLabel}` : 'Esta pantalla'}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {!pantalla ? (
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', py: 1 }}>
            Solo se pueden ocultar Panorama (Gobernanza) y el Dashboard (Facturación). Abre una de las dos
            y vuelve a pulsar Alt + Shift + R.
          </Typography>
        ) : isLoading || !data ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3, color: '#9ca3af' }}>
            <CircularProgress size={18} color="inherit" />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', mt: 1 }}>
            {data.roles.map(rol => {
              const esOwner = rol.key === 'owner';
              return (
                <Box key={rol.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #f9fafb' }}>
                  <Box>
                    <Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>{rol.label}</Typography>
                    {esOwner && <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>Siempre ve todo</Typography>}
                  </Box>
                  {esOwner ? (
                    <Lock size={15} style={{ color: '#6b7280' }} aria-label="Siempre la ve" />
                  ) : (
                    <Interruptor
                      visible={veLaPantalla(rol, pantalla.id)}
                      disabled={guardando === `${rol.id}:${pantalla.id}`}
                      etiqueta={`${rol.label} ve ${pantalla.label}`}
                      onChange={v => fijar(rol, pantalla.id, v)}
                    />
                  )}
                </Box>
              );
            })}
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, pt: 1.5, borderTop: '1px solid #f3f4f6' }}>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>Alt + Shift + R</Typography>
          <Link
            href="/cuenta/roles"
            onClick={() => setAbierto(false)}
            style={{ fontSize: '0.8125rem', color: '#3658e1', fontWeight: 500 }}
          >
            Roles y permisos →
          </Link>
        </Box>
      </DialogContent>
    </Dialog>
  );
}


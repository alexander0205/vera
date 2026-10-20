'use client';

/**
 * Gobernanza del colegio: qué pantallas ve cada rol.
 *
 *  - `GuardPantalla`        → envuelve el contenido del módulo; si la pantalla
 *    en la que se está quedó apagada para el rol, enseña «Sin acceso» en vez de
 *    la pantalla. Cubre también la llegada por URL o por un enlace guardado.
 *  - `AtajoPantallaRoles`   → Alt+Shift+R abre, sobre la pantalla en la que se
 *    está, la lista de roles con un interruptor cada uno. Solo lo monta el
 *    layout para quien gestiona el equipo.
 *  - `MatrizPantallas`      → todas las pantallas × todos los roles. Vive en
 *    Equipo → Permisos y el panel del atajo enlaza a ella.
 *
 * El menú se filtra en el servidor (ver app/escolar/layout.tsx). Tras cada
 * cambio se refresca la ruta para que menú y bloqueo lo tomen al momento.
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
import { Lock, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PANTALLAS_ESCOLAR, pantallaDeRuta, type PantallaDef } from '@/lib/config/pantallas';

interface RolPantallas { id: number; key: string; label: string; ocultas: string[] }
interface DatosPantallas { pantallas: PantallaDef[]; roles: RolPantallas[] }

const URL_API = '/api/equipo/pantallas';
const fetcher = (url: string) => fetch(url).then(r => (r.ok ? r.json() : Promise.reject(r)));

/** Lee la matriz y devuelve con qué cambiar una casilla. */
function usePantallasPorRol(activo = true) {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<DatosPantallas>(activo ? URL_API : null, fetcher);
  const [guardando, setGuardando] = useState<string | null>(null);

  const fijar = useCallback(async (rol: RolPantallas, pantalla: string, visible: boolean) => {
    const clave = `${rol.id}:${pantalla}`;
    setGuardando(clave);
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

  const otras = PANTALLAS_ESCOLAR.filter(p => !ocultas.includes(p.id));
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', p: { xs: 2, sm: 6 } }}>
      <Box sx={{ maxWidth: 420, textAlign: 'center' }}>
        <Box sx={{ width: 48, height: 48, borderRadius: '14px', bgcolor: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
          <Lock size={22} />
        </Box>
        <Typography sx={{ fontWeight: 600, fontSize: '1.125rem', color: '#111827' }}>
          {pantalla.label} no está disponible para tu rol
        </Typography>
        <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: '#6b7280' }}>
          El administrador del colegio la desactivó. Si la necesitas, pídele que te la habilite.
        </Typography>
        {otras.length > 0 && (
          <Box sx={{ mt: 3, display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
            {otras.map(p => (
              <Button key={p.id} asChild variant="outline" size="sm">
                <Link href={p.href}>{p.label}</Link>
              </Button>
            ))}
          </Box>
        )}
      </Box>
    </Box>
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
    <Dialog open={abierto} onClose={() => setAbierto(false)} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 0.5 }}>
        <Typography component="span" sx={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}>
          Quién ve esta pantalla
        </Typography>
        <Typography component="span" sx={{ display: 'block', fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
          {pantalla?.label ?? 'Esta pantalla'}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {!pantalla ? (
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', py: 1 }}>
            Esta pantalla no se puede apagar por rol. Las que sí, están en la lista completa.
          </Typography>
        ) : isLoading || !data ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3, color: '#9ca3af' }}>
            <CircularProgress size={18} color="inherit" />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {data.roles.map(rol => (
              <FilaRol
                key={rol.id}
                rol={rol}
                pantalla={pantalla.id}
                guardando={guardando === `${rol.id}:${pantalla.id}`}
                onCambiar={visible => fijar(rol, pantalla.id, visible)}
              />
            ))}
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, pt: 1.5, borderTop: '1px solid #f3f4f6' }}>
          <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>Alt + Shift + R</Typography>
          <Link
            href="/dashboard/equipo/permisos#pantallas"
            onClick={() => setAbierto(false)}
            style={{ fontSize: '0.8125rem', color: '#3658e1', fontWeight: 500 }}
          >
            Todas las pantallas →
          </Link>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function FilaRol({ rol, pantalla, guardando, onCambiar }: {
  rol: RolPantallas;
  pantalla: string;
  guardando: boolean;
  onCambiar: (visible: boolean) => void;
}) {
  const esOwner = rol.key === 'owner';
  const visible = esOwner || !rol.ocultas.includes(pantalla);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #f9fafb' }}>
      <Box>
        <Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>{rol.label}</Typography>
        {esOwner && (
          <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>Siempre ve todo</Typography>
        )}
      </Box>
      <Switch
        size="small"
        checked={visible}
        disabled={esOwner || guardando}
        onChange={(_, v) => onCambiar(v)}
        slotProps={{ input: { 'aria-label': `${rol.label} ve esta pantalla` } }}
      />
    </Box>
  );
}

// ─── Matriz completa (Equipo → Permisos) ──────────────────────────────────────

export function MatrizPantallas() {
  const { data, isLoading, fijar, guardando } = usePantallasPorRol();

  return (
    <Paper id="pantallas" variant="outlined" sx={{ borderRadius: '12px', borderColor: '#e5e7eb', overflow: 'hidden', scrollMarginTop: 24 }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <EyeOff size={16} style={{ color: '#6b7280' }} />
        <Box>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>
            Pantallas del colegio por rol
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>
            Apaga una pantalla y ese rol deja de verla en el menú y no puede abrirla. Atajo en
            cualquier pantalla del colegio: Alt + Shift + R.
          </Typography>
        </Box>
      </Box>
      {isLoading || !data ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4, color: '#9ca3af' }}>
          <CircularProgress size={18} color="inherit" />
        </Box>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr>
                <Box component="th" sx={{ textAlign: 'left', px: 2, py: 1, color: '#6b7280', fontWeight: 500, whiteSpace: 'nowrap' }}>
                  Pantalla
                </Box>
                {data.roles.map(r => (
                  <Box component="th" key={r.id} sx={{ px: 1, py: 1, color: '#6b7280', fontWeight: 500, whiteSpace: 'nowrap', textAlign: 'center' }}>
                    {r.label}
                  </Box>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.pantallas.map(p => (
                <Box component="tr" key={p.id} sx={{ borderTop: '1px solid #f3f4f6' }}>
                  <Box component="td" sx={{ px: 2, py: 0.75, color: '#111827', whiteSpace: 'nowrap' }}>{p.label}</Box>
                  {data.roles.map(r => {
                    const esOwner = r.key === 'owner';
                    return (
                      <Box component="td" key={r.id} sx={{ textAlign: 'center', py: 0.5 }}>
                        <Switch
                          size="small"
                          checked={esOwner || !r.ocultas.includes(p.id)}
                          disabled={esOwner || guardando === `${r.id}:${p.id}`}
                          onChange={(_, v) => fijar(r, p.id, v)}
                          slotProps={{ input: { 'aria-label': `${r.label} ve ${p.label}` } }}
                        />
                      </Box>
                    );
                  })}
                </Box>
              ))}
            </tbody>
          </Box>
        </Box>
      )}
    </Paper>
  );
}

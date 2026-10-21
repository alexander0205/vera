'use client';

/**
 * Mostrar u ocultar por rol las pantallas de Gobernanza (colegio) y de
 * Facturación. Catálogo en lib/config/pantallas.ts.
 *
 *  - `AtajoPantallaRoles`  → el ÚNICO método: Alt+Shift+R en cualquier módulo
 *    abre «elige una pantalla → qué roles la ven». Solo lo monta quien gestiona
 *    el equipo. La pantalla de Roles y permisos no lo duplica.
 *  - `GuardPantalla`       → si la pantalla en la que se está quedó oculta para
 *    el rol, enseña «no está disponible para ti». Cubre también la llegada por URL.
 *
 * El menú se filtra por lo mismo (server en /escolar, /api/user en
 * Facturación). Tras cada cambio se refresca la ruta para que lo tome al
 * momento.
 */

import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import CircularProgress from '@mui/material/CircularProgress';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/lib/hooks/usePermissions';
import {
  MODULOS_PANTALLAS, PANTALLAS, pantallaDeRuta, veLaPantalla, type PantallaDef,
} from '@/lib/config/pantallas';

interface RolPantallas { id: number; key: string; label: string; ocultas: string[] }
interface Datos { pantallas: PantallaDef[]; roles: RolPantallas[] }

const URL_API = '/api/equipo/pantallas';
const fetcher = (url: string) => fetch(url).then(r => (r.ok ? r.json() : Promise.reject(r)));

/** Lee las pantallas por rol y devuelve con qué cambiarlas. */
function usePantallasPorRol(activo = true) {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<Datos>(activo ? URL_API : null, fetcher);
  const [guardando, setGuardando] = useState<string | null>(null);

  const fijar = useCallback(async (rol: RolPantallas, ids: string[], visible: boolean) => {
    if (!ids.length) return;
    setGuardando(`${rol.id}:${ids.join(',')}`);
    // Optimista: el interruptor responde ya; si el servidor dice que no, se revierte.
    const ocultas = visible
      ? rol.ocultas.filter(p => !ids.includes(p))
      : [...new Set([...rol.ocultas, ...ids])];
    mutate(d => d && { ...d, roles: d.roles.map(r => (r.id === rol.id ? { ...r, ocultas } : r)) }, false);
    try {
      const res = await fetch(URL_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: rol.id, pantalla: ids, visible }),
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

export function GuardPantalla({ ocultas, inicio, children }: { ocultas: string[]; inicio?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const pantalla = ocultas.length ? pantallaDeRuta(pathname, inicio) : null;
  if (!pantalla || !ocultas.includes(pantalla.id)) return <>{children}</>;

  // Adónde puede ir: la primera pantalla del mismo módulo que sí ve.
  const alternativa = PANTALLAS.find(p => p.modulo === pantalla.modulo && !ocultas.includes(p.id));
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
        {alternativa && (
          <Box sx={{ mt: 3 }}>
            <Button asChild variant="outline" size="sm">
              <Link href={alternativa.href}>Ir a {alternativa.label}</Link>
            </Button>
          </Box>
        )}
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

// ─── Comando global ───────────────────────────────────────────────────────────

/** `e.code` y no `e.key`: con Alt, en Mac la R escribe «®» y en otros teclados cambia. */
function esAtajo(e: KeyboardEvent) {
  return e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyR';
}

/**
 * El comando: **Alt+Shift+R** en CUALQUIER pantalla de cualquier módulo. Se elige una pantalla (la del sitio
 * donde estás sale ya elegida) y se ve qué roles la ven. Solo lo monta quien
 * gestiona el equipo (ModuleShell y el layout de Facturación).
 */
export function AtajoPantallaRoles({ inicio }: { inicio?: string } = {}) {
  const pathname = usePathname();
  const { modules } = usePermissions();
  const [abierto, setAbierto] = useState(false);
  const [elegida, setElegida] = useState<string | null>(null);
  const { data, isLoading, fijar, guardando } = usePantallasPorRol(abierto);
  const aqui = pantallaDeRuta(pathname, inicio);
  const idSelect = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!esAtajo(e)) return;
      e.preventDefault();
      setAbierto(a => !a);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Al abrir, la pantalla de este sitio sale elegida; si este sitio no se puede
  // ocultar (Usuarios, Roles…), no sale ninguna: elegir una al azar engaña.
  useEffect(() => {
    if (abierto) setElegida(aqui?.id ?? null);
  }, [abierto, aqui]);

  // Solo las de los módulos de la empresa; mientras cargan, todas.
  const pantallas = (data?.pantallas ?? []).filter(p => modules.length === 0 || (modules as string[]).includes(p.modulo));
  const actual = pantallas.find(p => p.id === elegida);

  return (
    <Dialog open={abierto} onClose={() => setAbierto(false)} fullWidth maxWidth="xs" aria-labelledby="atajo-pantalla-titulo">
      <DialogTitle id="atajo-pantalla-titulo" sx={{ pb: 0.5 }}>
        <Typography component="span" sx={{ display: 'block', fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
          Mostrar u ocultar pantallas por rol
        </Typography>
        <Typography component="span" sx={{ display: 'block', fontSize: '0.8125rem', color: '#6b7280', fontWeight: 400 }}>
          Elige una pantalla y apágala para los roles que no deben verla. Se guarda al instante.
        </Typography>
      </DialogTitle>
      <DialogContent>
        {isLoading || !data ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3, color: '#6b7280' }}>
            <CircularProgress size={18} color="inherit" />
          </Box>
        ) : (
          <>
            <Box component="label" htmlFor={idSelect} sx={{ display: 'block', mt: 1, mb: 0.5, fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
              Pantalla
            </Box>
            <Box
              component="select"
              id={idSelect}
              value={actual?.id ?? ''}
              onChange={e => setElegida(e.target.value || null)}
              sx={{ width: '100%', height: 38, px: 1, borderRadius: '8px', border: '1px solid #d1d5db', bgcolor: '#fff', fontSize: '0.875rem', color: '#111827', '&:focus': { outline: '2px solid #3658e1', outlineOffset: 1 } }}
            >
              <option value="" disabled>Elige una pantalla…</option>
              {MODULOS_PANTALLAS.filter(m => pantallas.some(p => p.modulo === m.id)).map(m => (
                <optgroup key={m.id} label={m.label}>
                  {pantallas.filter(p => p.modulo === m.id).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.grupo ? `${p.grupo} · ` : ''}{p.label}{p.id === aqui?.id ? '  (estás aquí)' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Box>
            <Typography sx={{ mt: 0.5, fontSize: '0.75rem', color: '#6b7280' }}>
              {actual
                ? actual.descripcion
                : aqui
                  ? ''
                  : 'Esta pantalla no se puede ocultar (Usuarios y Roles siempre se ven). Elige otra de la lista.'}
            </Typography>

            {actual && <Box sx={{ mt: 1.5 }}>
              {data.roles.map(rol => {
                const esOwner = rol.key === 'owner';
                return (
                  <Box key={rol.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid #f9fafb' }}>
                    <Box>
                      <Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>{rol.label}</Typography>
                      {esOwner && <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>Siempre ve todo</Typography>}
                    </Box>
                    {esOwner ? (
                      <Lock size={15} style={{ color: '#6b7280' }} aria-label="Siempre la ve" />
                    ) : (
                      <Interruptor
                        visible={veLaPantalla(rol, actual.id)}
                        disabled={guardando === `${rol.id}:${actual.id}`}
                        etiqueta={`${rol.label} ve ${actual.label} (${actual.moduloLabel})`}
                        onChange={v => fijar(rol, [actual.id], v)}
                      />
                    )}
                  </Box>
                );
              })}
            </Box>}
          </>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, pt: 1.5, borderTop: '1px solid #f3f4f6' }}>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>Alt + Shift + R, desde cualquier pantalla</Typography>
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

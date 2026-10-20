'use client';

/**
 * Gobernanza del colegio: qué pantallas ve cada rol.
 *
 *  - `GuardPantalla`       → envuelve el contenido del módulo; si la pantalla
 *    en la que se está quedó apagada para el rol, enseña «no está disponible
 *    para ti» en vez de la pantalla. Cubre también la llegada por URL.
 *  - `AtajoPantallaRoles`  → Alt+Shift+R abre, sobre la pantalla en la que se
 *    está, la lista de roles con un interruptor cada uno. Solo lo monta el
 *    layout para quien gestiona el equipo.
 *  - `PantallasDelRol`     → la tarjeta que vive DENTRO del editor de un rol
 *    (Equipo → Permisos → el rol): con icono y descripción por pantalla, y
 *    «Todas» / «Ninguna». Es donde se espera encontrarlas.
 *  - `MatrizPantallas`     → vista general pantallas × roles para comparar.
 *
 * El menú se filtra en el servidor (ver app/escolar/layout.tsx). Tras cada
 * cambio se refresca la ruta para que menú y bloqueo lo tomen al momento.
 */

import { useCallback, useEffect, useState, type ElementType } from 'react';
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
import ButtonBase from '@mui/material/ButtonBase';
import {
  Lock, LayoutDashboard, ClipboardList, Users, FileText, Contact, Wallet, BellRing,
  Settings, GraduationCap, Info, Eye, EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PANTALLAS_ESCOLAR, pantallaDeRuta, type PantallaDef } from '@/lib/config/pantallas';

export interface RolPantallas {
  id: number;
  key: string;
  label: string;
  ocultas: string[];
  /** ¿El rol entra al módulo del colegio? Sin eso las pantallas no aplican. */
  tieneModulo: boolean;
}
export interface DatosPantallas { pantallas: PantallaDef[]; roles: RolPantallas[] }

const URL_API = '/api/equipo/pantallas';
const fetcher = (url: string) => fetch(url).then(r => (r.ok ? r.json() : Promise.reject(r)));

const ICONOS: Record<string, ElementType> = {
  'escolar-panorama': LayoutDashboard,
  'escolar-matriculas': ClipboardList,
  'escolar-estudiantes': Users,
  'escolar-documentos': FileText,
  'escolar-responsables': Contact,
  'escolar-pagos': Wallet,
  'escolar-avisos': BellRing,
  'escolar-configuracion': Settings,
};

/** Cuántas pantallas ve el rol (el Propietario siempre todas). */
export function pantallasVisibles(rol: RolPantallas, total: number) {
  return rol.key === 'owner' ? total : total - rol.ocultas.length;
}

/** Lee las pantallas por rol y devuelve con qué cambiarlas. */
export function usePantallasPorRol(activo = true) {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<DatosPantallas>(activo ? URL_API : null, fetcher);
  const [guardando, setGuardando] = useState<string | null>(null);

  const fijarVarias = useCallback(async (rol: RolPantallas, ids: string[], visible: boolean) => {
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

  const fijar = useCallback(
    (rol: RolPantallas, pantalla: string, visible: boolean) => fijarVarias(rol, [pantalla], visible),
    [fijarVarias],
  );

  return { data, isLoading, fijar, fijarVarias, guardando };
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
          {pantalla.label} no está disponible para ti
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
          ¿Quién ve esta pantalla?
        </Typography>
        <Typography component="span" sx={{ display: 'block', fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
          {pantalla?.label ?? 'Esta pantalla'}
        </Typography>
        {pantalla && (
          <Typography component="span" sx={{ display: 'block', fontSize: '0.8125rem', color: '#6b7280', fontWeight: 400 }}>
            {pantalla.descripcion}
          </Typography>
        )}
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
          <Box sx={{ display: 'flex', flexDirection: 'column', mt: 1 }}>
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
            href="/dashboard/equipo/permisos"
            onClick={() => setAbierto(false)}
            style={{ fontSize: '0.8125rem', color: '#3658e1', fontWeight: 500 }}
          >
            Configurar por rol →
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
  const sinModulo = !rol.tieneModulo && !esOwner;
  const visible = esOwner || !rol.ocultas.includes(pantalla);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #f9fafb', opacity: sinModulo ? 0.55 : 1 }}>
      <Box>
        <Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>{rol.label}</Typography>
        {(esOwner || sinModulo) && (
          <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            {esOwner ? 'Siempre ve todo' : 'No entra al módulo del colegio'}
          </Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography sx={{ fontSize: '0.75rem', color: visible ? '#059669' : '#9ca3af', fontWeight: 500, width: 44, textAlign: 'right' }}>
          {visible ? 'La ve' : 'Oculta'}
        </Typography>
        <Switch
          size="small"
          checked={visible}
          disabled={esOwner || guardando}
          onChange={(_, v) => onCambiar(v)}
          slotProps={{ input: { 'aria-label': `${rol.label} ve esta pantalla` } }}
        />
      </Box>
    </Box>
  );
}

// ─── Tarjeta dentro del editor de un rol ──────────────────────────────────────

/**
 * Las pantallas de UN rol, con lo que hace cada una. Cambia al instante (no
 * pasa por «Guardar cambios», que es de los permisos), y lo dice.
 *
 * `moduloActivo` es lo que el editor tiene encendido AHORA: si apaga «Acceso
 * al módulo Administración Escolar» sin guardar, el aviso sale al momento.
 */
export function PantallasDelRol({ roleId, moduloActivo }: { roleId: number; moduloActivo: boolean }) {
  const { data, isLoading, fijarVarias, guardando } = usePantallasPorRol();
  const rol = data?.roles.find(r => r.id === roleId);
  if (isLoading || !data || !rol) return null;

  const esOwner = rol.key === 'owner';
  const ids = data.pantallas.map(p => p.id);
  const visibles = pantallasVisibles(rol, ids.length);
  const ocupado = guardando !== null;

  return (
    <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', borderBottom: '1px solid #f3f4f6' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
          <Box sx={{ display: 'flex', height: 32, width: 32, alignItems: 'center', justifyContent: 'center', borderRadius: '8px', bgcolor: '#eef2fe', color: '#2a45c4', flexShrink: 0 }}>
            <GraduationCap size={17} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>
              Pantallas del colegio
            </Typography>
            <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>
              Qué ve este rol dentro de Administración Escolar. Los cambios se guardan al instante.
            </Typography>
          </Box>
        </Box>
        {!esOwner && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280', mr: 0.5 }}>
              Ve <b style={{ color: '#111827' }}>{visibles}</b> de {ids.length}
            </Typography>
            <Button variant="outline" size="sm" disabled={ocupado || visibles === ids.length} onClick={() => fijarVarias(rol, ids, true)}>
              <Eye size={14} className="mr-1" />Todas
            </Button>
            <Button variant="outline" size="sm" disabled={ocupado || visibles === 0} onClick={() => fijarVarias(rol, ids, false)}>
              <EyeOff size={14} className="mr-1" />Ninguna
            </Button>
          </Box>
        )}
      </Box>

      {!moduloActivo && !esOwner && (
        <Box sx={{ display: 'flex', gap: 1, px: 2, py: 1.25, bgcolor: '#fffbeb', borderBottom: '1px solid #fde68a', color: '#92400e', fontSize: '0.8125rem' }}>
          <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Este rol no tiene «Acceso al módulo Administración Escolar» (más abajo, en Acceso a módulos):
            no entra al colegio y estas pantallas no le aplican. Actívalo primero y guarda.
          </span>
        </Box>
      )}

      <Box sx={{ opacity: !moduloActivo && !esOwner ? 0.5 : 1 }}>
        {data.pantallas.map((p, i) => {
          const Icono = ICONOS[p.id] ?? FileText;
          const visible = esOwner || !rol.ocultas.includes(p.id);
          return (
            <Box
              key={p.id}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1,
                borderTop: i === 0 ? 'none' : '1px solid #f9fafb',
              }}
            >
              <Box sx={{ display: 'flex', height: 30, width: 30, alignItems: 'center', justifyContent: 'center', borderRadius: '8px', bgcolor: visible ? '#f3f4f6' : '#fafafa', color: visible ? '#4b5563' : '#d1d5db', flexShrink: 0 }}>
                <Icono size={16} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: visible ? '#111827' : '#9ca3af' }}>{p.label}</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{p.descripcion}</Typography>
              </Box>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: visible ? '#059669' : '#9ca3af', width: 44, textAlign: 'right' }}>
                {visible ? 'La ve' : 'Oculta'}
              </Typography>
              <Switch
                size="small"
                checked={visible}
                disabled={esOwner || guardando === `${rol.id}:${p.id}`}
                onChange={(_, v) => fijarVarias(rol, [p.id], v)}
                slotProps={{ input: { 'aria-label': `${rol.label} ve ${p.label}` } }}
              />
            </Box>
          );
        })}
      </Box>
      {esOwner && (
        <Box sx={{ px: 2, py: 1, borderTop: '1px solid #f3f4f6', fontSize: '0.75rem', color: '#9ca3af' }}>
          El Propietario siempre ve todas las pantallas.
        </Box>
      )}
    </Paper>
  );
}

// ─── Resumen para la lista de roles ───────────────────────────────────────────

/** «6 de 8 pantallas»; `null` si el rol ni entra al colegio. */
export function ResumenPantallas({ rol, total }: { rol: RolPantallas; total: number }) {
  if (!rol.tieneModulo && rol.key !== 'owner') return null;
  const n = pantallasVisibles(rol, total);
  const completo = n === total;
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.6875rem', fontWeight: 500,
        borderRadius: '9999px', px: 1, py: 0.25,
        bgcolor: completo ? '#f3f4f6' : '#fffbeb', color: completo ? '#6b7280' : '#92400e',
      }}
    >
      <GraduationCap size={11} />
      {completo ? 'Todas las pantallas' : `${n} de ${total} pantallas`}
    </Box>
  );
}

// ─── Vista general (Equipo → Permisos) ────────────────────────────────────────

/**
 * Pantallas × roles para comparar de un vistazo. Para cambiar a fondo un rol
 * está su editor; aquí el encabezado de cada rol lleva a él.
 */
export function MatrizPantallas({ onAbrirRol }: { onAbrirRol?: (roleId: number) => void }) {
  const { data, isLoading, fijar, guardando } = usePantallasPorRol();

  return (
    <Paper id="pantallas" variant="outlined" sx={{ borderRadius: '12px', borderColor: '#e5e7eb', overflow: 'hidden', scrollMarginTop: 24 }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{ display: 'flex', height: 32, width: 32, alignItems: 'center', justifyContent: 'center', borderRadius: '8px', bgcolor: '#eef2fe', color: '#2a45c4', flexShrink: 0 }}>
          <GraduationCap size={17} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>
            Pantallas del colegio · vista general
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>
            Encendido = el rol la ve. Apagada, sale de su menú y no puede abrirla. Toca el nombre de un
            rol para configurarlo a fondo, o usa Alt + Shift + R dentro de cualquier pantalla del colegio.
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
                <Box component="th" sx={{ textAlign: 'left', px: 2, py: 1, color: '#6b7280', fontWeight: 500, whiteSpace: 'nowrap', position: 'sticky', left: 0, bgcolor: '#fff' }}>
                  Pantalla
                </Box>
                {data.roles.map(r => {
                  const sinModulo = !r.tieneModulo && r.key !== 'owner';
                  return (
                    <Box component="th" key={r.id} sx={{ px: 1, py: 0.75, textAlign: 'center', fontWeight: 500, opacity: sinModulo ? 0.55 : 1 }}>
                      <ButtonBase
                        disabled={!onAbrirRol || r.key === 'owner'}
                        onClick={() => onAbrirRol?.(r.id)}
                        sx={{ flexDirection: 'column', borderRadius: '6px', px: 1, py: 0.5, color: '#374151', '&:hover': { bgcolor: '#f3f4f6' } }}
                      >
                        <span style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem', fontWeight: 500 }}>{r.label}</span>
                        <span style={{ fontSize: '0.6875rem', color: '#9ca3af', fontWeight: 400 }}>
                          {sinModulo ? 'sin acceso al colegio' : `${pantallasVisibles(r, data.pantallas.length)}/${data.pantallas.length}`}
                        </span>
                      </ButtonBase>
                    </Box>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.pantallas.map(p => {
                const Icono = ICONOS[p.id] ?? FileText;
                return (
                  <Box component="tr" key={p.id} sx={{ borderTop: '1px solid #f3f4f6', '&:hover': { bgcolor: '#fafafa' } }}>
                    <Box component="td" sx={{ px: 2, py: 0.75, whiteSpace: 'nowrap', position: 'sticky', left: 0, bgcolor: 'inherit' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#111827' }}>
                        <Icono size={15} style={{ color: '#9ca3af' }} />
                        {p.label}
                      </Box>
                    </Box>
                    {data.roles.map(r => {
                      const esOwner = r.key === 'owner';
                      const sinModulo = !r.tieneModulo && !esOwner;
                      return (
                        <Box component="td" key={r.id} sx={{ textAlign: 'center', py: 0.5, opacity: sinModulo ? 0.4 : 1 }}>
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
                );
              })}
            </tbody>
          </Box>
        </Box>
      )}
    </Paper>
  );
}
